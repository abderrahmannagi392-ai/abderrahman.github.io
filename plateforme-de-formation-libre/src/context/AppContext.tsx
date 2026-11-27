import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  onAuthStateChanged,
  sendEmailVerification,
  signOut,
  type User as FirebaseUser,
} from 'firebase/auth';
import {
  auth,
  isOfficialAdminEmail,
  testConnection,
  translateFirebaseAuthError,
} from '../lib/firebase';
import {
  ensureUserDocuments,
  fetchFirestoreLessons,
  fetchFirestoreLessonSections,
  fetchFirestorePlans,
  fetchFirestoreSiteConfig,
  markNotificationsReadInFirestore,
  seedFirestoreCatalogIfNeeded,
  subscribeAllConversationsForAdmin,
  subscribeLessonProgress,
  subscribeMyActiveSubscription,
  subscribeUserConversations,
  subscribeUserNotifications,
} from '../lib/firestoreService';
import type {
  ActiveSubscriptionSummary,
  AnnualSavingsSummary,
  ExamAttempt,
  Language,
  Lesson,
  LessonSection,
  NotificationItem,
  PaymentMethodConfig,
  PlanLimitsConfig,
  Question,
  SiteConfig,
  Subject,
  SubscriptionPlan,
  SummaryItem,
  Track,
  TrackSlug,
  User,
} from '../types';
import { isPhoneDevice } from '../lib/deviceMode';
import { apiRequest, resolveApiUrl, setAuthToken } from '../utils/api';
import { trackAnalyticsEvent } from '../utils/locale';
import { speechEngine } from '../utils/speechEngine';

export type AppView =
  | 'home'
  | 'about'
  | 'privacy'
  | 'terms'
  | 'contact'
  | 'all-subjects'
  | 'lessons'
  | 'summaries'
  | 'question-bank'
  | 'review-center'
  | 'exams'
  | 'baccalaureate'
  | 'favorites'
  | 'notifications'
  | 'report'
  | 'dashboard'
  | 'teacher-dashboard'
  | 'section-view'
  | 'school-dashboard'
  | 'profile'
  | 'account-complete'
  | 'support'
  | 'admin'
  | 'login'
  | 'register'
  | 'forgot-password'
  | 'reset-password'
  | 'verify-receipt'
  | 'subscriptions'
  | 'checkout'
  | 'mobile';

export type ThemeMode = 'light' | 'dark';

export interface BankStats {
  totalVerifiedQuestions: number;
  officialThreshold: number;
  isComprehensiveOfficialReady: boolean;
  bySubject: Array<{ subject_slug: string; count: number }>;
}

export interface GradingPolicy {
  maxScore: number;
  wrongPenalty: number;
  passingScore: number;
}

export interface CatalogData {
  tracks: Track[];
  subjects: Subject[];
  lessons: Lesson[];
  lessonSections: LessonSection[];
  summaries: SummaryItem[];
  bankStats: BankStats;
  gradingPolicy: GradingPolicy;
  siteConfig?: SiteConfig;
}

export interface ViewParams {
  lessonId?: number;
  subjectSlug?: string;
  level?: string;
  search?: string;
  searchCategory?: string;
  favoritesOnly?: boolean;
  examMode?: 'mock' | 'official_sim' | 'placement';
  reviewAttemptId?: number;
  planId?: number;
  resetToken?: string;
  actionToken?: string;
  oobCode?: string;
  receiptId?: string;
  receiptSig?: string;
  redirectView?: AppView;
  bacSeries?: string;
  shareCode?: string;
}

interface AppContextValue {
  lang: Language;
  setLang: (lang: Language) => void;
  theme: ThemeMode;
  toggleTheme: () => void;
  selectedTrack: TrackSlug;
  setSelectedTrack: (track: TrackSlug) => void;
  firebaseUser: FirebaseUser | null;
  authReady: boolean;
  user: User | null;
  setUser: (user: User | null) => void;
  refreshUser: () => Promise<void>;
  resendVerificationEmail: () => Promise<{ ok: boolean; error?: string }>;
  reloadVerificationStatus: () => Promise<{ verified: boolean; error?: string }>;
  authDisabledNotice: string | null;
  clearAuthDisabledNotice: () => void;
  catalog: CatalogData;
  refreshCatalog: () => Promise<void>;
  plans: SubscriptionPlan[];
  refreshPlans: () => Promise<void>;
  paymentMethods: PaymentMethodConfig[];
  annualSavings: AnnualSavingsSummary | null;
  freeLimits: PlanLimitsConfig | null;
  canCopy: boolean;
  siteConfig: SiteConfig;
  notifications: NotificationItem[];
  unreadNotificationCount: number;
  unreadSupportCount: number;
  activeToast: NotificationItem | null;
  dismissToast: () => void;
  notificationSoundEnabled: boolean;
  toggleNotificationSound: (next?: boolean) => Promise<void>;
  refreshNotifications: () => Promise<void>;
  markNotificationsRead: () => Promise<void>;
  activeExam: { attempt: ExamAttempt; questions: Question[] } | null;
  setActiveExam: (data: { attempt: ExamAttempt; questions: Question[] } | null) => void;
  refreshActiveExam: () => Promise<void>;
  currentView: AppView;
  viewParams: ViewParams;
  navigate: (view: AppView, params?: ViewParams) => void;
  canGoBack: boolean;
  goBack: () => void;
  upgradeModal: { open: boolean; featureLabel?: string };
  openUpgradeModal: (featureLabel?: string) => void;
  closeUpgradeModal: () => void;
  goToAuth: (mode?: 'login' | 'register' | 'forgot') => void;
  advancedSearchOpen: boolean;
  setAdvancedSearchOpen: (open: boolean) => void;
  logoutConfirmOpen: boolean;
  requestLogout: () => void;
  confirmLogout: () => Promise<void>;
  cancelLogout: () => void;
  logout: () => Promise<void>;
  bootLoading: boolean;
}

