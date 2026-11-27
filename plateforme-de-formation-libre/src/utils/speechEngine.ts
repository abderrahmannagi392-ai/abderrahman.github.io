import type { BackendVoiceProfile, Language } from '../types';
import { auth } from '../lib/firebase';
import { resolveApiUrl } from './api';

export type SpeechStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'unsupported' | 'error';
export type BackendVoiceId = 'voice1' | 'voice2' | 'voice3';

const VOICE_STORAGE_KEY = 'fl_tts_voice';
const ELEVENLABS_PREF_KEY = 'fl_tts_elevenlabs';

const DEFAULT_BACKEND_VOICES: BackendVoiceProfile[] = [
  {
    id: 'voice1',
    label_ar: 'الأستاذ الوقور (نبرة عميقة)',
    label_fr: 'Voix Professeur (grave et posée)',
    description_ar: 'صوت تعليمي رصين بدرجة منخفضة وتشكيل نطقي متزن',
    description_fr: 'Timbre profond et posé avec articulation nette',
  },
  {
    id: 'voice2',
    label_ar: 'القارئ القياسي (نبرة متوازنة)',
    label_fr: 'Voix Standard (équilibrée)',
    description_ar: 'النطق القياسي الواضح والمعتدل للأسئلة والدروس',
    description_fr: 'Voix naturelle claire et équilibrée',
  },
  {
    id: 'voice3',
    label_ar: 'المُحاور المشرق (نبرة حيوية)',
    label_fr: 'Voix Claire (dynamique)',
    description_ar: 'صوت مشرق وحيوي بدرجة مرتفعة قليلاً للمراجعة السريعة',
    description_fr: 'Timbre clair et dynamique idéal pour la révision',
  },
];

export interface SpeechState {
  status: SpeechStatus;
  activeId: string | null;
  rate: number;
  volume: number;
  selectedVoiceId: BackendVoiceId;
  backendVoices: BackendVoiceProfile[];
  selectedVoiceURI: string | null;
  voices: SpeechSynthesisVoice[];
  errorMessage: string | null;
  chunkIndex: number;
  chunkTotal: number;
  elevenLabsPermitted: boolean;
  elevenLabsEnabled: boolean;
  useElevenLabs: boolean;
}

type Listener = (state: SpeechState) => void;

/**
 * Splits long explanations into clean sentences (<= 160 chars) so both
 * HTML5 /api/tts MP3 chunks and Web Speech utterances play smoothly with
 * zero truncation or browser timeout drops.
 */
function chunkSpeechText(raw: string): string[] {
  const normalized = raw.replace(/\s+/g, ' ').trim();
  if (!normalized) return [];

  const sentences = normalized.split(/(?<=[.!?؟؛\n])\s+/);
  const chunks: string[] = [];
  let buffer = '';

  const pushOversizedWords = (segment: string) => {
    const words = segment.split(/\s+/);
    let current = '';
    for (const w of words) {
      if ((current + ' ' + w).trim().length > 160) {
        if (current) chunks.push(current.trim());
        current = w;
      } else {
        current = current ? `${current} ${w}` : w;
      }
    }
    if (current.trim()) chunks.push(current.trim());
  };

  for (const s of sentences) {
    const trimmed = s.trim();
    if (!trimmed) continue;

    if (trimmed.length > 160) {
      if (buffer) {
        chunks.push(buffer);
        buffer = '';
      }
      const parts = trimmed.split(/(?<=[,،:])\s+/);
      let sub = '';
      for (const p of parts) {
        if (p.length > 160) {
          if (sub.trim()) {
            chunks.push(sub.trim());
            sub = '';
          }
          pushOversizedWords(p);
        } else if ((sub + ' ' + p).trim().length > 160) {
          if (sub.trim()) chunks.push(sub.trim());
          sub = p;
        } else {
          sub = sub ? `${sub} ${p}` : p;
        }
      }
      if (sub.trim()) chunks.push(sub.trim());
      continue;
    }

    if ((buffer + ' ' + trimmed).trim().length > 160) {
      if (buffer) chunks.push(buffer);
      buffer = trimmed;
    } else {
      buffer = buffer ? `${buffer} ${trimmed}` : trimmed;
    }
  }
  if (buffer) chunks.push(buffer);
  return chunks.length > 0 ? chunks : [normalized.slice(0, 160)];
}

