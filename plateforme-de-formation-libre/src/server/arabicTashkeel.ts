import crypto from 'crypto';
import { GoogleGenAI } from '@google/genai';
import type Database from 'better-sqlite3';

const DIACRITICS_RE = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E8\u06EA-\u06ED]/g;
const TATWEEL_RE = /\u0640/g;

export interface PronunciationRule {
  id: number;
  pattern: string;
  replacement: string;
  lang: 'ar' | 'fr' | 'en' | 'all';
  match_type: 'word' | 'exact' | 'regex';
  notes: string;
  active: number;
  updated_at: string;
}

export function stripArabicDiacritics(input: string | null | undefined): string {
  if (!input) return '';
  return String(input).replace(DIACRITICS_RE, '').replace(TATWEEL_RE, '');
}

/**
 * Mauritanian pedagogical, grammatical, scientific, and everyday lexical diacritization map
 * applied inside the internal speech synthesis pipeline (never exposed in visible UI).
 */
const LEXICAL_TASHKEEL_MAP: Array<[RegExp, string]> = [
  // Platform & Mauritania entities
  [/\bتدريبي\b/g, 'تَدْرِيبِي'],
  [/\bمنصة\b/g, 'مِنَصَّةُ'],
  [/\bالتدريب الحر\b/g, 'التَّدْرِيبِ الْحُرِّ'],
  [/\bموريتانيا\b/g, 'مُورِيتَانْيَا'],
  [/\bنواكشوط\b/g, 'نَوَاكْشُوطْ'],
  [/\bنواذيبو\b/g, 'نَوَاذِيبُو'],
  [/\bالترارزة\b/g, 'التِّرَارْزَة'],
  [/\bلبراكنة\b/g, 'لَبْرَاكْنَة'],
  [/\bلعصابة\b/g, 'لَعْصَابَة'],
  [/\bغورغول\b/g, 'غُورْغُول'],
  [/\bتكانت\b/g, 'تَكَّانْت'],
  [/\bآدرار\b/g, 'آدْرَار'],
  [/\bكيدي ماغا\b/g, 'كِيدِي مَاغَا'],
  [/\bاكتتاب المعلمين\b/g, 'اكْتِتَابِ الْمُعَلِّمِينَ'],
  [/\bمسابقة المعلمين\b/g, 'مُسَابَقَةِ الْمُعَلِّمِينَ'],
  [/\bالمدرسة الجمهورية\b/g, 'الْمَدْرَسَةِ الْجُمْهُورِيَّةِ'],
  // Mauritanian payment services
  [/\bالسداد\b/g, 'السَّدَادْ'],
  [/\bمصرفي\b/g, 'مَصْرِفِي'],
  [/\bبنكيلي\b/g, 'بَنْكِيلِي'],
  [/\bأوقية\b/g, 'أُوقِيَّةٍ'],
  // Pedagogy & Didactics terms
  [/\bالمقاربة بالكفايات\b/g, 'الْمُقَارَبَةُ بِالْكِفَايَاتِ'],
  [/\bالبيداغوجيا الفارقية\b/g, 'الْبِيدَاغُوجْيَا الْفَارِقِيَّةُ'],
  [/\bبيداغوجيا المشروع\b/g, 'بِيدَاغُوجْيَا الْمَشْرُوعِ'],
  [/\bبيداغوجيا الخطأ\b/g, 'بِيدَاغُوجْيَا الْخَطَأِ'],
  [/\bبيداغوجيا اللعب\b/g, 'بِيدَاغُوجْيَا اللَّعِبِ'],
  [/\bبيداغوجيا الإدماج\b/g, 'بِيدَاغُوجْيَا الْإِدْمَاجِ'],
  [/\bالديداكتيك\b/g, 'الدِّيدَاكْتِيكْ'],
  [/\bالنقل الديداكتيكي\b/g, 'النَّقْلُ الدِّيدَاكْتِيكِيُّ'],
  [/\bالتعاقد الديداكتيكي\b/g, 'التَّعَاقُدُ الدِّيدَاكْتِيكِيُّ'],
  [/\bالمثلث الديداكتيكي\b/g, 'الْمُثَلَّثُ الدِّيدَاكْتِيكِيُّ'],
  [/\bعلوم التربية\b/g, 'عُلُومُ التَّرْبِيَةِ'],
  [/\bعلم النفس التربوي\b/g, 'عِلْمُ النَّفْسِ التَّرْبَوِيُّ'],
  [/\bطرائق التدريس\b/g, 'طَرَائِقُ التَّدْرِيسِ'],
  [/\bالتخطيط التربوي\b/g, 'التَّخْطِيطُ التَّرْبَوِيُّ'],
  [/\bالتقويم التشخيصي\b/g, 'التَّقْوِيمُ التَّشْخِيصِيُّ'],
  [/\bالتقويم التكويني\b/g, 'التَّقْوِيمُ التَّكْوِينِيُّ'],
  [/\bالتقويم الإجمالي\b/g, 'التَّقْوِيمُ الْإِجْمَالِيُّ'],
  [/\bإدارة القسم\b/g, 'إِدَارَةُ الْقِسْمِ'],
  [/\bالجذاذة التربوية\b/g, 'الْجُذَاذَةُ التَّرْبَوِيَّةُ'],
  [/\bبياجيه\b/g, 'بِيَاجِيه'],
  [/\bفيغوتسكي\b/g, 'فِيغُوتْسْكِي'],
  [/\bالمنطقة القريبة للنمو\b/g, 'الْمِنْطَقَةُ الْقَرِيبَةُ لِلنُّمُوِّ'],
  [/\bسكنر\b/g, 'سْكِينَرْ'],
  [/\bبلوم\b/g, 'بْلُومْ'],
  [/\bبرونر\b/g, 'بْرُونَرْ'],
  // Grammar & Islamic & Scientific core vocabulary
  [/\bالجملة الاسمية\b/g, 'الْجُمْلَةُ الِاسْمِيَّةُ'],
  [/\bالجملة الفعلية\b/g, 'الْجُمْلَةُ الْفِعْلِيَّةُ'],
  [/\bعلامات الإعراب\b/g, 'عَلَامَاتُ الْإِعْرَابِ'],
  [/\bالمبتدأ\b/g, 'الْمُبْتَدَأُ'],
  [/\bالخبر\b/g, 'الْخَبَرُ'],
  [/\bالفاعل\b/g, 'الْفَاعِلُ'],
  [/\bالمفعول به\b/g, 'الْمَفْعُولُ بِهِ'],
  [/\bالمفعول المطلق\b/g, 'الْمَفْعُولُ الْمُطْلَقُ'],
  [/\bالمفعول لأجله\b/g, 'الْمَفْعُولُ لِأَجْلِهِ'],
  [/\bنائب الفاعل\b/g, 'نَائِبُ الْفَاعِلِ'],
  [/\bالممنوع من الصرف\b/g, 'الْمَمْنُوعُ مِنَ الصَّرْفِ'],
  [/\bجمع المذكر السالم\b/g, 'جَمْعُ الْمُذَكَّرِ السَّالِمِ'],
  [/\bجمع المؤنث السالم\b/g, 'جَمْعُ الْمُؤَنَّثِ السَّالِمِ'],
  [/\bالأسماء الخمسة\b/g, 'الْأَسْمَاءُ الْخَمْسَةُ'],
  [/\bالأفعال الخمسة\b/g, 'الْأَفْعَالُ الْخَمْسَةُ'],
  [/\bالمثنى\b/g, 'الْمُثَنَّى'],
  [/\bالهمزة المتوسطة\b/g, 'الْهَمْزَةُ الْمُتَوَسِّطَةُ'],
  [/\bالهمزة المتطرفة\b/g, 'الْهَمْزَةُ الْمُتَطَرِّفَةُ'],
  [/\bهمزة الوصل\b/g, 'هَمْزَةُ الْوَصْلِ'],
  [/\bهمزة القطع\b/g, 'هَمْزَةُ الْقَطْعِ'],
  [/\bالألف اللينة\b/g, 'الْأَلِفُ اللَّيِّنَةُ'],
  [/\bالفعل اللازم\b/g, 'الْفِعْلُ اللَّازِمُ'],
  [/\bالفعل المتعدي\b/g, 'الْفِعْلُ الْمُتَعَدِّي'],
  [/\bالتركيب الضوئي\b/g, 'التَّرْكِيبُ الضَّوْئِيُّ'],
  [/\bالتمثيل الضوئي\b/g, 'التَّمْثِيلُ الضَّوْئِيُّ'],
  [/\bالنظرية السلوكية\b/g, 'النَّظَرِيَّةُ السُّلُوكِيَّةُ'],
  [/\bالنظرية البنائية\b/g, 'النَّظَرِيَّةُ الْبِنَائِيَّةُ'],
  [/\bالنظرية المعرفية\b/g, 'النَّظَرِيَّةُ الْمَعْرِفِيَّةُ'],
  [/\bالوضعية المشكلة\b/g, 'الْوَضْعِيَّةُ الْمُشْكِلَةُ'],
  [/\bالمعجم\b/g, 'الْمُعْجَمُ'],
  [/\bالبلاغة\b/g, 'الْبَلَاغَةُ'],
  [/\bالتجويد\b/g, 'التَّجْوِيدُ'],
  [/\bالعقيدة\b/g, 'الْعَقِيدَةُ'],
  [/\bالسيرة النبوية\b/g, 'السِّيرَةُ النَّبَوِيَّةُ'],
  [/\bالدرس\b/g, 'الدَّرْسُ'],
  [/\bالتربية\b/g, 'التَّرْبِيَةُ'],
  [/\bالتعليم\b/g, 'التَّعْلِيمُ'],
  [/\bالمتعلم\b/g, 'الْمُتَعَلِّمُ'],
  [/\bالمعلم\b/g, 'الْمُعَلِّمُ'],
  [/\bالتلميذ\b/g, 'التِّلْمِيذُ'],
  [/\bالسؤال\b/g, 'السُّؤَالُ'],
  [/\bالإجابة\b/g, 'الْإِجَابَةُ'],
  [/\bالاختبار\b/g, 'الِاخْتِبَارُ'],
  [/\bالامتحان\b/g, 'الِامْتِحَانُ'],
  // Function words / high-frequency connectors & pronouns
  [/\bمن\b/g, 'مِنْ'],
  [/\bعن\b/g, 'عَنْ'],
  [/\bفي\b/g, 'فِي'],
  [/\bإلى\b/g, 'إِلَى'],
  [/\bعلى\b/g, 'عَلَى'],
  [/\bبين\b/g, 'بَيْنَ'],
  [/\bمع\b/g, 'مَعَ'],
  [/\bعند\b/g, 'عِنْدَ'],
  [/\bقبل\b/g, 'قَبْلَ'],
  [/\bبعد\b/g, 'بَعْدَ'],
  [/\bخلال\b/g, 'خِلَالَ'],
  [/\bحسب\b/g, 'حَسَبَ'],
  [/\bوفق\b/g, 'وَفْقَ'],
  [/\bنحو\b/g, 'نَحْوَ'],
  [/\bحيث\b/g, 'حَيْثُ'],
  [/\bالتي\b/g, 'الَّتِي'],
  [/\bالذي\b/g, 'الَّذِي'],
  [/\bالذين\b/g, 'الَّذِينَ'],
  [/\bهذا\b/g, 'هَذَا'],
  [/\bهذه\b/g, 'هَذِهِ'],
  [/\bذلك\b/g, 'ذَلِكَ'],
  [/\bتلك\b/g, 'تِلْكَ'],
  [/\bأن\b/g, 'أَنَّ'],
  [/\bإن\b/g, 'إِنَّ'],
  [/\bلكن\b/g, 'لَكِنَّ'],
  [/\bلأن\b/g, 'لِأَنَّ'],
  [/\bهو\b/g, 'هُوَ'],
  [/\bهي\b/g, 'هِيَ'],
  [/\bهم\b/g, 'هُمْ'],
  [/\bكان\b/g, 'كَانَ'],
  [/\bكانت\b/g, 'كَانَتْ'],
  [/\bيكون\b/g, 'يَكُونُ'],
  [/\bتكون\b/g, 'تَكُونُ'],
  [/\bيجب\b/g, 'يَجِبُ'],
  [/\bيمكن\b/g, 'يُمْكِنُ'],
  [/\bيعد\b/g, 'يُعَدُّ'],
  [/\bتعد\b/g, 'تُعَدُّ'],
  [/\bيتم\b/g, 'يَتِمُّ'],
  [/\bتتم\b/g, 'تَتِمُّ'],
  [/\bيتكون\b/g, 'يَتَكَوَّنُ'],
  [/\bتتكون\b/g, 'تَتَكَوَّنُ'],
  [/\bيهدف\b/g, 'يَهْدِفُ'],
  [/\bتهدف\b/g, 'تَهْدِفُ'],
  [/\bيوضح\b/g, 'يُوَضِّحُ'],
  [/\bتوضح\b/g, 'تُوَضِّحُ'],
  [/\bيُرفع\b/g, 'يُرْفَعُ'],
  [/\bيُنصب\b/g, 'يُنْصَبُ'],
  [/\bيُجر\b/g, 'يُجَرُّ'],
  [/\bيُجزم\b/g, 'يُجْزَمُ'],
  // Mathematical operators spoken cleanly in Arabic
  [/\s*÷\s*/g, ' عَلَى '],
  [/\s*×\s*/g, ' ضَرْبَ '],
  [/\s*=\s*/g, ' يُسَاوِي '],
  [/\s*%\s*/g, ' فِي الْمِائَةِ '],
];

