import React, { useEffect, useState } from 'react';
import {
  Check,
  CheckCircle2,
  Copy,
  CreditCard,
  Loader2,
  Lock,
  Sparkles,
  Upload,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { activateFreePlanInFirestore, submitSubscriptionRequestInFirestore } from '../../lib/firestoreService';
import type { ReceiptInspectionResult, SubscriptionPlan } from '../../types';
import { apiRequest, uploadJsonWithProgress } from '../../utils/api';
import { localeCode, tr } from '../../utils/locale';
import {
  loadMobilePaymentPrefs,
  OFFICIAL_MOBILE_PAYMENT_METHODS,
  PaymentMethodBadgeIcon,
  type MobilePaymentMethodId,
} from './MobilePaymentMethods';
import { MobileDarkSheet } from './MobilePrimitives';

export const MobilePaywallSheet: React.FC<{
  open: boolean;
  onClose: () => void;
  reason?: string;
  onViewSubscriptions: () => void;
}> = ({ open, onClose, reason, onViewSubscriptions }) => {
  const { lang } = useApp();
  return (
    <MobileDarkSheet
      open={open}
      onClose={onClose}
      icon={<Lock className="w-6 h-6" />}
      title={tr(lang, 'محتوى متاح للمشتركين', 'Contenu réservé aux abonnés', 'Subscribers Only')}
      description={
        reason ||
        tr(
          lang,
          'اشترك في إحدى باقات تدريبي لفتح جميع الدروس وبنك الأسئلة وامتحانات المحاكاة بلا قيود.',
          'Abonnez-vous pour débloquer toutes les leçons, QCM et examens sans limites.',
          'Subscribe to unlock all lessons, question bank, and mock exams.'
        )
      }
    >
      <div
        className="p-3.5 rounded-xl space-y-2 text-xs"
        style={{ background: 'var(--m-sheet-btn)', color: 'var(--m-sheet-ink)' }}
      >
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: '#a4cc39' }} />
          <span>{tr(lang, 'وصول غير محدود لجميع الدروس والملخصات', 'Accès illimité aux leçons', 'Unlimited lessons & summaries')}</span>
        </div>
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: '#a4cc39' }} />
          <span>{tr(lang, 'مركز المراجعة وبنك الأسئلة الكامل', 'Centre de révision & QCM complet', 'Full Question Bank & Review Center')}</span>
        </div>
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: '#a4cc39' }} />
          <span>{tr(lang, 'محاكاة الامتحانات الرسمية مع التصحيح /20', 'Examens blancs notés /20', 'Official Mock Exams graded /20')}</span>
        </div>
      </div>

      <button
        type="button"
        onClick={() => {
          onClose();
          onViewSubscriptions();
        }}
        className="tdr-m-sheet-btn tdr-m-sheet-btn--primary"
      >
        <Sparkles className="w-4 h-4" />
        <span>{tr(lang, 'عرض الباقات والاشتراك', 'Voir les offres', 'View Plans')}</span>
      </button>
      <button type="button" onClick={onClose} className="tdr-m-sheet-btn">
        {tr(lang, 'لاحقاً', 'Plus tard', 'Later')}
      </button>
    </MobileDarkSheet>
  );
};