function buildTtsUrl(text: string, lang: Language, voiceId: BackendVoiceId): string {
  return resolveApiUrl(
    `/api/tts?lang=${encodeURIComponent(lang)}&voice=${encodeURIComponent(voiceId)}&text=${encodeURIComponent(text)}`
  );
}

function readStoredVoiceId(): BackendVoiceId {
  try {
    const raw = window.localStorage.getItem(VOICE_STORAGE_KEY);
    if (raw === 'voice1' || raw === 'voice2' || raw === 'voice3') return raw;
  } catch {
    // ignore storage restriction
  }
  return 'voice2';
}

class BilingualSpeechEngine {
  private listeners = new Set<Listener>();
  private generation = 0;
  private lastText = '';
  private lastLang: Language = 'ar';
  private chunks: string[] = [];
  private currentIndex = 0;
  private audio: HTMLAudioElement | null = null;
  private mode: 'audio' | 'speech' = 'audio';
  private keepAliveTimer: number | null = null;
  private blobUrlToRevoke: string | null = null;
  private state: SpeechState = {
    status: 'idle',
    activeId: null,
    rate: 1.0,
    volume: 1.0,
    selectedVoiceId: typeof window !== 'undefined' ? readStoredVoiceId() : 'voice2',
    backendVoices: DEFAULT_BACKEND_VOICES,
    selectedVoiceURI: null,
    voices: [],
    errorMessage: null,
    chunkIndex: 0,
    chunkTotal: 0,
    elevenLabsPermitted: false,
    elevenLabsEnabled: false,
    useElevenLabs: typeof window !== 'undefined' ? window.localStorage.getItem(ELEVENLABS_PREF_KEY) !== '0' : true,
  };

  constructor() {
    if (typeof window !== 'undefined') {
      this.audio = new Audio();
      this.audio.preload = 'auto';

      fetch(resolveApiUrl('/api/audio/voices'))
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (Array.isArray(data?.voices) && data.voices.length > 0) {
            this.state.backendVoices = data.voices;
            this.emit();
          }
        })
        .catch(() => {
          // keep defaults silently
        });

      void this.refreshElevenLabsStatus();

