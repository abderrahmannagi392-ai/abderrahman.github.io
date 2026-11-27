import { auth } from '../lib/firebase';

const PRODUCTION_API_BASE_URL = 'https://api.tadribi.chtbqi.com';
const RAW_ENV_API_BASE = (import.meta.env.VITE_API_BASE_URL || '').trim();
export const API_BASE_URL = (
  RAW_ENV_API_BASE || (import.meta.env.PROD ? PRODUCTION_API_BASE_URL : '')
).replace(/\/+$/, '');

export function resolveApiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return API_BASE_URL ? `${API_BASE_URL}${normalizedPath}` : normalizedPath;
}

let inMemoryToken: string | null = null;
const DEVICE_SESSION_KEY = 'tadribi_device_id';

export function getDeviceSessionId(): string {
  if (typeof window === 'undefined') return '';
  try {
    let existing = window.localStorage.getItem(DEVICE_SESSION_KEY);
    if (!existing || existing.length < 8) {
      const rand =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `td-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
      existing = rand;
      window.localStorage.setItem(DEVICE_SESSION_KEY, existing);
    }
    return existing;
  } catch {
    return '';
  }
}

export function setAuthToken(token: string | null) {
  inMemoryToken = token;
}

export function getAuthToken(): string | null {
  return inMemoryToken;
}

export class ApiError extends Error {
  status: number;
  data: any;

  constructor(message: string, status: number, data?: any) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

export interface ApiRequestOptions extends RequestInit {
  json?: unknown;
  timeoutMs?: number;
}

async function resolveBearerToken(): Promise<string | null> {
  let bearer = inMemoryToken;
  if (auth.currentUser) {
    try {
      bearer = await auth.currentUser.getIdToken();
    } catch {
      // ignore if token fetch temporarily unavailable
    }
  }
  return bearer;
}

export async function apiRequest<T = any>(
  path: string,
  options: ApiRequestOptions = {}
): Promise<T> {
  const { json, headers: customHeaders, timeoutMs = 30000, signal: externalSignal, ...rest } = options;
  const headers = new Headers(customHeaders || {});

  headers.set('X-Requested-With', 'XMLHttpRequest');
  const devSid = getDeviceSessionId();
  if (devSid) {
    headers.set('X-Device-Session-Id', devSid);
  }
  if (json !== undefined) {
    headers.set('Content-Type', 'application/json');
  } else if (typeof rest.body === 'string' && !headers.has('Content-Type')) {
    const trimmedBody = rest.body.trim();
    if (trimmedBody.startsWith('{') || trimmedBody.startsWith('[')) {
      headers.set('Content-Type', 'application/json');
    }
  }

  const bearer = await resolveBearerToken();
  if (bearer) {
    headers.set('Authorization', `Bearer ${bearer}`);
  }

  const controller = new AbortController();
  const onExternalAbort = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }
  }
  const timer =
    timeoutMs > 0
      ? window.setTimeout(() => {
          controller.abort();
        }, timeoutMs)
      : null;

  let response: Response;
  try {
    response = await fetch(resolveApiUrl(path), {
      ...rest,
      headers,
      signal: controller.signal,
      credentials: 'include',
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    });
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new ApiError('Request timed out or was cancelled.', 408, { timeout: true });
    }
    throw err;
  } finally {
    if (timer !== null) window.clearTimeout(timer);
    if (externalSignal) externalSignal.removeEventListener('abort', onExternalAbort);
  }

  const text = await response.text();
  let parsed: any = null;
  let jsonParseFailed = false;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      jsonParseFailed = true;
      parsed = { raw: text };
    }
  }

  if (!response.ok) {
    if (
      response.status === 401 &&
      (parsed?.code === 'SESSION_REVOKED' || parsed?.code === 'SESSION_EXPIRED') &&
      typeof window !== 'undefined'
    ) {
      window.dispatchEvent(
        new CustomEvent('tadribi-session-revoked', {
          detail: {
            code: parsed.code,
            message: parsed?.error || '',
          },
        })
      );
    }
    const message = parsed?.error || parsed?.message || `HTTP ${response.status}`;
    throw new ApiError(message, response.status, parsed);
  }

  if (jsonParseFailed) {
    throw new ApiError('Unexpected non-JSON response from API.', 502, {
      nonJson: true,
      contentType: response.headers.get('content-type') || '',
    });
  }

  return parsed as T;
}

export async function uploadJsonWithProgress<T = any>(
  path: string,
  payload: unknown,
  options: {
    onProgress?: (percent: number) => void;
    timeoutMs?: number;
    signal?: AbortSignal;
  } = {}
): Promise<T> {
  const { onProgress, timeoutMs = 30000, signal } = options;
  const bearer = await resolveBearerToken();
  const devSid = getDeviceSessionId();

  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', resolveApiUrl(path), true);
    xhr.withCredentials = true;
    xhr.timeout = timeoutMs;
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
    if (devSid) {
      xhr.setRequestHeader('X-Device-Session-Id', devSid);
    }
    if (bearer) {
      xhr.setRequestHeader('Authorization', `Bearer ${bearer}`);
    }

    const cleanup = () => {
      if (signal) signal.removeEventListener('abort', handleAbort);
    };

    const handleAbort = () => {
      xhr.abort();
      cleanup();
      reject(new ApiError('Upload cancelled.', 499, { aborted: true }));
    };

    if (signal) {
      if (signal.aborted) {
        handleAbort();
        return;
      }
      signal.addEventListener('abort', handleAbort, { once: true });
    }

    xhr.upload.onprogress = (evt) => {
      if (!onProgress) return;
      if (evt.lengthComputable && evt.total > 0) {
        const pct = Math.min(100, Math.max(0, Math.round((evt.loaded / evt.total) * 100)));
        onProgress(pct);
      } else {
        onProgress(50);
      }
    };

    xhr.onload = () => {
      cleanup();
      let parsed: any = null;
      if (xhr.responseText) {
        try {
          parsed = JSON.parse(xhr.responseText);
        } catch {
          parsed = { raw: xhr.responseText };
        }
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(100);
        resolve(parsed as T);
      } else {
        const message = parsed?.error || parsed?.message || `HTTP ${xhr.status}`;
        reject(new ApiError(message, xhr.status || 500, parsed));
      }
    };

    xhr.onerror = () => {
      cleanup();
      reject(new ApiError('Network error during upload.', 0, { network: true }));
    };

    xhr.ontimeout = () => {
      cleanup();
      reject(new ApiError('Upload timed out.', 408, { timeout: true }));
    };

    xhr.send(JSON.stringify(payload));
  });
}

