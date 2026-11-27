import React, { useEffect, useState } from 'react';
import {
  Award,
  BarChart3,
  BookOpen,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  CreditCard,
  Flame,
  GraduationCap,
  Pause,
  Play,
  RotateCcw,
  Save,
  Target,
  TrendingUp,
  UserCheck,
  UserPlus,
  Users,
} from 'lucide-react';
import { VerifiedBadge } from '../components/VerifiedBadge';
import { useApp } from '../context/AppContext';
import { getT } from '../i18n/translations';
import type { EducatorCard, StudentInstitutionalSummary, StudentStudyGoals } from '../types';
import { apiRequest } from '../utils/api';
import { formatUserLevelLabel } from '../utils/levelLabels';
import { tr } from '../utils/locale';

interface StudentStats {
  examsCompleted: number;
  avgScore: number;
  bestScore: number;
  totalCorrect: number;
  totalWrong: number;
  totalUnanswered: number;
  lessonsCompleted: number;
  totalLessons: number;
  favoriteLessons: number;
  trend: Array<{ id: number; date: string; score_20: number; mode: string; subject_slug: string }>;
  strongTopics: Array<{ topic_ar: string; topic_fr: string; percentage: number; total: number; correct: number }>;
  weakTopics: Array<{ topic_ar: string; topic_fr: string; percentage: number; total: number; correct: number }>;
}

interface HistoryRow {
  id: number;
  title_ar: string;
  title_fr: string;
  mode: string;
  track: string;
  subject_slug: string;
  question_count: number;
  submitted_at: string;
  score_20: number;
  percentage: number;
}

