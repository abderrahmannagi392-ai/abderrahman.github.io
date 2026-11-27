import React, { useEffect, useState } from 'react';
import { AlertCircle, Pause, Play, RotateCcw, Square, Volume2 } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { getT } from '../i18n/translations';
import { speechEngine, type SpeechState } from '../utils/speechEngine';
import { tr } from '../utils/locale';

interface AudioPlayerBarProps {
  audioId: string;
  arabicSpeechText?: string;
  arabicFallbackText?: string;
  frenchText?: string;
  englishText?: string;
  label?: string;
  compact?: boolean;
}

export const AudioPlayerBar: React.FC<AudioPlayerBarProps> = ({
  audioId,
  arabicSpeechText,
  arabicFallbackText,
  frenchText,
  englishText,
  label,
  compact = false,
}) => {
  const { lang } = useApp();
  const t = getT(lang);
  const [speechState, setSpeechState] = useState<SpeechState>(() => speechEngine.getState());

  useEffect(() => {
    return speechEngine.subscribe(setSpeechState);
  }, []);

  const isThisActive = speechState.activeId === audioId;
  const isLoading = isThisActive && speechState.status === 'loading';
  const isPlaying = isThisActive && speechState.status === 'playing';
  const isPaused = isThisActive && speechState.status === 'paused';

  const textToSpeak =
    lang === 'ar'
      ? (arabicSpeechText || arabicFallbackText || '').trim()
      : lang === 'en'
        ? (englishText || frenchText || arabicFallbackText || '').trim()
        : (frenchText || arabicFallbackText || '').trim();

  const handlePlayOrToggle = () => {
    if (!textToSpeak) return;
    if (isPlaying) {
      speechEngine.pause();
    } else if (isPaused) {
      speechEngine.resume();
    } else {
      speechEngine.speak(textToSpeak, lang, audioId);
    }
  };

  return (
    <div
      className={`border border-[#d8dfe2] rounded-[3px] bg-[#f4f6f7] ${
        compact ? 'px-3 py-2' : 'px-4 py-3'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={handlePlayOrToggle}
            disabled={!textToSpeak}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-[3px] bg-[#A6CE39] hover:bg-[#96bc2f] disabled:opacity-50 text-[#384D55] font-bold text-xs cursor-pointer transition-colors"
          >
            {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            <span>
              {isLoading
                ? tr(lang, 'جاري التحميل...', 'Chargement...', 'Loading...')
                : isPlaying
                  ? t.pauseAudio
                  : isPaused
                    ? t.resumeAudio
                    : label || t.listenAudio}
            </span>
          </button>

          {isThisActive && (
            <>
              <button
                type="button"
                onClick={() => speechEngine.replay()}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded bg-white border border-[#c9d0d3] hover:border-[#A6CE39] text-[#384D55] text-xs font-semibold cursor-pointer"
                title={t.replayAudio}
              >
                <RotateCcw className="w-3.5 h-3.5" />
                {!compact && <span>{t.replayAudio}</span>}
              </button>
              <button
                type="button"
                onClick={() => speechEngine.stop()}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded bg-white border border-[#c9d0d3] hover:border-red-400 text-[#384D55] text-xs font-semibold cursor-pointer"
                title={t.stopAudio}
              >
                <Square className="w-3 h-3" />
                {!compact && <span>{t.stopAudio}</span>}
              </button>

              {speechState.chunkTotal > 1 && (
                <span className="text-[11px] font-bold text-[#6b787e] tabular-nums px-1.5">
                  {speechState.chunkIndex}/{speechState.chunkTotal}
                </span>
              )}
            </>
          )}
        </div>

        <div className="flex items-center gap-2.5 text-xs text-[#384D55] flex-wrap">
          <div className="flex items-center gap-1.5">
            <Volume2 className="w-3.5 h-3.5 text-[#6b787e]" />
            {!compact && (
              <input
                type="range"
                min={0.2}
                max={1}
                step={0.1}
                value={speechState.volume}
                onChange={(e) => speechEngine.setVolume(Number(e.target.value))}
                className="w-16 accent-[#A6CE39] cursor-pointer"
                aria-label={tr(lang, 'مستوى الصوت', 'Volume', 'Volume')}
              />
            )}
          </div>

          <label className="flex items-center gap-1">
            <span className="text-[#6b787e]">{t.speedLabel}:</span>
            <select
              value={speechState.rate}
              onChange={(e) => speechEngine.setRate(Number(e.target.value))}
              className="bg-white border border-[#c9d0d3] rounded px-1.5 py-0.5 text-xs text-[#384D55] tabular-nums"
            >
              <option value={0.75}>0.75x</option>
              <option value={0.9}>0.9x</option>
              <option value={1}>1.0x</option>
              <option value={1.15}>1.15x</option>
              <option value={1.3}>1.3x</option>
            </select>
          </label>

          <label className="flex items-center gap-1">
            <span className="text-[#6b787e]">{tr(lang, 'الصوت:', 'Voix:', 'Voice:')}</span>
            <select
              value={speechState.selectedVoiceId}
              onChange={(e) => speechEngine.setBackendVoice(e.target.value as 'voice1' | 'voice2' | 'voice3')}
              className="bg-white border border-[#c9d0d3] rounded px-1.5 py-0.5 text-xs text-[#384D55] max-w-[175px] truncate cursor-pointer"
              aria-label={tr(lang, 'اختيار القارئ الصوتي', 'Sélectionner la voix', 'Select voice')}
            >
              {speechState.backendVoices.map((v) => (
                <option key={v.id} value={v.id}>
                  {lang === 'ar' ? v.label_ar : lang === 'en' ? v.label_en || v.label_fr : v.label_fr}
                </option>
              ))}
            </select>
          </label>

          {speechState.elevenLabsPermitted && (
            <button
              type="button"
              onClick={() => speechEngine.setUseElevenLabs(!speechState.useElevenLabs)}
              className={`px-2 py-0.5 rounded border text-[11px] font-bold cursor-pointer transition-colors ${
                speechState.useElevenLabs
                  ? 'bg-[#e2efbf] border-[#83a329] text-[#384D55]'
                  : 'bg-white border-[#c9d0d3] text-[#6b787e]'
              }`}
              title={tr(lang, 'تبديل جودة الصوت الاحترافية', 'Basculer la voix HD', 'Toggle HD Voice')}
            >
              {speechState.useElevenLabs
                ? tr(lang, 'صوت HD مفعّل', 'Voix HD active', 'HD Voice On')
                : tr(lang, 'الصوت القياسي', 'Voix standard', 'Standard Voice')}
            </button>
          )}
        </div>
      </div>

      {isThisActive && speechState.errorMessage && (
        <div className="mt-2 flex items-start gap-1.5 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2.5 py-1.5">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>{speechState.errorMessage}</span>
        </div>
      )}

      {speechState.status === 'unsupported' && (
        <div className="mt-2 flex items-start gap-1.5 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2.5 py-1.5">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>
            {tr(
              lang,
              'هذا المتصفح لا يدعم تشغيل الصوت النصي (Web Speech API).',
              'Synthèse vocale non prise en charge par ce navigateur.',
              'Text-to-speech is not supported in this browser.'
            )}
          </span>
        </div>
      )}
    </div>
  );
};