export const MobileCheckoutSheet: React.FC<{
  open: boolean;
  plan: SubscriptionPlan | null;
  initialMethod?: MobilePaymentMethodId;
  onClose: () => void;
  onCompleted: (msg: string) => void;
}> = ({ open, plan, initialMethod, onClose, onCompleted }) => {
  const { lang, user, firebaseUser, paymentMethods: serverMethods, refreshUser } = useApp();
  const isAr = lang === 'ar';

  const [selectedMethod, setSelectedMethod] = useState<MobilePaymentMethodId>(() => {
    const prefs = loadMobilePaymentPrefs(user?.uid);
    return initialMethod || prefs.defaultMethod || 'sedad';
  });
  const [senderName, setSenderName] = useState(user?.name || '');
  const [senderPhone, setSenderPhone] = useState(user?.phone || '');
  const [uploadId, setUploadId] = useState('');
  const [proofDataUrl, setProofDataUrl] = useState('');
  const [inspection, setInspection] = useState<ReceiptInspectionResult | null>(null);
  const [proofName, setProofName] = useState('');
  const [busy, setBusy] = useState(false);
  const [stageMsg, setStageMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [nardoUrl, setNardoUrl] = useState<string | null>(null);
  const [nardoOrderId, setNardoOrderId] = useState<string | null>(null);
  const [successDone, setSuccessDone] = useState(false);
  const [copiedAcc, setCopiedAcc] = useState(false);

  useEffect(() => {
    if (!open) return;
    const prefs = loadMobilePaymentPrefs(user?.uid);
    const chosen = initialMethod || prefs.defaultMethod || 'sedad';
    setSelectedMethod(chosen);
    setSenderName(user?.name || '');
    const walletPhone =
      chosen === 'sedad' || chosen === 'masrvi' || chosen === 'bankily'
        ? prefs.walletPhones[chosen]
        : '';
    setSenderPhone(walletPhone || user?.phone || '');
    setUploadId('');
    setProofDataUrl('');
    setInspection(null);
    setProofName('');
    setStageMsg(null);
    setErrorMsg(null);
    setNardoUrl(null);
    setNardoOrderId(null);
    setSuccessDone(false);
  }, [open, initialMethod, user?.uid, user?.name, user?.phone]);

  // Poll NardoPay order if pending
  useEffect(() => {
    if (!open || !nardoOrderId) return;
    const iv = window.setInterval(async () => {
      const res = await apiRequest<{ status: string }>(
        `/api/payments/nardopay/status/${encodeURIComponent(nardoOrderId)}`
      ).catch(() => null);
      if (res?.status === 'completed') {
        window.clearInterval(iv);
        await refreshUser();
        setSuccessDone(true);
      }
    }, 3500);
    return () => window.clearInterval(iv);
  }, [open, nardoOrderId, refreshUser]);

  if (!plan) return null;

  const isLocalWallet =
    selectedMethod === 'sedad' || selectedMethod === 'masrvi' || selectedMethod === 'bankily';
  const srvMethod = serverMethods.find((m) => m.code.toLowerCase() === selectedMethod);

  const handleActivateFree = async () => {
    if (!user) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      await apiRequest('/api/payments/activate-free', {
        method: 'POST',
        json: { planId: plan.id },
      });
      if (firebaseUser?.emailVerified && plan.firestoreId) {
        await activateFreePlanInFirestore(user.uid, plan).catch(() => {});
      }
      await refreshUser();
      setSuccessDone(true);
    } catch (err: any) {
      setErrorMsg(err?.message || tr(lang, 'تعذر تفعيل الباقة.', 'Activation impossible.', 'Activation failed.'));
    } finally {
      setBusy(false);
    }
  };

  const handleReceiptPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!/^image\/(png|jpeg|jpg|webp)$/i.test(file.type)) {
      setErrorMsg(tr(lang, 'اختر صورة PNG أو JPG أو WebP.', 'Image PNG/JPG/WebP requise.', 'Select PNG/JPG/WebP image.'));
      return;
    }
    setBusy(true);
    setErrorMsg(null);
    setInspection(null);
    setProofName(file.name);
    try {
      setStageMsg(tr(lang, 'جارٍ رفع الإيصال...', 'Téléversement...', 'Uploading receipt...'));
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result || ''));
        fr.onerror = () => reject(new Error('Read error'));
        fr.readAsDataURL(file);
      });
      setProofDataUrl(dataUrl);
      const up = await uploadJsonWithProgress<{ ok: boolean; uploadId: string }>(
        '/api/payment-requests/upload',
        { proofDataUrl: dataUrl, fileName: file.name, mimeType: file.type },
        { timeoutMs: 25000 }
      );
      if (!up?.ok || !up.uploadId) throw new Error('Upload failed');
      setUploadId(up.uploadId);

      setStageMsg(tr(lang, 'جارٍ التحقق الآلي من الإيصال...', 'Vérification automatique...', 'Inspecting receipt...'));
      const inspRes = await apiRequest<{ inspection: ReceiptInspectionResult }>(
        '/api/payment-requests/inspect',
        {
          method: 'POST',
          json: {
            uploadId: up.uploadId,
            planId: plan.id,
            planSlug: plan.slug,
            paymentMethod: selectedMethod,
            senderPhone: senderPhone.trim(),
          },
          timeoutMs: 26000,
        }
      );
      setInspection(inspRes.inspection);
      const verdict = inspRes.inspection.verdict || inspRes.inspection.status;
      if (verdict !== 'verified' && verdict !== 'underpaid' && verdict !== 'manual_review') {
        setErrorMsg(inspRes.inspection.reason || tr(lang, 'الإيصال غير مقبول.', 'Reçu rejeté.', 'Receipt rejected.'));
      }
    } catch (err: any) {
      setErrorMsg(err?.message || tr(lang, 'تعذر فحص الإيصال.', 'Erreur d’inspection.', 'Inspection failed.'));
    } finally {
      setStageMsg(null);
      setBusy(false);
    }
  };

  const handleSubmitLocalRequest = async () => {
    if (!user || !inspection) return;
    if (senderName.trim().length < 2) {
      setErrorMsg(tr(lang, 'أدخل الاسم الكامل.', 'Nom complet requis.', 'Full name required.'));
      return;
    }
    if (senderPhone.replace(/\D/g, '').length < 8) {
      setErrorMsg(tr(lang, 'أدخل رقم الهاتف المرسل (8 أرقام على الأقل).', 'Téléphone invalide.', 'Valid phone required.'));
      return;
    }
    setBusy(true);
    setErrorMsg(null);
    try {
      const res = await apiRequest<{
        ok: boolean;
        status?: string;
        subscriptionRequestId?: string;
        proofHash?: string;
      }>('/api/payment-requests', {
        method: 'POST',
        json: {
          planId: plan.id,
          planSlug: plan.slug,
          paymentMethod: selectedMethod,
          fullName: senderName.trim(),
          senderPhone: senderPhone.trim(),
          inspectionId: inspection.inspectionId,
        },
      });
      await submitSubscriptionRequestInFirestore({
        uid: user.uid,
        userEmail: user.email,
        userName: senderName.trim() || user.name,
        subscriptionRequestId: res?.subscriptionRequestId || uploadId,
        planId: plan.firestoreId || String(plan.id),
        planSlug: plan.slug,
        planName: isAr ? plan.name_ar : plan.name_fr,
        amount: plan.price_mru,
        currency: 'MRU',
        paymentMethod: selectedMethod,
        transactionId: inspection.extracted?.transactionId || uploadId,
        transactionReference: inspection.extracted?.transactionReference || '',
        transactionAt: inspection.extracted?.transactionAt || new Date().toISOString(),
        beneficiaryName: inspection.extracted?.beneficiaryName || '',
        proofHash: res?.proofHash || '',
        proofDataUrl,
        uploadedAt: new Date().toISOString(),
      }).catch(() => {});
      await refreshUser();
      setSuccessDone(true);
      if (res?.status === 'approved') {
        onCompleted(tr(lang, 'تم تفعيل اشتراكك فوراً!', 'Abonnement activé !', 'Subscription activated!'));
      }
    } catch (err: any) {
      setErrorMsg(err?.message || tr(lang, 'تعذر إرسال طلب الاشتراك.', 'Échec d’envoi.', 'Submit failed.'));
    } finally {
      setBusy(false);
    }
  };

  const handleNardoPayCheckout = async () => {
    setBusy(true);
    setErrorMsg(null);
    try {
      const res = await apiRequest<{ checkoutUrl?: string; orderId?: string }>(
        '/api/payments/nardopay/create',
        {
          method: 'POST',
          json: {
            planId: plan.id,
            planSlug: plan.slug,
            preferredMethod: 'card',
          },
        }
      );
      if (res.orderId) setNardoOrderId(res.orderId);
      if (res.checkoutUrl) {
        setNardoUrl(res.checkoutUrl);
        window.location.href = res.checkoutUrl;
      } else {
        setErrorMsg(
          tr(
            lang,
            'بوابة NardoPay غير متصلة حالياً (مفتاح الخدمة غير مضبوط). يمكنك استخدام الدفع المحلي بالسداد أو مصرفي أو بنكيلي.',
            'Passerelle NardoPay non configurée. Utilisez Sedad, Masrvi ou Bankily.',
            'NardoPay gateway unavailable. Use local transfer methods.'
          )
        );
      }
    } catch (err: any) {
      setErrorMsg(
        err?.message ||
          tr(
            lang,
            'بوابة الدفع الإلكتروني بالبطاقة غير مفعلة حالياً.',
            'Paiement par carte indisponible.',
            'Card checkout unavailable.'
          )
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <MobileDarkSheet
      open={open}
      onClose={onClose}
      icon={successDone ? undefined : <CreditCard className="w-6 h-6" />}
      title={
        successDone
          ? tr(lang, 'تمت العملية بنجاح', 'Opération réussie', 'Completed')
          : isAr
            ? plan.name_ar
            : plan.name_fr || plan.name_ar
      }
      description={
        successDone
          ? undefined
          : `${tr(lang, 'المبلغ المطلوب:', 'Montant :', 'Total:')} ${
              plan.price_mru === 0 ? tr(lang, 'مجاني', 'Gratuit', 'Free') : `${plan.price_mru} MRU`
            }`
      }
    >
      {successDone ? (
        <div className="text-center space-y-3 py-2">
          <svg className="tdr-m-okc" viewBox="0 0 64 64">
            <circle cx="32" cy="32" r="28" />
            <path d="M20 33l9 9 16-18" />
          </svg>
          <p className="text-xs leading-relaxed" style={{ color: 'var(--m-sheet-sub)' }}>
            {tr(
              lang,
              'تم تسجيل طلب الاشتراك وتحديث حالة حسابك بنجاح.',
              'Votre demande d’abonnement a été enregistrée.',
              'Your subscription request has been processed.'
            )}
          </p>
          <button
            type="button"
            onClick={() => {
              onClose();
              onCompleted(tr(lang, 'تم تحديث حالة الاشتراك.', 'Abonnement mis à jour.', 'Subscription updated.'));
            }}
            className="tdr-m-sheet-btn tdr-m-sheet-btn--primary"
          >
            {tr(lang, 'تم', 'Terminé', 'Done')}
          </button>
        </div>
      ) : plan.price_mru === 0 ? (
        <div className="space-y-3">
          {errorMsg && (
            <div className="p-2.5 rounded-xl text-xs font-bold text-center" style={{ background: 'rgba(184,0,0,0.2)', color: '#ffb3b3' }}>
              {errorMsg}
            </div>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleActivateFree()}
            className="tdr-m-sheet-btn tdr-m-sheet-btn--primary"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            <span>{tr(lang, 'تفعيل الباقة المجانية', 'Activer la formule gratuite', 'Activate Free Plan')}</span>
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Method Selector */}
          <div className="grid grid-cols-5 gap-1.5">
            {OFFICIAL_MOBILE_PAYMENT_METHODS.map((m) => {
              const active = selectedMethod === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    setSelectedMethod(m.id);
                    setErrorMsg(null);
                  }}
                  className="min-h-[48px] rounded-xl flex flex-col items-center justify-center gap-1 p-1 border cursor-pointer"
                  style={
                    active
                      ? { background: '#a4cc39', color: '#1c2a0e', borderColor: '#7c9e1c' }
                      : { background: 'var(--m-sheet-btn)', color: 'var(--m-sheet-ink)', borderColor: 'rgba(227,234,219,0.12)' }
                  }
                >
                  <PaymentMethodBadgeIcon method={m.id} />
                  <span className="text-[10px] font-extrabold truncate max-w-full">
                    {m.id === 'sedad'
                      ? 'السداد'
                      : m.id === 'masrvi'
                        ? 'مصرفي'
                        : m.id === 'bankily'
                          ? 'بنكيلي'
                          : m.id === 'visa'
                            ? 'Visa'
                            : 'Master'}
                  </span>
                </button>
              );
            })}
          </div>

          {errorMsg && (
            <div className="p-2.5 rounded-xl text-xs font-bold text-center" style={{ background: 'rgba(184,0,0,0.22)', color: '#ffb3b3' }}>
              {errorMsg}
            </div>
          )}

          {isLocalWallet ? (
            <div className="space-y-2.5">
              {srvMethod?.account_number && (
                <div
                  className="p-3 rounded-xl flex items-center justify-between gap-2 text-xs"
                  style={{ background: 'var(--m-sheet-btn)' }}
                >
                  <div>
                    <div className="opacity-75">
                      {tr(lang, 'حوّل إلى الحساب الرسمي:', 'Compte de transfert :', 'Transfer to:')}
                    </div>
                    <div className="font-extrabold text-sm tabular-nums" dir="ltr">
                      {srvMethod.account_number}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText(srvMethod.account_number || '').catch(() => {});
                      setCopiedAcc(true);
                      window.setTimeout(() => setCopiedAcc(false), 1800);
                    }}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer"
                    style={{ background: 'rgba(164, 204, 57, 0.2)', color: '#a4cc39' }}
                  >
                    {copiedAcc ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedAcc ? tr(lang, 'نُسخ', 'Copié', 'Copied') : tr(lang, 'نسخ', 'Copier', 'Copy')}</span>
                  </button>
                </div>
              )}

              <input
                type="text"
                className="tdr-m-sheet-input"
                placeholder={tr(lang, 'الاسم الكامل للمرسل', 'Nom complet', 'Full name')}
                value={senderName}
                onChange={(e) => setSenderName(e.target.value)}
              />
              <input
                type="tel"
                dir="ltr"
                className="tdr-m-sheet-input"
                placeholder={tr(lang, 'رقم الهاتف الذي حُوّل منه', 'Téléphone émetteur', 'Sender phone')}
                value={senderPhone}
                onChange={(e) => setSenderPhone(e.target.value)}
              />

              <label
                className="tdr-m-sheet-btn cursor-pointer"
                style={{ borderStyle: 'dashed', borderColor: 'rgba(164, 204, 57, 0.45)' }}
              >
                <Upload className="w-4 h-4" style={{ color: '#a4cc39' }} />
                <span className="text-xs truncate">
                  {stageMsg ||
                    proofName ||
                    tr(lang, 'إرفاق صورة إيصال التحويل', 'Joindre la capture du reçu', 'Upload Transfer Receipt')}
                </span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={handleReceiptPick}
                />
              </label>

              {inspection && (
                <div
                  className="p-2.5 rounded-xl text-xs font-bold"
                  style={{ background: 'rgba(164, 204, 57, 0.16)', color: '#d7ebaa' }}
                >
                  {inspection.verdict === 'verified'
                    ? tr(lang, '✓ تم التحقق من الإيصال آلياً بنجاح', '✓ Reçu vérifié', '✓ Receipt verified')
                    : inspection.reason}
                </div>
              )}

              <button
                type="button"
                disabled={busy || !inspection}
                onClick={() => void handleSubmitLocalRequest()}
                className="tdr-m-sheet-btn tdr-m-sheet-btn--primary disabled:opacity-50"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                <span>{tr(lang, 'تأكيد وإرسال طلب الاشتراك', 'Confirmer et envoyer', 'Confirm & Submit')}</span>
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs leading-relaxed" style={{ color: 'var(--m-sheet-sub)' }}>
                {tr(
                  lang,
                  'سيتم تحويلك إلى صفحة الدفع الآمنة لبوابة NardoPay لإدخال بيانات بطاقة Visa أو Mastercard بشكل مشفر.',
                  'Vous serez redirigé vers la page sécurisée NardoPay pour régler par carte.',
                  'You will be redirected to hosted NardoPay checkout to complete your card payment securely.'
                )}
              </p>
              {nardoUrl && (
                <a
                  href={nardoUrl}
                  className="tdr-m-sheet-btn"
                  style={{ color: '#a4cc39' }}
                >
                  {tr(lang, 'فتح صفحة الدفع', 'Ouvrir le paiement', 'Open Payment Page')}
                </a>
              )}
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleNardoPayCheckout()}
                className="tdr-m-sheet-btn tdr-m-sheet-btn--primary"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
                <span>
                  {tr(lang, 'متابعة الدفع عبر NardoPay', 'Payer via NardoPay', 'Pay with NardoPay')}
                </span>
              </button>
            </div>
          )}
        </div>
      )}
    </MobileDarkSheet>
  );
};

