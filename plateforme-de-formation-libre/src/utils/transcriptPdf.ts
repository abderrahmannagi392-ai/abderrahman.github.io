import { jsPDF } from 'jspdf';
import type { ExamAttempt, Language, Subject } from '../types';
import { localeCode, tr } from './locale';

// ============================================================================
// ARABIC CONTEXTUAL SHAPER + VISUAL BIDI HELPER (PURE VECTOR PDF TEXT)
// ============================================================================

type FormTuple = [string, string, string, string]; // [isolated, final, initial, medial]

const ARABIC_FORMS: Record<string, FormTuple> = {
  '\u0621': ['\uFE80', '\uFE80', '\uFE80', '\uFE80'], // ء
  '\u0622': ['\uFE81', '\uFE82', '\uFE81', '\uFE82'], // آ
  '\u0623': ['\uFE83', '\uFE84', '\uFE83', '\uFE84'], // أ
  '\u0624': ['\uFE85', '\uFE86', '\uFE85', '\uFE86'], // ؤ
  '\u0625': ['\uFE87', '\uFE88', '\uFE87', '\uFE88'], // إ
  '\u0626': ['\uFE89', '\uFE8A', '\uFE8B', '\uFE8C'], // ئ
  '\u0627': ['\uFE8D', '\uFE8E', '\uFE8D', '\uFE8E'], // ا
  '\u0628': ['\uFE8F', '\uFE90', '\uFE91', '\uFE92'], // ب
  '\u0629': ['\uFE93', '\uFE94', '\uFE93', '\uFE94'], // ة
  '\u062A': ['\uFE95', '\uFE96', '\uFE97', '\uFE98'], // ت
  '\u062B': ['\uFE99', '\uFE9A', '\uFE9B', '\uFE9C'], // ث
  '\u062C': ['\uFE9D', '\uFE9E', '\uFE9F', '\uFEA0'], // ج
  '\u062D': ['\uFEA1', '\uFEA2', '\uFEA3', '\uFEA4'], // ح
  '\u062E': ['\uFEA5', '\uFEA6', '\uFEA7', '\uFEA8'], // خ
  '\u062F': ['\uFEA9', '\uFEAA', '\uFEA9', '\uFEAA'], // د
  '\u0630': ['\uFEAB', '\uFEAC', '\uFEAB', '\uFEAC'], // ذ
  '\u0631': ['\uFEAD', '\uFEAE', '\uFEAD', '\uFEAE'], // ر
  '\u0632': ['\uFEAF', '\uFEB0', '\uFEAF', '\uFEB0'], // ز
  '\u0633': ['\uFEB1', '\uFEB2', '\uFEB3', '\uFEB4'], // س
  '\u0634': ['\uFEB5', '\uFEB6', '\uFEB7', '\uFEB8'], // ش
  '\u0635': ['\uFEB9', '\uFEBA', '\uFEBB', '\uFEBC'], // ص
  '\u0636': ['\uFEBD', '\uFEBE', '\uFEBF', '\uFEC0'], // ض
  '\u0637': ['\uFEC1', '\uFEC2', '\uFEC3', '\uFEC4'], // ط
  '\u0638': ['\uFEC5', '\uFEC6', '\uFEC7', '\uFEC8'], // ظ
  '\u0639': ['\uFEC9', '\uFECA', '\uFECB', '\uFECC'], // ع
  '\u063A': ['\uFECD', '\uFECE', '\uFECF', '\uFED0'], // غ
  '\u0640': ['\u0640', '\u0640', '\u0640', '\u0640'], // ـ (tatweel)
  '\u0641': ['\uFED1', '\uFED2', '\uFED3', '\uFED4'], // ف
  '\u0642': ['\uFED5', '\uFED6', '\uFED7', '\uFED8'], // ق
  '\u0643': ['\uFED9', '\uFEDA', '\uFEDB', '\uFEDC'], // ك
  '\u0644': ['\uFEDD', '\uFEDE', '\uFEDF', '\uFEE0'], // ل
  '\u0645': ['\uFEE1', '\uFEE2', '\uFEE3', '\uFEE4'], // م
  '\u0646': ['\uFEE5', '\uFEE6', '\uFEE7', '\uFEE8'], // ن
  '\u0647': ['\uFEE9', '\uFEEA', '\uFEEB', '\uFEEC'], // ه
  '\u0648': ['\uFEED', '\uFEEE', '\uFEED', '\uFEEE'], // و
  '\u0649': ['\uFEEF', '\uFEF0', '\uFEEF', '\uFEF0'], // ى
  '\u064A': ['\uFEF1', '\uFEF2', '\uFEF3', '\uFEF4'], // ي
};