const emptySiteConfig: SiteConfig = {
  tickerMessages: [],
  heroSlides: [],
  supportEnabled: true,
  maintenanceMode: false,
};

const emptyCatalog: CatalogData = {
  tracks: [],
  subjects: [],
  lessons: [],
  lessonSections: [],
  summaries: [],
  bankStats: {
    totalVerifiedQuestions: 0,
    officialThreshold: 70,
    isComprehensiveOfficialReady: false,
    bySubject: [],
  },
  gradingPolicy: { maxScore: 20, wrongPenalty: 0, passingScore: 10 },
  siteConfig: emptySiteConfig,
};

const THEME_STORAGE_KEY = 'fl_theme';
const LANG_STORAGE_KEY = 'fl_lang';

const VALID_VIEWS: AppView[] = [
  'home',
  'about',
  'privacy',
  'terms',
  'contact',
  'all-subjects',
  'lessons',
  'summaries',
  'question-bank',
  'review-center',
  'exams',
  'baccalaureate',
  'favorites',
  'notifications',
  'report',
  'dashboard',
  'teacher-dashboard',
  'section-view',
  'school-dashboard',
  'profile',
  'account-complete',
  'support',
  'admin',
  'login',
  'register',
  'forgot-password',
  'reset-password',
  'verify-receipt',
  'subscriptions',
  'checkout',
  'mobile',
];

function getInitialViewAndParams(): { view: AppView; params: ViewParams; search: string } {
  if (typeof window === 'undefined') return { view: 'home', params: {}, search: '' };
  const rawSearch = window.location.search || '';
  const sp = new URLSearchParams(rawSearch);

  try {
    const refParam = sp.get('ref')?.trim().toUpperCase();
    if (refParam && /^[A-Z0-9_-]{4,24}$/.test(refParam)) {
      window.localStorage.setItem('tadribi_pending_ref', refParam);
    }
  } catch {
    // ignore storage restriction
  }

  const rawPath = window.location.pathname.replace(/^\/+|\/+$/g, '');
  const slug = rawPath.toLowerCase();
  const mode = sp.get('mode')?.trim() || '';
  const oobCode = sp.get('oobCode')?.trim() || '';
  const token = sp.get('token')?.trim() || '';
  const at = sp.get('at')?.trim() || '';
  const rid = sp.get('rid')?.trim() || '';
  const sig = sp.get('sig')?.trim() || '';

  // Phones always start in the mobile app. Shared section links and e-mail
  // action links (reset password, receipt check) keep opening their web page.
  const isWebDeepLink = slug.startsWith('sections/') || Boolean(mode || oobCode || token);
  if (isPhoneDevice() && !isWebDeepLink) {
    return { view: 'mobile', params: {}, search: rawSearch };
  }

  if (slug.startsWith('sections/')) {
    const code = rawPath.slice('sections/'.length).split('/')[0]?.trim();
    if (code) {
      return {
        view: 'section-view',
        params: { shareCode: code },
        search: rawSearch,
      };
    }
  }

  if (mode === 'resetPassword' && oobCode) {
    return {
      view: 'reset-password',
      params: { oobCode, actionToken: at || undefined, resetToken: token || undefined },
      search: rawSearch,
    };
  }

  if (slug === 'reset-password') {
    return {
      view: 'reset-password',
      params: {
        resetToken: token || undefined,
        actionToken: at || undefined,
        oobCode: oobCode || undefined,
      },
      search: rawSearch,
    };
  }

  if (slug === 'verify-receipt') {
    return {
      view: 'verify-receipt',
      params: { receiptId: rid || undefined, receiptSig: sig || undefined },
      search: rawSearch,
    };
  }

  if (slug && VALID_VIEWS.includes(slug as AppView)) {
    return { view: slug as AppView, params: {}, search: '' };
  }
  return { view: 'home', params: {}, search: '' };
}

function getInitialViewFromPath(): AppView {
  return getInitialViewAndParams().view;
}

function getInitialLanguage(): Language {
  if (typeof window === 'undefined') return 'ar';
  try {
    const saved = window.localStorage.getItem(LANG_STORAGE_KEY);
    if (saved === 'ar' || saved === 'fr' || saved === 'en') {
      return saved;
    }
  } catch {
    // ignore storage restriction
  }
  return 'ar';
}

function getInitialTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'light';
  try {
    const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'dark' || saved === 'light') return saved;
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
  } catch {
    // ignore storage access issues
  }
  return 'light';
}

