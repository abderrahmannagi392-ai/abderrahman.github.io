import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileDown,
  Flag,
  Laptop,
  Maximize2,
  MonitorCheck,
  Printer,
  RefreshCw,
  ShieldAlert,
  Smartphone,
  Tablet,
  XCircle,
} from 'lucide-react';
import { AudioPlayerBar } from '../components/AudioPlayerBar';
import { useApp } from '../context/AppContext';
import { getT } from '../i18n/translations';
import type {
  ExamAttempt,
  ExamConfig,
  ExamMode,
  Question,
  SubjectStat,
  TopicStat,
  TrackSlug,
} from '../types';
import { apiRequest } from '../utils/api';
import { tr } from '../utils/locale';
import { Image as ImageIcon, } from 'lucide-react';
import { downloadExamTranscriptJpg } from '../utils/receiptDocument';

interface ReviewItem {
  id: number;
  subject_slug: string;
  topic_ar: string;
  topic_fr: string;
  level: string;
  difficulty: string;
  stem_ar: string;
  stem_speech_ar: string;
  stem_fr: string;
  options_ar: string[];
  options_fr: string[];
  correct_index: number;
  user_answer: number | null;
  status: 'correct' | 'wrong' | 'unanswered';
  explanation_ar: string;
  explanation_speech_ar: string;
  explanation_fr: string;
}