const NON_LEFT_JOINING = new Set([
  '\u0621', // ء
  '\u0622', // آ
  '\u0623', // أ
  '\u0624', // ؤ
  '\u0625', // إ
  '\u0627', // ا
  '\u0629', // ة
  '\u062F', // د
  '\u0630', // ذ
  '\u0631', // ر
  '\u0632', // ز
  '\u0648', // و
  '\u0649', // ى
]);

const LAM_ALEF_LIGATURES: Record<string, [string, string]> = {
  '\u0622': ['\uFEF5', '\uFEF6'], // لآ
  '\u0623': ['\uFEF7', '\uFEF8'], // لأ
  '\u0625': ['\uFEF9', '\uFEFA'], // لإ
  '\u0627': ['\uFEFB', '\uFEFC'], // لا
};

const TASHKEEL_REGEX = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/g;
const ARABIC_CHAR_REGEX = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

function shapeArabicSegment(raw: string): string {
  const cleaned = raw.replace(TASHKEEL_REGEX, '');
  const chars = Array.from(cleaned);
  const out: string[] = [];

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];

    // Check Lam + Alef ligature
    if (ch === '\u0644' && i + 1 < chars.length && LAM_ALEF_LIGATURES[chars[i + 1]]) {
      const prev = i > 0 ? chars[i - 1] : '';
      const prevJoins = Boolean(prev && ARABIC_FORMS[prev] && !NON_LEFT_JOINING.has(prev));
      const lig = LAM_ALEF_LIGATURES[chars[i + 1]];
      out.push(prevJoins ? lig[1] : lig[0]);
      i++; // consume Alef
      continue;
    }

    const forms = ARABIC_FORMS[ch];
    if (!forms) {
      out.push(ch);
      continue;
    }

    const prev = i > 0 ? chars[i - 1] : '';
    const next = i + 1 < chars.length ? chars[i + 1] : '';

    const prevJoins = Boolean(prev && ARABIC_FORMS[prev] && !NON_LEFT_JOINING.has(prev));
    const canJoinNext = !NON_LEFT_JOINING.has(ch);
    const nextJoins = Boolean(canJoinNext && next && ARABIC_FORMS[next]);

    if (prevJoins && nextJoins) {
      out.push(forms[3]); // medial
    } else if (prevJoins && !nextJoins) {
      out.push(forms[1]); // final
    } else if (!prevJoins && nextJoins) {
      out.push(forms[2]); // initial
    } else {
      out.push(forms[0]); // isolated
    }
  }

  // Visual left-to-right drawing order requires reversing shaped glyphs
  return out.reverse().join('');
}

interface TextRun {
  kind: 'ar' | 'lat';
  raw: string;
  renderText: string;
}