const AppContext = createContext<AppContextValue | null>(null);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lang, setLangState] = useState<Language>(getInitialLanguage);
  const [theme, setTheme] = useState<ThemeMode>(getInitialTheme);
  const [selectedTrack, setSelectedTrack] = useState<TrackSlug>('all');
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [activeSub, setActiveSub] = useState<ActiveSubscriptionSummary | null>(null);
  const [serverSub, setServerSub] = useState<ActiveSubscriptionSummary | null>(null);
  const [serverExpiredSub, setServerExpiredSub] = useState<ActiveSubscriptionSummary | null>(null);
  const [serverUserMeta, setServerUserMeta] = useState<Partial<User> | null>(null);
  const [canCopy, setCanCopy] = useState(false);
  const [lessonProgressMap, setLessonProgressMap] = useState<
    Record<string, { completed: boolean; isFavorite: boolean }>
  >({});
  const [authDisabledNotice, setAuthDisabledNotice] = useState<string | null>(null);

  const [baseCatalog, setBaseCatalog] = useState<CatalogData>(emptyCatalog);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodConfig[]>([]);
  const [annualSavings, setAnnualSavings] = useState<AnnualSavingsSummary | null>(null);
  const [freeLimits, setFreeLimits] = useState<PlanLimitsConfig | null>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [serverNotifications, setServerNotifications] = useState<NotificationItem[]>([]);
  const [activeToast, setActiveToast] = useState<NotificationItem | null>(null);
  const [notificationSoundEnabled, setNotificationSoundEnabled] = useState<boolean>(() => {
    try {
      const saved = window.localStorage.getItem('tadribi_notif_sound');
      return saved === null ? true : saved !== '0';
    } catch {
      return true;
    }
  });
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [unreadSupportCount, setUnreadSupportCount] = useState(0);
  const [activeExam, setActiveExam] = useState<{ attempt: ExamAttempt; questions: Question[] } | null>(
    null
  );
  const [currentView, setCurrentView] = useState<AppView>(() => getInitialViewAndParams().view);
  const [viewParams, setViewParams] = useState<ViewParams>(() => getInitialViewAndParams().params);
  const [historyStack, setHistoryStack] = useState<Array<{ view: AppView; params: ViewParams }>>(() => {
    const init = getInitialViewAndParams();
    return [{ view: init.view, params: init.params }];
  });
  const [upgradeModal, setUpgradeModal] = useState<{ open: boolean; featureLabel?: string }>({
    open: false,
  });
  const [advancedSearchOpen, setAdvancedSearchOpen] = useState(false);
  const [bootLoading, setBootLoading] = useState(true);

  const seededOnceRef = useRef(false);
  const seenNotifIdsRef = useRef<Set<string>>(new Set());
  const toastTimerRef = useRef<number | null>(null);
  const notifSoundRef = useRef(notificationSoundEnabled);
  notifSoundRef.current = notificationSoundEnabled;

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  }, [lang]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next: ThemeMode = prev === 'dark' ? 'light' : 'dark';
      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, next);
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  const setLang = useCallback((nextLang: Language) => {
    speechEngine.stop();
    const safeLang: Language = nextLang === 'fr' || nextLang === 'en' ? nextLang : 'ar';
    setLangState(safeLang);
    try {
      window.localStorage.setItem(LANG_STORAGE_KEY, safeLang);
    } catch {
      // ignore
    }
    document.documentElement.lang = safeLang;
    document.documentElement.dir = safeLang === 'ar' ? 'rtl' : 'ltr';
  }, []);

  const refreshCopyPermission = useCallback(async () => {
    if (!auth.currentUser) {
      setCanCopy(false);
      return;
    }
    try {
      const res = await apiRequest<{ canCopy?: boolean }>('/api/auth/copy-permission');
      setCanCopy(Boolean(res?.canCopy));
    } catch {
      setCanCopy(false);
    }
  }, []);

  const refreshPlans = useCallback(async () => {
    try {
      const res = await apiRequest<{
        plans?: SubscriptionPlan[];
        paymentMethods?: PaymentMethodConfig[];
        annualSavings?: AnnualSavingsSummary;
        planLimits?: { free?: PlanLimitsConfig };
        currentSubscription?: ActiveSubscriptionSummary | null;
        latestExpiredSubscription?: ActiveSubscriptionSummary | null;
      }>('/api/plans');
      if (Array.isArray(res.plans) && res.plans.length > 0) {
        setPlans(res.plans);
      }
      if (Array.isArray(res.paymentMethods)) {
        setPaymentMethods(res.paymentMethods);
      }
      if (res.annualSavings) {
        setAnnualSavings(res.annualSavings);
      }
      if (res.planLimits?.free) {
        setFreeLimits(res.planLimits.free);
      }
      setServerSub(res.currentSubscription || null);
      setServerExpiredSub(res.latestExpiredSubscription || null);
      return;
    } catch {
      // Fall back to Firestore plans only when API is unavailable
    }
    try {
      const fsPlans = await fetchFirestorePlans();
      if (fsPlans.length > 0) {
        setPlans(fsPlans);
      }
    } catch {
      // ignore
    }
  }, []);

  const refreshCatalog = useCallback(async () => {
    try {
      const [apiCat, fsLessons, fsSections, fsSiteConfig] = await Promise.all([
        apiRequest<CatalogData>('/api/catalog').catch(() => null),
        fetchFirestoreLessons(false).catch(() => [] as Lesson[]),
        fetchFirestoreLessonSections(false).catch(() => [] as LessonSection[]),
        fetchFirestoreSiteConfig().catch(() => null),
      ]);

      const validApiCat =
        apiCat &&
        typeof apiCat === 'object' &&
        apiCat.bankStats &&
        typeof apiCat.bankStats.totalVerifiedQuestions === 'number'
          ? apiCat
          : null;

      setBaseCatalog((prev) => {
        const source = validApiCat || prev || emptyCatalog;
        const mergedLessons =
          fsLessons.length > 0
            ? fsLessons
            : Array.isArray(source.lessons)
              ? source.lessons
              : [];
        const mergedSiteConfig: SiteConfig =
          fsSiteConfig && fsSiteConfig.heroSlides?.length > 0
            ? {
                tickerMessages: fsSiteConfig.tickerMessages,
                heroSlides: fsSiteConfig.heroSlides,
                supportEnabled: fsSiteConfig.supportEnabled,
                maintenanceMode: fsSiteConfig.maintenanceMode,
              }
            : source.siteConfig || emptySiteConfig;

        const mergedGrading =
          fsSiteConfig?.gradingPolicy || source.gradingPolicy || emptyCatalog.gradingPolicy;

        const rawBankStats = source.bankStats || emptyCatalog.bankStats;
        const normalizedBankStats: BankStats = {
          totalVerifiedQuestions:
            typeof rawBankStats.totalVerifiedQuestions === 'number'
              ? rawBankStats.totalVerifiedQuestions
              : 0,
          officialThreshold:
            typeof rawBankStats.officialThreshold === 'number'
              ? rawBankStats.officialThreshold
              : emptyCatalog.bankStats.officialThreshold,
          isComprehensiveOfficialReady: Boolean(rawBankStats.isComprehensiveOfficialReady),
          bySubject: Array.isArray(rawBankStats.bySubject) ? rawBankStats.bySubject : [],
        };

        return {
          tracks: Array.isArray(source.tracks) ? source.tracks : [],
          subjects: Array.isArray(source.subjects) ? source.subjects : [],
          lessons: mergedLessons,
          lessonSections: fsSections,
          summaries: Array.isArray(source.summaries) ? source.summaries : [],
          bankStats: normalizedBankStats,
          gradingPolicy: mergedGrading,
          siteConfig: mergedSiteConfig,
        };
      });
    } catch {
      // ignore
    }
  }, []);

  const refreshActiveExam = useCallback(async () => {
    if (!auth.currentUser) {
      setActiveExam(null);
      return;
    }
    try {
      const data = await apiRequest<{ attempt: ExamAttempt | null; questions: Question[] }>(
        '/api/exams/active'
      );
      if (data.attempt && data.questions.length > 0) {
        setActiveExam({ attempt: data.attempt, questions: data.questions });
      } else {
        setActiveExam(null);
      }
    } catch {
      setActiveExam(null);
    }
  }, []);

  const syncServerUserAndSession = useCallback(async () => {
    if (!auth.currentUser) {
      setServerUserMeta(null);
      return;
    }
    try {
      await apiRequest('/api/auth/sessions/heartbeat', { method: 'POST', json: {} }).catch((err: any) => {
        if (err?.status === 401 && err?.data?.code === 'SESSION_REVOKED') throw err;
      });

      const pendingRef = window.localStorage.getItem('tadribi_pending_ref');
      if (pendingRef) {
        await apiRequest('/api/referrals/claim', { method: 'POST', json: { code: pendingRef } }).catch(() => {});
        window.localStorage.removeItem('tadribi_pending_ref');
      }

      const me = await apiRequest<{ user?: Partial<User> | null }>('/api/auth/me');
      if (me?.user) {
        setServerUserMeta(me.user);
      }
    } catch {
      // ignore non-fatal background sync
    }
  }, []);

  const refreshUser = useCallback(async () => {
    const cur = auth.currentUser;
    if (!cur) {
      setUser(null);
      setServerUserMeta(null);
      return;
    }
    await cur.reload().catch(() => {});
    if (cur.emailVerified) {
      await cur.getIdToken(true).catch(() => {});
    }
    const profile = await ensureUserDocuments(cur);
    if (profile.disabled) {
      await signOut(auth);
      setUser(null);
      setAuthDisabledNotice(
        lang === 'ar'
          ? 'تم تعليق هذا الحساب من قبل الإدارة.'
          : 'Ce compte a été désactivé par l’administration.'
      );
      return;
    }
    setFirebaseUser(auth.currentUser);
    setUser(profile);
    await Promise.all([refreshCopyPermission(), refreshPlans(), syncServerUserAndSession()]);
  }, [lang, refreshCopyPermission, refreshPlans, syncServerUserAndSession]);

  const resendVerificationEmail = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    const cur = auth.currentUser;
    if (!cur) return { ok: false, error: 'Not signed in' };
    try {
      await sendEmailVerification(cur);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: translateFirebaseAuthError(err, lang) };
    }
  }, [lang]);

  const reloadVerificationStatus = useCallback(async (): Promise<{
    verified: boolean;
    error?: string;
  }> => {
    const cur = auth.currentUser;
    if (!cur) return { verified: false, error: 'Not signed in' };
    try {
      await cur.reload();
      if (cur.emailVerified) {
        await cur.getIdToken(true);
        await refreshUser();
        return { verified: true };
      }
      return { verified: false };
    } catch (err) {
      return { verified: false, error: translateFirebaseAuthError(err, lang) };
    }
  }, [lang, refreshUser]);

  // Boot: test Firestore connection + load public catalog + listen to Firebase Auth
  useEffect(() => {
    const initialLang = getInitialLanguage();
    document.documentElement.lang = initialLang;
    document.documentElement.dir = initialLang === 'ar' ? 'rtl' : 'ltr';

    trackAnalyticsEvent({ eventType: 'site_visit', pageView: getInitialViewFromPath() });
    trackAnalyticsEvent({ eventType: 'page_view', pageView: getInitialViewFromPath() });

    const onGlobalClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      const btn = target?.closest('button, a');
      if (!btn) return;
      const label = (btn.getAttribute('aria-label') || btn.textContent || '').trim().slice(0, 60);
      if (label) {
        trackAnalyticsEvent({ eventType: 'site_click', target: label });
      }
    };
    document.addEventListener('click', onGlobalClick, { passive: true });

    void testConnection();
    void Promise.all([refreshCatalog(), refreshPlans()]);

    // Capture ?ref=CODE parameter into localStorage when visiting referral links
    try {
      const sp = new URLSearchParams(window.location.search);
      const refParam = sp.get('ref')?.trim().toUpperCase();
      if (refParam && /^[A-Z0-9_-]{4,24}$/.test(refParam)) {
        window.localStorage.setItem('tadribi_pending_ref', refParam);
      }
    } catch {
      // ignore URL/storage issues
    }

    const onSessionRevoked = (ev: Event) => {
      const code = (ev as CustomEvent<{ code?: string }>)?.detail?.code;
      void signOut(auth).catch(() => {});
      setUser(null);
      setServerUserMeta(null);
      setActiveToast(null);
      setLogoutConfirmOpen(false);
      setAuthDisabledNotice(
        code === 'SESSION_EXPIRED'
          ? lang === 'ar'
            ? 'انتهت جلسة تسجيل الدخول الخاصة بك. يرجى تسجيل الدخول مرة أخرى.'
            : 'Votre session a expiré suite à une période d’inactivité. Veuillez vous reconnecter.'
          : lang === 'ar'
            ? 'تم إنهاء جلسة هذا الجهاز من صفحة إدارة الأجهزة النشطة. يرجى تسجيل الدخول مجدداً.'
            : 'Cette session d’appareil a été déconnectée depuis la gestion des appareils.'
      );
    };
    window.addEventListener('tadribi-session-revoked', onSessionRevoked);

    const unsubAuth = onAuthStateChanged(auth, async (fbUser) => {
      setFirebaseUser(fbUser);
      if (!fbUser) {
        setUser(null);
        setActiveSub(null);
        setServerSub(null);
        setServerExpiredSub(null);
        setServerUserMeta(null);
        setCanCopy(false);
        setLessonProgressMap({});
        setNotifications([]);
        setUnreadSupportCount(0);
        setActiveExam(null);
        setAuthToken(null);
        setAuthReady(true);
        setBootLoading(false);
        return;
      }

      try {
        const profile = await ensureUserDocuments(fbUser);
        if (profile.disabled) {
          await signOut(auth);
          setUser(null);
          setCanCopy(false);
          setAuthDisabledNotice(
            'تم إيقاف هذا الحساب مؤقتاً من قبل الإدارة. تواصل مع الدعم لمزيد من التفاصيل.'
          );
          setAuthReady(true);
          setBootLoading(false);
          return;
        }

        setUser(profile);
        if (profile.track) {
          setSelectedTrack(profile.track);
        }

        // If Official Admin signed in, ensure initial Firestore collections are seeded once
        if (profile.isAdmin && isOfficialAdminEmail(fbUser.email) && !seededOnceRef.current) {
          seededOnceRef.current = true;
          try {
            const [apiCat, apiPlans] = await Promise.all([
              apiRequest<CatalogData>('/api/catalog'),
              apiRequest<{ plans: SubscriptionPlan[] }>('/api/plans'),
            ]);
            await seedFirestoreCatalogIfNeeded({
              subjects: apiCat.subjects || [],
              lessons: apiCat.lessons || [],
              plans: apiPlans.plans || [],
              siteConfig: apiCat.siteConfig || emptySiteConfig,
              gradingPolicy: apiCat.gradingPolicy || { maxScore: 20, wrongPenalty: 0, passingScore: 10 },
            });
            await Promise.all([refreshCatalog(), refreshPlans()]);
          } catch (seedErr) {
            console.error('Initial catalog seeding check failed:', seedErr);
          }
        } else {
          void refreshPlans();
        }

        await Promise.all([refreshActiveExam(), refreshCopyPermission(), syncServerUserAndSession()]);
      } catch (err) {
        console.error('Auth state bootstrap failed:', err);
      } finally {
        setAuthReady(true);
        setBootLoading(false);
      }
    });

    return () => {
      document.removeEventListener('click', onGlobalClick);
      window.removeEventListener('tadribi-session-revoked', onSessionRevoked);
      unsubAuth();
    };
  }, [lang, refreshActiveExam, refreshCatalog, refreshCopyPermission, refreshPlans, syncServerUserAndSession]);

  // Periodic device heartbeat to keep session activity accurate & enforce remote revocations
  useEffect(() => {
    if (!authReady || !firebaseUser || !user) return;
    const iv = window.setInterval(() => {
      void apiRequest('/api/auth/sessions/heartbeat', { method: 'POST', json: {} }).catch(() => {});
    }, 60_000);
    return () => window.clearInterval(iv);
  }, [authReady, firebaseUser?.uid, user?.uid]);

  // Refresh ElevenLabs HD voice permission whenever user auth or active subscription changes
  useEffect(() => {
    void speechEngine.refreshElevenLabsStatus();
  }, [authReady, firebaseUser?.uid, activeSub?.id, activeSub?.status, serverSub?.id, serverSub?.status]);

  // Attach real-time Firestore listeners strictly when user is authenticated & verified
  useEffect(() => {
    if (!authReady || !firebaseUser || !user) return;
    const uid = firebaseUser.uid;
    const isAdminUser = Boolean(user.isAdmin);
    const createdMs = Date.parse(user.created_at) || Date.now();

    const unsubProgress = subscribeLessonProgress(uid, (map) => {
      setLessonProgressMap(map);
    });

    const unsubSub = subscribeMyActiveSubscription(uid, (sub) => {
      setActiveSub(sub);
    });

    const unsubConvos = isAdminUser
      ? subscribeAllConversationsForAdmin((list) => {
          setUnreadSupportCount(list.reduce((acc, c) => acc + (c.unreadForAdmin || 0), 0));
        })
      : subscribeUserConversations(uid, (list) => {
          setUnreadSupportCount(list.reduce((acc, c) => acc + (c.unreadForUser || 0), 0));
        });

    return () => {
      unsubProgress();
      unsubSub();
      unsubConvos();
    };
  }, [authReady, firebaseUser, user?.uid, user?.isAdmin]);

  // Separate notification listener so user track/level/subscription filters stay always fresh
  useEffect(() => {
    if (!authReady || !firebaseUser || !user) return;
    const createdMs = Date.parse(user.created_at) || Date.now();
    const unsubNotifs = subscribeUserNotifications({
      uid: firebaseUser.uid,
      userCreatedAtMs: createdMs,
      userTrack: user.track,
      userLevel: user.level,
      hasPaidSub: Boolean(activeSub && activeSub.billing_cycle !== 'free'),
      onUpdate: (items) => {
        setNotifications(items);
      },
    });
    return () => {
      unsubNotifs();
    };
  }, [authReady, firebaseUser, user?.uid, user?.created_at, user?.track, user?.level, activeSub]);

  // Sync notification sound preference from serverUserMeta when available
  useEffect(() => {
    if (serverUserMeta && typeof serverUserMeta.notification_sound_enabled === 'boolean') {
      setNotificationSoundEnabled(serverUserMeta.notification_sound_enabled);
      try {
        window.localStorage.setItem('tadribi_notif_sound', serverUserMeta.notification_sound_enabled ? '1' : '0');
      } catch {
        // ignore
      }
    }
  }, [serverUserMeta?.notification_sound_enabled]);

  const playNotificationChime = useCallback(() => {
    if (!notifSoundRef.current || typeof window === 'undefined') return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      if (ctx.state === 'suspended') {
        void ctx.resume().catch(() => {});
      }
      const now = ctx.currentTime;
      const playNote = (freq: number, start: number, dur: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, start);
        gain.gain.setValueAtTime(0.001, start);
        gain.gain.exponentialRampToValueAtTime(0.08, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + dur);
      };
      playNote(587.33, now, 0.14);
      playNote(880, now + 0.11, 0.22);
      window.setTimeout(() => {
        void ctx.close().catch(() => {});
      }, 600);
    } catch {
      // Ignore autoplay restriction or missing Web Audio API
    }
  }, []);

  const triggerIncomingNotification = useCallback(
    (item: NotificationItem) => {
      const key = String(item.firestoreId || item.id);
      if (seenNotifIdsRef.current.has(key)) return;
      seenNotifIdsRef.current.add(key);

      setActiveToast(item);
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
      toastTimerRef.current = window.setTimeout(() => {
        setActiveToast(null);
      }, 8000);

      playNotificationChime();

      if (
        typeof window !== 'undefined' &&
        'Notification' in window &&
        window.Notification.permission === 'granted' &&
        document.visibilityState === 'hidden'
      ) {
        try {
          const title = lang === 'ar' ? item.title_ar : item.title_fr || item.title_ar;
          const body = lang === 'ar' ? item.body_ar : item.body_fr || item.body_ar;
          new window.Notification(title, {
            body,
            icon: '/assets/images/platform-logo.webp',
          });
        } catch {
          // ignore browser notification failure
        }
      }
    },
    [lang, playNotificationChime]
  );

  // Fetch initial server notifications & subscribe to real-time SSE stream with polling fallback
  const fetchServerNotifications = useCallback(async () => {
    if (!auth.currentUser) {
      setServerNotifications([]);
      return;
    }
    try {
      const res = await apiRequest<{ notifications?: NotificationItem[] }>('/api/notifications');
      if (Array.isArray(res.notifications)) {
        setServerNotifications(res.notifications);
        for (const n of res.notifications) {
          seenNotifIdsRef.current.add(String(n.id));
        }
      }
    } catch {
      // ignore non-fatal notification poll failure
    }
  }, []);

  useEffect(() => {
    if (!authReady || !firebaseUser || !user) {
      setServerNotifications([]);
      return;
    }
    let cancelled = false;
    let es: EventSource | null = null;
    let fallbackPoll: number | null = null;
    let reconnectTimer: number | null = null;

    void fetchServerNotifications();

    const connectSse = async () => {
      try {
        const res = await apiRequest<{ ticket?: string }>('/api/notifications/stream-token', {
          method: 'POST',
          json: {},
        });
        if (cancelled || !res?.ticket) return;
        const streamUrl = resolveApiUrl(
          `/api/notifications/stream?ticket=${encodeURIComponent(res.ticket)}`
        );
        es = new EventSource(streamUrl);
        es.addEventListener('notification', (ev: MessageEvent) => {
          try {
            const payload = JSON.parse(ev.data || '{}') as NotificationItem;
            if (!payload || !payload.id) return;
            setServerNotifications((prev) => {
              if (prev.some((p) => String(p.id) === String(payload.id))) return prev;
              return [payload, ...prev];
            });
            triggerIncomingNotification(payload);
          } catch {
            // ignore malformed event
          }
        });
        es.onerror = () => {
          if (es) {
            es.close();
            es = null;
          }
          if (!cancelled && !fallbackPoll) {
            fallbackPoll = window.setInterval(() => {
              void fetchServerNotifications();
            }, 30_000);
          }
          if (!cancelled && !reconnectTimer) {
            reconnectTimer = window.setTimeout(() => {
              reconnectTimer = null;
              void connectSse();
            }, 25_000);
          }
        };
        es.onopen = () => {
          if (fallbackPoll) {
            window.clearInterval(fallbackPoll);
            fallbackPoll = null;
          }
        };
      } catch {
        if (!cancelled && !fallbackPoll) {
          fallbackPoll = window.setInterval(() => {
            void fetchServerNotifications();
          }, 30_000);
        }
      }
    };

    void connectSse();

    return () => {
      cancelled = true;
      if (es) es.close();
      if (fallbackPoll) window.clearInterval(fallbackPoll);
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
    };
  }, [authReady, firebaseUser?.uid, user?.uid, fetchServerNotifications, triggerIncomingNotification]);

  // Merge user profile + live active/expired subscription + server-verified copy permission + serverUserMeta
  const effectiveCanCopy = Boolean(
    canCopy && user && user.isAdmin && isOfficialAdminEmail(user.email) && firebaseUser?.emailVerified
  );

  const userWithSub = useMemo(() => {
    if (!user) return null;
    const mergedActive = activeSub || serverSub;
    return {
      ...user,
      role: serverUserMeta?.role || user.role,
      isAdmin: Boolean(user.isAdmin || serverUserMeta?.role === 'admin' || (serverUserMeta?.permissions && serverUserMeta.permissions.length > 0)),
      permissions: serverUserMeta?.permissions ?? user.permissions ?? [],
      email_verified: serverUserMeta?.email_verified ?? user.email_verified ?? firebaseUser?.emailVerified,
      teacher_category: serverUserMeta?.teacher_category ?? user.teacher_category ?? null,
      professor_specialty: serverUserMeta?.professor_specialty ?? user.professor_specialty ?? null,
      verified_account: serverUserMeta?.verified_account ?? user.verified_account ?? false,
      verified_badge_label: serverUserMeta?.verified_badge_label ?? user.verified_badge_label ?? null,
      followers_count: serverUserMeta?.followers_count ?? user.followers_count ?? 0,
      following_count: serverUserMeta?.following_count ?? user.following_count ?? 0,
      notification_sound_enabled:
        serverUserMeta?.notification_sound_enabled ?? user.notification_sound_enabled ?? notificationSoundEnabled,
      referral_code: serverUserMeta?.referral_code || user.referral_code,
      referral_points:
        serverUserMeta?.referral_points !== undefined
          ? serverUserMeta.referral_points
          : user.referral_points,
      phone: user.phone || serverUserMeta?.phone || '',
      last_login_at: serverUserMeta?.last_login_at || user.last_login_at || null,
      last_profile_updated_at: serverUserMeta?.last_profile_updated_at || user.last_profile_updated_at || null,
      last_password_updated_at: serverUserMeta?.last_password_updated_at || user.last_password_updated_at || null,
      last_active_at: serverUserMeta?.last_active_at || user.last_active_at || null,
      last_geo_lat: serverUserMeta?.last_geo_lat ?? user.last_geo_lat ?? null,
      last_geo_lng: serverUserMeta?.last_geo_lng ?? user.last_geo_lng ?? null,
      last_geo_label: serverUserMeta?.last_geo_label ?? user.last_geo_label ?? null,
      last_geo_is_approx: serverUserMeta?.last_geo_is_approx ?? user.last_geo_is_approx,
      last_geo_updated_at: serverUserMeta?.last_geo_updated_at ?? user.last_geo_updated_at ?? null,
      canCopy: effectiveCanCopy,
      activeSubscription: mergedActive,
      latestExpiredSubscription: mergedActive ? null : serverExpiredSub,
    };
  }, [
    user,
    firebaseUser?.emailVerified,
    serverUserMeta,
    activeSub,
    serverSub,
    serverExpiredSub,
    effectiveCanCopy,
    notificationSoundEnabled,
  ]);

  // Merge catalog lessons + real-time user progress/favorites
  const catalog = useMemo<CatalogData>(() => {
    const mergedLessons = (baseCatalog.lessons || []).map((l) => {
      const key = l.firestoreId || String(l.id);
      const p = lessonProgressMap[key] || lessonProgressMap[String(l.id)];
      return {
        ...l,
        completed: p ? p.completed : Boolean(l.completed),
        is_favorite: p ? p.isFavorite : Boolean(l.is_favorite),
      };
    });
    return {
      ...baseCatalog,
      lessons: mergedLessons,
    };
  }, [baseCatalog, lessonProgressMap]);

  const combinedNotifications = useMemo(() => {
    const map = new Map<string, NotificationItem>();
    for (const n of serverNotifications) {
      map.set(`srv-${n.id}`, n);
    }
    for (const n of notifications) {
      const k = n.firestoreId ? `fs-${n.firestoreId}` : `id-${n.id}`;
      if (!map.has(k)) map.set(k, n);
    }
    return Array.from(map.values()).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }, [notifications, serverNotifications]);

  const unreadNotificationCount = useMemo(() => {
    if (!user || combinedNotifications.length === 0) return 0;
    return combinedNotifications.filter((n) => !n.is_read).length;
  }, [combinedNotifications, user]);

  const refreshNotifications = useCallback(async () => {
    await fetchServerNotifications();
  }, [fetchServerNotifications]);

  const markNotificationsRead = useCallback(async () => {
    if (!firebaseUser) return;
    const unreadFsIds = notifications
      .filter((n) => !n.is_read && n.firestoreId)
      .map((n) => n.firestoreId as string);
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: 1 })));
    setServerNotifications((prev) => prev.map((n) => ({ ...n, is_read: 1 })));
    await Promise.all([
      unreadFsIds.length > 0 ? markNotificationsReadInFirestore(firebaseUser.uid, unreadFsIds) : Promise.resolve(),
      apiRequest('/api/notifications/read-all', { method: 'POST', json: {} }).catch(() => {}),
    ]);
  }, [firebaseUser, notifications]);

  const toggleNotificationSound = useCallback(async (next?: boolean) => {
    const nextVal = typeof next === 'boolean' ? next : !notifSoundRef.current;
    setNotificationSoundEnabled(nextVal);
    try {
      window.localStorage.setItem('tadribi_notif_sound', nextVal ? '1' : '0');
    } catch {
      // ignore
    }
    if (auth.currentUser) {
      await apiRequest('/api/auth/notification-preferences', {
        method: 'PATCH',
        json: { soundEnabled: nextVal },
      }).catch(() => {});
    }
  }, []);

  const dismissToast = useCallback(() => {
    setActiveToast(null);
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
  }, []);

  const navigate = useCallback((view: AppView, params: ViewParams = {}) => {
    speechEngine.stop();
    setCurrentView(view);
    setViewParams(params);
    setHistoryStack((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.view === view && JSON.stringify(last.params) === JSON.stringify(params)) {
        return prev;
      }
      return [...prev.slice(-24), { view, params }];
    });
    trackAnalyticsEvent({ eventType: 'page_view', pageView: view });
    if (typeof window !== 'undefined') {
      let targetPath = view === 'home' ? '/' : `/${view}`;
      if (view === 'section-view' && params.shareCode) {
        targetPath = `/sections/${encodeURIComponent(params.shareCode)}`;
      } else if (view === 'verify-receipt' && params.receiptId && params.receiptSig) {
        targetPath = `/verify-receipt?rid=${encodeURIComponent(params.receiptId)}&sig=${encodeURIComponent(params.receiptSig)}`;
      } else if (view === 'reset-password') {
        const qp = new URLSearchParams();
        if (params.resetToken) qp.set('token', params.resetToken);
        if (params.actionToken) qp.set('at', params.actionToken);
        if (params.oobCode) qp.set('oobCode', params.oobCode);
        const qs = qp.toString();
        if (qs) targetPath = `/reset-password?${qs}`;
      }
      const currentFull = `${window.location.pathname}${window.location.search}`;
      if (currentFull !== targetPath) {
        window.history.pushState({ view, params }, '', targetPath);
      } else {
        window.history.replaceState({ view, params }, '', targetPath);
      }
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const goBack = useCallback(() => {
    speechEngine.stop();
    if (typeof window !== 'undefined' && window.history.length > 1 && historyStack.length > 1) {
      window.history.back();
      return;
    }
    if (historyStack.length > 1) {
      const nextStack = historyStack.slice(0, -1);
      const target = nextStack[nextStack.length - 1] || { view: 'home' as AppView, params: {} };
      setHistoryStack(nextStack);
      setCurrentView(target.view);
      setViewParams(target.params);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    navigate('home');
  }, [historyStack, navigate]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const init = getInitialViewAndParams();
    const initPath = `${init.view === 'home' ? '/' : `/${init.view}`}${init.search}`;
    window.history.replaceState({ view: init.view, params: init.params }, '', initPath);

    const onPopState = (ev: PopStateEvent) => {
      speechEngine.stop();
      const state = ev.state as { view?: AppView; params?: ViewParams } | null;
      const nextView =
        state?.view && VALID_VIEWS.includes(state.view)
          ? state.view
          : getInitialViewFromPath();
      const nextParams = state?.params || {};
      setCurrentView(nextView);
      setViewParams(nextParams);
      setHistoryStack((prev) => (prev.length > 1 ? prev.slice(0, -1) : [{ view: nextView, params: nextParams }]));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // Mandatory profile completion guard for incomplete Google / Apple OAuth users
  useEffect(() => {
    if (!authReady || !user || user.isAdmin) return;
    const allowedWhileIncomplete: AppView[] = [
      'account-complete',
      'privacy',
      'terms',
      'about',
      'contact',
      'login',
      'register',
      'reset-password',
      'verify-receipt',
      'home',
      'mobile',
    ];
    if (user.profileCompleted === false && !allowedWhileIncomplete.includes(currentView)) {
      navigate('account-complete');
    }
  }, [authReady, user, currentView, navigate]);

  const openUpgradeModal = useCallback((featureLabel?: string) => {
    setUpgradeModal({ open: true, featureLabel });
  }, []);

  const closeUpgradeModal = useCallback(() => {
    setUpgradeModal({ open: false });
  }, []);

  const goToAuth = useCallback(
    (mode: 'login' | 'register' | 'forgot' = 'login') => {
      if (mode === 'register') {
        navigate('register');
      } else if (mode === 'forgot') {
        navigate('forgot-password');
      } else {
        navigate('login');
      }
    },
    [navigate]
  );

  const requestLogout = useCallback(() => {
    setLogoutConfirmOpen(true);
  }, []);

  const cancelLogout = useCallback(() => {
    setLogoutConfirmOpen(false);
  }, []);

  const logout = useCallback(async () => {
    speechEngine.stop();
    setLogoutConfirmOpen(false);
    try {
      await signOut(auth);
      await apiRequest('/api/auth/logout', { method: 'POST' }).catch(() => {});
    } catch {
      // ignore
    }
    setAuthToken(null);
    setUser(null);
    setServerUserMeta(null);
    setServerNotifications([]);
    setActiveToast(null);
    setActiveExam(null);
    const stayMobile =
      isPhoneDevice() ||
      (typeof window !== 'undefined' && window.location.pathname.toLowerCase() === '/mobile');
    if (!stayMobile) {
      navigate('home');
    }
  }, [navigate]);

  const confirmLogout = useCallback(async () => {
    await logout();
  }, [logout]);

  const siteConfig = catalog.siteConfig || emptySiteConfig;

  return (
    <AppContext.Provider
      value={{
        lang,
        setLang,
        theme,
        toggleTheme,
        selectedTrack,
        setSelectedTrack,
        firebaseUser,
        authReady,
        user: userWithSub,
        setUser,
        refreshUser,
        resendVerificationEmail,
        reloadVerificationStatus,
        authDisabledNotice,
        clearAuthDisabledNotice: () => setAuthDisabledNotice(null),
        catalog,
        refreshCatalog,
        plans,
        refreshPlans,
        paymentMethods,
        annualSavings,
        freeLimits,
        canCopy: effectiveCanCopy,
        siteConfig,
        notifications: combinedNotifications,
        unreadNotificationCount,
        unreadSupportCount,
        activeToast,
        dismissToast,
        notificationSoundEnabled,
        toggleNotificationSound,
        refreshNotifications,
        markNotificationsRead,
        activeExam,
        setActiveExam,
        refreshActiveExam,
        currentView,
        viewParams,
        navigate,
        canGoBack: historyStack.length > 1 || currentView !== 'home',
        goBack,
        upgradeModal,
        openUpgradeModal,
        closeUpgradeModal,
        goToAuth,
        advancedSearchOpen,
        setAdvancedSearchOpen,
        logoutConfirmOpen,
        requestLogout,
        confirmLogout,
        cancelLogout,
        logout,
        bootLoading,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