export const MobileSubscriptionsView: React.FC<{
  preselectedMethod?: MobilePaymentMethodId;
  onNotice: (text: string, ok?: boolean) => void;
}> = ({ preselectedMethod, onNotice }) => {
  const { lang, user, plans } = useApp();
  const isAr = lang === 'ar';

  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan | null>(() => {
    const paid = plans.filter((p) => p.price_mru > 0);
    return paid.find((p) => p.slug?.includes('full') || p.billing_cycle === 'annual') || paid[0] || plans[0] || null;
  });
  const [checkoutPlan, setCheckoutPlan] = useState<SubscriptionPlan | null>(null);

  useEffect(() => {
    if (!selectedPlan && plans.length > 0) {
      const paid = plans.filter((p) => p.price_mru > 0);
      setSelectedPlan(paid[0] || plans[0]);
    }
  }, [plans, selectedPlan]);

  const activeSub = user?.activeSubscription;
  const hasPaidActive = Boolean(activeSub && activeSub.billing_cycle !== 'free');

  return (
    <div className="space-y-4 pb-20">
      {/* Current Subscription Card */}
      <div className="tdr-m-hero-card space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="tdr-m-brand-pill">
            {hasPaidActive
              ? tr(lang, 'اشتراك نشط', 'Abonnement actif', 'Active Subscription')
              : tr(lang, 'لا توجد باقة مدفوعة مفعلة', 'Formule gratuite', 'Free Plan')}
          </span>
          <Sparkles className="w-5 h-5 opacity-80" />
        </div>
        <h2 className="text-lg font-extrabold tdr-m-kufi pt-1">
          {activeSub
            ? isAr
              ? activeSub.name_ar
              : activeSub.name_fr || activeSub.name_ar
            : tr(lang, 'الباقة المجانية الأساسية', 'Offre gratuite', 'Basic Free Access')}
        </h2>
        <p className="text-xs opacity-90">
          {activeSub?.expires_at
            ? `${tr(lang, 'صالح حتى:', 'Valide jusqu’au :', 'Valid until:')} ${new Date(
                activeSub.expires_at
              ).toLocaleDateString(localeCode(lang))}`
            : tr(
                lang,
                'اختر باقة كاملة لفتح الدروس وبنك الأسئلة وامتحانات المحاكاة بلا حدود.',
                'Choisissez une offre pour un accès illimité.',
                'Choose a plan to unlock unlimited access.'
              )}
        </p>
      </div>

      {/* Plan Cards */}
      <div className="space-y-3">
        {plans.map((p) => {
          const isCurrent = activeSub?.plan_id === p.id;
          const isSelected = selectedPlan?.id === p.id;
          const isRecommended = p.price_mru > 0 && (p.billing_cycle === 'annual' || p.slug?.includes('full'));
          const features = isAr ? p.features_ar : p.features_fr || p.features_ar;

          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setSelectedPlan(p)}
              className="tdr-m-card w-full p-4 space-y-3 text-start cursor-pointer transition-all"
              style={{
                borderColor: isSelected ? 'var(--m-brand-d)' : isRecommended ? 'var(--m-brand)' : 'var(--m-border)',
                borderWidth: isSelected || isRecommended ? '2px' : '1px',
                background: isSelected ? 'var(--m-brand-tint)' : 'var(--m-surface)',
              }}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-base font-extrabold tdr-m-kufi">
                      {isAr ? p.name_ar : p.name_fr || p.name_ar}
                    </span>
                    {isRecommended && (
                      <span
                        className="px-2 py-0.5 rounded-full text-[10px] font-extrabold"
                        style={{ background: 'var(--m-brand)', color: 'var(--m-btn-ink)' }}
                      >
                        {tr(lang, 'موصى بها', 'Recommandée', 'Recommended')}
                      </span>
                    )}
                    {isCurrent && (
                      <span
                        className="px-2 py-0.5 rounded-full text-[10px] font-extrabold"
                        style={{ background: 'var(--m-ok-soft)', color: 'var(--m-ok)' }}
                      >
                        {tr(lang, 'حالية', 'Actuelle', 'Current')}
                      </span>
                    )}
                  </div>
                  <div className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--m-ink-sub)' }}>
                    {isAr ? p.description_ar : p.description_fr || p.description_ar}
                  </div>
                </div>
                <div className="text-end shrink-0">
                  <div className="text-lg font-extrabold tabular-nums" style={{ color: 'var(--m-brand-deep)' }}>
                    {p.price_mru === 0 ? tr(lang, 'مجاني', 'Gratuit', 'Free') : `${p.price_mru} MRU`}
                  </div>
                </div>
              </div>

              {Array.isArray(features) && features.length > 0 && (
                <ul className="space-y-1.5 text-xs" style={{ color: 'var(--m-ink-sub)' }}>
                  {features.slice(0, 4).map((f, idx) => (
                    <li key={idx} className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: 'var(--m-brand-d)' }} />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              )}
            </button>
          );
        })}
      </div>

      {/* Sticky Subscribe CTA fixed above Floating Bottom Nav */}
      {selectedPlan && (
        <div className="tdr-m-sticky-cta">
          <button
            type="button"
            disabled={activeSub?.plan_id === selectedPlan.id}
            onClick={() => setCheckoutPlan(selectedPlan)}
            className="tdr-m-btn-primary"
          >
            <CreditCard className="w-4 h-4" />
            <span>
              {activeSub?.plan_id === selectedPlan.id
                ? tr(lang, 'هذه باقتك الحالية', 'Formule actuelle', 'Current Plan')
                : `${tr(lang, 'اشترك الآن', 'S’abonner', 'Subscribe Now')} — ${
                    selectedPlan.price_mru === 0
                      ? tr(lang, 'مجاني', 'Gratuit', 'Free')
                      : `${selectedPlan.price_mru} MRU`
                  }`}
            </span>
          </button>
        </div>
      )}

      <MobileCheckoutSheet
        open={Boolean(checkoutPlan)}
        plan={checkoutPlan}
        initialMethod={preselectedMethod}
        onClose={() => setCheckoutPlan(null)}
        onCompleted={(msg) => onNotice(msg, true)}
      />
    </div>
  );
};