const GENITIVE_PREPOSITIONS = new Set([
  'مِنْ',
  'إِلَى',
  'عَنْ',
  'عَلَى',
  'فِي',
  'مَعَ',
  'بَيْنَ',
  'عِنْدَ',
  'قَبْلَ',
  'بَعْدَ',
  'خِلَالَ',
  'وَفْقَ',
  'حَسَبَ',
]);
const NOMINATIVE_CUES = new Set(['هُوَ', 'هِيَ', 'إِنَّ', 'كَانَ', 'كَانَتْ', 'يَكُونُ', 'تَكُونُ']);

const tashkeelCache = new Map<string, string>();

function hasDiacritics(word: string): boolean {
  return /[\u064B-\u065F\u0670]/.test(word);
}

/**
 * Step 1: Normalize Arabic characters for speech preprocessing while preserving punctuation & pauses.
 */
export function normalizeArabicForSpeech(raw: string): string {
  return raw
    .normalize('NFC')
    .replace(TATWEEL_RE, '')
    .replace(/[\u200B-\u200F\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([،؛؟!:.,])\s*/g, '$1 ')
    .replace(/([،؛؟!])/g, ' $1 ')
    .trim();
}

/**
 * Step 2-3: Contextual parsing & internal diacritization.
 * Uses context (prepositions, verbal cues, definite nouns, lexical map)
 * rather than random harakat.
 */
export function applyContextualTashkeel(normalizedText: string): string {
  let enriched = normalizedText;
  for (const [pattern, replacement] of LEXICAL_TASHKEEL_MAP) {
    enriched = enriched.replace(pattern, replacement);
  }

  // Contextual case-ending & definite article refinement per token
  const tokens = enriched.split(/\s+/);
  for (let i = 0; i < tokens.length; i++) {
    const prev = i > 0 ? tokens[i - 1] : '';
    const tok = tokens[i];
    if (!tok || /^[,،؛:.!?؟()\[\]]+$/.test(tok)) continue;

    // Preserve already-diacritized tokens from lexical dictionary or caller speech field
    if (hasDiacritics(tok)) continue;

    // Definite nouns following genitive prepositions -> add final kasra cleanly
    if (
      GENITIVE_PREPOSITIONS.has(prev) &&
      /^ال[\u0621-\u064A]{2,}$/.test(tok) &&
      !tok.endsWith('ا') &&
      !tok.endsWith('ى') &&
      !tok.endsWith('ي')
    ) {
      const firstRoot = tok[2];
      if ('تثدذرزسشصضطظلن'.includes(firstRoot)) {
        tokens[i] = `ال${firstRoot}\u0651${tok.slice(3)}ِ`;
      } else {
        tokens[i] = `الْ${tok.slice(2)}ِ`;
      }
      continue;
    }

    // Subject/Predicate after nominative cues -> add final damma on clean definite nouns
    if (
      NOMINATIVE_CUES.has(prev) &&
      /^ال[\u0621-\u064A]{2,}$/.test(tok) &&
      !tok.endsWith('ا') &&
      !tok.endsWith('ى') &&
      !tok.endsWith('ي')
    ) {
      const firstRoot = tok[2];
      if ('تثدذرزسشصضطظلن'.includes(firstRoot)) {
        tokens[i] = `ال${firstRoot}\u0651${tok.slice(3)}ُ`;
      } else {
        tokens[i] = `الْ${tok.slice(2)}ُ`;
      }
      continue;
    }

    // Standard definite article onset stabilization (sun vs moon letters)
    if (/^ال[\u0621-\u064A]{2,}$/.test(tok)) {
      const firstRoot = tok[2];
      if ('تثدذرزسشصضطظلن'.includes(firstRoot)) {
        tokens[i] = `ال${firstRoot}\u0651${tok.slice(3)}`;
      } else {
        tokens[i] = `الْ${tok.slice(2)}`;
      }
    }
  }

  return tokens.join(' ').replace(/\s+([،؛؟!.,:])/g, '$1 ').replace(/\s+/g, ' ').trim();
}

/**
 * Optional Gemini contextual Tashkeel enrichment for multi-word Arabic sentences
 * when GEMINI_API_KEY is configured (cached in memory so latency stays low).
 */
export async function enrichArabicTashkeelContextuallyAsync(preparedArabic: string): Promise<string> {
  const key = crypto.createHash('sha1').update(preparedArabic).digest('hex');
  const cached = tashkeelCache.get(key);
  if (cached) return cached;

  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey || preparedArabic.length > 900) {
    return preparedArabic;
  }

  try {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
    });
    const res = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: `أضف التشكيل العربي الفصيح الكامل والدقيق نحوياً وصرفياً للنص التالي لقراءته بصوت إذاعي واضح. أعد النص المشكول فقط دون أي مقدمات أو شروح:\n${stripArabicDiacritics(preparedArabic)}`,
    });
    const out = (res.text || '').trim();
    if (out && out.length >= preparedArabic.length * 0.6 && out.length <= preparedArabic.length * 3.5) {
      tashkeelCache.set(key, out);
      if (tashkeelCache.size > 400) {
        const firstKey = tashkeelCache.keys().next().value;
        if (firstKey) tashkeelCache.delete(firstKey);
      }
      return out;
    }
  } catch {
    // Graceful fallback to rule-based contextual tashkeel
  }
  return preparedArabic;
}

