import { useCallback, useEffect, useRef, useState } from 'react';
import { isNativeApp } from '../lib/deviceMode';

export type MobileOs = 'ios' | 'android';

export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt: () => Promise<void>;
}

const INSTALL_DISMISS_KEY = 'tdr_m_install_dismissed_v1';

function detectMobileOs(): MobileOs {
  if (typeof navigator === 'undefined') return 'android';
  const ua = navigator.userAgent || '';
  const isAppleTouch =
    /iPad|iPhone|iPod/i.test(ua) ||
    (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1);
  return isAppleTouch ? 'ios' : 'android';
}

function detectStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const mq = window.matchMedia?.('(display-mode: standalone)')?.matches;
  const iosStandalone = Boolean((window.navigator as unknown as { standalone?: boolean }).standalone);
  return Boolean(mq || iosStandalone);
}

export function triggerHaptic(pattern: number | number[] = 10): void {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(pattern);
    }
  } catch {
    // ignore unsupported vibration API
  }
}

export function useMobilePlatform(theme: 'light' | 'dark') {
  const [os] = useState<MobileOs>(() => detectMobileOs());
  const [isStandalone, setIsStandalone] = useState<boolean>(() => detectStandalone());
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installDismissed, setInstallDismissed] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem(INSTALL_DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [updateWaiting, setUpdateWaiting] = useState<ServiceWorker | null>(null);
  const reloadingRef = useRef(false);

  // Sync dynamic theme-color meta tag matching official light/dark palette
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const color = theme === 'dark' ? '#10150d' : '#a4cc39';
    let meta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null;
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'theme-color';
      document.head.appendChild(meta);
    }
    meta.content = color;

    const statusMeta = document.querySelector(
      'meta[name="apple-mobile-web-app-status-bar-style"]'
    ) as HTMLMetaElement | null;
    if (statusMeta) {
      statusMeta.content = theme === 'dark' ? 'black-translucent' : 'default';
    }
  }, [theme]);

  // Listen to standalone mode, online/offline status, and Android beforeinstallprompt
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    const mq = window.matchMedia?.('(display-mode: standalone)');
    const onMqChange = () => setIsStandalone(detectStandalone());
    mq?.addEventListener?.('change', onMqChange);

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    const onAppInstalled = () => {
      setDeferredPrompt(null);
      setIsStandalone(true);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onAppInstalled);

    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      mq?.removeEventListener?.('change', onMqChange);
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  // Register Service Worker strictly scoped to /mobile (the native app bundles its own files)
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    if (isNativeApp()) return;
    let active = true;

    navigator.serviceWorker
      .register('/sw.js', { scope: '/mobile' })
      .then((reg) => {
        if (!active) return;
        if (reg.waiting) {
          setUpdateWaiting(reg.waiting);
        }
        reg.addEventListener('updatefound', () => {
          const worker = reg.installing;
          if (!worker) return;
          worker.addEventListener('statechange', () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) {
              setUpdateWaiting(worker);
            }
          });
        });
      })
      .catch(() => {
        // SW registration skipped if environment blocks /sw.js
      });

    const onControllerChange = () => {
      if (reloadingRef.current) return;
      reloadingRef.current = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    return () => {
      active = false;
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
    };
  }, []);

  // Ensure focused inputs smoothly scroll into visible viewport when virtual keyboard opens
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target || !target.closest('.tdr-mobile-app')) return;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') {
        window.setTimeout(() => {
          target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 260);
      }
    };
    document.addEventListener('focusin', onFocusIn);
    return () => document.removeEventListener('focusin', onFocusIn);
  }, []);

  const promptNativeInstall = useCallback(async (): Promise<'accepted' | 'dismissed' | 'unavailable'> => {
    if (!deferredPrompt) return 'unavailable';
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        setDeferredPrompt(null);
      }
      return choice.outcome;
    } catch {
      return 'dismissed';
    }
  }, [deferredPrompt]);

  const dismissInstallCard = useCallback(() => {
    setInstallDismissed(true);
    try {
      window.localStorage.setItem(INSTALL_DISMISS_KEY, '1');
    } catch {
      // ignore
    }
  }, []);

  const applySwUpdate = useCallback(() => {
    if (!updateWaiting) return;
    updateWaiting.postMessage({ type: 'SKIP_WAITING' });
  }, [updateWaiting]);

  return {
    os,
    isStandalone,
    isOnline,
    canPromptAndroidInstall: Boolean(deferredPrompt),
    installDismissed,
    updateAvailable: Boolean(updateWaiting),
    promptNativeInstall,
    dismissInstallCard,
    applySwUpdate,
  };
}
