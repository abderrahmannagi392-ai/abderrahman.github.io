import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Award,
  BookOpen,
  Calculator,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Flag,
  History,
  Play,
  RotateCcw,
  XCircle,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { triggerHaptic } from '../../hooks/useMobilePlatform';
import type {
  BacCoefficientItem,
  BacSeriesItem,
  ExamAttempt,
  ExamConfig,
  ExamMode,
  Question,
} from '../../types';
import { apiRequest } from '../../utils/api';
import { localeCode, tr } from '../../utils/locale';
import { MobileListRow, MobileSkeletonList } from './MobilePrimitives';
import { MobilePaywallSheet } from './MobileSubscriptionViews';

export type MobileExamSubMode = 'center' | 'bac' | 'history';

interface ReviewItem {
  question: Question;
  selectedIndex: number | null;
  correctIndex: number;
  isCorrect: boolean;
}

interface HistoryRow {
  id: number;
  title_ar: string;
  title_fr: string;
  mode: string;
  subject_slug: string;
  question_count: number;
  submitted_at: string;
  score_20: number;
  percentage: number;
}

function formatClock(sec: number): string {
  const m = Math.floor(Math.max(0, sec) / 60);
  const s = Math.max(0, sec) % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export const MobileExamsView: React.FC<{
  subMode: MobileExamSubMode;
  onChangeSubMode: (m: MobileExamSubMode) => void;
  onOpenSubscriptions: () => void;
  onOpenBacSeriesLessons: (seriesSlug: string) => void;
  onExamRunningChange: (running: boolean) => void;
}> = ({
  subMode,
  onChangeSubMode,
  onOpenSubscriptions,
  onOpenBacSeriesLessons,
  onExamRunningChange,
}) => {
  const { lang, user, catalog, activeExam, setActiveExam, refreshActiveExam } = useApp();
  const isAr = lang === 'ar';

  const [configs, setConfigs] = useState<ExamConfig[]>([]);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [loadingCenter, setLoadingCenter] = useState(true);
  const [selectedSubject, setSelectedSubject] = useState<string>('all');
  const [examMode, setExamMode] = useState<ExamMode>('mock');
  const [qCount, setQCount] = useState<number>(15);
  const [durationMins, setDurationMins] = useState<number>(20);
  const [startError, setStartError] = useState<string | null>(null);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // Running Exam state
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [flagged, setFlagged] = useState<number[]>([]);
  const [qIndex, setQIndex] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [submittedAttempt, setSubmittedAttempt] = useState<ExamAttempt | null>(null);
  const [reviewItems, setReviewItems] = useState<ReviewItem[] | null>(null);

  // Baccalaureate state
  const [bacSeries, setBacSeries] = useState<BacSeriesItem[]>([]);
  const [bacCoeffs, setBacCoeffs] = useState<BacCoefficientItem[]>([]);
  const [selectedBacSeries, setSelectedBacSeries] = useState<string>('bac-sn');
  const [bacGrades, setBacGrades] = useState<Record<string, string>>({});

  useEffect(() => {
    onExamRunningChange(Boolean(activeExam && !submittedAttempt && !reviewItems));
    return () => onExamRunningChange(false);
  }, [activeExam, submittedAttempt, reviewItems, onExamRunningChange]);

  const loadCenterData = useCallback(async () => {
    setLoadingCenter(true);
    try {
      const [cfgRes, histRes] = await Promise.all([
        apiRequest<{ configs?: ExamConfig[] }>('/api/exams/configs').catch(() => ({ configs: [] })),
        apiRequest<{ attempts?: HistoryRow[] }>('/api/exams/history').catch(() => ({ attempts: [] })),
      ]);
      setConfigs(cfgRes.configs || []);
      setHistory(histRes.attempts || []);
    } finally {
      setLoadingCenter(false);
    }
  }, []);

  useEffect(() => {
    void loadCenterData();
  }, [loadCenterData, user?.uid]);

  useEffect(() => {
    if (subMode !== 'bac' || bacSeries.length > 0) return;
    apiRequest<{ series: BacSeriesItem[]; coefficients: BacCoefficientItem[] }>(
      '/api/baccalaureate/catalog'
    )
      .then((res) => {
        setBacSeries(res.series || []);
        setBacCoeffs(res.coefficients || []);
        if (res.series?.[0]) {
          setSelectedBacSeries((prev) =>
            res.series.some((s) => s.slug === prev) ? prev : res.series[0].slug
          );
        }
      })
      .catch(() => {});
  }, [subMode, bacSeries.length]);

  useEffect(() => {
    if (!activeExam) return;
    setAnswers(activeExam.attempt.answers || {});
    setFlagged(activeExam.attempt.flagged || []);
    setElapsedSeconds(activeExam.attempt.time_spent_seconds || 0);
  }, [activeExam]);

  const handleSubmitExam = useCallback(
    async (isAuto = false) => {
      if (!activeExam || busy) return;
      triggerHaptic(14);
      setBusy(true);
      try {
        const res = await apiRequest<{ attempt: ExamAttempt }>(
          `/api/exams/${activeExam.attempt.id}/submit`,
          {
            method: 'POST',
            json: { answers, timeSpentSeconds: elapsedSeconds, autoSubmitted: isAuto },
          }
        );
        setSubmittedAttempt(res.attempt);
        setActiveExam(null);
        void loadCenterData();
      } catch (err: any) {
        setStartError(err?.message || 'Submission failed');
      } finally {
        setBusy(false);
      }
    },
    [activeExam, answers, busy, elapsedSeconds, loadCenterData, setActiveExam]
  );

  // Live exam timer
  useEffect(() => {
    if (!activeExam || submittedAttempt || reviewItems) return;
    const totalSec = activeExam.attempt.duration_minutes * 60;
    const timer = window.setInterval(() => {
      setElapsedSeconds((prev) => {
        const next = prev + 1;
        if (next >= totalSec) {
          window.clearInterval(timer);
          void handleSubmitExam(true);
        }
        return next;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [activeExam, submittedAttempt, reviewItems, handleSubmitExam]);

  const handleStartExam = async (cfg?: ExamConfig) => {
    triggerHaptic(10);
    setBusy(true);
    setStartError(null);
    setSubmittedAttempt(null);
    setReviewItems(null);
    try {
      const res = await apiRequest<{ attempt: ExamAttempt; questions: Question[] }>(
        '/api/exams/start',
        {
          method: 'POST',
          json: {
            configId: cfg?.id,
            mode: cfg?.mode || examMode,
            track: cfg?.track || user?.track || 'bilingual',
            subjectSlug: cfg?.subject_slug || selectedSubject,
            level: cfg?.level || 'all',
            questionCount: cfg?.question_count || qCount,
            durationMinutes: cfg?.duration_minutes || durationMins,
            deviceMode: 'mobile',
            forceNew: true,
          },
        }
      );
      setActiveExam(res);
      setAnswers({});
      setFlagged([]);
      setQIndex(0);
      setElapsedSeconds(0);
    } catch (err: any) {
      if (err?.status === 409) {
        await refreshActiveExam();
      } else {
        const msg =
          err?.message ||
          tr(
            lang,
            'تعذر بدء الامتحان. تأكد من باقتك أو عدد الأسئلة المتاح.',
            'Impossible de démarrer l’examen.',
            'Could not start exam.'
          );
        setStartError(msg);
        if (err?.status === 402 || err?.status === 403 || err?.data?.code === 'QUOTA_EXCEEDED') {
          setPaywallOpen(true);
        }
      }
    } finally {
      setBusy(false);
    }
  };

  const handlePickOption = async (questionId: number, optionIndex: number) => {
    if (!activeExam) return;
    triggerHaptic(8);
    setAnswers((p) => ({ ...p, [String(questionId)]: optionIndex }));
    await apiRequest(`/api/exams/${activeExam.attempt.id}/answer`, {
      method: 'PATCH',
      json: { questionId, optionIndex, flagged, timeSpentSeconds: elapsedSeconds },
    }).catch(() => {});
  };

  const handleToggleFlag = async (questionId: number) => {
    if (!activeExam) return;
    triggerHaptic(6);
    const next = flagged.includes(questionId)
      ? flagged.filter((id) => id !== questionId)
      : [...flagged, questionId];
    setFlagged(next);
    await apiRequest(`/api/exams/${activeExam.attempt.id}/answer`, {
      method: 'PATCH',
      json: { flagged: next, timeSpentSeconds: elapsedSeconds },
    }).catch(() => {});
  };

  const openReview = async (attemptId: number) => {
    setBusy(true);
    try {
      const res = await apiRequest<{ attempt: ExamAttempt; items: ReviewItem[] }>(
        `/api/exams/${attemptId}/review`
      );
      setSubmittedAttempt(res.attempt);
      setReviewItems(res.items || []);
    } finally {
      setBusy(false);
    }
  };

  // Baccalaureate calculations
  const seriesCoeffs = useMemo(
    () => bacCoeffs.filter((c) => c.series_slug === selectedBacSeries),
    [bacCoeffs, selectedBacSeries]
  );

  const bacSummary = useMemo(() => {
    let totalWeighted = 0;
    let totalCoeff = 0;
    let enteredCount = 0;
    for (const c of seriesCoeffs) {
      const raw = bacGrades[String(c.id)];
      if (raw !== undefined && raw !== '') {
        const val = Math.min(c.max_grade || 20, Math.max(0, Number(raw)));
        if (!Number.isNaN(val)) {
          enteredCount += 1;
          totalWeighted += val * c.coefficient;
          totalCoeff += c.coefficient;
        }
      }
    }
    const average = totalCoeff > 0 ? totalWeighted / totalCoeff : 0;
    const mention =
      average >= 16
        ? tr(lang, 'ممتاز / حسن جداً', 'Très Bien', 'Very Good')
        : average >= 14
          ? tr(lang, 'جيد', 'Bien', 'Good')
          : average >= 12
            ? tr(lang, 'قريب من الحسن', 'Assez Bien', 'Fairly Good')
            : average >= 10
              ? tr(lang, 'ناجح — مقبول', 'Admis — Passable', 'Pass')
              : enteredCount > 0
                ? tr(lang, 'دون المعدل', 'Ajourné / Rattrapage', 'Below Passing')
                : '—';
    return { average, totalWeighted, totalCoeff, enteredCount, mention };
  }, [seriesCoeffs, bacGrades, lang]);

  // 1) Review Mode
  if (reviewItems && submittedAttempt) {
    return (
      <div className="space-y-4">
        <div className="tdr-m-hero-card flex items-center justify-between gap-3">
          <div>
            <span className="tdr-m-brand-pill mb-2">
              {tr(lang, 'مراجعة الإجابات', 'Révision', 'Review')}
            </span>
            <h2 className="text-xl font-extrabold tabular-nums">
              {Number(submittedAttempt.score_20 || 0).toFixed(2)} / 20
            </h2>
            <p className="text-xs opacity-90">
              {tr(
                lang,
                `صحيح: ${submittedAttempt.correct_count || 0} • خطأ: ${submittedAttempt.wrong_count || 0}`,
                `Correct: ${submittedAttempt.correct_count || 0} • Faux: ${submittedAttempt.wrong_count || 0}`,
                `Correct: ${submittedAttempt.correct_count || 0} • Wrong: ${submittedAttempt.wrong_count || 0}`
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setReviewItems(null);
              setSubmittedAttempt(null);
            }}
            className="min-h-[42px] px-4 rounded-xl text-xs font-extrabold cursor-pointer"
            style={{ background: '#ffffff', color: '#1c2a0e' }}
          >
            {tr(lang, 'إغلاق', 'Fermer', 'Close')}
          </button>
        </div>

        <div className="space-y-3">
          {reviewItems.map((item, idx) => {
            const opts = isAr
              ? item.question.options_ar
              : item.question.options_fr || item.question.options_ar;
            return (
              <div key={item.question.id} className="tdr-m-card p-4 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-extrabold" style={{ color: 'var(--m-brand-deep)' }}>
                    {tr(lang, `سؤال ${idx + 1}`, `Question ${idx + 1}`, `Q${idx + 1}`)}
                  </span>
                  {item.isCorrect ? (
                    <span className="inline-flex items-center gap-1 text-xs font-extrabold" style={{ color: 'var(--m-ok)' }}>
                      <CheckCircle2 className="w-4 h-4" />
                      {tr(lang, 'صحيح', 'Correct', 'Correct')}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs font-extrabold" style={{ color: 'var(--m-err)' }}>
                      <XCircle className="w-4 h-4" />
                      {tr(lang, 'غير صحيح', 'Incorrect', 'Wrong')}
                    </span>
                  )}
                </div>
                <div className="text-sm font-bold leading-relaxed">
                  {isAr ? item.question.stem_ar : item.question.stem_fr || item.question.stem_ar}
                </div>
                <div className="space-y-1.5">
                  {opts.map((opt, oIdx) => {
                    const isCorrect = oIdx === item.correctIndex;
                    const isPicked = oIdx === item.selectedIndex;
                    return (
                      <div
                        key={oIdx}
                        className="px-3 py-2 rounded-xl text-xs font-bold border"
                        style={
                          isCorrect
                            ? { background: 'var(--m-ok-soft)', borderColor: 'var(--m-ok)', color: 'var(--m-ok)' }
                            : isPicked
                              ? { background: 'var(--m-errbg)', borderColor: 'var(--m-err)', color: 'var(--m-err)' }
                              : { background: 'var(--m-surface-muted)', borderColor: 'var(--m-border)' }
                        }
                      >
                        {opt}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // 2) Submitted Result Summary
  if (submittedAttempt) {
    const score = Number(submittedAttempt.score_20 || 0);
    const passed = score >= 10;
    return (
      <div className="space-y-4">
        <div className="tdr-m-hero-card text-center space-y-2 py-7">
          <span className="tdr-m-brand-pill">
            {passed
              ? tr(lang, 'ناجح — أداء ممتاز', 'Réussi', 'Passed')
              : tr(lang, 'بحاجة إلى مراجعة إضافية', 'À renforcer', 'Needs Practice')}
          </span>
          <div className="text-4xl font-extrabold tabular-nums pt-2">
            {score.toFixed(2)} <span className="text-lg opacity-80">/ 20</span>
          </div>
          <p className="text-xs opacity-90">
            {tr(
              lang,
              `إجابات صحيحة: ${submittedAttempt.correct_count || 0} • خاطئة: ${submittedAttempt.wrong_count || 0} • متروكة: ${submittedAttempt.unanswered_count || 0}`,
              `Correctes: ${submittedAttempt.correct_count || 0} • Fausses: ${submittedAttempt.wrong_count || 0}`,
              `Correct: ${submittedAttempt.correct_count || 0} • Wrong: ${submittedAttempt.wrong_count || 0}`
            )}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => void openReview(submittedAttempt.id)}
            className="tdr-m-btn-primary"
          >
            {tr(lang, 'مراجعة التصحيح', 'Voir la correction', 'Review Answers')}
          </button>
          <button
            type="button"
            onClick={() => setSubmittedAttempt(null)}
            className="tdr-m-btn-secondary"
          >
            {tr(lang, 'العودة للمركز', 'Retour', 'Back to Center')}
          </button>
        </div>
      </div>
    );
  }

  // 3) Live Running Exam Runner
  if (activeExam && activeExam.questions.length > 0) {
    const totalQ = activeExam.questions.length;
    const currentQ = activeExam.questions[qIndex] || activeExam.questions[0];
    const remainingSec = Math.max(0, activeExam.attempt.duration_minutes * 60 - elapsedSeconds);
    const opts = isAr ? currentQ.options_ar : currentQ.options_fr || currentQ.options_ar;
    const picked = answers[String(currentQ.id)];
    const isFlagged = flagged.includes(currentQ.id);
    const answeredCount = Object.keys(answers).length;

    return (
      <div className="space-y-4 pb-6">
        <div className="tdr-m-hero-card flex items-center justify-between gap-3">
          <div>
            <div className="text-xs opacity-85 font-bold">
              {tr(lang, `سؤال ${qIndex + 1} من ${totalQ}`, `Question ${qIndex + 1}/${totalQ}`, `Q ${qIndex + 1}/${totalQ}`)}
            </div>
            <div className="text-sm font-extrabold mt-0.5">
              {tr(lang, `تمت الإجابة: ${answeredCount}/${totalQ}`, `Répondu : ${answeredCount}/${totalQ}`, `Answered: ${answeredCount}/${totalQ}`)}
            </div>
          </div>
          <div
            className="px-3.5 py-2 rounded-2xl flex items-center gap-1.5 font-extrabold tabular-nums text-sm"
            style={{ background: '#1c2a0e', color: '#e6f2c4' }}
          >
            <Clock className="w-4 h-4" />
            <span>{formatClock(remainingSec)}</span>
          </div>
        </div>

        {/* Question Card */}
        <div className="tdr-m-card p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold" style={{ color: 'var(--m-muted)' }}>
              {isAr ? currentQ.topic_ar : currentQ.topic_fr || currentQ.topic_ar}
            </span>
            <button
              type="button"
              onClick={() => void handleToggleFlag(currentQ.id)}
              className="min-h-[38px] px-3 rounded-xl text-xs font-bold inline-flex items-center gap-1 border cursor-pointer"
              style={
                isFlagged
                  ? { background: 'var(--m-brand-soft)', color: 'var(--m-brand-deep)', borderColor: 'var(--m-brand-d)' }
                  : { background: 'var(--m-surface-muted)', color: 'var(--m-ink-sub)', borderColor: 'var(--m-border)' }
              }
            >
              <Flag className="w-3.5 h-3.5" />
              <span>{tr(lang, 'تعليم', 'Marquer', 'Flag')}</span>
            </button>
          </div>

          <h3 className="text-base font-extrabold leading-relaxed">
            {isAr ? currentQ.stem_ar : currentQ.stem_fr || currentQ.stem_ar}
          </h3>

          <div className="space-y-2.5">
            {opts.map((opt, idx) => {
              const selected = picked === idx;
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => void handlePickOption(currentQ.id, idx)}
                  className="w-full min-h-[48px] px-4 py-3 rounded-2xl text-start text-sm font-bold border transition-colors cursor-pointer"
                  style={
                    selected
                      ? { background: 'var(--m-brand)', color: 'var(--m-btn-ink)', borderColor: 'var(--m-brand-d)' }
                      : { background: 'var(--m-surface-muted)', color: 'var(--m-ink)', borderColor: 'var(--m-border)' }
                  }
                >
                  {opt}
                </button>
              );
            })}
          </div>
        </div>

        {/* Question Navigator Dots */}
        <div className="tdr-m-card p-3 flex items-center gap-1.5 overflow-x-auto tdr-m-no-scrollbar">
          {activeExam.questions.map((q, idx) => {
            const done = answers[String(q.id)] !== undefined;
            const flg = flagged.includes(q.id);
            const cur = idx === qIndex;
            return (
              <button
                key={q.id}
                type="button"
                onClick={() => setQIndex(idx)}
                className="w-9 h-9 rounded-xl text-xs font-extrabold shrink-0 border cursor-pointer"
                style={
                  cur
                    ? { background: 'var(--m-brand)', color: 'var(--m-btn-ink)', borderColor: 'var(--m-brand-d)' }
                    : flg
                      ? { background: 'var(--m-brand-tint)', color: 'var(--m-brand-deep)', borderColor: 'var(--m-brand-d)' }
                      : done
                        ? { background: 'var(--m-ok-soft)', color: 'var(--m-ok)', borderColor: 'var(--m-ok)' }
                        : { background: 'var(--m-surface-muted)', color: 'var(--m-ink-sub)', borderColor: 'var(--m-border)' }
                }
              >
                {idx + 1}
              </button>
            );
          })}
        </div>

        {/* Navigation + Submit */}
        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            disabled={qIndex === 0}
            onClick={() => setQIndex((p) => Math.max(0, p - 1))}
            className="tdr-m-btn-secondary disabled:opacity-40"
          >
            <ChevronRight className="w-4 h-4" />
            <span>{tr(lang, 'السابق', 'Précédent', 'Previous')}</span>
          </button>
          {qIndex < totalQ - 1 ? (
            <button
              type="button"
              onClick={() => setQIndex((p) => Math.min(totalQ - 1, p + 1))}
              className="tdr-m-btn-primary"
            >
              <span>{tr(lang, 'التالي', 'Suivant', 'Next')}</span>
              <ChevronLeft className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleSubmitExam(false)}
              className="tdr-m-btn-primary"
              style={{ background: 'var(--m-ok)', color: '#ffffff', borderColor: 'var(--m-ok)' }}
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{tr(lang, 'إنهاء وتصحيح', 'Soumettre', 'Submit')}</span>
            </button>
          )}
        </div>

        {qIndex < totalQ - 1 && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleSubmitExam(false)}
            className="w-full py-2 text-xs font-extrabold cursor-pointer"
            style={{ color: 'var(--m-brand-deep)' }}
          >
            {tr(lang, 'تسليم الامتحان الآن', 'Terminer et soumettre maintenant', 'Finish & Submit Now')}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Sub-mode selector */}
      <div className="tdr-m-card p-1.5 grid grid-cols-3 gap-1">
        {(
          [
            { id: 'center', label: tr(lang, 'الامتحانات', 'Examens', 'Exams') },
            { id: 'bac', label: tr(lang, 'البكالوريا', 'Baccalauréat', 'Bac GPA') },
            { id: 'history', label: tr(lang, 'النتائج', 'Historique', 'History') },
          ] as Array<{ id: MobileExamSubMode; label: string }>
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => {
              triggerHaptic(6);
              onChangeSubMode(tab.id);
            }}
            className="min-h-[42px] rounded-xl text-xs font-extrabold cursor-pointer"
            style={
              subMode === tab.id
                ? { background: 'var(--m-brand)', color: 'var(--m-btn-ink)' }
                : { background: 'transparent', color: 'var(--m-ink-sub)' }
            }
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* CENTER */}
      {subMode === 'center' && (
        <div className="space-y-4">
          <div className="tdr-m-hero-card space-y-2">
            <span className="tdr-m-brand-pill">
              {tr(lang, 'نظام تصحيح على 20', 'Notation sur 20', 'Graded /20')}
            </span>
            <h2 className="text-lg font-extrabold tdr-m-kufi pt-1">
              {tr(lang, 'ابدأ اختباراً تدريبياً مخصصاً', 'Lancer un examen blanc', 'Start Practice Exam')}
            </h2>
            <p className="text-xs opacity-90">
              {tr(
                lang,
                'اختر المادة والنمط وعدد الأسئلة مع مؤقت وتصحيح تلقائي فوري.',
                'Choisissez la matière, le mode et la durée avec correction instantanée.',
                'Pick subject, mode, and question count with instant scoring.'
              )}
            </p>
          </div>

          {startError && (
            <div
              className="tdr-m-card p-4 space-y-2 border"
              style={{ background: 'var(--m-errbg)', borderColor: 'var(--m-errline)' }}
            >
              <div className="text-xs font-bold" style={{ color: 'var(--m-err)' }}>
                {startError}
              </div>
              <button type="button" onClick={onOpenSubscriptions} className="tdr-m-btn-primary">
                {tr(lang, 'الترقية للنسخة المحترفة', 'Passer à Pro', 'Upgrade to Pro')}
              </button>
            </div>
          )}

          <div className="tdr-m-card p-4 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setExamMode('mock')}
                className="min-h-[44px] rounded-xl text-xs font-extrabold border cursor-pointer"
                style={
                  examMode === 'mock'
                    ? { background: 'var(--m-brand)', color: 'var(--m-btn-ink)', borderColor: 'var(--m-brand-d)' }
                    : { background: 'var(--m-surface-muted)', color: 'var(--m-ink-sub)', borderColor: 'var(--m-border)' }
                }
              >
                {tr(lang, 'امتحان تجريبي', 'Examen blanc', 'Mock Exam')}
              </button>
              <button
                type="button"
                onClick={() => setExamMode('official_sim')}
                className="min-h-[44px] rounded-xl text-xs font-extrabold border cursor-pointer"
                style={
                  examMode === 'official_sim'
                    ? { background: 'var(--m-brand)', color: 'var(--m-btn-ink)', borderColor: 'var(--m-brand-d)' }
                    : { background: 'var(--m-surface-muted)', color: 'var(--m-ink-sub)', borderColor: 'var(--m-border)' }
                }
              >
                {tr(lang, 'محاكاة رسمية', 'Simulation officielle', 'Official Sim')}
              </button>
            </div>

            <div>
              <label className="block text-xs font-bold mb-1" style={{ color: 'var(--m-ink-sub)' }}>
                {tr(lang, 'المادة', 'Matière', 'Subject')}
              </label>
              <select
                className="tdr-m-select"
                value={selectedSubject}
                onChange={(e) => setSelectedSubject(e.target.value)}
              >
                <option value="all">{tr(lang, 'شامل لكل المواد', 'Toutes les matières', 'All Subjects')}</option>
                {catalog.subjects.map((s) => (
                  <option key={s.slug} value={s.slug}>
                    {isAr ? s.name_ar : s.name_fr || s.name_ar}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-xs font-bold mb-1" style={{ color: 'var(--m-ink-sub)' }}>
                  {tr(lang, 'عدد الأسئلة', 'Questions', 'Questions')}
                </label>
                <select
                  className="tdr-m-select"
                  value={qCount}
                  onChange={(e) => setQCount(Number(e.target.value))}
                >
                  <option value={10}>10</option>
                  <option value={15}>15</option>
                  <option value={20}>20</option>
                  <option value={30}>30</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold mb-1" style={{ color: 'var(--m-ink-sub)' }}>
                  {tr(lang, 'المدة (دقيقة)', 'Durée (min)', 'Minutes')}
                </label>
                <select
                  className="tdr-m-select"
                  value={durationMins}
                  onChange={(e) => setDurationMins(Number(e.target.value))}
                >
                  <option value={15}>15</option>
                  <option value={20}>20</option>
                  <option value={30}>30</option>
                  <option value={45}>45</option>
                </select>
              </div>
            </div>

            <button
              type="button"
              disabled={busy}
              onClick={() => void handleStartExam()}
              className="tdr-m-btn-primary"
            >
              <Play className="w-4 h-4" />
              <span>
                {busy ? tr(lang, 'جارٍ التجهيز...', 'Préparation...', 'Starting...') : tr(lang, 'بدء الامتحان الآن', 'Démarrer l’examen', 'Start Exam Now')}
              </span>
            </button>
          </div>

          {loadingCenter && configs.length === 0 ? (
            <MobileSkeletonList count={2} />
          ) : (
            configs.length > 0 && (
              <div className="space-y-2.5">
                <h3 className="text-sm font-extrabold tdr-m-kufi px-1">
                  {tr(lang, 'النماذج الرسمية الجاهزة', 'Modèles préparés', 'Official Presets')}
                </h3>
                {configs.slice(0, 6).map((cfg) => (
                  <MobileListRow
                    key={cfg.id}
                    dir={isAr ? 'rtl' : 'ltr'}
                    icon={<Award className="w-5 h-5" />}
                    title={isAr ? cfg.title_ar : cfg.title_fr || cfg.title_ar}
                    subtitle={`${cfg.question_count} ${tr(lang, 'سؤال', 'questions', 'Q')} • ${cfg.duration_minutes} ${tr(lang, 'دقيقة', 'min', 'min')}`}
                    onClick={() => void handleStartExam(cfg)}
                  />
                ))}
              </div>
            )
          )}
        </div>
      )}

      {/* BACCALAUREATE */}
      {subMode === 'bac' && (
        <div className="space-y-4">
          <div className="tdr-m-hero-card space-y-2">
            <div className="flex items-center justify-between">
              <span className="tdr-m-brand-pill">{bacSummary.mention}</span>
              <Calculator className="w-6 h-6 opacity-85" />
            </div>
            <div className="text-3xl font-extrabold tabular-nums pt-1">
              {bacSummary.average.toFixed(2)} <span className="text-base opacity-80">/ 20</span>
            </div>
            <p className="text-xs opacity-90">
              {tr(
                lang,
                `مجموع النقاط: ${bacSummary.totalWeighted.toFixed(1)} • مجموع الضوارب: ${bacSummary.totalCoeff}`,
                `Total pondéré : ${bacSummary.totalWeighted.toFixed(1)} • Coeffs : ${bacSummary.totalCoeff}`,
                `Total: ${bacSummary.totalWeighted.toFixed(1)} • Coeffs: ${bacSummary.totalCoeff}`
              )}
            </p>
          </div>

          <div className="tdr-m-card p-4 space-y-3">
            <label className="block text-xs font-bold" style={{ color: 'var(--m-ink-sub)' }}>
              {tr(lang, 'شعبة البكالوريا', 'Série du Baccalauréat', 'Baccalaureate Series')}
            </label>
            <select
              className="tdr-m-select"
              value={selectedBacSeries}
              onChange={(e) => setSelectedBacSeries(e.target.value)}
            >
              {bacSeries.map((s) => (
                <option key={s.slug} value={s.slug}>
                  {s.code} — {isAr ? s.name_ar : s.name_fr || s.name_ar}
                </option>
              ))}
            </select>

            <div className="flex items-center justify-between gap-2 pt-1">
              <button
                type="button"
                onClick={() => onOpenBacSeriesLessons(selectedBacSeries)}
                className="tdr-m-btn-secondary flex-1"
              >
                <BookOpen className="w-4 h-4" />
                <span>{tr(lang, 'دروس الشعبة', 'Cours de la série', 'Series Lessons')}</span>
              </button>
              <button
                type="button"
                onClick={() => setBacGrades({})}
                className="tdr-m-btn-secondary"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="space-y-2">
            {seriesCoeffs.map((c) => (
              <div
                key={c.id}
                className="tdr-m-card px-4 py-3 flex items-center justify-between gap-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-extrabold truncate">
                    {isAr ? c.subject_name_ar : c.subject_name_fr || c.subject_name_ar}
                  </div>
                  <div className="text-[11px] font-bold" style={{ color: 'var(--m-muted)' }}>
                    {tr(lang, `الضارب: ${c.coefficient}`, `Coeff : ${c.coefficient}`, `Coeff: ${c.coefficient}`)}
                  </div>
                </div>
                <input
                  type="number"
                  min={0}
                  max={c.max_grade || 20}
                  step="0.25"
                  dir="ltr"
                  placeholder="0 - 20"
                  value={bacGrades[String(c.id)] ?? ''}
                  onChange={(e) =>
                    setBacGrades((prev) => ({ ...prev, [String(c.id)]: e.target.value }))
                  }
                  className="tdr-m-input text-center font-extrabold tabular-nums"
                  style={{ width: 92 }}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* HISTORY */}
      {subMode === 'history' && (
        <div className="space-y-2.5">
          {loadingCenter && history.length === 0 ? (
            <MobileSkeletonList count={3} />
          ) : history.length === 0 ? (
            <div className="tdr-m-card p-6 text-center text-xs font-bold" style={{ color: 'var(--m-muted)' }}>
              {tr(lang, 'لم تجرِ أي امتحان بعد.', 'Aucun examen passé pour le moment.', 'No exams taken yet.')}
            </div>
          ) : (
            history.map((h) => (
              <MobileListRow
                key={h.id}
                dir={isAr ? 'rtl' : 'ltr'}
                icon={<History className="w-5 h-5" />}
                title={isAr ? h.title_ar || h.subject_slug : h.title_fr || h.title_ar}
                subtitle={`${Number(h.score_20 || 0).toFixed(2)}/20 • ${new Date(h.submitted_at).toLocaleDateString(localeCode(lang))}`}
                onClick={() => void openReview(h.id)}
              />
            ))
          )}
        </div>
      )}

      <MobilePaywallSheet
        open={paywallOpen}
        onClose={() => setPaywallOpen(false)}
        reason={startError || undefined}
        onViewSubscriptions={onOpenSubscriptions}
      />
    </div>
  );
};
