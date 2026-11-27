import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, MailCheck, WifiOff } from 'lucide-react';
import { MobileAuthGate } from '../components/mobile/MobileAuthGate';
import { MobileBackground } from '../components/mobile/MobileBackground';
import { MobileChatsView } from '../components/mobile/MobileChatsView';
import { MobileExamsView, type MobileExamSubMode } from '../components/mobile/MobileExamsView';
import { MobileHomeView } from '../components/mobile/MobileHomeView';
import { MobileInstallCard } from '../components/mobile/MobileInstallSheet';
import { MobileLearnView, type MobileLearnSubMode } from '../components/mobile/MobileLearnView';
import { MobileMenuView, type MobileMenuSubView } from '../components/mobile/MobileMenuView';
import type { MobilePaymentMethodId } from '../components/mobile/MobilePaymentMethods';
import {
  MobileBottomNav,
  MobilePullToRefreshIndicator,
  MobileSnackbar,
  MobileTopHeader,
  type MobileTabId,
} from '../components/mobile/MobilePrimitives';
import { MobileSplash } from '../components/mobile/MobileSplash';
import { useApp } from '../context/AppContext';
import { triggerHaptic, useMobilePlatform } from '../hooks/useMobilePlatform';
import { tr } from '../utils/locale';
import '../styles/mobileMockup.css';

interface MobileNavSnapshot {
  tab: MobileTabId;
  learnSubMode: MobileLearnSubMode;
  learnSubjectSlug: string;
  activeLessonId: number | null;
  examSubMode: MobileExamSubMode;
  menuSubView: MobileMenuSubView;
}

