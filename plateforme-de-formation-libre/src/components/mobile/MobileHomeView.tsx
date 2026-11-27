import React, { useEffect, useMemo, useState } from 'react';
import {
  Award,
  BookOpen,
  CheckCircle2,
  Flame,
  GraduationCap,
  HelpCircle,
  Layers,
  Search,
  Sparkles,
  Target,
  TrendingUp,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import type { StudentStudyGoals } from '../../types';
import { apiRequest } from '../../utils/api';
import { formatUserLevelDisplay } from '../../utils/levelLabels';
import { tr } from '../../utils/locale';
import { MobileListRow, MobileSkeletonList } from './MobilePrimitives';

interface StudentStatsSummary {
  examsCompleted: number;
  avgScore: number;
  bestScore: number;
  lessonsCompleted: number;
  totalLessons: number;
  favoriteLessons: number;
}

export const MobileHomeView: React.FC<{
  installCard?: React.ReactNode;
  onOpenLesson: (lessonId: number, subjectSlug?: string) => void;
  onOpenSubject: (subjectSlug: string) => void;
  onOpenExams: () => void;
  onOpenSubscriptions: () => void;
  onOpenQuestionBank: () => void;
  onOpenReviewCenter: () => void;
}> = ({
  installCard,
  onOpenLesson,
  onOpenSubject,
  onOpenExams,
  onOpenSubscriptions,
  onOpenQuestionBank,
  onOpenReviewCenter,
}) => {
  const { lang, user, catalog, selectedTrack } = useApp();
  const isAr = lang === 'ar';

  const [queryText, setQueryText] = useState('');
  const [stats, setStats] = useState<StudentStatsSummary | null>(null);
  const [goals, setGoals] = useState<StudentStudyGoals | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const [editingGoal, setEditingGoal] = useState(false);
  const [targetMins, setTargetMins] = useState(45);
  const [targetQuestions, setTargetQuestions] = useState(20);
  const [savingGoal, setSavingGoal] = useState(false);

  useEffect(() => {
    let active = true;
    setLoadingStats(true);
    Promise.all([
      apiRequest<StudentStatsSummary>('/api/student/stats').catch(() => null),
      apiRequest<{ goals?: StudentStudyGoals }>('/api/student/goals').catch(() => null),
    ])
      .then(([st, g]) => {
        if (!active) return;
        if (st) setStats(st);
        if (g?.goals) {
          setGoals(g.goals);
          setTargetMins(Number(g.goals.daily_target_minutes || 45));
          setTargetQuestions(Number(g.goals.daily_questions_target || 20));
        }
      })
      .finally(() => {
        if (active) setLoadingStats(false);
      });
    return () => {
      active = false;
    };
  }, [user?.uid]);

  const completedLocalCount = useMemo(
    () => catalog.lessons.filter((l) => l.completed).length,
    [catalog.lessons]
  );

  const visibleSubjects = useMemo(() => {
    const track = selectedTrack !== 'all' ? selectedTrack : user?.track || 'all';
    const list = catalog.subjects.filter(
      (s) => track === 'all' || !s.tracks?.length || s.tracks.includes(track) || s.tracks.includes('all')
    );
    return (list.length ? list : catalog.subjects).slice(0, 8);
  }, [catalog.subjects, selectedTrack, user?.track]);

  const searchResults = useMemo(() => {
    const q = queryText.trim().toLowerCase();
    if (!q) return [];
    return catalog.lessons
      .filter((l) =>
        `${l.title_ar} ${l.title_fr} ${l.summary_ar} ${l.summary_fr}`.toLowerCase().includes(q)
      )
      .slice(0, 6);
  }, [catalog.lessons, queryText]);

  const recentLessons = useMemo(() => {
    const incomplete = catalog.lessons.filter((l) => !l.completed);
    const list = incomplete.length > 0 ? incomplete : catalog.lessons;
    return list.slice(0, 4);
  }, [catalog.lessons]);

  const isPaid = Boolean(user?.activeSubscription && user.activeSubscription.billing_cycle !== 'free');

  const handleSaveGoals = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingGoal(true);
    try {
      const res = await apiRequest<{ goals?: StudentStudyGoals }>('/api/student/goals', {
        method: 'PUT',
        json: {
          dailyTargetMinutes: targetMins,
          dailyQuestionsTarget: targetQuestions,
        },
      });
      if (res?.goals) setGoals(res.goals);
      setEditingGoal(false);
    } finally {
      setSavingGoal(false);
    }
  };

  return (
    <div className="space-y-4">
      {installCard}

      {/* Official Tadreebi Green Hero Card */}
      <div className="tdr-m-hero-card">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-1.5">
            <button
              type="button"
              onClick={onOpenSubscriptions}
              className="tdr-m-brand-pill cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>
                {isPaid
                  ? isAr
                    ? user?.activeSubscription?.name_ar || 'عضوية محترفة'
                    : user?.activeSubscription?.name_fr || 'Membre Pro'
                  : tr(lang, 'انتقل إلى النسخة المحترفة', 'Passer à Pro', 'Upgrade to Pro')}
              </span>
            </button>
            <h2 className="text-lg font-extrabold tdr-m-kufi pt-1 truncate">
              {tr(lang, `مرحباً، ${user?.name || ''}`, `Bonjour, ${user?.name || ''}`, `Hello, ${user?.name || ''}`)}
            </h2>
            <p className="text-xs opacity-90">
              {user
                ? formatUserLevelDisplay(
                    lang,
                    user.level,
                    user.teacher_category,
                    user.professor_specialty
                  )
                : ''}
            </p>
          </div>
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
            style={{ background: 'rgba(28, 42, 14, 0.14)', border: '1px solid rgba(28, 42, 14, 0.18)' }}
          >
            <GraduationCap className="w-6 h-6" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5 mt-4">
          <button
            type="button"
            onClick={() => {
              const first = recentLessons[0];
              if (first) onOpenLesson(first.id, first.subject_slug);
              else if (visibleSubjects[0]) onOpenSubject(visibleSubjects[0].slug);
            }}
            className="min-h-[44px] rounded-xl font-extrabold text-xs px-3 flex items-center justify-center gap-1.5 cursor-pointer shadow-sm active:scale-[0.98]"
            style={{ background: '#ffffff', color: '#1c2a0e' }}
          >
            <BookOpen className="w-4 h-4" />
            <span>{tr(lang, 'مواصلة التعلم', 'Continuer', 'Continue')}</span>
          </button>
          <button
            type="button"
            onClick={onOpenExams}
            className="min-h-[44px] rounded-xl font-extrabold text-xs px-3 flex items-center justify-center gap-1.5 cursor-pointer active:scale-[0.98]"
            style={{ background: '#1c2a0e', color: '#e6f2c4' }}
          >
            <Award className="w-4 h-4" />
            <span>{tr(lang, 'بدء امتحان', 'Passer un examen', 'Take Exam')}</span>
          </button>
        </div>
      </div>

      {/* Live Lesson Search */}
      <div className="tdr-m-card p-2">
        <div className="relative flex items-center">
          <Search className="w-4 h-4 absolute start-3.5" style={{ color: 'var(--m-muted)' }} />
          <input
            type="search"
            value={queryText}
            onChange={(e) => setQueryText(e.target.value)}
            placeholder={tr(lang, 'ابحث في الدروس والمواد...', 'Rechercher une leçon...', 'Search lessons & subjects...')}
            className="w-full min-h-[44px] ps-10 pe-3 bg-transparent text-sm outline-none"
            style={{ color: 'var(--m-ink)' }}
          />
        </div>
        {searchResults.length > 0 && (
          <div className="mt-2 pt-2 border-t space-y-1.5" style={{ borderColor: 'var(--m-border)' }}>
            {searchResults.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => {
                  setQueryText('');
                  onOpenLesson(l.id, l.subject_slug);
                }}
                className="w-full min-h-[44px] px-3 py-2 rounded-xl flex items-center justify-between gap-2 text-start hover:bg-black/5 cursor-pointer"
              >
                <span className="text-xs font-bold truncate">
                  {isAr ? l.title_ar : l.title_fr || l.title_ar}
                </span>
                <span className="text-[11px] font-bold shrink-0" style={{ color: 'var(--m-brand-deep)' }}>
                  {tr(lang, 'فتح', 'Ouvrir', 'Open')}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* KPI Metrics Grid */}
      {loadingStats && !stats ? (
        <div className="grid grid-cols-2 gap-3">
          <div className="tdr-m-skeleton h-24" />
          <div className="tdr-m-skeleton h-24" />
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="tdr-m-card p-3.5">
            <div className="flex items-center justify-between">
              <span className="tdr-m-icon-circle" style={{ width: 34, height: 34 }}>
                <CheckCircle2 className="w-4 h-4" />
              </span>
              <span className="text-lg font-extrabold tabular-nums">
                {stats?.lessonsCompleted ?? completedLocalCount}
                <span className="text-xs font-normal" style={{ color: 'var(--m-muted)' }}>
                  /{stats?.totalLessons || catalog.lessons.length}
                </span>
              </span>
            </div>
            <div className="text-xs font-bold mt-2" style={{ color: 'var(--m-ink-sub)' }}>
              {tr(lang, 'الدروس المكتملة', 'Leçons terminées', 'Completed Lessons')}
            </div>
          </div>

          <div className="tdr-m-card p-3.5">
            <div className="flex items-center justify-between">
              <span className="tdr-m-icon-circle" style={{ width: 34, height: 34 }}>
                <TrendingUp className="w-4 h-4" />
              </span>
              <span className="text-lg font-extrabold tabular-nums">
                {stats ? stats.avgScore.toFixed(1) : '0.0'}
                <span className="text-xs font-normal" style={{ color: 'var(--m-muted)' }}>
                  /20
                </span>
              </span>
            </div>
            <div className="text-xs font-bold mt-2" style={{ color: 'var(--m-ink-sub)' }}>
              {tr(lang, 'متوسط الامتحانات', 'Moyenne examens', 'Exam Average')}
            </div>
          </div>

          <button
            type="button"
            onClick={onOpenQuestionBank}
            className="tdr-m-card p-3.5 text-start cursor-pointer active:scale-[0.98]"
          >
            <div className="flex items-center justify-between">
              <span className="tdr-m-icon-circle" style={{ width: 34, height: 34 }}>
                <HelpCircle className="w-4 h-4" />
              </span>
              <span className="text-lg font-extrabold tabular-nums">
                {catalog.bankStats?.totalVerifiedQuestions || 0}
              </span>
            </div>
            <div className="text-xs font-bold mt-2" style={{ color: 'var(--m-ink-sub)' }}>
              {tr(lang, 'بنك الأسئلة', 'Banque QCM', 'Question Bank')}
            </div>
          </button>

          <button
            type="button"
            onClick={onOpenReviewCenter}
            className="tdr-m-card p-3.5 text-start cursor-pointer active:scale-[0.98]"
          >
            <div className="flex items-center justify-between">
              <span className="tdr-m-icon-circle" style={{ width: 34, height: 34 }}>
                <Flame className="w-4 h-4" />
              </span>
              <span className="text-lg font-extrabold tabular-nums">
                {goals?.streak_days ?? 0}
              </span>
            </div>
            <div className="text-xs font-bold mt-2" style={{ color: 'var(--m-ink-sub)' }}>
              {tr(lang, 'المواظبة والمراجعة', 'Série & Révision', 'Streak & Review')}
            </div>
          </button>
        </div>
      )}

      {/* Daily Study Goals Card */}
      <div className="tdr-m-card p-4 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="tdr-m-icon-circle" style={{ width: 34, height: 34 }}>
              <Target className="w-4 h-4" />
            </span>
            <div>
              <div className="text-xs font-extrabold tdr-m-kufi">
                {tr(lang, 'هدف المذاكرة اليومي', 'Objectif d’étude', 'Daily Study Goal')}
              </div>
              <div className="text-[11px]" style={{ color: 'var(--m-muted)' }}>
                {tr(
                  lang,
                  `${goals?.daily_target_minutes ?? 45} دقيقة • ${goals?.daily_questions_target ?? 20} سؤال`,
                  `${goals?.daily_target_minutes ?? 45} min • ${goals?.daily_questions_target ?? 20} QCM`,
                  `${goals?.daily_target_minutes ?? 45} min • ${goals?.daily_questions_target ?? 20} Qs`
                )}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setEditingGoal((p) => !p)}
            className="min-h-[34px] px-3 rounded-xl text-xs font-extrabold cursor-pointer"
            style={{ background: 'var(--m-brand-soft)', color: 'var(--m-brand-deep)' }}
          >
            {editingGoal ? tr(lang, 'إلغاء', 'Annuler', 'Cancel') : tr(lang, 'تعديل', 'Modifier', 'Edit')}
          </button>
        </div>

        {editingGoal && (
          <form onSubmit={handleSaveGoals} className="pt-2 border-t space-y-2.5" style={{ borderColor: 'var(--m-border)' }}>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-bold mb-1" style={{ color: 'var(--m-ink-sub)' }}>
                  {tr(lang, 'الدقائق يومياً', 'Min / jour', 'Mins / day')}
                </label>
                <input
                  type="number"
                  min={10}
                  max={480}
                  className="tdr-m-input"
                  value={targetMins}
                  onChange={(e) => setTargetMins(Number(e.target.value))}
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold mb-1" style={{ color: 'var(--m-ink-sub)' }}>
                  {tr(lang, 'الأسئلة يومياً', 'QCM / jour', 'Qs / day')}
                </label>
                <input
                  type="number"
                  min={5}
                  max={300}
                  className="tdr-m-input"
                  value={targetQuestions}
                  onChange={(e) => setTargetQuestions(Number(e.target.value))}
                />
              </div>
            </div>
            <button type="submit" disabled={savingGoal} className="tdr-m-btn-primary">
              {savingGoal
                ? tr(lang, 'جارٍ الحفظ...', 'Enregistrement...', 'Saving...')
                : tr(lang, 'حفظ الهدف اليومي', 'Enregistrer', 'Save Goal')}
            </button>
          </form>
        )}
      </div>

      {/* Quick Review Center Shortcut */}
      <MobileListRow
        dir={isAr ? 'rtl' : 'ltr'}
        icon={<Layers className="w-5 h-5" />}
        title={tr(lang, 'مركز المراجعة المكثفة', 'Centre de révision', 'Review Center')}
        subtitle={tr(
          lang,
          'راجع الأسئلة والإجابات النموذجية بالبطاقات والصوت',
          'Fiches questions/réponses avec audio',
          'Flashcard Q&A review with audio'
        )}
        onClick={onOpenReviewCenter}
      />

      {/* Subjects Grid */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-sm font-extrabold tdr-m-kufi">
            {tr(lang, 'المواد الدراسية', 'Matières', 'Subjects')}
          </h3>
          <button
            type="button"
            onClick={() => onOpenSubject('all')}
            className="text-xs font-extrabold min-h-[36px] px-2 cursor-pointer"
            style={{ color: 'var(--m-brand-deep)' }}
          >
            {tr(lang, 'عرض الكل', 'Tout voir', 'See All')}
          </button>
        </div>

        {catalog.subjects.length === 0 ? (
          <MobileSkeletonList count={2} />
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
            {visibleSubjects.map((sub) => (
              <button
                key={sub.slug}
                type="button"
                onClick={() => onOpenSubject(sub.slug)}
                className="tdr-m-card p-3.5 flex items-center gap-2.5 text-start cursor-pointer active:scale-[0.98]"
              >
                <span className="tdr-m-icon-circle" style={{ width: 36, height: 36 }}>
                  <BookOpen className="w-4 h-4" />
                </span>
                <span className="text-xs font-extrabold leading-snug line-clamp-2">
                  {isAr ? sub.name_ar : sub.name_fr || sub.name_ar}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Recommended / Continue Learning Lessons */}
      {recentLessons.length > 0 && (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-sm font-extrabold tdr-m-kufi">
              {tr(lang, 'دروس مقترحة لك', 'Leçons recommandées', 'Recommended Lessons')}
            </h3>
          </div>
          <div className="space-y-2.5">
            {recentLessons.map((lesson) => {
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
                    (lesson.completed
                      ? ` • ${tr(lang, 'مكتمل', 'Terminé', 'Completed')}`
                      : '')
                  }
                  onClick={() => onOpenLesson(lesson.id, lesson.subject_slug)}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
