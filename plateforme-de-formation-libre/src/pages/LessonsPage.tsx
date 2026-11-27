import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDashed,
  Eye,
  Heart,
  HelpCircle,
  Layers,
  ListOrdered,
  Search,
} from 'lucide-react';
import { AnimatedRingSvg, subjectSlugToIconKey } from '../components/AnimatedRingIcons';
import { AudioPlayerBar } from '../components/AudioPlayerBar';
import { useApp } from '../context/AppContext';
import { getT } from '../i18n/translations';
import { setLessonProgressDoc } from '../lib/firestoreService';
import type { Lesson, TrackSlug } from '../types';
import { apiRequest } from '../utils/api';
import { speechEngine } from '../utils/speechEngine';

export const LessonsPage: React.FC = () => {
  const {
    lang,
    selectedTrack,
    setSelectedTrack,
    catalog,
    user,
    firebaseUser,
    goToAuth,
    navigate,
    openUpgradeModal,
    viewParams,
  } = useApp();
  const t = getT(lang);

  const [subjectFilter, setSubjectFilter] = useState<string>(viewParams.subjectSlug || 'all');
  const [sectionFilter, setSectionFilter] = useState<string>('all');
  const [levelFilter, setLevelFilter] = useState<string>(viewParams.level || 'all');
  const [langFilter, setLangFilter] = useState<'all' | 'ar' | 'fr'>('all');
  const [trackExact, setTrackExact] = useState<boolean>(false);
  const [search, setSearch] = useState<string>(viewParams.search || '');
  const [favoritesOnly, setFavoritesOnly] = useState<boolean>(Boolean(viewParams.favoritesOnly));
  const [activeLessonId, setActiveLessonId] = useState<number | null>(viewParams.lessonId || null);
  const [hydratedLesson, setHydratedLesson] = useState<Lesson | null>(null);
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [serverTotal, setServerTotal] = useState<number | null>(null);
  const [serverLessons, setServerLessons] = useState<Lesson[] | null>(null);

  // Interactive states inside Lesson Reader
  const [revealedSolutions, setRevealedSolutions] = useState<Record<number, boolean>>({});
  const [mcqAnswers, setMcqAnswers] = useState<Record<number, number>>({});
  const [savingProgress, setSavingProgress] = useState(false);
  const [progressError, setProgressError] = useState<string | null>(null);
  const [quotaError, setQuotaError] = useState<string | null>(null);

  useEffect(() => {
    if (viewParams.subjectSlug !== undefined) setSubjectFilter(viewParams.subjectSlug);
    if (viewParams.level !== undefined) setLevelFilter(viewParams.level);
    if (viewParams.search !== undefined) setSearch(viewParams.search);
    if (viewParams.favoritesOnly !== undefined) setFavoritesOnly(viewParams.favoritesOnly);
    setActiveLessonId(viewParams.lessonId ?? null);
    setQuotaError(null);
  }, [viewParams]);

  useEffect(() => {
    setPage(1);
  }, [selectedTrack, trackExact, langFilter, subjectFilter, sectionFilter, levelFilter, favoritesOnly, search]);

  useEffect(() => {
    if (favoritesOnly || sectionFilter !== 'all') {
      setServerLessons(null);
      setServerTotal(null);
      return;
    }
    let active = true;
    const qs = new URLSearchParams({
      page: String(page),
      limit: '18',
      track: selectedTrack,
      subject: subjectFilter,
      level: levelFilter,
      lang: langFilter,
      q: search.trim(),
    });
    apiRequest<{ lessons?: Lesson[]; total?: number; totalPages?: number }>(`/api/lessons?${qs.toString()}`)
      .then((res) => {
        if (!active || !Array.isArray(res.lessons)) return;
        const localProgressMap = new Map(
          catalog.lessons.map((l) => [l.id, { completed: l.completed, is_favorite: l.is_favorite }])
        );
        const merged = res.lessons.map((l) => ({
          ...l,
          completed: l.completed ?? localProgressMap.get(l.id)?.completed,
          is_favorite: l.is_favorite ?? localProgressMap.get(l.id)?.is_favorite,
        }));
        setServerLessons(merged);
        setServerTotal(typeof res.total === 'number' ? res.total : merged.length);
        setTotalPages(Math.max(1, Number(res.totalPages || 1)));
      })
      .catch(() => {
        if (active) {
          setServerLessons(null);
          setServerTotal(null);
        }
      });
    return () => {
      active = false;
    };
  }, [page, selectedTrack, subjectFilter, levelFilter, langFilter, search, favoritesOnly, sectionFilter, catalog.lessons]);

  // Language isolation lock for Arabic/Islamic and French core subjects
  useEffect(() => {
    if (subjectFilter === 'arabic-lang' || subjectFilter === 'islamic-education') {
      setLangFilter('ar');
    } else if (subjectFilter === 'french-lang') {
      setLangFilter('fr');
    }
  }, [subjectFilter]);

  const langLocked =
    subjectFilter === 'arabic-lang' ||
    subjectFilter === 'islamic-education' ||
    subjectFilter === 'french-lang';

  // Verify daily free-tier lesson quota when opening via deep link / viewParams
  useEffect(() => {
    if (!activeLessonId) {
      setHydratedLesson(null);
      return;
    }
    let active = true;
    apiRequest<{ lesson?: Lesson }>(`/api/lessons/${activeLessonId}`)
      .then((r) => {
        if (active && r.lesson) setHydratedLesson(r.lesson);
      })
      .catch(() => {});
    apiRequest<{ allowed: boolean }>(`/api/lessons/${activeLessonId}/access`, { method: 'POST' }).catch(
      (err: any) => {
        if (!active) return;
        if (err?.status === 403 || err?.data?.code === 'QUOTA_EXCEEDED' || err?.data?.code === 'PLAN_UPGRADE_REQUIRED') {
          const msg =
            err?.message ||
            (lang === 'ar'
              ? 'بلغت الحد اليومي للباقة المجانية. يمكنك الترقية لفتح جميع الدروس.'
              : 'Limite quotidienne atteinte pour la formule gratuite.');
          setQuotaError(msg);
          openUpgradeModal(msg);
          setActiveLessonId(null);
        }
      }
    );
    return () => {
      active = false;
    };
  }, [activeLessonId, lang, openUpgradeModal]);

  const handleOpenLesson = async (id: number) => {
    setQuotaError(null);
    setProgressError(null);
    try {
      await apiRequest<{ allowed: boolean }>(`/api/lessons/${id}/access`, { method: 'POST' });
      setActiveLessonId(id);
    } catch (err: any) {
      if (err?.status === 403 || err?.data?.code === 'QUOTA_EXCEEDED' || err?.data?.code === 'PLAN_UPGRADE_REQUIRED') {
        const msg =
          err?.message ||
          (lang === 'ar'
            ? 'بلغت الحد اليومي للباقة المجانية. يمكنك الترقية لفتح جميع الدروس.'
            : 'Limite quotidienne atteinte pour la formule gratuite.');
        setQuotaError(msg);
        openUpgradeModal(msg);
      } else {
        setActiveLessonId(id);
      }
    }
  };

  // Ensure audio always stops cleanly when switching lessons or unmounting
  useEffect(() => {
    speechEngine.stop();
    setRevealedSolutions({});
    setMcqAnswers({});
    return () => {
      speechEngine.stop();
    };
  }, [activeLessonId]);

  const orderedLessons = useMemo(() => {
    if (serverLessons && !trackExact && !favoritesOnly && sectionFilter === 'all') {
      return serverLessons;
    }
    const q = search.trim().toLowerCase();
    return catalog.lessons
      .filter((l) => {
        const trackMatch =
          selectedTrack === 'all' ||
          (trackExact
            ? l.track === selectedTrack
            : l.track === 'all' ||
              l.track === selectedTrack ||
              (selectedTrack === 'bilingual' &&
                (l.track === 'arabic' || l.track === 'french' || l.track === 'bilingual')));
        const langMatch =
          langFilter === 'all' ||
          (langFilter === 'ar'
            ? Boolean(l.title_ar?.trim()) && l.track !== 'french' && l.subject_slug !== 'french-lang'
            : Boolean(l.title_fr?.trim()) &&
              l.track !== 'arabic' &&
              l.subject_slug !== 'arabic-lang' &&
              l.subject_slug !== 'islamic-education');
        const subMatch = subjectFilter === 'all' || l.subject_slug === subjectFilter;
        const secMatch = sectionFilter === 'all' || l.sectionId === sectionFilter;
        const lvlMatch = levelFilter === 'all' || l.level === levelFilter;
        const favMatch = !favoritesOnly || Boolean(l.is_favorite);
        const qMatch =
          !q ||
          l.title_ar.toLowerCase().includes(q) ||
          l.title_fr.toLowerCase().includes(q) ||
          l.summary_ar.toLowerCase().includes(q) ||
          l.summary_fr.toLowerCase().includes(q);
        return trackMatch && langMatch && subMatch && secMatch && lvlMatch && favMatch && qMatch;
      })
      .sort((a, b) => (a.lesson_order || a.id) - (b.lesson_order || b.id));
  }, [serverLessons, catalog.lessons, selectedTrack, trackExact, langFilter, subjectFilter, sectionFilter, levelFilter, favoritesOnly, search]);

  const completedInScope = orderedLessons.filter((l) => l.completed).length;
  const progressPct =
    orderedLessons.length > 0 ? Math.round((completedInScope / orderedLessons.length) * 100) : 0;

  const activeLesson: Lesson | undefined = useMemo(() => {
    if (!activeLessonId) return undefined;
    if (hydratedLesson && hydratedLesson.id === activeLessonId) {
      const localMatch = catalog.lessons.find((l) => l.id === activeLessonId);
      return {
        ...hydratedLesson,
        completed: localMatch?.completed ?? hydratedLesson.completed,
        is_favorite: localMatch?.is_favorite ?? hydratedLesson.is_favorite,
      };
    }
    return (
      catalog.lessons.find((l) => l.id === activeLessonId) ||
      orderedLessons.find((l) => l.id === activeLessonId)
    );
  }, [hydratedLesson, catalog.lessons, orderedLessons, activeLessonId]);

  const activeIndex = useMemo(
    () => (activeLesson ? orderedLessons.findIndex((l) => l.id === activeLesson.id) : -1),
    [orderedLessons, activeLesson]
  );

  const prevLesson = activeIndex > 0 ? orderedLessons[activeIndex - 1] : null;
  const nextLesson =
    activeIndex >= 0 && activeIndex < orderedLessons.length - 1
      ? orderedLessons[activeIndex + 1]
      : null;

  const subjectName = (slug: string) => {
    const sub = catalog.subjects.find((s) => s.slug === slug);
    return sub ? (lang === 'ar' ? sub.name_ar : sub.name_fr) : slug;
  };

  const levelLabel = (lvl: string) => {
    if (lvl === 'foundation') return t.levelFoundation;
    if (lvl === 'intermediate') return t.levelIntermediate;
    return t.levelAdvanced;
  };

  const handleToggleProgress = async (lesson: Lesson, field: 'completed' | 'is_favorite') => {
    setProgressError(null);
    if (!user || !firebaseUser) {
      goToAuth('login');
      return;
    }
    if (!(firebaseUser.emailVerified || user.email_verified)) {
      setProgressError(
        lang === 'ar'
          ? 'يرجى تأكيد بريدك الإلكتروني أولاً لحفظ التقدم والمفضلة.'
          : 'Veuillez vérifier votre e-mail pour enregistrer votre progression.'
      );
      return;
    }
    setSavingProgress(true);
    try {
      const nextCompleted = field === 'completed' ? !lesson.completed : Boolean(lesson.completed);
      const nextFav = field === 'is_favorite' ? !lesson.is_favorite : Boolean(lesson.is_favorite);
      await setLessonProgressDoc(
        user.uid,
        lesson.firestoreId || String(lesson.id),
        nextCompleted,
        nextFav
      );
    } catch (err: any) {
      setProgressError(err?.message || 'Error saving progress');
    } finally {
      setSavingProgress(false);
    }
  };

  // =========================================================================
  // REORGANIZED STRUCTURED LESSON READER (SIDEBAR + PROGRESS + PER-SECTION AUDIO)
  // =========================================================================
  if (activeLesson) {
    const title = lang === 'ar' ? activeLesson.title_ar : activeLesson.title_fr;
    const summary = lang === 'ar' ? activeLesson.summary_ar : activeLesson.summary_fr;
    const explanation = lang === 'ar' ? activeLesson.explanation_ar : activeLesson.explanation_fr;
    const orderNum = activeLesson.lesson_order || activeIndex + 1;

    return (
      <div className="px-4 sm:px-6 py-6 space-y-5">
        {/* Top Control & Progress Header */}
        <div className="addressp-box !mb-0 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setActiveLessonId(null)}
              className="imgsend2-secondary !py-1.5 !px-3 !text-xs"
            >
              {lang === 'ar' ? <ArrowRight className="w-4 h-4" /> : <ArrowLeft className="w-4 h-4" />}
              <span>{lang === 'ar' ? 'فهرس الدروس' : 'Index des leçons'}</span>
            </button>

            <div className="hidden sm:flex items-center gap-2 text-xs text-[#6b787e] ps-2">
              <span className="font-bold text-[#384D55] tabular-nums">{progressPct}%</span>
              <div className="w-28 h-2 bg-[#e8ecef] rounded-[2px] overflow-hidden">
                <div className="h-full bg-[#A6CE39]" style={{ width: `${progressPct}%` }} />
              </div>
              <span className="tabular-nums">
                ({completedInScope}/{orderedLessons.length})
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              disabled={savingProgress}
              onClick={() => handleToggleProgress(activeLesson, 'is_favorite')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[3px] border text-xs font-bold cursor-pointer ${
                activeLesson.is_favorite
                  ? 'bg-red-50 border-red-300 text-red-700'
                  : 'bg-white border-[#c9d0d3] text-[#384D55]'
              }`}
            >
              <Heart className={`w-4 h-4 ${activeLesson.is_favorite ? 'fill-red-600 text-red-600' : ''}`} />
              <span>{t.favorites}</span>
            </button>

            <button
              type="button"
              disabled={savingProgress}
              onClick={() => handleToggleProgress(activeLesson, 'completed')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-[3px] border text-xs font-bold cursor-pointer ${
                activeLesson.completed
                  ? 'bg-[#e2efbf] border-[#A6CE39] text-[#384D55]'
                  : 'bg-[#efefef] border-[#cfd6da] text-[#384D55] hover:bg-[#A6CE39]'
              }`}
            >
              <CheckCircle2 className="w-4 h-4 text-[#557a16]" />
              <span>
                {activeLesson.completed
                  ? lang === 'ar'
                    ? 'تم إتمام الدرس'
                    : 'Leçon terminée'
                  : lang === 'ar'
                    ? 'تسجيل إتمام الدرس'
                    : 'Marquer comme terminé'}
              </span>
            </button>
          </div>
        </div>

        {progressError && (
          <div className="p-3 rounded-[3px] border border-red-200 bg-red-50 text-red-700 text-xs font-bold">
            {progressError}
          </div>
        )}

        {/* Structured Two-Column Curriculum Reader */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-5 items-start">
          {/* Course Outline Sidebar */}
          <aside className="lg:col-span-1 addressp-box space-y-3">
            <div className="flex items-center justify-between border-b border-[#efefef] pb-2.5">
              <h2 className="font-extrabold text-xs sm:text-sm text-[#384D55] flex items-center gap-1.5">
                <ListOrdered className="w-4 h-4 text-[#557a16]" />
                <span>{lang === 'ar' ? 'تسلسل الدروس' : 'Parcours des leçons'}</span>
              </h2>
              <span className="text-[11px] font-bold text-[#6b787e] tabular-nums">
                {completedInScope}/{orderedLessons.length}
              </span>
            </div>

            <div className="space-y-1.5 max-h-[540px] overflow-y-auto no-scrollbar">
              {orderedLessons.map((item, idx) => {
                const isCurr = item.id === activeLesson.id;
                const isDone = Boolean(item.completed);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => void handleOpenLesson(item.id)}
                    className={`w-full text-start p-2.5 rounded-[3px] border text-xs transition-colors flex items-start gap-2 cursor-pointer ${
                      isCurr
                        ? 'bg-[#e2efbf] border-[#A6CE39] font-extrabold text-[#384D55]'
                        : isDone
                          ? 'bg-[#f4f6f7] border-[#d8dfe2] text-[#384D55] font-semibold'
                          : 'bg-white border-[#efefef] hover:border-[#cfd6da] text-[#4c626b]'
                    }`}
                  >
                    <span className="mt-0.5 shrink-0">
                      {isDone ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-[#557a16]" />
                      ) : (
                        <CircleDashed
                          className={`w-3.5 h-3.5 ${isCurr ? 'text-[#384D55]' : 'text-[#9aa5ab]'}`}
                        />
                      )}
                    </span>
                    <span className="leading-snug">
                      <span className="tabular-nums font-bold me-1">{idx + 1}.</span>
                      {lang === 'ar' ? item.title_ar : item.title_fr}
                    </span>
                  </button>
                );
              })}
            </div>
          </aside>

          {/* Main Lesson Body */}
          <div className="lg:col-span-3 space-y-5 edu-copy-protected">
            {/* Lesson Title + Whole-Lesson Audio */}
            <div className="addressp-box space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-[#6b787e]">
                <span>
                  {lang === 'ar' ? `الدرس #${orderNum}` : `Leçon #${orderNum}`} ·{' '}
                  {subjectName(activeLesson.subject_slug)} · {levelLabel(activeLesson.level)}
                </span>
                <span className="text-[#557a16]">
                  {activeLesson.completed
                    ? lang === 'ar'
                      ? 'الحالة: مكتمل'
                      : 'Statut : Terminé'
                    : lang === 'ar'
                      ? 'الحالة: قيد الدراسة'
                      : 'Statut : En cours'}
                </span>
              </div>

              <h1 className="ltitle">{title}</h1>

              <AudioPlayerBar
                audioId={`lesson-${activeLesson.id}-full`}
                arabicSpeechText={`${activeLesson.title_ar}. ${activeLesson.explanation_speech_ar || activeLesson.explanation_ar}. ملخص: ${activeLesson.summary_ar}`}
                arabicFallbackText={`${activeLesson.title_ar}. ${activeLesson.explanation_ar}`}
                frenchText={`${activeLesson.title_fr}. ${activeLesson.explanation_fr}. Résumé : ${activeLesson.summary_fr}`}
                label={lang === 'ar' ? 'استماع للدرس كاملاً' : 'Écouter toute la leçon'}
              />
            </div>

            {/* Section 1: Detailed Explanation + Section Audio */}
            <section className="addressp-box space-y-3">
              <h2 className="ltitle2">
                {lang === 'ar' ? '1. الشرح الواضح والمفصل' : '1. Explication détaillée'}
              </h2>
              <AudioPlayerBar
                compact
                audioId={`lesson-${activeLesson.id}-explanation`}
                arabicSpeechText={activeLesson.explanation_speech_ar || activeLesson.explanation_ar}
                arabicFallbackText={activeLesson.explanation_ar}
                frenchText={activeLesson.explanation_fr}
                label={lang === 'ar' ? 'استماع للشرح' : "Écouter l'explication"}
              />
              <p className="text-sm leading-loose text-[#384D55] whitespace-pre-line">{explanation}</p>
            </section>

            {/* Section 2: Key Points Summary + Audio */}
            <section className="rotator-box !mb-0 space-y-3">
              <h2 className="ltitle2">
                {lang === 'ar' ? '2. ملخص لأهم النقاط' : '2. Résumé des points essentiels'}
              </h2>
              <AudioPlayerBar
                compact
                audioId={`lesson-${activeLesson.id}-summary`}
                arabicSpeechText={activeLesson.summary_ar}
                arabicFallbackText={activeLesson.summary_ar}
                frenchText={activeLesson.summary_fr}
                label={lang === 'ar' ? 'استماع للملخص' : 'Écouter le résumé'}
              />
              <p className="text-sm leading-relaxed text-[#384D55]">{summary}</p>
            </section>

            {/* Section 3: Applied Examples */}
            {activeLesson.examples?.length > 0 && (
              <section className="addressp-box space-y-3">
                <h2 className="ltitle2">
                  {lang === 'ar' ? '3. أمثلة تطبيقية' : '3. Exemples appliqués'}
                </h2>
                {activeLesson.examples.map((ex, idx) => (
                  <div key={idx} className="border border-[#d8dfe2] rounded-[3px] bg-[#f7f9fa] p-4 space-y-2">
                    <h3 className="font-bold text-sm text-[#384D55]">
                      {lang === 'ar' ? ex.title_ar : ex.title_fr}
                    </h3>
                    <p className="text-xs sm:text-sm text-[#4a5c64] leading-relaxed">
                      {lang === 'ar' ? ex.content_ar : ex.content_fr}
                    </p>
                    <AudioPlayerBar
                      compact
                      audioId={`lesson-${activeLesson.id}-ex-${idx}`}
                      arabicSpeechText={`${ex.title_ar}. ${ex.content_ar}`}
                      arabicFallbackText={ex.content_ar}
                      frenchText={`${ex.title_fr}. ${ex.content_fr}`}
                      label={lang === 'ar' ? 'نطق المثال' : "Lire l'exemple"}
                    />
                  </div>
                ))}
              </section>
            )}

            {/* Section 4: Training Exercises + Model Solutions */}
            {activeLesson.exercises?.length > 0 && (
              <section className="addressp-box space-y-3">
                <h2 className="ltitle2">
                  {lang === 'ar' ? '4. تمارين تدريبية وحلول نموذجية' : '4. Exercices et corrigés types'}
                </h2>
                {activeLesson.exercises.map((exo, idx) => {
                  const shown = Boolean(revealedSolutions[idx]);
                  return (
                    <div key={idx} className="border border-[#d8dfe2] rounded-[3px] p-4 bg-[#f7f9fa] space-y-2.5">
                      <p className="text-sm font-bold text-[#384D55]">
                        {idx + 1}. {lang === 'ar' ? exo.prompt_ar : exo.prompt_fr}
                      </p>
                      <button
                        type="button"
                        onClick={() => setRevealedSolutions((prev) => ({ ...prev, [idx]: !prev[idx] }))}
                        className="inline-flex items-center gap-1.5 text-xs font-bold text-[#557a16] hover:underline cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>
                          {shown
                            ? lang === 'ar'
                              ? 'إخفاء الحل النموذجي'
                              : 'Masquer le corrigé'
                            : lang === 'ar'
                              ? 'عرض الحل النموذجي'
                              : 'Afficher le corrigé type'}
                        </span>
                      </button>
                      {shown && (
                        <div className="bg-[#e2efbf]/60 border border-[#A6CE39] rounded-[3px] p-3 text-xs sm:text-sm text-[#384D55] space-y-2">
                          <div>
                            <strong>{lang === 'ar' ? 'الحل النموذجي: ' : 'Corrigé : '}</strong>
                            {lang === 'ar' ? exo.solution_ar : exo.solution_fr}
                          </div>
                          <AudioPlayerBar
                            compact
                            audioId={`lesson-${activeLesson.id}-sol-${idx}`}
                            arabicSpeechText={exo.solution_ar}
                            arabicFallbackText={exo.solution_ar}
                            frenchText={exo.solution_fr}
                            label={lang === 'ar' ? 'استماع للحل' : 'Écouter le corrigé'}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </section>
            )}

            {/* Section 5: Lesson MCQs */}
            {activeLesson.mcq?.length > 0 && (
              <section className="addressp-box space-y-4">
                <h2 className="ltitle2">
                  {lang === 'ar'
                    ? '5. أسئلة اختيار من متعدد وتفسير الإجابات'
                    : "5. QCM d'application et explications"}
                </h2>
                {activeLesson.mcq.map((q, qIdx) => {
                  const chosen = mcqAnswers[qIdx];
                  const answered = chosen !== undefined;
                  const options = lang === 'ar' ? q.options_ar : q.options_fr;
                  return (
                    <div key={qIdx} className="border border-[#d8dfe2] rounded-[3px] p-4 space-y-3">
                      <p className="font-bold text-sm text-[#384D55]">
                        {qIdx + 1}. {lang === 'ar' ? q.stem_ar : q.stem_fr}
                      </p>
                      <AudioPlayerBar
                        compact
                        audioId={`lesson-${activeLesson.id}-mcq-${qIdx}`}
                        arabicSpeechText={q.stem_speech_ar || q.stem_ar}
                        arabicFallbackText={q.stem_ar}
                        frenchText={q.stem_fr}
                      />
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {options.map((opt, optIdx) => {
                          const isCorrect = optIdx === q.correct_index;
                          const isPicked = chosen === optIdx;
                          let cls = 'bg-white border-[#c9d0d3] hover:border-[#A6CE39] text-[#384D55]';
                          if (answered) {
                            if (isCorrect) cls = 'bg-[#e2efbf] border-[#53ce39] text-[#384D55] font-bold';
                            else if (isPicked) cls = 'bg-red-50 border-red-400 text-red-800';
                          }
                          return (
                            <button
                              key={optIdx}
                              type="button"
                              onClick={() => setMcqAnswers((prev) => ({ ...prev, [qIdx]: optIdx }))}
                              className={`text-start px-3 py-2 rounded-[3px] border text-xs sm:text-sm cursor-pointer transition-colors ${cls}`}
                            >
                              {opt}
                            </button>
                          );
                        })}
                      </div>
                      {answered && (
                        <div className="bg-[#f4f6f7] border border-[#d8dfe2] rounded-[3px] p-3 text-xs sm:text-sm text-[#384D55] space-y-2">
                          <div>
                            <strong className={chosen === q.correct_index ? 'text-green-700' : 'text-red-700'}>
                              {chosen === q.correct_index
                                ? lang === 'ar'
                                  ? 'إجابة صحيحة — '
                                  : 'Bonne réponse — '
                                : lang === 'ar'
                                  ? 'تفسير الإجابة الصحيحة: '
                                  : 'Explication de la bonne réponse : '}
                            </strong>
                            <span>{lang === 'ar' ? q.explanation_ar : q.explanation_fr}</span>
                          </div>
                          <AudioPlayerBar
                            compact
                            audioId={`lesson-${activeLesson.id}-mcq-exp-${qIdx}`}
                            arabicSpeechText={q.explanation_speech_ar || q.explanation_ar}
                            arabicFallbackText={q.explanation_ar}
                            frenchText={q.explanation_fr}
                            label={lang === 'ar' ? 'استماع للتفسير' : "Écouter l'explication"}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </section>
            )}

            {/* Previous / Next Lesson Structured Navigation Bar */}
            <div className="addressp-box flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                disabled={!prevLesson}
                onClick={() => prevLesson && void handleOpenLesson(prevLesson.id)}
                className="imgsend2-secondary !py-2 !px-4 !text-xs disabled:opacity-40"
              >
                {lang === 'ar' ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
                <span>
                  {t.prevLesson}
                  {prevLesson ? `: ${lang === 'ar' ? prevLesson.title_ar : prevLesson.title_fr}` : ''}
                </span>
              </button>

              <button
                type="button"
                disabled={!nextLesson}
                onClick={() => nextLesson && void handleOpenLesson(nextLesson.id)}
                className="imgsend2 !py-2 !px-4 !text-xs"
              >
                <span>
                  {t.nextLesson}
                  {nextLesson ? `: ${lang === 'ar' ? nextLesson.title_ar : nextLesson.title_fr}` : ''}
                </span>
                {lang === 'ar' ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // CATALOG VIEW WITH LIVE CURRICULUM PROGRESS BAR & ORDERED MODULES
  // =========================================================================
  return (
    <div className="px-4 sm:px-6 py-6 space-y-5">
      <div className="rotator-box !mb-0 space-y-4">
        <div className="rotator-box-header !mb-2">
          <div>
            <h1 className="text-lg sm:text-xl font-extrabold text-[#384D55]">{t.navLessons}</h1>
            <p className="text-xs font-normal text-[#6b787e] mt-0.5">
              {lang === 'ar'
                ? 'دروس مكثفة مرتبة حسب المنهج الرسمي لمسابقة المعلمين مع متابعة التقدم والقراءة الصوتية الذكية.'
                : 'Cours structurés dans l’ordre officiel avec suivi d’avancement et lecture vocale intelligente.'}
            </p>
          </div>
          <div className="text-xs font-bold text-[#384D55] tabular-nums shrink-0">
            {serverTotal ?? orderedLessons.length} {lang === 'ar' ? 'درس متاح' : 'leçons'}
          </div>
        </div>

        {/* Live Progress Bar */}
        <div className="bg-white border border-[#d8dfe2] rounded-[3px] p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
          <span className="font-bold text-[#384D55]">{t.lessonProgressTitle}</span>
          <div className="flex-1 min-w-[180px] max-w-md h-2.5 bg-[#e3e7ea] rounded-[2px] overflow-hidden">
            <div className="h-full bg-[#A6CE39] transition-all" style={{ width: `${progressPct}%` }} />
          </div>
          <span className="font-extrabold text-[#557a16] tabular-nums">
            {progressPct}% ({completedInScope}/{orderedLessons.length})
          </span>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5">
          <div className="relative">
            <Search className="w-4 h-4 text-[#6b787e] absolute top-2.5 start-2.5" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t.searchPlaceholder}
              className="template-input !ps-8 text-xs"
            />
          </div>

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
            value={subjectFilter}
            onChange={(e) => setSubjectFilter(e.target.value)}
            className="template-input text-xs"
          >
            <option value="all">{lang === 'ar' ? 'كل المواد (12)' : 'Toutes les matières (12)'}</option>
            {catalog.subjects.map((s) => (
              <option key={s.slug} value={s.slug}>
                {lang === 'ar' ? s.name_ar : s.name_fr}
              </option>
            ))}
          </select>

          <select
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value)}
            className="template-input text-xs"
          >
            <option value="all">{lang === 'ar' ? 'كل المستويات' : 'Tous les niveaux'}</option>
            <option value="foundation">{t.levelFoundation}</option>
            <option value="intermediate">{t.levelIntermediate}</option>
            <option value="advanced">{t.levelAdvanced}</option>
          </select>

          <select
            value={langFilter}
            disabled={langLocked}
            onChange={(e) => setLangFilter(e.target.value as 'all' | 'ar' | 'fr')}
            className="template-input text-xs disabled:opacity-70"
            title={lang === 'ar' ? 'تصفية لغة المحتوى' : 'Filtrer par langue'}
          >
            <option value="all">{lang === 'ar' ? 'العربية + الفرنسية' : 'Arabe + Français'}</option>
            <option value="ar">{lang === 'ar' ? 'العربية فقط' : 'Arabe uniquement'}</option>
            <option value="fr">{lang === 'ar' ? 'الفرنسية فقط' : 'Français uniquement'}</option>
          </select>

          <button
            type="button"
            onClick={() => setFavoritesOnly(!favoritesOnly)}
            className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-[3px] border text-xs font-bold cursor-pointer ${
              favoritesOnly
                ? 'bg-[#e2efbf] border-[#A6CE39] text-[#384D55]'
                : 'bg-[#efefef] border-[#cfd6da] text-[#384D55]'
            }`}
          >
            <Heart className={`w-3.5 h-3.5 ${favoritesOnly ? 'fill-red-600 text-red-600' : ''}`} />
            <span>{t.favorites}</span>
          </button>
        </div>

        {selectedTrack !== 'all' && (
          <label className="inline-flex items-center gap-2 text-xs font-bold text-[#384D55] cursor-pointer">
            <input
              type="checkbox"
              checked={trackExact}
              onChange={(e) => setTrackExact(e.target.checked)}
              className="accent-[#384D55]"
            />
            <span>
              {lang === 'ar'
                ? 'عزل مسار الشعبة المحددة بدقة (دون المواد المشتركة)'
                : 'Isoler strictement la filière sélectionnée'}
            </span>
          </label>
        )}

        {catalog.lessonSections.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-[#efefef] text-xs">
            <span className="font-bold text-[#6b787e] me-1">
              {lang === 'ar' ? 'الأقسام:' : 'Sections :'}
            </span>
            <button
              type="button"
              onClick={() => setSectionFilter('all')}
              className={`px-2.5 py-1 rounded-[3px] border cursor-pointer font-bold ${
                sectionFilter === 'all'
                  ? 'bg-[#384D55] text-[#A6CE39] border-[#384D55]'
                  : 'bg-[#f7f9fa] text-[#384D55] border-[#d8dfe2]'
              }`}
            >
              {lang === 'ar' ? 'الكل' : 'Toutes'}
            </button>
            {catalog.lessonSections.map((sec) => (
              <button
                key={sec.id}
                type="button"
                onClick={() => setSectionFilter(sec.id)}
                className={`px-2.5 py-1 rounded-[3px] border cursor-pointer font-bold ${
                  sectionFilter === sec.id
                    ? 'bg-[#384D55] text-[#A6CE39] border-[#384D55]'
                    : 'bg-[#f7f9fa] text-[#384D55] border-[#d8dfe2]'
                }`}
              >
                {lang === 'ar' ? sec.titleAr : sec.titleFr || sec.titleAr}
              </button>
            ))}
          </div>
        )}

        {progressError && (
          <div className="p-3 rounded-[3px] border border-red-200 bg-red-50 text-red-700 text-xs font-bold">
            {progressError}
          </div>
        )}

        {quotaError && (
          <div className="p-3.5 rounded-[3px] border border-amber-300 bg-amber-50 text-amber-900 text-xs font-bold flex flex-wrap items-center justify-between gap-3">
            <span>{quotaError}</span>
            <button
              type="button"
              onClick={() => navigate('subscriptions')}
              className="imgsend2 !py-1.5 !px-4 !text-xs shrink-0"
            >
              {lang === 'ar' ? 'الترقية / الاشتراكات' : 'Passer à une offre payante'}
            </button>
          </div>
        )}
      </div>

      {orderedLessons.length === 0 ? (
        <div className="addressp-box p-10 text-center text-sm text-[#6b787e]">
          {t.emptyState}
        </div>
      ) : (
        <div className="ht-icons">
          <div className="ht-grid3">
            {orderedLessons.map((lesson, idx) => (
              <div
                key={lesson.id}
                className="ht-card"
                style={{ '--i': idx } as React.CSSProperties}
              >
                <button
                  type="button"
                  onClick={() => void handleOpenLesson(lesson.id)}
                  className="ring cursor-pointer bg-transparent border-0 p-0"
                  aria-label={lang === 'ar' ? lesson.title_ar : lesson.title_fr}
                >
                  <AnimatedRingSvg
                    iconKey={subjectSlugToIconKey(lesson.subject_slug)}
                    uid={`lesson-${lesson.id}`}
                  />
                </button>

                <div className="flex flex-wrap items-center justify-center gap-2 text-[11px] font-bold text-[#6f7468]">
                  <span className="text-[#5c7a2b]">
                    #{lesson.lesson_order || idx + 1} · {subjectName(lesson.subject_slug)}
                  </span>
                  <span>·</span>
                  <span>{levelLabel(lesson.level)}</span>
                  {(lesson.is_starter_free || lesson.is_free) ? (
                    <span className="px-1.5 py-0.5 rounded bg-[#e2efbf] text-[#2c4a12] text-[10px]">
                      {lang === 'ar' ? 'مجاني' : 'Gratuit'}
                    </span>
                  ) : !(user?.activeSubscription && user.activeSubscription.billing_cycle !== 'free') ? (
                    <span className="px-1.5 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-800 text-[10px]">
                      {lang === 'ar' ? 'ضمن الباقة' : 'Abonnement'}
                    </span>
                  ) : null}
                </div>

                <h2
                  onClick={() => void handleOpenLesson(lesson.id)}
                  className="font-bold text-[15px] text-[#3d3d3d] hover:text-[#5c7a2b] cursor-pointer leading-snug"
                >
                  {lang === 'ar' ? lesson.title_ar : lesson.title_fr}
                </h2>

                <p className="text-xs text-[#6f7468] line-clamp-3 leading-relaxed">
                  {lang === 'ar' ? lesson.summary_ar : lesson.summary_fr}
                </p>

                <div className="mt-auto w-full pt-3 border-t border-[#eceee6] flex items-center justify-between gap-2">
                  <div className="flex items-center gap-3 text-[11px] text-[#6f7468]">
                    <span className="inline-flex items-center gap-1">
                      <HelpCircle className="w-3.5 h-3.5" />
                      {lesson.mcq?.length || 0} Q
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Layers className="w-3.5 h-3.5" />
                      {lesson.exercises?.length || 0} Ex
                    </span>
                    {lesson.completed ? (
                      <span className="inline-flex items-center gap-1 text-[#5c7a2b] font-bold">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        {lang === 'ar' ? 'مكتمل' : 'Fait'}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[#6f7468]">
                        <CircleDashed className="w-3.5 h-3.5" />
                        {lang === 'ar' ? 'متاح' : 'À faire'}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleToggleProgress(lesson, 'is_favorite')}
                      className="p-1.5 rounded-[8px] border border-[#d6dacb] bg-white hover:border-red-300 cursor-pointer"
                      title={t.favorites}
                      aria-label={t.favorites}
                    >
                      <Heart
                        className={`w-3.5 h-3.5 ${
                          lesson.is_favorite ? 'fill-red-600 text-red-600' : 'text-[#6f7468]'
                        }`}
                      />
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleOpenLesson(lesson.id)}
                      className="imgsend2 !py-1.5 !px-3.5 !text-xs !rounded-[8px]"
                    >
                      <BookOpen className="w-3.5 h-3.5" />
                      <span>{lang === 'ar' ? 'فتح الدرس' : 'Ouvrir'}</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {totalPages > 1 && !trackExact && !favoritesOnly && sectionFilter === 'all' && (
            <div className="flex items-center justify-center gap-3 pt-4">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="imgsend2-secondary text-xs disabled:opacity-40"
              >
                {lang === 'ar' ? 'الصفحة السابقة' : 'Précédent'}
              </button>
              <span className="text-xs font-bold text-[#384D55] tabular-nums">
                {page} / {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="imgsend2-secondary text-xs disabled:opacity-40"
              >
                {lang === 'ar' ? 'الصفحة التالية' : 'Suivant'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