function splitMixedRuns(input: string, baseRtl: boolean): TextRun[] {
  const text = String(input ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return [];

  // Tokenize into Arabic clusters vs Latin/Numeric clusters vs single spaces
  const tokens: { kind: 'ar' | 'lat' | 'space'; value: string }[] = [];
  let buf = '';
  let currentKind: 'ar' | 'lat' | 'space' | null = null;

  for (const ch of Array.from(text)) {
    const k: 'ar' | 'lat' | 'space' =
      ch === ' '
        ? 'space'
        : ARABIC_CHAR_REGEX.test(ch)
          ? 'ar'
          : 'lat';

    if (currentKind === null || currentKind === k) {
      buf += ch;
      currentKind = k;
    } else {
      tokens.push({ kind: currentKind, value: buf });
      buf = ch;
      currentKind = k;
    }
  }
  if (buf && currentKind) {
    tokens.push({ kind: currentKind, value: buf });
  }

  // Merge spaces cleanly into adjacent runs of matching base direction so spacing stays balanced
  const merged: { kind: 'ar' | 'lat'; value: string }[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const tk = tokens[i];
    if (tk.kind !== 'space') {
      const last = merged[merged.length - 1];
      if (last && last.kind === tk.kind) {
        last.value += tk.value;
      } else {
        merged.push({ kind: tk.kind, value: tk.value });
      }
    } else {
      const prev = tokens[i - 1]?.kind;
      const next = tokens[i + 1]?.kind;
      const spaceKind: 'ar' | 'lat' =
        prev === 'ar' && next === 'ar'
          ? 'ar'
          : prev === 'lat' && next === 'lat'
            ? 'lat'
            : baseRtl
              ? 'ar'
              : 'lat';
      const last = merged[merged.length - 1];
      if (last && last.kind === spaceKind) {
        last.value += tk.value;
      } else {
        merged.push({ kind: spaceKind, value: tk.value });
      }
    }
  }

  const runs: TextRun[] = merged.map((m) => ({
    kind: m.kind,
    raw: m.value,
    renderText: m.kind === 'ar' ? shapeArabicSegment(m.value) : m.value,
  }));

  return baseRtl ? runs.reverse() : runs;
}

// ============================================================================
// FONT FETCHER + IN-MEMORY BASE64 CACHE
// ============================================================================

let cachedFontsPromise: Promise<{ regular: string; bold: string } | null> | null = null;

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

export async function loadArabicFonts(): Promise<{ regular: string; bold: string } | null> {
  if (!cachedFontsPromise) {
    cachedFontsPromise = (async () => {
      try {
        const [regRes, boldRes] = await Promise.all([
          fetch('/assets/fonts/NotoSansArabic-Regular.ttf'),
          fetch('/assets/fonts/NotoSansArabic-Bold.ttf'),
        ]);
        if (!regRes.ok || !boldRes.ok) return null;
        const [regBuf, boldBuf] = await Promise.all([
          regRes.arrayBuffer(),
          boldRes.arrayBuffer(),
        ]);
        return {
          regular: arrayBufferToBase64(regBuf),
          bold: arrayBufferToBase64(boldBuf),
        };
      } catch {
        return null;
      }
    })();
  }
  return cachedFontsPromise;
}

// ============================================================================
// VECTOR RENDERING PRIMITIVES
// ============================================================================

export interface FontState {
  hasArabicFont: boolean;
}

function setFontForRun(
  doc: jsPDF,
  kind: 'ar' | 'lat',
  weight: 'normal' | 'bold',
  state: FontState
) {
  if (kind === 'ar' && state.hasArabicFont) {
    doc.setFont('NotoSansArabic', weight);
  } else {
    doc.setFont('helvetica', weight);
  }
}

export function measureMixedWidth(
  doc: jsPDF,
  text: string,
  fontSize: number,
  weight: 'normal' | 'bold',
  baseRtl: boolean,
  state: FontState
): number {
  doc.setFontSize(fontSize);
  const runs = splitMixedRuns(text, baseRtl);
  let total = 0;
  for (const run of runs) {
    setFontForRun(doc, run.kind, weight, state);
    total += doc.getTextWidth(run.renderText);
  }
  return total;
}

export function drawMixedText(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  opts: {
    fontSize: number;
    weight?: 'normal' | 'bold';
    align?: 'left' | 'center' | 'right';
    baseRtl?: boolean;
    color?: [number, number, number];
  },
  state: FontState
) {
  const {
    fontSize,
    weight = 'normal',
    align = 'left',
    baseRtl = ARABIC_CHAR_REGEX.test(text),
    color = [28, 42, 14],
  } = opts;

  const runs = splitMixedRuns(text, baseRtl);
  if (runs.length === 0) return;

  doc.setFontSize(fontSize);
  doc.setTextColor(color[0], color[1], color[2]);

  const runWidths = runs.map((run) => {
    setFontForRun(doc, run.kind, weight, state);
    return doc.getTextWidth(run.renderText);
  });
  const totalWidth = runWidths.reduce((a, b) => a + b, 0);

  let cursorX = x;
  if (align === 'right') {
    cursorX = x - totalWidth;
  } else if (align === 'center') {
    cursorX = x - totalWidth / 2;
  }

  for (let i = 0; i < runs.length; i++) {
    const run = runs[i];
    setFontForRun(doc, run.kind, weight, state);
    doc.text(run.renderText, cursorX, y);
    cursorX += runWidths[i];
  }
}

export function wrapMixedLines(
  doc: jsPDF,
  text: string,
  maxWidth: number,
  fontSize: number,
  weight: 'normal' | 'bold',
  baseRtl: boolean,
  state: FontState
): string[] {
  const words = String(text ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [''];

  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (measureMixedWidth(doc, candidate, fontSize, weight, baseRtl, state) <= maxWidth) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function detectImageFormat(dataUrl: string): 'PNG' | 'JPEG' | 'WEBP' {
  const lower = dataUrl.slice(0, 40).toLowerCase();
  if (lower.includes('image/png')) return 'PNG';
  if (lower.includes('image/webp')) return 'WEBP';
  return 'JPEG';
}

// ============================================================================
// PUBLIC EXPORT
// ============================================================================

export async function downloadTranscriptPdf(opts: {
  attempt: ExamAttempt;
  userName: string;
  userEmail?: string;
  trackLabel: string;
  subjects: Subject[];
  lang: Language;
  passingScore?: number;
  maxScore?: number;
}): Promise<void> {
  const {
    attempt,
    userName,
    userEmail,
    trackLabel,
    subjects,
    lang,
    passingScore = 10,
    maxScore = 20,
  } = opts;

  const isRtl = lang === 'ar';
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const fontData = await loadArabicFonts();
  const fontState: FontState = { hasArabicFont: false };

  if (fontData) {
    doc.addFileToVFS('NotoSansArabic-Regular.ttf', fontData.regular);
    doc.addFont('NotoSansArabic-Regular.ttf', 'NotoSansArabic', 'normal');
    doc.addFileToVFS('NotoSansArabic-Bold.ttf', fontData.bold);
    doc.addFont('NotoSansArabic-Bold.ttf', 'NotoSansArabic', 'bold');
    fontState.hasArabicFont = true;
  }

  const PAGE_W = doc.internal.pageSize.getWidth(); // 210
  const PAGE_H = doc.internal.pageSize.getHeight(); // 297
  const MARGIN_X = 14;
  const CONTENT_W = PAGE_W - MARGIN_X * 2; // 182
  const BOTTOM_SAFE_Y = PAGE_H - 18;

  const score = Number(attempt.score_20 ?? 0);
  const passed = score >= passingScore;
  const dateStr = new Date(
    attempt.submitted_at || attempt.started_at || Date.now()
  ).toLocaleString(localeCode(lang), {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const modeLabel =
    attempt.mode === 'official_sim'
      ? tr(
          lang,
          'المحاكاة الرسمية للامتحان',
          'Simulation officielle du concours',
          'Official Competition Simulation'
        )
      : attempt.mode === 'placement'
        ? tr(lang, 'اختبار تحديد المستوى', 'Test de positionnement', 'Placement Test')
        : tr(lang, 'امتحان تجريبي', 'Examen blanc', 'Mock Exam');

  const examTitle =
    lang === 'ar' ? attempt.title_ar || modeLabel : attempt.title_fr || modeLabel;

  let y = 14;

  // --------------------------------------------------------------------------
  // 1. HEADER BANNER
  // --------------------------------------------------------------------------
  const bannerH = 26;
  doc.setFillColor(11, 34, 23); // #0b2217
  doc.roundedRect(MARGIN_X, y, CONTENT_W, bannerH, 3, 3, 'F');
  doc.setFillColor(166, 206, 57); // #A6CE39 accent stripe
  doc.rect(MARGIN_X, y + bannerH - 2, CONTENT_W, 2, 'F');

  const headerPrimaryX = isRtl ? PAGE_W - MARGIN_X - 6 : MARGIN_X + 6;
  const headerSecondaryX = isRtl ? MARGIN_X + 6 : PAGE_W - MARGIN_X - 6;
  const primaryAlign = isRtl ? 'right' : 'left';
  const secondaryAlign = isRtl ? 'left' : 'right';

  drawMixedText(
    doc,
    tr(
      lang,
      'منصة التدريب الحر – تدريبي',
      'Plateforme de Formation Libre – Tadribi',
      'Free Training Platform – Tadribi'
    ),
    headerPrimaryX,
    y + 8.5,
    { fontSize: 9.5, weight: 'bold', align: primaryAlign, baseRtl: isRtl, color: [200, 224, 133] },
    fontState
  );

  drawMixedText(
    doc,
    tr(
      lang,
      'كشف الدرجات والتقييم الرسمي',
      'Relevé officiel des notes',
      'Official Exam Transcript'
    ),
    headerPrimaryX,
    y + 17.5,
    { fontSize: 15, weight: 'bold', align: primaryAlign, baseRtl: isRtl, color: [255, 255, 255] },
    fontState
  );

  drawMixedText(
    doc,
    `#${attempt.id}`,
    headerSecondaryX,
    y + 9.5,
    { fontSize: 10.5, weight: 'bold', align: secondaryAlign, baseRtl: false, color: [166, 206, 57] },
    fontState
  );

  drawMixedText(
    doc,
    dateStr,
    headerSecondaryX,
    y + 16.5,
    { fontSize: 8.5, weight: 'normal', align: secondaryAlign, baseRtl: false, color: [220, 231, 223] },
    fontState
  );

  y += bannerH + 6;

  // --------------------------------------------------------------------------
  // 2. CANDIDATE PROFILE + FINAL SCORE CARD
  // --------------------------------------------------------------------------
  const profileCardH = 34;
  doc.setFillColor(247, 249, 250);
  doc.setDrawColor(216, 223, 226);
  doc.setLineWidth(0.35);
  doc.roundedRect(MARGIN_X, y, CONTENT_W, profileCardH, 2.5, 2.5, 'FD');

  const scoreBoxW = 46;
  const scoreBoxX = isRtl ? MARGIN_X + 4 : PAGE_W - MARGIN_X - 4 - scoreBoxW;
  const scoreBoxY = y + 4;
  const scoreBoxH = profileCardH - 8;

  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(passed ? 83 : 217, passed ? 206 : 119, passed ? 57 : 6);
  doc.setLineWidth(0.6);
  doc.roundedRect(scoreBoxX, scoreBoxY, scoreBoxW, scoreBoxH, 2, 2, 'FD');

  drawMixedText(
    doc,
    tr(lang, 'العلامة النهائية', 'Note finale', 'Final Score'),
    scoreBoxX + scoreBoxW / 2,
    scoreBoxY + 6.5,
    { fontSize: 8, weight: 'bold', align: 'center', baseRtl: isRtl, color: [107, 120, 126] },
    fontState
  );

  drawMixedText(
    doc,
    `${score.toFixed(2)} / ${maxScore}`,
    scoreBoxX + scoreBoxW / 2,
    scoreBoxY + 15.5,
    { fontSize: 13.5, weight: 'bold', align: 'center', baseRtl: false, color: [28, 42, 14] },
    fontState
  );

  drawMixedText(
    doc,
    passed
      ? tr(lang, 'ناجح فوق العتبة', 'Admis au seuil', 'Passed')
      : tr(lang, 'يحتاج مراجعة مركزة', 'Révision requise', 'Needs Review'),
    scoreBoxX + scoreBoxW / 2,
    scoreBoxY + 22,
    {
      fontSize: 8,
      weight: 'bold',
      align: 'center',
      baseRtl: isRtl,
      color: passed ? [27, 122, 44] : [180, 83, 9],
    },
    fontState
  );

  // Candidate photo (if captured)
  let infoOffset = 0;
  const photoSize = 24;
  if (attempt.camera_photo_data_url && attempt.camera_photo_data_url.startsWith('data:image/')) {
    try {
      const photoX = isRtl ? PAGE_W - MARGIN_X - 5 - photoSize : MARGIN_X + 5;
      const photoY = y + 5;
      doc.setDrawColor(166, 206, 57);
      doc.setLineWidth(0.5);
      doc.roundedRect(photoX - 0.5, photoY - 0.5, photoSize + 1, photoSize + 1, 1.5, 1.5, 'S');
      doc.addImage(
        attempt.camera_photo_data_url,
        detectImageFormat(attempt.camera_photo_data_url),
        photoX,
        photoY,
        photoSize,
        photoSize
      );
      infoOffset = photoSize + 4.5;
    } catch {
      infoOffset = 0;
    }
  }

  const infoAnchorX = isRtl
    ? PAGE_W - MARGIN_X - 5 - infoOffset
    : MARGIN_X + 5 + infoOffset;
  const infoMaxW = CONTENT_W - scoreBoxW - 16 - infoOffset;

  drawMixedText(
    doc,
    tr(lang, 'المترشح(ة)', 'Candidat(e)', 'Candidate'),
    infoAnchorX,
    y + 8,
    { fontSize: 8, weight: 'bold', align: primaryAlign, baseRtl: isRtl, color: [107, 120, 126] },
    fontState
  );

  drawMixedText(
    doc,
    userName || tr(lang, 'مترشح منصة تدريبي', 'Candidat Tadribi', 'Tadribi Candidate'),
    infoAnchorX,
    y + 15,
    { fontSize: 12.5, weight: 'bold', align: primaryAlign, baseRtl: isRtl, color: [28, 42, 14] },
    fontState
  );

  if (userEmail) {
    drawMixedText(
      doc,
      userEmail,
      infoAnchorX,
      y + 21,
      { fontSize: 8.5, weight: 'normal', align: primaryAlign, baseRtl: false, color: [90, 107, 115] },
      fontState
    );
  }

  const trackLine = wrapMixedLines(
    doc,
    `${tr(lang, 'الشعبة:', 'Filière :', 'Track:')} ${trackLabel}  |  ${examTitle}`,
    infoMaxW,
    8.5,
    'bold',
    isRtl,
    fontState
  )[0];
  drawMixedText(
    doc,
    trackLine,
    infoAnchorX,
    y + (userEmail ? 27.5 : 23),
    { fontSize: 8.5, weight: 'bold', align: primaryAlign, baseRtl: isRtl, color: [56, 77, 85] },
    fontState
  );

  y += profileCardH + 6;

  // --------------------------------------------------------------------------
  // 3. 4-CARD SUMMARY KPI STRIP
  // --------------------------------------------------------------------------
  const kpiGap = 3.5;
  const kpiW = (CONTENT_W - kpiGap * 3) / 4;
  const kpiH = 16;
  const kpis: {
    label: string;
    value: string;
    bg: [number, number, number];
    border: [number, number, number];
    labelColor: [number, number, number];
    valueColor: [number, number, number];
  }[] = [
    {
      label: tr(lang, 'الصحيحة', 'Correctes', 'Correct'),
      value: String(attempt.correct_count ?? 0),
      bg: [240, 253, 244],
      border: [187, 247, 208],
      labelColor: [22, 101, 52],
      valueColor: [21, 128, 61],
    },
    {
      label: tr(lang, 'الخاطئة', 'Erronées', 'Wrong'),
      value: String(attempt.wrong_count ?? 0),
      bg: [254, 242, 242],
      border: [254, 202, 202],
      labelColor: [153, 27, 27],
      valueColor: [185, 28, 28],
    },
    {
      label: tr(lang, 'غير مجاب', 'Sans réponse', 'Unanswered'),
      value: String(attempt.unanswered_count ?? 0),
      bg: [255, 251, 235],
      border: [253, 230, 138],
      labelColor: [146, 64, 14],
      valueColor: [180, 83, 9],
    },
    {
      label: tr(lang, 'النسبة المئوية', 'Pourcentage', 'Percentage'),
      value: `${attempt.percentage ?? 0}%`,
      bg: [244, 246, 247],
      border: [216, 223, 226],
      labelColor: [56, 77, 85],
      valueColor: [28, 42, 14],
    },
  ];

  const orderedKpis = isRtl ? [...kpis].reverse() : kpis;
  orderedKpis.forEach((k, idx) => {
    const bx = MARGIN_X + idx * (kpiW + kpiGap);
    doc.setFillColor(k.bg[0], k.bg[1], k.bg[2]);
    doc.setDrawColor(k.border[0], k.border[1], k.border[2]);
    doc.setLineWidth(0.3);
    doc.roundedRect(bx, y, kpiW, kpiH, 2, 2, 'FD');

    drawMixedText(
      doc,
      k.label,
      bx + kpiW / 2,
      y + 5.5,
      { fontSize: 8, weight: 'bold', align: 'center', baseRtl: isRtl, color: k.labelColor },
      fontState
    );
    drawMixedText(
      doc,
      k.value,
      bx + kpiW / 2,
      y + 12.5,
      { fontSize: 12, weight: 'bold', align: 'center', baseRtl: false, color: k.valueColor },
      fontState
    );
  });

  y += kpiH + 8;

  // --------------------------------------------------------------------------
  // 4. PAGINATED VECTOR TABLE RENDERER
  // --------------------------------------------------------------------------
  const ensureSpace = (neededH: number, onNewPage?: () => void) => {
    if (y + neededH > BOTTOM_SAFE_Y) {
      doc.addPage();
      y = 16;
      if (onNewPage) onNewPage();
    }
  };

  interface TableCol {
    header: string;
    width: number;
    align: 'left' | 'center' | 'right';
  }

  const renderVectorTable = (
    title: string,
    accentColor: [number, number, number],
    columns: TableCol[],
    rows: { cells: string[]; pctColor?: [number, number, number] }[]
  ) => {
    if (rows.length === 0) return;

    const drawSectionHeader = () => {
      drawMixedText(
        doc,
        title,
        isRtl ? PAGE_W - MARGIN_X : MARGIN_X,
        y + 4.5,
        { fontSize: 11, weight: 'bold', align: primaryAlign, baseRtl: isRtl, color: [26, 68, 48] },
        fontState
      );
      doc.setDrawColor(accentColor[0], accentColor[1], accentColor[2]);
      doc.setLineWidth(0.6);
      doc.line(MARGIN_X, y + 6.8, PAGE_W - MARGIN_X, y + 6.8);
      y += 9;
    };

    const orderedCols = isRtl ? [...columns].reverse() : columns;

    const drawTableHeader = () => {
      const hdrH = 8;
      doc.setFillColor(238, 243, 236);
      doc.setDrawColor(216, 223, 226);
      doc.setLineWidth(0.25);
      doc.rect(MARGIN_X, y, CONTENT_W, hdrH, 'FD');

      let cx = MARGIN_X;
      orderedCols.forEach((col) => {
        const tx =
          col.align === 'center'
            ? cx + col.width / 2
            : col.align === 'right'
              ? cx + col.width - 3
              : cx + 3;
        drawMixedText(
          doc,
          col.header,
          tx,
          y + 5.3,
          { fontSize: 8.5, weight: 'bold', align: col.align, baseRtl: isRtl, color: [28, 42, 14] },
          fontState
        );
        cx += col.width;
      });
      y += hdrH;
    };

    ensureSpace(24);
    drawSectionHeader();
    drawTableHeader();

    rows.forEach((row, rowIdx) => {
      const orderedCells = isRtl ? [...row.cells].reverse() : row.cells;
      const firstColIdx = isRtl ? orderedCols.length - 1 : 0;
      const labelLines = wrapMixedLines(
        doc,
        orderedCells[firstColIdx],
        orderedCols[firstColIdx].width - 6,
        8.5,
        'bold',
        isRtl,
        fontState
      );
      const rowH = Math.max(8, labelLines.length * 4.6 + 3.5);

      ensureSpace(rowH + 2, () => {
        drawSectionHeader();
        drawTableHeader();
      });

      if (rowIdx % 2 === 1) {
        doc.setFillColor(250, 251, 250);
        doc.rect(MARGIN_X, y, CONTENT_W, rowH, 'F');
      }

      doc.setDrawColor(232, 236, 238);
      doc.setLineWidth(0.2);
      doc.line(MARGIN_X, y + rowH, PAGE_W - MARGIN_X, y + rowH);

      let cx = MARGIN_X;
      orderedCols.forEach((col, cIdx) => {
        const val = orderedCells[cIdx];
        const tx =
          col.align === 'center'
            ? cx + col.width / 2
            : col.align === 'right'
              ? cx + col.width - 3
              : cx + 3;

        const isNameCol = cIdx === firstColIdx;
        const isLastMetricCol = isRtl ? cIdx === 0 : cIdx === orderedCols.length - 1;

        if (isNameCol) {
          labelLines.forEach((ln, lIdx) => {
            drawMixedText(
              doc,
              ln,
              tx,
              y + 5 + lIdx * 4.6,
              { fontSize: 8.5, weight: 'bold', align: col.align, baseRtl: isRtl, color: [28, 42, 14] },
              fontState
            );
          });
        } else {
          drawMixedText(
            doc,
            val,
            tx,
            y + rowH / 2 + 1.3,
            {
              fontSize: 8.5,
              weight: 'bold',
              align: col.align,
              baseRtl: false,
              color:
                isLastMetricCol && row.pctColor
                  ? row.pctColor
                  : [56, 77, 85],
            },
            fontState
          );
        }
        cx += col.width;
      });

      y += rowH;
    });

    y += 7;
  };

  // Subject breakdown table
  const subjectMap = new Map(subjects.map((s) => [s.slug, s]));
  const subjectBreakdown = attempt.subject_breakdown || [];
  const subjectRows = subjectBreakdown.map((sb) => {
    const sub = subjectMap.get(sb.subject_slug);
    const subName = sub
      ? lang === 'ar'
        ? sub.name_ar
        : sub.name_fr
      : sb.subject_slug;
    const subScore20 = Number(((sb.percentage / 100) * maxScore).toFixed(2));
    const pctColor: [number, number, number] =
      sb.percentage >= 70 ? [27, 122, 44] : sb.percentage >= 50 ? [103, 136, 19] : [180, 83, 9];
    return {
      cells: [
        subName,
        `${sb.correct} / ${sb.total}`,
        `${sb.percentage}%`,
        `${subScore20} / ${maxScore}`,
      ],
      pctColor,
    };
  });

  renderVectorTable(
    tr(lang, 'تفصيل النتائج حسب المادة', 'Résultats détaillés par matière', 'Score Breakdown by Subject'),
    [166, 206, 57],
    [
      { header: tr(lang, 'المادة', 'Matière', 'Subject'), width: 86, align: isRtl ? 'right' : 'left' },
      { header: tr(lang, 'الإجابات', 'Réponses', 'Answers'), width: 32, align: 'center' },
      { header: tr(lang, 'النسبة', 'Taux', 'Rate'), width: 30, align: 'center' },
      { header: tr(lang, 'النقطة', 'Note', 'Score'), width: 34, align: 'center' },
    ],
    subjectRows
  );

  // Topic breakdown table (full list, safely paginated across pages)
  const topicBreakdown = attempt.topic_breakdown || [];
  const topicRows = topicBreakdown.map((tb) => {
    const tName = lang === 'ar' ? tb.topic_ar : tb.topic_fr;
    const pctColor: [number, number, number] =
      tb.percentage >= 70 ? [27, 122, 44] : tb.percentage >= 50 ? [103, 136, 19] : [180, 83, 9];
    return {
      cells: [tName, `${tb.correct} / ${tb.total}`, `${tb.percentage}%`],
      pctColor,
    };
  });

  renderVectorTable(
    tr(lang, 'تحليل الأداء حسب المحاور', 'Analyse par thème', 'Performance by Topic'),
    [200, 212, 218],
    [
      { header: tr(lang, 'المحور', 'Thème', 'Topic'), width: 112, align: isRtl ? 'right' : 'left' },
      { header: tr(lang, 'الإجابات', 'Score', 'Score'), width: 36, align: 'center' },
      { header: tr(lang, 'النسبة', 'Taux', 'Rate'), width: 34, align: 'center' },
    ],
    topicRows
  );

  // --------------------------------------------------------------------------
  // 5. FOOTER ON EVERY PAGE
  // --------------------------------------------------------------------------
  const totalPages = doc.getNumberOfPages();
  const footerText = tr(
    lang,
    'مُصدر إلكترونياً من منصة التدريب الحر – تدريبي',
    'Généré électroniquement par Tadribi – Formation Libre',
    'Issued electronically by Tadribi – Free Training Platform'
  );

  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setDrawColor(207, 214, 218);
    doc.setLineWidth(0.25);
    doc.line(MARGIN_X, PAGE_H - 13, PAGE_W - MARGIN_X, PAGE_H - 13);

    drawMixedText(
      doc,
      footerText,
      isRtl ? PAGE_W - MARGIN_X : MARGIN_X,
      PAGE_H - 8,
      { fontSize: 8, weight: 'normal', align: primaryAlign, baseRtl: isRtl, color: [107, 120, 126] },
      fontState
    );

    drawMixedText(
      doc,
      `${dateStr}   |   ${p} / ${totalPages}`,
      isRtl ? MARGIN_X : PAGE_W - MARGIN_X,
      PAGE_H - 8,
      { fontSize: 8, weight: 'normal', align: secondaryAlign, baseRtl: false, color: [107, 120, 126] },
      fontState
    );
  }

  doc.save(`tadribi-transcript-${attempt.id}.pdf`);
}