/**
 * Step 4: Apply Admin-managed pronunciation dictionary rules from SQLite.
 */
export function applyPronunciationDictionary(
  text: string,
  lang: 'ar' | 'fr' | 'en',
  rules: PronunciationRule[]
): string {
  let out = text;
  for (const rule of rules) {
    if (!rule.active) continue;
    if (rule.lang !== 'all' && rule.lang !== lang) continue;
    const pat = (rule.pattern || '').trim();
    const rep = (rule.replacement || '').trim();
    if (!pat || !rep) continue;

    try {
      if (rule.match_type === 'regex') {
        out = out.replace(new RegExp(pat, 'giu'), rep);
      } else if (rule.match_type === 'exact') {
        const escaped = pat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        out = out.replace(new RegExp(escaped, 'gu'), rep);
      } else {
        const escaped = stripArabicDiacritics(pat).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re = new RegExp(`(^|[\\s،؛:.!?؟(])${escaped}(?=$|[\\s،؛:.!?؟)])`, 'giu');
        out = out.replace(re, `$1${rep}`);
      }
    } catch {
      // Ignore malformed regex rule safely without breaking speech
    }
  }
  return out;
}

/**
 * Step 5: Final validation layer before sending to TTS engine.
 */
export function validateSpeechText(text: string): string {
  return text
    .replace(/<[^>]+>/g, ' ')
    .replace(/[\x00-\x1F\x7F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function getPronunciationRulesAndVersion(db: Database.Database): {
  rules: PronunciationRule[];
  versionHash: string;
} {
  try {
    const rules = db
      .prepare(
        `SELECT id, pattern, replacement,
                COALESCE(lang, 'ar') as lang,
                COALESCE(match_type, CASE WHEN is_regex = 1 THEN 'regex' ELSE 'word' END) as match_type,
                notes,
                COALESCE(active, enabled, 1) as active,
                updated_at
         FROM pronunciation_dictionary
         WHERE COALESCE(active, enabled, 1) = 1
         ORDER BY id ASC`
      )
      .all() as PronunciationRule[];
    const digestSource = rules
      .map((r) => `${r.id}:${r.pattern}:${r.replacement}:${r.lang}:${r.match_type}:${r.active}:${r.updated_at}`)
      .join('|');
    const versionHash = crypto.createHash('sha1').update(digestSource || 'v1').digest('hex').slice(0, 12);
    return { rules, versionHash };
  } catch {
    return { rules: [], versionHash: 'v1' };
  }
}

/**
 * Complete end-to-end internal TTS preparation pipeline:
 * Raw/Unvocalized Text -> Normalize -> Contextual Diacritization -> Pronunciation Dictionary -> Validate.
 */
export function prepareSpeechText(
  db: Database.Database,
  rawText: string,
  lang: 'ar' | 'fr' | 'en'
): { preparedText: string; dictVersion: string } {
  const { rules, versionHash } = getPronunciationRulesAndVersion(db);
  const cleaned = validateSpeechText(rawText);
  if (!cleaned) return { preparedText: '', dictVersion: versionHash };

  if (lang === 'fr' || lang === 'en') {
    const withDict = applyPronunciationDictionary(cleaned, lang, rules);
    return { preparedText: validateSpeechText(withDict), dictVersion: versionHash };
  }

  const normalized = normalizeArabicForSpeech(cleaned);
  const dictPre = applyPronunciationDictionary(normalized, 'ar', rules);
  const diacritized = applyContextualTashkeel(dictPre);
  const finalValidated = validateSpeechText(diacritized);
  return { preparedText: finalValidated, dictVersion: versionHash };
}
