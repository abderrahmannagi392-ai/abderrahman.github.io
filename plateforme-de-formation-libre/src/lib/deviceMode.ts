// Decides which experience to show:
//  - the mobile app (MobileAppPage) on phones and inside the native Capacitor shell;
//  - the public website and the desktop platform (Layout / AppShell) on computers and tablets.
//
// A phone that opens the root URL therefore gets the mobile app directly,
// instead of the desktop website.

const DESKTOP_OVERRIDE_KEY = 'tadribi_force_desktop';

type CapacitorGlobal = { isNativePlatform?: () => boolean };

/** True inside the native Android/iOS app (Capacitor WebView). */
export const isNativeApp = (): boolean => {
  if (typeof window === 'undefined') return false;
  const cap = (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
  try {
    return Boolean(cap?.isNativePlatform?.());
  } catch {
    return false;
  }
};

/**
 * Lets a phone user force the desktop website with ?desktop=1 (and go back with ?desktop=0).
 * The choice is kept for the browser session.
 */
const readDesktopOverride = (): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    const param = new URLSearchParams(window.location.search).get('desktop');
    if (param === '1') window.sessionStorage.setItem(DESKTOP_OVERRIDE_KEY, '1');
    if (param === '0') window.sessionStorage.removeItem(DESKTOP_OVERRIDE_KEY);
    return window.sessionStorage.getItem(DESKTOP_OVERRIDE_KEY) === '1';
  } catch {
    return false;
  }
};

/** True on a phone (Android / iPhone / iPod) or inside the native app. */
export const isPhoneDevice = (): boolean => {
  if (typeof window === 'undefined') return false;
  if (isNativeApp()) return true;
  if (readDesktopOverride()) return false;
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
  return /Android.+Mobile|iPhone|iPod|Windows Phone|IEMobile|BlackBerry|Opera Mini/i.test(ua);
};
