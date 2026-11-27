import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Award, ClipboardCheck } from 'lucide-react';
import { AnimatedRingSvg, subjectSlugToIconKey } from '../components/AnimatedRingIcons';
import { AnimatedSubjectSections } from '../components/AnimatedSubjectSections';
import { useApp, type AppView } from '../context/AppContext';
import { getT } from '../i18n/translations';
import type { HeroSlide } from '../types';
import { trackAnalyticsEvent, tr } from '../utils/locale';

const YOUTUBE_INTRO_EMBED_URL =
  'https://www.youtube.com/embed/-os8gj25iHo?autoplay=1&mute=1&playsinline=1&rel=0&modestbranding=1';

const FLOATING_LETTERS: Array<{
  char: string;
  x: string;
  s: string;
  d: string;
  w: string;
  r: string;
}> = [
  { char: 'أ', x: '7%', s: '46px', d: '24s', w: '-4s', r: '-14deg' },
  { char: 'ت', x: '17%', s: '62px', d: '29s', w: '-12s', r: '18deg' },
  { char: 'ح', x: '28%', s: '38px', d: '22s', w: '-8s', r: '-20deg' },
  { char: 'د', x: '39%', s: '54px', d: '31s', w: '-15s', r: '12deg' },
  { char: 'ر', x: '49%', s: '44px', d: '26s', w: '-2s', r: '-9deg' },
  { char: 'س', x: '61%', s: '68px', d: '33s', w: '-18s', r: '21deg' },
  { char: 'ع', x: '72%', s: '42px', d: '25s', w: '-7s', r: '-16deg' },
  { char: 'ف', x: '81%', s: '58px', d: '28s', w: '-11s', r: '15deg' },
  { char: 'ق', x: '89%', s: '48px', d: '23s', w: '-5s', r: '-12deg' },
  { char: 'م', x: '94%', s: '36px', d: '30s', w: '-16s', r: '9deg' },
];

