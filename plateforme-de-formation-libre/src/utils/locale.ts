import type { Language } from '../types';
import { resolveApiUrl } from './api';

export function tr(lang: Language, ar: string, fr: string, en?: string): string {
  if (lang === 'ar') return ar;
  if (lang === 'fr') return fr;
  return en ?? fr;
}

export function localeCode(lang: Language): string {
  if (lang === 'ar') return 'ar-MR';
  if (lang === 'fr') return 'fr-FR';
  return 'en-US';
}

const SESSION_KEY = 'fl_analytics_sid';

export function getAnalyticsSessionId(): string {
  if (typeof window === 'undefined') return 'ssr';
  try {
    let sid = window.sessionStorage.getItem(SESSION_KEY);
    if (!sid) {
      sid = `sid_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      window.sessionStorage.setItem(SESSION_KEY, sid);
    }
    return sid;
  } catch {
    return 'anon';
  }
}

export type AnalyticsEventType =
  | 'site_visit'
  | 'page_view'
  | 'site_click'
  | 'video_view'
  | 'video_click'
  | 'video_play'
  | 'video_pause'
  | 'video_resume'
  | 'video_unmute'
  | 'video_progress'
  | 'video_complete';

export function trackAnalyticsEvent(payload: {
  eventType: AnalyticsEventType;
  pageView?: string;
  target?: string;
  mediaId?: string;
  positionSeconds?: number;
  durationSeconds?: number;
  maxPercent?: number;
  metadata?: Record<string, unknown>;
}): void {
  if (typeof window === 'undefined') return;
  try {
    const body = JSON.stringify({
      ...payload,
      sessionId: getAnalyticsSessionId(),
    });
    void fetch(resolveApiUrl('/api/analytics/event'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // non-blocking analytics
  }
}
