import React, { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  FileText,
  Heart,
  HelpCircle,
  Lock,
  Search,
} from 'lucide-react';
import { AudioPlayerBar } from '../AudioPlayerBar';
import { useApp } from '../../context/AppContext';
import { triggerHaptic } from '../../hooks/useMobilePlatform';
import { setLessonProgressDoc } from '../../lib/firestoreService';
import type { Lesson, Question, SummaryItem } from '../../types';
import { apiRequest } from '../../utils/api';
import { tr } from '../../utils/locale';
import { MobileListRow, MobileSkeletonList } from './MobilePrimitives';
import { MobilePaywallSheet } from './MobileSubscriptionViews';

export type MobileLearnSubMode = 'lessons' | 'summaries' | 'bank' | 'review' | 'favorites';

export const MobileLearnView: React.FC<{
  subMode: MobileLearnSubMode;
  onChangeSubMode: (m: MobileLearnSubMode) => void;
  subjectSlug: string;
  onChangeSubjectSlug: (slug: string) => void;
  activeLessonId: number | null;
  onSelectLesson: (id: number | null) => void;
  onOpenSubscriptions: () => void;
}> = ({
  subMode,
  onChangeSubMode,
  subjectSlug,
  onChangeSubjectSlug,
  activeLessonId,
  onSelectLesson,
  onOpenSubscriptions,
}) => {
  const { lang, user, firebaseUser, catalog, selectedTrack, freeLimits } = useApp();
  const isAr = lang === 'ar';

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  // Paywall sheet state
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [paywallReason, setPaywallReason] = useState<string | undefined>(undefined);

  // Lessons state
  const [serverLessons, setServerLessons] = useState<Lesson[] | null>(null);
  const [lessonsLoading, setLessonsLoading] = useState(false);
  const [totalLessonPages, setTotalLessonPages] = useState(1);
  const [hydratedLesson, setHydratedLesson] = useState<Lesson | null>(null);
  const [lessonError, setLessonError] = useState<string | null>(null);
  const [savingProgress, setSavingProgress] = useState(false);
  const [mcqSelected, setMcqSelected] = useState<Record<number, number>>({});
  const [revealedEx, setRevealedEx] = useState<Record<number, boolean>>({});

  // Summary state
  const [activeSummary, setActiveSummary] = useState<SummaryItem | null>(null);

  // Question Bank & Review Center state
  const [questions, setQuestions] = useState<Question[]>([]);
  const [qPage, setQPage] = useState(1);
  const [qTotalPages, setQTotalPages] = useState(1);
  const [qTotal, setQTotal] = useState(0);
  const [qDifficulty, setQDifficulty] = useState<'all' | 'easy' | 'medium' | 'hard'>('all');
  const [qLoading, setQLoading] = useState(false);
  const [qError, setQError] = useState<string | null>(null);
  const [qChosen, setQChosen] = useState<Record<number, number>>({});
  const [qRevealed, setQRevealed] = useState<Record<number, boolean>>({});

  // Review Center flashcard pointer
  const [reviewIdx, setReviewIdx] = useState(0);
  const [reviewShowAnswer, setReviewShowAnswer] = useState(true);

  const hasPaidAccess = Boolean(
    user?.isAdmin || (user?.activeSubscription && user.activeSubscription.billing_cycle !== 'free')
  );
  const reviewLockedForFree = Boolean(
    freeLimits && freeLimits.allow_review_center === 0 && !hasPaidAccess
  );

  useEffect(() => {
    setPage(1);
    setQPage(1);
    setReviewIdx(0);
  }, [subMode, subjectSlug, search, qDifficulty]);

  // Fetch lessons list
  useEffect(() => {
    if (subMode !== 'lessons') return;
    let active = true;
    setLessonsLoading(true);
    const qs = new URLSearchParams({
      page: String(page),
      limit: '15',
      track: selectedTrack,
      subject: subjectSlug,
      level: 'all',
      lang: 'all',
      q: search.trim(),
    });
    apiRequest<{ lessons?: Lesson[]; totalPages?: number }>(`/api/lessons?${qs.toString()}`)
      .then((res) => {
        if (!active || !Array.isArray(res.lessons)) return;
        const map = new Map(
          catalog.lessons.map((l) => [l.id, { completed: l.completed, is_favorite: l.is_favorite }])
        );
        setServerLessons(
          res.lessons.map((l) => ({
            ...l,
            completed: l.completed ?? map.get(l.id)?.completed,
            is_favorite: l.is_favorite ?? map.get(l.id)?.is_favorite,
          }))
        );
        setTotalLessonPages(Math.max(1, Number(res.totalPages || 1)));
      })
      .catch(() => {
        if (active) setServerLessons(null);
      })
      .finally(() => {
        if (active) setLessonsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [subMode, page, selectedTrack, subjectSlug, search, catalog.lessons]);

  // Fetch lesson detail & check quota
  useEffect(() => {
    if (!activeLessonId) {
      setHydratedLesson(null);
      setLessonError(null);
      return;
    }
    let active = true;
    setLessonError(null);
    setMcqSelected({});
    setRevealedEx({});
    apiRequest<{ lesson?: Lesson }>(`/api/lessons/${activeLessonId}`)
      .then((r) => {
        if (active && r.lesson) setHydratedLesson(r.lesson);
      })
      .catch((err: any) => {
        if (!active) return;
        if (err?.status === 403 || err?.status === 402 || err?.data?.code === 'QUOTA_EXCEEDED') {
          const msg =
            err?.message ||
            tr(
              lang,
              'بلغت الحد اليومي للباقة المجانية. قم بالترقية للوصول غير المحدود.',
              'Limite quotidienne atteinte. Passez à la formule Pro.',
              'Daily free limit reached. Upgrade for unlimited access.'
            );
          setLessonError(msg);
          setPaywallReason(msg);
          setPaywallOpen(true);
        }
      });
    return () => {
      active = false;
    };
  }, [activeLessonId, lang]);

  // Fetch Question Bank OR Review Center questions
  useEffect(() => {
    if (subMode !== 'bank' && subMode !== 'review') return;
    if (subMode === 'review' && reviewLockedForFree) {
      const msg = tr(
        lang,
        'مركز المراجعة الكامل متاح للمشتركين في الباقات المدفوعة.',
        'Le centre de révision complet nécessite un abonnement.',
        'Full Review Center requires a paid plan.'
      );
      setQError(msg);
      return;
    }

    let active = true;
    setQLoading(true);
    setQError(null);
    const params = new URLSearchParams();
    if (selectedTrack !== 'all') params.set('track', selectedTrack);
    if (subjectSlug !== 'all') params.set('subject', subjectSlug);
    if (subMode === 'bank' && qDifficulty !== 'all') params.set('difficulty', qDifficulty);
    if (search.trim()) params.set('search', search.trim());
    params.set('page', String(qPage));
    params.set('limit', '12');

    apiRequest<{ questions: Question[]; total: number; totalPages: number }>(
      `/api/questions?${params.toString()}`
    )
      .then((res) => {
        if (!active) return;
        setQuestions(res.questions || []);
        setQTotal(Number(res.total || 0));
        setQTotalPages(Math.max(1, Number(res.totalPages || 1)));
        setReviewIdx(0);
      })
      .catch((err: any) => {
        if (!active) return;
        const msg =
          err?.message ||
          tr(lang, 'تعذر تحميل الأسئلة.', 'Erreur de chargement.', 'Failed to load.');
        setQError(msg);
        if (err?.status === 402 || err?.status === 403) {
          setPaywallReason(msg);
          setPaywallOpen(true);
        }
      })
      .finally(() => {
        if (active) setQLoading(false);
      });
    return () => {
      active = false;
    };
  }, [subMode, selectedTrack, subjectSlug, qDifficulty, search, qPage, lang, reviewLockedForFree]);

  const fallbackLessons = useMemo(() => {
    const q = search.trim().toLowerCase();
    return catalog.lessons.filter((l) => {
      if (subMode === 'favorites' && !l.is_favorite) return false;
      if (subjectSlug !== 'all' && l.subject_slug !== subjectSlug) return false;
      if (q && !`${l.title_ar} ${l.title_fr} ${l.summary_ar} ${l.summary_fr}`.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [catalog.lessons, subMode, subjectSlug, search]);

  const displayedLessons =
    subMode === 'favorites' ? fallbackLessons : serverLessons ?? fallbackLessons;

  const filteredSummaries = useMemo(() => {
    const q = search.trim().toLowerCase();
    return catalog.summaries.filter((s) => {
      if (subjectSlug !== 'all' && s.subject_slug !== subjectSlug) return false;
      if (q && !`${s.title_ar} ${s.title_fr} ${s.content_ar} ${s.content_fr}`.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [catalog.summaries, subjectSlug, search]);

  const activeLesson = useMemo(() => {
    if (!activeLessonId) return null;
    const base = catalog.lessons.find((l) => l.id === activeLessonId);
    if (hydratedLesson) {
      return {
        ...hydratedLesson,
        completed: base?.completed ?? hydratedLesson.completed,
        is_favorite: base?.is_favorite ?? hydratedLesson.is_favorite,
      };
    }
    return base || null;
  }, [activeLessonId, catalog.lessons, hydratedLesson]);

  const handleToggleProgress = async (lesson: Lesson, nextCompleted: boolean, nextFavorite: boolean) => {
    if (!user || !firebaseUser) return;
    triggerHaptic(10);
    setSavingProgress(true);
    try {
      const lessonKey = lesson.firestoreId || String(lesson.id);
      await Promise.all([
        setLessonProgressDoc(user.uid, lessonKey, nextCompleted, nextFavorite).catch(() => {}),
        apiRequest(`/api/lessons/${lesson.id}/progress`, {
          method: 'POST',
          json: { completed: nextCompleted, isFavorite: nextFavorite },
        }).catch(() => {}),
      ]);
    } finally {
      setSavingProgress(false);
    }
  };

  // 1) Lesson Reader View
  if (activeLessonId) {
    if (lessonError) {
      return (
        <div className="space-y-4">
          <div className="tdr-m-card p-6 text-center space-y-3">
            <Lock className="w-8 h-8 mx-auto" style={{ color: 'var(--m-brand-d)' }} />
            <h3 className="text-base font-extrabold tdr-m-kufi">
              {tr(lang, 'محتوى يتطلب الترقية', 'Accès limité', 'Upgrade Required')}
            </h3>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--m-ink-sub)' }}>
              {lessonError}
            </p>
            <button type="button" onClick={onOpenSubscriptions} className="tdr-m-btn-primary">
              {tr(lang, 'انتقل إلى النسخة المحترفة', 'Passer à Pro', 'Upgrade to Pro')}
            </button>
          </div>
          <MobilePaywallSheet
            open={paywallOpen}
            onClose={() => setPaywallOpen(false)}
            reason={paywallReason}
            onViewSubscriptions={onOpenSubscriptions}
          />
        </div>
      );
    }

    if (!activeLesson) {
      return <MobileSkeletonList count={4} />;
    }

    const title = isAr ? activeLesson.title_ar : activeLesson.title_fr || activeLesson.title_ar;
    const summary = isAr ? activeLesson.summary_ar : activeLesson.summary_fr || activeLesson.summary_ar;
    const explanation = isAr
      ? activeLesson.explanation_ar
      : activeLesson.explanation_fr || activeLesson.explanation_ar;

    return (
      <div className="space-y-4">
        <div className="tdr-m-hero-card space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-extrabold tdr-m-kufi leading-snug">{title}</h2>
              {summary && <p className="text-xs opacity-90 mt-1 leading-relaxed">{summary}</p>}
            </div>
            <button
              type="button"
              disabled={savingProgress}
              onClick={() =>
                void handleToggleProgress(
                  activeLesson,
                  Boolean(activeLesson.completed),
                  !activeLesson.is_favorite
                )
              }
              aria-label="Favorite"
              className="w-11 h-11 rounded-full flex items-center justify-center shrink-0 cursor-pointer"
              style={{ background: 'rgba(28, 42, 14, 0.16)' }}
            >
              <Heart
                className="w-5 h-5"
                fill={activeLesson.is_favorite ? '#1c2a0e' : 'none'}
                color="#1c2a0e"
              />
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={savingProgress}
              onClick={() =>
                void handleToggleProgress(
                  activeLesson,
                  !activeLesson.completed,
                  Boolean(activeLesson.is_favorite)
                )
              }
              className="min-h-[42px] px-4 rounded-xl font-extrabold text-xs inline-flex items-center gap-1.5 cursor-pointer"
              style={
                activeLesson.completed
                  ? { background: '#1c2a0e', color: '#e6f2c4' }
                  : { background: '#ffffff', color: '#1c2a0e' }
              }
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>
                {activeLesson.completed
                  ? tr(lang, 'تم إكمال الدرس', 'Leçon terminée', 'Completed')
                  : tr(lang, 'تحديد كمكتمل', 'Marquer comme terminé', 'Mark Completed')}
              </span>
            </button>
          </div>
        </div>

        {/* Audio Narration */}
        <div className="tdr-m-card p-3">
          <AudioPlayerBar
            audioId={`m-lesson-${activeLesson.id}`}
            arabicSpeechText={activeLesson.explanation_speech_ar}
            arabicFallbackText={activeLesson.explanation_ar}
            frenchText={activeLesson.explanation_fr}
            label={tr(lang, 'الاستماع إلى شرح الدرس', 'Écouter l’explication', 'Listen to Lesson')}
          />
        </div>

        {/* Explanation */}
        <div className="tdr-m-card p-4 space-y-2 tdr-m-selectable">
          <h3 className="text-sm font-extrabold tdr-m-kufi" style={{ color: 'var(--m-brand-deep)' }}>
            {tr(lang, 'الشرح المفصل', 'Explication détaillée', 'Detailed Explanation')}
          </h3>
          <div className="text-sm leading-7 whitespace-pre-line" style={{ color: 'var(--m-ink)' }}>
            {explanation}
          </div>
        </div>

        {/* Examples */}
        {Array.isArray(activeLesson.examples) && activeLesson.examples.length > 0 && (
          <div className="tdr-m-card p-4 space-y-3 tdr-m-selectable">
            <h3 className="text-sm font-extrabold tdr-m-kufi" style={{ color: 'var(--m-brand-deep)' }}>
              {tr(lang, 'أمثلة تطبيقية', 'Exemples pratiques', 'Examples')}
            </h3>
            {activeLesson.examples.map((ex, idx) => (
              <div
                key={idx}
                className="p-3 rounded-xl space-y-1"
                style={{ background: 'var(--m-surface-muted)' }}
              >
                <div className="text-xs font-extrabold">
                  {isAr ? ex.title_ar : ex.title_fr || ex.title_ar}
                </div>
                <div className="text-xs leading-relaxed whitespace-pre-line" style={{ color: 'var(--m-ink-sub)' }}>
                  {isAr ? ex.content_ar : ex.content_fr || ex.content_ar}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Exercises */}
        {Array.isArray(activeLesson.exercises) && activeLesson.exercises.length > 0 && (
          <div className="tdr-m-card p-4 space-y-3 tdr-m-selectable">
            <h3 className="text-sm font-extrabold tdr-m-kufi" style={{ color: 'var(--m-brand-deep)' }}>
              {tr(lang, 'تمارين تطبيقية', 'Exercices', 'Exercises')}
            </h3>
            {activeLesson.exercises.map((ex, idx) => (
              <div
                key={idx}
                className="p-3 rounded-xl space-y-2"
                style={{ background: 'var(--m-surface-muted)' }}
              >
                <div className="text-xs font-bold leading-relaxed">
                  {isAr ? ex.prompt_ar : ex.prompt_fr || ex.prompt_ar}
                </div>
                <button
                  type="button"
                  onClick={() => setRevealedEx((p) => ({ ...p, [idx]: !p[idx] }))}
                  className="text-xs font-extrabold cursor-pointer"
                  style={{ color: 'var(--m-brand-deep)' }}
                >
                  {revealedEx[idx]
                    ? tr(lang, 'إخفاء الحل', 'Masquer la solution', 'Hide Solution')
                    : tr(lang, 'إظهار الحل النموذجي', 'Voir la solution', 'Show Solution')}
                </button>
                {revealedEx[idx] && (
                  <div
                    className="text-xs p-2.5 rounded-lg leading-relaxed whitespace-pre-line"
                    style={{ background: 'var(--m-brand-tint)', color: 'var(--m-ink)' }}
                  >
                    {isAr ? ex.solution_ar : ex.solution_fr || ex.solution_ar}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Self-check MCQs */}
        {Array.isArray(activeLesson.mcq) && activeLesson.mcq.length > 0 && (
          <div className="tdr-m-card p-4 space-y-4">
            <h3 className="text-sm font-extrabold tdr-m-kufi" style={{ color: 'var(--m-brand-deep)' }}>
              {tr(lang, 'اختبر فهمك', 'Auto-évaluation', 'Quick Quiz')}
            </h3>
            {activeLesson.mcq.map((q, qIdx) => {
              const chosen = mcqSelected[qIdx];
              const opts = isAr ? q.options_ar : q.options_fr || q.options_ar;
              return (
                <div
                  key={qIdx}
                  className="space-y-2 pb-3 border-b last:border-b-0"
                  style={{ borderColor: 'var(--m-border)' }}
                >
                  <div className="text-xs font-extrabold">
                    {qIdx + 1}. {isAr ? q.stem_ar : q.stem_fr || q.stem_ar}
                  </div>
                  <div className="space-y-1.5">
                    {opts.map((opt, oIdx) => {
                      const isPicked = chosen === oIdx;
                      const isCorrect = oIdx === q.correct_index;
                      let bg = 'var(--m-surface-muted)';
                      let fg = 'var(--m-ink)';
                      let bd = 'var(--m-border)';
                      if (chosen !== undefined) {
                        if (isCorrect) {
                          bg = 'var(--m-ok-soft)';
                          fg = 'var(--m-ok)';
                          bd = 'var(--m-ok)';
                        } else if (isPicked) {
                          bg = 'var(--m-errbg)';
                          fg = 'var(--m-err)';
                          bd = 'var(--m-err)';
                        }
                      }
                      return (
                        <button
                          key={oIdx}
                          type="button"
                          onClick={() => {
                            triggerHaptic(8);
                            setMcqSelected((p) => ({ ...p, [qIdx]: oIdx }));
                          }}
                          className="w-full min-h-[44px] px-3 py-2 rounded-xl text-start text-xs font-bold border transition-colors cursor-pointer"
                          style={{ background: bg, color: fg, borderColor: bd }}
                        >
                          {opt}
                        </button>
                      );
                    })}
                  </div>
                  {chosen !== undefined && (q.explanation_ar || q.explanation_fr) && (
                    <div
                      className="text-[11px] p-2.5 rounded-xl font-semibold"
                      style={{ background: 'var(--m-brand-soft)', color: 'var(--m-brand-deep)' }}
                    >
                      {isAr ? q.explanation_ar : q.explanation_fr || q.explanation_ar}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // 2) Summary Reader View
  if (activeSummary) {
    return (
      <div className="space-y-4">
        <div className="tdr-m-hero-card">
          <h2 className="text-base font-extrabold tdr-m-kufi">
            {isAr ? activeSummary.title_ar : activeSummary.title_fr || activeSummary.title_ar}
          </h2>
        </div>
        <div className="tdr-m-card p-3">
          <AudioPlayerBar
            audioId={`m-summary-${activeSummary.id}`}
            arabicSpeechText={activeSummary.content_speech_ar}
            arabicFallbackText={activeSummary.content_ar}
            frenchText={activeSummary.content_fr}
            label={tr(lang, 'استماع للملخص', 'Écouter le résumé', 'Listen to Summary')}
          />
        </div>
        <div className="tdr-m-card p-4 space-y-3 tdr-m-selectable">
          <p className="text-sm leading-7 whitespace-pre-line">
            {isAr ? activeSummary.content_ar : activeSummary.content_fr || activeSummary.content_ar}
          </p>
          {Array.isArray(activeSummary.key_points) && activeSummary.key_points.length > 0 && (
            <div className="pt-3 border-t space-y-2" style={{ borderColor: 'var(--m-border)' }}>
              <h4 className="text-xs font-extrabold tdr-m-kufi" style={{ color: 'var(--m-brand-deep)' }}>
                {tr(lang, 'النقاط الأساسية', 'Points clés', 'Key Points')}
              </h4>
              {activeSummary.key_points.map((kp, i) => (
                <div key={i} className="p-2.5 rounded-xl text-xs font-semibold" style={{ background: 'var(--m-surface-muted)' }}>
                  • {isAr ? kp.ar : kp.fr || kp.ar}
                </div>
              ))}
            </div>
          )}
        </div>
        <button type="button" onClick={() => setActiveSummary(null)} className="tdr-m-btn-secondary w-full">
          {tr(lang, 'العودة إلى الملخصات', 'Retour aux résumés', 'Back to Summaries')}
        </button>
      </div>
    );
  }

  const currentReviewQ = questions[reviewIdx];

  return (
    <div className="space-y-4">
      {/* Sub-mode Horizontal Pill Selector (no overflow on 360px) */}
      <div className="tdr-m-card p-1.5 flex items-center gap-1 overflow-x-auto tdr-m-no-scrollbar">
        {(
          [
            { id: 'lessons', label: tr(lang, 'الدروس', 'Leçons', 'Lessons') },
            { id: 'summaries', label: tr(lang, 'الملخصات', 'Résumés', 'Summaries') },
            { id: 'bank', label: tr(lang, 'الأسئلة', 'Banque', 'Bank') },
            { id: 'review', label: tr(lang, 'المراجعة', 'Révision', 'Review') },
            { id: 'favorites', label: tr(lang, 'المفضلة', 'Favoris', 'Saved') },
          ] as Array<{ id: MobileLearnSubMode; label: string }>
        ).map((tab) => {
          const active = subMode === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                triggerHaptic(6);
                onChangeSubMode(tab.id);
              }}
              className="min-h-[40px] px-3.5 rounded-xl text-xs font-extrabold transition-colors cursor-pointer shrink-0 flex-1"
              style={
                active
                  ? { background: 'var(--m-brand)', color: 'var(--m-btn-ink)' }
                  : { background: 'transparent', color: 'var(--m-ink-sub)' }
              }
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Search + Subject Filter */}
      <div className="tdr-m-card p-3 space-y-2.5">
        <div className="relative flex items-center">
          <Search className="w-4 h-4 absolute start-3" style={{ color: 'var(--m-muted)' }} />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={tr(lang, 'ابحث بالاسم أو الموضوع...', 'Rechercher...', 'Search...')}
            className="tdr-m-input ps-10"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto tdr-m-no-scrollbar pb-0.5">
          <button
            type="button"
            onClick={() => onChangeSubjectSlug('all')}
            className="min-h-[36px] px-3.5 rounded-xl text-xs font-bold shrink-0 border cursor-pointer"
            style={
              subjectSlug === 'all'
                ? { background: 'var(--m-brand)', color: 'var(--m-btn-ink)', borderColor: 'var(--m-brand-d)' }
                : { background: 'var(--m-surface-muted)', color: 'var(--m-ink-sub)', borderColor: 'var(--m-border)' }
            }
          >
            {tr(lang, 'كل المواد', 'Toutes', 'All')}
          </button>
          {catalog.subjects.map((s) => (
            <button
              key={s.slug}
              type="button"
              onClick={() => onChangeSubjectSlug(s.slug)}
              className="min-h-[36px] px-3.5 rounded-xl text-xs font-bold shrink-0 border cursor-pointer"
              style={
                subjectSlug === s.slug
                  ? { background: 'var(--m-brand)', color: 'var(--m-btn-ink)', borderColor: 'var(--m-brand-d)' }
                  : { background: 'var(--m-surface-muted)', color: 'var(--m-ink-sub)', borderColor: 'var(--m-border)' }
              }
            >
              {isAr ? s.name_ar : s.name_fr || s.name_ar}
            </button>
          ))}
        </div>
      </div>

      {/* LESSONS OR FAVORITES LIST */}
      {(subMode === 'lessons' || subMode === 'favorites') && (
        <div className="space-y-2.5">
          {subMode === 'lessons' && lessonsLoading && !serverLessons ? (
            <MobileSkeletonList count={4} />
          ) : displayedLessons.length === 0 ? (
            <div className="tdr-m-card p-6 text-center text-xs font-bold" style={{ color: 'var(--m-muted)' }}>
              {subMode === 'favorites'
                ? tr(lang, 'لا توجد دروس مفضلة بعد.', 'Aucune leçon favorite.', 'No favorite lessons yet.')
                : tr(lang, 'لا توجد دروس مطابقة لبحثك.', 'Aucune leçon trouvée.', 'No matching lessons.')}
            </div>
          ) : (
            displayedLessons.map((lesson) => {
              const subj = catalog.subjects.find((s) => s.slug === lesson.subject_slug);
              return (
                <MobileListRow
                  key={lesson.id}
                  dir={isAr ? 'rtl' : 'ltr'}
                  icon={
                    lesson.completed ? (
                      <CheckCircle2 className="w-5 h-5" />
                    ) : (
                      <BookOpen className="w-5 h-5" />
                    )
                  }
                  title={isAr ? lesson.title_ar : lesson.title_fr || lesson.title_ar}
                  subtitle={
                    (subj ? (isAr ? subj.name_ar : subj.name_fr) : lesson.subject_slug) +
                    (lesson.is_favorite ? ' • ♥' : '')
                  }
                  onClick={() => onSelectLesson(lesson.id)}
                />
              );
            })
          )}

          {subMode === 'lessons' && totalLessonPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="tdr-m-btn-secondary disabled:opacity-40"
              >
                <ChevronRight className="w-4 h-4" />
                <span>{tr(lang, 'السابق', 'Précédent', 'Prev')}</span>
              </button>
              <span className="text-xs font-extrabold tabular-nums">
                {page} / {totalLessonPages}
              </span>
              <button
                type="button"
                disabled={page >= totalLessonPages}
                onClick={() => setPage((p) => p + 1)}
                className="tdr-m-btn-secondary disabled:opacity-40"
              >
                <span>{tr(lang, 'التالي', 'Suivant', 'Next')}</span>
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* SUMMARIES LIST */}
      {subMode === 'summaries' && (
        <div className="space-y-2.5">
          {filteredSummaries.length === 0 ? (
            <div className="tdr-m-card p-6 text-center text-xs font-bold" style={{ color: 'var(--m-muted)' }}>
              {tr(lang, 'لا توجد ملخصات متاحة.', 'Aucun résumé disponible.', 'No summaries found.')}
            </div>
          ) : (
            filteredSummaries.map((sum) => {
              const subj = catalog.subjects.find((s) => s.slug === sum.subject_slug);
              return (
                <MobileListRow
                  key={sum.id}
                  dir={isAr ? 'rtl' : 'ltr'}
                  icon={<FileText className="w-5 h-5" />}
                  title={isAr ? sum.title_ar : sum.title_fr || sum.title_ar}
                  subtitle={subj ? (isAr ? subj.name_ar : subj.name_fr) : sum.subject_slug}
                  onClick={() => setActiveSummary(sum)}
                />
              );
            })
          )}
        </div>
      )}

      {/* REVIEW CENTER (Flashcard Q&A Mode) */}
      {subMode === 'review' && (
        <div className="space-y-3">
          {qError ? (
            <div className="tdr-m-card p-6 text-center space-y-3">
              <Lock className="w-8 h-8 mx-auto" style={{ color: 'var(--m-brand-d)' }} />
              <p className="text-xs font-bold" style={{ color: 'var(--m-ink)' }}>
                {qError}
              </p>
              <button type="button" onClick={onOpenSubscriptions} className="tdr-m-btn-primary">
                {tr(lang, 'ترقية الباقة لفتح مركز المراجعة', 'Passer à Pro', 'Upgrade to Unlock')}
              </button>
            </div>
          ) : qLoading ? (
            <MobileSkeletonList count={3} />
          ) : !currentReviewQ ? (
            <div className="tdr-m-card p-6 text-center text-xs font-bold" style={{ color: 'var(--m-muted)' }}>
              {tr(lang, 'لا توجد أسئلة للمراجعة بهذه التصفية.', 'Aucune question trouvée.', 'No review cards found.')}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="tdr-m-card p-4 space-y-3 tdr-m-selectable">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className="text-[11px] font-extrabold px-2.5 py-1 rounded-full"
                    style={{ background: 'var(--m-brand-soft)', color: 'var(--m-brand-deep)' }}
                  >
                    {tr(lang, `بطاقة ${reviewIdx + 1} / ${questions.length}`, `Carte ${reviewIdx + 1}/${questions.length}`, `Card ${reviewIdx + 1}/${questions.length}`)}
                  </span>
                  <span className="text-[11px] font-bold truncate" style={{ color: 'var(--m-muted)' }}>
                    {isAr ? currentReviewQ.topic_ar : currentReviewQ.topic_fr || currentReviewQ.topic_ar}
                  </span>
                </div>

                <h3 className="text-sm font-extrabold leading-relaxed">
                  {isAr ? currentReviewQ.stem_ar : currentReviewQ.stem_fr || currentReviewQ.stem_ar}
                </h3>

                <AudioPlayerBar
                  audioId={`m-rev-${currentReviewQ.id}`}
                  arabicSpeechText={currentReviewQ.stem_speech_ar}
                  arabicFallbackText={currentReviewQ.stem_ar}
                  frenchText={currentReviewQ.stem_fr}
                  label={tr(lang, 'استماع للسؤال', 'Écouter la question', 'Listen')}
                />

                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic(8);
                    setReviewShowAnswer((p) => !p);
                  }}
                  className="tdr-m-btn-secondary w-full"
                >
                  {reviewShowAnswer ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  <span>
                    {reviewShowAnswer
                      ? tr(lang, 'إخفاء الإجابة والشرح', 'Masquer la réponse', 'Hide Answer')
                      : tr(lang, 'إظهار الإجابة النموذجية', 'Afficher la réponse', 'Show Answer')}
                  </span>
                </button>

                {reviewShowAnswer && (
                  <div
                    className="p-3.5 rounded-xl space-y-2 border"
                    style={{
                      background: 'var(--m-brand-tint)',
                      borderColor: 'var(--m-brand-border)',
                    }}
                  >
                    {Array.isArray(currentReviewQ.options_ar) &&
                      typeof currentReviewQ.correct_index === 'number' &&
                      currentReviewQ.options_ar[currentReviewQ.correct_index] && (
                        <div className="text-xs font-extrabold" style={{ color: 'var(--m-brand-deep)' }}>
                          ✓{' '}
                          {isAr
                            ? currentReviewQ.options_ar[currentReviewQ.correct_index]
                            : currentReviewQ.options_fr?.[currentReviewQ.correct_index] ||
                              currentReviewQ.options_ar[currentReviewQ.correct_index]}
                        </div>
                      )}
                    {(currentReviewQ.explanation_ar || currentReviewQ.answer_ar) && (
                      <div className="text-xs leading-relaxed" style={{ color: 'var(--m-ink)' }}>
                        {isAr
                          ? currentReviewQ.explanation_ar || currentReviewQ.answer_ar
                          : currentReviewQ.explanation_fr ||
                            currentReviewQ.answer_fr ||
                            currentReviewQ.explanation_ar}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  disabled={reviewIdx <= 0 && qPage <= 1}
                  onClick={() => {
                    if (reviewIdx > 0) setReviewIdx((i) => i - 1);
                    else if (qPage > 1) setQPage((p) => p - 1);
                  }}
                  className="tdr-m-btn-secondary disabled:opacity-40"
                >
                  <ChevronRight className="w-4 h-4" />
                  <span>{tr(lang, 'البطاقة السابقة', 'Précédent', 'Previous')}</span>
                </button>
                <button
                  type="button"
                  disabled={reviewIdx >= questions.length - 1 && qPage >= qTotalPages}
                  onClick={() => {
                    if (reviewIdx < questions.length - 1) setReviewIdx((i) => i + 1);
                    else if (qPage < qTotalPages) setQPage((p) => p + 1);
                  }}
                  className="tdr-m-btn-primary disabled:opacity-40"
                >
                  <span>{tr(lang, 'البطاقة التالية', 'Suivant', 'Next')}</span>
                  <ChevronLeft className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* QUESTION BANK */}
      {subMode === 'bank' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2 px-1">
            <span className="text-xs font-extrabold" style={{ color: 'var(--m-ink-sub)' }}>
              {tr(lang, `إجمالي الأسئلة: ${qTotal}`, `Total : ${qTotal}`, `Total: ${qTotal}`)}
            </span>
            <select
              value={qDifficulty}
              onChange={(e) => setQDifficulty(e.target.value as any)}
              className="tdr-m-select"
              style={{ width: 'auto', minHeight: 38, padding: '6px 12px', fontSize: '0.78rem' }}
            >
              <option value="all">{tr(lang, 'كل الصعوبات', 'Tous niveaux', 'All Levels')}</option>
              <option value="easy">{tr(lang, 'سهل', 'Facile', 'Easy')}</option>
              <option value="medium">{tr(lang, 'متوسط', 'Moyen', 'Medium')}</option>
              <option value="hard">{tr(lang, 'متقدم', 'Avancé', 'Hard')}</option>
            </select>
          </div>

          {qError ? (
            <div className="tdr-m-card p-5 text-center space-y-3">
              <p className="text-xs font-bold" style={{ color: 'var(--m-err)' }}>
                {qError}
              </p>
              <button type="button" onClick={onOpenSubscriptions} className="tdr-m-btn-primary">
                {tr(lang, 'ترقية الباقة', 'Mettre à niveau', 'Upgrade')}
              </button>
            </div>
          ) : qLoading ? (
            <MobileSkeletonList count={3} />
          ) : questions.length === 0 ? (
            <div className="tdr-m-card p-6 text-center text-xs font-bold" style={{ color: 'var(--m-muted)' }}>
              {tr(lang, 'لا توجد أسئلة مطابقة.', 'Aucune question.', 'No questions found.')}
            </div>
          ) : (
            <div className="space-y-3">
              {questions.map((q) => {
                const chosen = qChosen[q.id];
                const isRev = qRevealed[q.id] || chosen !== undefined;
                const opts = isAr ? q.options_ar : q.options_fr || q.options_ar;
                return (
                  <div key={q.id} className="tdr-m-card p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="tdr-m-icon-circle" style={{ width: 32, height: 32 }}>
                          <HelpCircle className="w-4 h-4" />
                        </span>
                        <span className="text-[11px] font-bold" style={{ color: 'var(--m-muted)' }}>
                          {isAr ? q.topic_ar : q.topic_fr || q.topic_ar}
                        </span>
                      </div>
                      <span
                        className="text-[10px] font-extrabold px-2 py-1 rounded-lg"
                        style={{ background: 'var(--m-brand-soft)', color: 'var(--m-brand-deep)' }}
                      >
                        {q.difficulty}
                      </span>
                    </div>

                    <div className="text-sm font-bold leading-relaxed">
                      {isAr ? q.stem_ar : q.stem_fr || q.stem_ar}
                    </div>

                    {Array.isArray(opts) && opts.length > 0 && (
                      <div className="space-y-1.5">
                        {opts.map((opt, idx) => {
                          const isCorrect = idx === q.correct_index;
                          const isPicked = chosen === idx;
                          let bg = 'var(--m-surface-muted)';
                          let fg = 'var(--m-ink)';
                          let bd = 'var(--m-border)';
                          if (isRev) {
                            if (isCorrect) {
                              bg = 'var(--m-ok-soft)';
                              fg = 'var(--m-ok)';
                              bd = 'var(--m-ok)';
                            } else if (isPicked) {
                              bg = 'var(--m-errbg)';
                              fg = 'var(--m-err)';
                              bd = 'var(--m-err)';
                            }
                          }
                          return (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => {
                                triggerHaptic(8);
                                setQChosen((p) => ({ ...p, [q.id]: idx }));
                              }}
                              className="w-full min-h-[44px] px-3 py-2 rounded-xl text-start text-xs font-bold border cursor-pointer"
                              style={{ background: bg, color: fg, borderColor: bd }}
                            >
                              {opt}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => setQRevealed((p) => ({ ...p, [q.id]: !p[q.id] }))}
                        className="text-xs font-extrabold py-1 cursor-pointer"
                        style={{ color: 'var(--m-brand-deep)' }}
                      >
                        {isRev
                          ? tr(lang, 'إخفاء الشرح', 'Masquer', 'Hide')
                          : tr(lang, 'كشف الإجابة', 'Voir la réponse', 'Reveal Answer')}
                      </button>
                    </div>

                    {isRev && (q.explanation_ar || q.explanation_fr || q.answer_ar) && (
                      <div
                        className="p-3 rounded-xl text-xs font-semibold leading-relaxed"
                        style={{ background: 'var(--m-brand-soft)', color: 'var(--m-brand-deep)' }}
                      >
                        {isAr
                          ? q.explanation_ar || q.answer_ar
                          : q.explanation_fr || q.answer_fr || q.explanation_ar}
                      </div>
                    )}
                  </div>
                );
              })}

              {qTotalPages > 1 && (
                <div className="flex items-center justify-between pt-1">
                  <button
                    type="button"
                    disabled={qPage <= 1}
                    onClick={() => setQPage((p) => Math.max(1, p - 1))}
                    className="tdr-m-btn-secondary disabled:opacity-40"
                  >
                    <ChevronRight className="w-4 h-4" />
                    <span>{tr(lang, 'السابق', 'Précédent', 'Prev')}</span>
                  </button>
                  <span className="text-xs font-extrabold tabular-nums">
                    {qPage} / {qTotalPages}
                  </span>
                  <button
                    type="button"
                    disabled={qPage >= qTotalPages}
                    onClick={() => setQPage((p) => p + 1)}
                    className="tdr-m-btn-secondary disabled:opacity-40"
                  >
                    <span>{tr(lang, 'التالي', 'Suivant', 'Next')}</span>
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <MobilePaywallSheet
        open={paywallOpen}
        onClose={() => setPaywallOpen(false)}
        reason={paywallReason}
        onViewSubscriptions={onOpenSubscriptions}
      />
    </div>
  );
};