export const MobileAppPage: React.FC = () => {
  const {
    lang,
    theme,
    user,
    firebaseUser,
    authReady,
    unreadNotificationCount,
    unreadSupportCount,
    reloadVerificationStatus,
    refreshUser,
    refreshCatalog,
  } = useApp();

  const {
    os,
    isStandalone,
    isOnline,
    installDismissed,
    canPromptAndroidInstall,
    promptNativeInstall,
    dismissInstallCard,
    updateAvailable,
    applySwUpdate,
  } = useMobilePlatform(theme === 'dark' ? 'dark' : 'light');

  const [splashVisible, setSplashVisible] = useState(true);
  const [activeTab, setActiveTab] = useState<MobileTabId>('home');
  const [learnSubMode, setLearnSubMode] = useState<MobileLearnSubMode>('lessons');
  const [learnSubjectSlug, setLearnSubjectSlug] = useState<string>('all');
  const [activeLessonId, setActiveLessonId] = useState<number | null>(null);

  const [examSubMode, setExamSubMode] = useState<MobileExamSubMode>('center');
  const [examRunning, setExamRunning] = useState(false);

  const [menuSubView, setMenuSubView] = useState<MobileMenuSubView>('root');
  const [preselectedPayMethod, setPreselectedPayMethod] = useState<MobilePaymentMethodId | undefined>(
    undefined
  );
  const [verifyCheckBusy, setVerifyCheckBusy] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Scroll container state + per-tab scroll preservation + pull-to-refresh
  const scrollPaneRef = useRef<HTMLDivElement | null>(null);
  const tabScrollRef = useRef<Record<MobileTabId, number>>({
    home: 0,
    learn: 0,
    exams: 0,
    chats: 0,
    menu: 0,
  });
  const [headerScrolled, setHeaderScrolled] = useState(false);
  const pullStartYRef = useRef<number | null>(null);
  const [pullDist, setPullDist] = useState(0);
  const [pullRefreshing, setPullRefreshing] = useState(false);

  // History popstate sync flag
  const restoringHistoryRef = useRef(false);

  const isAuthenticated = Boolean(
    authReady &&
      firebaseUser &&
      user &&
      !(user.profileCompleted === false && !user.isAdmin)
  );

  // Push browser history entries for internal mobile views so hardware Back / swipe-back navigates smoothly
  useEffect(() => {
    if (!isAuthenticated || typeof window === 'undefined') return;
    if (restoringHistoryRef.current) {
      restoringHistoryRef.current = false;
      return;
    }
    const snap: MobileNavSnapshot = {
      tab: activeTab,
      learnSubMode,
      learnSubjectSlug,
      activeLessonId,
      examSubMode,
      menuSubView,
    };
    const isRootHome = activeTab === 'home' && !activeLessonId && menuSubView === 'root';
    if (!isRootHome) {
      try {
        window.history.pushState({ tdrMobile: snap }, '', '/mobile');
      } catch {
        // ignore sandbox history limit
      }
    }
  }, [isAuthenticated, activeTab, learnSubMode, learnSubjectSlug, activeLessonId, examSubMode, menuSubView]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onPop = (ev: PopStateEvent) => {
      const snap = ev.state?.tdrMobile as MobileNavSnapshot | undefined;
      if (snap) {
        restoringHistoryRef.current = true;
        setActiveTab(snap.tab);
        setLearnSubMode(snap.learnSubMode);
        setLearnSubjectSlug(snap.learnSubjectSlug);
        setActiveLessonId(snap.activeLessonId);
        setExamSubMode(snap.examSubMode);
        setMenuSubView(snap.menuSubView);
      } else {
        restoringHistoryRef.current = true;
        setActiveLessonId(null);
        setMenuSubView('root');
        setActiveTab('home');
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const getHeaderTitle = (): string => {
    if (activeTab === 'home') return tr(lang, 'تدريبي', 'Tadreebi', 'Tadreebi');
    if (activeTab === 'learn') {
      if (activeLessonId) return tr(lang, 'الدرس', 'Leçon', 'Lesson');
      if (learnSubMode === 'summaries') return tr(lang, 'الملخصات', 'Résumés', 'Summaries');
      if (learnSubMode === 'bank') return tr(lang, 'بنك الأسئلة', 'Banque QCM', 'Question Bank');
      if (learnSubMode === 'review') return tr(lang, 'مركز المراجعة', 'Révision', 'Review Center');
      if (learnSubMode === 'favorites') return tr(lang, 'المفضلة', 'Favoris', 'Favorites');
      return tr(lang, 'الدروس', 'Leçons', 'Lessons');
    }
    if (activeTab === 'exams') {
      if (examSubMode === 'bac') return tr(lang, 'حاسبة البكالوريا', 'Baccalauréat', 'Bac GPA');
      if (examSubMode === 'history') return tr(lang, 'سجل الامتحانات', 'Historique', 'History');
      return tr(lang, 'الامتحانات', 'Examens', 'Exams');
    }
    if (activeTab === 'chats') return tr(lang, 'المحادثات', 'Discussions', 'Chats');
    switch (menuSubView) {
      case 'profile':
        return tr(lang, 'حسابي', 'Mon profil', 'My Profile');
      case 'rewards':
        return tr(lang, 'المكافآت', 'Récompenses', 'Rewards');
      case 'settings':
        return tr(lang, 'الإعدادات', 'Paramètres', 'Settings');
      case 'payment-methods':
        return tr(lang, 'طرق الدفع', 'Moyens de paiement', 'Payment Methods');
      case 'subscriptions':
        return tr(lang, 'الاشتراك', 'Abonnement', 'Subscriptions');
      case 'notifications':
        return tr(lang, 'الإشعارات', 'Notifications', 'Notifications');
      case 'payments':
        return tr(lang, 'المدفوعات', 'Paiements', 'Payments');
      case 'sessions':
        return tr(lang, 'الأجهزة النشطة', 'Sessions', 'Sessions');
      case 'feedback':
        return tr(lang, 'طلب ميزة', 'Suggestion', 'Feedback');
      default:
        return tr(lang, 'القائمة', 'Menu', 'Menu');
    }
  };

  const handleBack = () => {
    if (activeTab === 'learn' && activeLessonId) {
      setActiveLessonId(null);
      return;
    }
    if (activeTab === 'menu' && menuSubView !== 'root') {
      if (
        menuSubView === 'payments' ||
        menuSubView === 'sessions' ||
        menuSubView === 'feedback'
      ) {
        setMenuSubView('settings');
      } else {
        setMenuSubView('root');
      }
      return;
    }
    if (activeTab !== 'home') {
      handleSelectTab('home');
    }
  };

  const handleSelectTab = (tab: MobileTabId) => {
    if (scrollPaneRef.current) {
      tabScrollRef.current[activeTab] = scrollPaneRef.current.scrollTop;
    }
    setActiveTab(tab);
    if (tab === 'menu') {
      setMenuSubView('root');
    }
    if (tab !== 'learn') {
      setActiveLessonId(null);
    }
    window.requestAnimationFrame(() => {
      if (scrollPaneRef.current) {
        scrollPaneRef.current.scrollTop = tabScrollRef.current[tab] || 0;
        setHeaderScrolled((scrollPaneRef.current.scrollTop || 0) > 8);
      }
    });
  };

  const handlePullRefresh = useCallback(async () => {
    if (pullRefreshing) return;
    triggerHaptic(12);
    setPullRefreshing(true);
    try {
      await Promise.all([refreshUser(), refreshCatalog()]);
      setToastMsg(tr(lang, 'تم تحديث البيانات', 'Actualisé', 'Updated'));
      window.setTimeout(() => setToastMsg(null), 2400);
    } finally {
      setPullRefreshing(false);
      setPullDist(0);
    }
  }, [pullRefreshing, refreshUser, refreshCatalog, lang]);

  const showBack = activeTab !== 'home' || Boolean(activeLessonId);

  return (
    <div
      className={`tdr-mobile-app ${os === 'ios' ? 'tdr-os-ios' : 'tdr-os-android'}`}
      data-m-theme={theme === 'dark' ? 'dark' : 'light'}
      dir={lang === 'ar' ? 'rtl' : 'ltr'}
    >
      <MobileBackground />
      <MobileSplash visible={splashVisible} onDone={() => setSplashVisible(false)} />

      {!isAuthenticated ? (
        <MobileAuthGate />
      ) : (
        <div className="tdr-mobile-shell">
          <MobileTopHeader
            title={getHeaderTitle()}
            showBack={showBack}
            scrolled={headerScrolled}
            backLabel={tr(lang, 'رجوع', 'Retour', 'Back')}
            onBack={handleBack}
            startSlot={
              !showBack ? (
                <span className="text-base font-extrabold tdr-m-brand-display" style={{ color: 'var(--m-brand-deep)' }}>
                  تدريبي
                </span>
              ) : undefined
            }
            endSlot={
              activeTab === 'home' ? (
                <button
                  type="button"
                  aria-label="Notifications"
                  onClick={() => {
                    triggerHaptic(8);
                    setActiveTab('menu');
                    setMenuSubView('notifications');
                  }}
                  className="w-11 h-11 rounded-full flex items-center justify-center relative cursor-pointer"
                  style={{ color: 'var(--m-ink)' }}
                >
                  <Bell className="w-5 h-5" />
                  {unreadNotificationCount > 0 && (
                    <span
                      className="absolute top-2 end-2 w-2.5 h-2.5 rounded-full"
                      style={{ background: '#b80000' }}
                    />
                  )}
                </button>
              ) : undefined
            }
          />

          <div
            ref={scrollPaneRef}
            className="tdr-m-scroll-pane"
            onScroll={(e) => {
              const top = e.currentTarget.scrollTop;
              setHeaderScrolled(top > 8);
              tabScrollRef.current[activeTab] = top;
            }}
            onTouchStart={(e) => {
              if ((scrollPaneRef.current?.scrollTop || 0) <= 2) {
                pullStartYRef.current = e.touches[0]?.clientY ?? null;
              } else {
                pullStartYRef.current = null;
              }
            }}
            onTouchMove={(e) => {
              if (pullStartYRef.current === null || pullRefreshing) return;
              const dy = (e.touches[0]?.clientY ?? 0) - pullStartYRef.current;
              if (dy > 0 && (scrollPaneRef.current?.scrollTop || 0) <= 2) {
                setPullDist(Math.min(72, dy * 0.48));
              }
            }}
            onTouchEnd={() => {
              if (pullDist > 52) {
                void handlePullRefresh();
              } else {
                setPullDist(0);
              }
              pullStartYRef.current = null;
            }}
          >
            <MobilePullToRefreshIndicator pullDistance={pullDist} refreshing={pullRefreshing} />

            <main
              key={`${activeTab}-${menuSubView}-${activeLessonId ?? 'root'}`}
              className={`tdr-m-body tdr-m-screen-enter ${examRunning ? 'tdr-m-body--no-nav' : ''}`}
            >
              {!isOnline && (
                <div
                  className="tdr-m-card p-3 mb-3 flex items-center gap-2 text-xs font-extrabold border"
                  style={{
                    background: 'var(--m-errbg)',
                    borderColor: 'var(--m-errline)',
                    color: 'var(--m-err)',
                  }}
                >
                  <WifiOff className="w-4 h-4 shrink-0" />
                  <span>
                    {tr(
                      lang,
                      'أنت الآن دون اتصال بالإنترنت. بعض البيانات المباشرة متوقفة مؤقتاً.',
                      'Vous êtes hors ligne. Certaines actions nécessitent une connexion.',
                      'You are offline. Live sync paused.'
                    )}
                  </span>
                </div>
              )}

              {firebaseUser && user && !firebaseUser.emailVerified && !user.email_verified && (
                <div
                  className="tdr-m-card p-3.5 mb-4 flex items-center justify-between gap-2.5 border"
                  style={{
                    background: 'var(--m-brand-tint)',
                    borderColor: 'var(--m-brand-border)',
                  }}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <MailCheck className="w-4 h-4 shrink-0" style={{ color: 'var(--m-brand-deep)' }} />
                    <span className="text-xs font-bold truncate" style={{ color: 'var(--m-ink)' }}>
                      {tr(
                        lang,
                        'فعّل بريدك الإلكتروني لفتح كل المزايا',
                        'Vérifiez votre e-mail',
                        'Verify your email'
                      )}
                    </span>
                  </div>
                  <button
                    type="button"
                    disabled={verifyCheckBusy}
                    onClick={async () => {
                      setVerifyCheckBusy(true);
                      await reloadVerificationStatus();
                      setVerifyCheckBusy(false);
                    }}
                    className="min-h-[34px] px-3 rounded-xl text-xs font-extrabold shrink-0 cursor-pointer"
                    style={{ background: 'var(--m-brand)', color: 'var(--m-btn-ink)', border: '1px solid var(--m-brand-d)' }}
                  >
                    {verifyCheckBusy ? '...' : tr(lang, 'تحقق', 'Vérifier', 'Check')}
                  </button>
                </div>
              )}

              {activeTab === 'home' && (
                <MobileHomeView
                  installCard={
                    <MobileInstallCard
                      lang={lang}
                      os={os}
                      isStandalone={isStandalone}
                      installDismissed={installDismissed}
                      canPromptAndroidInstall={canPromptAndroidInstall}
                      onPromptAndroidInstall={promptNativeInstall}
                      onDismiss={dismissInstallCard}
                    />
                  }
                  onOpenLesson={(lessonId, subj) => {
                    if (subj) setLearnSubjectSlug(subj);
                    setLearnSubMode('lessons');
                    setActiveLessonId(lessonId);
                    setActiveTab('learn');
                  }}
                  onOpenSubject={(slug) => {
                    setLearnSubjectSlug(slug);
                    setLearnSubMode('lessons');
                    setActiveLessonId(null);
                    setActiveTab('learn');
                  }}
                  onOpenExams={() => {
                    setExamSubMode('center');
                    setActiveTab('exams');
                  }}
                  onOpenSubscriptions={() => {
                    setActiveTab('menu');
                    setMenuSubView('subscriptions');
                  }}
                  onOpenQuestionBank={() => {
                    setLearnSubMode('bank');
                    setActiveLessonId(null);
                    setActiveTab('learn');
                  }}
                  onOpenReviewCenter={() => {
                    setLearnSubMode('review');
                    setActiveLessonId(null);
                    setActiveTab('learn');
                  }}
                />
              )}

              {activeTab === 'learn' && (
                <MobileLearnView
                  subMode={learnSubMode}
                  onChangeSubMode={(m) => {
                    setLearnSubMode(m);
                    setActiveLessonId(null);
                  }}
                  subjectSlug={learnSubjectSlug}
                  onChangeSubjectSlug={setLearnSubjectSlug}
                  activeLessonId={activeLessonId}
                  onSelectLesson={setActiveLessonId}
                  onOpenSubscriptions={() => {
                    setActiveTab('menu');
                    setMenuSubView('subscriptions');
                  }}
                />
              )}

              {activeTab === 'exams' && (
                <MobileExamsView
                  subMode={examSubMode}
                  onChangeSubMode={setExamSubMode}
                  onOpenSubscriptions={() => {
                    setActiveTab('menu');
                    setMenuSubView('subscriptions');
                  }}
                  onOpenBacSeriesLessons={(seriesSlug) => {
                    setLearnSubjectSlug(seriesSlug);
                    setLearnSubMode('lessons');
                    setActiveLessonId(null);
                    setActiveTab('learn');
                  }}
                  onExamRunningChange={setExamRunning}
                />
              )}

              {activeTab === 'chats' && <MobileChatsView />}

              {activeTab === 'menu' && (
                <MobileMenuView
                  subView={menuSubView}
                  onChangeSubView={setMenuSubView}
                  preselectedPayMethod={preselectedPayMethod}
                  onSelectPayMethodForSub={setPreselectedPayMethod}
                  onJumpToQuestionBank={() => {
                    setLearnSubMode('bank');
                    setActiveLessonId(null);
                    setActiveTab('learn');
                  }}
                  onJumpToReviewCenter={() => {
                    setLearnSubMode('review');
                    setActiveLessonId(null);
                    setActiveTab('learn');
                  }}
                  onJumpToBaccalaureate={() => {
                    setExamSubMode('bac');
                    setActiveTab('exams');
                  }}
                  onNotice={(txt) => {
                    setToastMsg(txt);
                    window.setTimeout(() => setToastMsg(null), 3000);
                  }}
                />
              )}
            </main>
          </div>

          {!examRunning && (
            <MobileBottomNav
              activeTab={activeTab}
              onSelect={handleSelectTab}
              unreadChats={unreadSupportCount}
              unreadMenu={unreadNotificationCount}
              labels={{
                home: tr(lang, 'الرئيسية', 'Accueil', 'Home'),
                learn: tr(lang, 'الدروس', 'Leçons', 'Lessons'),
                exams: tr(lang, 'الامتحانات', 'Examens', 'Exams'),
                chats: tr(lang, 'المحادثات', 'Chats', 'Chats'),
                menu: tr(lang, 'القائمة', 'Menu', 'Menu'),
              }}
            />
          )}
        </div>
      )}

      {updateAvailable && (
        <MobileSnackbar
          message={tr(lang, 'يتوفر تحديث جديد لتطبيق تدريبي.', 'Nouvelle version disponible.', 'Update available.')}
          actionLabel={tr(lang, 'تحديث الآن', 'Mettre à jour', 'Update')}
          onAction={applySwUpdate}
        />
      )}

      {!updateAvailable && toastMsg && (
        <MobileSnackbar message={toastMsg} onDismiss={() => setToastMsg(null)} />
      )}
    </div>
  );
};