export const ExamCenterPage: React.FC = () => {
  const {
    lang,
    selectedTrack,
    user,
    catalog,
    activeExam,
    setActiveExam,
    refreshActiveExam,
    goToAuth,
    viewParams,
    navigate,
    openUpgradeModal,
  } = useApp();
  const t = getT(lang);

  const [configs, setConfigs] = useState<ExamConfig[]>([]);
  const [loadingConfigs, setLoadingConfigs] = useState(true);

  // Flow stage: 'wizard' | 'running' | 'result' | 'review'
  const [stage, setStage] = useState<'wizard' | 'running' | 'result' | 'review'>('wizard');
  const [step, setStep] = useState<number>(1);

  // 9-Step Wizard Inputs
  const [deviceMode, setDeviceMode] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [cameraChecked, setCameraChecked] = useState(false);
  const [cameraSkipped, setCameraSkipped] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraStreamActive, setCameraStreamActive] = useState(false);
  const [cameraPhotoDataUrl, setCameraPhotoDataUrl] = useState<string | null>(null);
  const [faceCheckStatus, setFaceCheckStatus] = useState<'idle' | 'checking' | 'detected' | 'warn'>('idle');
  const [faceCheckMessage, setFaceCheckMessage] = useState<string | null>(null);
  const [liveCheck, setLiveCheck] = useState<{
    valid: boolean;
    issue: 'idle' | 'lighting' | 'contrast' | 'framing' | 'ready';
    reason: string;
  }>({ valid: false, issue: 'idle', reason: '' });
  const [cameraDiagnostics, setCameraDiagnostics] = useState<{ resolution: string; brightnessPct: number } | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [selectedConfigId, setSelectedConfigId] = useState<number | null>(null);
  const [customMode, setCustomMode] = useState<ExamMode>(viewParams.examMode || 'official_sim');
  const [customTrack, setCustomTrack] = useState<TrackSlug>(selectedTrack);
  const [customSubject, setCustomSubject] = useState<string>(viewParams.subjectSlug || 'all');
  const [customLevel, setCustomLevel] = useState<string>(viewParams.level || 'all');
  const [examLang, setExamLang] = useState<'all' | 'ar' | 'fr'>('all');
  const [trackExact, setTrackExact] = useState<boolean>(false);
  const [customCount, setCustomCount] = useState<number>(
    viewParams.examMode === 'official_sim' ? 70 : viewParams.examMode === 'placement' ? 15 : 15
  );
  const [customDuration, setCustomDuration] = useState<number>(
    viewParams.examMode === 'official_sim' ? 90 : 20
  );

  // Live exam state
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [flagged, setFlagged] = useState<number[]>([]);
  const [qIndex, setQIndex] = useState<number>(0);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [confirmSubmitOpen, setConfirmSubmitOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);

  // Results & Post-Exam Review
  const [submittedAttempt, setSubmittedAttempt] = useState<ExamAttempt | null>(null);
  const [reviewItems, setReviewItems] = useState<ReviewItem[]>([]);
  const [reviewFilter, setReviewFilter] = useState<'all' | 'wrong' | 'correct' | 'unanswered'>('all');

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((tr) => tr.stop());
      streamRef.current = null;
    }
    setCameraStreamActive(false);
  }, []);

  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  useEffect(() => {
    if (viewParams.reviewAttemptId) {
      loadReview(viewParams.reviewAttemptId);
    }
  }, [viewParams.reviewAttemptId]);

  useEffect(() => {
    if (viewParams.examMode) {
      setCustomMode(viewParams.examMode);
      if (viewParams.examMode === 'official_sim') {
        setCustomCount(70);
        setCustomDuration(90);
      } else if (viewParams.examMode === 'placement') {
        setCustomCount(15);
        setCustomDuration(20);
      }
    }
    if (viewParams.subjectSlug) setCustomSubject(viewParams.subjectSlug);
    if (viewParams.level) setCustomLevel(viewParams.level);
  }, [viewParams.examMode, viewParams.subjectSlug, viewParams.level]);

  useEffect(() => {
    let active = true;
    async function loadConfigs() {
      setLoadingConfigs(true);
      try {
        const res = await apiRequest<{ configs: ExamConfig[] }>('/api/exams/configs');
        if (active) setConfigs(res.configs || []);
      } finally {
        if (active) setLoadingConfigs(false);
      }
    }
    loadConfigs();
  }, []);

  const getDraftKey = useCallback((attemptId: number) => `tadribi_exam_draft_${attemptId}`, []);

  const readExamDraft = useCallback(
    (attemptId: number): { answers?: Record<string, number>; flagged?: number[]; elapsedSeconds?: number } | null => {
      try {
        const raw = window.localStorage.getItem(getDraftKey(attemptId));
        if (!raw) return null;
        return JSON.parse(raw);
      } catch {
        return null;
      }
    },
    [getDraftKey]
  );

  const writeExamDraft = useCallback(
    (attemptId: number, data: { answers: Record<string, number>; flagged: number[]; elapsedSeconds: number }) => {
      try {
        window.localStorage.setItem(
          getDraftKey(attemptId),
          JSON.stringify({ ...data, updatedAt: Date.now() })
        );
      } catch {
        // ignore storage quota errors
      }
    },
    [getDraftKey]
  );

  const clearExamDraft = useCallback(
    (attemptId: number) => {
      try {
        window.localStorage.removeItem(getDraftKey(attemptId));
      } catch {
        // ignore
      }
    },
    [getDraftKey]
  );

  // Sync active exam when loaded from server + merge with any unsynced local draft
  useEffect(() => {
    if (activeExam && stage === 'wizard' && !viewParams.reviewAttemptId) {
      const draft = readExamDraft(activeExam.attempt.id);
      const mergedAnswers = {
        ...(activeExam.attempt.answers || {}),
        ...(draft?.answers || {}),
      };
      const mergedFlagged = Array.from(
        new Set([...(activeExam.attempt.flagged || []), ...(draft?.flagged || [])])
      );
      const mergedElapsed = Math.max(
        activeExam.attempt.time_spent_seconds || 0,
        draft?.elapsedSeconds || 0
      );
      setAnswers(mergedAnswers);
      setFlagged(mergedFlagged);
      setElapsedSeconds(mergedElapsed);
      setStage('running');
    }
  }, [activeExam, stage, viewParams.reviewAttemptId, readExamDraft]);

  // Persist local draft immediately on answer/flag changes and periodically with elapsedSeconds
  useEffect(() => {
    if (stage !== 'running' || !activeExam) return;
    writeExamDraft(activeExam.attempt.id, { answers, flagged, elapsedSeconds });
  }, [stage, activeExam, answers, flagged, writeExamDraft]);

  useEffect(() => {
    if (stage !== 'running' || !activeExam) return;
    const draftTimer = window.setInterval(() => {
      writeExamDraft(activeExam.attempt.id, { answers, flagged, elapsedSeconds });
    }, 5000);
    return () => window.clearInterval(draftTimer);
  }, [stage, activeExam, answers, flagged, elapsedSeconds, writeExamDraft]);

  const loadReview = async (attemptId: number) => {
    try {
      const res = await apiRequest<{ attempt: ExamAttempt; items: ReviewItem[] }>(
        `/api/exams/${attemptId}/review`
      );
      setSubmittedAttempt(res.attempt);
      setReviewItems(res.items || []);
      setStage('review');
    } catch {
      // ignore
    }
  };

  const handleSubmitExam = useCallback(
    async (isAuto = false) => {
      if (!activeExam || submitting) return;
      setSubmitting(true);
      setConfirmSubmitOpen(false);
      try {
        const res = await apiRequest<{ attempt: ExamAttempt }>(
          `/api/exams/${activeExam.attempt.id}/submit`,
          {
            method: 'POST',
            json: {
              answers,
              timeSpentSeconds: elapsedSeconds,
              autoSubmitted: isAuto,
            },
          }
        );
        clearExamDraft(activeExam.attempt.id);
        setSubmittedAttempt(res.attempt);
        setActiveExam(null);
        setStage('result');
        stopCamera();
      } catch (err: any) {
        setStartError(err?.message || 'Submission failed');
      } finally {
        setSubmitting(false);
      }
    },
    [activeExam, answers, clearExamDraft, elapsedSeconds, setActiveExam, stopCamera, submitting]
  );

  // Live countdown timer during running exam
  useEffect(() => {
    if (stage !== 'running' || !activeExam) return;
    const totalAllowed = activeExam.attempt.duration_minutes * 60;
    const interval = window.setInterval(() => {
      setElapsedSeconds((prev) => {
        const next = prev + 1;
        if (next >= totalAllowed) {
          window.clearInterval(interval);
          handleSubmitExam(true);
        }
        return next;
      });
    }, 1000);
    return () => window.clearInterval(interval);
  }, [stage, activeExam, handleSubmitExam]);

  // Periodic server auto-save every 15 seconds while exam is running
  useEffect(() => {
    if (stage !== 'running' || !activeExam) return;
    const id = window.setInterval(async () => {
      try {
        await apiRequest(`/api/exams/${activeExam.attempt.id}/answer`, {
          method: 'PATCH',
          json: { flagged, timeSpentSeconds: elapsedSeconds },
        });
      } catch {
        // silent retry on next interval
      }
    }, 15000);
    return () => window.clearInterval(id);
  }, [stage, activeExam, flagged, elapsedSeconds]);

  const analyzeLiveCameraFrame = useCallback((): {
    valid: boolean;
    issue: 'idle' | 'lighting' | 'contrast' | 'framing' | 'ready';
    reason: string;
    canvas?: HTMLCanvasElement;
  } => {
    const video = videoRef.current;
    if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) {
      return {
        valid: false,
        issue: 'idle',
        reason: tr(lang, 'جارٍ تهيئة بث الكاميرا...', 'Initialisation de la caméra...', 'Initializing camera feed...'),
      };
    }

    const canvas = canvasRef.current || document.createElement('canvas');
    canvasRef.current = canvas;
    canvas.width = 320;
    canvas.height = 240;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return {
        valid: false,
        issue: 'idle',
        reason: tr(lang, 'تعذر تحليل إطار الكاميرا.', 'Analyse vidéo indisponible.', 'Unable to analyze camera frame.'),
      };
    }

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = frame.data;

    let totalLum = 0;
    let centerPixels = 0;
    let skinLikePixels = 0;
    let centerLumSum = 0;
    let centerLumSqSum = 0;
    let minLum = 255;
    let maxLum = 0;

    for (let y = 0; y < canvas.height; y += 2) {
      for (let x = 0; x < canvas.width; x += 2) {
        const i = (y * canvas.width + x) * 4;
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        totalLum += lum;
        if (lum < minLum) minLum = lum;
        if (lum > maxLum) maxLum = lum;

        // Center oval ROI (~45% width, ~65% height)
        if (x >= 88 && x <= 232 && y >= 42 && y <= 198) {
          centerPixels++;
          centerLumSum += lum;
          centerLumSqSum += lum * lum;
          if (r > 60 && g > 38 && b > 20 && r >= g && r > b && r - Math.min(g, b) > 12) {
            skinLikePixels++;
          }
        }
      }
    }

    const totalSampled = (canvas.width / 2) * (canvas.height / 2);
    const avgLum = totalLum / Math.max(1, totalSampled);
    const lumRange = maxLum - minLum;
    const centerMeanLum = centerLumSum / Math.max(1, centerPixels);
    const centerVariance = Math.max(0, centerLumSqSum / Math.max(1, centerPixels) - centerMeanLum * centerMeanLum);
    const centerStdDev = Math.sqrt(centerVariance);
    const centerRatio = skinLikePixels / Math.max(1, centerPixels);
    const brightnessPct = Math.min(100, Math.max(0, Math.round((avgLum / 255) * 100)));

    setCameraDiagnostics({
      resolution: `${video.videoWidth}×${video.videoHeight}`,
      brightnessPct,
    });

    if (avgLum < 48) {
      return {
        valid: false,
        issue: 'lighting',
        reason: tr(
          lang,
          'الإضاءة منخفضة جداً أو العدسة مغطاة — وجّه وجهاً مضاءً بوضوح نحو الكاميرا قبل الالتقاط.',
          'Luminosité trop faible ou objectif couvert — éclairez votre visage avant de capturer.',
          'Lighting is too low or lens is covered — face a well-lit area before capturing.'
        ),
        canvas,
      };
    }

    if (avgLum > 235 || lumRange < 30 || centerStdDev < 12) {
      return {
        valid: false,
        issue: 'contrast',
        reason: tr(
          lang,
          'الصورة مسطحة أو شديدة السطوع ولا تظهر ملامح واضحة — تأكد من عدم تغطية العدسة وتوازن الإضاءة.',
          'Image trop plate ou surexposée — vérifiez l’objectif et l’éclairage du visage.',
          'Image lacks facial contrast or is overexposed — ensure the lens is clear and lighting is balanced.'
        ),
        canvas,
      };
    }

    if (centerRatio < 0.08) {
      return {
        valid: false,
        issue: 'framing',
        reason: tr(
          lang,
          'لم يتم رصد الوجه داخل الإطار البيضاوي — وجّه وجهك في منتصف الدائرة ليتحول الإطار إلى الأخضر.',
          'Visage non centré dans l’ovale — placez votre visage au centre jusqu’à ce que le cadre devienne vert.',
          'Face not detected inside the oval guide — center your face until the oval turns green.'
        ),
        canvas,
      };
    }

    return {
      valid: true,
      issue: 'ready',
      reason: tr(
        lang,
        'الوجه متمركز والإضاءة ممتازة — يمكنك الآن التقاط صورة المترشح.',
        'Visage bien centré et éclairage optimal — vous pouvez capturer la photo.',
        'Face centered and lighting verified — you may now capture your photo.'
      ),
      canvas,
    };
  }, [lang]);

  const captureValidatedFrame = useCallback(() => {
    const check = analyzeLiveCameraFrame();
    setLiveCheck({ valid: check.valid, issue: check.issue, reason: check.reason });
    if (!check.valid || !check.canvas) {
      setFaceCheckStatus('warn');
      setFaceCheckMessage(check.reason);
      return;
    }
    const photoUrl = check.canvas.toDataURL('image/jpeg', 0.82);
    setCameraPhotoDataUrl(photoUrl);
    setCameraChecked(true);
    setFaceCheckStatus('detected');
    setFaceCheckMessage(
      tr(
        lang,
        'تم التحقق من جودة الوجه والإضاءة والتقاط صورة المترشح بنجاح لإرفاقها بكشف النتيجة.',
        'Cadrage et luminosité validés — photo du candidat capturée pour le relevé final.',
        'Framing and lighting verified — candidate photo captured for the exam transcript.'
      )
    );
  }, [analyzeLiveCameraFrame, lang]);

  // Continuous live face/lighting inspection loop while live stream is open & before capture
  useEffect(() => {
    if (!cameraStreamActive || cameraPhotoDataUrl) return;
    const runCheck = () => {
      const check = analyzeLiveCameraFrame();
      setLiveCheck({ valid: check.valid, issue: check.issue, reason: check.reason });
      setFaceCheckStatus(check.valid ? 'detected' : check.issue === 'idle' ? 'checking' : 'warn');
      setFaceCheckMessage(check.reason);
    };
    runCheck();
    const id = window.setInterval(runCheck, 250);
    return () => window.clearInterval(id);
  }, [cameraStreamActive, cameraPhotoDataUrl, analyzeLiveCameraFrame]);

  const startCameraCheck = async () => {
    setCameraError(null);
    setCameraPhotoDataUrl(null);
    setFaceCheckStatus('checking');
    setFaceCheckMessage(null);
    setLiveCheck({
      valid: false,
      issue: 'idle',
      reason: tr(lang, 'جارٍ تشغيل الكاميرا وفحص الإضاءة...', 'Démarrage caméra et analyse...', 'Starting camera and analyzing...'),
    });
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setFaceCheckStatus('idle');
      setCameraError(
        tr(
          lang,
          'المتصفح لا يدعم واجهة الكاميرا؛ يمكنك المتابعة بدون كاميرا.',
          "Caméra non prise en charge par ce navigateur. Vous pouvez continuer sans caméra.",
          'Camera is not supported by this browser. You may continue without a camera.'
        )
      );
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      streamRef.current = stream;
      setCameraStreamActive(true);
      setCameraChecked(false);
      setCameraSkipped(false);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch {
      setFaceCheckStatus('idle');
      setCameraError(
        tr(
          lang,
          'تعذر الوصول إلى الكاميرا أو تم رفض الإذن. هذا الفحص اختياري ويمكنك تجاوزه.',
          "Accès caméra refusé ou indisponible. Ce contrôle est facultatif et peut être ignoré.",
          'Camera access denied or unavailable. This check is optional and can be skipped.'
        )
      );
    }
  };

  useEffect(() => {
    if (cameraStreamActive && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [cameraStreamActive]);

  const applyConfigPreset = (cfg: ExamConfig) => {
    setSelectedConfigId(cfg.id);
    setCustomMode(cfg.mode);
    setCustomTrack(cfg.track);
    setCustomSubject(cfg.subject_slug);
    setCustomLevel(cfg.level);
    setCustomCount(cfg.question_count);
    setCustomDuration(cfg.duration_minutes);
  };

  const handleLaunchExam = async (forceNew = false) => {
    if (!user) {
      goToAuth('login');
      return;
    }
    setStartError(null);
    if (cameraStreamActive && !cameraPhotoDataUrl && liveCheck.valid) {
      captureValidatedFrame();
    }
    stopCamera();
    try {
      const effectiveExamLang =
        customSubject === 'arabic-lang' || customSubject === 'islamic-education'
          ? 'ar'
          : customSubject === 'french-lang'
            ? 'fr'
            : examLang === 'all'
              ? undefined
              : examLang;

      const res = await apiRequest<{ attempt: ExamAttempt; questions: Question[] }>(
        '/api/exams/start',
        {
          method: 'POST',
          json: {
            configId: selectedConfigId,
            mode: customMode,
            track: customTrack,
            subjectSlug: customSubject,
            level: customLevel,
            examLang: effectiveExamLang,
            trackExact,
            questionCount: customCount,
            durationMinutes: customDuration,
            cameraChecked,
            cameraPhotoDataUrl,
            deviceMode,
            forceNew,
          },
        }
      );
      setActiveExam(res);
      setAnswers({});
      setFlagged([]);
      setQIndex(0);
      setElapsedSeconds(0);
      setStage('running');
    } catch (err: any) {
      if (err?.status === 409) {
        await refreshActiveExam();
        setStage('running');
      } else if (err?.status === 403 || err?.status === 402 || err?.code === 'PLAN_UPGRADE_REQUIRED' || err?.code === 'QUOTA_EXCEEDED') {
        const msg =
          err?.message ||
          (lang === 'ar'
            ? 'بلغت الحد اليومي للباقة المجانية. يمكنك الترقية لفتح الاختبارات غير المحدودة.'
            : 'Limite atteinte pour la formule gratuite.');
        setStartError(msg);
        openUpgradeModal(msg);
      } else {
        setStartError(err?.message || 'Unable to start exam');
      }
    }
  };

  const handleSelectOption = async (questionId: number, optIndex: number) => {
    if (!activeExam) return;
    setAnswers((prev) => ({ ...prev, [String(questionId)]: optIndex }));
    try {
      await apiRequest(`/api/exams/${activeExam.attempt.id}/answer`, {
        method: 'PATCH',
        json: {
          questionId,
          optionIndex: optIndex,
          flagged,
          timeSpentSeconds: elapsedSeconds,
        },
      });
      setSaveNotice(lang === 'ar' ? 'تم الحفظ تلقائياً' : 'Sauvegardé');
      window.setTimeout(() => setSaveNotice(null), 1500);
    } catch {
      // keep local selection; will retry on periodic save/submit
    }
  };

  const toggleFlag = async (questionId: number) => {
    if (!activeExam) return;
    const next = flagged.includes(questionId)
      ? flagged.filter((id) => id !== questionId)
      : [...flagged, questionId];
    setFlagged(next);
    try {
      await apiRequest(`/api/exams/${activeExam.attempt.id}/answer`, {
        method: 'PATCH',
        json: { flagged: next, timeSpentSeconds: elapsedSeconds },
      });
    } catch {
      // ignore
    }
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => undefined);
    } else {
      document.exitFullscreen?.().catch(() => undefined);
    }
  };

  const formatTimer = (sec: number) => {
    const s = Math.max(0, sec);
    const hrs = Math.floor(s / 3600);
    const mins = Math.floor((s % 3600) / 60);
    const rem = s % 60;
    const pad = (n: number) => String(n).padStart(2, '0');
    return hrs > 0 ? `${pad(hrs)}:${pad(mins)}:${pad(rem)}` : `${pad(mins)}:${pad(rem)}`;
  };

  // =========================================================================
  // STAGE 4: POST-EXAM FULL QUESTION-BY-QUESTION REVIEW
  // =========================================================================
  if (stage === 'review' && submittedAttempt) {
    const visibleItems = reviewItems.filter((item) =>
      reviewFilter === 'all' ? true : item.status === reviewFilter
    );

    return (
      <div className="px-4 sm:px-6 py-6 space-y-5">
        <div className="addressp-box !mb-0 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg sm:text-xl font-extrabold text-[#384D55]">
              {lang === 'ar' ? 'مراجعة الامتحان بعد التسليم' : "Révision détaillée après l'examen"}
            </h1>
            <p className="text-xs text-[#6b787e] tabular-nums mt-0.5">
              {t.scoreOutOf20}: <strong className="text-[#384D55]">{submittedAttempt.score_20} / 20</strong> ·{' '}
              {submittedAttempt.correct_count} {lang === 'ar' ? 'صحيحة' : 'correctes'} ·{' '}
              {submittedAttempt.wrong_count} {lang === 'ar' ? 'خاطئة' : 'erronées'} ·{' '}
              {submittedAttempt.unanswered_count} {lang === 'ar' ? 'غير مجاب' : 'sans réponse'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setStage('result')}
              className="imgsend2-secondary !py-2 !px-3.5 !text-xs"
            >
              {lang === 'ar' ? 'ملخص النتيجة' : 'Voir le résumé'}
            </button>
            <button
              type="button"
              onClick={() => navigate('dashboard')}
              className="px-3.5 py-2 rounded-[3px] bg-[#384D55] text-white text-xs font-bold cursor-pointer"
            >
              {t.navDashboard}
            </button>
          </div>
        </div>

        <div className="addressp-box !mb-0 !p-3 flex flex-wrap gap-2 text-xs font-bold">
          {(['all', 'wrong', 'correct', 'unanswered'] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setReviewFilter(f)}
              className={`px-3 py-1.5 rounded-[3px] border cursor-pointer ${
                reviewFilter === f
                  ? 'bg-[#384D55] text-white border-[#384D55]'
                  : 'bg-[#efefef] text-[#384D55] border-[#d8dfe2]'
              }`}
            >
              {f === 'all'
                ? lang === 'ar'
                  ? `الكل (${reviewItems.length})`
                  : `Tout (${reviewItems.length})`
                : f === 'wrong'
                  ? lang === 'ar'
                    ? 'الأخطاء فقط'
                    : 'Erreurs uniquement'
                  : f === 'correct'
                    ? lang === 'ar'
                      ? 'الصحيحة'
                      : 'Correctes'
                    : lang === 'ar'
                      ? 'غير مجاب عليها'
                      : 'Sans réponse'}
            </button>
          ))}
        </div>

        <div className="space-y-3 edu-copy-protected">
          {visibleItems.map((item, idx) => {
            const opts = lang === 'ar' ? item.options_ar : item.options_fr;
            return (
              <div key={item.id} className="addressp-box !mb-0 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-bold text-[#6b787e]">
                    #{idx + 1} · {lang === 'ar' ? item.topic_ar : item.topic_fr}
                  </span>
                  <span
                    className={`font-extrabold ${
                      item.status === 'correct'
                        ? 'text-green-700'
                        : item.status === 'wrong'
                          ? 'text-red-700'
                          : 'text-amber-700'
                    }`}
                  >
                    {item.status === 'correct'
                      ? lang === 'ar'
                        ? 'إجابة صحيحة'
                        : 'Correct'
                      : item.status === 'wrong'
                        ? lang === 'ar'
                          ? 'إجابة خاطئة'
                          : 'Incorrect'
                        : lang === 'ar'
                          ? 'لم تُجب'
                          : 'Non répondu'}
                  </span>
                </div>

                <h3 className="font-bold text-sm sm:text-base text-[#384D55]">
                  {lang === 'ar' ? item.stem_ar : item.stem_fr}
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs sm:text-sm">
                  {opts.map((opt, oIdx) => {
                    const isCorrect = oIdx === item.correct_index;
                    const isUser = oIdx === item.user_answer;
                    let cls = 'bg-[#f7f9fa] border-[#d8dfe2] text-[#384D55]';
                    if (isCorrect) cls = 'bg-[#e2efbf] border-[#53ce39] font-bold text-[#384D55]';
                    else if (isUser && !isCorrect) cls = 'bg-red-50 border-red-400 text-red-800 font-bold';
                    return (
                      <div key={oIdx} className={`p-2.5 rounded-[3px] border ${cls}`}>
                        {opt}
                        {isUser && (
                          <span className="ms-2 text-[11px] opacity-80">
                            ({lang === 'ar' ? 'اختيارك' : 'Votre choix'})
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="bg-[#f4f6f7] border border-[#A6CE39] rounded-[3px] p-3 text-xs sm:text-sm text-[#384D55] space-y-2">
                  <div>
                    <strong>{lang === 'ar' ? 'التفسير النموذجي: ' : 'Explication : '}</strong>
                    {lang === 'ar' ? item.explanation_ar : item.explanation_fr}
                  </div>
                  <AudioPlayerBar
                    compact
                    audioId={`review-attempt-${submittedAttempt.id}-q-${item.id}`}
                    arabicSpeechText={`${item.stem_speech_ar || item.stem_ar}. ${
                      item.explanation_speech_ar || item.explanation_ar
                    }`}
                    arabicFallbackText={`${item.stem_ar}. ${item.explanation_ar}`}
                    frenchText={`${item.stem_fr}. ${item.explanation_fr}`}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // =========================================================================
  // STAGE 3: RESULT SUMMARY (/20 GRADING & TOPIC BREAKDOWN)
  // =========================================================================
  if (stage === 'result' && submittedAttempt) {
    const score = Number(submittedAttempt.score_20 || 0);
    const passed = score >= (catalog.gradingPolicy?.passingScore || 10);
    const breakdown: TopicStat[] = submittedAttempt.topic_breakdown || [];
    const subjectBreakdown: SubjectStat[] = submittedAttempt.subject_breakdown || [];
    const resultPhoto = submittedAttempt.camera_photo_data_url || cameraPhotoDataUrl;
    const subjectMap = new Map(catalog.subjects.map((s) => [s.slug, s]));
    const trackDisplay =
      submittedAttempt.track === 'arabic'
        ? t.trackArabic
        : submittedAttempt.track === 'french'
          ? t.trackFrench
          : submittedAttempt.track === 'bilingual'
            ? t.trackBilingual
            : t.allTracks;

    const handleDownloadJpg = async () => {
      if (pdfBusy) return;
      setPdfBusy(true);
      try {
        const modeLabel =
          submittedAttempt.mode === 'official_sim'
            ? tr(lang, 'محاكاة رسمية', 'Simulation officielle', 'Official Simulation')
            : submittedAttempt.mode === 'placement'
              ? tr(lang, 'تحديد المستوى', 'Test de niveau', 'Placement Test')
              : tr(lang, 'ممارسة مركزة', 'Entraînement ciblé', 'Practice');
        await downloadExamTranscriptJpg(
          {
            attemptId: submittedAttempt.id,
            modeLabel,
            trackLabel: trackDisplay,
            studentName: user?.name || tr(lang, 'المترشح', 'Candidat', 'Candidate'),
            studentEmail: user?.email,
            score: Number(submittedAttempt.score_20 || 0),
            maxScore: catalog.gradingPolicy?.maxScore || 20,
            passingScore: catalog.gradingPolicy?.passingScore || 10,
            correctCount: Number(submittedAttempt.correct_count || 0),
            wrongCount: Number(submittedAttempt.wrong_count || 0),
            unansweredCount: Number(submittedAttempt.unanswered_count || 0),
            percentage: Number(submittedAttempt.percentage || 0),
            submittedAt: submittedAttempt.submitted_at,
            photoDataUrl: resultPhoto || undefined,
            subjectBreakdown: subjectBreakdown.map((sb) => {
              const sub = subjectMap.get(sb.subject_slug);
              return {
                label: sub ? (lang === 'ar' ? sub.name_ar : sub.name_fr) : sb.subject_slug,
                correct: sb.correct,
                total: sb.total,
                percentage: sb.percentage,
              };
            }),
            topicBreakdown: breakdown.map((tb) => ({
              label: lang === 'ar' ? tb.topic_ar : tb.topic_fr,
              correct: tb.correct,
              total: tb.total,
              percentage: tb.percentage,
            })),
          },
          lang
        );
      } finally {
        setPdfBusy(false);
      }
    };

    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-5 printable-transcript">
        <div className="addressp-box !mb-0 text-center space-y-3">
          <div className="flex flex-wrap items-center justify-center gap-4">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-[#384D55] text-[#A6CE39]">
              {passed ? <CheckCircle2 className="w-8 h-8" /> : <AlertTriangle className="w-8 h-8 text-amber-400" />}
            </div>
            {resultPhoto && (
              <div className="flex items-center gap-3 bg-[#f7f9fa] border border-[#d8dfe2] rounded-[6px] p-2">
                <img
                  src={resultPhoto}
                  alt={user?.name || tr(lang, 'صورة المترشح', 'Photo du candidat', 'Candidate photo')}
                  className="w-16 h-16 rounded-[4px] object-cover border border-[#A6CE39]"
                />
                <div className="text-start text-xs">
                  <div className="font-extrabold text-[#384D55]">{user?.name}</div>
                  <div className="text-[11px] text-[#6b787e]">{trackDisplay}</div>
                </div>
              </div>
            )}
          </div>

          <h1 className="text-xl sm:text-2xl font-extrabold text-[#384D55]">
            {tr(
              lang,
              'تم تصحيح الامتحان وتسجيل النتيجة',
              'Examen corrigé et enregistré',
              'Exam Graded and Recorded'
            )}
          </h1>
          <div className="text-4xl font-black text-[#384D55] tabular-nums">
            {score} <span className="text-lg font-bold text-[#6b787e]">/ {catalog.gradingPolicy?.maxScore || 20}</span>
          </div>
          <p className={`text-sm font-bold ${passed ? 'text-green-700' : 'text-amber-700'}`}>
            {passed
              ? tr(
                  lang,
                  'نتيجة موفقة — اجتزت عتبة النجاح المطلوبة.',
                  'Réussite — vous dépassez le seuil de réussite.',
                  'Great result — you passed the required threshold.'
                )
              : tr(
                  lang,
                  'تحتاج إلى مراجعة مركزة لرفع علامتك فوق عتبة النجاح (10/20).',
                  'Des révisions ciblées sont recommandées pour dépasser 10/20.',
                  'Focused revision is recommended to pass the 10/20 threshold.'
                )}
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 text-xs">
            <div className="bg-[#f4f6f7] border border-[#d8dfe2] rounded-[3px] p-3">
              <div className="text-[#6b787e]">{tr(lang, 'الإجابات الصحيحة', 'Correctes', 'Correct')}</div>
              <div className="text-lg font-extrabold text-green-700 tabular-nums">
                {submittedAttempt.correct_count}
              </div>
            </div>
            <div className="bg-[#f4f6f7] border border-[#d8dfe2] rounded-[3px] p-3">
              <div className="text-[#6b787e]">{tr(lang, 'الأخطاء', 'Erronées', 'Wrong')}</div>
              <div className="text-lg font-extrabold text-red-700 tabular-nums">
                {submittedAttempt.wrong_count}
              </div>
            </div>
            <div className="bg-[#f4f6f7] border border-[#d8dfe2] rounded-[3px] p-3">
              <div className="text-[#6b787e]">{tr(lang, 'غير مجاب', 'Sans réponse', 'Unanswered')}</div>
              <div className="text-lg font-extrabold text-amber-700 tabular-nums">
                {submittedAttempt.unanswered_count}
              </div>
            </div>
            <div className="bg-[#f4f6f7] border border-[#d8dfe2] rounded-[3px] p-3">
              <div className="text-[#6b787e]">{tr(lang, 'النسبة المئوية', 'Pourcentage', 'Percentage')}</div>
              <div className="text-lg font-extrabold text-[#384D55] tabular-nums">
                {submittedAttempt.percentage}%
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-4 print:hidden">
            <button
              type="button"
              disabled={pdfBusy}
              onClick={() => void handleDownloadJpg()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-[3px] bg-[#1a4430] hover:bg-[#0b2217] text-white font-bold text-xs cursor-pointer disabled:opacity-60"
            >
              <ImageIcon className="w-4 h-4 text-[#A6CE39]" />
              <span>
                {pdfBusy
                  ? t.loading
                  : tr(lang, 'تحميل كصورة (300 DPI)', 'Télécharger en image (JPG)', 'Download Image (300 DPI)')}
              </span>
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-[3px] border border-[#384D55] bg-white hover:bg-[#f4f6f7] text-[#384D55] font-bold text-xs cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>{t.printTranscript}</span>
            </button>
            <button
              type="button"
              onClick={() => loadReview(submittedAttempt.id)}
              className="imgsend2 !py-2 !px-5 !text-xs"
            >
              {tr(
                lang,
                'مراجعة الأسئلة والتفسيرات سؤالاً بسؤال',
                'Réviser question par question',
                'Review Questions & Explanations'
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                setStage('wizard');
                setStep(1);
                setSubmittedAttempt(null);
              }}
              className="imgsend2-secondary !py-2 !px-4 !text-xs"
            >
              {tr(lang, 'امتحان جديد', 'Nouvel examen', 'New Exam')}
            </button>
            <button
              type="button"
              onClick={() => navigate('dashboard')}
              className="px-4 py-2 rounded-[3px] bg-[#384D55] text-white font-bold text-xs cursor-pointer"
            >
              {t.navDashboard}
            </button>
          </div>
        </div>

        {/* Subject Breakdown Table */}
        {subjectBreakdown.length > 0 && (
          <div className="addressp-box !mb-0 space-y-3">
            <h2 className="ltitle2">
              {tr(lang, 'نتائج المواد التفصيلية', 'Résultats par matière', 'Subject Breakdown')}
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-[#f4f6f7] border-b border-[#d8dfe2] text-[#384D55]">
                    <th className="p-2.5 text-start">{tr(lang, 'المادة', 'Matière', 'Subject')}</th>
                    <th className="p-2.5 text-center">{tr(lang, 'الصحيحة / الإجمالي', 'Score', 'Correct / Total')}</th>
                    <th className="p-2.5 text-center">{tr(lang, 'النسبة المئوية', 'Pourcentage', 'Percentage')}</th>
                  </tr>
                </thead>
                <tbody>
                  {subjectBreakdown.map((sb) => {
                    const sub = subjectMap.get(sb.subject_slug);
                    const subLabel = sub ? (lang === 'ar' ? sub.name_ar : sub.name_fr) : sb.subject_slug;
                    return (
                      <tr key={sb.subject_slug} className="border-b border-[#efefef]">
                        <td className="p-2.5 font-bold text-[#384D55]">{subLabel}</td>
                        <td className="p-2.5 text-center font-bold tabular-nums text-[#384D55]">
                          {sb.correct} / {sb.total}
                        </td>
                        <td className="p-2.5 text-center font-extrabold tabular-nums text-[#1a4430]">
                          {sb.percentage}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Topic Breakdown */}
        {breakdown.length > 0 && (
          <div className="addressp-box !mb-0 space-y-3">
            <h2 className="ltitle2">
              {tr(lang, 'تحليل الأداء حسب المحاور والموضوعات', 'Analyse par thème', 'Performance by Topic')}
            </h2>
            <div className="space-y-2.5">
              {breakdown.map((tb, idx) => (
                <div key={idx} className="space-y-1">
                  <div className="flex items-center justify-between text-xs font-bold text-[#384D55]">
                    <span>{lang === 'ar' ? tb.topic_ar : tb.topic_fr}</span>
                    <span className="tabular-nums">
                      {tb.correct}/{tb.total} ({tb.percentage}%)
                    </span>
                  </div>
                  <div className="h-2 bg-[#efefef] rounded-[2px] overflow-hidden">
                    <div
                      className="h-full transition-all"
                      style={{
                        width: `${tb.percentage}%`,
                        backgroundColor: tb.percentage >= 70 ? '#53ce39' : tb.percentage >= 50 ? '#A6CE39' : '#d97706',
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // =========================================================================
  // STAGE 2: ACTIVE EXAM RUNNER (TIMER + AUTO-SAVE + NAVIGATOR + AUDIO)
  // =========================================================================
  if (stage === 'running' && activeExam) {
    const questions = activeExam.questions;
    const currentQ = questions[qIndex] || questions[0];
    const totalSeconds = activeExam.attempt.duration_minutes * 60;
    const remaining = Math.max(0, totalSeconds - elapsedSeconds);
    const isLowTime = remaining <= 300;
    const isCriticalTime = remaining <= 60;
    const answeredCount = Object.keys(answers).length;
    const opts = lang === 'ar' ? currentQ.options_ar : currentQ.options_fr;

    return (
      <div className="px-4 sm:px-6 py-5 space-y-4">
        {/* Top Exam Status Bar (Cohesive Grey Palette) */}
        <div className="bg-[#e8ecef] border border-[#cfd6da] text-[#384D55] p-3.5 sm:p-4 flex flex-wrap items-center justify-between gap-3 rounded-[3px]">
          <div>
            <div className="text-xs text-[#4b5e66] font-extrabold">
              {activeExam.attempt.mode === 'official_sim'
                ? lang === 'ar'
                  ? 'المحاكاة الرسمية للامتحان'
                  : 'Simulation officielle'
                : activeExam.attempt.mode === 'placement'
                  ? t.levelPlacement
                  : lang === 'ar'
                    ? 'امتحان تجريبي'
                    : 'Examen blanc'}
            </div>
            <div className="text-sm font-extrabold tabular-nums text-[#384D55]">
              {lang === 'ar' ? 'السؤال' : 'Question'} {qIndex + 1} / {questions.length} ·{' '}
              <span className="text-[#4a7c12]">
                {answeredCount} {lang === 'ar' ? 'مُجاب' : 'répondues'}
              </span>
              {saveNotice && <span className="ms-2 text-[11px] text-[#3a7d1e]">({saveNotice})</span>}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[3px] font-black text-sm tabular-nums border ${
                isCriticalTime
                  ? 'bg-red-600 text-white border-red-700'
                  : isLowTime
                    ? 'bg-amber-300 text-[#384D55] border-amber-400'
                    : 'bg-white text-[#384D55] border-[#cfd6da]'
              }`}
            >
              <Clock className="w-4 h-4" />
              <span>{formatTimer(remaining)}</span>
            </div>

            <button
              type="button"
              onClick={toggleFullscreen}
              className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1.5 rounded-[3px] bg-white hover:bg-[#f4f6f7] border border-[#cfd6da] text-[#384D55] text-xs font-semibold cursor-pointer"
              title={lang === 'ar' ? 'ملء الشاشة' : 'Plein écran'}
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() => setConfirmSubmitOpen(true)}
              className="imgsend2 !py-1.5 !px-4 !text-xs"
            >
              {lang === 'ar' ? 'إنهاء وتسليم الامتحان' : 'Terminer et soumettre'}
            </button>
          </div>
        </div>

        {isLowTime && (
          <div className="bg-amber-50 border border-amber-300 text-amber-900 px-4 py-2 text-xs font-bold flex items-center gap-2 rounded-[3px]">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>
              {isCriticalTime
                ? lang === 'ar'
                  ? 'تنبيه عاجل: تبقى أقل من دقيقة واحدة! سيتم تسليم الامتحان تلقائياً عند انتهاء الوقت.'
                  : "Alerte : moins d'une minute restante ! Soumission automatique à la fin du temps."
                : lang === 'ar'
                  ? 'تنبيه: تبقى أقل من 5 دقائق على نهاية الوقت المحدد.'
                  : 'Attention : il reste moins de 5 minutes.'}
            </span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          {/* Question Card */}
          <div className="lg:col-span-3 addressp-box !mb-0 space-y-4 edu-copy-protected">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#efefef] pb-3 text-xs">
              <span className="font-bold text-[#6b787e]">
                {lang === 'ar' ? currentQ.topic_ar : currentQ.topic_fr} · {currentQ.level}
              </span>
              <button
                type="button"
                onClick={() => toggleFlag(currentQ.id)}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-[3px] border text-xs font-bold cursor-pointer ${
                  flagged.includes(currentQ.id)
                    ? 'bg-amber-50 border-amber-400 text-amber-800'
                    : 'bg-[#efefef] border-[#d8dfe2] text-[#384D55]'
                }`}
              >
                <Flag className="w-3.5 h-3.5" />
                <span>{lang === 'ar' ? 'تحديد للمراجعة' : 'Marquer'}</span>
              </button>
            </div>

            <h2 className="text-base sm:text-lg font-extrabold text-[#384D55] leading-relaxed">
              {lang === 'ar' ? currentQ.stem_ar : currentQ.stem_fr}
            </h2>

            <AudioPlayerBar
              compact
              audioId={`exam-q-${currentQ.id}`}
              arabicSpeechText={currentQ.stem_speech_ar || currentQ.stem_ar}
              arabicFallbackText={currentQ.stem_ar}
              frenchText={currentQ.stem_fr}
              label={lang === 'ar' ? 'قراءة نص السؤال' : 'Lire la question'}
            />

            <div className="space-y-2.5">
              {opts.map((opt, optIdx) => {
                const selected = answers[String(currentQ.id)] === optIdx;
                return (
                  <button
                    key={optIdx}
                    type="button"
                    onClick={() => handleSelectOption(currentQ.id, optIdx)}
                    className={`w-full text-start p-3.5 rounded-[3px] border text-sm transition-colors flex items-center gap-3 cursor-pointer ${
                      selected
                        ? 'bg-[#e2efbf] border-[#384D55] font-bold text-[#384D55]'
                        : 'bg-[#f7f9fa] border-[#d8dfe2] hover:border-[#A6CE39] text-[#384D55]'
                    }`}
                  >
                    <span
                      className={`w-6 h-6 rounded-full border flex items-center justify-center text-xs font-extrabold shrink-0 ${
                        selected
                          ? 'bg-[#384D55] text-[#A6CE39] border-[#384D55]'
                          : 'bg-white text-[#6b787e] border-[#c9d0d3]'
                      }`}
                    >
                      {String.fromCharCode(65 + optIdx)}
                    </span>
                    <span>{opt}</span>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-[#efefef]">
              <button
                type="button"
                disabled={qIndex === 0}
                onClick={() => setQIndex((i) => Math.max(0, i - 1))}
                className="imgsend2-secondary !py-2 !px-4 !text-xs disabled:opacity-40"
              >
                {lang === 'ar' ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
                <span>{lang === 'ar' ? 'السؤال السابق' : 'Précédent'}</span>
              </button>

              {qIndex < questions.length - 1 ? (
                <button
                  type="button"
                  onClick={() => setQIndex((i) => Math.min(questions.length - 1, i + 1))}
                  className="inline-flex items-center gap-1 px-4 py-2 rounded-[3px] bg-[#384D55] hover:bg-[#49616a] text-white text-xs font-bold cursor-pointer"
                >
                  <span>{lang === 'ar' ? 'السؤال التالي' : 'Suivant'}</span>
                  {lang === 'ar' ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmSubmitOpen(true)}
                  className="imgsend2 !py-2 !px-5 !text-xs"
                >
                  {lang === 'ar' ? 'مراجعة وتسليم الامتحان' : 'Finaliser et soumettre'}
                </button>
              )}
            </div>
          </div>

          {/* Navigator Grid */}
          <aside className="addressp-box !mb-0 !p-4 space-y-3 h-fit">
            <h3 className="ltitle2 !text-xs">
              {lang === 'ar' ? 'خريطة الأسئلة' : 'Navigation rapide'}
            </h3>
            <div className="grid grid-cols-5 gap-1.5 tabular-nums">
              {questions.map((q, idx) => {
                const isAns = answers[String(q.id)] !== undefined;
                const isFlag = flagged.includes(q.id);
                const isCurr = idx === qIndex;
                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => setQIndex(idx)}
                    className={`h-8 rounded-[3px] text-xs font-bold border cursor-pointer relative ${
                      isCurr
                        ? 'border-[#384D55] ring-2 ring-[#A6CE39] bg-[#384D55] text-white'
                        : isAns
                          ? 'bg-[#e2efbf] border-[#A6CE39] text-[#384D55]'
                          : 'bg-[#f4f6f7] border-[#d8dfe2] text-[#6b787e]'
                    }`}
                  >
                    {idx + 1}
                    {isFlag && (
                      <span className="absolute -top-1 -end-1 w-2.5 h-2.5 rounded-full bg-amber-500" />
                    )}
                  </button>
                );
              })}
            </div>
            <div className="text-[11px] text-[#6b787e] space-y-1 pt-2 border-t border-[#efefef]">
              <div>
                <span className="inline-block w-2.5 h-2.5 bg-[#e2efbf] border border-[#A6CE39] me-1.5" />
                {lang === 'ar' ? 'سؤال مُجاب' : 'Répondu'}
              </div>
              <div>
                <span className="inline-block w-2.5 h-2.5 bg-amber-500 rounded-full me-1.5" />
                {lang === 'ar' ? 'محدد للمراجعة' : 'Marqué'}
              </div>
            </div>
          </aside>
        </div>

        {/* Confirm Submit Modal */}
        {confirmSubmitOpen && (
          <div className="fixed inset-0 z-50 bg-[#384D55]/45 flex items-center justify-center p-4" role="dialog" aria-modal="true">
            <div className="bg-white border border-[#c9d0d3] rounded-[3px] max-w-md w-full p-5 space-y-4 shadow-2xl">
              <h3 className="ltitle">
                {lang === 'ar' ? 'تأكيد إنهاء وتسليم الامتحان' : "Confirmer la soumission de l'examen"}
              </h3>
              <p className="text-xs sm:text-sm text-[#4a5c64] leading-relaxed">
                {lang === 'ar'
                  ? `لقد أجبت على ${answeredCount} من أصل ${questions.length} سؤالاً. بعد التسليم سيتم تصحيح الامتحان فوراً واحتساب النتيجة من 20.`
                  : `Vous avez répondu à ${answeredCount} sur ${questions.length} questions. La correction sur 20 sera calculée immédiatement.`}
              </p>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmSubmitOpen(false)}
                  className="imgsend2-secondary !py-2 !px-4 !text-xs"
                >
                  {lang === 'ar' ? 'متابعة الاختبار' : 'Continuer'}
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => handleSubmitExam(false)}
                  className="imgsend2 !py-2 !px-5 !text-xs"
                >
                  {submitting
                    ? t.loading
                    : lang === 'ar'
                      ? 'تأكيد التسليم الآن'
                      : 'Confirmer et soumettre'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // =========================================================================
  // STAGE 1: 9-STEP GUIDED ENTRY & EXAM CONFIGURATION
  // =========================================================================
  const stepTitles = [
    lang === 'ar' ? '1. اختيار وضع الجهاز' : '1. Mode d’appareil',
    lang === 'ar' ? '2. التعليمات والضوابط' : '2. Consignes',
    lang === 'ar' ? '3. جاهزية الكاميرا والشاشة' : '3. Préparation caméra',
    lang === 'ar' ? '4. الشعبة والمادة والمستوى' : '4. Filière & matière',
    lang === 'ar' ? '5. مراجعة المواصفات' : '5. Vérification',
    lang === 'ar' ? '6. تأكيد بدء الامتحان' : '6. Démarrage',
  ];

  const availableForCurrentFilter =
    customSubject === 'all'
      ? catalog.bankStats.totalVerifiedQuestions
      : catalog.bankStats.bySubject.find((b) => b.subject_slug === customSubject)?.count || 0;

  return (
    <div className="px-4 sm:px-6 py-6 space-y-5">
      <div className="rotator-box !mb-0">
        <div className="rotator-box-header !mb-0 !border-b-0 !pb-0 flex-wrap">
          <div>
            <h1 className="text-lg sm:text-xl font-extrabold text-[#384D55]">{t.navExams}</h1>
            <p className="text-xs font-normal text-[#6b787e] mt-0.5">
              {lang === 'ar'
                ? 'نظام الامتحانات الرسمية المحاكية والتجريبية وتحديد المستوى — تصحيح آلي من 20 وحفظ تلقائي للإجابات.'
                : 'Simulateur officiel, examens blancs et test de positionnement — correction automatique sur 20.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate('review-center')}
            className="imgsend2-secondary !py-2 !px-3.5 !text-xs"
          >
            {t.reviewBeforeExam}
          </button>
        </div>
      </div>

      {/* Preset Official Exam Models */}
      {!loadingConfigs && configs.length > 0 && (
        <section className="addressp-box !mb-0 space-y-3">
          <h2 className="ltitle">
            {lang === 'ar' ? 'النماذج الجاهزة المعتمدة' : 'Modèles d’examens configurés'}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {configs.map((cfg) => {
              const isSelected = selectedConfigId === cfg.id;
              return (
                <button
                  key={cfg.id}
                  type="button"
                  onClick={() => {
                    applyConfigPreset(cfg);
                    setStep(4);
                  }}
                  className={`text-start p-3.5 border rounded-[3px] transition-colors cursor-pointer ${
                    isSelected
                      ? 'border-[#384D55] bg-[#e2efbf]/50'
                      : 'border-[#d8dfe2] hover:border-[#A6CE39] bg-[#f7f9fa]'
                  }`}
                >
                  <div className="font-extrabold text-xs sm:text-sm text-[#384D55] mb-1">
                    {lang === 'ar' ? cfg.title_ar : cfg.title_fr}
                  </div>
                  <div className="text-[11px] text-[#6b787e] tabular-nums">
                    {cfg.question_count} Q · {cfg.duration_minutes}{' '}
                    {lang === 'ar' ? 'دقيقة' : 'min'} · {lang === 'ar' ? 'متاح:' : 'dispo:'}{' '}
                    <strong>{cfg.available_unique_questions}</strong>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Guided Stepper */}
      <div className="addressp-box !mb-0 space-y-5">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 border-b border-[#efefef] pb-4">
          {stepTitles.map((label, idx) => {
            const num = idx + 1;
            const active = step === num;
            return (
              <button
                key={num}
                type="button"
                onClick={() => setStep(num)}
                className={`p-2 rounded-[3px] text-[11px] font-bold text-center border cursor-pointer ${
                  active
                    ? 'bg-[#384D55] text-[#A6CE39] border-[#384D55]'
                    : step > num
                      ? 'bg-[#e2efbf]/60 text-[#384D55] border-[#A6CE39]'
                      : 'bg-[#efefef] text-[#6b787e] border-[#d8dfe2]'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* Step 1: Device Mode */}
        {step === 1 && (
          <div className="space-y-4">
            <h2 className="ltitle2">
              {lang === 'ar' ? 'اختر وضع الجهاز المناسب لجهازك' : "Choisissez le mode d'affichage"}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { id: 'desktop', label: lang === 'ar' ? 'حاسوب' : 'Ordinateur', icon: Laptop },
                { id: 'tablet', label: lang === 'ar' ? 'جهاز لوحي' : 'Tablette', icon: Tablet },
                { id: 'mobile', label: lang === 'ar' ? 'هاتف ذكي' : 'Mobile', icon: Smartphone },
              ].map((d) => {
                const Icon = d.icon;
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => setDeviceMode(d.id as any)}
                    className={`p-4 border rounded-[3px] flex items-center gap-3 cursor-pointer ${
                      deviceMode === d.id
                        ? 'border-[#384D55] bg-[#e2efbf]/50 font-extrabold'
                        : 'border-[#d8dfe2] bg-[#f7f9fa]'
                    }`}
                  >
                    <Icon className="w-6 h-6 text-[#384D55]" />
                    <span className="text-sm text-[#384D55]">{d.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Step 2: Instructions + Audio */}
        {step === 2 && (
          <div className="space-y-4">
            <h2 className="ltitle2">
              {lang === 'ar' ? 'تعليمات وإرشادات الامتحان' : "Instructions de l'épreuve"}
            </h2>
            <ul className="list-disc list-inside space-y-2 text-xs sm:text-sm text-[#384D55] bg-[#f4f6f7] border border-[#d8dfe2] rounded-[3px] p-4">
              <li>
                {lang === 'ar'
                  ? 'تحفظ إجاباتك تلقائياً على الخادم عند كل اختيار، ويمكنك استئناف الامتحان إذا أعدت تحميل الصفحة.'
                  : 'Vos réponses sont sauvegardées automatiquement sur le serveur à chaque sélection.'}
              </li>
              <li>
                {lang === 'ar'
                  ? 'تحسب النتيجة النهائية من 20 نقطة مع عرض تحليل نقاط القوة والضعف ومراجعة جميع الأسئلة بعد التسليم.'
                  : 'La note finale est calculée sur 20 avec analyse détaillée et révision complète après soumission.'}
              </li>
              <li>
                {lang === 'ar'
                  ? 'لا يكرر أي سؤال داخل الامتحان ولا تُستعمل أي أسئلة مكررة لرفع العدد.'
                  : "Aucune question n'est dupliquée ou reformulée pour gonfler le nombre."}
              </li>
            </ul>
            <AudioPlayerBar
              audioId="exam-instructions"
              arabicSpeechText="تُحْفَظُ إِجَابَاتُكَ تِلْقَائِيًّا عِنْدَ كُلِّ اخْتِيَارٍ، وَتُحْسَبُ النَّتِيجَةُ النِّهَائِيَّةُ مِنْ عِشْرِينَ نُقْطَةً مَعَ مُرَاجَعَةٍ شَامِلَةٍ بَعْدَ التَّسْلِيمِ."
              arabicFallbackText="تحفظ إجاباتك تلقائياً وتحسب النتيجة من 20."
              frenchText="Vos réponses sont enregistrées automatiquement. La note finale est calculée sur 20 avec révision complète."
              label={lang === 'ar' ? 'استماع لتعليمات الامتحان' : 'Écouter les consignes'}
            />
          </div>
        )}

        {/* Step 3: Optional Camera Check, Face Presence & Photo Capture */}
        {step === 3 && (
          <div className="space-y-4">
            <h2 className="ltitle2">
              {tr(
                lang,
                'فحص الجاهزية الاختياري (الكاميرا وملء الشاشة)',
                'Vérification facultative (caméra et plein écran)',
                'Optional Readiness Check (Camera & Fullscreen)'
              )}
            </h2>
            <div className="bg-[#f4f6f7] border border-[#cfd6da] rounded-[3px] p-3.5 text-xs text-[#384D55] flex items-start gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-[#384D55]" />
              <span>
                {tr(
                  lang,
                  'إفصاح شفاف: معاينة الكاميرا والتقاط الصورة وسيلتان اختياريتان لتوثيق بيئة الاختبار وإرفاق صورة المترشح بكشف النتيجة، ولا تقومان بالمراقبة الأمنية الصارمة. يمكنك التخطي في أي وقت.',
                  'Information transparente : la caméra et la capture photo sont facultatives pour préparer la session et joindre votre portrait au relevé de notes. Vous pouvez ignorer cette étape.',
                  'Transparent notice: camera preview and photo capture are optional tools to prepare your session and attach your photo to the transcript. You may skip this step.'
                )}
              </span>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={startCameraCheck}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-[3px] bg-[#384D55] text-white text-xs font-bold cursor-pointer"
              >
                <Camera className="w-4 h-4 text-[#A6CE39]" />
                <span>{tr(lang, 'تجربة الكاميرا وفحص الوجه', 'Tester la caméra et le cadrage', 'Test Camera & Face Check')}</span>
              </button>
              {cameraStreamActive && (
                <button
                  type="button"
                  disabled={!cameraPhotoDataUrl && !liveCheck.valid}
                  onClick={() => {
                    if (cameraPhotoDataUrl) {
                      setCameraPhotoDataUrl(null);
                      setCameraChecked(false);
                      setFaceCheckStatus('checking');
                      setFaceCheckMessage(null);
                    } else {
                      captureValidatedFrame();
                    }
                  }}
                  className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-[3px] text-white text-xs font-bold transition-opacity ${
                    !cameraPhotoDataUrl && !liveCheck.valid
                      ? 'bg-[#6b787e] opacity-55 cursor-not-allowed'
                      : 'bg-[#1a4430] hover:bg-[#0b2217] cursor-pointer'
                  }`}
                >
                  <RefreshCw className="w-3.5 h-3.5 text-[#A6CE39]" />
                  <span>
                    {cameraPhotoDataUrl
                      ? tr(lang, 'إعادة التقاط الصورة', 'Reprendre la photo', 'Retake Photo')
                      : tr(lang, 'التقاط الصورة الآن', 'Capturer la photo', 'Capture Photo')}
                  </span>
                </button>
              )}
              <button
                type="button"
                onClick={toggleFullscreen}
                className="imgsend2-secondary !py-2 !px-4 !text-xs"
              >
                <MonitorCheck className="w-4 h-4" />
                <span>{tr(lang, 'تفعيل ملء الشاشة', 'Activer plein écran', 'Enable Fullscreen')}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  stopCamera();
                  setCameraPhotoDataUrl(null);
                  setFaceCheckStatus('idle');
                  setFaceCheckMessage(null);
                  setLiveCheck({ valid: false, issue: 'idle', reason: '' });
                  setCameraSkipped(true);
                  setCameraChecked(false);
                }}
                className="imgsend2-secondary !py-2 !px-4 !text-xs"
              >
                {tr(lang, 'تخطي فحص الكاميرا', 'Ignorer la caméra', 'Skip Camera Check')}
              </button>
            </div>

            <canvas ref={canvasRef} className="hidden" />
            {cameraError && <p className="text-xs font-bold text-amber-700">{cameraError}</p>}

            {(cameraStreamActive || cameraPhotoDataUrl) && (
              <div className="flex flex-wrap items-start gap-4">
                {cameraStreamActive && (
                  <div className="w-64 border border-[#c9d0d3] rounded-[4px] overflow-hidden bg-[#e6eaed]">
                    <div className="relative w-full h-44 bg-black">
                      <video ref={videoRef} autoPlay playsInline muted className="w-full h-44 object-cover" />
                      {/* Guided Oval Framing Overlay — green when valid, red for lighting/contrast, amber for centering */}
                      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                        <div
                          className={`w-28 h-36 rounded-full border-2 shadow-[0_0_0_9999px_rgba(0,0,0,0.22)] transition-colors ${
                            cameraPhotoDataUrl || liveCheck.valid
                              ? 'border-solid border-green-500'
                              : liveCheck.issue === 'lighting' || liveCheck.issue === 'contrast'
                                ? 'border-dashed border-red-500'
                                : 'border-dashed border-amber-500'
                          }`}
                        />
                      </div>
                    </div>
                    <div className="px-2.5 py-1 text-[11px] font-bold bg-[#f4f6f7] text-[#384D55] flex items-center justify-between gap-2">
                      <span>{tr(lang, 'البث المباشر للكاميرا', 'Aperçu caméra en direct', 'Live Camera Preview')}</span>
                      {cameraDiagnostics && (
                        <span dir="ltr" className="text-[10px] text-[#5c686e] tabular-nums">
                          {cameraDiagnostics.resolution} · {cameraDiagnostics.brightnessPct}%
                        </span>
                      )}
                    </div>
                  </div>
                )}
                {cameraPhotoDataUrl && (
                  <div className="w-48 border border-[#A6CE39] rounded-[4px] overflow-hidden bg-[#f7f9fa]">
                    <img
                      src={cameraPhotoDataUrl}
                      alt={tr(lang, 'الصورة الملتقطة', 'Photo capturée', 'Captured photo')}
                      className="w-full h-36 object-cover"
                    />
                    <div className="px-2.5 py-1 text-[11px] font-bold bg-[#e2efbf] text-[#1c2a0e]">
                      {tr(lang, 'صورة المترشح المرفقة بالنتيجة', 'Photo jointe au relevé', 'Photo attached to transcript')}
                    </div>
                  </div>
                )}
              </div>
            )}

            {faceCheckMessage && (
              <p
                className={`text-xs font-bold ${
                  faceCheckStatus === 'detected'
                    ? 'text-green-700'
                    : liveCheck.issue === 'lighting' || liveCheck.issue === 'contrast'
                      ? 'text-red-700'
                      : 'text-amber-700'
                }`}
              >
                {faceCheckMessage}
              </p>
            )}

            {(cameraChecked || cameraSkipped) && (
              <p className="text-xs font-bold text-green-700">
                {cameraChecked
                  ? tr(lang, 'تم فحص الكاميرا والتحقق من الصورة بنجاح.', 'Caméra prête et photo vérifiée.', 'Camera check and photo verification completed.')
                  : tr(lang, 'تم اختيار المتابعة بدون كاميرا.', 'Mode sans caméra sélectionné.', 'Proceeding without camera.')}
              </p>
            )}
          </div>
        )}

        {/* Step 4: Track, Subject, Level & Mode */}
        {step === 4 && (
          <div className="space-y-4">
            <h2 className="ltitle2">
              {lang === 'ar' ? 'تخصيص نوع الاختبار والشعبة والمادة' : 'Choix de la filière, matière et niveau'}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
              <div>
                <label className="block font-bold mb-1 text-[#384D55]">{lang === 'ar' ? 'نمط الاختبار' : 'Type'}</label>
                <select
                  value={customMode}
                  onChange={(e) => {
                    const m = e.target.value as ExamMode;
                    setCustomMode(m);
                    setSelectedConfigId(null);
                    if (m === 'official_sim') {
                      setCustomCount(70);
                      setCustomDuration(90);
                    }
                  }}
                  className="template-input text-xs"
                >
                  <option value="official_sim">
                    {lang === 'ar' ? 'محاكاة رسمية (70 سؤالاً / 90 دقيقة)' : 'Simulation officielle (70 Q / 90 min)'}
                  </option>
                  <option value="mock">{lang === 'ar' ? 'امتحان تجريبي مرن' : 'Examen blanc flexible'}</option>
                  <option value="placement">{t.levelPlacement}</option>
                </select>
              </div>
              <div>
                <label className="block font-bold mb-1 text-[#384D55]">{t.navTracks}</label>
                <select
                  value={customTrack}
                  onChange={(e) => {
                    setCustomTrack(e.target.value as TrackSlug);
                    setSelectedConfigId(null);
                  }}
                  className="template-input text-xs"
                >
                  <option value="all">{t.allTracks}</option>
                  <option value="arabic">{t.trackArabic}</option>
                  <option value="french">{t.trackFrench}</option>
                  <option value="bilingual">{t.trackBilingual}</option>
                </select>
              </div>
              <div>
                <label className="block font-bold mb-1 text-[#384D55]">{lang === 'ar' ? 'المادة' : 'Matière'}</label>
                <select
                  value={customSubject}
                  onChange={(e) => {
                    const nextSub = e.target.value;
                    setCustomSubject(nextSub);
                    setSelectedConfigId(null);
                    if (nextSub === 'arabic-lang' || nextSub === 'islamic-education') {
                      setExamLang('ar');
                    } else if (nextSub === 'french-lang') {
                      setExamLang('fr');
                    }
                  }}
                  className="template-input text-xs"
                >
                  <option value="all">{lang === 'ar' ? 'شامل لجميع المواد' : 'Toutes matières confondues'}</option>
                  {catalog.subjects.map((s) => (
                    <option key={s.slug} value={s.slug}>
                      {lang === 'ar' ? s.name_ar : s.name_fr}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-bold mb-1 text-[#384D55]">
                  {tr(lang, 'لغة أسئلة الامتحان', 'Langue des questions', 'Exam Question Language')}
                </label>
                <select
                  value={
                    customSubject === 'arabic-lang' || customSubject === 'islamic-education'
                      ? 'ar'
                      : customSubject === 'french-lang'
                        ? 'fr'
                        : examLang
                  }
                  disabled={
                    customSubject === 'arabic-lang' ||
                    customSubject === 'islamic-education' ||
                    customSubject === 'french-lang'
                  }
                  onChange={(e) => {
                    setExamLang(e.target.value as 'all' | 'ar' | 'fr');
                    setSelectedConfigId(null);
                  }}
                  className="template-input text-xs disabled:opacity-70"
                >
                  <option value="all">{tr(lang, 'الكل (حسب الشعبة)', 'Toutes selon filière', 'All (by Track)')}</option>
                  <option value="ar">{tr(lang, 'العربية فقط', 'Arabe uniquement', 'Arabic Only')}</option>
                  <option value="fr">{tr(lang, 'الفرنسية فقط', 'Français uniquement', 'French Only')}</option>
                </select>
              </div>
              <div>
                <label className="block font-bold mb-1 text-[#384D55]">{t.navLevels}</label>
                <select
                  value={customLevel}
                  onChange={(e) => {
                    setCustomLevel(e.target.value);
                    setSelectedConfigId(null);
                  }}
                  className="template-input text-xs"
                >
                  <option value="all">{lang === 'ar' ? 'كل المستويات' : 'Tous niveaux'}</option>
                  <option value="foundation">{t.levelFoundation}</option>
                  <option value="intermediate">{t.levelIntermediate}</option>
                  <option value="advanced">{t.levelAdvanced}</option>
                </select>
              </div>
              <div>
                <label className="block font-bold mb-1 text-[#384D55]">{lang === 'ar' ? 'عدد الأسئلة' : 'Nombre de questions'}</label>
                <input
                  type="number"
                  min={5}
                  max={100}
                  value={customCount}
                  onChange={(e) => {
                    setCustomCount(Number(e.target.value));
                    setSelectedConfigId(null);
                  }}
                  className="template-input tabular-nums text-xs"
                />
              </div>
              <div>
                <label className="block font-bold mb-1 text-[#384D55]">{lang === 'ar' ? 'المدة (بالدقائق)' : 'Durée (min)'}</label>
                <input
                  type="number"
                  min={5}
                  max={180}
                  value={customDuration}
                  onChange={(e) => {
                    setCustomDuration(Number(e.target.value));
                    setSelectedConfigId(null);
                  }}
                  className="template-input tabular-nums text-xs"
                />
              </div>
              <div className="sm:col-span-2 lg:col-span-3 pt-1">
                <label className="inline-flex items-center gap-2 text-xs font-semibold text-[#384D55] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={trackExact}
                    onChange={(e) => setTrackExact(e.target.checked)}
                    className="accent-[#384D55]"
                  />
                  <span>
                    {tr(
                      lang,
                      'عزل صارم لأسئلة الشعبة المختارة فقط (عدم خلط الأسئلة المشتركة)',
                      'Isolation stricte de la filière sélectionnée (exclure les questions communes)',
                      'Strict track isolation (exclude cross-track shared questions)'
                    )}
                  </span>
                </label>
              </div>
            </div>
          </div>
        )}

        {/* Step 5: Specification & 70-Question Honesty Review */}
        {step === 5 && (
          <div className="space-y-4">
            <h2 className="ltitle2">
              {lang === 'ar' ? 'مراجعة المواصفات قبل البدء' : 'Récapitulatif avant démarrage'}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs sm:text-sm bg-[#f4f6f7] border border-[#d8dfe2] rounded-[3px] p-4">
              <div>
                <strong>{lang === 'ar' ? 'النمط: ' : 'Mode : '}</strong>
                {customMode}
              </div>
              <div>
                <strong>{lang === 'ar' ? 'الشعبة: ' : 'Filière : '}</strong>
                {customTrack}
              </div>
              <div>
                <strong>{lang === 'ar' ? 'عدد الأسئلة المطلوب: ' : 'Questions demandées : '}</strong>
                <span className="tabular-nums">{customCount}</span>
              </div>
              <div>
                <strong>{lang === 'ar' ? 'الأسئلة الفريدة المتوفرة: ' : 'Questions uniques disponibles : '}</strong>
                <span className="tabular-nums font-bold">{availableForCurrentFilter}</span>
              </div>
            </div>

            {customMode === 'official_sim' && availableForCurrentFilter < 70 && (
              <div className="bg-amber-50 border border-amber-300 rounded-[3px] p-3.5 text-xs text-amber-900 flex items-start gap-2">
                <XCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-700" />
                <span>
                  {lang === 'ar'
                    ? `تنبيه: المحاكاة الرسمية الكاملة تتطلب 70 سؤالاً فريداً على الأقل. التصفية الحالية تحتوي على ${availableForCurrentFilter} سؤالاً فقط — اختر "شامل لجميع المواد" للوصول إلى النصاب الكامل (70+)، أو بدّل النمط إلى امتحان تجريبي قصير.`
                    : `Attention : la simulation officielle requiert 70 questions uniques. Ce filtre contient ${availableForCurrentFilter} questions — sélectionnez "Toutes matières confondues" pour 70+ questions ou passez en examen blanc court.`}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Step 6: Start Confirmation */}
        {step === 6 && (
          <div className="space-y-4 text-center py-4">
            <h2 className="text-lg font-extrabold text-[#384D55]">
              {lang === 'ar' ? 'أنت جاهز لبدء الامتحان' : "Prêt à démarrer l'épreuve"}
            </h2>
            {!user && (
              <div className="bg-amber-50 border border-amber-200 rounded-[3px] p-3 text-xs text-amber-900 max-w-lg mx-auto">
                {lang === 'ar'
                  ? 'يتطلب حفظ إجاباتك وتسجيل علامتك في لوحة الطالب تسجيل الدخول أولاً.'
                  : 'La connexion est requise pour sauvegarder vos réponses et enregistrer votre note sur 20.'}
              </div>
            )}
            {startError && (
              <div className="bg-red-50 border border-red-200 rounded-[3px] p-3 text-xs text-red-700 max-w-lg mx-auto">
                {startError}
              </div>
            )}
            <div className="flex flex-wrap justify-center gap-3">
              {!user ? (
                <>
                  <button
                    type="button"
                    onClick={() => goToAuth('login')}
                    className="imgsend2-secondary !py-2.5 !px-6 !text-xs"
                  >
                    {t.login}
                  </button>
                  <button
                    type="button"
                    onClick={() => goToAuth('register')}
                    className="imgsend2 !py-2.5 !px-6 !text-xs"
                  >
                    {t.register}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => handleLaunchExam(false)}
                  className="imgsend2"
                >
                  {t.startExam}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Step Navigation Buttons */}
        <div className="flex items-center justify-between pt-4 border-t border-[#efefef]">
          <button
            type="button"
            disabled={step === 1}
            onClick={() => setStep((s) => Math.max(1, s - 1))}
            className="imgsend2-secondary !py-2 !px-4 !text-xs disabled:opacity-40"
          >
            {lang === 'ar' ? 'الخطوة السابقة' : 'Précédent'}
          </button>
          {step < 6 && (
            <button
              type="button"
              onClick={() => setStep((s) => Math.min(6, s + 1))}
              className="imgsend2 !py-2 !px-5 !text-xs"
            >
              {lang === 'ar' ? 'الخطوة التالية' : 'Suivant'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