      if ('speechSynthesis' in window) {
        this.refreshVoices();
        window.speechSynthesis.onvoiceschanged = () => {
          this.refreshVoices();
        };
      }
    }
  }

  async refreshElevenLabsStatus() {
    if (typeof window === 'undefined') return;
    try {
      const headers: Record<string, string> = {};
      if (auth.currentUser) {
        const token = await auth.currentUser.getIdToken().catch(() => null);
        if (token) headers.Authorization = `Bearer ${token}`;
      }
      const resp = await fetch(resolveApiUrl('/api/audio/elevenlabs/status'), { headers });
      if (!resp.ok) return;
      const data = await resp.json();
      this.state.elevenLabsEnabled = Boolean(data?.enabled && data?.configured);
      this.state.elevenLabsPermitted = Boolean(data?.tierPermitted);
      this.emit();
    } catch {
      // ignore cleanly
    }
  }

  setUseElevenLabs(enabled: boolean) {
    this.state.useElevenLabs = enabled;
    try {
      window.localStorage.setItem(ELEVENLABS_PREF_KEY, enabled ? '1' : '0');
    } catch {
      // ignore
    }
    this.emit();
  }

  private clearKeepAlive() {
    if (this.keepAliveTimer !== null && typeof window !== 'undefined') {
      window.clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
  }

  private emit() {
    const snapshot = { ...this.state };
    this.listeners.forEach((fn) => fn(snapshot));
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn({ ...this.state });
    return () => {
      this.listeners.delete(fn);
    };
  }

  getState(): SpeechState {
    return { ...this.state };
  }

  refreshVoices() {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const allVoices = window.speechSynthesis.getVoices();
    this.state.voices = allVoices;
    this.emit();
  }

  getVoicesForLanguage(lang: Language): SpeechSynthesisVoice[] {
    const prefix = lang === 'ar' ? 'ar' : lang === 'en' ? 'en' : 'fr';
    return this.state.voices.filter((v) => v.lang.toLowerCase().startsWith(prefix));
  }

  setRate(rate: number) {
    this.state.rate = rate;
    if (this.audio) {
      this.audio.playbackRate = rate;
    }
    this.emit();
    if (this.mode === 'speech' && this.state.status === 'playing' && this.lastText && this.state.activeId) {
      this.speakViaWebSpeech(this.lastLang, this.state.activeId, this.currentIndex);
    }
  }

  setVolume(volume: number) {
    const clamped = Math.max(0, Math.min(1, volume));
    this.state.volume = clamped;
    if (this.audio) {
      this.audio.volume = clamped;
    }
    this.emit();
  }

  setVoiceURI(voiceURI: string | null) {
    this.state.selectedVoiceURI = voiceURI;
    this.emit();
  }

  setBackendVoice(voiceId: BackendVoiceId) {
    if (voiceId !== 'voice1' && voiceId !== 'voice2' && voiceId !== 'voice3') return;
    this.state.selectedVoiceId = voiceId;
    try {
      window.localStorage.setItem(VOICE_STORAGE_KEY, voiceId);
    } catch {
      // ignore storage error
    }
    this.emit();
    if (this.state.status === 'playing' && this.lastText && this.state.activeId) {
      if (this.mode === 'audio') {
        this.playAudioChunk(this.lastLang, this.state.activeId, this.currentIndex, this.generation);
      } else {
        this.speakViaWebSpeech(this.lastLang, this.state.activeId, this.currentIndex);
      }
    }
  }

  private resetPlaybackHardware() {
    this.clearKeepAlive();
    if (this.blobUrlToRevoke) {
      try {
        URL.revokeObjectURL(this.blobUrlToRevoke);
      } catch {
        // ignore
      }
      this.blobUrlToRevoke = null;
    }
    if (this.audio) {
      this.audio.onplaying = null;
      this.audio.onended = null;
      this.audio.onerror = null;
      try {
        this.audio.pause();
        this.audio.removeAttribute('src');
        this.audio.load();
      } catch {
        // ignore audio reset issues
      }
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
          window.speechSynthesis.cancel();
        }
      } catch {
        // ignore cancellation errors
      }
    }
  }

  stop() {
    this.generation += 1;
    this.chunks = [];
    this.currentIndex = 0;
    this.resetPlaybackHardware();
    this.state.status = 'idle';
    this.state.activeId = null;
    this.state.errorMessage = null;
    this.state.chunkIndex = 0;
    this.state.chunkTotal = 0;
    this.emit();
  }

  pause() {
    if (this.state.status !== 'playing') return;
    if (this.mode === 'audio' && this.audio) {
      this.audio.pause();
      this.state.status = 'paused';
      this.emit();
      return;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.pause();
        this.state.status = 'paused';
        this.emit();
      } catch {
        this.stop();
      }
    }
  }

  resume() {
    if (this.state.status !== 'paused') return;
    if (this.mode === 'audio' && this.audio) {
      this.audio
        .play()
        .then(() => {
          this.state.status = 'playing';
          this.emit();
        })
        .catch(() => {
          if (this.lastText && this.state.activeId) {
            this.playAudioChunk(this.lastLang, this.state.activeId, this.currentIndex, this.generation);
          }
        });
      return;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.resume();
        this.state.status = 'playing';
        this.emit();
      } catch {
        if (this.lastText && this.state.activeId) {
          this.speakViaWebSpeech(this.lastLang, this.state.activeId, this.currentIndex);
        }
      }
    }
  }

  replay() {
    if (this.lastText && this.state.activeId) {
      this.speak(this.lastText, this.lastLang, this.state.activeId);
    }
  }

  speak(text: string, lang: Language, activeId: string) {
    if (typeof window === 'undefined') return;
    const clean = text.trim();
    if (!clean) return;

    this.generation += 1;
    const currentGen = this.generation;
    this.resetPlaybackHardware();

    this.lastText = clean;
    this.lastLang = lang;
    this.chunks = chunkSpeechText(clean);
    this.currentIndex = 0;
    this.mode = this.audio ? 'audio' : 'speech';

    this.state.activeId = activeId;
    this.state.errorMessage = null;
    this.state.chunkIndex = 1;
    this.state.chunkTotal = this.chunks.length;

    if (this.audio) {
      this.state.status = 'loading';
      this.emit();
      this.playAudioChunk(lang, activeId, 0, currentGen);
    } else {
      this.speakViaWebSpeech(lang, activeId, 0);
    }
  }

  private prefetchChunk(lang: Language, idx: number) {
    if (idx < this.chunks.length && typeof window !== 'undefined') {
      const url = buildTtsUrl(this.chunks[idx], lang, this.state.selectedVoiceId);
      fetch(url).catch(() => {
        // Ignore silent prefetch errors
      });
    }
  }

  private async tryFetchElevenLabsChunkUrl(text: string, lang: Language): Promise<string | null> {
    if (!this.state.elevenLabsEnabled || !this.state.elevenLabsPermitted || !this.state.useElevenLabs) {
      return null;
    }
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (auth.currentUser) {
        const token = await auth.currentUser.getIdToken().catch(() => null);
        if (token) headers.Authorization = `Bearer ${token}`;
      }
      const resp = await fetch(resolveApiUrl('/api/tts/elevenlabs'), {
        method: 'POST',
        headers,
        body: JSON.stringify({ text, lang }),
      });
      if (!resp.ok) return null;
      const blob = await resp.blob();
      if (blob.size < 128) return null;
      return URL.createObjectURL(blob);
    } catch {
      return null;
    }
  }

  private playAudioChunk(lang: Language, activeId: string, idx: number, currentGen: number) {
    if (this.generation !== currentGen || !this.audio) return;

    if (idx >= this.chunks.length) {
      this.state.status = 'idle';
      this.state.activeId = null;
      this.state.chunkIndex = 0;
      this.state.chunkTotal = 0;
      this.emit();
      return;
    }

    this.mode = 'audio';
    this.currentIndex = idx;
    this.state.chunkIndex = idx + 1;
    this.emit();

    const startChunkPlayback = async () => {
      if (this.generation !== currentGen || !this.audio) return;
      const elBlobUrl = await this.tryFetchElevenLabsChunkUrl(this.chunks[idx], lang);
      if (this.generation !== currentGen || !this.audio) {
        if (elBlobUrl) URL.revokeObjectURL(elBlobUrl);
        return;
      }

      if (this.blobUrlToRevoke) {
        URL.revokeObjectURL(this.blobUrlToRevoke);
        this.blobUrlToRevoke = null;
      }
      if (elBlobUrl) {
        this.blobUrlToRevoke = elBlobUrl;
      }

      const audio = this.audio;
      audio.volume = this.state.volume;
      audio.playbackRate = this.state.rate;
      audio.src = elBlobUrl || buildTtsUrl(this.chunks[idx], lang, this.state.selectedVoiceId);

      audio.onplaying = () => {
        if (this.generation !== currentGen) return;
        this.state.status = 'playing';
        this.state.errorMessage = null;
        this.emit();
        if (!elBlobUrl) {
          this.prefetchChunk(lang, idx + 1);
        }
      };

      audio.onended = () => {
        if (this.generation !== currentGen) return;
        this.playAudioChunk(lang, activeId, idx + 1, currentGen);
      };

      audio.onerror = () => {
        if (this.generation !== currentGen) return;
        if (elBlobUrl) {
          // Retry same chunk with standard /api/tts before falling back to Web Speech
          URL.revokeObjectURL(elBlobUrl);
          this.blobUrlToRevoke = null;
          audio.src = buildTtsUrl(this.chunks[idx], lang, this.state.selectedVoiceId);
          void audio.play().catch(() => this.fallbackToWebSpeech(lang, activeId, idx));
          return;
        }
        this.fallbackToWebSpeech(lang, activeId, idx);
      };

      const playPromise = audio.play();
      if (playPromise && typeof playPromise.then === 'function') {
        playPromise.catch((err) => {
          if (this.generation !== currentGen) return;
          if (err && err.name === 'AbortError') return;
          this.fallbackToWebSpeech(lang, activeId, idx);
        });
      }
    };

    void startChunkPlayback();
  }

  private fallbackToWebSpeech(lang: Language, activeId: string, startChunk: number) {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      this.speakViaWebSpeech(lang, activeId, startChunk);
      return;
    }
    this.state.status = 'error';
    this.state.errorMessage =
      lang === 'ar'
        ? 'تعذر تشغيل الصوت في هذا المتصفح حالياً. تأكد من الاتصال بالإنترنت وأعد المحاولة.'
        : lang === 'en'
          ? 'Unable to play audio in this browser right now. Check your connection and try again.'
          : "Impossible de lire l'audio sur ce navigateur. Vérifiez votre connexion et réessayez.";
    this.emit();
  }

  private speakViaWebSpeech(lang: Language, activeId: string, startChunk: number) {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      this.state.status = 'unsupported';
      this.state.errorMessage =
        lang === 'ar'
          ? 'المتصفح الحالي لا يدعم القراءة الصوتية.'
          : lang === 'en'
            ? 'Speech synthesis is not supported by this browser.'
            : 'Votre navigateur ne prend pas en charge la synthèse vocale.';
      this.emit();
      return;
    }

    this.mode = 'speech';
    const currentGen = this.generation;
    this.currentIndex = Math.max(0, Math.min(startChunk, this.chunks.length - 1));

    try {
      if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
        window.speechSynthesis.cancel();
      }
    } catch {
      // ignore
    }

    const allVoices = window.speechSynthesis.getVoices();
    if (allVoices.length > 0 && this.state.voices.length === 0) {
      this.state.voices = allVoices;
    }

    const matchingVoices = this.getVoicesForLanguage(lang);
    const chosenVoice =
      matchingVoices.find((v) => v.voiceURI === this.state.selectedVoiceURI) ||
      matchingVoices[0] ||
      null;

    this.state.activeId = activeId;
    this.state.status = 'playing';
    this.state.errorMessage = null;
    this.state.chunkIndex = this.currentIndex + 1;
    this.state.chunkTotal = this.chunks.length;
    this.emit();

    // Workaround for Chromium's 15s Web Speech auto-pause bug
    this.clearKeepAlive();
    this.keepAliveTimer = window.setInterval(() => {
      if (this.generation !== currentGen || this.state.status !== 'playing') {
        this.clearKeepAlive();
        return;
      }
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
    }, 8000);

    const speakNext = (idx: number) => {
      if (this.generation !== currentGen) return;
      if (idx >= this.chunks.length) {
        this.clearKeepAlive();
        this.state.status = 'idle';
        this.state.activeId = null;
        this.state.chunkIndex = 0;
        this.state.chunkTotal = 0;
        this.emit();
        return;
      }

      this.currentIndex = idx;
      this.state.chunkIndex = idx + 1;
      this.emit();

      const utterance = new SpeechSynthesisUtterance(this.chunks[idx]);
      utterance.lang = chosenVoice?.lang || (lang === 'ar' ? 'ar-SA' : lang === 'en' ? 'en-US' : 'fr-FR');
      if (chosenVoice) {
        utterance.voice = chosenVoice;
      }
      const voicePitchMap: Record<BackendVoiceId, number> = {
        voice1: 0.85,
        voice2: 1.0,
        voice3: 1.15,
      };
      const voiceRateMult: Record<BackendVoiceId, number> = {
        voice1: 0.96,
        voice2: 1.0,
        voice3: 1.03,
      };
      utterance.rate = Math.max(0.6, Math.min(1.8, this.state.rate * voiceRateMult[this.state.selectedVoiceId]));
      utterance.volume = this.state.volume;
      utterance.pitch = voicePitchMap[this.state.selectedVoiceId] ?? 1.0;

      utterance.onend = () => {
        if (this.generation !== currentGen) return;
        speakNext(idx + 1);
      };

      utterance.onerror = (ev) => {
        if (this.generation !== currentGen) return;
        if (ev.error === 'interrupted' || ev.error === 'canceled') {
          return;
        }
        this.clearKeepAlive();
        this.state.status = 'error';
        this.state.errorMessage =
          lang === 'ar'
            ? 'تعذر تشغيل الصوت في المتصفح الحالي. تحقق من اتصال الشبكة أو حزمة الصوت.'
            : lang === 'en'
              ? 'Unable to play audio in this browser.'
              : "Impossible de lire l'audio sur ce navigateur.";
        this.emit();
      };

      try {
        window.speechSynthesis.speak(utterance);
      } catch {
        if (this.generation !== currentGen) return;
        this.clearKeepAlive();
        this.state.status = 'error';
        this.state.errorMessage =
          lang === 'ar'
            ? 'تعذر بدء التشغيل الصوتي.'
            : lang === 'en'
              ? 'Audio playback failed to start.'
              : 'Échec du démarrage audio.';
        this.emit();
      }
    };

    // Short delay after cancel() avoids Chromium synchronous speak() drop bug
    window.setTimeout(() => {
      if (this.generation === currentGen) {
        speakNext(this.currentIndex);
      }
    }, 60);
  }
}

export const speechEngine = new BilingualSpeechEngine();
