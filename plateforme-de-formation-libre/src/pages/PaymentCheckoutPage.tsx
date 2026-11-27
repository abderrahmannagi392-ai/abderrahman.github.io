import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  CreditCard,
  FileCheck2,
  FileText,
  Image as ImageIcon,
  Loader2,
  Lock,
  MailWarning,
  Printer,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Tag,
  Upload,
  XCircle,
} from 'lucide-react';
import { PaymentBrandBadges } from '../components/PaymentBrandBadges';
import { useApp } from '../context/AppContext';
import { getT } from '../i18n/translations';
import { submitSubscriptionRequestInFirestore } from '../lib/firestoreService';
import type {
  PaymentMethodConfig,
  ReceiptInspectionResult,
  SubscriptionRequest,
} from '../types';
import { apiRequest, uploadJsonWithProgress } from '../utils/api';
import { localeCode, tr } from '../utils/locale';
import {
  downloadStudentReceiptJpg,
  downloadStudentReceiptPdf,
  printStudentReceipt,
  type PrintableReceiptData,
} from '../utils/receiptDocument';

type ProcessingStage =
  | 'idle'
  | 'uploading'
  | 'reading'
  | 'extracting'
  | 'verifying'
  | 'verified'
  | 'rejected'
  | 'error';

async function prepareReceiptPayload(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.readAsDataURL(file);
  });

  if (!dataUrl.startsWith('data:image/')) {
    throw new Error('Invalid receipt image format');
  }

  // Keep raw screenshot intact up to 4.5MB to preserve metadata and binary integrity
  if (file.size <= 4_500_000 && dataUrl.length <= 6_200_000) {
    return dataUrl;
  }

  return new Promise<string>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const maxDim = 1600;
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        const scale = Math.min(maxDim / width, maxDim / height);
        width = Math.max(1, Math.round(width * scale));
        height = Math.max(1, Math.round(height * scale));
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      const out = canvas.toDataURL('image/jpeg', 0.86);
      resolve(out.length < dataUrl.length ? out : dataUrl);
    };
    img.onerror = () => reject(new Error('Invalid receipt image'));
    img.src = dataUrl;
  });
}

interface CardReceipt {
  provider_tx_id: string;
  order_id?: string;
  card_brand: string;
  card_last4?: string;
  amount_mru: number;
  currency: string;
  starts_at: string;
  expires_at: string;
  plan_name: string;
  verify_sig?: string;
  verify_url?: string;
}

