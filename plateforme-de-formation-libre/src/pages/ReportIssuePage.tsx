import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, ImagePlus, Send, Trash2 } from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { IssueReportItem } from '../types';
import { apiRequest } from '../utils/api';

const REPORT_CATEGORIES = [
  { value: 'bug', ar: 'خلل تقني أو خطأ برمجي', fr: 'Bug ou erreur technique' },
  { value: 'content_error', ar: 'خطأ في درس أو سؤال أو إجابة', fr: 'Erreur de contenu / question' },
  { value: 'payment_issue', ar: 'مشكلة في الدفع أو تفعيل الاشتراك', fr: 'Problème de paiement / abonnement' },
  { value: 'account', ar: 'مشكلة في الحساب أو الدخول', fr: 'Problème de compte' },
  { value: 'suggestion', ar: 'اقتراح لتحسين المنصة', fr: 'Suggestion d’amélioration' },
];

export const ReportIssuePage: React.FC = () => {
  const { lang, user, navigate } = useApp();
  const isAr = lang === 'ar';

  const [reportType, setReportType] = useState('bug');
  const [reason, setReason] = useState('');
  const [description, setDescription] = useState('');
  const [screenshotDataUrl, setScreenshotDataUrl] = useState<string>('');
  const [reports, setReports] = useState<IssueReportItem[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; ok: boolean } | null>(null);

  const loadMyReports = useCallback(async () => {
    if (!user) return;
    setLoadingList(true);
    try {
      const res = await apiRequest<{ reports?: IssueReportItem[] }>('/api/reports/mine');
      setReports(Array.isArray(res.reports) ? res.reports : []);
    } catch {
      setReports([]);
    } finally {
      setLoadingList(false);
    }
  }, [user]);

  useEffect(() => {
    void loadMyReports();
  }, [loadMyReports]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!/^image\/(png|jpeg|jpg|webp)$/i.test(file.type)) {
      setFeedback({
        text: isAr ? 'يرجى اختيار صورة بصيغة PNG أو JPG أو WEBP.' : 'Format image PNG/JPG/WEBP requis.',
        ok: false,
      });
      return;
    }
    if (file.size > 650 * 1024) {
      setFeedback({
        text: isAr ? 'حجم الصورة يجب أن يكون أقل من 650 كيلوبايت.' : 'Image max 650 Ko.',
        ok: false,
      });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setScreenshotDataUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    if (description.trim().length < 8) {
      setFeedback({
        text: isAr
          ? 'يرجى كتابة وصف واضح للمشكلة (8 أحرف على الأقل).'
          : 'Décrivez le problème en au moins 8 caractères.',
        ok: false,
      });
      return;
    }

    setSubmitting(true);
    try {
      await apiRequest('/api/reports', {
        method: 'POST',
        json: {
          reportType,
          reason: reason.trim() || REPORT_CATEGORIES.find((c) => c.value === reportType)?.ar || reportType,
          description: description.trim(),
          screenshotDataUrl,
        },
      });
      setReason('');
      setDescription('');
      setScreenshotDataUrl('');
      setFeedback({
        text: isAr
          ? 'تم استلام بلاغك بنجاح وسيتم مراجعته من طرف الإدارة.'
          : 'Votre signalement a bien été envoyé à l’administration.',
        ok: true,
      });
      await loadMyReports();
    } catch (err) {
      setFeedback({
        text:
          err instanceof Error
            ? err.message
            : isAr
              ? 'تعذر إرسال البلاغ.'
              : 'Impossible d’envoyer le signalement.',
        ok: false,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const statusLabel = (s: string) => {
    if (s === 'resolved') return isAr ? 'تم الحل' : 'Résolu';
    if (s === 'in_review') return isAr ? 'قيد المراجعة' : 'En cours';
    if (s === 'closed') return isAr ? 'مغلق' : 'Fermé';
    return isAr ? 'مفتوح' : 'Ouvert';
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      <div className="addressp-box-white flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[#fff3cd] text-[#8a6d00] flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-extrabold text-[#384D55]">
              {isAr ? 'الإبلاغ عن مشكلة أو خطأ' : 'Signaler un problème'}
            </h1>
            <p className="text-xs text-[#6b787e]">
              {isAr
                ? 'ساعدنا في تحسين المنصة عبر إرسال تفاصيل المشكلة مع لقطة شاشة إن وجدت.'
                : 'Aidez-nous à améliorer la plateforme en signalant toute anomalie.'}
            </p>
          </div>
        </div>
      </div>

      {!user ? (
        <div className="addressp-box-white text-center py-10 space-y-3">
          <p className="text-sm font-bold text-[#384D55]">
            {isAr
              ? 'يرجى تسجيل الدخول لإرسال بلاغ ومتابعة رد الإدارة عليه.'
              : 'Connectez-vous pour envoyer un signalement et suivre son traitement.'}
          </p>
          <button type="button" onClick={() => navigate('login')} className="imgsend2 text-xs">
            {isAr ? 'تسجيل الدخول' : 'Connexion'}
          </button>
        </div>
      ) : (
        <>
          <form onSubmit={handleSubmit} className="addressp-box-white space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-xs font-bold text-[#384D55] mb-1">
                  {isAr ? 'نوع البلاغ' : 'Type de problème'}
                </label>
                <select
                  className="template-input"
                  value={reportType}
                  onChange={(e) => setReportType(e.target.value)}
                >
                  {REPORT_CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {isAr ? c.ar : c.fr}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-[#384D55] mb-1">
                  {isAr ? 'عنوان مختصر للمشكلة' : 'Objet / Résumé'}
                </label>
                <input
                  type="text"
                  className="template-input"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={isAr ? 'مثال: خطأ في السؤال رقم 12 أو زر الدفع' : 'Ex : Erreur question 12'}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#384D55] mb-1">
                {isAr ? 'الوصف التفصيلي' : 'Description détaillée'} <span className="required">*</span>
              </label>
              <textarea
                rows={4}
                className="w-full border border-[#d3d6d8] rounded-[4px] p-2.5 text-sm bg-white text-[#384D55]"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={
                  isAr
                    ? 'اشرح ما حدث، الصفحة التي كنت فيها، وما هي الرسالة التي ظهرت...'
                    : 'Expliquez la situation rencontrée et le message affiché...'
                }
                required
              />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <label className="imgsend2-secondary text-xs cursor-pointer">
                <ImagePlus className="w-4 h-4" />
                <span>{isAr ? 'إرفاق لقطة شاشة (اختياري)' : 'Joindre une capture (optionnel)'}</span>
                <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleFileChange} className="hidden" />
              </label>
              {screenshotDataUrl && (
                <div className="flex items-center gap-2">
                  <img
                    src={screenshotDataUrl}
                    alt="Screenshot preview"
                    className="h-12 w-auto rounded border border-[#d8dfe2]"
                  />
                  <button
                    type="button"
                    onClick={() => setScreenshotDataUrl('')}
                    className="text-red-600 p-1 cursor-pointer"
                    title={isAr ? 'حذف الصورة' : 'Supprimer'}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

            {feedback && (
              <div
                className={`text-xs font-bold px-3 py-2 rounded border flex items-center gap-2 ${
                  feedback.ok
                    ? 'bg-[#f9fcf2] border-[#A6CE39] text-[#384D55]'
                    : 'bg-red-50 border-red-200 text-red-700'
                }`}
              >
                {feedback.ok && <CheckCircle2 className="w-4 h-4 text-[#83a329]" />}
                <span>{feedback.text}</span>
              </div>
            )}

            <div className="flex justify-end">
              <button type="submit" disabled={submitting} className="imgsend2 text-xs">
                <Send className="w-3.5 h-3.5" />
                <span>
                  {submitting
                    ? isAr
                      ? 'جارٍ الإرسال...'
                      : 'Envoi...'
                    : isAr
                      ? 'إرسال البلاغ للإدارة'
                      : 'Envoyer le signalement'}
                </span>
              </button>
            </div>
          </form>

          <div className="addressp-box-white space-y-3">
            <h2 className="ltitle2">
              {isAr ? 'سجل بلاغاتي السابقة' : 'Historique de mes signalements'}
            </h2>
            {loadingList ? (
              <p className="text-xs text-[#6b787e]">{isAr ? 'جارٍ التحميل...' : 'Chargement...'}</p>
            ) : reports.length === 0 ? (
              <p className="text-xs text-[#6b787e]">
                {isAr ? 'لم ترسل أي بلاغات بعد.' : 'Aucun signalement envoyé.'}
              </p>
            ) : (
              <div className="space-y-3">
                {reports.map((rep) => (
                  <div
                    key={rep.id}
                    className="border border-[#d8dfe2] rounded-[6px] p-3.5 bg-[#f7f9fa] space-y-2"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-bold text-[#384D55]">{rep.reason}</span>
                      <div className="flex items-center gap-2 text-[11px]">
                        <span
                          className={`px-2 py-0.5 rounded font-bold ${
                            rep.status === 'resolved'
                              ? 'bg-[#e2efbf] text-[#384D55]'
                              : rep.status === 'in_review'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-[#efefef] text-[#384D55]'
                          }`}
                        >
                          {statusLabel(rep.status)}
                        </span>
                        <span className="text-[#6b787e]" dir="ltr">
                          {new Date(rep.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    <p className="text-xs text-[#6b787e] whitespace-pre-line">{rep.description}</p>
                    {(rep.admin_reply || rep.admin_action) && (
                      <div className="bg-white border border-[#A6CE39] rounded p-2.5 text-xs text-[#384D55]">
                        <span className="font-extrabold text-[#83a329]">
                          {isAr ? 'رد الإدارة: ' : 'Réponse Admin : '}
                        </span>
                        <span>{rep.admin_reply || rep.admin_action}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