export const DashboardPage: React.FC = () => {
  const { lang, user, goToAuth, navigate } = useApp();
  const t = getT(lang);

  const [stats, setStats] = useState<StudentStats | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [goals, setGoals] = useState<StudentStudyGoals | null>(null);
  const [goalMinutes, setGoalMinutes] = useState(45);
  const [goalQuestions, setGoalQuestions] = useState(20);
  const [goalScore, setGoalScore] = useState(14);
  const [savingGoals, setSavingGoals] = useState(false);
  const [goalsSavedMsg, setGoalsSavedMsg] = useState<string | null>(null);

  // Interactive Pomodoro timer (syncs completed minutes to /api/student/goals)
  const [pomoMode, setPomoMode] = useState<'focus' | 'break'>('focus');
  const [focusMins, setFocusMins] = useState(25);
  const [secondsLeft, setSecondsLeft] = useState(25 * 60);
  const [pomoRunning, setPomoRunning] = useState(false);

  const [loading, setLoading] = useState(true);
  const [institutional, setInstitutional] = useState<StudentInstitutionalSummary | null>(null);
  const [educators, setEducators] = useState<EducatorCard[]>([]);
  const [followingUserIds, setFollowingUserIds] = useState<Set<number>>(new Set());
  const [inviteBusyId, setInviteBusyId] = useState<number | null>(null);
  const [followBusyId, setFollowBusyId] = useState<number | null>(null);

  const loadInstitutional = async () => {
    try {
      const [instRes, eduRes, folRes] = await Promise.all([
        apiRequest<StudentInstitutionalSummary>('/api/student/institutional-summary').catch(() => null),
        apiRequest<{ educators?: EducatorCard[] }>('/api/educators').catch(() => ({ educators: [] })),
        apiRequest<{ followedUsers?: Array<{ id: number }> }>('/api/follows/mine').catch(() => ({
          followedUsers: [],
        })),
      ]);
      if (instRes) setInstitutional(instRes);
      if (Array.isArray(eduRes?.educators)) setEducators(eduRes.educators);
      if (Array.isArray(folRes?.followedUsers)) {
        setFollowingUserIds(new Set(folRes.followedUsers.map((u) => Number(u.id))));
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    let active = true;
    async function load() {
      setLoading(true);
      try {
        const [st, hist, goalsResp] = await Promise.all([
          apiRequest<StudentStats>('/api/student/stats'),
          apiRequest<{ history: HistoryRow[] }>('/api/exams/history'),
          apiRequest<{ goals?: StudentStudyGoals }>('/api/student/goals').catch(() => ({ goals: undefined })),
        ]);
        if (active) {
          setStats(st);
          setHistory(hist.history || []);
          if (goalsResp.goals) {
            setGoals(goalsResp.goals);
            setGoalMinutes(goalsResp.goals.daily_target_minutes || 45);
            setGoalQuestions(goalsResp.goals.daily_questions_target || 20);
            setGoalScore(goalsResp.goals.exam_goal_score || 14);
          }
        }
        await loadInstitutional();
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [user]);

  useEffect(() => {
    if (!pomoRunning) return;
    const id = window.setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          window.clearInterval(id);
          setPomoRunning(false);
          if (pomoMode === 'focus') {
            void apiRequest<{ ok: boolean; goals: StudentStudyGoals }>('/api/student/goals', {
              method: 'PUT',
              json: { logStudyMinutes: focusMins, incrementPomodoro: true },
            })
              .then((r) => {
                if (r.goals) setGoals(r.goals);
                setGoalsSavedMsg(
                  tr(
                    lang,
                    `أحسنت! تم تسجيل جلسة تركيز (${focusMins} دقيقة) في سلسلتك اليومية.`,
                    `Bravo ! Session de ${focusMins} min enregistrée.`,
                    `Great job! Logged ${focusMins} min focus session.`
                  )
                );
              })
              .catch(() => {});
          }
          const nextMode = pomoMode === 'focus' ? 'break' : 'focus';
          setPomoMode(nextMode);
          return nextMode === 'focus' ? focusMins * 60 : 5 * 60;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [pomoRunning, pomoMode, focusMins, lang]);

  const handleSaveGoals = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingGoals(true);
    setGoalsSavedMsg(null);
    try {
      const res = await apiRequest<{ ok: boolean; goals: StudentStudyGoals }>('/api/student/goals', {
        method: 'PUT',
        json: {
          dailyTargetMinutes: goalMinutes,
          dailyQuestionsTarget: goalQuestions,
          examGoalScore: goalScore,
        },
      });
      if (res.goals) setGoals(res.goals);
      setGoalsSavedMsg(tr(lang, 'تم حفظ أهدافك الدراسية بنجاح.', 'Objectifs enregistrés.', 'Study goals saved.'));
    } finally {
      setSavingGoals(false);
    }
  };

  const handleLogQuickSession = async (mins: number) => {
    try {
      const res = await apiRequest<{ ok: boolean; goals: StudentStudyGoals }>('/api/student/goals', {
        method: 'PUT',
        json: { logStudyMinutes: mins, incrementPomodoro: mins >= 15 },
      });
      if (res.goals) setGoals(res.goals);
      setGoalsSavedMsg(
        tr(
          lang,
          `تم تسجيل ${mins} دقيقة دراسة إضافية.`,
          `${mins} min d'étude enregistrées.`,
          `Logged ${mins} study minutes.`
        )
      );
    } catch {
      // ignore
    }
  };

  if (!user) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="addressp-box text-center space-y-4">
          <BarChart3 className="w-10 h-10 text-[#384D55] mx-auto" />
          <span className="ltitle">{t.navDashboard}</span>
          <p className="text-xs text-[#6b787e]">
            {tr(
              lang,
              'سجل الدخول لعرض إحصائيات مستواك، سجل الاختبارات السابقة، ونقاط القوة والضعف.',
              'Connectez-vous pour consulter vos statistiques, votre historique d’examens et votre progression.',
              'Sign in to view your statistics, exam history, strengths, and areas for review.'
            )}
          </p>
          <div className="flex justify-center gap-3">
            <button type="button" onClick={() => goToAuth('login')} className="imgsend2-secondary text-xs">
              {t.login}
            </button>
            <button type="button" onClick={() => goToAuth('register')} className="imgsend2 text-xs">
              {t.register}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (loading || !stats) {
    return <div className="px-4 py-10 text-center text-sm text-[#6b787e]">{t.loading}</div>;
  }

  const totalQ = stats.totalCorrect + stats.totalWrong + stats.totalUnanswered;
  const accuracy = totalQ > 0 ? Math.round((stats.totalCorrect / totalQ) * 100) : 0;

  return (
    <div className="px-4 sm:px-6 py-6 space-y-5">
      <div className="rotator-box mb-0">
        <div className="rotator-box-header">
          <span>
            {t.navDashboard} — {user.name}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => navigate('subscriptions')}
              className="imgsend2-secondary text-xs py-1.5 px-3"
            >
              <CreditCard className="w-4 h-4 text-[#384D55]" />
              <span>
                {user.activeSubscription
                  ? lang === 'ar'
                    ? `الباقة: ${user.activeSubscription.name_ar}`
                    : `Forfait : ${user.activeSubscription.name_fr}`
                  : t.navSubscriptions}
              </span>
            </button>
            <button
              type="button"
              onClick={() => navigate('exams')}
              className="imgsend2 text-xs py-1.5 px-4"
            >
              {t.startExam}
            </button>
          </div>
        </div>
        <p className="text-xs text-[#6b787e]">
          {tr(
            lang,
            `الشعبة: ${user.track} · الصفة/المستوى: ${formatUserLevelLabel(user.level, user.teacher_category, user.professor_specialty, lang)}`,
            `Filière : ${user.track} · Niveau : ${formatUserLevelLabel(user.level, user.teacher_category, user.professor_specialty, lang)}`,
            `Track: ${user.track} · Level: ${formatUserLevelLabel(user.level, user.teacher_category, user.professor_specialty, lang)}`
          )}
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="addressp-box mb-0 flex items-center gap-3">
          <div className="w-10 h-10 rounded-[3px] bg-[#efefef] border border-[#d8dfe2] text-[#384D55] flex items-center justify-center shrink-0">
            <ClipboardCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs text-[#6b787e]">
              {tr(lang, 'الاختبارات المنجزة', 'Examens complétés', 'Completed Exams')}
            </div>
            <div className="text-xl font-extrabold text-[#384D55] tabular-nums">{stats.examsCompleted}</div>
          </div>
        </div>

        <div className="addressp-box mb-0 flex items-center gap-3">
          <div className="w-10 h-10 rounded-[3px] bg-[#efefef] border border-[#d8dfe2] text-[#557a16] flex items-center justify-center shrink-0">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs text-[#6b787e]">
              {tr(lang, 'المعدل العام / 20', 'Moyenne / 20', 'Average Score / 20')}
            </div>
            <div className="text-xl font-extrabold text-[#384D55] tabular-nums">{stats.avgScore} / 20</div>
          </div>
        </div>

        <div className="addressp-box mb-0 flex items-center gap-3">
          <div className="w-10 h-10 rounded-[3px] bg-[#efefef] border border-[#d8dfe2] text-[#557a16] flex items-center justify-center shrink-0">
            <Award className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs text-[#6b787e]">
              {tr(lang, 'أفضل علامة / الدقة', 'Meilleure note / Précision', 'Best Score / Accuracy')}
            </div>
            <div className="text-xl font-extrabold text-[#384D55] tabular-nums">
              {stats.bestScore}/20 · {accuracy}%
            </div>
          </div>
        </div>

        <div className="addressp-box mb-0 flex items-center gap-3">
          <div className="w-10 h-10 rounded-[3px] bg-[#efefef] border border-[#d8dfe2] text-[#384D55] flex items-center justify-center shrink-0">
            <BookOpen className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs text-[#6b787e]">
              {tr(lang, 'الدروس المكتملة', 'Leçons terminées', 'Completed Lessons')}
            </div>
            <div className="text-xl font-extrabold text-[#384D55] tabular-nums">
              {stats.lessonsCompleted} / {stats.totalLessons}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="addressp-box mb-0 space-y-3">
          <span className="ltitle2">
            {tr(lang, 'تطور العلامات من 20', 'Évolution des notes sur 20', 'Score Progression (/20)')}
          </span>
          {stats.trend.length === 0 ? (
            <p className="text-xs text-[#6b787e] py-6 text-center">
              {tr(
                lang,
                'أجرِ اختبارك الأول ليظهر مسار تطور علاماتك هنا.',
                'Passez votre premier examen pour afficher votre progression.',
                'Complete your first exam to display your score trend here.'
              )}
            </p>
          ) : (
            <div className="flex items-end gap-2 h-40 pt-4 border-b border-[#efefef]">
              {stats.trend.slice(-10).map((pt) => {
                const h = Math.max(8, Math.round((pt.score_20 / 20) * 100));
                return (
                  <div key={pt.id} className="flex-1 flex flex-col items-center justify-end gap-1 h-full">
                    <span className="text-[10px] font-bold text-[#384D55] tabular-nums">{pt.score_20}</span>
                    <div
                      className="w-full max-w-[34px] rounded-t-[2px]"
                      style={{
                        height: `${h}%`,
                        backgroundColor: pt.score_20 >= 10 ? '#A6CE39' : '#d97706',
                      }}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="addressp-box mb-0 space-y-4">
          <div>
            <span className="ltitle2">{tr(lang, 'نقاط القوة (70%+)', 'Points forts (70%+)', 'Strengths (70%+)')}</span>
            {stats.strongTopics.length === 0 ? (
              <p className="text-xs text-[#6b787e]">
                {tr(lang, 'لا توجد محاور مصنفة بعد.', 'Pas encore de thèmes classés.', 'No classified topics yet.')}
              </p>
            ) : (
              <div className="space-y-1.5">
                {stats.strongTopics.slice(0, 4).map((tp, idx) => (
                  <div key={idx} className="flex items-center justify-between text-xs bg-[#e2efbf]/50 px-3 py-1.5 rounded-[3px]">
                    <span className="font-bold text-[#384D55]">{lang === 'ar' ? tp.topic_ar : tp.topic_fr}</span>
                    <span className="font-extrabold text-green-700 tabular-nums">{tp.percentage}%</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <span className="ltitle2">
              {tr(lang, 'محاور تحتاج إلى مراجعة (<70%)', 'Thèmes à renforcer (<70%)', 'Topics to Review (<70%)')}
            </span>
            {stats.weakTopics.length === 0 ? (
              <p className="text-xs text-[#6b787e]">
                {tr(
                  lang,
                  'ممتاز! لا توجد نقاط ضعف مسجلة حالياً.',
                  'Aucun point faible enregistré.',
                  'Great! No weak topics recorded.'
                )}
              </p>
            ) : (
              <div className="space-y-1.5">
                {stats.weakTopics.slice(0, 4).map((tp, idx) => (
                  <div key={idx} className="flex items-center justify-between text-xs bg-amber-50 px-3 py-1.5 rounded-[3px]">
                    <span className="font-bold text-[#384D55]">{lang === 'ar' ? tp.topic_ar : tp.topic_fr}</span>
                    <span className="font-extrabold text-amber-700 tabular-nums">{tp.percentage}%</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Study Hub: Persisted Goals + Interactive Pomodoro + Weakness Recommendations */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Study Goals Card */}
        <form onSubmit={(e) => void handleSaveGoals(e)} className="addressp-box !mb-0 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="ltitle2 !mb-0 flex items-center gap-1.5">
              <Target className="w-4 h-4 text-[#557a16]" />
              <span>{tr(lang, 'أهدافي الدراسية', 'Objectifs d’étude', 'Study Goals')}</span>
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#e2efbf] text-[#456810] text-[11px] font-bold tabular-nums">
              <Flame className="w-3.5 h-3.5" />
              {goals?.streak_days ?? 0} {tr(lang, 'يوم', 'jours', 'days')}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 text-xs">
            <div>
              <label className="block text-[11px] font-semibold text-[#5c686e] mb-1">
                {tr(lang, 'دقيقة/يوم', 'Min/jour', 'Min/day')}
              </label>
              <input
                type="number"
                min={10}
                max={480}
                value={goalMinutes}
                onChange={(e) => setGoalMinutes(Number(e.target.value))}
                className="template-input text-xs tabular-nums"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#5c686e] mb-1">
                {tr(lang, 'سؤال/يوم', 'Q/jour', 'Q/day')}
              </label>
              <input
                type="number"
                min={5}
                max={300}
                value={goalQuestions}
                onChange={(e) => setGoalQuestions(Number(e.target.value))}
                className="template-input text-xs tabular-nums"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#5c686e] mb-1">
                {tr(lang, 'الهدف / 20', 'Objectif /20', 'Goal /20')}
              </label>
              <input
                type="number"
                min={10}
                max={20}
                step={0.5}
                value={goalScore}
                onChange={(e) => setGoalScore(Number(e.target.value))}
                className="template-input text-xs tabular-nums"
              />
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 text-[11px] text-[#5c686e] pt-1">
            <span>
              {tr(lang, 'إجمالي المذاكرة:', 'Temps total:', 'Total study:')}{' '}
              <strong className="text-[#384D55] tabular-nums">{goals?.total_study_minutes ?? 0}</strong>{' '}
              {tr(lang, 'د', 'min', 'min')}
            </span>
            <span>
              {tr(lang, 'جلسات بومودورو:', 'Pomodoros:', 'Pomodoros:')}{' '}
              <strong className="text-[#384D55] tabular-nums">{goals?.completed_pomodoros ?? 0}</strong>
            </span>
          </div>

          <button type="submit" disabled={savingGoals} className="imgsend2 w-full !py-1.5 text-xs">
            <Save className="w-3.5 h-3.5" />
            <span>{savingGoals ? t.loading : tr(lang, 'حفظ الأهداف', 'Enregistrer', 'Save Goals')}</span>
          </button>

          {goalsSavedMsg && (
            <div className="p-2 rounded bg-[#f4faea] border border-[#A6CE39] text-[#456810] text-[11px] font-bold">
              {goalsSavedMsg}
            </div>
          )}
        </form>

        {/* Interactive Pomodoro Timer */}
        <div className="addressp-box !mb-0 space-y-3 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2">
            <span className="ltitle2 !mb-0 flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-[#557a16]" />
              <span>{tr(lang, 'مؤقت التركيز بومودورو', 'Minuteur Pomodoro', 'Pomodoro Focus Timer')}</span>
            </span>
            <select
              value={focusMins}
              disabled={pomoRunning}
              onChange={(e) => {
                const m = Number(e.target.value);
                setFocusMins(m);
                if (pomoMode === 'focus') setSecondsLeft(m * 60);
              }}
              className="bg-white border border-[#c9d0d3] rounded px-1.5 py-0.5 text-[11px] font-bold text-[#384D55]"
            >
              <option value={15}>15m</option>
              <option value={25}>25m</option>
              <option value={45}>45m</option>
            </select>
          </div>

          <div className="text-center py-2 bg-[#f7f9fa] border border-[#e2e7ea] rounded-[4px]">
            <div className="text-[11px] font-bold text-[#6b787e] mb-0.5">
              {pomoMode === 'focus'
                ? tr(lang, 'جلسة تركيز نشطة', 'Session de concentration', 'Focus Session')
                : tr(lang, 'استراحة قصيرة', 'Courte pause', 'Short Break')}
            </div>
            <div className="text-3xl font-black text-[#384D55] tabular-nums" dir="ltr">
              {String(Math.floor(secondsLeft / 60)).padStart(2, '0')}:
              {String(secondsLeft % 60).padStart(2, '0')}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => setPomoRunning((r) => !r)}
              className="imgsend2 !py-1.5 !px-4 text-xs"
            >
              {pomoRunning ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              <span>
                {pomoRunning
                  ? tr(lang, 'إيقاف مؤقت', 'Pause', 'Pause')
                  : tr(lang, 'بدء المؤقت', 'Démarrer', 'Start')}
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                setPomoRunning(false);
                setPomoMode('focus');
                setSecondsLeft(focusMins * 60);
              }}
              className="imgsend2-secondary !py-1.5 !px-3 text-xs"
              title={tr(lang, 'إعادة ضبط', 'Réinitialiser', 'Reset')}
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => void handleLogQuickSession(15)}
              className="px-2.5 py-1.5 rounded-[3px] border border-[#c9d0d3] bg-white hover:bg-[#f4faea] text-[11px] font-bold text-[#384D55] cursor-pointer"
            >
              +15m
            </button>
          </div>
        </div>

        {/* Weakness-Based Study Recommendations */}
        <div className="addressp-box !mb-0 space-y-3">
          <span className="ltitle2 !mb-0 block">
            {tr(lang, 'توصيات المراجعة الذكية', 'Recommandations ciblées', 'Targeted Study Recommendations')}
          </span>
          {stats.weakTopics.length === 0 ? (
            <div className="space-y-2.5 text-xs text-[#5c686e]">
              <p>
                {tr(
                  lang,
                  'أداؤك متوازن حالياً. واصل المراجعة اليومية عبر بنك الأسئلة أو المحاكاة الشاملة لترسيخ مستواك.',
                  'Votre niveau est régulier. Poursuivez vos entraînements dans la banque de questions.',
                  'Your progress is well balanced. Keep practicing daily in the question bank or mock exams.'
                )}
              </p>
              <button type="button" onClick={() => navigate('question-bank')} className="imgsend2-secondary text-xs w-full">
                {t.navQuestionBank}
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {stats.weakTopics.slice(0, 3).map((tp, idx) => (
                <div
                  key={idx}
                  className="p-2.5 rounded-[3px] bg-amber-50/70 border border-amber-200 flex items-center justify-between gap-2 text-xs"
                >
                  <div>
                    <div className="font-bold text-[#384D55]">
                      {lang === 'ar' ? tp.topic_ar : tp.topic_fr}
                    </div>
                    <div className="text-[11px] text-amber-800 tabular-nums">
                      {tr(lang, `الدقة الحالية: ${tp.percentage}%`, `Précision : ${tp.percentage}%`, `Accuracy: ${tp.percentage}%`)}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      navigate('question-bank', {
                        search: lang === 'ar' ? tp.topic_ar : tp.topic_fr,
                      })
                    }
                    className="px-2.5 py-1 rounded bg-[#384D55] text-white font-bold text-[11px] shrink-0 cursor-pointer"
                  >
                    {tr(lang, 'تدرّب الآن', 'Réviser', 'Practice')}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="addressp-box space-y-3">
        <span className="ltitle">{tr(lang, 'سجل الاختبارات السابقة', 'Historique des examens', 'Exam History')}</span>
        {history.length === 0 ? (
          <p className="text-xs text-[#6b787e] py-4">
            {tr(
              lang,
              'لم تقم بتسليم أي اختبار بعد.',
              'Aucun examen soumis pour le moment.',
              'No exams submitted yet.'
            )}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-start border-collapse">
              <thead>
                <tr className="border-b border-[#d8dfe2] bg-[#f4f6f7] text-[#384D55]">
                  <th className="p-2.5 text-start">#</th>
                  <th className="p-2.5 text-start">{tr(lang, 'النمط / المادة', 'Mode / Matière', 'Mode / Subject')}</th>
                  <th className="p-2.5 text-start">{tr(lang, 'الأسئلة', 'Questions', 'Questions')}</th>
                  <th className="p-2.5 text-start">{t.scoreOutOf20}</th>
                  <th className="p-2.5 text-start">{tr(lang, 'التاريخ', 'Date', 'Date')}</th>
                  <th className="p-2.5 text-start">{tr(lang, 'المراجعة', 'Révision', 'Review')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#efefef]">
                {history.map((h) => (
                  <tr key={h.id} className="hover:bg-[#f7f9fa]">
                    <td className="p-2.5 tabular-nums font-bold">{h.id}</td>
                    <td className="p-2.5 font-semibold">
                      {(lang === 'ar' ? h.title_ar : h.title_fr) || `${h.mode} · ${h.subject_slug}`}
                    </td>
                    <td className="p-2.5 tabular-nums">{h.question_count}</td>
                    <td className="p-2.5 tabular-nums font-extrabold text-[#384D55]">{h.score_20} / 20</td>
                    <td className="p-2.5 tabular-nums text-[#6b787e]">
                      {new Date(h.submitted_at).toLocaleDateString()}
                    </td>
                    <td className="p-2.5">
                      <button
                        type="button"
                        onClick={() => navigate('exams', { reviewAttemptId: h.id })}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[3px] bg-[#e2efbf] hover:bg-[#A6CE39] text-[#384D55] font-bold cursor-pointer"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>{tr(lang, 'مراجعة الإجابات', 'Corrigé', 'Review')}</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Institutional Hub: Invitations, Joined Teacher Sections, Evaluations & Followed Educators */}
      {institutional && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="addressp-box !mb-0 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="ltitle2 !mb-0 flex items-center gap-1.5">
                <GraduationCap className="w-4 h-4 text-[#557a16]" />
                <span>{tr(lang, 'أقسام المعلمين والدعوات', 'Sections & invitations', 'Teacher Sections & Invitations')}</span>
              </span>
              <div className="flex items-center gap-2">
                {(user.level === 'teacher' || user.level === 'professor' || user.isAdmin) && (
                  <button
                    type="button"
                    onClick={() => navigate('teacher-dashboard')}
                    className="text-[11px] font-bold text-[#557a16] hover:underline cursor-pointer"
                  >
                    {tr(lang, 'لوحة المعلم', 'Espace enseignant', 'Teacher Panel')}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => navigate('school-dashboard')}
                  className="text-[11px] font-bold text-[#384D55] hover:underline cursor-pointer"
                >
                  {tr(lang, 'المدارس', 'Écoles', 'Schools')}
                </button>
              </div>
            </div>

            {institutional.pendingInvitations.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-extrabold text-amber-800">
                  {tr(lang, 'دعوات انضمام معلّقة:', 'Invitations en attente :', 'Pending Invitations:')}
                </div>
                {institutional.pendingInvitations.map((inv) => (
                  <div
                    key={inv.member_id}
                    className="p-2.5 rounded bg-amber-50 border border-amber-200 flex flex-wrap items-center justify-between gap-2 text-xs"
                  >
                    <div>
                      <div className="font-extrabold text-[#384D55]">{inv.title}</div>
                      <div className="text-[11px] text-[#6b787e] flex items-center gap-1">
                        <span>{inv.teacher_name}</span>
                        <VerifiedBadge verified={Boolean(inv.teacher_verified)} size="sm" />
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={inviteBusyId === inv.member_id}
                        onClick={async () => {
                          setInviteBusyId(inv.member_id);
                          try {
                            await apiRequest(`/api/student/invitations/${inv.member_id}/respond`, {
                              method: 'POST',
                              json: { action: 'accept' },
                            });
                            await loadInstitutional();
                          } finally {
                            setInviteBusyId(null);
                          }
                        }}
                        className="imgsend2 !py-1 !px-2.5 text-[11px]"
                      >
                        {tr(lang, 'قبول', 'Accepter', 'Accept')}
                      </button>
                      <button
                        type="button"
                        disabled={inviteBusyId === inv.member_id}
                        onClick={async () => {
                          setInviteBusyId(inv.member_id);
                          try {
                            await apiRequest(`/api/student/invitations/${inv.member_id}/respond`, {
                              method: 'POST',
                              json: { action: 'reject' },
                            });
                            await loadInstitutional();
                          } finally {
                            setInviteBusyId(null);
                          }
                        }}
                        className="imgsend2-secondary !py-1 !px-2.5 text-[11px]"
                      >
                        {tr(lang, 'رفض', 'Refuser', 'Decline')}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {institutional.joinedSections.length === 0 ? (
              <p className="text-xs text-[#6b787e]">
                {tr(
                  lang,
                  'لم تنضم لأي قسم خاص بعد.',
                  'Aucune section rejointe pour le moment.',
                  'You have not joined any teacher section yet.'
                )}
              </p>
            ) : (
              <div className="space-y-2">
                {institutional.joinedSections.map((sec) => (
                  <div
                    key={sec.id}
                    className="p-2.5 rounded bg-[#f7f9fa] border border-[#d8dfe2] flex items-center justify-between gap-2 text-xs"
                  >
                    <div>
                      <div className="font-extrabold text-[#384D55]">{sec.title}</div>
                      <div className="text-[11px] text-[#6b787e] flex items-center gap-1">
                        <span>{sec.teacher_name}</span>
                        <VerifiedBadge verified={Boolean(sec.teacher_verified)} size="sm" />
                        {sec.school_name ? <span>· {sec.school_name}</span> : null}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => navigate('section-view', { shareCode: sec.share_code })}
                      className="imgsend2-secondary !py-1 !px-2.5 text-[11px]"
                    >
                      {tr(lang, 'دخول القسم', 'Ouvrir', 'Open')}
                    </button>
                  </div>
                ))}
              </div>
            )}

            {institutional.evaluations.length > 0 && (
              <div className="pt-2 border-t border-[#efefef] space-y-1.5">
                <div className="text-xs font-extrabold text-[#384D55]">
                  {tr(lang, 'تقييمات المعلمين الأخيرة:', 'Dernières évaluations :', 'Recent Teacher Evaluations:')}
                </div>
                {institutional.evaluations.slice(0, 4).map((ev) => (
                  <div
                    key={ev.id}
                    className="p-2 rounded bg-[#f9fcf2] border border-[#d8dfe2] text-[11px] flex items-center justify-between gap-2"
                  >
                    <div>
                      <strong className="text-[#384D55]">{ev.section_title}</strong>
                      {ev.comment ? <p className="text-[#5c686e]">{ev.comment}</p> : null}
                    </div>
                    {ev.score != null && (
                      <span className="font-extrabold text-[#557a16] tabular-nums shrink-0">
                        {ev.score}/{ev.max_score || 20}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="addressp-box !mb-0 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="ltitle2 !mb-0 flex items-center gap-1.5">
                <Users className="w-4 h-4 text-[#557a16]" />
                <span>{tr(lang, 'المعلمون والمدارس المتابَعة', 'Éducateurs & écoles suivis', 'Followed Educators & Schools')}</span>
              </span>
              <button
                type="button"
                onClick={() => navigate('school-dashboard')}
                className="inline-flex items-center gap-1 text-[11px] font-bold text-[#557a16] hover:underline cursor-pointer"
              >
                <Building2 className="w-3.5 h-3.5" />
                <span>{tr(lang, 'دليل المدارس', 'Annuaire des écoles', 'Schools Directory')}</span>
              </button>
            </div>

            {institutional.followedEducators.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {institutional.followedEducators.map((ed) => (
                  <span
                    key={ed.id}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[#f4faea] border border-[#A6CE39] text-[11px] font-bold text-[#384D55]"
                  >
                    <span>{ed.name}</span>
                    <VerifiedBadge verified={Boolean(ed.verified_account)} size="sm" />
                  </span>
                ))}
              </div>
            )}

            {institutional.followedSchools.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {institutional.followedSchools.map((sc) => (
                  <span
                    key={sc.id}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[#f7f9fa] border border-[#d8dfe2] text-[11px] font-bold text-[#384D55]"
                  >
                    <Building2 className="w-3 h-3 text-[#557a16]" />
                    <span>{sc.name}</span>
                    <VerifiedBadge verified={Boolean(sc.verified_account)} size="sm" />
                  </span>
                ))}
              </div>
            )}

            {educators.length > 0 && (
              <div className="pt-2 border-t border-[#efefef] space-y-1.5 max-h-56 overflow-y-auto">
                <div className="text-[11px] font-bold text-[#6b787e]">
                  {tr(lang, 'دليل المعلمين والأساتذة:', 'Enseignants & Professeurs :', 'Teachers & Professors Directory:')}
                </div>
                {educators.slice(0, 8).map((ed) => {
                  const isFollowed = followingUserIds.has(ed.id);
                  return (
                    <div
                      key={ed.id}
                      className="p-2 rounded bg-[#f7f9fa] border border-[#d8dfe2] flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="font-bold text-[#384D55] flex items-center gap-1 truncate">
                          <span>{ed.name}</span>
                          <VerifiedBadge verified={Boolean(ed.verified_account)} size="sm" />
                        </div>
                        <div className="text-[11px] text-[#6b787e]">
                          {formatUserLevelLabel(ed.level, ed.teacher_category, ed.professor_specialty, lang)} ·{' '}
                          {ed.followers_count} {tr(lang, 'متابع', 'abonnés', 'followers')}
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={followBusyId === ed.id}
                        onClick={async () => {
                          setFollowBusyId(ed.id);
                          try {
                            const r = await apiRequest<{ following: boolean }>('/api/follows/toggle', {
                              method: 'POST',
                              json: { targetType: 'user', targetId: ed.id },
                            });
                            setFollowingUserIds((prev) => {
                              const next = new Set(prev);
                              if (r.following) next.add(ed.id);
                              else next.delete(ed.id);
                              return next;
                            });
                            await loadInstitutional();
                          } finally {
                            setFollowBusyId(null);
                          }
                        }}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-bold cursor-pointer ${
                          isFollowed
                            ? 'bg-[#e2efbf] text-[#2c4a12] border border-[#A6CE39]'
                            : 'bg-white text-[#384D55] border border-[#c9d0d3]'
                        }`}
                      >
                        {isFollowed ? <UserCheck className="w-3 h-3" /> : <UserPlus className="w-3 h-3" />}
                        <span>{isFollowed ? tr(lang, 'متابَع', 'Suivi', 'Following') : tr(lang, 'متابعة', 'Suivre', 'Follow')}</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
