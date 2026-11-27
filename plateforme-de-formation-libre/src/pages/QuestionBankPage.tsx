import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Eye,
  EyeOff,
  Search,
} from 'lucide-react';
import { AudioPlayerBar } from '../components/AudioPlayerBar';
import { useApp } from '../context/AppContext';
import { getT } from '../i18n/translations';
import type { Question, TrackSlug } from '../types';
import { apiRequest } from '../utils/api';

interface QuestionsApiResponse {
  questions: Question[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  facets?: {
    axes?: Array<{ axis_ar: string; axis_fr: string }>;
  };
}

export const QuestionBankPage: React.FC = () => {
  const { lang, user, selectedTrack, setSelectedTrack, catalog, viewParams, navigate, openUpgradeModal } = useApp();
  const t = getT(lang);

  const [subject, setSubject] = useState(viewParams.subjectSlug || 'all');
  const [axis, setAxis] = useState('all');
  const [lessonId, setLessonId] = useState(viewParams.lessonId ? String(viewParams.lessonId) : 'all');
  const [level, setLevel] = useState(viewParams.level || 'all');
  const [questionType, setQuestionType] = useState('all');
  const [difficulty, setDifficulty] = useState('all');
  const [langFilter, setLangFilter] = useState<'all' | 'ar' | 'fr'>('all');
  const [trackExact, setTrackExact] = useState(false);
  const [search, setSearch] = useState(viewParams.search || '');
  const [page, setPage] = useState(1);
  const limit = 20;

  const [questions, setQuestions] = useState<Question[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [axesFacets, setAxesFacets] = useState<Array<{ axis_ar: string; axis_fr: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [quotaError, setQuotaError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});

  useEffect(() => {
    if (viewParams.subjectSlug !== undefined) {
      setSubject(viewParams.subjectSlug);
      setPage(1);
    }
    if (viewParams.level !== undefined) {
      setLevel(viewParams.level);
      setPage(1);
    }
    if (viewParams.search !== undefined) {
      setSearch(viewParams.search);
      setPage(1);
    }
    if (viewParams.lessonId !== undefined) {
      setLessonId(String(viewParams.lessonId));
      setPage(1);
    }
  }, [viewParams]);

  // Language isolation lock for single-language core subjects
  useEffect(() => {
    if (subject === 'arabic-lang' || subject === 'islamic-education') {
      setLangFilter('ar');
    } else if (subject === 'french-lang') {
      setLangFilter('fr');
    }
  }, [subject]);

  const langLocked =
    subject === 'arabic-lang' || subject === 'islamic-education' || subject === 'french-lang';

  // Reset to page 1 whenever filters change
  useEffect(() => {
    setPage(1);
  }, [selectedTrack, trackExact, langFilter, subject, axis, lessonId, level, questionType, difficulty, search]);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setQuotaError(null);
      try {
        const params = new URLSearchParams();
        if (selectedTrack !== 'all') params.set('track', selectedTrack);
        if (trackExact && selectedTrack !== 'all') params.set('trackExact', 'true');
        if (langFilter !== 'all') params.set('langFilter', langFilter);
        if (subject !== 'all') params.set('subject', subject);
        if (axis !== 'all') params.set('axis', axis);
        if (lessonId !== 'all') params.set('lessonId', lessonId);
        if (level !== 'all') params.set('level', level);
        if (questionType !== 'all') params.set('questionType', questionType);
        if (difficulty !== 'all') params.set('difficulty', difficulty);
        if (search.trim()) params.set('search', search.trim());
        params.set('page', String(page));
        params.set('limit', String(limit));

        const res = await apiRequest<QuestionsApiResponse>(`/api/questions?${params.toString()}`);
        if (active) {
          setQuestions(res.questions || []);
          setTotal(Number(res.total || 0));
          setTotalPages(Math.max(1, Number(res.totalPages || 1)));
          if (res.facets?.axes) {
            setAxesFacets(res.facets.axes);
          }
        }
      } catch (err: any) {
        if (active && (err?.status === 403 || err?.status === 402 || err?.data?.code === 'QUOTA_EXCEEDED' || err?.data?.code === 'PLAN_UPGRADE_REQUIRED')) {
          const msg =
            err?.message ||
            (lang === 'ar'
              ? 'بلغت الحد اليومي للباقة المجانية في بنك الأسئلة. قم بالترقية للوصول غير المحدود.'
              : 'Limite quotidienne atteinte pour la banque de questions.');
          setQuotaError(msg);
          openUpgradeModal(msg);
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [selectedTrack, trackExact, langFilter, subject, axis, lessonId, level, questionType, difficulty, search, page, lang, openUpgradeModal]);

  const lessonsInScope = useMemo(() => {
    if (subject === 'all') return catalog.lessons;
    return catalog.lessons.filter((l) => l.subject_slug === subject);
  }, [catalog.lessons, subject]);

  const subjectName = (slug: string) => {
    const sub = catalog.subjects.find((s) => s.slug === slug);
    return sub ? (lang === 'ar' ? sub.name_ar : sub.name_fr) : slug;
  };

  const meets70 = total >= 70;

  return (
    <div className="px-4 sm:px-6 py-6 space-y-5">
      <div className="rotator-box mb-0 space-y-3">
        <div className="rotator-box-header">
          <span>{t.navQuestionBank}</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigate('review-center', { subjectSlug: subject, level })}
              className="imgsend2-secondary text-xs py-1.5 px-3"
            >
              {t.reviewBeforeExam}
            </button>
            <button
              type="button"
              onClick={() => navigate('exams', { subjectSlug: subject, level })}
              className="imgsend2 text-xs py-1.5 px-4"
            >
              {t.startExam}
            </button>
          </div>
        </div>

        <p className="text-xs text-[#6b787e]">
          {lang === 'ar'
            ? 'بنك أسئلة أصلي خالٍ تماماً من التكرار أو إعادة الصياغة لرفع العدد شكلياً، مع التصفية الهرمية حسب الشعبة والمادة والمحور والدرس.'
            : 'Banque de questions authentiques, vérifiées et strictement sans doublons, filtrable par filière, matière, axe et leçon.'}
        </p>

        {/* Honest verified total banner */}
        <div
          className={`px-3.5 py-2.5 rounded-[3px] border text-xs flex flex-wrap items-center justify-between gap-2 ${
            meets70
              ? 'bg-[#e2efbf]/60 border-[#A6CE39] text-[#384D55]'
              : 'bg-amber-50 border-amber-200 text-amber-900'
          }`}
        >
          <div className="flex items-center gap-2 font-bold">
            {meets70 ? (
              <CheckCircle2 className="w-4 h-4 text-[#53ce39] shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            )}
            <span>
              {lang === 'ar'
                ? `العدد الفعلي للأسئلة الفريدة المطابقة للتصفية: ${total.toLocaleString()} سؤالاً (صفحة ${page} من ${totalPages}).`
                : `Nombre réel de questions uniques : ${total.toLocaleString()} (Page ${page} / ${totalPages}).`}
            </span>
          </div>
          <span>{meets70 ? t.officialComplete : t.practiceOnly}</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 pt-1">
          <div className="relative">
            <Search className="w-4 h-4 text-[#6b787e] absolute top-2.5 start-2.5" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t.searchPlaceholder}
              className="template-input ps-8"
            />
          </div>
          <select
            value={selectedTrack}
            onChange={(e) => setSelectedTrack(e.target.value as TrackSlug)}
            className="template-input"
          >
            <option value="all">{t.allTracks}</option>
            <option value="arabic">{t.trackArabic}</option>
            <option value="french">{t.trackFrench}</option>
            <option value="bilingual">{t.trackBilingual}</option>
          </select>
          <select
            value={subject}
            onChange={(e) => {
              setSubject(e.target.value);
              setLessonId('all');
            }}
            className="template-input"
          >
            <option value="all">{lang === 'ar' ? 'كل المواد' : 'Toutes les matières'}</option>
            {catalog.subjects.map((s) => (
              <option key={s.slug} value={s.slug}>
                {lang === 'ar' ? s.name_ar : s.name_fr}
              </option>
            ))}
          </select>
          <select value={axis} onChange={(e) => setAxis(e.target.value)} className="template-input">
            <option value="all">{lang === 'ar' ? 'كل المحاور' : 'Tous les axes'}</option>
            {axesFacets.map((ax, i) => (
              <option key={`${ax.axis_ar}-${i}`} value={ax.axis_ar}>
                {lang === 'ar' ? ax.axis_ar : ax.axis_fr || ax.axis_ar}
              </option>
            ))}
          </select>

          <select value={lessonId} onChange={(e) => setLessonId(e.target.value)} className="template-input">
            <option value="all">{lang === 'ar' ? 'كل الدروس المرتبطة' : 'Toutes les leçons'}</option>
            {lessonsInScope.map((l) => (
              <option key={l.id} value={String(l.id)}>
                {lang === 'ar' ? l.title_ar : l.title_fr}
              </option>
            ))}
          </select>
          <select value={level} onChange={(e) => setLevel(e.target.value)} className="template-input">
            <option value="all">{lang === 'ar' ? 'كل المستويات' : 'Tous les niveaux'}</option>
            <option value="foundation">{t.levelFoundation}</option>
            <option value="intermediate">{t.levelIntermediate}</option>
            <option value="advanced">{t.levelAdvanced}</option>
          </select>
          <select value={questionType} onChange={(e) => setQuestionType(e.target.value)} className="template-input">
            <option value="all">{lang === 'ar' ? 'كل أنواع الأسئلة' : 'Tous types'}</option>
            <option value="mcq">{lang === 'ar' ? 'اختيار من متعدد' : 'QCM'}</option>
            <option value="true_false">{lang === 'ar' ? 'صح أم خطأ' : 'Vrai / Faux'}</option>
            <option value="short_answer">{lang === 'ar' ? 'سؤال قصير' : 'Réponse courte'}</option>
            <option value="essay">{lang === 'ar' ? 'مقالي / تحليل' : 'Rédaction'}</option>
          </select>
          <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)} className="template-input">
            <option value="all">{lang === 'ar' ? 'كل الصعوبات' : 'Toutes difficultés'}</option>
            <option value="easy">{lang === 'ar' ? 'سهل' : 'Facile'}</option>
            <option value="medium">{lang === 'ar' ? 'متوسط' : 'Moyen'}</option>
            <option value="hard">{lang === 'ar' ? 'صعب' : 'Difficile'}</option>
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-1 text-xs">
          <div className="flex items-center gap-1.5">
            <label className="font-bold text-[#384D55]">
              {lang === 'ar' ? 'عزل لغة الأسئلة:' : 'Langue :'}
            </label>
            <select
              value={langFilter}
              disabled={langLocked}
              onChange={(e) => setLangFilter(e.target.value as 'all' | 'ar' | 'fr')}
              className="template-input !h-8 !w-auto text-xs disabled:opacity-70"
            >
              <option value="all">{lang === 'ar' ? 'العربية + الفرنسية' : 'Arabe + Français'}</option>
              <option value="ar">{lang === 'ar' ? 'العربية فقط' : 'Arabe uniquement'}</option>
              <option value="fr">{lang === 'ar' ? 'الفرنسية فقط' : 'Français uniquement'}</option>
            </select>
          </div>
          {selectedTrack !== 'all' && (
            <label className="inline-flex items-center gap-1.5 font-bold text-[#384D55] cursor-pointer">
              <input
                type="checkbox"
                checked={trackExact}
                onChange={(e) => setTrackExact(e.target.checked)}
                className="accent-[#384D55]"
              />
              <span>
                {lang === 'ar'
                  ? 'عزل الشعبة المحددة بدقة (trackExact)'
                  : 'Isoler strictement la filière'}
              </span>
            </label>
          )}
        </div>
      </div>

      {!(user?.activeSubscription && user.activeSubscription.billing_cycle !== 'free') && !quotaError && (
        <div className="px-3.5 py-2 rounded-[3px] border border-[#d8dfe2] bg-[#f7f9fa] text-[11.5px] text-[#384D55] flex flex-wrap items-center justify-between gap-2">
          <span>
            {lang === 'ar'
              ? 'أنت تتصفح بنك الأسئلة ضمن الحصة المجانية المحدودة. الترقية تفتح كامل البنك بدون حدود يومية.'
              : 'Vous consultez la banque avec le quota gratuit limité. Passez à une offre payante pour un accès illimité.'}
          </span>
          <button
            type="button"
            onClick={() => navigate('subscriptions')}
            className="text-xs font-extrabold text-[#557a16] hover:underline cursor-pointer"
          >
            {lang === 'ar' ? 'عرض الباقات ←' : 'Voir les formules →'}
          </button>
        </div>
      )}

      {quotaError ? (
        <div className="addressp-box p-6 text-center space-y-3 border-amber-300 bg-amber-50">
          <p className="text-sm font-bold text-amber-900">{quotaError}</p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => navigate('subscriptions')}
              className="imgsend2 !py-2 !px-5 text-xs"
            >
              {lang === 'ar' ? 'الترقية / الاشتراكات' : 'Voir les abonnements'}
            </button>
            <button
              type="button"
              onClick={() => openUpgradeModal(quotaError)}
              className="imgsend2-secondary !py-2 !px-4 text-xs"
            >
              {lang === 'ar' ? 'تفاصيل الباقات' : 'Détails'}
            </button>
          </div>
        </div>
      ) : loading ? (
        <div className="addressp-box text-center text-sm text-[#6b787e]">{t.loading}</div>
      ) : questions.length === 0 ? (
        <div className="addressp-box text-center text-sm text-[#6b787e]">{t.emptyState}</div>
      ) : (
        <>
          <div className="space-y-3 edu-copy-protected">
            {questions.map((q, idx) => {
              const isShown = Boolean(revealed[q.id]);
              const opts = lang === 'ar' ? q.options_ar : q.options_fr;
              const globalNum = (page - 1) * limit + idx + 1;
              return (
                <div key={q.id} className="addressp-box mb-0 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#6b787e] border-b border-[#efefef] pb-2">
                    <span className="font-bold text-[#384D55]">
                      #{globalNum} · {subjectName(q.subject_slug)}
                      {q.axis_ar ? ` · ${lang === 'ar' ? q.axis_ar : q.axis_fr || q.axis_ar}` : ''} ·{' '}
                      {lang === 'ar' ? q.topic_ar : q.topic_fr} · {q.level}
                    </span>
                    {q.seen_before && (
                      <span className="text-[11px] font-bold text-[#557a16]">
                        {lang === 'ar' ? 'شوهد سابقاً في تدريب' : 'Déjà vu en entraînement'}
                      </span>
                    )}
                  </div>

                  <h2 className="font-bold text-sm sm:text-base text-[#384D55]">
                    {lang === 'ar' ? q.stem_ar : q.stem_fr}
                  </h2>

                  <AudioPlayerBar
                    compact
                    audioId={`bank-q-${q.id}`}
                    arabicSpeechText={q.stem_speech_ar || q.stem_ar}
                    arabicFallbackText={q.stem_ar}
                    frenchText={q.stem_fr}
                  />

                  {opts && opts.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs sm:text-sm">
                      {opts.map((opt, oIdx) => (
                        <div
                          key={oIdx}
                          className={`px-3 py-2 rounded-[3px] border ${
                            isShown && oIdx === q.correct_index
                              ? 'bg-[#e2efbf] border-[#A6CE39] font-bold text-[#384D55]'
                              : 'bg-[#f7f9fa] border-[#d8dfe2] text-[#384D55]'
                          }`}
                        >
                          {opt}
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-1">
                    <button
                      type="button"
                      onClick={() => setRevealed((p) => ({ ...p, [q.id]: !p[q.id] }))}
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-[#384D55] hover:text-[#557a16] cursor-pointer"
                    >
                      {isShown ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      <span>
                        {isShown
                          ? lang === 'ar'
                            ? 'إخفاء الحل والتفسير'
                            : 'Masquer le corrigé'
                          : lang === 'ar'
                            ? 'إظهار الحل والتفسير'
                            : 'Afficher la réponse et l’explication'}
                      </span>
                    </button>
                  </div>

                  {isShown && (
                    <div className="bg-[#f4f6f7] border border-[#d8dfe2] rounded-[3px] p-3 text-xs sm:text-sm text-[#384D55] space-y-2">
                      {(q.answer_ar || q.answer_fr) && (
                        <div>
                          <strong>{lang === 'ar' ? 'الإجابة النموذجية: ' : 'Réponse type : '}</strong>
                          {lang === 'ar' ? q.answer_ar || opts[q.correct_index || 0] : q.answer_fr || opts[q.correct_index || 0]}
                        </div>
                      )}
                      <div>
                        <strong>{lang === 'ar' ? 'التفسير التربوي والعلمي: ' : 'Explication : '}</strong>
                        {lang === 'ar' ? q.explanation_ar : q.explanation_fr}
                      </div>
                      <AudioPlayerBar
                        compact
                        audioId={`bank-exp-${q.id}`}
                        arabicSpeechText={`${q.answer_speech_ar || q.answer_ar || ''}. ${q.explanation_speech_ar || q.explanation_ar || ''}`}
                        arabicFallbackText={`${q.answer_ar || ''}. ${q.explanation_ar || ''}`}
                        frenchText={`${q.answer_fr || ''}. ${q.explanation_fr || ''}`}
                        label={lang === 'ar' ? 'استماع للإجابة والتفسير' : "Écouter la réponse et l'explication"}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="addressp-box !mb-0 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="font-bold text-[#6b787e] tabular-nums">
                {lang === 'ar'
                  ? `عرض ${((page - 1) * limit + 1).toLocaleString()}–${Math.min(page * limit, total).toLocaleString()} من أصل ${total.toLocaleString()} سؤالاً`
                  : `Affichage ${((page - 1) * limit + 1).toLocaleString()}–${Math.min(page * limit, total).toLocaleString()} sur ${total.toLocaleString()}`}
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage(1)}
                  className="imgsend2-secondary !py-1.5 !px-2.5 text-xs disabled:opacity-40"
                  aria-label="First page"
                >
                  {lang === 'ar' ? <ChevronsRight className="w-4 h-4" /> : <ChevronsLeft className="w-4 h-4" />}
                </button>
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="imgsend2-secondary !py-1.5 !px-3 text-xs disabled:opacity-40"
                >
                  {lang === 'ar' ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
                  <span>{lang === 'ar' ? 'السابق' : 'Précédent'}</span>
                </button>
                <span className="px-3 py-1.5 rounded-[3px] border border-[#d8dfe2] bg-[#f7f9fa] font-extrabold text-[#384D55] tabular-nums">
                  {page} / {totalPages}
                </span>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="imgsend2 !py-1.5 !px-3 text-xs disabled:opacity-40"
                >
                  <span>{lang === 'ar' ? 'التالي' : 'Suivant'}</span>
                  {lang === 'ar' ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </button>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage(totalPages)}
                  className="imgsend2-secondary !py-1.5 !px-2.5 text-xs disabled:opacity-40"
                  aria-label="Last page"
                >
                  {lang === 'ar' ? <ChevronsLeft className="w-4 h-4" /> : <ChevronsRight className="w-4 h-4" />}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