export const HomePage: React.FC = () => {
  const { lang, selectedTrack, catalog, siteConfig, navigate } = useApp();
  const t = getT(lang);

  const slides: HeroSlide[] = useMemo(() => {
    if (siteConfig?.heroSlides && siteConfig.heroSlides.length > 0) {
      return siteConfig.heroSlides;
    }
    return [
      {
        id: 'default-1',
        tag_ar: t.officialTracksBanner,
        tag_fr: t.officialTracksBanner,
        title_ar: 'التحضير المنهجي المتكامل لمسابقة اكتتاب المعلمين في موريتانيا',
        title_fr: 'Préparation officielle complète au concours des instituteurs en Mauritanie',
        desc_ar:
          'دروس منظمة حسب الشعبة (عربي، فرنسي، مزدوج)، ملخصات مركزة، وبنك أسئلة مع امتحانات محاكية وفق نظام التقييم من 20.',
        desc_fr:
          'Leçons par filière (Arabe, Français, Bilingue), fiches de synthèse et examens blancs notés sur 20.',
        cta1_ar: 'ابدأ بالاختبار الرسمي المحاكي',
        cta1_fr: 'Démarrer la simulation officielle',
        cta1_view: 'exams',
        cta1_exam_mode: 'official_sim',
        cta2_ar: t.navLessons,
        cta2_fr: t.navLessons,
        cta2_view: 'lessons',
      },
    ];
  }, [siteConfig?.heroSlides, t.navLessons, t.officialTracksBanner]);

  const [slideIdx, setSlideIdx] = useState(0);
  const [dotCycle, setDotCycle] = useState(0);

  useEffect(() => {
    if (slideIdx >= slides.length) {
      setSlideIdx(0);
    }
  }, [slides.length, slideIdx]);

  useEffect(() => {
    if (slides.length <= 1) return;
    const timer = window.setTimeout(() => {
      setSlideIdx((prev) => (prev + 1) % slides.length);
      setDotCycle((c) => c + 1);
    }, 6000);
    return () => window.clearTimeout(timer);
  }, [slideIdx, dotCycle, slides.length]);

  const handleSelectSlide = (idx: number) => {
    setSlideIdx(idx);
    setDotCycle((c) => c + 1);
  };

  // Live count-up stats
  const targetLessons = catalog.lessons.length;
  const targetQuestions = catalog.bankStats.totalVerifiedQuestions;
  const [lessonsCount, setLessonsCount] = useState(0);
  const [questionsCount, setQuestionsCount] = useState(0);

  useEffect(() => {
    if (targetLessons === 0 && targetQuestions === 0) {
      setLessonsCount(0);
      setQuestionsCount(0);
      return;
    }

    let rafId = 0;
    let startTime: number | null = null;
    const duration = 1400;

    const step = (ts: number) => {
      if (startTime === null) startTime = ts;
      const p = Math.min((ts - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setLessonsCount(Math.round(targetLessons * eased));
      setQuestionsCount(Math.round(targetQuestions * eased));
      if (p < 1) {
        rafId = window.requestAnimationFrame(step);
      }
    };

    const delayId = window.setTimeout(() => {
      rafId = window.requestAnimationFrame(step);
    }, 350);

    return () => {
      window.clearTimeout(delayId);
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, [targetLessons, targetQuestions]);

  // Subject lookup map
  const subjectNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of catalog.subjects) {
      map.set(s.slug, lang === 'ar' ? s.name_ar : s.name_fr);
    }
    return map;
  }, [catalog.subjects, lang]);

  // Real DB lessons for "دروس مكثفة في الأضواء"
  const featuredLessons = useMemo(() => {
    return catalog.lessons
      .filter((l) => selectedTrack === 'all' || l.track === 'all' || l.track === selectedTrack)
      .slice(0, 9);
  }, [catalog.lessons, selectedTrack]);

  // Sequential IntersectionObserver reveal for .t-tile cards
  const tilesRef = useRef<HTMLDivElement | null>(null);
  const [visibleTiles, setVisibleTiles] = useState<Set<number>>(() => new Set());

  useEffect(() => {
    const container = tilesRef.current;
    if (!container || featuredLessons.length === 0) return;

    if (typeof IntersectionObserver === 'undefined') {
      setVisibleTiles(new Set(featuredLessons.map((l) => l.id)));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const idAttr = (entry.target as HTMLElement).dataset.lessonId;
            if (idAttr) {
              const idNum = Number(idAttr);
              setVisibleTiles((prev) => {
                if (prev.has(idNum)) return prev;
                const next = new Set(prev);
                next.add(idNum);
                return next;
              });
            }
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15 }
    );

    const els = container.querySelectorAll('.t-tile');
    els.forEach((el) => observer.observe(el));

    // Safety fallback so cards are always revealed even on very short viewports
    const fallbackTimer = window.setTimeout(() => {
      setVisibleTiles(new Set(featuredLessons.map((l) => l.id)));
    }, 900);

    return () => {
      observer.disconnect();
      window.clearTimeout(fallbackTimer);
    };
  }, [featuredLessons]);

  const visibleSummaries = catalog.summaries
    .filter((item) => selectedTrack === 'all' || item.track === 'all' || item.track === selectedTrack)
    .slice(0, 6);

  // Intro Video impression analytics
  const videoWrapRef = useRef<HTMLDivElement | null>(null);
  const videoImpressionSentRef = useRef(false);

  useEffect(() => {
    const el = videoWrapRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !videoImpressionSentRef.current) {
          videoImpressionSentRef.current = true;
          trackAnalyticsEvent({
            eventType: 'video_view',
            pageView: 'home',
            mediaId: 'tadribi-intro',
          });
          io.disconnect();
        }
      },
      { threshold: 0.35 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const activeSlide = slides[slideIdx] || slides[0];
  const slideTag = lang === 'ar' ? activeSlide.tag_ar : activeSlide.tag_fr;
  const slideTitle = lang === 'ar' ? activeSlide.title_ar : activeSlide.title_fr;
  const slideDesc = lang === 'ar' ? activeSlide.desc_ar : activeSlide.desc_fr;
  const slideCta1 = lang === 'ar' ? activeSlide.cta1_ar : activeSlide.cta1_fr;
  const slideCta2 = lang === 'ar' ? activeSlide.cta2_ar : activeSlide.cta2_fr;
  const headlineWords = slideTitle.trim().split(/\s+/);

  return (
    <div style={{ background: 'var(--bg)', color: 'var(--ink)' }} className="pb-6">
      {/* ===================================================================== */}
      {/* 1. HERO SECTION (.t-hero) WITH DYNAMIC SLIDES & LIVE STATS CARD       */}
      {/* ===================================================================== */}
      <section className="t-hero">
        <div className="blob b1" aria-hidden="true" />
        <div className="blob b2" aria-hidden="true" />
        <div className="lt" aria-hidden="true">
          {FLOATING_LETTERS.map((fl, i) => (
            <span
              key={i}
              style={
                {
                  '--x': fl.x,
                  '--s': fl.s,
                  '--d': fl.d,
                  '--w': fl.w,
                  '--r': fl.r,
                } as React.CSSProperties
              }
            >
              {fl.char}
            </span>
          ))}
        </div>

        <div className="hin">
          <div>
            <div key={`${activeSlide.id}-${slideIdx}-${dotCycle}`} className="slide">
              <span className="tag">{slideTag || t.officialTracksBanner}</span>
              <h1>
                {headlineWords.map((word, idx) => (
                  <span key={`${idx}-${word}`} style={{ '--k': idx } as React.CSSProperties}>
                    {word}
                    {'\u00A0'}
                  </span>
                ))}
              </h1>
              <p>{slideDesc}</p>
              <div className="acts">
                <button
                  type="button"
                  className="btn"
                  onClick={() =>
                    navigate(
                      (activeSlide.cta1_view || 'exams') as AppView,
                      activeSlide.cta1_exam_mode ? { examMode: activeSlide.cta1_exam_mode } : undefined
                    )
                  }
                >
                  {slideCta1}
                </button>
                {slideCta2 && (
                  <button
                    type="button"
                    className="btn w"
                    onClick={() =>
                      navigate(
                        (activeSlide.cta2_view || 'lessons') as AppView,
                        activeSlide.cta2_exam_mode ? { examMode: activeSlide.cta2_exam_mode } : undefined
                      )
                    }
                  >
                    {slideCta2}
                  </button>
                )}
              </div>
            </div>

            {slides.length > 1 && (
              <div className="dots" role="tablist" aria-label={tr(lang, 'الشرائح', 'Diapositives', 'Slides')}>
                {slides.map((s, idx) => (
                  <button
                    key={`${s.id}-${idx === slideIdx ? dotCycle : 'idle'}`}
                    type="button"
                    role="tab"
                    aria-selected={slideIdx === idx}
                    aria-label={tr(lang, `الشريحة ${idx + 1}`, `Diapositive ${idx + 1}`, `Slide ${idx + 1}`)}
                    className={slideIdx === idx ? 'on' : ''}
                    onClick={() => handleSelectSlide(idx)}
                  />
                ))}
              </div>
            )}
          </div>

          <aside className="stats">
            <div className="hh">
              <span>{tr(lang, 'إحصائيات المنصة المعتمدة', 'Statistiques officielles', 'Official Platform Stats')}</span>
              <em>{t.badgeNew}</em>
            </div>
            <div className="sg">
              <div>
                <b className="tabular-nums">{lessonsCount}</b>
                <span>{t.navLessons}</span>
              </div>
              <div>
                <b className="tabular-nums">{questionsCount}</b>
                <span>{tr(lang, 'سؤالاً محققاً', 'Questions vérifiées', 'Verified Questions')}</span>
              </div>
            </div>
            <button type="button" className="btn" onClick={() => navigate('all-subjects')}>
              {t.allSubjectsTitle}
            </button>
          </aside>
        </div>
      </section>

      {/* ===================================================================== */}
      {/* 2. FEATURED INTENSIVE LESSONS (.t-sec / .t-tiles) FROM REAL DB        */}
      {/* ===================================================================== */}
      <section className="t-sec">
        <div className="sh">
          <h2>{t.featuredLessons}</h2>
          <button type="button" onClick={() => navigate('lessons')}>
            {t.seeMore}
          </button>
        </div>

        <div ref={tilesRef} className="t-tiles">
          {featuredLessons.map((lesson, idx) => {
            const isRevealed = visibleTiles.has(lesson.id);
            const subjLabel = subjectNameMap.get(lesson.subject_slug) || lesson.subject_slug;
            return (
              <button
                key={lesson.id}
                type="button"
                data-lesson-id={lesson.id}
                className={`t-tile ${isRevealed ? 'v' : ''}`}
                style={{ '--k': idx } as React.CSSProperties}
                onClick={() => navigate('lessons', { lessonId: lesson.id })}
              >
                <span className="t-tile-icon ht-icons !bg-transparent">
                  <span className="ring !w-[60px] !h-[60px]">
                    <AnimatedRingSvg
                      iconKey={subjectSlugToIconKey(lesson.subject_slug)}
                      uid={`tile-lesson-${lesson.id}`}
                    />
                  </span>
                </span>
                <b>{lang === 'ar' ? lesson.title_ar : lesson.title_fr}</b>
                <small>{subjLabel}</small>
              </button>
            );
          })}
        </div>
      </section>

      {/* ===================================================================== */}
      {/* 2.5 OFFICIAL INTRO VIDEO SECTION (DIRECT YOUTUBE EMBED PLAYER)        */}
      {/* ===================================================================== */}
      <section className="t-sec" aria-label={tr(lang, 'الفيديو التعريفي للمنصة', 'Vidéo de présentation', 'Platform Introduction Video')}>
        <div className="sh">
          <h2>
            {tr(
              lang,
              'جولة تعريفية في منصة تدريبي',
              'Présentation de la plateforme Tadribi',
              'Introduction to Tadribi Platform'
            )}
          </h2>
        </div>

        <div
          ref={videoWrapRef}
          className="w-full max-w-[920px] mx-auto rounded-[10px] overflow-hidden border border-[#cfd6da] bg-[#0f1c16] shadow-md"
        >
          <div className="relative w-full aspect-video bg-black">
            <iframe
              src={YOUTUBE_INTRO_EMBED_URL}
              title={tr(
                lang,
                'جولة تعريفية في منصة تدريبي',
                'Présentation de la plateforme Tadribi',
                'Introduction to Tadribi Platform'
              )}
              className="absolute inset-0 w-full h-full border-0 block"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
            />
          </div>
        </div>
      </section>

      {/* ===================================================================== */}
      {/* 3. OFFICIAL SUBJECTS & SPECIALTIES                                    */}
      {/* ===================================================================== */}
      <AnimatedSubjectSections />

      <div className="max-w-[1260px] mx-auto px-4 sm:px-6 pt-2">
        {/* =================================================================== */}
        {/* 4. TWO-COLUMN .subsc PROMO STRIP                                    */}
        {/* =================================================================== */}
        <section className="subsc">
          <div
            style={{ background: 'var(--field)', borderColor: 'var(--line)' }}
            className="border rounded-[10px] p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
          >
            <div className="space-y-1.5">
              <div style={{ color: 'var(--brand-d)' }} className="inline-flex items-center gap-1.5 text-xs font-bold">
                <ClipboardCheck className="w-4 h-4" />
                <span>{tr(lang, 'نظام الامتحان الرسمي', 'Système officiel /20', 'Official Exam System /20')}</span>
              </div>
              <h2 style={{ color: 'var(--ink)' }} className="text-base font-bold">
                {tr(
                  lang,
                  'المحاكاة الرسمية الشاملة (70 سؤالاً فريداً)',
                  'Simulation officielle complète (70 questions uniques)',
                  'Full Official Simulation (70 Unique Questions)'
                )}
              </h2>
              <p style={{ color: 'var(--mute)' }} className="text-xs">
                {tr(
                  lang,
                  'تصحيح فوري وفق المقياس الموريتاني على 20 مع تقرير نقاط الضعف.',
                  'Correction instantanée sur 20 avec diagnostic détaillé des faiblesses.',
                  'Instant scoring out of 20 with detailed topic diagnostics.'
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate('exams', { examMode: 'official_sim' })}
              className="imgsend2 shrink-0 text-xs"
            >
              {t.startExam}
            </button>
          </div>

          <div
            style={{ background: 'var(--field)', borderColor: 'var(--line)' }}
            className="border rounded-[10px] p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
          >
            <div className="space-y-1.5">
              <div style={{ color: 'var(--brand-d)' }} className="inline-flex items-center gap-1.5 text-xs font-bold">
                <Award className="w-4 h-4" />
                <span>{t.navSubscriptions}</span>
              </div>
              <h2 style={{ color: 'var(--ink)' }} className="text-base font-bold">
                {tr(
                  lang,
                  'فعّل اشتراكك الكامل عبر السداد أو مصرفي أو بنكيلي أو البطاقة',
                  'Activez votre accès via Sedad, Masrvi, Bankily ou carte',
                  'Activate full access via Visa/MasterCard or Sedad, Masrvi, Bankily'
                )}
              </h2>
              <p style={{ color: 'var(--mute)' }} className="text-xs">
                {tr(
                  lang,
                  'افتح جميع الدروس والملخصات والامتحانات التجريبية بسرعة وأمان.',
                  'Débloquez toutes les leçons, fiches et simulations rapidement.',
                  'Unlock all lessons, summaries, and official mock exams securely.'
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate('subscriptions')}
              className="imgsend2 shrink-0 text-xs"
            >
              {t.subscribeNow}
            </button>
          </div>
        </section>

        {/* Mauritanian Baccalaureate Promo Strip */}
        <section
          style={{ background: 'var(--card)', borderColor: 'var(--line)' }}
          className="mt-4 border rounded-[10px] p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
        >
          <div className="space-y-1.5">
            <div style={{ color: 'var(--brand-d)' }} className="inline-flex items-center gap-1.5 text-xs font-bold">
              <Award className="w-4 h-4" />
              <span>
                {tr(
                  lang,
                  'قسم الباكالوريا الموريتانية (4 شعب مستقلة)',
                  'Section Baccalauréat Mauritanien (4 séries)',
                  'Mauritanian Baccalaureate (4 Series)'
                )}
              </span>
            </div>
            <h2 style={{ color: 'var(--ink)' }} className="text-base font-bold">
              {tr(
                lang,
                'العلوم الطبيعية (SN) · الرياضيات (M/C) · الآداب العصرية (LM) · الآداب الأصلية (LO)',
                'Sciences Naturelles (SN) · Mathématiques (M/C) · Lettres Modernes (LM) · Lettres Originelles (LO)',
                'SN · M/C · Modern Literature (LM) · Original Literature (LO)'
              )}
            </h2>
            <p style={{ color: 'var(--mute)' }} className="text-xs">
              {tr(
                lang,
                'احسب معدلك التقديري بالمعاملات الرسمية الموريتانية وراجع الدروس والتمارين والامتحانات حسب شعبتك.',
                'Calculez votre moyenne estimative avec les coefficients officiels mauritaniens et révisez par série.',
                'Estimate your average with Mauritanian coefficients and review lessons and quizzes by series.'
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => navigate('baccalaureate')}
              className="imgsend2 text-xs"
            >
              {tr(lang, 'حاسبة الباكالوريا والمراجعة', 'Ouvrir le Baccalauréat', 'Open Baccalaureate')}
            </button>
          </div>
        </section>

        {/* =================================================================== */}
        {/* 5 & 6. SUMMARIES + QUESTION BANK (Animated Circular-Ring Design)    */}
        {/* =================================================================== */}
        <div className="ht-icons">
          <div className="wrap !px-0 !py-6">
            {/* 5. ملخصات ومراجعات مركزة */}
            <section className="sec">
              <div className="head">
                <h2>{t.focusedSummaries}</h2>
                <button type="button" onClick={() => navigate('summaries')}>
                  {t.seeMore}
                </button>
              </div>

              <div className="grid">
                {visibleSummaries.map((sum, idx) => (
                  <button
                    key={sum.id}
                    type="button"
                    className="item"
                    style={{ '--i': idx } as React.CSSProperties}
                    onClick={() => navigate('summaries', { subjectSlug: sum.subject_slug })}
                  >
                    <div className="ring">
                      <AnimatedRingSvg
                        iconKey={subjectSlugToIconKey(sum.subject_slug)}
                        uid={`home-sum-${sum.id}`}
                      />
                    </div>
                    <span className="lbl">{lang === 'ar' ? sum.title_ar : sum.title_fr}</span>
                  </button>
                ))}
              </div>
            </section>

            {/* 6. بنوك الأسئلة والامتحانات التجريبية */}
            <section>
              <div className="head">
                <h2>{t.questionBanksSection}</h2>
                <button type="button" onClick={() => navigate('question-bank')}>
                  {t.seeMore}
                </button>
              </div>

              <div className="ht-grid3">
                <button
                  type="button"
                  onClick={() => navigate('question-bank')}
                  className="ht-card cursor-pointer"
                  style={{ '--i': 0 } as React.CSSProperties}
                >
                  <div className="ring">
                    <AnimatedRingSvg iconKey="qbank" uid="home-qbank" />
                  </div>
                  <span className="lbl !font-bold !text-[15px]">{t.navQuestionBank}</span>
                  <span style={{ color: 'var(--mute)' }} className="text-xs leading-relaxed">
                    {tr(
                      lang,
                      `${catalog.bankStats.totalVerifiedQuestions} سؤالاً مصنفاً حسب المادة مع الشرح التربوي والقراءة الصوتية.`,
                      `${catalog.bankStats.totalVerifiedQuestions} questions classées par matière avec correction et audio.`,
                      `${catalog.bankStats.totalVerifiedQuestions} verified questions organized by subject with explanations and audio.`
                    )}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => navigate('review-center')}
                  className="ht-card cursor-pointer"
                  style={{ '--i': 1 } as React.CSSProperties}
                >
                  <div className="ring">
                    <AnimatedRingSvg iconKey="review" uid="home-review" />
                  </div>
                  <span className="lbl !font-bold !text-[15px]">{t.navReviewCenter}</span>
                  <span style={{ color: 'var(--mute)' }} className="text-xs leading-relaxed">
                    {tr(
                      lang,
                      'مراجعة مركزة لأكثر الأسئلة خطأً والأسئلة المحفوظة قبل دخول قاعة الامتحان.',
                      'Révision ciblée des questions les plus ratées et favoris avant le concours.',
                      'Focused review of commonly missed and bookmarked questions before exam day.'
                    )}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => navigate('exams', { examMode: 'mock' })}
                  className="ht-card cursor-pointer"
                  style={{ '--i': 2 } as React.CSSProperties}
                >
                  <div className="ring">
                    <AnimatedRingSvg iconKey="exam" uid="home-exam" />
                  </div>
                  <span className="lbl !font-bold !text-[15px]">{t.navExams}</span>
                  <span style={{ color: 'var(--mute)' }} className="text-xs leading-relaxed">
                    {tr(
                      lang,
                      'امتحانات مؤقتة باحتساب العلامة من 20 وحفظ التقدم في قاعدة البيانات.',
                      'Examens chronométrés notés sur 20 avec sauvegarde automatique.',
                      'Timed practice and simulated exams graded out of 20 with auto-save.'
                    )}
                  </span>
                </button>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
};