export const PaymentCheckoutPage: React.FC = () => {
  const {
    lang,
    setLang,
    user,
    firebaseUser,
    plans: allPlans,
    paymentMethods: ctxMethods,
    annualSavings,
    viewParams,
    navigate,
    refreshUser,
    resendVerificationEmail,
    reloadVerificationStatus,
    goToAuth,
  } = useApp();
  const t = getT(lang);

  const paidPlans = allPlans.filter((p) => p.price_mru > 0);
  const [selectedPlanId, setSelectedPlanId] = useState<number>(viewParams.planId || 2);
  const [methods, setMethods] = useState<PaymentMethodConfig[]>(ctxMethods);
  // Strict separation: 'card' (NardoPay Hosted Checkout) vs 'sedad' | 'masrvi' | 'bankily' (Local)
  const [selectedMethod, setSelectedMethod] = useState<string>('sedad');
  const isGlobalCard = selectedMethod === 'card';

  const [activeStep, setActiveStep] = useState<1 | 2 | 3>(1);

  // =========================================================================
  // NARDOPAY HOSTED CHECKOUT STATE (Zero raw card/CVV collection on Tedribi)
  // =========================================================================
  const [nardoConfigured, setNardoConfigured] = useState<boolean | null>(null);
  const [nardoWidgetScriptUrl, setNardoWidgetScriptUrl] = useState<string>('');
  const [nardoOrderId, setNardoOrderId] = useState<string>('');
  const [nardoOrderStatus, setNardoOrderStatus] = useState<
    'idle' | 'pending' | 'completed' | 'failed' | 'cancelled' | 'expired'
  >('idle');
  const [nardoCheckoutUrl, setNardoCheckoutUrl] = useState<string>('');
  const [nardoPolling, setNardoPolling] = useState<boolean>(false);
  const [cardReceipt, setCardReceipt] = useState<CardReceipt | null>(null);

  // =========================================================================
  // LOCAL MAURITANIAN PAYMENT STATE (Full Name + Sender Phone + Receipt ONLY)
  // =========================================================================
  const [fullName, setFullName] = useState('');
  const [senderPhone, setSenderPhone] = useState(''); // NEVER prefilled with a real number
  const [proofDataUrl, setProofDataUrl] = useState('');
  const [proofFileName, setProofFileName] = useState('');
  const [uploadId, setUploadId] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [processingStage, setProcessingStage] = useState<ProcessingStage>('idle');
  const [inspection, setInspection] = useState<ReceiptInspectionResult | null>(null);
  const [agreeTerms, setAgreeTerms] = useState(true);
  const [copiedAccount, setCopiedAccount] = useState(false);

  const activePipelineRef = useRef<AbortController | null>(null);
  const pipelineRunIdRef = useRef(0);
  const stageTimersRef = useRef<number[]>([]);

  const clearPipelineTimers = useCallback(() => {
    stageTimersRef.current.forEach((id) => window.clearTimeout(id));
    stageTimersRef.current = [];
  }, []);

  const cancelActivePipeline = useCallback(() => {
    pipelineRunIdRef.current += 1;
    clearPipelineTimers();
    if (activePipelineRef.current) {
      activePipelineRef.current.abort();
      activePipelineRef.current = null;
    }
  }, [clearPipelineTimers]);

  useEffect(() => {
    return () => {
      cancelActivePipeline();
    };
  }, [cancelActivePipeline]);

  const inspecting =
    processingStage === 'uploading' ||
    processingStage === 'reading' ||
    processingStage === 'extracting' ||
    processingStage === 'verifying';

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [verifyNotice, setVerifyNotice] = useState<string | null>(null);

  const [submittedRequest, setSubmittedRequest] = useState<SubscriptionRequest | null>(null);
  const [myRequests, setMyRequests] = useState<SubscriptionRequest[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);

  // Inline Top-Up ("إكمال المبلغ") State for partial_pending / needs_info
  const [completingReq, setCompletingReq] = useState<SubscriptionRequest | null>(null);
  const [completeMethod, setCompleteMethod] = useState<'sedad' | 'masrvi' | 'bankily'>('sedad');
  const [completePhone, setCompletePhone] = useState('');
  const [completeProofUrl, setCompleteProofUrl] = useState('');
  const [completeFileName, setCompleteFileName] = useState('');
  const [completeInspecting, setCompleteInspecting] = useState(false);
  const [completeInspection, setCompleteInspection] = useState<ReceiptInspectionResult | null>(null);
  const [completeError, setCompleteError] = useState<string | null>(null);
  const [completeSubmitting, setCompleteSubmitting] = useState(false);
  const [completeSuccessMsg, setCompleteSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (ctxMethods.length > 0) {
      setMethods(ctxMethods);
    } else {
      apiRequest<{ paymentMethods?: PaymentMethodConfig[] }>('/api/payment-methods')
        .then((res) => {
          if (Array.isArray(res.paymentMethods) && res.paymentMethods.length > 0) {
            setMethods(res.paymentMethods);
          }
        })
        .catch(() => {});
    }
  }, [ctxMethods]);

  const loadMyRequests = useCallback(async () => {
    if (!firebaseUser) return;
    setLoadingRequests(true);
    try {
      const res = await apiRequest<{ requests?: SubscriptionRequest[] }>('/api/payment-requests/mine');
      setMyRequests(Array.isArray(res.requests) ? res.requests : []);
    } catch {
      // ignore
    } finally {
      setLoadingRequests(false);
    }
  }, [firebaseUser]);

  useEffect(() => {
    void loadMyRequests();
  }, [loadMyRequests]);

  useEffect(() => {
    apiRequest<{ configured?: boolean; widgetScriptUrl?: string }>('/api/payments/nardopay/config')
      .then((res) => {
        setNardoConfigured(Boolean(res.configured));
        if (res.widgetScriptUrl) setNardoWidgetScriptUrl(res.widgetScriptUrl);
      })
      .catch(() => {
        setNardoConfigured(false);
      });
  }, []);

  useEffect(() => {
    if (user?.name && !fullName) {
      setFullName(user.name);
    }
  }, [user?.uid, user?.name]);

  useEffect(() => {
    if (viewParams.planId && paidPlans.some((p) => p.id === viewParams.planId)) {
      setSelectedPlanId(viewParams.planId);
    } else if (paidPlans.length > 0 && !paidPlans.some((p) => p.id === selectedPlanId)) {
      setSelectedPlanId(paidPlans[0].id);
    }
  }, [viewParams.planId, paidPlans.length]);

  const activePlan = paidPlans.find((p) => p.id === selectedPlanId) || paidPlans[0];
  const localMethods = methods.filter((m) => ['sedad', 'masrvi', 'bankily'].includes(m.code));
  const fallbackLocalMethods: PaymentMethodConfig[] = [
    {
      code: 'sedad',
      name_ar: 'السداد',
      name_fr: 'Sedad',
      beneficiary_name: 'Abderahmane Mohamed Lemine',
      account_number: '47526504',
      instructions_ar: 'حوّل المبلغ ثم ارفع صورة الإيصال ليتم فحصه تلقائياً.',
      instructions_fr: 'Transférez le montant puis téléversez la capture du reçu.',
      requires_receipt: 1,
      active: 1,
      display_order: 1,
    },
    {
      code: 'masrvi',
      name_ar: 'مصرفي',
      name_fr: 'Masrvi',
      beneficiary_name: 'Abderahmane Mohamed Lemine',
      account_number: '47526504',
      instructions_ar: 'حوّل المبلغ ثم ارفع صورة الإيصال ليتم فحصه تلقائياً.',
      instructions_fr: 'Transférez le montant puis téléversez la capture du reçu.',
      requires_receipt: 1,
      active: 1,
      display_order: 2,
    },
    {
      code: 'bankily',
      name_ar: 'بنكيلي',
      name_fr: 'Bankily',
      beneficiary_name: '',
      account_number: '',
      instructions_ar: 'قم بالتحويل عبر تطبيق بنكيلي بمبلغ الباقة المطلوب، ثم أدخل اسمك ورقم الهاتف الذي حوّلت منه وأرفق صورة الإيصال ليقوم النظام بالتحقق منها تلقائياً.',
      instructions_fr: 'Effectuez le transfert via Bankily pour le montant de la formule, puis saisissez votre nom, votre téléphone émetteur et téléversez le reçu.',
      requires_receipt: 1,
      active: 1,
      display_order: 3,
    },
  ];
  const availableLocalMethods = localMethods.length > 0 ? localMethods : fallbackLocalMethods;
  const activeMethodObj =
    availableLocalMethods.find((m) => m.code === selectedMethod) || availableLocalMethods[0];

  const handleSelectMethod = (code: string) => {
    setSelectedMethod(code);
    setError(null);
    setActiveStep(1);
    setCardReceipt(null);
    setSubmittedRequest(null);
    setCopiedAccount(false);
    if (code !== selectedMethod) {
      cancelActivePipeline();
      setInspection(null);
      setProofDataUrl('');
      setProofFileName('');
      setUploadId('');
      setUploadProgress(0);
      setProcessingStage('idle');
    }
  };

  const handleCopyAccountNumber = async (value: string) => {
    const clean = value.trim();
    if (!clean) return;
    let copied = false;
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(clean);
        copied = true;
      }
    } catch {
      copied = false;
    }
    if (!copied) {
      try {
        const ta = document.createElement('textarea');
        ta.value = clean;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        copied = document.execCommand('copy');
        document.body.removeChild(ta);
      } catch {
        copied = false;
      }
    }
    if (copied) {
      setCopiedAccount(true);
      window.setTimeout(() => setCopiedAccount(false), 2500);
    }
  };

  if (!user || !firebaseUser) {
    return (
      <div className="max-w-[1140px] mx-auto px-4 py-12">
        <div className="max-w-lg mx-auto addressp-box text-center space-y-4">
          <span className="ltitle">{t.paymentTitle}</span>
          <Lock className="w-10 h-10 text-[#384D55] mx-auto" />
          <p className="text-xs text-[#5c686e]">
            {tr(
              lang,
              'الرجاء تسجيل الدخول أولاً لإتمام الدفع وتفعيل الاشتراك.',
              'Veuillez vous connecter pour procéder au paiement.',
              'Please sign in first to complete payment and activate your subscription.'
            )}
          </p>
          <button type="button" onClick={() => goToAuth('login')} className="imgsend2">
            {t.login}
          </button>
        </div>
      </div>
    );
  }

  if (!(firebaseUser.emailVerified || user.email_verified)) {
    return (
      <div className="max-w-[1140px] mx-auto px-4 py-12">
        <div className="max-w-lg mx-auto addressp-box text-center space-y-4">
          <span className="ltitle">{t.paymentTitle}</span>
          <MailWarning className="w-10 h-10 text-[#b8860b] mx-auto" />
          <p className="text-xs text-[#5c686e] leading-relaxed">
            {tr(
              lang,
              `يرجى تأكيد بريدك الإلكتروني (${user.email}) قبل إتمام عملية الدفع.`,
              `Veuillez vérifier votre adresse e-mail (${user.email}) avant de continuer.`,
              `Please verify your email address (${user.email}) before completing checkout.`
            )}
          </p>
          {verifyNotice && (
            <div className="p-2.5 bg-[#f7f9fa] border border-[#d8dfe2] text-xs font-bold text-[#384D55]">
              {verifyNotice}
            </div>
          )}
          <div className="flex justify-center gap-3 flex-wrap">
            <button
              type="button"
              onClick={async () => {
                const res = await reloadVerificationStatus();
                if (!res.verified) {
                  setVerifyNotice(
                    res.error ||
                      tr(lang, 'لم يتم تأكيد البريد بعد.', 'E-mail non encore vérifié.', 'Email not verified yet.')
                  );
                }
              }}
              className="imgsend2 text-xs"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>{tr(lang, 'تحقق من التفعيل', 'Vérifier', 'Check Status')}</span>
            </button>
            <button
              type="button"
              onClick={async () => {
                const r = await resendVerificationEmail();
                setVerifyNotice(
                  r.ok
                    ? tr(lang, 'تم إرسال رابط التفعيل.', 'Lien envoyé.', 'Verification link sent.')
                    : r.error || 'Error'
                );
              }}
              className="imgsend2-secondary text-xs"
            >
              {tr(lang, 'إعادة إرسال الرابط', 'Renvoyer le lien', 'Resend Link')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Sequential receipt inspection stage executor (reading -> extracting -> verifying)
  const runReceiptInspection = async (opts: {
    uploadIdToUse?: string;
    dataUrlToUse?: string;
    planIdToUse: number;
    phoneToUse: string;
    existingRunId?: number;
    existingController?: AbortController;
  }) => {
    const { uploadIdToUse, dataUrlToUse, planIdToUse, phoneToUse, existingRunId, existingController } = opts;
    if ((!uploadIdToUse && !dataUrlToUse) || isGlobalCard) return;

    let runId = existingRunId;
    let controller = existingController;
    if (!runId || !controller) {
      cancelActivePipeline();
      runId = pipelineRunIdRef.current;
      controller = new AbortController();
      activePipelineRef.current = controller;
    }

    clearPipelineTimers();
    setInspection(null);
    setError(null);
    setProcessingStage('reading');

    const t1 = window.setTimeout(() => {
      if (pipelineRunIdRef.current === runId) {
        setProcessingStage((prev) => (prev === 'reading' ? 'extracting' : prev));
      }
    }, 900);
    const t2 = window.setTimeout(() => {
      if (pipelineRunIdRef.current === runId) {
        setProcessingStage((prev) => (prev === 'extracting' || prev === 'reading' ? 'verifying' : prev));
      }
    }, 2200);
    stageTimersRef.current = [t1, t2];

    const planObj = paidPlans.find((p) => p.id === planIdToUse) || activePlan;
    const inspectBody = {
      uploadId: uploadIdToUse || undefined,
      proofDataUrl: uploadIdToUse ? undefined : dataUrlToUse,
      planId: planIdToUse,
      planSlug: planObj?.slug,
      paymentMethod: selectedMethod,
      senderPhone: phoneToUse.trim(),
    };

    try {
      let res: { inspection: ReceiptInspectionResult } | null = null;
      let lastErr: any = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        if (controller.signal.aborted || pipelineRunIdRef.current !== runId) return;
        try {
          res = await apiRequest<{ inspection: ReceiptInspectionResult }>('/api/payment-requests/inspect', {
            method: 'POST',
            json: inspectBody,
            timeoutMs: 26000,
            signal: controller.signal,
          });
          break;
        } catch (err: any) {
          lastErr = err;
          if (controller.signal.aborted || pipelineRunIdRef.current !== runId) return;
          const retryable = err?.status === 0 || err?.status === 408 || err?.status >= 500;
          if (!retryable || attempt === 1) {
            throw err;
          }
        }
      }

      if (!res) throw lastErr || new Error('Inspection failed');
      if (pipelineRunIdRef.current !== runId) return;

      clearPipelineTimers();
      setProcessingStage('verifying');
      const finalVerdict = res.inspection.verdict || res.inspection.status || 'rejected';
      const normalizedInspection: ReceiptInspectionResult = {
        ...res.inspection,
        verdict: finalVerdict,
      };
      setInspection(normalizedInspection);
      if (finalVerdict === 'verified' || finalVerdict === 'underpaid' || finalVerdict === 'manual_review') {
        setProcessingStage('verified');
      } else {
        setProcessingStage('rejected');
        setError(normalizedInspection.reason);
      }
    } catch (err: any) {
      if (controller.signal.aborted || pipelineRunIdRef.current !== runId) return;
      clearPipelineTimers();
      setProcessingStage('error');
      setError(
        err?.message ||
          tr(
            lang,
            'تعذر إتمام الفحص التلقائي للإيصال. يرجى المحاولة بصورة أوضح أو إعادة المحاولة.',
            'Impossible de vérifier le reçu automatiquement. Veuillez réessayer.',
            'Automatic receipt verification failed. Please retry with a clearer screenshot.'
          )
      );
    }
  };

  const handleReceiptUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    cancelActivePipeline();
    setError(null);
    setInspection(null);
    setUploadId('');
    setUploadProgress(0);

    if (!/^image\/(png|jpeg|jpg|webp)$/i.test(file.type)) {
      setProcessingStage('error');
      setError(
        tr(
          lang,
          'يرجى اختيار صورة بصيغة PNG أو JPG أو WebP فقط.',
          'Veuillez sélectionner une image PNG, JPG ou WebP.',
          'Please select a PNG, JPG, or WebP receipt image.'
        )
      );
      return;
    }

    if (file.size < 800 || file.size > 15_000_000) {
      setProcessingStage('rejected');
      setError(
        tr(
          lang,
          'تم رفض الإيصال لأن الملف غير صالح أو حجمه غير مقبول.',
          'Le reçu a été rejeté car la taille du fichier est invalide.',
          'Receipt rejected because the file size is invalid.'
        )
      );
      return;
    }

    const runId = pipelineRunIdRef.current;
    const controller = new AbortController();
    activePipelineRef.current = controller;

    try {
      setProcessingStage('uploading');
      const prepared = await prepareReceiptPayload(file);
      if (controller.signal.aborted || pipelineRunIdRef.current !== runId) return;

      setProofDataUrl(prepared);
      setProofFileName(file.name);

      const uploadRes = await uploadJsonWithProgress<{
        ok: boolean;
        uploadId: string;
        mimeType: string;
        sizeBytes: number;
      }>(
        '/api/payment-requests/upload',
        {
          proofDataUrl: prepared,
          fileName: file.name,
          mimeType: file.type,
        },
        {
          timeoutMs: 25000,
          signal: controller.signal,
          onProgress: (pct) => {
            if (pipelineRunIdRef.current === runId) {
              setUploadProgress(pct);
            }
          },
        }
      );

      if (controller.signal.aborted || pipelineRunIdRef.current !== runId) return;
      if (!uploadRes?.ok || !uploadRes.uploadId) {
        throw new Error(
          tr(
            lang,
            'تعذر تأكيد رفع صورة الإيصال على الخادم.',
            'Échec de confirmation du téléversement.',
            'Could not confirm receipt upload on server.'
          )
        );
      }

      setUploadProgress(100);
      setUploadId(uploadRes.uploadId);

      // Immediately start auto-extraction right after upload succeeds
      await runReceiptInspection({
        uploadIdToUse: uploadRes.uploadId,
        dataUrlToUse: prepared,
        planIdToUse: selectedPlanId,
        phoneToUse: senderPhone,
        existingRunId: runId,
        existingController: controller,
      });
    } catch (err: any) {
      if (controller.signal.aborted || pipelineRunIdRef.current !== runId) return;
      clearPipelineTimers();
      setProcessingStage(err?.status === 400 ? 'rejected' : 'error');
      setError(
        err?.message ||
          tr(
            lang,
            'تم رفض الإيصال لأن الملف غير صالح أو لا يمكن قراءته.',
            'Impossible de lire l’image du reçu.',
            'Could not read or upload receipt image.'
          )
      );
    }
  };

  // =========================================================================
  // NARDOPAY HOSTED CHECKOUT & SERVER-CONFIRMED POLLING
  // =========================================================================
  const checkNardoOrderStatus = useCallback(
    async (orderIdToCheck: string) => {
      if (!orderIdToCheck || !firebaseUser) return;
      setNardoPolling(true);
      try {
        const res = await apiRequest<{
          order: {
            orderId: string;
            amount: number;
            currency: string;
            status: 'pending' | 'completed' | 'failed' | 'cancelled' | 'expired';
            providerTxId?: string | null;
            failureReason?: string | null;
            verifiedAt?: string | null;
            verify_sig?: string;
            verify_url?: string;
          };
          activeSubscription?: {
            starts_at?: string;
            expires_at?: string;
            plan_name?: string;
          } | null;
        }>(`/api/payments/nardopay/status/${encodeURIComponent(orderIdToCheck)}`);
        const ord = res.order;
        setNardoOrderStatus(ord.status);
        if (ord.status === 'completed') {
          await refreshUser();
          setCardReceipt({
            provider_tx_id: ord.providerTxId || ord.orderId,
            order_id: ord.orderId,
            card_brand: 'NardoPay',
            amount_mru: ord.amount,
            currency: ord.currency || 'MRU',
            starts_at: ord.verifiedAt || res.activeSubscription?.starts_at || new Date().toISOString(),
            expires_at:
              res.activeSubscription?.expires_at ||
              new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            plan_name:
              res.activeSubscription?.plan_name ||
              (activePlan ? (lang === 'ar' ? activePlan.name_ar : activePlan.name_fr) : 'Premium'),
            verify_sig: ord.verify_sig,
            verify_url: ord.verify_url,
          });
          setActiveStep(3);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        } else if (ord.status === 'failed' || ord.status === 'cancelled' || ord.status === 'expired') {
          setError(
            ord.failureReason ||
              tr(
                lang,
                'لم تكتمل عملية الدفع الإلكتروني. يمكنك إعادة المحاولة أو استخدام الدفع المحلي.',
                'Le paiement en ligne n’a pas abouti.',
                'Online payment was not completed.'
              )
          );
        }
      } catch {
        // non-fatal status check error
      } finally {
        setNardoPolling(false);
      }
    },
    [firebaseUser, refreshUser, activePlan, lang]
  );

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlOrderId = params.get('orderId');
    if (urlOrderId && firebaseUser) {
      setSelectedMethod('card');
      setNardoOrderId(urlOrderId);
      setNardoOrderStatus('pending');
      void checkNardoOrderStatus(urlOrderId);
    }
  }, [firebaseUser]);

  useEffect(() => {
    if (!nardoOrderId || nardoOrderStatus !== 'pending') return;
    const timer = window.setInterval(() => {
      void checkNardoOrderStatus(nardoOrderId);
    }, 4000);
    return () => window.clearInterval(timer);
  }, [nardoOrderId, nardoOrderStatus, checkNardoOrderStatus]);

  const handleNardoPayCheckout = async () => {
    if (!activePlan) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await apiRequest<{
        ok: boolean;
        order: {
          orderId: string;
          amount: number;
          currency: string;
          status: string;
          checkoutUrl: string;
          providerSessionId?: string;
          widgetToken?: string;
          widgetScriptUrl?: string;
          merchantId?: string;
        };
      }>('/api/payments/nardopay/create', {
        method: 'POST',
        json: {
          planId: activePlan.id,
          planSlug: activePlan.slug,
          preferredMethod: 'card',
        },
      });

      const ord = res.order;
      setNardoOrderId(ord.orderId);
      setNardoOrderStatus('pending');
      setNardoCheckoutUrl(ord.checkoutUrl || '');

      const win = window as any;
      if (ord.widgetToken && (ord.widgetScriptUrl || nardoWidgetScriptUrl)) {
        const scriptSrc = ord.widgetScriptUrl || nardoWidgetScriptUrl;
        if (!document.querySelector(`script[src="${scriptSrc}"]`)) {
          const s = document.createElement('script');
          s.src = scriptSrc;
          s.async = true;
          document.body.appendChild(s);
          await new Promise((r) => setTimeout(r, 600));
        }
        if (typeof win.NardoPay?.open === 'function') {
          win.NardoPay.open({
            token: ord.widgetToken,
            sessionId: ord.providerSessionId,
            orderId: ord.orderId,
            merchantId: ord.merchantId,
            onSuccess: () => void checkNardoOrderStatus(ord.orderId),
            onClose: () => void checkNardoOrderStatus(ord.orderId),
          });
          return;
        }
      }

      if (ord.checkoutUrl) {
        window.location.assign(ord.checkoutUrl);
      }
    } catch (err: any) {
      setError(
        err?.message ||
          tr(
            lang,
            'تعذر إنشاء جلسة الدفع عبر NardoPay. يرجى استخدام التحويل المحلي وإرفاق الإيصال.',
            'Impossible de démarrer la session NardoPay.',
            'Could not initiate NardoPay checkout session.'
          )
      );
    } finally {
      setSubmitting(false);
    }
  };

  // =========================================================================
  // LOCAL MAURITANIAN PAYMENT STEP VALIDATION & SUBMISSION
  // =========================================================================
  const validateLocalStep1AndAdvance = () => {
    setError(null);
    if (fullName.trim().length < 2) {
      setError(
        tr(lang, 'يرجى إدخال الاسم الكامل.', 'Veuillez saisir votre nom complet.', 'Please enter your full name.')
      );
      return;
    }
    if (senderPhone.replace(/\D/g, '').length < 8) {
      setError(
        tr(
          lang,
          'يرجى إدخال رقم الهاتف الذي حوّل منه المال (8 أرقام على الأقل).',
          'Veuillez saisir le numéro de téléphone émetteur (8 chiffres minimum).',
          'Please enter the sender phone number (at least 8 digits).'
        )
      );
      return;
    }
    if (!proofDataUrl) {
      setError(
        tr(
          lang,
          'يرجى رفع صورة واضحة لإيصال الدفع ليتم فحصه تلقائياً.',
          'Veuillez téléverser la capture du reçu pour vérification.',
          'Please upload the payment receipt screenshot for inspection.'
        )
      );
      return;
    }
    if (inspecting) {
      setError(tr(lang, 'يرجى الانتظار حتى انتهاء فحص الإيصال...', 'Vérification en cours...', 'Please wait for receipt verification...'));
      return;
    }
    if (
      !inspection ||
      (inspection.verdict !== 'verified' &&
        inspection.verdict !== 'underpaid' &&
        inspection.verdict !== 'manual_review')
    ) {
      setError(
        inspection?.reason ||
          tr(
            lang,
            'تم رفض الإيصال ولا يمكن المتابعة قبل رفع إيصال صحيح.',
            'Le reçu a été refusé. Veuillez joindre un reçu valide.',
            'Receipt was rejected. Please upload a valid receipt.'
          )
      );
      return;
    }
    setActiveStep(2);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmitLocalRequest = async () => {
    if (
      !activePlan ||
      !user ||
      !inspection ||
      (inspection.verdict !== 'verified' &&
        inspection.verdict !== 'underpaid' &&
        inspection.verdict !== 'manual_review')
    )
      return;
    setError(null);
    if (!agreeTerms) {
      setError(
        tr(
          lang,
          'يرجى تأكيد صحة البيانات والموافقة على المراجعة اليدوية قبل الإرسال.',
          'Veuillez confirmer l’exactitude des informations avant de soumettre.',
          'Please confirm accuracy before submitting.'
        )
      );
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiRequest<{ ok: boolean; request: SubscriptionRequest }>('/api/payment-requests', {
        method: 'POST',
        json: {
          planId: activePlan.id,
          planSlug: activePlan.slug,
          paymentMethod: selectedMethod,
          fullName: fullName.trim(),
          senderPhone: senderPhone.trim(),
          inspectionId: inspection.inspectionId,
        },
      });

      const createdReq = res.request;
      await submitSubscriptionRequestInFirestore({
        uid: user.uid,
        userEmail: user.email,
        userName: fullName.trim() || user.name,
        subscriptionRequestId: createdReq.subscription_request_id,
        planId: String(activePlan.id),
        planSlug: activePlan.slug,
        planName: createdReq.plan_name,
        amount: createdReq.amount,
        currency: createdReq.currency || 'MRU',
        paymentMethod: createdReq.payment_method,
        transactionId: createdReq.transaction_id,
        transactionReference: createdReq.transaction_reference,
        transactionAt: createdReq.transaction_at,
        beneficiaryName: createdReq.beneficiary_name,
        proofHash: createdReq.proof_hash || '',
        proofDataUrl,
        uploadedAt: createdReq.uploaded_at,
        status: createdReq.status === 'partial_pending' ? 'partial_pending' : 'pending_review',
        paidAmount: createdReq.paid_amount ?? createdReq.extracted_amount ?? createdReq.amount,
        remainingAmount: createdReq.remaining_amount ?? 0,
      }).catch(() => {});

      setSubmittedRequest(createdReq);
      setActiveStep(3);
      void Promise.all([loadMyRequests(), refreshUser()]);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: any) {
      setError(
        err?.message ||
          tr(
            lang,
            'تعذّر إرسال طلب الاشتراك. تحقق من بيانات الإيصال.',
            'Échec de l’envoi de la demande.',
            'Failed to submit subscription request.'
          )
      );
    } finally {
      setSubmitting(false);
    }
  };

  const openCompleteTopUpDrawer = (req: SubscriptionRequest) => {
    setCompletingReq(req);
    const preferred = ['sedad', 'masrvi', 'bankily'].includes(req.payment_method)
      ? (req.payment_method as 'sedad' | 'masrvi' | 'bankily')
      : 'sedad';
    setCompleteMethod(preferred);
    setCompletePhone(req.sender_phone || senderPhone || '');
    setCompleteProofUrl('');
    setCompleteFileName('');
    setCompleteInspection(null);
    setCompleteError(null);
    setCompleteSuccessMsg(null);
  };

  const handleCompleteReceiptUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !completingReq) return;

    setCompleteError(null);
    setCompleteInspection(null);
    if (!/^image\/(png|jpeg|jpg|webp)$/i.test(file.type)) {
      setCompleteError(tr(lang, 'يرجى اختيار صورة PNG أو JPG أو WebP.', 'Format PNG, JPG ou WebP requis.', 'PNG, JPG or WebP required.'));
      return;
    }

    setCompleteInspecting(true);
    try {
      const prepared = await prepareReceiptPayload(file);
      setCompleteProofUrl(prepared);
      setCompleteFileName(file.name);
      const upRes = await uploadJsonWithProgress<{ ok: boolean; uploadId: string }>(
        '/api/payment-requests/upload',
        { proofDataUrl: prepared, fileName: file.name, mimeType: file.type },
        { timeoutMs: 25000 }
      );
      const expectedRem = Math.max(1, Number(completingReq.remaining_amount ?? completingReq.amount));
      const inspRes = await apiRequest<{ inspection: ReceiptInspectionResult }>('/api/payment-requests/inspect', {
        method: 'POST',
        json: {
          uploadId: upRes.uploadId,
          planId: completingReq.plan_id,
          planSlug: completingReq.plan_slug,
          paymentMethod: completeMethod,
          senderPhone: completePhone.trim(),
          expectedAmountOverride: expectedRem,
        },
        timeoutMs: 26000,
      });
      setCompleteInspection(inspRes.inspection);
      if (inspRes.inspection.verdict === 'rejected') {
        setCompleteError(inspRes.inspection.reason);
      }
    } catch (err: any) {
      setCompleteError(err?.message || tr(lang, 'تعذر فحص الإيصال التكميلي.', 'Échec de vérification du reçu.', 'Failed to inspect top-up receipt.'));
    } finally {
      setCompleteInspecting(false);
    }
  };

  const handleSubmitCompleteTopUp = async () => {
    if (!completingReq || !completeInspection || completeInspection.verdict === 'rejected') return;
    setCompleteError(null);
    if (completePhone.replace(/\D/g, '').length < 8) {
      setCompleteError(tr(lang, 'يرجى إدخال رقم الهاتف المرسل (8 أرقام على الأقل).', 'Numéro émetteur requis (8 chiffres).', 'Sender phone (min 8 digits) required.'));
      return;
    }
    setCompleteSubmitting(true);
    try {
      const res = await apiRequest<{ ok: boolean; request: SubscriptionRequest }>(
        `/api/payment-requests/${completingReq.id}/complete`,
        {
          method: 'POST',
          json: {
            paymentMethod: completeMethod,
            senderPhone: completePhone.trim(),
            inspectionId: completeInspection.inspectionId,
          },
        }
      );
      setCompleteSuccessMsg(
        tr(
          lang,
          `تم تسجيل الدفعة التكميلية للطلب ${res.request.subscription_request_id} بنجاح.`,
          `Complément enregistré pour ${res.request.subscription_request_id}.`,
          `Top-up recorded for ${res.request.subscription_request_id}.`
        )
      );
      setCompletingReq(null);
      await loadMyRequests();
    } catch (err: any) {
      setCompleteError(err?.message || tr(lang, 'تعذر إكمال المبلغ.', 'Échec du complément.', 'Top-up submission failed.'));
    } finally {
      setCompleteSubmitting(false);
    }
  };

  const renderStatusBadge = (status: SubscriptionRequest['status']) => {
    if (status === 'approved') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[3px] bg-[#e2efbf] text-[#456810] text-[11px] font-bold">
          <CheckCircle2 className="w-3 h-3" />
          {tr(lang, 'معتمد ومفعّل', 'Approuvé', 'Approved & Active')}
        </span>
      );
    }
    if (status === 'partial_pending') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[3px] bg-amber-100 text-amber-900 text-[11px] font-bold">
          <AlertCircle className="w-3 h-3" />
          {tr(lang, 'دفعة جزئية — بحاجة لإكمال المبلغ', 'Paiement partiel — à compléter', 'Partial Paid — Top-Up Needed')}
        </span>
      );
    }
    if (status === 'needs_info') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[3px] bg-sky-100 text-sky-900 text-[11px] font-bold">
          <AlertCircle className="w-3 h-3" />
          {tr(lang, 'مطلوب توضيح أو إيصال إضافي', 'Complément requis', 'Additional Info Requested')}
        </span>
      );
    }
    if (status === 'rejected') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[3px] bg-red-100 text-red-700 text-[11px] font-bold">
          <XCircle className="w-3 h-3" />
          {tr(lang, 'مرفوض', 'Refusé', 'Rejected')}
        </span>
      );
    }
    if (status === 'expired') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[3px] bg-slate-200 text-slate-700 text-[11px] font-bold">
          <Clock className="w-3 h-3" />
          {tr(lang, 'منتهي الصلاحية', 'Expiré', 'Expired')}
        </span>
      );
    }
    if (status === 'manual_review') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[3px] bg-blue-100 text-blue-900 text-[11px] font-bold">
          <Clock className="w-3 h-3" />
          {tr(lang, 'يتطلب مراجعة إدارية يدوية', 'Révision manuelle requise', 'Manual Review')}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[3px] bg-amber-100 text-amber-800 text-[11px] font-bold">
        <Clock className="w-3 h-3" />
        {tr(lang, 'قيد مراجعة الإدارة', 'En attente de validation', 'Pending Admin Review')}
      </span>
    );
  };

  return (
    <div className="bg-white pb-10">
      {/* Top Bar: Logo + 3-Step Circular Stepper */}
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 pt-4 pb-2 flex flex-wrap items-center justify-between gap-4 border-b border-[#efefef]">
        <button
          type="button"
          onClick={() => navigate('home')}
          className="flex items-center gap-2.5 text-start cursor-pointer"
        >
          <img
            src="/assets/images/platform-logo.webp"
            alt={t.brandName}
            referrerPolicy="no-referrer"
            className="h-11 w-auto object-contain"
          />
        </button>

        <div className="flex items-center justify-center mx-auto py-1">
          <button
            type="button"
            onClick={() => {
              if (!submittedRequest && !cardReceipt) setActiveStep(1);
            }}
            className={`w-[72px] h-[72px] rounded-full flex items-center justify-center text-center text-[12px] font-bold leading-tight px-1.5 transition-colors cursor-pointer ${
              activeStep === 1 ? 'bg-[#A6CE39] text-[#384D55]' : 'bg-[#efefef] text-[#384D55]'
            }`}
          >
            <span>{tr(lang, 'بيانات الدفع', 'Paiement', 'Payment')}</span>
          </button>

          <div className="w-12 sm:w-20 border-b-4 border-dotted border-[#d8dfe2] mx-1" />

          {!isGlobalCard && (
            <>
              <button
                type="button"
                onClick={() => {
                  if (!submittedRequest) {
                    if (activeStep >= 2) setActiveStep(2);
                    else validateLocalStep1AndAdvance();
                  }
                }}
                className={`w-[72px] h-[72px] rounded-full flex items-center justify-center text-center text-[12px] font-bold leading-tight px-1.5 transition-colors cursor-pointer ${
                  activeStep === 2 ? 'bg-[#A6CE39] text-[#384D55]' : 'bg-[#efefef] text-[#384D55]'
                }`}
              >
                <span>{tr(lang, 'مراجعة وإرسال', 'Vérifier', 'Review')}</span>
              </button>
              <div className="w-12 sm:w-20 border-b-4 border-dotted border-[#d8dfe2] mx-1" />
            </>
          )}

          <div
            className={`w-[72px] h-[72px] rounded-full flex items-center justify-center text-center text-[12px] font-bold leading-tight px-1.5 ${
              activeStep === 3 ? 'bg-[#A6CE39] text-[#384D55]' : 'bg-[#efefef] text-[#384D55]'
            }`}
          >
            <span>
              {isGlobalCard
                ? tr(lang, 'تم التفعيل', 'Activé', 'Activated')
                : tr(lang, 'قيد المراجعة', 'Soumis', 'Submitted')}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => navigate('subscriptions')}
          className="text-xs font-bold text-[#6b787e] hover:text-[#384D55] underline cursor-pointer"
        >
          {t.navSubscriptions}
        </button>
      </div>

      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 pt-3 space-y-6">
        <div className="changelang">
          <div className="flex items-center gap-2 flex-wrap">
            <span>{tr(lang, 'لغة الدفع:', 'Langue :', 'Checkout language:')}</span>
            {(['ar', 'fr', 'en'] as const).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setLang(l)}
                className={`px-2 py-0.5 rounded text-xs font-bold cursor-pointer ${
                  lang === l ? 'bg-[#384D55] text-white' : 'bg-[#efefef] text-[#384D55]'
                }`}
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>
          <span className="text-xs text-[#5c686e]">{user.email}</span>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-300 text-red-800 px-4 py-3 rounded-[4px] text-xs font-bold flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* ================================================================= */}
        {/* STEP 1: STRICTLY SEPARATED GLOBAL CARD vs LOCAL MAURITANIAN FLOWS */}
        {/* ================================================================= */}
        {activeStep === 1 && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* Column 1: System #1 Global Visa/MasterCard OR System #2 Local Transfer */}
            <div className="lg:col-span-7 space-y-4">
              {isGlobalCard ? (
                /* --------------------------------------------------------- */
                /* SYSTEM 1: NARDOPAY SECURE HOSTED CHECKOUT / WIDGET        */
                /* --------------------------------------------------------- */
                <div className="addressp-box space-y-4">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <span className="ltitle">
                        {tr(
                          lang,
                          'الدفع العالمي عبر بوابة NardoPay الآمنة (Visa / MasterCard)',
                          'Paiement mondial sécurisé via NardoPay (Visa / MasterCard)',
                          'Global Secure Payment via NardoPay (Visa / MasterCard)'
                        )}
                      </span>
                      <span className="ldisplay">
                        {tr(
                          lang,
                          'يتم توجيهك إلى صفحة NardoPay الرسمية المشفرة لإتمام الدفع بالبطاقة دون إدخال أي رقم بطاقة أو CVV داخل منصة تدريبي.',
                          'Vous serez redirigé vers la page sécurisée NardoPay sans saisir de carte ou CVV sur Tedribi.',
                          'You will complete card payment on the official hosted NardoPay gateway without entering card numbers or CVV on Tedribi.'
                        )}
                      </span>
                    </div>
                    <PaymentBrandBadges size="sm" showMauritanianMethods={false} />
                  </div>

                  {nardoConfigured === false && (
                    <div className="p-3 rounded bg-amber-50 border border-amber-300 text-amber-900 text-xs font-bold leading-relaxed">
                      {tr(
                        lang,
                        'بوابة NardoPay غير مفعلة بمفاتيح الإنتاج على الخادم حالياً. يمكنك استخدام وسائل الدفع المحلية (السداد / مصرفي / بنكيلي) وإرفاق الإيصال.',
                        'La passerelle NardoPay n’est pas encore configurée sur le serveur. Utilisez les méthodes locales (Sedad / Masrvi / Bankily).',
                        'NardoPay API credentials are not configured on the server yet. Please use local payment methods (Sedad / Masrvi / Bankily).'
                      )}
                    </div>
                  )}

                  {nardoOrderId && nardoOrderStatus === 'pending' && (
                    <div className="p-3.5 rounded bg-[#f4faea] border border-[#83a329] text-xs space-y-2">
                      <div className="font-bold text-[#384D55] flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin text-[#557a16]" />
                        <span>
                          {tr(
                            lang,
                            `بانتظار تأكيد الدفع من الخادم للطلب ${nardoOrderId}...`,
                            `En attente de confirmation serveur pour ${nardoOrderId}...`,
                            `Waiting for backend confirmation for order ${nardoOrderId}...`
                          )}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {nardoCheckoutUrl && (
                          <a
                            href={nardoCheckoutUrl}
                            className="imgsend2 text-xs"
                          >
                            {tr(lang, 'الانتقال إلى صفحة دفع NardoPay', 'Ouvrir NardoPay', 'Open NardoPay Checkout')}
                          </a>
                        )}
                        <button
                          type="button"
                          disabled={nardoPolling}
                          onClick={() => void checkNardoOrderStatus(nardoOrderId)}
                          className="imgsend2-secondary text-xs"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${nardoPolling ? 'animate-spin' : ''}`} />
                          <span>{tr(lang, 'تحقق من الحالة الآن', 'Vérifier le statut', 'Check Status Now')}</span>
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="bg-white border border-[#d8dfe2] rounded-[4px] p-4 text-xs space-y-2">
                    <div className="flex justify-between">
                      <span className="text-[#5c686e]">{tr(lang, 'الباقة المختارة:', 'Formule :', 'Selected Plan:')}</span>
                      <strong className="text-[#384D55]">
                        {activePlan ? (lang === 'ar' ? activePlan.name_ar : activePlan.name_fr) : '—'}
                      </strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#5c686e]">{tr(lang, 'المبلغ المطلوب:', 'Montant :', 'Amount:')}</span>
                      <strong className="text-[#557a16] tabular-nums">
                        {activePlan ? `${activePlan.price_mru.toLocaleString()} MRU` : '—'}
                      </strong>
                    </div>
                  </div>

                  <div className="pt-2 flex flex-wrap items-center justify-between gap-3 border-t border-[#efefef]">
                    <div className="text-xs text-[#5c686e] flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-[#557a16]" />
                      <span>
                        {tr(
                          lang,
                          'يتم تفعيل الباقة فور وصول إشعار الدفع المؤكد (Webhook) إلى الخادم.',
                          'Activation dès réception de la confirmation webhook vérifiée.',
                          'Subscription activates immediately after verified server webhook confirmation.'
                        )}
                      </span>
                    </div>
                    <button
                      type="button"
                      disabled={submitting || !activePlan || nardoConfigured === false}
                      onClick={() => void handleNardoPayCheckout()}
                      className="imgsend2 disabled:opacity-50"
                    >
                      <CreditCard className="w-4 h-4" />
                      <span>
                        {submitting
                          ? t.loading
                          : `${tr(lang, 'الدفع الإلكتروني الآمن عبر NardoPay', 'Payer via NardoPay', 'Pay Securely via NardoPay')} (${activePlan ? activePlan.price_mru.toLocaleString() : 0} MRU)`}
                      </span>
                    </button>
                  </div>
                </div>
              ) : (
                /* --------------------------------------------------------- */
                /* SYSTEM 2: LOCAL MAURITANIAN PAYMENT + AUTOMATIC INSPECTION*/
                /* Only collects Full Name, Sender Phone & Receipt Image     */
                /* --------------------------------------------------------- */
                <div className="addressp-box space-y-4">
                  <span className="ltitle">
                    {tr(
                      lang,
                      `الدفع المحلي عبر ${activeMethodObj.name_ar}`,
                      `Paiement local via ${activeMethodObj.name_fr}`,
                      `Local Payment via ${activeMethodObj.name_fr}`
                    )}
                  </span>
                  <span className="ldisplay">
                    {tr(
                      lang,
                      'أدخل الاسم الكامل ورقم الهاتف المحوَّل منه ثم ارفع صورة الإيصال ليقوم النظام باستخراج البيانات وفحصها تلقائياً.',
                      'Saisissez votre nom complet et le numéro émetteur, puis téléversez la capture du reçu pour extraction et vérification automatiques.',
                      'Enter your full name and sender phone number, then upload the receipt screenshot for automatic extraction & verification.'
                    )}
                  </span>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-[13.5px]">
                    <div>
                      <label className="block font-medium mb-1">
                        <span>{tr(lang, 'الاسم الكامل', 'Nom complet', 'Full Name')}</span>
                        <span className="required">*</span>
                      </label>
                      <input
                        type="text"
                        dir={lang === 'ar' ? 'rtl' : 'ltr'}
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder={tr(lang, 'الاسم واللقب', 'Nom et prénom', 'Full Name')}
                        className="template-input"
                      />
                    </div>

                    <div>
                      <label className="block font-medium mb-1">
                        <span>
                          {tr(
                            lang,
                            'رقم الهاتف الذي حوّل منه المال',
                            'Numéro de téléphone émetteur',
                            'Sender Phone Number'
                          )}
                        </span>
                        <span className="required">*</span>
                      </label>
                      <input
                        type="tel"
                        dir="ltr"
                        value={senderPhone}
                        onChange={(e) => setSenderPhone(e.target.value.replace(/[^0-9+\s]/g, ''))}
                        placeholder={tr(lang, 'مثال: 22XXXXXX', 'Ex: 22XXXXXX', 'e.g. 22XXXXXX')}
                        className="template-input"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block font-medium mb-1.5">
                        <span>
                          {tr(
                            lang,
                            'صورة إيصال التحويل (لقطة شاشة واضحة)',
                            'Capture d’écran du reçu de transfert',
                            'Transfer Receipt Screenshot'
                          )}
                        </span>
                        <span className="required">*</span>
                      </label>
                      <label className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3.5 rounded-[4px] border-2 border-dashed border-[#c9d0d3] bg-white hover:border-[#83a329] cursor-pointer transition-colors">
                        <span className="flex items-center gap-2 text-xs font-bold text-[#384D55]">
                          <Upload className="w-4 h-4 text-[#557a16]" />
                          <span>
                            {proofFileName
                              ? proofFileName
                              : tr(
                                  lang,
                                  'اضغط هنا لرفع صورة الإيصال (PNG / JPG / WebP)',
                                  'Cliquez pour téléverser le reçu (PNG / JPG / WebP)',
                                  'Click to upload receipt (PNG / JPG / WebP)'
                                )}
                          </span>
                        </span>
                        <span className="px-3 py-1 rounded-[3px] bg-[#efefef] text-[#384D55] text-[11px] font-bold">
                          {proofDataUrl
                            ? tr(lang, 'تغيير الصورة', 'Changer', 'Change')
                            : tr(lang, 'اختيار ملف', 'Choisir', 'Choose File')}
                        </span>
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          onChange={(e) => void handleReceiptUpload(e)}
                          className="sr-only"
                        />
                      </label>

                      {proofDataUrl && (
                        <div className="mt-3 p-3 bg-white border border-[#d8dfe2] rounded-[4px] flex flex-col sm:flex-row items-start sm:items-center gap-3">
                          <img
                            src={proofDataUrl}
                            alt="Receipt preview"
                            className="w-20 h-20 object-cover rounded-[3px] border border-[#d8dfe2] shrink-0"
                          />
                          <div className="flex-1 text-xs space-y-2 w-full">
                            {inspecting && (
                              <div className="space-y-1.5">
                                <div className="flex items-center justify-between gap-2 font-bold text-[#384D55]">
                                  <span className="flex items-center gap-2">
                                    <Loader2 className="w-4 h-4 animate-spin text-[#557a16]" />
                                    <span>
                                      {processingStage === 'uploading' &&
                                        tr(
                                          lang,
                                          `جارٍ رفع الإيصال... ${uploadProgress}%`,
                                          `Téléversement du reçu... ${uploadProgress}%`,
                                          `Uploading receipt... ${uploadProgress}%`
                                        )}
                                      {processingStage === 'reading' &&
                                        tr(
                                          lang,
                                          'جارٍ قراءة الإيصال...',
                                          'Lecture du reçu...',
                                          'Reading receipt...'
                                        )}
                                      {processingStage === 'extracting' &&
                                        tr(
                                          lang,
                                          'جارٍ استخراج بيانات العملية...',
                                          'Extraction des données de l’opération...',
                                          'Extracting transaction details...'
                                        )}
                                      {processingStage === 'verifying' &&
                                        tr(
                                          lang,
                                          'جارٍ التحقق من البيانات...',
                                          'Vérification des données...',
                                          'Verifying receipt details...'
                                        )}
                                    </span>
                                  </span>
                                  {processingStage === 'uploading' && (
                                    <span className="tabular-nums text-[11px] text-[#557a16]">
                                      {uploadProgress}%
                                    </span>
                                  )}
                                </div>
                                <div className="w-full h-1.5 rounded-full bg-[#e6ecef] overflow-hidden">
                                  <div
                                    className="h-full bg-[#83a329] transition-all duration-300"
                                    style={{
                                      width: `${
                                        processingStage === 'uploading'
                                          ? Math.max(8, uploadProgress)
                                          : processingStage === 'reading'
                                            ? 45
                                            : processingStage === 'extracting'
                                              ? 72
                                              : 92
                                      }%`,
                                    }}
                                  />
                                </div>
                              </div>
                            )}

                            {!inspecting &&
                              (inspection?.verdict === 'verified' ||
                                inspection?.verdict === 'underpaid' ||
                                inspection?.verdict === 'manual_review') && (
                              <div className="space-y-2">
                                {inspection.verdict === 'verified' ? (
                                  <div className="font-extrabold text-[#456810] flex items-center gap-1.5">
                                    <CheckCircle2 className="w-4 h-4 text-[#557a16]" />
                                    <span>
                                      {tr(lang, 'تم التحقق', 'Reçu vérifié avec succès', 'Receipt Verified')}
                                    </span>
                                  </div>
                                ) : inspection.verdict === 'manual_review' ? (
                                  <div className="p-2.5 rounded bg-blue-50 border border-blue-300 text-blue-900 space-y-1">
                                    <div className="font-extrabold flex items-center gap-1.5">
                                      <Clock className="w-4 h-4 text-blue-700 shrink-0" />
                                      <span>
                                        {tr(
                                          lang,
                                          'الإيصال سليم مبدئياً — يتطلب مراجعة إدارية يدوية لتأكيد المرجع',
                                          'Reçu acceptable — révision manuelle requise',
                                          'Receipt Accepted for Manual Admin Review'
                                        )}
                                      </span>
                                    </div>
                                    <p className="text-[11px]">
                                      {inspection.reason ||
                                        tr(
                                          lang,
                                          'يمكنك إرسال هذا الإيصال الآن وستقوم الإدارة بمراجعته واعتماده.',
                                          'Vous pouvez soumettre ce reçu pour validation manuelle.',
                                          'You can submit this receipt for manual admin review.'
                                        )}
                                    </p>
                                  </div>
                                ) : (
                                  <div className="p-2.5 rounded bg-amber-50 border border-amber-300 text-amber-900 space-y-1">
                                    <div className="font-extrabold flex items-center gap-1.5">
                                      <AlertCircle className="w-4 h-4 text-amber-700 shrink-0" />
                                      <span>{inspection.reason || 'المبلغ المدفوع غير كافٍ لإكمال الاشتراك.'}</span>
                                    </div>
                                    <div className="text-[11px] flex flex-wrap gap-3 font-bold">
                                      <span>
                                        {tr(lang, 'المطلوب:', 'Requis :', 'Required:')}{' '}
                                        {(inspection.requiredAmount ?? activePlan?.price_mru ?? 0).toLocaleString()} MRU
                                      </span>
                                      <span className="text-[#456810]">
                                        {tr(lang, 'المدفوع:', 'Payé :', 'Paid:')}{' '}
                                        {(inspection.paidAmount ?? inspection.extracted.amount ?? 0).toLocaleString()} MRU
                                      </span>
                                      <span className="text-red-700">
                                        {tr(lang, 'المتبقي:', 'Reste :', 'Remaining:')}{' '}
                                        {(inspection.remainingAmount ?? 0).toLocaleString()} MRU
                                      </span>
                                    </div>
                                    <p className="text-[11px]">
                                      {tr(
                                        lang,
                                        'يمكنك حفظ هذا الإيصال كدفعة أولى ثم إكمال المبلغ لاحقاً، أو رفع وصل بالمبلغ الكامل الآن.',
                                        'Vous pouvez enregistrer cet acompte puis compléter le reste, ou téléverser un reçu complet.',
                                        'You can submit this partial payment now and top up the rest later, or upload a full receipt.'
                                      )}
                                    </p>
                                  </div>
                                )}

                                {inspection.warnings.length > 0 && (
                                  <div className="p-2 rounded bg-amber-50 border border-amber-200 text-amber-900 text-[11px] font-semibold">
                                    {inspection.warnings.join(' · ')}
                                  </div>
                                )}

                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-[#f7f9fa] border border-[#e3e8eb] rounded p-2 text-[11px]">
                                  <div>
                                    <span className="text-[#6b787e] block">
                                      {tr(lang, 'رقم العملية', 'ID Opération', 'TX ID')}
                                    </span>
                                    <strong dir="ltr">{inspection.extracted.transactionId || '—'}</strong>
                                  </div>
                                  <div>
                                    <span className="text-[#6b787e] block">
                                      {tr(lang, 'المرجع', 'Référence', 'Reference')}
                                    </span>
                                    <strong dir="ltr">
                                      {inspection.extracted.transactionReference || '—'}
                                    </strong>
                                  </div>
                                  <div>
                                    <span className="text-[#6b787e] block">
                                      {tr(lang, 'المبلغ المستخرج', 'Montant extrait', 'Extracted Amount')}
                                    </span>
                                    <strong>
                                      {inspection.extracted.amount !== null
                                        ? `${inspection.extracted.amount} ${inspection.extracted.currency || 'MRU'}`
                                        : '—'}
                                    </strong>
                                  </div>
                                  <div>
                                    <span className="text-[#6b787e] block">
                                      {tr(lang, 'تاريخ التحويل', 'Date transfert', 'Transfer Date')}
                                    </span>
                                    <strong dir="ltr">
                                      {inspection.extracted.transactionAt
                                        ? new Date(inspection.extracted.transactionAt).toLocaleDateString(
                                            localeCode(lang)
                                          )
                                        : '—'}
                                    </strong>
                                  </div>
                                </div>
                              </div>
                            )}

                            {!inspecting && (inspection?.verdict === 'rejected' || processingStage === 'rejected') && (
                              <div className="p-3 rounded bg-red-50 border border-red-200 text-red-800 space-y-2">
                                <div className="font-extrabold flex items-center gap-1.5">
                                  <XCircle className="w-4 h-4 shrink-0" />
                                  <span>
                                    {tr(
                                      lang,
                                      'تم رفض الإيصال للأسباب التالية:',
                                      'Reçu refusé pour les motifs suivants :',
                                      'Receipt Rejected for the Following Reasons:'
                                    )}
                                  </span>
                                </div>
                                {inspection?.rejectionIssues && inspection.rejectionIssues.length > 0 ? (
                                  <ul className="list-disc ps-5 space-y-1 text-[11px] font-semibold">
                                    {inspection.rejectionIssues.map((iss, idx) => (
                                      <li key={`${iss.code}-${idx}`}>
                                        {lang === 'ar'
                                          ? iss.messageAr
                                          : lang === 'fr'
                                            ? iss.messageFr
                                            : iss.messageEn}
                                      </li>
                                    ))}
                                  </ul>
                                ) : (
                                  <p className="text-[11px] font-semibold">
                                    {inspection?.reason || error}
                                  </p>
                                )}

                                {inspection?.extracted && (
                                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-white/80 border border-red-200 rounded p-2 text-[10.5px] text-[#384D55]">
                                    <div>
                                      <span className="text-[#6b787e] block">
                                        {tr(lang, 'التطبيق المكتشف', 'Application', 'Detected App')}
                                      </span>
                                      <strong>
                                        {inspection.extracted.appDetected ||
                                          inspection.extracted.paymentMethodDetected ||
                                          tr(lang, 'غير متوفر', 'Non disponible', 'Unavailable')}
                                      </strong>
                                    </div>
                                    <div>
                                      <span className="text-[#6b787e] block">
                                        {tr(lang, 'المبلغ', 'Montant', 'Amount')}
                                      </span>
                                      <strong>
                                        {inspection.extracted.amount !== null && inspection.extracted.amount !== undefined
                                          ? `${inspection.extracted.amount} ${inspection.extracted.currency || 'MRU'}`
                                          : tr(lang, 'غير متوفر', 'Non disponible', 'Unavailable')}
                                      </strong>
                                    </div>
                                    <div>
                                      <span className="text-[#6b787e] block">
                                        {tr(lang, 'رقم العملية', 'ID Opération', 'TX ID')}
                                      </span>
                                      <strong dir="ltr">
                                        {inspection.extracted.transactionId ||
                                          tr(lang, 'غير متوفر', 'Non disponible', 'Unavailable')}
                                      </strong>
                                    </div>
                                    <div>
                                      <span className="text-[#6b787e] block">
                                        {tr(lang, 'تاريخ التحويل', 'Date', 'Date')}
                                      </span>
                                      <strong dir="ltr">
                                        {inspection.extracted.transactionAt
                                          ? new Date(inspection.extracted.transactionAt).toLocaleString(localeCode(lang))
                                          : tr(lang, 'غير متوفر', 'Non disponible', 'Unavailable')}
                                      </strong>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}

                            {!inspecting && processingStage === 'error' && (
                              <div className="p-2.5 rounded bg-amber-50 border border-amber-200 text-amber-900 space-y-2">
                                <div className="font-extrabold flex items-center gap-1.5">
                                  <AlertCircle className="w-4 h-4 shrink-0" />
                                  <span>{error}</span>
                                </div>
                                {(uploadId || proofDataUrl) && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      void runReceiptInspection({
                                        uploadIdToUse: uploadId || undefined,
                                        dataUrlToUse: proofDataUrl,
                                        planIdToUse: selectedPlanId,
                                        phoneToUse: senderPhone,
                                      })
                                    }
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#384D55] text-white text-[11px] font-bold cursor-pointer"
                                  >
                                    <RefreshCw className="w-3 h-3" />
                                    <span>{tr(lang, 'إعادة الفحص', 'Réessayer', 'Retry Inspection')}</span>
                                  </button>
                                )}
                              </div>
                            )}

                            {!inspecting && !inspection && processingStage === 'idle' && (
                              <div className="font-bold text-[#384D55] flex items-center gap-1.5">
                                <FileCheck2 className="w-4 h-4 text-[#557a16]" />
                                <span>{proofFileName}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Column 2: Plan & Payment Method Selection */}
            <div className="lg:col-span-5 space-y-3">
              <div className="addressp-box">
                <span className="ltitle">{t.checkoutTrackMethodTitle}</span>
                <div className="space-y-3 text-[13px]">
                  {paidPlans.length === 0 ? (
                    <div className="text-[#5c686e]">{t.loading}</div>
                  ) : (
                    <div className="space-y-2">
                      {paidPlans.map((plan) => {
                        const isAnnual = plan.billing_cycle === 'annual' || plan.slug === 'annual-concours';
                        return (
                          <label
                            key={plan.firestoreId || plan.id}
                            className={`flex items-center justify-between gap-2 p-2.5 rounded-[4px] border cursor-pointer ${
                              selectedPlanId === plan.id
                                ? 'bg-white border-[#83a329] ring-1 ring-[#A6CE39]'
                                : 'bg-[#f8f9fa] border-[#d8dfe2]'
                            }`}
                          >
                            <span className="flex items-center gap-2 font-semibold text-[#384D55]">
                              <input
                                type="radio"
                                name="planSelect"
                                checked={selectedPlanId === plan.id}
                                onChange={() => {
                                  setSelectedPlanId(plan.id);
                                  if (!isGlobalCard && (uploadId || proofDataUrl)) {
                                    void runReceiptInspection({
                                      uploadIdToUse: uploadId || undefined,
                                      dataUrlToUse: proofDataUrl,
                                      planIdToUse: plan.id,
                                      phoneToUse: senderPhone,
                                    });
                                  }
                                }}
                                className="accent-[#384D55]"
                              />
                              <span>
                                {lang === 'ar' ? plan.name_ar : plan.name_fr}
                                {isAnnual && annualSavings && annualSavings.savingsAmount > 0 && (
                                  <span className="ms-1.5 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-[2px] bg-[#e2efbf] text-[#456810] text-[10px] font-bold">
                                    <Tag className="w-2.5 h-2.5" />
                                    {tr(
                                      lang,
                                      `وفر ${annualSavings.savingsPercent}%`,
                                      `-${annualSavings.savingsPercent}%`,
                                      `Save ${annualSavings.savingsPercent}%`
                                    )}
                                  </span>
                                )}
                              </span>
                            </span>
                            <span className="font-bold text-[#384D55] tabular-nums">
                              {plan.price_mru.toLocaleString()} MRU
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              <div className="addressp-box">
                <span className="ltitle">
                  {tr(lang, 'وسيلة الدفع المعتمدة', 'Moyen de paiement', 'Select Payment System')}
                </span>
                <div className="space-y-3 text-[13px]">
                  <div className="bg-white p-3 rounded-[4px] border border-[#d8dfe2] space-y-3">
                    <PaymentBrandBadges
                      size="md"
                      showMauritanianMethods
                      activeMethod={selectedMethod}
                      onSelectMethod={handleSelectMethod}
                    />
                    <div className="grid grid-cols-2 gap-2">
                      {availableLocalMethods.map((m) => (
                        <button
                          key={m.code}
                          type="button"
                          onClick={() => handleSelectMethod(m.code)}
                          className={`px-2.5 py-2 rounded-[4px] border text-xs font-bold text-start cursor-pointer transition-colors ${
                            selectedMethod === m.code
                              ? 'border-[#83a329] bg-[#f4faea] text-[#384D55]'
                              : 'border-[#d8dfe2] bg-[#f8f9fa] text-[#5c686e]'
                          }`}
                        >
                          {lang === 'ar' ? m.name_ar : m.name_fr}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => handleSelectMethod('card')}
                        className={`px-2.5 py-2 rounded-[4px] border text-xs font-bold text-start cursor-pointer transition-colors ${
                          selectedMethod === 'card'
                            ? 'border-[#83a329] bg-[#f4faea] text-[#384D55]'
                            : 'border-[#d8dfe2] bg-[#f8f9fa] text-[#5c686e]'
                        }`}
                      >
                        {tr(lang, 'البطاقة (Visa / MasterCard)', 'Carte Visa / MasterCard', 'Visa / MasterCard')}
                      </button>
                    </div>
                  </div>

                  {/* Instructions Box strictly adapted to the active system */}
                  {isGlobalCard ? (
                    <div className="bg-white border border-[#83a329]/50 rounded-[4px] p-3 text-xs space-y-1.5">
                      <div className="font-bold text-[#384D55] flex items-center gap-1.5">
                        <CreditCard className="w-4 h-4 text-[#557a16]" />
                        <span>
                          {tr(
                            lang,
                            'بوابة البطاقات العالمية Visa / MasterCard',
                            'Passerelle internationale Visa / MasterCard',
                            'Global Visa / MasterCard Gateway'
                          )}
                        </span>
                      </div>
                      <p className="text-[11px] text-[#4c626b] leading-relaxed">
                        {tr(
                          lang,
                          'نظام دفع إلكتروني مستقل عن التحويلات المحلية: أدخل بيانات البطاقة واضغط تأكيد لتفعيل اشتراكك فوراً.',
                          'Système indépendant des transferts locaux : saisissez votre carte pour activer immédiatement.',
                          'Independent global card gateway: enter card details to activate your subscription immediately.'
                        )}
                      </p>
                    </div>
                  ) : (
                    <div className="bg-white border border-[#83a329]/50 rounded-[4px] p-3 text-xs space-y-1.5">
                      <div className="font-bold text-[#384D55] flex items-center gap-1.5">
                        <ShieldCheck className="w-4 h-4 text-[#557a16]" />
                        <span>
                          {tr(
                            lang,
                            `بيانات التحويل عبر ${activeMethodObj.name_ar}`,
                            `Détails de transfert (${activeMethodObj.name_fr})`,
                            `Transfer details (${activeMethodObj.name_fr})`
                          )}
                        </span>
                      </div>
                      {activeMethodObj.beneficiary_name && (
                        <div className="flex justify-between gap-2">
                          <span className="text-[#5c686e]">
                            {tr(lang, 'المستفيد:', 'Bénéficiaire :', 'Beneficiary:')}
                          </span>
                          <span className="font-bold text-[#384D55]" dir="ltr">
                            {activeMethodObj.beneficiary_name}
                          </span>
                        </div>
                      )}
                      {activeMethodObj.account_number && (
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[#5c686e]">
                            {tr(lang, 'الرقم / الحساب:', 'Numéro / Compte :', 'Account Number:')}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="font-extrabold text-[#557a16] text-sm tabular-nums" dir="ltr">
                              {activeMethodObj.account_number}
                            </span>
                            <button
                              type="button"
                              onClick={() => void handleCopyAccountNumber(activeMethodObj.account_number)}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[3px] border border-[#c9d0d3] bg-[#f7f9fa] hover:bg-[#e2efbf] hover:border-[#83a329] text-[#384D55] text-[11px] font-bold cursor-pointer transition-colors"
                              aria-label={tr(lang, 'نسخ الرقم', 'Copier le numéro', 'Copy number')}
                            >
                              {copiedAccount ? (
                                <>
                                  <Check className="w-3 h-3 text-[#456810]" />
                                  <span className="text-[#456810]">
                                    {tr(lang, 'تم النسخ', 'Copié', 'Copied')}
                                  </span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3 h-3" />
                                  <span>{tr(lang, 'نسخ', 'Copier', 'Copy')}</span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      )}
                      {copiedAccount && (
                        <div className="text-[11px] font-bold text-[#456810] bg-[#f4faea] border border-[#A6CE39] rounded-[3px] px-2 py-1">
                          {tr(lang, 'تم نسخ الرقم.', 'Numéro copié.', 'Number copied.')}
                        </div>
                      )}
                      <p className="text-[11px] text-[#4c626b] leading-relaxed pt-1 border-t border-[#efefef]">
                        {lang === 'ar' ? activeMethodObj.instructions_ar : activeMethodObj.instructions_fr}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {!isGlobalCard && (
                <div className="flex justify-end">
                  <button
                    type="button"
                    disabled={
                      inspecting ||
                      !inspection ||
                      (inspection.verdict !== 'verified' &&
                        inspection.verdict !== 'underpaid' &&
                        inspection.verdict !== 'manual_review')
                    }
                    onClick={validateLocalStep1AndAdvance}
                    className="imgsend2 w-full sm:w-auto disabled:opacity-50"
                  >
                    {inspection?.verdict === 'underpaid'
                      ? tr(lang, 'حفظ الدفعة الأولية والمراجعة', 'Enregistrer l’acompte', 'Continue with Partial Payment')
                      : inspection?.verdict === 'manual_review'
                        ? tr(lang, 'المتابعة للمراجعة اليدوية', 'Continuer pour révision', 'Continue for Manual Review')
                        : t.checkoutContinue}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* STEP 2: LOCAL MAURITANIAN PAYMENT REVIEW                          */}
        {/* ================================================================= */}
        {activeStep === 2 && !isGlobalCard && (
          <div className="space-y-5">
            <h1 className="text-[20px] font-bold text-[#384D55]">{t.checkoutReviewOrder}</h1>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-[13.5px]">
              <div className="addressp-box mb-0 space-y-2">
                <span className="ltitle-green !mb-1">
                  {tr(lang, 'بيانات المرسل', 'Expéditeur', 'Sender Details')}
                </span>
                <div className="font-bold text-[#384D55]">{fullName}</div>
                <div dir="ltr" className="text-[#4c626b]">
                  {user.email}
                </div>
                <div dir="ltr" className="text-[#4c626b]">
                  {senderPhone}
                </div>
              </div>

              <div className="addressp-box mb-0 space-y-2">
                <span className="ltitle-green !mb-1">
                  {tr(lang, 'البيانات المستخرجة آلياً', 'Données extraites', 'Auto-Extracted Details')}
                </span>
                <div>
                  <span className="text-[#5c686e]">{tr(lang, 'الوسيلة: ', 'Moyen : ', 'Method: ')}</span>
                  <span className="font-bold text-[#384D55]">
                    {lang === 'ar' ? activeMethodObj.name_ar : activeMethodObj.name_fr}
                  </span>
                </div>
                <div>
                  <span className="text-[#5c686e]">{tr(lang, 'رقم العملية: ', 'ID : ', 'TX ID: ')}</span>
                  <span className="font-bold text-[#384D55]" dir="ltr">
                    {inspection?.extracted.transactionId || '—'}
                  </span>
                </div>
                <div>
                  <span className="text-[#5c686e]">{tr(lang, 'المرجع: ', 'Réf : ', 'Reference: ')}</span>
                  <span className="font-bold text-[#384D55]" dir="ltr">
                    {inspection?.extracted.transactionReference || '—'}
                  </span>
                </div>
                <div>
                  <span className="text-[#5c686e]">{tr(lang, 'المبلغ المستخرج: ', 'Montant : ', 'Amount: ')}</span>
                  <span className="font-bold text-[#557a16]">
                    {inspection?.extracted.amount ?? activePlan?.price_mru}{' '}
                    {inspection?.extracted.currency || 'MRU'}
                  </span>
                </div>
              </div>

              <div className="addressp-box mb-0 space-y-2">
                <span className="ltitle-green !mb-1">
                  {tr(lang, 'صورة الإيصال المفحوصة', 'Reçu vérifié', 'Verified Receipt')}
                </span>
                {proofDataUrl && (
                  <img
                    src={proofDataUrl}
                    alt="Uploaded receipt"
                    className="w-full max-h-36 object-contain rounded-[4px] border border-[#d8dfe2] bg-white"
                  />
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-start">
              <div className="addressp-box-white mb-0 text-[13.5px] space-y-3">
                <span className="ltitle-green">{t.checkoutItemsTitle}</span>
                {activePlan && (
                  <div className="flex items-start justify-between gap-3 py-2 border-b border-[#efefef]">
                    <div>
                      <div className="font-bold text-[15px] text-[#384D55]">
                        {lang === 'ar' ? activePlan.name_ar : activePlan.name_fr}
                      </div>
                      <div className="text-xs text-[#5c686e] mt-0.5">
                        {lang === 'ar' ? activePlan.description_ar : activePlan.description_fr}
                      </div>
                    </div>
                    <span className="font-bold text-[15px] text-[#384D55] tabular-nums shrink-0">
                      {activePlan.price_mru.toLocaleString()} MRU
                    </span>
                  </div>
                )}

                <label className="flex items-start gap-2 pt-1 cursor-pointer text-xs">
                  <input
                    type="checkbox"
                    checked={agreeTerms}
                    onChange={(e) => setAgreeTerms(e.target.checked)}
                    className="mt-0.5 accent-[#384D55]"
                  />
                  <span className="text-[#384D55]">
                    {tr(
                      lang,
                      'أؤكد صحة الإيصال المرفق وأوافق على مراجعته من الإدارة قبل تفعيل الباقة.',
                      'Je confirme la véracité du reçu et sa validation par l’administration.',
                      'I confirm the receipt is genuine and approve administrative review prior to activation.'
                    )}
                  </span>
                </label>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setActiveStep(1)}
                  className="imgsend2-secondary text-xs"
                >
                  {tr(lang, 'تعديل البيانات', 'Modifier', 'Edit Details')}
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => void handleSubmitLocalRequest()}
                  className="imgsend2 text-xs"
                >
                  {submitting
                    ? t.loading
                    : tr(lang, 'إرسال الطلب للمراجعة', 'Soumettre pour validation', 'Submit for Review')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* STEP 3: SUCCESS RECEIPT (GLOBAL CARD vs LOCAL PENDING REVIEW)     */}
        {/* ================================================================= */}
        {activeStep === 3 && cardReceipt && (
          <div className="max-w-xl mx-auto addressp-box text-center space-y-4 my-4">
            <div className="w-14 h-14 bg-[#e2efbf] text-[#456810] rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h2 className="text-[20px] font-bold text-[#384D55]">
              {tr(
                lang,
                'تم الدفع وتفعيل اشتراكك بنجاح',
                'Paiement validé — Abonnement activé',
                'Payment Successful — Subscription Active'
              )}
            </h2>
            <p className="text-xs text-[#5c686e] leading-relaxed">
              {tr(
                lang,
                'تمت معالجة بطاقتك وتفعيل جميع صلاحيات الباقة فوراً.',
                'Votre paiement par carte a été accepté et votre accès est immédiatement activé.',
                'Your card payment has been processed and full plan features are now unlocked.'
              )}
            </p>
            <div className="bg-white border border-[#d8dfe2] rounded-[4px] p-4 text-xs text-start space-y-2">
              <div className="flex justify-between gap-2">
                <span className="text-[#5c686e]">{tr(lang, 'مرجع المعاملة:', 'Référence :', 'Transaction ID:')}</span>
                <span className="font-bold text-[#384D55]" dir="ltr">
                  {cardReceipt.provider_tx_id}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-[#5c686e]">{tr(lang, 'البوابة:', 'Passerelle :', 'Gateway:')}</span>
                <span className="font-bold text-[#384D55] uppercase" dir="ltr">
                  {cardReceipt.card_brand}
                  {cardReceipt.card_last4 ? ` •••• ${cardReceipt.card_last4}` : ''}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-[#5c686e]">{tr(lang, 'الباقة:', 'Formule :', 'Plan:')}</span>
                <span className="font-bold text-[#384D55]">{cardReceipt.plan_name}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-[#5c686e]">{tr(lang, 'صالح لغاية:', 'Valable jusqu’au :', 'Valid Until:')}</span>
                <span className="font-bold text-[#557a16]" dir="ltr">
                  {new Date(cardReceipt.expires_at).toLocaleDateString(localeCode(lang))}
                </span>
              </div>
            </div>
            <div className="flex flex-wrap justify-center gap-2 pt-1">
              <button
                type="button"
                onClick={() =>
                  void printStudentReceipt(
                    {
                      rid: cardReceipt.provider_tx_id,
                      kind: 'card_tx',
                      studentName: user.name,
                      studentEmail: user.email,
                      planName: cardReceipt.plan_name,
                      amount: cardReceipt.amount_mru,
                      paidAmount: cardReceipt.amount_mru,
                      currency: cardReceipt.currency || 'MRU',
                      paymentMethod: cardReceipt.card_brand,
                      cardBrand: cardReceipt.card_brand,
                      cardLast4: cardReceipt.card_last4,
                      transactionId: cardReceipt.provider_tx_id,
                      status: 'succeeded',
                      verified: true,
                      transactionAt: cardReceipt.starts_at || new Date().toISOString(),
                      startsAt: cardReceipt.starts_at,
                      expiresAt: cardReceipt.expires_at,
                      verifyUrl: cardReceipt.verify_url,
                    },
                    lang
                  )
                }
                className="imgsend2-secondary text-xs"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>{tr(lang, 'طباعة الإيصال', 'Imprimer', 'Print')}</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  void downloadStudentReceiptPdf(
                    {
                      rid: cardReceipt.provider_tx_id,
                      kind: 'card_tx',
                      studentName: user.name,
                      studentEmail: user.email,
                      planName: cardReceipt.plan_name,
                      amount: cardReceipt.amount_mru,
                      paidAmount: cardReceipt.amount_mru,
                      currency: cardReceipt.currency || 'MRU',
                      paymentMethod: cardReceipt.card_brand,
                      cardBrand: cardReceipt.card_brand,
                      cardLast4: cardReceipt.card_last4,
                      transactionId: cardReceipt.provider_tx_id,
                      status: 'succeeded',
                      verified: true,
                      transactionAt: cardReceipt.starts_at || new Date().toISOString(),
                      startsAt: cardReceipt.starts_at,
                      expiresAt: cardReceipt.expires_at,
                      verifyUrl: cardReceipt.verify_url,
                    },
                    lang
                  )
                }
                className="imgsend2 text-xs"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>PDF</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  void downloadStudentReceiptJpg(
                    {
                      rid: cardReceipt.provider_tx_id,
                      kind: 'card_tx',
                      studentName: user.name,
                      studentEmail: user.email,
                      planName: cardReceipt.plan_name,
                      amount: cardReceipt.amount_mru,
                      paidAmount: cardReceipt.amount_mru,
                      currency: cardReceipt.currency || 'MRU',
                      paymentMethod: cardReceipt.card_brand,
                      cardBrand: cardReceipt.card_brand,
                      cardLast4: cardReceipt.card_last4,
                      transactionId: cardReceipt.provider_tx_id,
                      status: 'succeeded',
                      verified: true,
                      transactionAt: cardReceipt.starts_at || new Date().toISOString(),
                      startsAt: cardReceipt.starts_at,
                      expiresAt: cardReceipt.expires_at,
                      verifyUrl: cardReceipt.verify_url,
                    },
                    lang
                  )
                }
                className="imgsend2-secondary text-xs"
              >
                <ImageIcon className="w-3.5 h-3.5" />
                <span>JPG HD</span>
              </button>
              {cardReceipt.verify_sig && (
                <button
                  type="button"
                  onClick={() =>
                    navigate('verify-receipt', {
                      receiptId: cardReceipt.provider_tx_id,
                      receiptSig: cardReceipt.verify_sig,
                    })
                  }
                  className="imgsend2-secondary text-xs"
                >
                  <QrCode className="w-3.5 h-3.5" />
                  <span>{tr(lang, 'تحقق QR', 'Vérifier QR', 'Verify QR')}</span>
                </button>
              )}
            </div>

            <div className="flex flex-wrap justify-center gap-3 pt-2">
              <button type="button" onClick={() => navigate('lessons')} className="imgsend2 text-xs">
                {t.navLessons}
              </button>
              <button type="button" onClick={() => navigate('exams')} className="imgsend2-secondary text-xs">
                {t.navExams}
              </button>
            </div>
          </div>
        )}

        {activeStep === 3 && submittedRequest && (
          <div className="max-w-xl mx-auto addressp-box text-center space-y-4 my-4">
            <div className="w-14 h-14 bg-amber-100 text-amber-800 rounded-full flex items-center justify-center mx-auto">
              <Clock className="w-8 h-8" />
            </div>
            <h2 className="text-[20px] font-bold text-[#384D55]">
              {submittedRequest.status === 'partial_pending'
                ? tr(
                    lang,
                    'تم تسجيل الدفعة الأولية — يرجى إكمال المبلغ المتبقي',
                    'Acompte enregistré — Veuillez compléter le solde',
                    'Partial Payment Recorded — Complete Remaining Balance'
                  )
                : tr(
                    lang,
                    'تم استلام طلب الاشتراك وهو قيد المراجعة',
                    'Demande reçue — En attente de validation',
                    'Subscription Request Received — Pending Review'
                  )}
            </h2>
            <p className="text-xs text-[#5c686e] leading-relaxed">
              {submittedRequest.status === 'partial_pending'
                ? tr(
                    lang,
                    'يمكنك رفع وصل الدفعة التكميلية مباشرة عبر زر "إكمال المبلغ" في سجل طلباتك أدناه.',
                    'Téléversez le reçu complémentaire via le bouton « Compléter le montant » ci-dessous.',
                    'Upload your complementary receipt anytime using the "Complete Amount" button in your history below.'
                  )
                : tr(
                    lang,
                    'شكراً لك. تم اجتياز الفحص الأولي للإيصال بنجاح وستقوم الإدارة بالاعتماد النهائي خلال أقرب وقت.',
                    'Merci. L’inspection initiale du reçu a réussi et l’administration finalisera l’activation sous peu.',
                    'Thank you. Your receipt passed initial verification and admin will finalize activation shortly.'
                  )}
            </p>

            <div className="bg-white border border-[#d8dfe2] rounded-[4px] p-4 text-xs text-start space-y-2">
              <div className="flex justify-between gap-2">
                <span className="text-[#5c686e]">{tr(lang, 'رقم الطلب:', 'ID Demande :', 'Request ID:')}</span>
                <span className="font-bold text-[#384D55] tabular-nums" dir="ltr">
                  {submittedRequest.subscription_request_id}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-[#5c686e]">{tr(lang, 'الباقة:', 'Formule :', 'Plan:')}</span>
                <span className="font-bold text-[#384D55]">{submittedRequest.plan_name}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-[#5c686e]">{tr(lang, 'المطلوب:', 'Requis :', 'Required:')}</span>
                <span className="font-bold text-[#384D55] tabular-nums">
                  {submittedRequest.amount.toLocaleString()} {submittedRequest.currency}
                </span>
              </div>
              {submittedRequest.paid_amount !== undefined && (
                <div className="flex justify-between gap-2">
                  <span className="text-[#5c686e]">{tr(lang, 'المدفوع:', 'Payé :', 'Paid:')}</span>
                  <span className="font-bold text-[#456810] tabular-nums">
                    {Number(submittedRequest.paid_amount).toLocaleString()} {submittedRequest.currency}
                  </span>
                </div>
              )}
              {Number(submittedRequest.remaining_amount || 0) > 0 && (
                <div className="flex justify-between gap-2">
                  <span className="text-[#5c686e]">{tr(lang, 'المتبقي:', 'Reste :', 'Remaining:')}</span>
                  <span className="font-bold text-red-700 tabular-nums">
                    {Number(submittedRequest.remaining_amount).toLocaleString()} {submittedRequest.currency}
                  </span>
                </div>
              )}
              <div className="flex justify-between gap-2">
                <span className="text-[#5c686e]">{tr(lang, 'الوسيلة:', 'Moyen :', 'Method:')}</span>
                <span className="font-bold text-[#384D55] uppercase">{submittedRequest.payment_method}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-[#5c686e]">{tr(lang, 'الحالة:', 'Statut :', 'Status:')}</span>
                {renderStatusBadge(submittedRequest.status)}
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-[#5c686e]">{tr(lang, 'وقت الرفع:', 'Téléversé le :', 'Uploaded At:')}</span>
                <span className="font-semibold text-[#384D55]" dir="ltr">
                  {new Date(submittedRequest.uploaded_at).toLocaleString(localeCode(lang))}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap justify-center gap-2 pt-1">
              <button
                type="button"
                onClick={() =>
                  void printStudentReceipt(
                    {
                      rid: submittedRequest.subscription_request_id,
                      kind: 'local_request',
                      studentName: user.name,
                      studentEmail: user.email,
                      planName: submittedRequest.plan_name,
                      amount: submittedRequest.amount,
                      paidAmount: submittedRequest.paid_amount ?? submittedRequest.amount,
                      remainingAmount: submittedRequest.remaining_amount,
                      currency: submittedRequest.currency || 'MRU',
                      paymentMethod: submittedRequest.payment_method,
                      transactionId: submittedRequest.transaction_id || submittedRequest.transaction_reference,
                      transactionReference: submittedRequest.transaction_reference,
                      beneficiaryName: submittedRequest.beneficiary_name,
                      status: submittedRequest.status,
                      verified: submittedRequest.status === 'approved',
                      transactionAt: submittedRequest.transaction_at || submittedRequest.uploaded_at,
                      startsAt: submittedRequest.starts_at,
                      expiresAt: submittedRequest.expires_at,
                      verifyUrl: submittedRequest.verify_url,
                    },
                    lang
                  )
                }
                className="imgsend2-secondary text-xs"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>{tr(lang, 'طباعة الإيصال', 'Imprimer', 'Print')}</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  void downloadStudentReceiptPdf(
                    {
                      rid: submittedRequest.subscription_request_id,
                      kind: 'local_request',
                      studentName: user.name,
                      studentEmail: user.email,
                      planName: submittedRequest.plan_name,
                      amount: submittedRequest.amount,
                      paidAmount: submittedRequest.paid_amount ?? submittedRequest.amount,
                      remainingAmount: submittedRequest.remaining_amount,
                      currency: submittedRequest.currency || 'MRU',
                      paymentMethod: submittedRequest.payment_method,
                      transactionId: submittedRequest.transaction_id || submittedRequest.transaction_reference,
                      transactionReference: submittedRequest.transaction_reference,
                      beneficiaryName: submittedRequest.beneficiary_name,
                      status: submittedRequest.status,
                      verified: submittedRequest.status === 'approved',
                      transactionAt: submittedRequest.transaction_at || submittedRequest.uploaded_at,
                      startsAt: submittedRequest.starts_at,
                      expiresAt: submittedRequest.expires_at,
                      verifyUrl: submittedRequest.verify_url,
                    },
                    lang
                  )
                }
                className="imgsend2 text-xs"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>PDF</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  void downloadStudentReceiptJpg(
                    {
                      rid: submittedRequest.subscription_request_id,
                      kind: 'local_request',
                      studentName: user.name,
                      studentEmail: user.email,
                      planName: submittedRequest.plan_name,
                      amount: submittedRequest.amount,
                      paidAmount: submittedRequest.paid_amount ?? submittedRequest.amount,
                      remainingAmount: submittedRequest.remaining_amount,
                      currency: submittedRequest.currency || 'MRU',
                      paymentMethod: submittedRequest.payment_method,
                      transactionId: submittedRequest.transaction_id || submittedRequest.transaction_reference,
                      transactionReference: submittedRequest.transaction_reference,
                      beneficiaryName: submittedRequest.beneficiary_name,
                      status: submittedRequest.status,
                      verified: submittedRequest.status === 'approved',
                      transactionAt: submittedRequest.transaction_at || submittedRequest.uploaded_at,
                      startsAt: submittedRequest.starts_at,
                      expiresAt: submittedRequest.expires_at,
                      verifyUrl: submittedRequest.verify_url,
                    },
                    lang
                  )
                }
                className="imgsend2-secondary text-xs"
              >
                <ImageIcon className="w-3.5 h-3.5" />
                <span>JPG HD</span>
              </button>
              {submittedRequest.verify_sig && (
                <button
                  type="button"
                  onClick={() =>
                    navigate('verify-receipt', {
                      receiptId: submittedRequest.subscription_request_id,
                      receiptSig: submittedRequest.verify_sig,
                    })
                  }
                  className="imgsend2-secondary text-xs"
                >
                  <QrCode className="w-3.5 h-3.5" />
                  <span>{tr(lang, 'تحقق QR', 'Vérifier QR', 'Verify QR')}</span>
                </button>
              )}
            </div>

            <div className="flex flex-wrap justify-center gap-3 pt-2">
              <button type="button" onClick={() => navigate('lessons')} className="imgsend2 text-xs">
                {t.navLessons}
              </button>
              <button
                type="button"
                onClick={() => navigate('subscriptions')}
                className="imgsend2-secondary text-xs"
              >
                {t.navSubscriptions}
              </button>
            </div>
          </div>
        )}

        {/* User's Local Payment Request History */}
        <div className="addressp-box">
          <div className="flex items-center justify-between gap-2 mb-3">
            <span className="ltitle !mb-0">
              {tr(
                lang,
                'سجل طلبات الاشتراك المحلية الخاصة بك',
                'Historique de vos demandes locales',
                'Local Subscription Request History'
              )}
            </span>
            <button
              type="button"
              onClick={() => void loadMyRequests()}
              className="text-xs font-bold text-[#557a16] hover:underline flex items-center gap-1 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingRequests ? 'animate-spin' : ''}`} />
              <span>{tr(lang, 'تحديث', 'Actualiser', 'Refresh')}</span>
            </button>
          </div>

          {completeSuccessMsg && (
            <div className="mb-3 p-2.5 rounded bg-[#f4faea] border border-[#A6CE39] text-[#456810] text-xs font-bold">
              {completeSuccessMsg}
            </div>
          )}

          {myRequests.length === 0 ? (
            <p className="text-xs text-[#5c686e]">
              {tr(
                lang,
                'لا توجد طلبات اشتراك محلية مسجلة بعد.',
                'Aucune demande enregistrée pour le moment.',
                'No local subscription requests yet.'
              )}
            </p>
          ) : (
            <div className="space-y-3">
              {myRequests.map((req) => {
                const isCompleting = completingReq?.id === req.id;
                const canTopUp = req.status === 'partial_pending' || req.status === 'needs_info';
                return (
                  <div
                    key={req.subscription_request_id}
                    className="bg-white border border-[#d8dfe2] rounded-[4px] p-3 text-xs space-y-2.5"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-[#384D55]">{req.plan_name}</span>
                          <span className="text-[11px] font-mono text-[#5c686e]" dir="ltr">
                            {req.subscription_request_id}
                          </span>
                          {renderStatusBadge(req.status)}
                        </div>
                        <div className="text-[11px] text-[#5c686e] flex flex-wrap gap-3">
                          <span>
                            {tr(lang, 'المطلوب:', 'Requis:', 'Required:')} {req.amount.toLocaleString()} {req.currency} · {req.payment_method.toUpperCase()}
                          </span>
                          {req.paid_amount !== undefined && (
                            <span className="text-[#456810] font-bold">
                              {tr(lang, 'المدفوع:', 'Payé:', 'Paid:')} {Number(req.paid_amount).toLocaleString()} {req.currency}
                            </span>
                          )}
                          {Number(req.remaining_amount || 0) > 0 && (
                            <span className="text-red-700 font-bold">
                              {tr(lang, 'المتبقي:', 'Reste:', 'Remaining:')} {Number(req.remaining_amount).toLocaleString()} {req.currency}
                            </span>
                          )}
                          <span dir="ltr">TX: {req.transaction_id || req.transaction_reference}</span>
                          {req.second_transaction_id && (
                            <span dir="ltr" className="text-[#384D55] font-semibold">
                              TX2: {req.second_transaction_id} ({req.second_extracted_amount ?? '—'} {req.currency})
                            </span>
                          )}
                          {req.expires_at && (
                            <span>
                              {tr(lang, 'ينتهي: ', 'Expire : ', 'Expires: ')}
                              {new Date(req.expires_at).toLocaleDateString(localeCode(lang))}
                            </span>
                          )}
                        </div>
                        {req.status === 'needs_info' && req.admin_clarification_note && (
                          <div className="p-2 rounded bg-sky-50 border border-sky-200 text-sky-900 text-[11px] font-bold">
                            {tr(lang, 'ملاحظة الإدارة: ', 'Note admin : ', 'Admin note: ')}
                            {req.admin_clarification_note}
                          </div>
                        )}
                        {req.status === 'rejected' && req.rejection_reason && (
                          <div className="text-[11px] font-bold text-red-700">
                            {tr(lang, 'سبب الرفض: ', 'Motif : ', 'Rejection Reason: ')}
                            {req.rejection_reason}
                          </div>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-1.5 shrink-0">
                        {(() => {
                          const printableReq: PrintableReceiptData = {
                            rid: req.subscription_request_id,
                            kind: 'local_request',
                            studentName: user.name,
                            studentEmail: user.email,
                            planName: req.plan_name,
                            amount: req.amount,
                            paidAmount: req.paid_amount ?? req.amount,
                            remainingAmount: req.remaining_amount,
                            currency: req.currency || 'MRU',
                            paymentMethod: req.payment_method,
                            transactionId: req.transaction_id || req.transaction_reference,
                            transactionReference: req.transaction_reference,
                            beneficiaryName: req.beneficiary_name,
                            status: req.status,
                            verified: req.status === 'approved',
                            transactionAt: req.transaction_at || req.uploaded_at || req.created_at,
                            startsAt: req.starts_at,
                            expiresAt: req.expires_at,
                            verifyUrl: req.verify_url,
                          };
                          return (
                            <>
                              <button
                                type="button"
                                onClick={() => void printStudentReceipt(printableReq, lang)}
                                className="imgsend2-secondary !py-1 !px-2 text-[11px]"
                                title={tr(lang, 'طباعة', 'Imprimer', 'Print')}
                              >
                                <Printer className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => void downloadStudentReceiptPdf(printableReq, lang)}
                                className="imgsend2-secondary !py-1 !px-2 text-[11px]"
                                title="PDF"
                              >
                                <FileText className="w-3 h-3" />
                                <span>PDF</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => void downloadStudentReceiptJpg(printableReq, lang)}
                                className="imgsend2-secondary !py-1 !px-2 text-[11px]"
                                title="JPG 300 DPI"
                              >
                                <ImageIcon className="w-3 h-3" />
                                <span>JPG</span>
                              </button>
                              {req.verify_sig && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    navigate('verify-receipt', {
                                      receiptId: req.subscription_request_id,
                                      receiptSig: req.verify_sig,
                                    })
                                  }
                                  className="imgsend2-secondary !py-1 !px-2 text-[11px]"
                                  title={tr(lang, 'التحقق عبر QR', 'Vérifier QR', 'Verify QR')}
                                >
                                  <QrCode className="w-3 h-3" />
                                </button>
                              )}
                            </>
                          );
                        })()}
                        {canTopUp && (
                          <button
                            type="button"
                            onClick={() => (isCompleting ? setCompletingReq(null) : openCompleteTopUpDrawer(req))}
                            className="imgsend2 text-[11px]"
                          >
                            {isCompleting
                              ? tr(lang, 'إغلاق', 'Fermer', 'Close')
                              : tr(lang, 'إكمال المبلغ', 'Compléter le montant', 'Complete Amount')}
                          </button>
                        )}
                        {(req.status === 'rejected' || req.status === 'expired') && (
                          <button
                            type="button"
                            onClick={() => {
                              setSubmittedRequest(null);
                              setCardReceipt(null);
                              setActiveStep(1);
                              window.scrollTo({ top: 0, behavior: 'smooth' });
                            }}
                            className="imgsend2 text-[11px]"
                          >
                            {tr(lang, 'تقديم طلب جديد', 'Nouvelle demande', 'Submit New Request')}
                          </button>
                        )}
                      </div>
                    </div>

                    {isCompleting && (
                      <div className="border-t border-[#e4e9ec] pt-3 space-y-3 bg-[#f7f9fa] p-3 rounded-[4px]">
                        <div className="font-bold text-[#384D55]">
                          {tr(
                            lang,
                            `رفع الإيصال التكميلي للطلب ${req.subscription_request_id} (المتبقي: ${Number(req.remaining_amount ?? req.amount).toLocaleString()} ${req.currency})`,
                            `Complément pour ${req.subscription_request_id} (Reste : ${Number(req.remaining_amount ?? req.amount).toLocaleString()} ${req.currency})`,
                            `Upload complementary receipt for ${req.subscription_request_id} (Remaining: ${Number(req.remaining_amount ?? req.amount).toLocaleString()} ${req.currency})`
                          )}
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block font-semibold mb-1 text-[11px]">
                              {tr(lang, 'وسيلة التحويل التكميلي', 'Moyen de paiement', 'Method')}
                            </label>
                            <select
                              value={completeMethod}
                              onChange={(e) => {
                                setCompleteMethod(e.target.value as 'sedad' | 'masrvi' | 'bankily');
                                setCompleteInspection(null);
                              }}
                              className="template-input text-xs"
                            >
                              {availableLocalMethods.map((m) => (
                                <option key={m.code} value={m.code}>
                                  {lang === 'ar' ? m.name_ar : m.name_fr}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block font-semibold mb-1 text-[11px]">
                              {tr(lang, 'رقم هاتف المرسل', 'Téléphone émetteur', 'Sender Phone')}
                            </label>
                            <input
                              type="tel"
                              dir="ltr"
                              value={completePhone}
                              onChange={(e) => setCompletePhone(e.target.value.replace(/[^0-9+\s]/g, ''))}
                              placeholder="22XXXXXX"
                              className="template-input text-xs"
                            />
                          </div>
                        </div>

                        <label className="flex items-center justify-between gap-2 p-2.5 rounded border border-dashed border-[#83a329] bg-white cursor-pointer">
                          <span className="flex items-center gap-2 font-bold text-[#384D55]">
                            <Upload className="w-4 h-4 text-[#557a16]" />
                            <span>
                              {completeFileName || tr(lang, 'رفع صورة الوصل التكميلي', 'Téléverser le reçu complémentaire', 'Upload top-up receipt')}
                            </span>
                          </span>
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            onChange={(e) => void handleCompleteReceiptUpload(e)}
                            className="sr-only"
                          />
                        </label>

                        {completeInspecting && (
                          <div className="flex items-center gap-2 text-xs font-bold text-[#384D55]">
                            <Loader2 className="w-4 h-4 animate-spin text-[#557a16]" />
                            <span>{tr(lang, 'جارٍ فحص الوصل التكميلي...', 'Vérification en cours...', 'Inspecting receipt...')}</span>
                          </div>
                        )}
                        {completeError && (
                          <div className="p-2 rounded bg-red-50 border border-red-200 text-red-700 font-bold text-[11px]">
                            {completeError}
                          </div>
                        )}
                        {completeInspection && completeInspection.verdict !== 'rejected' && (
                          <div className="p-2 rounded bg-[#e2efbf] text-[#456810] font-bold text-[11px] flex items-center justify-between gap-2 flex-wrap">
                            <span>
                              {tr(
                                lang,
                                `تم قراءة المبلغ: ${completeInspection.extracted.amount ?? 0} ${completeInspection.extracted.currency || 'MRU'}`,
                                `Montant extrait : ${completeInspection.extracted.amount ?? 0} MRU`,
                                `Extracted: ${completeInspection.extracted.amount ?? 0} MRU`
                              )}
                            </span>
                            <button
                              type="button"
                              disabled={completeSubmitting}
                              onClick={() => void handleSubmitCompleteTopUp()}
                              className="imgsend2 !py-1.5 !px-3 text-[11px]"
                            >
                              {completeSubmitting ? t.loading : tr(lang, 'تأكيد إرسال الدفعة التكميلية', 'Confirmer le complément', 'Confirm Top-Up')}
                            </button>
                          </div>
                        )}
                        {completeProofUrl && (
                          <img src={completeProofUrl} alt="Top-up proof" className="max-h-28 rounded border border-[#d8dfe2]" />
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
