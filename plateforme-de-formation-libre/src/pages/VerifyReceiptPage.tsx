import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  Image as ImageIcon,
  Lock,
  Printer,
  QrCode,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import QRCode from 'qrcode';
import { useApp } from '../context/AppContext';
import { apiRequest } from '../utils/api';
import { localeCode, tr } from '../utils/locale';
import {
  downloadStudentReceiptJpg,
  downloadStudentReceiptPdf,
  getCanonicalReceiptVerifyUrl,
  printStudentReceipt,
  type PrintableReceiptData,
} from '../utils/receiptDocument';

interface VerifyApiResponse {
  valid: boolean;
  kind: 'local_request' | 'card_tx';
  verified: boolean;
  receipt: {
    rid: string;
    status: string;
    studentName: string;
    studentEmail: string;
    planName: string;
    amount: number;
    paidAmount: number;
    remainingAmount: number;
    currency: string;
    paymentMethod: string;
    cardBrand?: string;
    cardLast4?: string;
    beneficiaryName?: string;
    transactionId?: string;
    transactionReference?: string;
    transactionAt: string;
    approvedAt?: string | null;
    startsAt?: string | null;
    expiresAt?: string | null;
    createdAt?: string | null;
    verifySig: string;
    verifyUrl: string;
  };
}

