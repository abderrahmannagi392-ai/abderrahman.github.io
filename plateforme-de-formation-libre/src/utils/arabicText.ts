/**
 * Shared Arabic text utilities for strict separation between:
 *  1) Visible UI text (MUST be rendered WITHOUT Arabic diacritics / Tashkeel)
 *  2) Internal TTS speech pipeline (receives normalized & internally diacritized text on server)
 */

const ARABIC_DIACRITICS_REGEX = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E8\u06EA-\u06ED]/g;
const ARABIC_TATWEEL_REGEX = /\u0640/g;

/**
 * Strips all Arabic diacritical marks (Tashkeel/Harakat) and tatweel
 * from visible UI text so learners always read clean unvocalized Arabic.
 */
export function stripArabicDiacritics(input: string | null | undefined): string {
  if (!input) return '';
  return input
    .replace(ARABIC_DIACRITICS_REGEX, '')
    .replace(ARABIC_TATWEEL_REGEX, '');
}

/**
 * Helper used on arrays of visible Arabic strings (e.g., MCQ options).
 */
export function stripArabicDiacriticsList(items: string[] | null | undefined): string[] {
  if (!Array.isArray(items)) return [];
  return items.map((item) => stripArabicDiacritics(item));
}
