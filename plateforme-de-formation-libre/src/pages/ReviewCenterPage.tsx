import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Eye, EyeOff, Lock, PlayCircle } from 'lucide-react';
import { AudioPlayerBar } from '../components/AudioPlayerBar';
import { useApp } from '../context/AppContext';
import { getT } from '../i18n/translations';
import type { Question, TrackSlug } from '../types';
import { apiRequest } from '../utils/api';
import { speechEngine } from '../utils/speechEngine';

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

export const ReviewCenterPage: React.FC = () => {
  const { lang, selectedTrack, setSelectedTrack, catalog, user, freeLimits, viewParams, navigate, openUpgradeModal } =
    useApp();
  const t = getT(lang);

  const [subject, setSubject] = useState(viewParams.subjectSlug || 'all');
  const [axis, setAxis] = useState('all');
  const [lessonId, setLessonId] = useState(viewParams.lessonId ? String(viewParams.lessonId) : 'all');
  const [level, setLevel] = useState(viewParams.level || 'all');
  const [questionType, setQuestionType] = useState('all');
  const [langFilter, setLangFilter] = useState<'all' | 'ar' | 'fr'>('all');
  const [trackExact, setTrackExact] = useState(false);

  const [page, setPage] = useState(1);
  const limit = 20;
  const [questions, setQuestions] = useState<Question[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [axesFacets, setAxesFacets] = useState<Array<{ axis_ar: string; axis_fr: string }>>([]);

  const [loading, setLoading] = useState(true);
  const [accessDeniedMsg, setAccessDeniedMsg] = useState<string | null>(null);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [showAnswer, setShowAnswer] = useState(true);
  const pendingSelectLastRef = useRef(false);

  const hasPaidAccess = Boolean(
    user?.isAdmin || (user?.activeSubscription && user.activeSubscription.billing_cycle !== 'free')
  );
  const reviewLockedForFree = Boolean(freeLimits && freeLimits.allow_review_center === 0 && !hasPaidAccess);

  // Automatic language lock on pure Arabic / Islamic / French subjects
  useEffect(() => {
    if (subject === 'arabic-lang' || subject === 'islamic-education') {
      setLangFilter('ar');
    } else if (subject === 'french-lang') {
      setLangFilter('fr');
    }
  }, [subject]);

  const langLocked =
    subject === 'arabic-lang' || subject === 'islamic-education' || subject === 'french-lang';

  useEffect(() => {
    setPage(1);
    setCurrentIdx(0);
  }, [selectedTrack, trackExact, langFilter, subject, axis, lessonId, level, questionType]);

  useEffect(() => {
    if (reviewLockedForFree) {
      setLoading(false);
      return;
    }
    let active = true;
    async function load() {
      setLoading(true);
      setAccessDeniedMsg(null);
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
        params.set('page', String(page));
        params.set('limit', String(limit));

        const res = await apiRequest<QuestionsApiResponse>(`/api/questions?${params.toString()}`);
        if (active) {
          const list = res.questions || [];
          setQuestions(list);
          setTotal(Number(res.total || 0));
          setTotalPages(Math.max(1, Number(res.totalPages || 1)));
          if (res.facets?.axes) {
            setAxesFacets(res.facets.axes);
          }
          if (pendingSelectLastRef.current) {
            pendingSelectLastRef.current = false;
            setCurrentIdx(Math.max(0, list.length - 1));
          } else {
            setCurrentIdx(0);
          }
        }
      } catch (err: any) {
        if (active && (err?.status === 403 || err?.status === 402 || err?.data?.code === 'PLAN_UPGRADE_REQUIRED' || err?.data?.code === 'QUOTA_EXCEEDED')) {
          const msg =
            err?.message ||
            (lang === 'ar'
              ? 'مركز المراجعة الكامل متاح للمشتركين في الباقات المدفوعة.'
              : 'Le centre de révision complet nécessite une offre payante.');
          setAccessDeniedMsg(msg);
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
  }, [reviewLockedForFree, selectedTrack, trackExact, langFilter, subject, axis, lessonId, level, questionType, page, lang, openUpgradeModal]);

  // Stop any playing question/answer audio on navigation
  useEffect(() => {
    speechEngine.stop();
    return () => {
      speechEngine.stop();
    };
  }, [currentIdx, page]);

  const current = questions[currentIdx];
  const globalIndex = (page - 1) * limit + currentIdx + 1;

  const lessonsInScope = useMemo(() => {
    if (subject === 'all') return catalog.lessons;
    return catalog.lessons.filter((l) => l.subject_slug === subject);
  }, [catalog.lessons, subject]);

  const subjectName = (slug: string) => {
    const sub = catalog.subjects.find((s) => s.slug === slug);
    return sub ? (lang === 'ar' ? sub.name_ar : sub.name_fr) : slug;
  };

  const handlePrev = () => {
    if (currentIdx > 0) {
      setCurrentIdx((i) => i - 1);
    } else if (page > 1) {
      pendingSelectLastRef.current = true;
      setPage((p) => p - 1);
    }
  };

  const handleNext = () => {
    if (currentIdx < questions.length - 1) {
      setCurrentIdx((i) => i + 1);
    } else if (page < totalPages) {
      pendingSelectLastRef.current = false;
      setPage((p) => p + 1);
    }
  };

  const currentOpts = current ? (lang === 'ar' ? current.options_ar : current.options_fr) : [];
  const answerTextAr = current
    ? `${current.answer_speech_ar || current.answer_ar || current.options_ar?.[current.correct_index || 0] || ''}. ${
        current.explanation_speech_ar || current.explanation_ar || ''
      }`
    : '';
  const answerFallbackAr = current
    ? `${current.answer_ar || current.options_ar?.[current.correct_index || 0] || ''}. ${current.explanation_ar || ''}`
    : '';
  const answerTextFr = current
    ? `${current.answer_fr || current.options_fr?.[current.correct_index || 0] || ''}. ${current.explanation_fr || ''}`
    : '';

  return (
    <div className="px-4 sm:px-6 py-6 space-y-5">
      <div className="rotator-box mb-0">
        <div className="rotator-box-header">
          <span>{t.navReviewCenter}</span>
          <button
            type="button"
            onClick={() => navigate('exams', { subjectSlug: subject, level })}
            className="imgsend2 text-xs py-1.5 px-4"
          >
            <PlayCircle className="w-4 h-4" />
            <span>{t.startExam}</span>
          </button>
        </div>

        <p className="text-xs text-[#6b787e] mb-3">
          {lang === 'ar'
            ? 'بيئة مراجعة حرة قبل الاختبار لاستعراض الأسئلة والإجابات النموذجية والشروحات مع مشغّلين صوتيين مستقلين (للسؤال وللإجابة والشرح).'
            : 'Espace de révision guidée avant l’épreuve avec double lecteur audio indépendant (énoncé et corrigé).'}
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
          <select
            value={selectedTrack}
            onChange={(e) => setSelectedTrack(e.target.value as TrackSlug)}
            className="template-input text-xs"
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
            className="template-input text-xs"
          >
            <option value="all">{lang === 'ar' ? 'كل المواد' : 'Toutes les matières'}</option>
            {catalog.subjects.map((s) => (
              <option key={s.slug} value={s.slug}>
                {lang === 'ar' ? s.name_ar : s.name_fr}
              </option>
            ))}
          </select>
          <select value={axis} onChange={(e) => setAxis(e.target.value)} className="template-input text-xs">
            <option value="all">{lang === 'ar' ? 'كل المحاور' : 'Tous les axes'}</option>
            {axesFacets.map((ax, i) => (
              <option key={`${ax.axis_ar}-${i}`} value={ax.axis_ar}>
                {lang === 'ar' ? ax.axis_ar : ax.axis_fr || ax.axis_ar}
              </option>
            ))}
          </select>
          <select value={lessonId} onChange={(e) => setLessonId(e.target.value)} className="template-input text-xs">
            <option value="all">{lang === 'ar' ? 'كل الدروس' : 'Toutes les leçons'}</option>
            {lessonsInScope.map((l) => (
              <option key={l.id} value={String(l.id)}>
                {lang === 'ar' ? l.title_ar : l.title_fr}
              </option>
            ))}
          </select>
          <select value={questionType} onChange={(e) => setQuestionType(e.target.value)} className="template-input text-xs">
            <option value="all">{lang === 'ar' ? 'كل أنواع الأسئلة' : 'Tous types'}</option>
            <option value="mcq">{lang === 'ar' ? 'اختيار من متعدد' : 'QCM'}</option>
            <option value="true_false">{lang === 'ar' ? 'صح أم خطأ' : 'Vrai / Faux'}</option>
            <option value="short_answer">{lang === 'ar' ? 'سؤال قصير' : 'Réponse courte'}</option>
            <option value="essay">{lang === 'ar' ? 'مقالي / تحليل' : 'Rédaction'}</option>
          </select>
        </div>

        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-[#6b787e]">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <label className="font-bold">{lang === 'ar' ? 'المستوى:' : 'Niveau :'}</label>
              <select
                value={level}
                onChange={(e) => setLevel(e.target.value)}
                className="template-input !h-8 !w-auto text-xs"
              >
                <option value="all">{lang === 'ar' ? 'كل المستويات' : 'Tous les niveaux'}</option>
                <option value="foundation">{t.levelFoundation}</option>
                <option value="intermediate">{t.levelIntermediate}</option>
                <option value="advanced">{t.levelAdvanced}</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="font-bold">{lang === 'ar' ? 'اللغة:' : 'Langue :'}</label>
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
                <span>{lang === 'ar' ? 'عزل الشعبة بدقة' : 'Filière stricte'}</span>
              </label>
            )}
          </div>
          <span className="font-bold tabular-nums text-[#384D55]">
            {lang === 'ar'
              ? `إجمالي الأسئلة المتاحة: ${total.toLocaleString()} · صفحة ${page} من ${totalPages}`
              : `Total : ${total.toLocaleString()} · Page ${page} / ${totalPages}`}
          </span>
        </div>
      </div>

      {reviewLockedForFree || accessDeniedMsg ? (
        <div className="addressp-box p-8 text-center space-y-3 border-amber-300 bg-amber-50/70">
          <Lock className="w-8 h-8 text-amber-700 mx-auto" />
          <h2 className="text-base font-extrabold text-[#384D55]">
            {lang === 'ar' ? 'مركز المراجعة الحر مخصص للمشتركين' : 'Centre de révision réservé aux abonnés'}
          </h2>
          <p className="text-xs text-[#5d6e75] max-w-md mx-auto">
            {accessDeniedMsg ||
              (lang === 'ar'
                ? 'ترقيتك إلى إحدى الباقات المدفوعة تفتح مركز المراجعة الكامل مع القراءة الصوتية لجميع الأسئلة والشروحات.'
                : 'Passez à une offre payante pour débloquer le centre de révision complet.')}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
            <button
              type="button"
              onClick={() =>
                openUpgradeModal(
                  accessDeniedMsg ||
                    (lang === 'ar'
                      ? 'مركز المراجعة الكامل متاح ضمن الباقات المدفوعة.'
                      : 'Centre de révision complet inclus dans les offres payantes.')
                )
              }
              className="imgsend2 !py-2 !px-5 text-xs"
            >
              {lang === 'ar' ? 'ترقية الباقة الآن' : 'Mettre à niveau'}
            </button>
            <button
              type="button"
              onClick={() => navigate('subscriptions')}
              className="imgsend2-secondary !py-2 !px-4 text-xs"
            >
              {lang === 'ar' ? 'عرض الباقات والأسعار' : 'Voir les offres'}
            </button>
          </div>
        </div>
      ) : loading ? (
        <div className="addressp-box text-center text-sm text-[#6b787e]">{t.loading}</div>
      ) : !current ? (
        <div className="addressp-box text-center text-sm text-[#6b787e]">{t.emptyState}</div>
      ) : (
        <div className="addressp-box space-y-4 edu-copy-protected">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#efefef] pb-3">
            <div className="text-xs font-bold text-[#6b787e]">
              {subjectName(current.subject_slug)}
              {current.axis_ar ? ` · ${lang === 'ar' ? current.axis_ar : current.axis_fr || current.axis_ar}` : ''} ·{' '}
              {lang === 'ar' ? current.topic_ar : current.topic_fr} ·{' '}
              <span className="tabular-nums text-[#384D55]">
                {globalIndex.toLocaleString()} / {total.toLocaleString()}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setShowAnswer(!showAnswer)}
              className="imgsend2-secondary text-xs py-1.5 px-3"
            >
              {showAnswer ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              <span>
                {showAnswer
                  ? lang === 'ar'
                    ? 'إخفاء الجواب للاختبار الذاتي'
                    : 'Masquer pour s’auto-tester'
                  : lang === 'ar'
                    ? 'إظهار الجواب النموذجي'
                    : 'Afficher la réponse'}
              </span>
            </button>
          </div>

          <h2 className="text-base sm:text-lg font-extrabold text-[#384D55] leading-relaxed">
            {lang === 'ar' ? current.stem_ar : current.stem_fr}
          </h2>

          {/* Audio Player 1: Question Stem Only */}
          <AudioPlayerBar
            audioId={`review-q-${current.id}-stem`}
            arabicSpeechText={current.stem_speech_ar || current.stem_ar}
            arabicFallbackText={current.stem_ar}
            frenchText={current.stem_fr}
            label={lang === 'ar' ? 'قراءة نص السؤال' : 'Écouter l’énoncé de la question'}
          />

          {currentOpts.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {currentOpts.map((opt, idx) => (
                <div
                  key={idx}
                  className={`p-3 rounded-[3px] border text-sm ${
                    showAnswer && idx === current.correct_index
                      ? 'bg-[#e2efbf] border-[#A6CE39] font-bold text-[#384D55]'
                      : 'bg-[#f7f9fa] border-[#d8dfe2] text-[#384D55]'
                  }`}
                >
                  {opt}
                </div>
              ))}
            </div>
          )}

          {showAnswer && (
            <div className="bg-[#f4f6f7] border border-[#A6CE39] rounded-[3px] p-4 text-xs sm:text-sm text-[#384D55] space-y-3">
              {(current.answer_ar || current.answer_fr) && (
                <div>
                  <strong>{lang === 'ar' ? 'الإجابة النموذجية: ' : 'Réponse type : '}</strong>
                  {lang === 'ar'
                    ? current.answer_ar || currentOpts[current.correct_index || 0]
                    : current.answer_fr || currentOpts[current.correct_index || 0]}
                </div>
              )}
              <div>
                <strong>{lang === 'ar' ? 'التفسير والشرح: ' : 'Explication : '}</strong>
                {lang === 'ar' ? current.explanation_ar : current.explanation_fr}
              </div>

              {/* Audio Player 2: Answer & Explanation Only */}
              <AudioPlayerBar
                compact
                audioId={`review-q-${current.id}-answer`}
                arabicSpeechText={answerTextAr}
                arabicFallbackText={answerFallbackAr}
                frenchText={answerTextFr}
                label={lang === 'ar' ? 'قراءة الإجابة والشرح' : 'Écouter la réponse et l’explication'}
              />
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-[#efefef]">
            <button
              type="button"
              disabled={page <= 1 && currentIdx === 0}
              onClick={handlePrev}
              className="imgsend2-secondary text-xs disabled:opacity-40"
            >
              {lang === 'ar' ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
              <span>{lang === 'ar' ? 'السابق' : 'Précédent'}</span>
            </button>

            {totalPages > 1 && (
              <div className="flex items-center gap-1.5 text-xs">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="px-2.5 py-1 rounded-[3px] border border-[#d8dfe2] bg-[#f7f9fa] font-bold text-[#384D55] disabled:opacity-40 cursor-pointer"
                >
                  {lang === 'ar' ? 'صفحة سابقة' : 'Page préc.'}
                </button>
                <span className="px-2 font-extrabold tabular-nums text-[#384D55]">
                  {page} / {totalPages}
                </span>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="px-2.5 py-1 rounded-[3px] border border-[#d8dfe2] bg-[#f7f9fa] font-bold text-[#384D55] disabled:opacity-40 cursor-pointer"
                >
                  {lang === 'ar' ? 'صفحة تالية' : 'Page suiv.'}
                </button>
              </div>
            )}

            <button
              type="button"
              disabled={page >= totalPages && currentIdx >= questions.length - 1}
              onClick={handleNext}
              className="imgsend2 text-xs disabled:opacity-40"
            >
              <span>{lang === 'ar' ? 'التالي' : 'Suivant'}</span>
              {lang === 'ar' ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