export const VerifyReceiptPage: React.FC = () => {
  const { lang, user, authReady, viewParams, navigate } = useApp();
  const isAr = lang === 'ar';

  const sp =
    typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const rid = (viewParams.receiptId || sp?.get('rid') || '').trim();
  const sig = (viewParams.receiptSig || sp?.get('sig') || '').trim();

  const [loading, setLoading] = useState(true);
  const [requiresAuth, setRequiresAuth] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<VerifyApiResponse | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [exportBusy, setExportBusy] = useState<'pdf' | 'jpg' | 'print' | null>(null);

  const loadVerification = useCallback(async () => {
    if (!rid || !sig) {
      setLoading(false);
      setRequiresAuth(false);
      setError(
        tr(
          lang,
          'رابط التحقق غير مكتمل (رقم الإيصال أو التوقيع مفقود).',
          'Lien de vérification incomplet (référence ou signature manquante).',
          'Incomplete receipt verification link (missing receipt ID or signature).'
        )
      );
      return;
    }

    setLoading(true);
    setError(null);
    setRequiresAuth(false);
    try {
      const res = await apiRequest<VerifyApiResponse>(
        `/api/receipts/verify?rid=${encodeURIComponent(rid)}&sig=${encodeURIComponent(sig)}`
      );
      setData(res);
      const url = res.receipt.verifyUrl || getCanonicalReceiptVerifyUrl({ rid: res.receipt.rid, verifyUrl: res.receipt.verifyUrl });
      const qr = await QRCode.toDataURL(url, {
        width: 240,
        margin: 1,
        errorCorrectionLevel: 'M',
        color: { dark: '#1c2a0e', light: '#ffffff' },
      }).catch(() => '');
      setQrDataUrl(qr);
    } catch (err: any) {
      setData(null);
      if (err?.status === 401 || err?.data?.code === 'AUTH_REQUIRED') {
        setRequiresAuth(true);
        setError(
          err?.message ||
            tr(
              lang,
              'يرجى تسجيل الدخول بحسابك لعرض تفاصيل الإيصال والتحقق من صلاحيته.',
              'Veuillez vous connecter pour consulter et vérifier ce reçu officiel.',
              'Please sign in to your account to view and verify this official receipt.'
            )
        );
      } else {
        setError(
          err?.message ||
            tr(
              lang,
              'تعذر التحقق من الإيصال أو أن التوقيع الرقمي غير صالح.',
              'Impossible de vérifier ce reçu ou signature invalide.',
              'Unable to verify receipt or signature is invalid.'
            )
        );
      }
    } finally {
      setLoading(false);
    }
  }, [lang, rid, sig]);

  useEffect(() => {
    if (!authReady) return;
    void loadVerification();
  }, [authReady, user?.uid, loadVerification]);

  const toPrintable = (res: VerifyApiResponse): PrintableReceiptData => ({
    rid: res.receipt.rid,
    kind: res.kind,
    studentName: res.receipt.studentName,
    studentEmail: res.receipt.studentEmail,
    planName: res.receipt.planName,
    amount: res.receipt.amount,
    paidAmount: res.receipt.paidAmount,
    remainingAmount: res.receipt.remainingAmount,
    currency: res.receipt.currency || 'MRU',
    paymentMethod: res.receipt.paymentMethod,
    cardBrand: res.receipt.cardBrand,
    cardLast4: res.receipt.cardLast4,
    transactionId: res.receipt.transactionId || res.receipt.rid,
    transactionReference: res.receipt.transactionReference,
    beneficiaryName: res.receipt.beneficiaryName,
    status: res.receipt.status,
    verified: res.verified,
    transactionAt: res.receipt.transactionAt || res.receipt.createdAt || new Date().toISOString(),
    startsAt: res.receipt.startsAt,
    expiresAt: res.receipt.expiresAt,
    verifyUrl: res.receipt.verifyUrl,
  });

  const handleExport = async (mode: 'pdf' | 'jpg' | 'print') => {
    if (!data) return;
    setExportBusy(mode);
    try {
      const printable = toPrintable(data);
      if (mode === 'pdf') await downloadStudentReceiptPdf(printable, lang);
      else if (mode === 'jpg') await downloadStudentReceiptJpg(printable, lang);
      else await printStudentReceipt(printable, lang);
    } finally {
      setExportBusy(null);
    }
  };

  const renderStatus = (status: string, verified: boolean) => {
    if (verified || status === 'approved' || status === 'succeeded') {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-[4px] bg-[#e2efbf] border border-[#A6CE39] text-[#2c4a12] text-xs font-extrabold">
          <CheckCircle2 className="w-4 h-4 text-[#557a16]" />
          {tr(lang, 'إيصال أصلي ومعتمد', 'Reçu authentique & validé', 'Authentic & Verified Receipt')}
        </span>
      );
    }
    if (status === 'rejected' || status === 'failed' || status === 'expired') {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-[4px] bg-red-50 border border-red-200 text-red-700 text-xs font-extrabold">
          <XCircle className="w-4 h-4" />
          {tr(lang, 'مرفوض / غير مفعل', 'Refusé / Inactif', 'Rejected / Inactive')}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-[4px] bg-amber-50 border border-amber-300 text-amber-900 text-xs font-extrabold">
        <Clock className="w-4 h-4" />
        {tr(lang, 'مسجل وقيد المراجعة', 'Enregistré — En attente', 'Recorded — Pending Review')}
      </span>
    );
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-5">
      <div className="addressp-box-white space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#d8dfe2]">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-full bg-[#e2efbf] flex items-center justify-center shrink-0">
              <QrCode className="w-5 h-5 text-[#557a16]" />
            </div>
            <div>
              <h1 className="text-lg font-extrabold text-[#384D55]">
                {tr(
                  lang,
                  'التحقق الرسمي من إيصال الدفع',
                  'Vérification officielle du reçu',
                  'Official Receipt Verification'
                )}
              </h1>
              <p className="text-xs text-[#6b787e]" dir="ltr">
                https://tadribi.chtbqi.com/verify-receipt
              </p>
            </div>
          </div>

          {rid && (
            <span
              className="px-3 py-1 rounded bg-[#f7f9fa] border border-[#d8dfe2] text-xs font-mono font-bold text-[#384D55]"
              dir="ltr"
            >
              {rid}
            </span>
          )}
        </div>

        {loading && (
          <div className="py-10 text-center text-xs font-bold text-[#6b787e]">
            {tr(
              lang,
              'جارٍ التحقق من التوقيع الرقمي وسجل الإيصال...',
              'Vérification de la signature numérique en cours...',
              'Verifying digital signature and receipt record...'
            )}
          </div>
        )}

        {!loading && requiresAuth && (
          <div className="p-6 rounded-[6px] bg-[#f9fcf2] border border-[#A6CE39] text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-white border border-[#A6CE39] flex items-center justify-center mx-auto">
              <Lock className="w-6 h-6 text-[#557a16]" />
            </div>
            <div className="space-y-1.5">
              <h2 className="text-base font-extrabold text-[#384D55]">
                {tr(
                  lang,
                  'يرجى تسجيل الدخول لعرض الإيصال المحمي',
                  'Connexion requise pour afficher le reçu',
                  'Sign In Required to View Protected Receipt'
                )}
              </h2>
              <p className="text-xs text-[#5c686e] max-w-md mx-auto leading-relaxed">
                {error}
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={() =>
                  navigate('login', {
                    redirectView: 'verify-receipt',
                    receiptId: rid,
                    receiptSig: sig,
                  })
                }
                className="imgsend2 text-xs"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>{tr(lang, 'تسجيل الدخول للتحقق', 'Se connecter pour vérifier', 'Sign In to Verify')}</span>
              </button>
              <button
                type="button"
                onClick={() => navigate('home')}
                className="imgsend2-secondary text-xs"
              >
                {tr(lang, 'العودة للرئيسية', 'Accueil', 'Home')}
              </button>
            </div>
          </div>
        )}

        {!loading && !requiresAuth && error && (
          <div className="p-5 rounded-[6px] bg-red-50 border border-red-200 text-red-800 space-y-3">
            <div className="flex items-center gap-2 font-extrabold text-sm">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span>
                {tr(lang, 'فشل التحقق من الإيصال', 'Échec de la vérification', 'Receipt Verification Failed')}
              </span>
            </div>
            <p className="text-xs leading-relaxed">{error}</p>
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                onClick={() => navigate('subscriptions')}
                className="imgsend2-secondary text-xs"
              >
                {tr(lang, 'الباقات والاشتراكات', 'Abonnements', 'Subscriptions')}
              </button>
            </div>
          </div>
        )}

        {!loading && data && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-[6px] bg-[#f7f9fa] border border-[#d8dfe2]">
              <div className="space-y-0.5 text-xs">
                <div className="text-[#6b787e]">
                  {tr(lang, 'نتيجة الفحص الرقمي:', 'Statut de vérification :', 'Verification Result:')}
                </div>
                <div className="font-bold text-[#384D55]">
                  {isAr
                    ? 'تم تطابق التوقيع الرقمي للإيصال مع سجلات منصة تدريبي بنجاح.'
                    : 'Signature numérique conforme aux registres officiels Tadribi.'}
                </div>
              </div>
              {renderStatus(data.receipt.status, data.verified)}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
              <div className="md:col-span-8 overflow-x-auto">
                <table className="w-full text-xs border-collapse border border-[#d8dfe2]">
                  <tbody>
                    <tr className="border-b border-[#e4e9ec]">
                      <th className="p-2.5 bg-[#f7f9fa] text-start font-bold text-[#384D55] w-40">
                        {tr(lang, 'رقم الإيصال', 'N° Reçu', 'Receipt ID')}
                      </th>
                      <td className="p-2.5 font-mono font-bold text-[#384D55]" dir="ltr">
                        {data.receipt.rid}
                      </td>
                    </tr>
                    <tr className="border-b border-[#e4e9ec]">
                      <th className="p-2.5 bg-[#f7f9fa] text-start font-bold text-[#384D55]">
                        {tr(lang, 'اسم الطالب', 'Étudiant', 'Student')}
                      </th>
                      <td className="p-2.5 font-bold text-[#384D55]">
                        {data.receipt.studentName || '—'}
                      </td>
                    </tr>
                    <tr className="border-b border-[#e4e9ec]">
                      <th className="p-2.5 bg-[#f7f9fa] text-start font-bold text-[#384D55]">
                        {tr(lang, 'البريد الإلكتروني', 'E-mail', 'Email')}
                      </th>
                      <td className="p-2.5 text-[#5c686e]" dir="ltr">
                        {data.receipt.studentEmail || '—'}
                      </td>
                    </tr>
                    <tr className="border-b border-[#e4e9ec]">
                      <th className="p-2.5 bg-[#f7f9fa] text-start font-bold text-[#384D55]">
                        {tr(lang, 'الباقة', 'Formule', 'Plan')}
                      </th>
                      <td className="p-2.5 font-bold text-[#384D55]">{data.receipt.planName}</td>
                    </tr>
                    <tr className="border-b border-[#e4e9ec]">
                      <th className="p-2.5 bg-[#f7f9fa] text-start font-bold text-[#384D55]">
                        {tr(lang, 'وسيلة الدفع', 'Paiement', 'Payment Method')}
                      </th>
                      <td className="p-2.5 font-bold text-[#384D55] uppercase" dir="ltr">
                        {data.receipt.cardBrand
                          ? `${data.receipt.cardBrand} •••• ${data.receipt.cardLast4 || '****'}`
                          : data.receipt.paymentMethod}
                      </td>
                    </tr>
                    <tr className="border-b border-[#e4e9ec]">
                      <th className="p-2.5 bg-[#f7f9fa] text-start font-bold text-[#384D55]">
                        {tr(lang, 'مرجع المعاملة', 'Réf. TX', 'Transaction ID')}
                      </th>
                      <td className="p-2.5 font-mono text-[#384D55]" dir="ltr">
                        {data.receipt.transactionId || data.receipt.transactionReference || '—'}
                      </td>
                    </tr>
                    <tr className="border-b border-[#e4e9ec]">
                      <th className="p-2.5 bg-[#f7f9fa] text-start font-bold text-[#384D55]">
                        {tr(lang, 'المبلغ المدفوع', 'Montant payé', 'Paid Amount')}
                      </th>
                      <td className="p-2.5 font-extrabold text-[#456810]">
                        {Number(data.receipt.paidAmount ?? data.receipt.amount).toLocaleString()}{' '}
                        {data.receipt.currency || 'MRU'}
                        {Number(data.receipt.remainingAmount || 0) > 0 && (
                          <span className="ms-2 text-red-700 font-bold">
                            ({tr(lang, 'المتبقي:', 'Reste :', 'Remaining:')}{' '}
                            {Number(data.receipt.remainingAmount).toLocaleString()} {data.receipt.currency})
                          </span>
                        )}
                      </td>
                    </tr>
                    <tr className="border-b border-[#e4e9ec]">
                      <th className="p-2.5 bg-[#f7f9fa] text-start font-bold text-[#384D55]">
                        {tr(lang, 'تاريخ العملية', 'Date', 'Transaction Date')}
                      </th>
                      <td className="p-2.5 text-[#384D55]" dir="ltr">
                        {new Date(data.receipt.transactionAt || data.receipt.createdAt || '').toLocaleString(
                          localeCode(lang)
                        )}
                      </td>
                    </tr>
                    {data.receipt.expiresAt && (
                      <tr>
                        <th className="p-2.5 bg-[#f7f9fa] text-start font-bold text-[#384D55]">
                          {tr(lang, 'صلاحية الاشتراك', 'Expiration', 'Expires')}
                        </th>
                        <td className="p-2.5 font-bold text-[#557a16]" dir="ltr">
                          {new Date(data.receipt.expiresAt).toLocaleDateString(localeCode(lang))}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="md:col-span-4 p-4 rounded-[6px] bg-[#f9fcf2] border border-[#A6CE39] text-center space-y-2.5">
                {qrDataUrl && (
                  <img
                    src={qrDataUrl}
                    alt="Receipt Verification QR"
                    className="w-36 h-36 mx-auto bg-white p-1.5 rounded border border-[#d8dfe2]"
                  />
                )}
                <div className="text-xs font-extrabold text-[#456810]">
                  {tr(lang, 'ختم التحقق الرقمي', 'Sceau numérique', 'Digital Verification Seal')}
                </div>
                <p className="text-[11px] text-[#5c686e] break-all" dir="ltr">
                  {data.receipt.verifyUrl}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-[#efefef]">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={exportBusy !== null}
                  onClick={() => void handleExport('print')}
                  className="imgsend2-secondary text-xs"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>{tr(lang, 'طباعة الإيصال', 'Imprimer', 'Print')}</span>
                </button>
                <button
                  type="button"
                  disabled={exportBusy !== null}
                  onClick={() => void handleExport('pdf')}
                  className="imgsend2 text-xs"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>
                    {exportBusy === 'pdf'
                      ? tr(lang, 'جارٍ التحضير...', 'Génération...', 'Generating...')
                      : tr(lang, 'تحميل PDF', 'Télécharger PDF', 'Download PDF')}
                  </span>
                </button>
                <button
                  type="button"
                  disabled={exportBusy !== null}
                  onClick={() => void handleExport('jpg')}
                  className="imgsend2-secondary text-xs"
                >
                  <ImageIcon className="w-3.5 h-3.5" />
                  <span>
                    {exportBusy === 'jpg'
                      ? tr(lang, 'جارٍ التصدير...', 'Export...', 'Exporting...')
                      : tr(lang, 'صورة JPG عالية الدقة', 'Image JPG HD', 'High-Res JPG')}
                  </span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => navigate('profile')}
                className="text-xs font-bold text-[#83a329] hover:underline cursor-pointer"
              >
                <span className="inline-flex items-center gap-1">
                  <Download className="w-3.5 h-3.5" />
                  {tr(lang, 'عرض جميع فواتيري', 'Voir mes reçus', 'View All My Receipts')}
                </span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
