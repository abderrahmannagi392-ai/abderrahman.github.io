import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Award,
  Bell,
  BookOpen,
  Building2,
  ClipboardCheck,
  CreditCard,
  GraduationCap,
  Heart,
  LogIn,
  LogOut,
  MessageSquare,
  Moon,
  Shield,
  SlidersHorizontal,
  Sun,
  User as UserIcon,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { useApp, type AppView, type ViewParams } from '../context/AppContext';
import { getT } from '../i18n/translations';
import type { Language, TrackSlug } from '../types';
import { tr } from '../utils/locale';
import { AnimatedFooter } from './AnimatedFooter';
import { NotificationBodyText } from './NotificationBodyText';
import { VerifiedBadge } from './VerifiedBadge';

interface LayoutProps {
  children: React.ReactNode;
}

type SearchScope = 'all' | 'lessons' | 'questions' | 'summaries' | 'exams';

interface NavDropdownOption {
  label: string;
  view: AppView;
  params?: ViewParams;
}

interface NavItemSpec {
  id: string;
  label: string;
  view: AppView;
  params?: ViewParams;
  matchViews: AppView[];
  isNew?: boolean;
  dropdown?: NavDropdownOption[];
}

function renderTickerParts(rawText: string, questionsCount: number, lessonsCount: number) {
  const interpolated = rawText
    .replace(/\{\{\s*questionsCount\s*\}\}/g, String(questionsCount))
    .replace(/\{\{\s*lessonsCount\s*\}\}/g, String(lessonsCount));
  const parts = interpolated.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <b key={idx}>{part.slice(2, -2)}</b>;
    }
    return <React.Fragment key={idx}>{part}</React.Fragment>;
  });
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const {
    lang,
    setLang,
    theme,
    toggleTheme,
    selectedTrack,
    setSelectedTrack,
    user,
    catalog,
    siteConfig,
    canCopy,
    unreadNotificationCount,
    unreadSupportCount,
    activeToast,
    dismissToast,
    markNotificationsRead,
    activeExam,
    currentView,
    navigate,
    canGoBack,
    goBack,
    goToAuth,
    advancedSearchOpen,
    setAdvancedSearchOpen,
    logoutConfirmOpen,
    requestLogout,
    confirmLogout,
    cancelLogout,
  } = useApp();

  const t = getT(lang);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchScope, setSearchScope] = useState<SearchScope>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchError, setSearchError] = useState(false);
  const [searchPopOpen, setSearchPopOpen] = useState(false);
  const [loginMenuOpen, setLoginMenuOpen] = useState(false);
  const [stuck, setStuck] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<{
    id: string;
    top: number;
    left: number;
  } | null>(null);
  const [indStyle, setIndStyle] = useState<{ width: number; left: number; opacity: number }>({
    width: 0,
    left: 0,
    opacity: 0,
  });

  const searchWrapRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const navBtnRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  // Advanced search modal state
  const [advKeyword, setAdvKeyword] = useState('');
  const [advScope, setAdvScope] = useState<'lessons' | 'questions' | 'summaries' | 'exams'>('lessons');
  const [advTrack, setAdvTrack] = useState<TrackSlug>('all');
  const [advSubject, setAdvSubject] = useState<string>('all');
  const [advLevel, setAdvLevel] = useState<string>('all');

  const favoriteCount = catalog.lessons.filter((l) => l.is_favorite).length;
  const totalVerifiedQuestions = catalog.bankStats.totalVerifiedQuestions;

  const trackLabel = (slug: TrackSlug) => {
    if (slug === 'arabic') return t.trackArabic;
    if (slug === 'french') return t.trackFrench;
    if (slug === 'bilingual') return t.trackBilingual;
    return t.allTracks;
  };

  const scopeCycleOrder: SearchScope[] = ['all', 'lessons', 'questions', 'summaries', 'exams'];
  const scopeLabel = (scope: SearchScope) => {
    if (scope === 'lessons') return tr(lang, 'دروس', 'Leçons', 'Lessons');
    if (scope === 'questions') return tr(lang, 'أسئلة', 'Questions', 'Questions');
    if (scope === 'summaries') return tr(lang, 'ملخصات', 'Résumés', 'Summaries');
    if (scope === 'exams') return tr(lang, 'امتحانات', 'Examens', 'Exams');
    return t.searchAll;
  };

  const cycleSearchScope = () => {
    const idx = scopeCycleOrder.indexOf(searchScope);
    setSearchScope(scopeCycleOrder[(idx + 1) % scopeCycleOrder.length]);
  };

  // Sticky header shadow on scroll
  useEffect(() => {
    const onScroll = () => {
      setStuck(window.scrollY > 60);
      setOpenDropdown(null);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Close search popover & dropdowns on outside click
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (searchWrapRef.current && target && !searchWrapRef.current.contains(target)) {
        setSearchPopOpen(false);
      }
      if (target && !target.closest('.t-nav-item') && !target.closest('.t-nav-dd-menu')) {
        setOpenDropdown(null);
      }
    };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, []);

  // Global right-click disable for ALL users (including Admin) + Admin-only copy permission
  useEffect(() => {
    document.body.classList.toggle('can-copy-admin', Boolean(canCopy));

    const isEditableTarget = (target: EventTarget | null): boolean => {
      if (!(target instanceof Element)) return false;
      return Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
    };

    const isProtectedTarget = (target: EventTarget | null): boolean => {
      if (!(target instanceof Element)) return false;
      if (isEditableTarget(target)) return false;
      return Boolean(target.closest('.edu-copy-protected'));
    };

    const onContextMenu = (e: MouseEvent) => {
      if (!isEditableTarget(e.target)) {
        e.preventDefault();
      }
    };

    const onCopyOrCut = (e: ClipboardEvent) => {
      if (!canCopy && isProtectedTarget(e.target)) {
        e.preventDefault();
      }
    };

    const onSelectOrDrag = (e: Event) => {
      if (!canCopy && isProtectedTarget(e.target)) {
        e.preventDefault();
      }
    };

    document.addEventListener('contextmenu', onContextMenu, true);
    document.addEventListener('copy', onCopyOrCut, true);
    document.addEventListener('cut', onCopyOrCut, true);
    document.addEventListener('selectstart', onSelectOrDrag, true);
    document.addEventListener('dragstart', onSelectOrDrag, true);

    return () => {
      document.body.classList.remove('can-copy-admin');
      document.removeEventListener('contextmenu', onContextMenu, true);
      document.removeEventListener('copy', onCopyOrCut, true);
      document.removeEventListener('cut', onCopyOrCut, true);
      document.removeEventListener('selectstart', onSelectOrDrag, true);
      document.removeEventListener('dragstart', onSelectOrDrag, true);
    };
  }, [canCopy]);

  const isPrivileged = Boolean(
    user && (user.isAdmin || user.role === 'admin' || (user.permissions && user.permissions.length > 0))
  );

  const navItems: NavItemSpec[] = useMemo(() => {
    const base: NavItemSpec[] = [
      { id: 'home', label: t.navHome, view: 'home', matchViews: ['home'] },
      {
        id: 'lessons',
        label: t.navLessons,
        view: 'lessons',
        matchViews: ['lessons'],
        dropdown: [
          { label: t.allSubjectsTitle, view: 'all-subjects' },
          { label: t.navLessons, view: 'lessons' },
          { label: t.levelFoundation, view: 'lessons', params: { level: 'foundation' } },
          { label: t.levelIntermediate, view: 'lessons', params: { level: 'intermediate' } },
          { label: t.levelAdvanced, view: 'lessons', params: { level: 'advanced' } },
        ],
      },
      { id: 'all-subjects', label: t.browseSubjects, view: 'all-subjects', matchViews: ['all-subjects'] },
      { id: 'summaries', label: t.navSummaries, view: 'summaries', matchViews: ['summaries'] },
      { id: 'question-bank', label: t.navQuestionBank, view: 'question-bank', matchViews: ['question-bank'] },
      { id: 'review-center', label: t.navReviewCenter, view: 'review-center', matchViews: ['review-center'] },
      {
        id: 'exams',
        label: t.navExams,
        view: 'exams',
        matchViews: ['exams'],
        isNew: true,
        dropdown: [
          {
            label: tr(lang, 'المحاكاة الرسمية (70 سؤالاً)', 'Simulation officielle (70 Q)', 'Official Simulation (70 Q)'),
            view: 'exams',
            params: { examMode: 'official_sim' },
          },
          {
            label: tr(lang, 'امتحان تجريبي للمادة', 'Examen blanc par matière', 'Subject Mock Exam'),
            view: 'exams',
            params: { examMode: 'mock' },
          },
          {
            label: t.levelPlacement,
            view: 'exams',
            params: { examMode: 'placement' },
          },
        ],
      },
      {
        id: 'baccalaureate',
        label: t.navBaccalaureate,
        view: 'baccalaureate',
        matchViews: ['baccalaureate'],
        isNew: true,
        dropdown: [
          {
            label: tr(lang, 'العلوم الطبيعية (SN)', 'Sciences Naturelles (SN)', 'Natural Sciences (SN)'),
            view: 'baccalaureate',
            params: { bacSeries: 'bac-sn' },
          },
          {
            label: tr(lang, 'الرياضيات والعلوم (M / C)', 'Mathématiques (M / C)', 'Mathematics (M / C)'),
            view: 'baccalaureate',
            params: { bacSeries: 'bac-m' },
          },
          {
            label: tr(lang, 'الآداب العصرية (LM)', 'Lettres Modernes (LM)', 'Modern Letters (LM)'),
            view: 'baccalaureate',
            params: { bacSeries: 'bac-lm' },
          },
          {
            label: tr(lang, 'الآداب الأصلية (LO)', 'Lettres Originelles (LO)', 'Originelles Letters (LO)'),
            view: 'baccalaureate',
            params: { bacSeries: 'bac-lo' },
          },
        ],
      },
      {
        id: 'subscriptions',
        label: t.navSubscriptions,
        view: 'subscriptions',
        matchViews: ['subscriptions', 'checkout'],
        dropdown: [
          {
            label: tr(lang, 'استعراض الباقات والاشتراكات', 'Voir toutes les offres', 'Browse Plans & Offers'),
            view: 'subscriptions',
          },
          {
            label: tr(lang, 'الباقة التمهيدية المجانية', 'Formule Découverte Gratuite', 'Free Discovery Plan'),
            view: 'subscriptions',
          },
          {
            label: tr(lang, 'الباقة الشهرية المكثفة', 'Pack Mensuel Intensif', 'Monthly Intensive Pack'),
            view: 'subscriptions',
          },
          {
            label: tr(lang, 'باقة موسم المسابقة الشاملة', 'Pack Saison Concours', 'Full Season Pack'),
            view: 'subscriptions',
          },
        ],
      },
      { id: 'dashboard', label: t.navDashboard, view: 'dashboard', matchViews: ['dashboard', 'profile'] },
      {
        id: 'teacher-dashboard',
        label: tr(lang, 'أقسام المعلمين', 'Sections Enseignants', 'Teacher Sections'),
        view: 'teacher-dashboard',
        matchViews: ['teacher-dashboard', 'section-view'],
      },
      {
        id: 'school-dashboard',
        label: tr(lang, 'المدارس', 'Écoles', 'Schools'),
        view: 'school-dashboard',
        matchViews: ['school-dashboard'],
      },
      {
        id: 'support',
        label: t.navSupport,
        view: 'support',
        matchViews: ['support', 'about', 'privacy', 'terms', 'contact', 'report'],
        dropdown: [
          { label: t.navSupport, view: 'support' },
          { label: t.navReportIssue, view: 'report' },
          { label: t.navAbout, view: 'about' },
          { label: t.navContact, view: 'contact' },
        ],
      },
    ];
    if (isPrivileged) {
      base.push({ id: 'admin', label: t.navAdmin, view: 'admin', matchViews: ['admin'] });
    }
    return base;
  }, [isPrivileged, lang, t]);

  const activeNavId = useMemo(() => {
    const found = navItems.find((item) => item.matchViews.includes(currentView));
    return found?.id || 'home';
  }, [navItems, currentView]);

  const moveIndicatorTo = useCallback((el: HTMLElement | null) => {
    const navEl = navRef.current;
    if (!el || !navEl) return;
    const r = el.getBoundingClientRect();
    const n = navEl.getBoundingClientRect();
    const width = Math.max(18, r.width - 24);
    const isRtl = document.documentElement.dir !== 'ltr';
    const offset = isRtl
      ? n.right - r.right + navEl.scrollLeft + 12
      : r.left - n.left + navEl.scrollLeft + 12;
    setIndStyle({ width, left: offset, opacity: 1 });
  }, []);

  const resetIndicator = useCallback(() => {
    const el = navBtnRefs.current[activeNavId] || null;
    if (el) {
      moveIndicatorTo(el);
    } else {
      setIndStyle((prev) => ({ ...prev, opacity: 0 }));
    }
  }, [activeNavId, moveIndicatorTo]);

  useEffect(() => {
    const raf = requestAnimationFrame(resetIndicator);
    const onResize = () => resetIndicator();
    window.addEventListener('resize', onResize);
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(resetIndicator).catch(() => {});
    }
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
    };
  }, [resetIndicator, lang, navItems]);

  // Real autocomplete & suggestions derived strictly from server catalog
  const searchSuggestions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const items: Array<{
      id: string;
      title: string;
      kind: string;
      view: AppView;
      params: ViewParams;
    }> = [];

    if (q) {
      for (const l of catalog.lessons) {
        const title = lang === 'ar' ? l.title_ar : l.title_fr;
        const sum = lang === 'ar' ? l.summary_ar : l.summary_fr;
        if (title.toLowerCase().includes(q) || sum.toLowerCase().includes(q)) {
          items.push({
            id: `l-${l.id}`,
            title,
            kind: lang === 'ar' ? 'درس' : 'Leçon',
            view: 'lessons',
            params: { lessonId: l.id },
          });
        }
      }
      for (const sm of catalog.summaries) {
        const title = lang === 'ar' ? sm.title_ar : sm.title_fr;
        if (title.toLowerCase().includes(q)) {
          items.push({
            id: `sm-${sm.id}`,
            title,
            kind: lang === 'ar' ? 'ملخص' : 'Résumé',
            view: 'summaries',
            params: { subjectSlug: sm.subject_slug, search: title },
          });
        }
      }
      for (const sub of catalog.subjects) {
        const name = lang === 'ar' ? sub.name_ar : sub.name_fr;
        if (name.toLowerCase().includes(q)) {
          items.push({
            id: `sub-${sub.id}`,
            title: name,
            kind: lang === 'ar' ? 'مادة' : 'Matière',
            view: 'question-bank',
            params: { subjectSlug: sub.slug },
          });
        }
      }
      return items.slice(0, 6);
    }

    // Empty query: show real top entries from catalog
    const topLessons = catalog.lessons
      .filter((l) => selectedTrack === 'all' || l.track === 'all' || l.track === selectedTrack)
      .slice(0, 2);
    for (const l of topLessons) {
      items.push({
        id: `top-l-${l.id}`,
        title: lang === 'ar' ? l.title_ar : l.title_fr,
        kind: lang === 'ar' ? 'درس' : 'Leçon',
        view: 'lessons',
        params: { lessonId: l.id },
      });
    }
    const topSubjects = catalog.subjects.slice(0, 2);
    for (const sub of topSubjects) {
      items.push({
        id: `top-sub-${sub.id}`,
        title: `${lang === 'ar' ? 'بنك أسئلة' : 'Banque'} ${lang === 'ar' ? sub.name_ar : sub.name_fr}`,
        kind: lang === 'ar' ? 'أسئلة' : 'Questions',
        view: 'question-bank',
        params: { subjectSlug: sub.slug },
      });
    }
    if (catalog.summaries[0]) {
      items.push({
        id: `top-sm-${catalog.summaries[0].id}`,
        title: lang === 'ar' ? catalog.summaries[0].title_ar : catalog.summaries[0].title_fr,
        kind: lang === 'ar' ? 'ملخص' : 'Résumé',
        view: 'summaries',
        params: { subjectSlug: catalog.summaries[0].subject_slug },
      });
    }
    return items.slice(0, 5);
  }, [catalog.lessons, catalog.summaries, catalog.subjects, lang, searchQuery, selectedTrack]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchQuery.trim();
    if (!q && searchScope === 'all') {
      setSearchError(true);
      setSearchPopOpen(true);
      return;
    }
    setSearchError(false);
    setSearchPopOpen(false);
    if (searchScope === 'questions') {
      navigate('question-bank', { search: q });
    } else if (searchScope === 'summaries') {
      navigate('summaries', { search: q });
    } else if (searchScope === 'exams') {
      navigate('exams', { search: q });
    } else {
      navigate('lessons', { search: q });
    }
  };

  const handleAdvancedSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSelectedTrack(advTrack);
    setAdvancedSearchOpen(false);
    if (advScope === 'questions') {
      navigate('question-bank', { search: advKeyword, subjectSlug: advSubject, level: advLevel });
    } else if (advScope === 'summaries') {
      navigate('summaries', { search: advKeyword, subjectSlug: advSubject, level: advLevel });
    } else if (advScope === 'exams') {
      navigate('exams', { subjectSlug: advSubject, level: advLevel });
    } else {
      navigate('lessons', { search: advKeyword, subjectSlug: advSubject, level: advLevel });
    }
  };

  const navJump = (view: AppView, params: ViewParams = {}) => {
    setDrawerOpen(false);
    setLoginMenuOpen(false);
    setOpenDropdown(null);
    setSearchPopOpen(false);
    navigate(view, params);
  };

  const handleOpenDropdown = (item: NavItemSpec, buttonEl: HTMLButtonElement) => {
    if (!item.dropdown || item.dropdown.length === 0) {
      setOpenDropdown(null);
      return;
    }
    const rect = buttonEl.getBoundingClientRect();
    const menuWidth = 224;
    const isRtl = document.documentElement.dir !== 'ltr';
    const rawLeft = isRtl ? rect.right - menuWidth : rect.left;
    const clampedLeft = Math.max(12, Math.min(window.innerWidth - menuWidth - 12, rawLeft));
    setOpenDropdown({
      id: item.id,
      top: rect.bottom + 2,
      left: clampedLeft,
    });
  };

  const isCheckoutView = currentView === 'checkout';

  const sidebarItems: Array<{
    id: AppView;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: string;
  }> = [
    { id: 'home', label: t.navHome, icon: BookOpen },
    { id: 'profile', label: t.myAccount, icon: UserIcon },
    { id: 'lessons', label: t.navLessons, icon: BookOpen },
    { id: 'teacher-dashboard', label: tr(lang, 'أقسام المعلمين', 'Sections Enseignants', 'Teacher Sections'), icon: Users },
    { id: 'school-dashboard', label: tr(lang, 'المدارس', 'Écoles', 'Schools'), icon: Building2 },
    { id: 'baccalaureate', label: t.navBaccalaureate, icon: GraduationCap, badge: t.badgeNew },
    { id: 'favorites', label: t.favorites, icon: Heart },
    {
      id: 'notifications',
      label: t.navNotifications,
      icon: Bell,
      badge: unreadNotificationCount > 0 ? String(unreadNotificationCount) : undefined,
    },
    {
      id: 'support',
      label: tr(lang, 'المراسلة المباشرة', 'Messagerie directe', 'Direct Messages'),
      icon: MessageSquare,
      badge: unreadSupportCount > 0 ? String(unreadSupportCount) : undefined,
    },
    { id: 'subscriptions', label: t.navSubscriptions, icon: CreditCard },
    { id: 'report', label: t.navReportIssue, icon: AlertTriangle },
  ];

  // =========================================================================
  // DEDICATED CHECKOUT SHELL
  // =========================================================================
  if (isCheckoutView) {
    return (
      <div className="wrapper">
        <main className="flex-1" style={{ background: 'var(--bg)', color: 'var(--ink)' }}>
          {children}
        </main>
        <AnimatedFooter />
      </div>
    );
  }

  const tickerMessages = siteConfig.tickerMessages.slice(0, 3);
  const activeDropdownItem = navItems.find((n) => n.id === openDropdown?.id);

  return (
    <div className="wrapper">
      {/* SLIDE-OUT SIDEBAR DRAWER — Streamlined essentials without duplicating header clutter */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-50 flex"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation Drawer"
        >
          <aside
            className="w-[270px] max-w-[85vw] h-full border-e overflow-y-auto no-scrollbar shadow-xl flex flex-col justify-between"
            style={{
              backgroundColor: 'var(--surface-muted)',
              color: 'var(--ink)',
              borderColor: 'var(--line)',
            }}
          >
            <div>
              <div
                className="flex items-center justify-between px-4 py-3.5 border-b"
                style={{ backgroundColor: 'var(--card)', borderColor: 'var(--line)' }}
              >
                <button
                  type="button"
                  onClick={() => navJump('home')}
                  className="flex items-center gap-2.5 text-start cursor-pointer"
                >
                  <img
                    src="/assets/images/platform-logo.webp"
                    alt={t.brandName}
                    width={96}
                    height={32}
                    referrerPolicy="no-referrer"
                    className="h-8 w-auto object-contain"
                  />
                  <span className="font-bold text-xs leading-tight" style={{ color: 'var(--ink)' }}>
                    {t.brandName}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  className="p-1.5 rounded-[4px] border hover:border-[#A6CE39] cursor-pointer"
                  style={{
                    backgroundColor: 'var(--field)',
                    borderColor: 'var(--line)',
                    color: 'var(--ink)',
                  }}
                  aria-label={t.close}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-2.5 space-y-1">
                <div className="px-2.5 pt-1 pb-1.5 text-[11px] font-bold" style={{ color: 'var(--mute)' }}>
                  {lang === 'ar' ? 'القائمة السريعة' : 'Menu rapide'}
                </div>
                {sidebarItems.map((item) => {
                  const Icon = item.icon;
                  const active = currentView === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => navJump(item.id)}
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-[4px] text-xs transition-colors cursor-pointer ${
                        active
                          ? 'bg-[#e2efbf] text-[#384D55] font-bold border border-[#A6CE39]'
                          : 'font-medium hover:bg-[#e2e6e9] border border-transparent'
                      }`}
                      style={!active ? { color: 'var(--ink)' } : undefined}
                    >
                      <span className="flex items-center gap-2.5">
                        <Icon className="w-4 h-4 shrink-0" />
                        <span>{item.label}</span>
                      </span>
                      {item.badge && <span className="new-badge">{item.badge}</span>}
                    </button>
                  );
                })}

                <button
                  type="button"
                  onClick={toggleTheme}
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded-[4px] text-xs font-medium hover:bg-[#e2e6e9] cursor-pointer"
                  style={{ color: 'var(--ink)' }}
                >
                  <span className="flex items-center gap-2.5">
                    {theme === 'dark' ? (
                      <Sun className="w-4 h-4 shrink-0 text-[#83a329]" />
                    ) : (
                      <Moon className="w-4 h-4 shrink-0" />
                    )}
                    <span>
                      {theme === 'dark'
                        ? tr(lang, 'المظهر: داكن', 'Thème : Sombre', 'Theme: Dark')
                        : tr(lang, 'المظهر: نهاري', 'Thème : Clair', 'Theme: Light')}
                    </span>
                  </span>
                </button>

                {isPrivileged && (
                  <button
                    type="button"
                    onClick={() => navJump('admin')}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-[4px] text-xs transition-colors cursor-pointer ${
                      currentView === 'admin'
                        ? 'bg-[#e2efbf] text-[#384D55] font-bold border border-[#A6CE39]'
                        : 'font-bold hover:bg-[#e2e6e9]'
                    }`}
                    style={currentView !== 'admin' ? { color: 'var(--ink)' } : undefined}
                  >
                    <Shield className="w-4 h-4 shrink-0 text-[#557a16]" />
                    <span>{t.navAdmin}</span>
                  </button>
                )}
              </div>
            </div>

            <div
              className="p-3 border-t space-y-2 text-xs"
              style={{ backgroundColor: 'var(--card)', borderColor: 'var(--line)' }}
            >
              {user ? (
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => navJump('profile')}
                    className="flex items-center gap-1.5 font-bold hover:underline cursor-pointer truncate"
                    style={{ color: 'var(--ink)' }}
                  >
                    <UserIcon className="w-4 h-4 shrink-0" />
                    <span className="truncate">{user.name}</span>
                    <VerifiedBadge verified={user.verified_account} label={user.verified_badge_label} />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDrawerOpen(false);
                      requestLogout();
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[4px] border cursor-pointer"
                    style={{
                      backgroundColor: 'var(--field)',
                      borderColor: 'var(--line)',
                      color: 'var(--ink)',
                    }}
                    aria-label={t.logout}
                  >
                    <LogOut className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setDrawerOpen(false);
                      goToAuth('login');
                    }}
                    className="inline-flex items-center justify-center gap-1.5 py-2 rounded-[4px] bg-white border border-[#c9d0d3] text-[#384D55] font-bold cursor-pointer"
                  >
                    <LogIn className="w-3.5 h-3.5" />
                    <span>{t.login}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDrawerOpen(false);
                      goToAuth('register');
                    }}
                    className="inline-flex items-center justify-center gap-1.5 py-2 rounded-[4px] bg-[#A6CE39] hover:bg-[#96bc2f] text-[#384D55] font-bold cursor-pointer"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>{t.register}</span>
                  </button>
                </div>
              )}
            </div>
          </aside>
          <div className="flex-1 bg-[#384D55]/30" onClick={() => setDrawerOpen(false)} />
        </div>
      )}

      {/* =================================================================== */}
      {/* 1. ANIMATED DARK GREEN TOP BAR (.t-top)                             */}
      {/* =================================================================== */}
      <div className="t-top">
        <div className="grp">
          {user ? (
            <div
              className={`logindropdown ${loginMenuOpen ? 'is-open' : ''}`}
              onMouseLeave={() => setLoginMenuOpen(false)}
            >
              <button
                type="button"
                onClick={() => setLoginMenuOpen((v) => !v)}
                className="t-link login"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <circle cx="12" cy="8" r="4" />
                  <path d="M4 21c1-4.5 4-6 8-6s7 1.5 8 6" />
                </svg>
                <span className="inline-flex items-center gap-1">
                  {t.welcomePrefix} {user.name}
                  <VerifiedBadge verified={user.verified_account} label={user.verified_badge_label} />
                </span>
              </button>
              <div className="logindropdown-content">
                <button
                  type="button"
                  onClick={() => navJump('profile')}
                  className="w-full text-start px-3.5 py-2 text-xs font-bold text-[#384D55] hover:bg-[#efefef] hover:text-[#83a329] flex items-center gap-2 cursor-pointer"
                >
                  <UserIcon className="w-3.5 h-3.5" />
                  <span>{t.myAccount}</span>
                </button>
                <button
                  type="button"
                  onClick={() => navJump('dashboard')}
                  className="w-full text-start px-3.5 py-2 text-xs font-bold text-[#384D55] hover:bg-[#efefef] hover:text-[#83a329] flex items-center gap-2 cursor-pointer"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  <span>{t.dashboardAndResults}</span>
                </button>
                <button
                  type="button"
                  onClick={() => navJump('teacher-dashboard')}
                  className="w-full text-start px-3.5 py-2 text-xs font-bold text-[#384D55] hover:bg-[#efefef] hover:text-[#83a329] flex items-center gap-2 cursor-pointer"
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>{tr(lang, 'أقسام المعلمين', 'Sections Enseignants', 'Teacher Sections')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => navJump('school-dashboard')}
                  className="w-full text-start px-3.5 py-2 text-xs font-bold text-[#384D55] hover:bg-[#efefef] hover:text-[#83a329] flex items-center gap-2 cursor-pointer"
                >
                  <Building2 className="w-3.5 h-3.5" />
                  <span>{tr(lang, 'المدارس', 'Écoles', 'Schools')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => navJump('favorites')}
                  className="w-full text-start px-3.5 py-2 text-xs font-bold text-[#384D55] hover:bg-[#efefef] hover:text-[#83a329] flex items-center gap-2 cursor-pointer"
                >
                  <Heart className="w-3.5 h-3.5 text-[#d9384a]" />
                  <span>{t.favorites}</span>
                </button>
                <button
                  type="button"
                  onClick={() => navJump('subscriptions')}
                  className="w-full text-start px-3.5 py-2 text-xs font-bold text-[#384D55] hover:bg-[#efefef] hover:text-[#83a329] flex items-center gap-2 cursor-pointer"
                >
                  <CreditCard className="w-3.5 h-3.5 text-[#83a329]" />
                  <span>{t.navSubscriptions}</span>
                </button>
                {isPrivileged && (
                  <button
                    type="button"
                    onClick={() => navJump('admin')}
                    className="w-full text-start px-3.5 py-2 text-xs font-bold text-[#83a329] hover:bg-[#efefef] flex items-center gap-2 border-t border-[#efefef] cursor-pointer"
                  >
                    <Shield className="w-3.5 h-3.5" />
                    <span>{t.navAdmin}</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setLoginMenuOpen(false);
                    requestLogout();
                  }}
                  className="w-full text-start px-3.5 py-2 text-xs font-bold text-[#c0392b] hover:bg-[#efefef] flex items-center gap-2 border-t border-[#efefef] cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>{t.logout}</span>
                </button>
              </div>
            </div>
          ) : (
            <>
              <button type="button" onClick={() => goToAuth('login')} className="t-link login">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <circle cx="12" cy="8" r="4" />
                  <path d="M4 21c1-4.5 4-6 8-6s7 1.5 8 6" />
                </svg>
                <span>{t.login}</span>
              </button>
              <span className="sep" />
              <button type="button" onClick={() => goToAuth('register')} className="t-link signup">
                <span>{t.register}</span>
              </button>
            </>
          )}

          <select
            className="sel"
            value={lang}
            onChange={(e) => {
              const v = e.target.value;
              setLang((v === 'fr' || v === 'en' ? v : 'ar') as Language);
            }}
            aria-label={tr(lang, 'اللغة', 'Langue', 'Language')}
          >
            <option value="ar">AR</option>
            <option value="fr">FR</option>
            <option value="en">EN</option>
          </select>

          {user?.activeSubscription && (
            <button
              type="button"
              onClick={() => navigate('subscriptions')}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[8px] bg-[#a4cc39] text-[#1c2a0e] text-[11.5px] font-bold cursor-pointer"
            >
              <Award className="w-3 h-3" />
              <span>{lang === 'ar' ? user.activeSubscription.name_ar : user.activeSubscription.name_fr}</span>
            </button>
          )}
        </div>

        {/* Dynamic Center Ticker backed by Admin Settings */}
        {tickerMessages.length > 0 && (
          <div className="tick" aria-live="off">
            {tickerMessages.map((msg) => {
              const txt = lang === 'ar' ? msg.text_ar : msg.text_fr || msg.text_ar;
              return (
                <span key={msg.id}>
                  ✦ {renderTickerParts(txt, totalVerifiedQuestions, catalog.lessons.length)}
                </span>
              );
            })}
          </div>
        )}

        <div className="grp">
          <select
            className="sel"
            value={selectedTrack}
            onChange={(e) => setSelectedTrack(e.target.value as TrackSlug)}
            aria-label={t.navTracks}
          >
            <option value="all">{t.allTracks}</option>
            <option value="arabic">{t.trackArabic}</option>
            <option value="french">{t.trackFrench}</option>
            <option value="bilingual">{t.trackBilingual}</option>
          </select>

          <button
            type="button"
            onClick={() => navigate('question-bank')}
            className="cnt tabular-nums"
            title={t.navQuestionBank}
            aria-label={t.navQuestionBank}
          >
            {totalVerifiedQuestions}
          </button>

          <button
            type="button"
            onClick={() => navigate('review-center')}
            className="ib"
            title={t.navReviewCenter}
            aria-label={t.navReviewCenter}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
              <path d="M6 3h12v18l-6-4-6 4z" />
            </svg>
          </button>

          <button
            type="button"
            onClick={() => navigate('favorites')}
            className="ib heart"
            title={t.favorites}
            aria-label={t.favorites}
          >
            <svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 21s-8-5.3-8-11a4.5 4.5 0 018-2.8A4.5 4.5 0 0120 10c0 5.7-8 11-8 11z" />
            </svg>
            {favoriteCount > 0 && <span className="heart-badge tabular-nums">{favoriteCount}</span>}
          </button>

          <button
            type="button"
            onClick={() => navigate('support')}
            className="ib relative"
            title={tr(lang, 'المراسلة المباشرة', 'Messagerie directe', 'Direct Messages')}
            aria-label={tr(lang, 'المراسلة المباشرة', 'Messagerie directe', 'Direct Messages')}
          >
            <MessageSquare className="w-[18px] h-[18px]" />
            {unreadSupportCount > 0 && (
              <span className="heart-badge tabular-nums">{unreadSupportCount}</span>
            )}
          </button>

          <button
            type="button"
            onClick={() => navigate('notifications')}
            className={`ib bell ${unreadNotificationCount > 0 ? 'has-unread' : ''}`}
            title={t.notificationsTitle}
            aria-label={t.notificationsTitle}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 17V11a6 6 0 0112 0v6l2 2H4zM10 21h4" />
            </svg>
            {unreadNotificationCount > 0 && (
              <span className="sr-only">{unreadNotificationCount}</span>
            )}
          </button>

          <button
            type="button"
            id="theme"
            onClick={toggleTheme}
            className="ib theme"
            title={lang === 'ar' ? 'تبديل المظهر' : 'Changer le thème'}
            aria-label={lang === 'ar' ? 'تبديل المظهر' : 'Changer le thème'}
          >
            <svg className="sun" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5" />
            </svg>
            <svg className="moon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
              <path d="M20 14A8 8 0 0110 4a8 8 0 1010 10z" />
            </svg>
          </button>
        </div>
      </div>

      {/* =================================================================== */}
      {/* 2. STICKY HEADER, LOGO, REAL SEARCH POPOVER & SLIDING NAV (.t-hdr)  */}
      {/* =================================================================== */}
      <header className={`t-hdr ${stuck ? 'stuck' : ''}`} id="hdr">
        <div className="row">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="burger"
            aria-label={lang === 'ar' ? 'القائمة' : 'Menu'}
          >
            <i />
            <i />
            <i />
          </button>

          <button
            type="button"
            onClick={() => navigate('home')}
            className="logo"
            aria-label={tr(lang, 'تدريبي – منصة التدريب الحر', 'Tadribi – Formation Libre', 'Tadribi – Free Training')}
          >
            <img
              className="lg"
              src="/assets/images/platform-logo.webp"
              alt={tr(lang, 'تدريبي', 'Tadribi', 'Tadribi')}
              width={132}
              height={44}
              referrerPolicy="no-referrer"
            />
          </button>

          <div className="search" ref={searchWrapRef}>
            <form onSubmit={handleSearchSubmit} className={`sbar ${searchError ? 'has-err' : ''}`}>
              <button
                type="button"
                id="cat"
                onClick={cycleSearchScope}
                className="cat"
                aria-label={lang === 'ar' ? 'تغيير نطاق البحث' : 'Changer le domaine de recherche'}
              >
                <span>{scopeLabel(searchScope)}</span>
                <svg width="10" height="6" viewBox="0 0 10 6" fill="none" stroke="currentColor" strokeWidth="1.6">
                  <path d="M1 1l4 4 4-4" />
                </svg>
              </button>
              <input
                id="q"
                type="search"
                value={searchQuery}
                onFocus={() => setSearchPopOpen(true)}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setSearchPopOpen(true);
                  if (searchError) setSearchError(false);
                }}
                placeholder={t.searchPlaceholder}
                autoComplete="off"
              />
              <button type="submit" className="go" aria-label={lang === 'ar' ? 'بحث' : 'Rechercher'}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <circle cx="11" cy="11" r="7" />
                  <path d="M20 20l-4-4" />
                </svg>
              </button>
            </form>

            <div className={`pop ${searchPopOpen ? 'on' : ''}`} id="pop">
              <small>
                {searchQuery.trim()
                  ? tr(lang, 'نتائج مطابقة من المنصة', 'Résultats correspondants', 'Matching results')
                  : tr(lang, 'الأكثر بحثاً في المنهج', 'Recherches populaires', 'Popular searches')}
              </small>
              {searchSuggestions.length === 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    setSearchPopOpen(false);
                    setAdvancedSearchOpen(true);
                  }}
                >
                  <span>
                    ◦{' '}
                    {tr(
                      lang,
                      'لم نجد مطابقة مباشرة — افتح البحث المتقدم',
                      'Aucun résultat direct — Recherche avancée',
                      'No direct match — Open advanced search'
                    )}
                  </span>
                </button>
              ) : (
                searchSuggestions.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setSearchPopOpen(false);
                      navigate(item.view, item.params);
                    }}
                  >
                    <span className="truncate">◦ {item.title}</span>
                    <small className="!p-0 shrink-0">{item.kind}</small>
                  </button>
                ))
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setAdvancedSearchOpen(true)}
            className="adv"
          >
            {t.advancedSearch}
          </button>
        </div>

        <div className="t-nav-wrap">
          <nav className="t-nav" id="nav" ref={navRef} onMouseLeave={resetIndicator}>
            {navItems.map((item) => {
              const isActive = item.id === activeNavId;
              const hasDd = Boolean(item.dropdown && item.dropdown.length > 0);
              return (
                <div
                  key={item.id}
                  className="t-nav-item"
                  onMouseEnter={(e) => {
                    const btn = navBtnRefs.current[item.id];
                    moveIndicatorTo(btn);
                    if (hasDd && btn) {
                      handleOpenDropdown(item, btn);
                    } else {
                      setOpenDropdown(null);
                    }
                    void e;
                  }}
                  onMouseLeave={() => {
                    if (openDropdown?.id === item.id) {
                      setOpenDropdown(null);
                    }
                  }}
                >
                  <button
                    type="button"
                    ref={(el) => {
                      navBtnRefs.current[item.id] = el;
                    }}
                    className={`t-nav-btn ${isActive ? 'on' : ''} ${hasDd ? 'dd' : ''}`}
                    onFocus={(e) => moveIndicatorTo(e.currentTarget)}
                    onClick={(e) => {
                      if (hasDd && openDropdown?.id !== item.id) {
                        handleOpenDropdown(item, e.currentTarget);
                      } else {
                        navJump(item.view, item.params || {});
                      }
                    }}
                    aria-expanded={hasDd ? openDropdown?.id === item.id : undefined}
                  >
                    <span>{item.label}</span>
                    {item.isNew && <span className="new">{t.badgeNew}</span>}
                  </button>
                </div>
              );
            })}
            <span
              className="ind"
              id="ind"
              style={{
                width: `${indStyle.width}px`,
                insetInlineStart: `${indStyle.left}px`,
                opacity: indStyle.opacity,
              }}
            />
          </nav>
        </div>

        {/* Floating Dropdown Menu positioned outside nav overflow-x container */}
        {openDropdown && activeDropdownItem?.dropdown && (
          <div
            className="t-nav-dd-menu"
            style={{ top: `${openDropdown.top}px`, left: `${openDropdown.left}px` }}
            onMouseEnter={() => {}}
            onMouseLeave={() => setOpenDropdown(null)}
          >
            {activeDropdownItem.dropdown.map((sub, i) => (
              <button
                key={`${activeDropdownItem.id}-dd-${i}`}
                type="button"
                onClick={() => navJump(sub.view, sub.params || {})}
              >
                <span>{sub.label}</span>
              </button>
            ))}
          </div>
        )}
      </header>

      {/* Active Exam Resume Banner */}
      {activeExam && currentView !== 'exams' && (
        <div className="bg-[#c8e085] border-b border-[#A6CE39] text-[#1c2a0e]">
          <div className="max-w-[1260px] mx-auto px-4 sm:px-6 py-2 flex flex-wrap items-center justify-between gap-2 text-xs sm:text-sm">
            <div className="flex items-center gap-2 font-bold">
              <ClipboardCheck className="w-4 h-4 text-[#1c2a0e]" />
              <span>
                {lang === 'ar'
                  ? `لديك امتحان قيد التقدم (${activeExam.questions.length} سؤال) — تم حفظ إجاباتك تلقائياً.`
                  : `Vous avez un examen en cours (${activeExam.questions.length} questions) — réponses sauvegardées.`}
              </span>
            </div>
            <button
              type="button"
              onClick={() => navigate('exams')}
              className="px-3.5 py-1 rounded-[4px] bg-[#1a4430] hover:bg-[#0b2217] text-white font-bold text-xs cursor-pointer"
            >
              {t.resumeExam}
            </button>
          </div>
        </div>
      )}

      {/* Subpage Back Strip for intuitive mobile / Android return */}
      {currentView !== 'home' && canGoBack && (
        <div className="no-print max-w-[1200px] w-full mx-auto px-4 pt-3">
          <button
            type="button"
            onClick={goBack}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-[#384D55] hover:text-[#83a329] cursor-pointer"
          >
            {lang === 'ar' ? (
              <ArrowRight className="w-3.5 h-3.5" />
            ) : (
              <ArrowLeft className="w-3.5 h-3.5" />
            )}
            <span>{tr(lang, 'رجوع', 'Retour', 'Back')}</span>
          </button>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1" style={{ background: 'var(--bg)', color: 'var(--ink)' }}>
        {children}
      </main>

      {/* Footer */}
      <AnimatedFooter />

      {/* Advanced Search Modal */}
      {advancedSearchOpen && (
        <div
          className="fixed inset-0 z-50 bg-[#0b2217]/45 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div
            className="rounded-[12px] border max-w-lg w-full shadow-xl overflow-hidden"
            style={{ background: 'var(--card)', color: 'var(--ink)', borderColor: 'var(--line)' }}
          >
            <div
              className="border-b px-5 py-3.5 flex items-center justify-between"
              style={{ background: 'var(--field)', borderColor: 'var(--line)' }}
            >
              <h2 className="font-bold text-base flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-[#6f9318]" />
                <span>{t.advancedSearch}</span>
              </h2>
              <button
                type="button"
                onClick={() => setAdvancedSearchOpen(false)}
                className="hover:text-[#6f9318] cursor-pointer"
                aria-label={t.close}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleAdvancedSearchSubmit} className="p-5 space-y-4 text-sm">
              <div>
                <label className="block font-bold mb-1 text-xs">{lang === 'ar' ? 'نطاق البحث' : 'Section'}</label>
                <select
                  value={advScope}
                  onChange={(e) => setAdvScope(e.target.value as any)}
                  className="template-input"
                >
                  <option value="lessons">{t.searchLessons}</option>
                  <option value="questions">{t.searchQuestions}</option>
                  <option value="summaries">{t.searchSummaries}</option>
                  <option value="exams">{t.searchExams}</option>
                </select>
              </div>
              <div>
                <label className="block font-bold mb-1 text-xs">{lang === 'ar' ? 'كلمة مفتاحية' : 'Mot-clé'}</label>
                <input
                  type="text"
                  value={advKeyword}
                  onChange={(e) => setAdvKeyword(e.target.value)}
                  placeholder={t.searchPlaceholder}
                  className="template-input"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold mb-1 text-xs">{t.navTracks}</label>
                  <select
                    value={advTrack}
                    onChange={(e) => setAdvTrack(e.target.value as TrackSlug)}
                    className="template-input text-xs"
                  >
                    <option value="all">{t.allTracks}</option>
                    <option value="arabic">{t.trackArabic}</option>
                    <option value="french">{t.trackFrench}</option>
                    <option value="bilingual">{t.trackBilingual}</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold mb-1 text-xs">{lang === 'ar' ? 'المادة' : 'Matière'}</label>
                  <select
                    value={advSubject}
                    onChange={(e) => setAdvSubject(e.target.value)}
                    className="template-input text-xs"
                  >
                    <option value="all">{t.searchAll}</option>
                    {catalog.subjects.map((s) => (
                      <option key={s.slug} value={s.slug}>
                        {lang === 'ar' ? s.name_ar : s.name_fr}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-bold mb-1 text-xs">{t.navLevels}</label>
                  <select
                    value={advLevel}
                    onChange={(e) => setAdvLevel(e.target.value)}
                    className="template-input text-xs"
                  >
                    <option value="all">{t.searchAll}</option>
                    <option value="foundation">{t.levelFoundation}</option>
                    <option value="intermediate">{t.levelIntermediate}</option>
                    <option value="advanced">{t.levelAdvanced}</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAdvancedSearchOpen(false)}
                  className="imgsend2-secondary text-xs"
                >
                  {t.cancel}
                </button>
                <button type="submit" className="imgsend2 text-xs">
                  {lang === 'ar' ? 'تطبيق البحث' : 'Rechercher'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Logout Confirmation Modal */}
      {logoutConfirmOpen && (
        <div
          className="fixed inset-0 z-50 bg-[#0b2217]/50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label={tr(lang, 'تأكيد تسجيل الخروج', 'Confirmation de déconnexion', 'Confirm Logout')}
        >
          <div
            className="rounded-[10px] border max-w-sm w-full shadow-xl p-5 space-y-4"
            style={{ background: 'var(--card)', color: 'var(--ink)', borderColor: 'var(--line)' }}
          >
            <div className="flex items-center gap-2.5">
              <LogOut className="w-5 h-5 text-red-600 shrink-0" />
              <h3 className="font-extrabold text-sm">
                {tr(lang, 'هل أنت متأكد أنك تريد تسجيل الخروج؟', 'Voulez-vous vraiment vous déconnecter ?', 'Are you sure you want to log out?')}
              </h3>
            </div>
            <div className="flex items-center justify-end gap-2.5 pt-1">
              <button
                type="button"
                onClick={cancelLogout}
                className="imgsend2-secondary !py-1.5 !px-5 text-xs"
              >
                {tr(lang, 'لا', 'Non', 'No')}
              </button>
              <button
                type="button"
                onClick={() => void confirmLogout()}
                className="inline-flex items-center justify-center gap-1.5 px-5 py-1.5 rounded-[4px] bg-red-600 hover:bg-red-700 text-white font-bold text-xs cursor-pointer"
              >
                {tr(lang, 'نعم', 'Oui', 'Yes')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Real-time Floating Notification Toast */}
      {activeToast && (
        <div
          className="fixed bottom-4 inset-inline-end-4 z-50 max-w-sm w-[calc(100vw-2rem)] rounded-[10px] border shadow-xl p-3.5 space-y-2"
          style={{ background: 'var(--card)', color: 'var(--ink)', borderColor: '#A6CE39' }}
          role="status"
          aria-live="polite"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 font-extrabold text-xs">
              <Bell className="w-4 h-4 text-[#83a329] shrink-0" />
              <span>{lang === 'ar' ? activeToast.title_ar : activeToast.title_fr || activeToast.title_ar}</span>
            </div>
            <button
              type="button"
              onClick={dismissToast}
              className="p-0.5 hover:text-[#83a329] cursor-pointer"
              aria-label={t.close}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-[11.5px] leading-relaxed" style={{ color: 'var(--mute)' }}>
            <NotificationBodyText text={lang === 'ar' ? activeToast.body_ar : activeToast.body_fr || activeToast.body_ar} />
          </p>
          <div className="flex items-center justify-end gap-3 text-[11px] font-bold">
            <button
              type="button"
              onClick={() => {
                void markNotificationsRead();
                dismissToast();
                navigate('notifications');
              }}
              className="text-[#83a329] hover:underline cursor-pointer"
            >
              {tr(lang, 'عرض الإشعارات', 'Voir les notifications', 'View notifications')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
