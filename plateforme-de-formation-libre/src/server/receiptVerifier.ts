import crypto from 'crypto';
import { GoogleGenAI, Type } from '@google/genai';
import type Database from 'better-sqlite3';
import sharp from 'sharp';

export type ReceiptMethod = 'sedad' | 'masrvi' | 'bankily';
export type RiskLevel = 'normal' | 'warning' | 'suspicious' | 'fraud_rejected';

export interface RejectionIssue {
  code: string;
  field: 'app' | 'status' | 'transaction_id' | 'duplicate' | 'date' | 'amount' | 'beneficiary' | 'file';
  foundValue?: string;
  expectedValue?: string;
  messageAr: string;
  messageFr: string;
  messageEn: string;
}

export interface ReceiptInspectionResult {
  inspectionId: string;
  status: 'verified' | 'underpaid' | 'manual_review' | 'rejected';
  verdict: 'verified' | 'underpaid' | 'manual_review' | 'rejected';
  riskLevel: RiskLevel;
  reason: string;
  reasonFr: string;
  reasonEn: string;
  rejectionIssues?: RejectionIssue[];
  requiredAmount?: number;
  paidAmount?: number;
  remainingAmount?: number;
  stagesCompleted: number;
  warnings: string[];
  extracted: {
    appDetected: string;
    amount: number | null;
    currency: string;
    transactionId: string;
    transactionReference: string;
    transactionAt: string;
    beneficiaryName: string;
    beneficiaryAccount: string;
    confidence: number;
    dimensions: { width: number; height: number } | null;
    mimeType: string;
    proofHash: string;
  };
  forensics: {
    magicBytesValid: boolean;
    dimensionsValid: boolean;
    editingSoftwareDetected: string[];
    aiGenerationSignals: string[];
    contradictions: string[];
    duplicateMatch: string | null;
    ocrEngine: 'gemini' | 'tesseract' | 'hybrid';
    amountComparison: 'match' | 'overpaid' | 'underpaid' | 'unreadable';
    recencyHours: number | null;
    priorRejections24h: number;
  };
}

const EXPECTED_BENEFICIARY_TOKENS = ['abderahmane', 'mohamed', 'lemine', 'عبدالرحمن', 'عبد الرحمن', 'محمد الامين', 'لمين'];
const EXPECTED_ACCOUNT_NUMBERS = ['47526504'];

const EDITING_OR_AI_SIGNATURES = [
  'adobe photoshop',
  'photoshop',
  'gimp',
  'canva',
  'picsart',
  'snapseed',
  'remini',
  'photopea',
  'pixlr',
  'midjourney',
  'dall-e',
  'dall·e',
  'stable diffusion',
  'comfyui',
  'automatic1111',
  'firefly',
  'ideogram',
  'leonardo.ai',
  'ai generated',
  'c2pa',
];

function normalizeArabicDigits(input: string): string {
  return input
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

function decodeImageDataUrl(dataUrl: string): {
  mimeType: string;
  buffer: Buffer;
} | null {
  const match = String(dataUrl || '').match(/^data:(image\/(?:png|jpeg|jpg|webp));base64,([A-Za-z0-9+/=\s]+)$/i);
  if (!match) return null;
  const mimeType = match[1].toLowerCase() === 'image/jpg' ? 'image/jpeg' : match[1].toLowerCase();
  const base64Clean = match[2].replace(/\s+/g, '');
  try {
    const buffer = Buffer.from(base64Clean, 'base64');
    return { mimeType, buffer };
  } catch {
    return null;
  }
}

function checkMagicBytes(buffer: Buffer, mimeType: string): boolean {
  if (buffer.length < 16) return false;
  if (mimeType === 'image/png') {
    return (
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a
    );
  }
  if (mimeType === 'image/jpeg') {
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (mimeType === 'image/webp') {
    return (
      buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buffer.subarray(8, 12).toString('ascii') === 'WEBP'
    );
  }
  return false;
}

function extractDimensions(buffer: Buffer, mimeType: string): { width: number; height: number } | null {
  try {
    if (mimeType === 'image/png' && buffer.length >= 24) {
      if (buffer.subarray(12, 16).toString('ascii') === 'IHDR') {
        const width = buffer.readUInt32BE(16);
        const height = buffer.readUInt32BE(20);
        return { width, height };
      }
    }
    if (mimeType === 'image/jpeg') {
      let offset = 2;
      while (offset + 8 < buffer.length) {
        if (buffer[offset] !== 0xff) {
          offset++;
          continue;
        }
        const marker = buffer[offset + 1];
        if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
          offset += 2;
          continue;
        }
        const segLen = buffer.readUInt16BE(offset + 2);
        if (
          (marker >= 0xc0 && marker <= 0xc3) ||
          (marker >= 0xc5 && marker <= 0xc7) ||
          (marker >= 0xc9 && marker <= 0xcb) ||
          (marker >= 0xcd && marker <= 0xcf)
        ) {
          if (offset + 9 <= buffer.length) {
            const height = buffer.readUInt16BE(offset + 5);
            const width = buffer.readUInt16BE(offset + 7);
            return { width, height };
          }
        }
        if (segLen < 2) break;
        offset += 2 + segLen;
      }
    }
    if (mimeType === 'image/webp' && buffer.length >= 30) {
      const chunk = buffer.subarray(12, 16).toString('ascii');
      if (chunk === 'VP8X') {
        const w = 1 + buffer.readUIntLE(24, 3);
        const h = 1 + buffer.readUIntLE(27, 3);
        return { width: w, height: h };
      }
      if (chunk === 'VP8 ' && buffer.length >= 30) {
        const w = buffer.readUInt16LE(26) & 0x3fff;
        const h = buffer.readUInt16LE(28) & 0x3fff;
        return { width: w, height: h };
      }
      if (chunk === 'VP8L' && buffer.length >= 25) {
        const bits = buffer.readUInt32LE(21);
        const w = (bits & 0x3fff) + 1;
        const h = ((bits >> 14) & 0x3fff) + 1;
        return { width: w, height: h };
      }
    }
  } catch {
    return null;
  }
  return null;
}

function inspectMetadataSignatures(buffer: Buffer): {
  editingTools: string[];
  aiSignals: string[];
  embeddedText: string;
} {
  // Scan metadata region (first 64KB + last 16KB for XMP/tEXt/iTXt/EXIF strings)
  const head = buffer.subarray(0, Math.min(buffer.length, 65536)).toString('latin1');
  const tail = buffer.length > 65536 ? buffer.subarray(Math.max(0, buffer.length - 16384)).toString('latin1') : '';
  const combined = `${head}\n${tail}`;
  const lower = combined.toLowerCase();

  const editingTools: string[] = [];
  const aiSignals: string[] = [];
  for (const sig of EDITING_OR_AI_SIGNATURES) {
    if (lower.includes(sig)) {
      if (
        sig === 'midjourney' ||
        sig === 'dall-e' ||
        sig === 'dall·e' ||
        sig === 'stable diffusion' ||
        sig === 'comfyui' ||
        sig === 'automatic1111' ||
        sig === 'firefly' ||
        sig === 'ideogram' ||
        sig === 'leonardo.ai' ||
        sig === 'ai generated' ||
        sig === 'c2pa'
      ) {
        aiSignals.push(sig);
      } else {
        editingTools.push(sig);
      }
    }
  }

  // Extract printable ASCII/UTF-8 text snippets if embedded in PNG tEXt/iTXt or JPEG COM/APP markers
  const printableMatches = combined.match(/[A-Za-z0-9:/._\-@+,\s]{6,}/g) || [];
  const embeddedText = printableMatches.slice(0, 60).join(' ');
  return { editingTools, aiSignals, embeddedText };
}

function computePerceptualSignature(buffer: Buffer): string {
  // Structural 32-bucket frequency fingerprint resistant to minor header/metadata tweaks
  const skipHead = Math.min(128, Math.floor(buffer.length * 0.05));
  const body = buffer.subarray(skipHead);
  if (body.length < 32) {
    return crypto.createHash('sha1').update(buffer).digest('hex').slice(0, 24);
  }
  const buckets = new Array<number>(32).fill(0);
  const step = Math.max(1, Math.floor(body.length / 4096));
  for (let i = 0; i < body.length; i += step) {
    const idx = Math.min(31, Math.floor((i * 32) / body.length));
    buckets[idx] += body[i];
  }
  const avg = buckets.reduce((a, b) => a + b, 0) / 32;
  const bits = buckets.map((v) => (v >= avg ? '1' : '0')).join('');
  return parseInt(bits, 2).toString(16).padStart(8, '0');
}

export type DecodedReceiptResult =
  | {
      ok: true;
      mimeType: string;
      buffer: Buffer;
      dimensions: { width: number; height: number };
      proofHash: string;
      perceptualHash: string;
    }
  | {
      ok: false;
      reason: string;
      reasonFr: string;
      reasonEn: string;
      riskLevel: RiskLevel;
      technicalReason: string;
      mimeType?: string;
      magicBytesValid?: boolean;
      dimensions?: { width: number; height: number } | null;
    };

export function validateAndDecodeReceiptDataUrl(
  proofDataUrl: string,
  expectedMimeType?: string
): DecodedReceiptResult {
  const decoded = decodeImageDataUrl(proofDataUrl);
  if (!decoded || decoded.buffer.length < 800 || decoded.buffer.length > 6_000_000) {
    return {
      ok: false,
      reason: 'تم رفض الإيصال لأن الملف غير صالح أو لا يمكن قراءته.',
      reasonFr: 'Le reçu a été rejeté car le fichier est invalide ou illisible.',
      reasonEn: 'Receipt rejected because the file is invalid or unreadable.',
      riskLevel: 'suspicious',
      technicalReason: decoded
        ? `byte_size_out_of_bounds:${decoded.buffer.length}`
        : 'invalid_data_url_header_or_base64',
    };
  }

  const { mimeType, buffer } = decoded;
  const normExpected =
    expectedMimeType?.toLowerCase() === 'image/jpg'
      ? 'image/jpeg'
      : expectedMimeType?.toLowerCase().trim() || '';
  if (normExpected && normExpected !== mimeType) {
    return {
      ok: false,
      reason: 'تم رفض الإيصال لأن الملف غير صالح أو لا يمكن قراءته.',
      reasonFr: 'Le reçu a été rejeté car le format du fichier est incompatible.',
      reasonEn: 'Receipt rejected because the file format does not match.',
      riskLevel: 'suspicious',
      technicalReason: `mime_mismatch:${normExpected}!=${mimeType}`,
      mimeType,
    };
  }

  const magicBytesValid = checkMagicBytes(buffer, mimeType);
  if (!magicBytesValid) {
    return {
      ok: false,
      reason: 'تم رفض الإيصال لأن الملف غير صالح أو لا يمكن قراءته.',
      reasonFr: 'Le reçu a été rejeté car le fichier image est corrompu ou non conforme.',
      reasonEn: 'Receipt rejected because the image binary is invalid or corrupted.',
      riskLevel: 'fraud_rejected',
      technicalReason: `magic_bytes_invalid:${mimeType}`,
      mimeType,
      magicBytesValid: false,
    };
  }

  const dimensions = extractDimensions(buffer, mimeType);
  const dimensionsValid = Boolean(
    dimensions &&
      dimensions.width >= 160 &&
      dimensions.height >= 160 &&
      dimensions.width <= 12000 &&
      dimensions.height <= 12000 &&
      dimensions.width / dimensions.height <= 6 &&
      dimensions.height / dimensions.width <= 6
  );
  if (!dimensionsValid || !dimensions) {
    return {
      ok: false,
      reason: 'تم رفض الإيصال لأن الملف غير صالح أو دقة الصورة غير كافية لقراءة البيانات.',
      reasonFr: 'Le reçu a été rejeté car la résolution de l’image est insuffisante.',
      reasonEn: 'Receipt rejected because image dimensions are unreadable or too small.',
      riskLevel: 'suspicious',
      technicalReason: `dimensions_invalid:${dimensions ? `${dimensions.width}x${dimensions.height}` : 'null'}`,
      mimeType,
      magicBytesValid,
      dimensions,
    };
  }

  const proofHash = crypto.createHash('sha256').update(buffer).digest('hex');
  const perceptualHash = computePerceptualSignature(buffer);

  return {
    ok: true,
    mimeType,
    buffer,
    dimensions,
    proofHash,
    perceptualHash,
  };
}

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

interface ParsedReceiptFields {
  appDetected: string;
  transactionId: string;
  transactionReference: string;
  transactionAt: string;
  amount: number | null;
  currency: string;
  beneficiaryName: string;
  beneficiaryAccount: string;
  transferStatus: 'success' | 'failed' | 'pending' | 'unknown';
  tamperingSignals: string[];
  confidence: number;
  rawText: string;
  ocrEngine: 'gemini' | 'tesseract' | 'hybrid';
}

function normalizeAmPmHour(hourNum: number, meridiem?: string): number {
  const m = (meridiem || '').trim().toLowerCase();
  if (!m) return hourNum;
  if ((m === 'pm' || m === 'م') && hourNum >= 1 && hourNum <= 11) return hourNum + 12;
  if ((m === 'am' || m === 'ص') && hourNum === 12) return 0;
  return hourNum;
}

const MONTH_NAME_MAP: Record<string, number> = {
  jan: 1, janvier: 1, january: 1,
  feb: 2, fev: 2, févr: 2, fevrier: 2, février: 2, february: 2,
  mar: 3, mars: 3, march: 3,
  apr: 4, avr: 4, avril: 4, april: 4,
  may: 5, mai: 5,
  jun: 6, juin: 6, june: 6,
  jul: 7, juil: 7, juillet: 7, july: 7,
  aug: 8, aout: 8, août: 8, august: 8,
  sep: 9, sept: 9, septembre: 9, september: 9,
  oct: 10, octobre: 10, october: 10,
  nov: 11, novembre: 11, november: 11,
  dec: 12, déc: 12, decembre: 12, décembre: 12, december: 12,
};

function parseReceiptDateToIso(rawDate: string): string {
  const cleaned = normalizeArabicDigits(rawDate || '')
    .replace(/\s+[àa]\s+/gi, ' ')
    .replace(/\s+-\s+(?=\d{1,2}:\d{2})/g, ' ')
    .trim();
  if (!cleaned) return '';

  // ISO or YYYY-MM-DD[ T]HH:MM[:SS][ AM|PM|ص|م]
  const isoMatch = cleaned.match(
    /(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[\sT,]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM|am|pm|ص|م)?)?/
  );
  if (isoMatch) {
    const [, y, m, d, hh, mm = '00', ss = '00', mer] = isoMatch;
    const hourNum = hh !== undefined ? normalizeAmPmHour(Number(hh), mer) : 0;
    const dt = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), hourNum, Number(mm), Number(ss)));
    if (!Number.isNaN(dt.getTime())) return dt.toISOString();
  }

  // DD/MM/YYYY or DD.MM.YYYY or DD-MM-YYYY [HH:MM[:SS]]
  const dmyMatch = cleaned.match(
    /(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(?:[\s,]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM|am|pm|ص|م)?)?/
  );
  if (dmyMatch) {
    const [, d, m, y, hh, mm = '00', ss = '00', mer] = dmyMatch;
    const hourNum = hh !== undefined ? normalizeAmPmHour(Number(hh), mer) : 0;
    const dt = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), hourNum, Number(mm), Number(ss)));
    if (!Number.isNaN(dt.getTime())) return dt.toISOString();
  }

  // DD month YYYY [HH:MM[:SS]] (French / English month names)
  const wordMonthMatch = cleaned.match(
    /(\d{1,2})\s+([A-Za-zÀ-ÿ]+)\.?\s+(\d{4})(?:[\s,]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM|am|pm|ص|م)?)?/i
  );
  if (wordMonthMatch) {
    const [, d, monRaw, y, hh, mm = '00', ss = '00', mer] = wordMonthMatch;
    const monNum = MONTH_NAME_MAP[monRaw.toLowerCase()];
    if (monNum) {
      const hourNum = hh !== undefined ? normalizeAmPmHour(Number(hh), mer) : 0;
      const dt = new Date(Date.UTC(Number(y), monNum - 1, Number(d), hourNum, Number(mm), Number(ss)));
      if (!Number.isNaN(dt.getTime())) return dt.toISOString();
    }
  }

  const parsed = Date.parse(cleaned);
  if (!Number.isNaN(parsed)) {
    return new Date(parsed).toISOString();
  }
  return '';
}

function parseMauritanianReceiptText(rawText: string): Omit<ParsedReceiptFields, 'ocrEngine' | 'tamperingSignals'> {
  const norm = normalizeArabicDigits(rawText || '');
  const lower = norm.toLowerCase();

  let appDetected = '';
  if (lower.includes('sedad') || norm.includes('السداد')) appDetected = 'sedad';
  else if (lower.includes('masrvi') || norm.includes('مصرفي')) appDetected = 'masrvi';
  else if (lower.includes('bankily') || norm.includes('بنكيلي')) appDetected = 'bankily';

  let transactionId = '';
  const txIdMatch = norm.match(
    /(?:transaction\s*id|id\s*transaction|n[°o]?\s*(?:op[ée]ration|transaction)|id\s*op|معرف\s*(?:المعاملة|العملية)|رقم\s*العملية)\s*[:#\-]?\s*([A-Z0-9\-_]{5,40})/i
  );
  if (txIdMatch) transactionId = txIdMatch[1].trim();

  let transactionReference = '';
  const refMatch = norm.match(
    /(?:r[ée]f[ée]rence|ref|reference|مرجع\s*(?:العملية|التحويل)|المرجع)\s*[:#\-]?\s*([A-Z0-9\-_]{5,40})/i
  );
  if (refMatch) transactionReference = refMatch[1].trim();

  if (!transactionId && transactionReference) transactionId = transactionReference;
  if (!transactionReference && transactionId) transactionReference = transactionId;

  // Fallback code patterns like TX-123456, SED-..., BNK-..., MSR-... or 8-16 digit numeric operation ID
  if (!transactionId) {
    const codeMatch = norm.match(/\b((?:TX|SED|BNK|MSR|OP|REF)[A-Z0-9\-_]{4,24})\b/i);
    if (codeMatch) {
      transactionId = codeMatch[1];
      transactionReference = codeMatch[1];
    }
  }

  let amount: number | null = null;
  let currency = 'MRU';
  const amountCurrencyMatch = norm.match(
    /(\d[\d\s,.]{0,12})\s*(?:MRU|UM|أوقية|أوقية\s*جديدة)/i
  );
  if (amountCurrencyMatch) {
    const numStr = amountCurrencyMatch[1].replace(/[\s,](?=\d{3}\b)/g, '').replace(',', '.').replace(/\s+/g, '');
    const val = Number(numStr);
    if (Number.isFinite(val) && val > 0) amount = val;
  } else {
    const labeledAmountMatch = norm.match(/(?:montant|amount|total|المبلغ)\s*[:\-]?\s*(\d[\d\s,.]{0,12})/i);
    if (labeledAmountMatch) {
      const numStr = labeledAmountMatch[1].replace(/[\s,](?=\d{3}\b)/g, '').replace(',', '.').replace(/\s+/g, '');
      const val = Number(numStr);
      if (Number.isFinite(val) && val > 0) amount = val;
    }
  }

  let transactionAt = '';
  const dateMatch = norm.match(
    /(\d{4}[-/.]\d{1,2}[-/.]\d{1,2}(?:(?:[\sT,]+|\s+[àa]\s+|\s+-\s+)\d{1,2}:\d{2}(?::\d{2})?(?:\s*(?:AM|PM|am|pm|ص|م))?)?|\d{1,2}[-/.]\d{1,2}[-/.]\d{4}(?:(?:[\s,]+|\s+[àa]\s+|\s+-\s+)\d{1,2}:\d{2}(?::\d{2})?(?:\s*(?:AM|PM|am|pm|ص|م))?)?|\d{1,2}\s+[A-Za-zÀ-ÿ]{3,10}\.?\s+\d{4}(?:(?:[\s,]+|\s+[àa]\s+)\d{1,2}:\d{2}(?::\d{2})?)?)/
  );
  if (dateMatch) {
    transactionAt = parseReceiptDateToIso(dateMatch[1]);
  }

  let beneficiaryName = '';
  const benMatch = norm.match(/(?:b[ée]n[ée]ficiaire|destinataire|beneficiary|المستفيد)\s*[:\-]?\s*([^\n\r,;]{3,80})/i);
  if (benMatch) {
    beneficiaryName = benMatch[1].trim();
  } else if (lower.includes('abderahmane')) {
    beneficiaryName = 'Abderahmane Mohamed Lemine';
  }

  let beneficiaryAccount = '';
  if (norm.includes('47526504')) {
    beneficiaryAccount = '47526504';
  } else {
    const accMatch = norm.match(/(?:compte|t[ée]l|num[ée]ro|رقم\s*الحساب|الهاتف)\s*[:\-]?\s*(\d{8,14})/i);
    if (accMatch) beneficiaryAccount = accMatch[1];
  }

  let transferStatus: 'success' | 'failed' | 'pending' | 'unknown' = 'unknown';
  if (/(?:échou|echou|annul|failed|rejected|error|فشل|ملغ|مرفوض)/i.test(norm)) {
    transferStatus = 'failed';
  } else if (/(?:en cours|pending|قيد الانتظار|معلق)/i.test(norm)) {
    transferStatus = 'pending';
  } else if (/(?:succ[èe]s|r[ée]ussi|effectu[ée]|valid[ée]|completed|success|ناجح|تم بنجاح|تم التحويل)/i.test(norm)) {
    transferStatus = 'success';
  }

  return {
    appDetected,
    transactionId,
    transactionReference,
    transactionAt,
    amount,
    currency,
    beneficiaryName,
    beneficiaryAccount,
    transferStatus,
    confidence: transactionId && amount ? 0.78 : 0.35,
    rawText: norm.slice(0, 1200),
  };
}

async function runGeminiVisionExtraction(
  buffer: Buffer,
  mimeType: string,
  expectedMethod: ReceiptMethod,
  expectedAmount: number
): Promise<ParsedReceiptFields | null> {
  const ai = getGeminiClient();
  if (!ai) return null;

  try {
    const prompt = [
      `Inspect this Mauritanian mobile money payment receipt image (expected app: ${expectedMethod}, expected plan amount: ${expectedAmount} MRU).`,
      'Extract exact visible fields ONLY as shown in the receipt without inventing anything:',
      '- appDetected: "sedad", "masrvi", "bankily", or "other"',
      '- transactionId & transactionReference (handle Transaction ID, Reference, N° opération, Id Transaction, معرف العملية, رقم العملية, المرجع)',
      '- transactionAt: ISO 8601 UTC timestamp converted from receipt date/time (e.g. 2026-11-21T14:30:00Z)',
      '- amount: numeric amount transferred (0 if unreadable)',
      '- currency: e.g. MRU or UM',
      '- beneficiaryName & beneficiaryAccount (empty string if omitted on receipt)',
      '- transferStatus: "success", "failed", "pending", or "unknown"',
      '- tamperingSignals: list any visual tampering signs (mismatched fonts, pasted numbers, blurred overlays, edited UI, AI artifacts)',
      '- confidence: 0.0 to 1.0 extraction confidence',
      '- rawText: concise transcription of key lines on receipt',
    ].join('\n');

    let timer: ReturnType<typeof setTimeout> | null = null;
    const geminiPromise = ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType,
              data: buffer.toString('base64'),
            },
          },
          { text: prompt },
        ],
      },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            appDetected: { type: Type.STRING },
            transactionId: { type: Type.STRING },
            transactionReference: { type: Type.STRING },
            transactionAt: { type: Type.STRING },
            amount: { type: Type.NUMBER },
            currency: { type: Type.STRING },
            beneficiaryName: { type: Type.STRING },
            beneficiaryAccount: { type: Type.STRING },
            transferStatus: { type: Type.STRING },
            tamperingSignals: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            confidence: { type: Type.NUMBER },
            rawText: { type: Type.STRING },
          },
        },
      },
    });
    const timeoutPromise = new Promise<never>((_, rejectTimeout) => {
      timer = setTimeout(() => rejectTimeout(new Error('Vision extraction timeout after 14s')), 14000);
    });
    const response = await Promise.race([geminiPromise, timeoutPromise]).finally(() => {
      if (timer) clearTimeout(timer);
    });

    const jsonStr = (response.text || '').trim();
    if (!jsonStr) return null;
    const data = JSON.parse(jsonStr) as Record<string, any>;
    const parsedFromRaw = parseMauritanianReceiptText(String(data.rawText || ''));

    const txId = String(data.transactionId || parsedFromRaw.transactionId || '').trim();
    const txRef = String(data.transactionReference || parsedFromRaw.transactionReference || txId).trim();
    const txAt = parseReceiptDateToIso(String(data.transactionAt || '')) || parsedFromRaw.transactionAt;
    const rawAmt = Number(data.amount);
    const amount = Number.isFinite(rawAmt) && rawAmt > 0 ? rawAmt : parsedFromRaw.amount;
    const statusRaw = String(data.transferStatus || '').toLowerCase();
    const transferStatus: ParsedReceiptFields['transferStatus'] =
      statusRaw === 'failed' || statusRaw === 'pending' || statusRaw === 'success'
        ? (statusRaw as any)
        : parsedFromRaw.transferStatus;

    return {
      appDetected: String(data.appDetected || parsedFromRaw.appDetected || '').toLowerCase(),
      transactionId: txId,
      transactionReference: txRef || txId,
      transactionAt: txAt,
      amount,
      currency: String(data.currency || parsedFromRaw.currency || 'MRU').toUpperCase(),
      beneficiaryName: String(data.beneficiaryName || parsedFromRaw.beneficiaryName || '').trim(),
      beneficiaryAccount: String(data.beneficiaryAccount || parsedFromRaw.beneficiaryAccount || '').trim(),
      transferStatus,
      tamperingSignals: Array.isArray(data.tamperingSignals)
        ? data.tamperingSignals.map((x) => String(x)).filter(Boolean)
        : [],
      confidence: Number.isFinite(Number(data.confidence)) ? Number(data.confidence) : 0.9,
      rawText: String(data.rawText || parsedFromRaw.rawText || ''),
      ocrEngine: 'gemini',
    };
  } catch (err) {
    console.warn('Gemini vision receipt extraction warning:', (err as Error)?.message || err);
    return null;
  }
}

async function runTesseractWithLang(
  tesseract: typeof import('tesseract.js'),
  buffer: Buffer,
  lang: string,
  timeoutMs: number
): Promise<string> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const recognizePromise = tesseract.recognize(buffer, lang, {
    logger: () => undefined,
  });
  const timeoutPromise = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), timeoutMs);
  });
  const result = (await Promise.race([recognizePromise, timeoutPromise]).finally(() => {
    if (timer) clearTimeout(timer);
  })) as { data?: { text?: string; confidence?: number } } | null;
  return result?.data?.text || '';
}

async function preprocessReceiptVariants(buffer: Buffer): Promise<{
  primary: Buffer;
  inverted?: Buffer;
}> {
  try {
    const img = sharp(buffer).rotate();
    const meta = await img.metadata();
    const stats = await img.clone().stats();
    const targetWidth = Math.max(1200, Math.min(2400, (meta.width || 900) * 2));
    const avgBrightness =
      stats.channels && stats.channels.length > 0
        ? stats.channels.slice(0, 3).reduce((acc, c) => acc + c.mean, 0) / Math.min(3, stats.channels.length)
        : 140;

    const primary = await img
      .clone()
      .resize({ width: targetWidth, withoutEnlargement: false })
      .grayscale()
      .normalize()
      .sharpen()
      .png()
      .toBuffer();

    let inverted: Buffer | undefined;
    // Dark-mode screenshots typically have mean luminance < 115
    if (avgBrightness < 120) {
      inverted = await img
        .clone()
        .resize({ width: targetWidth, withoutEnlargement: false })
        .grayscale()
        .negate({ alpha: false })
        .normalize()
        .sharpen()
        .png()
        .toBuffer();
    }

    return { primary, inverted };
  } catch {
    return { primary: buffer };
  }
}

async function runTesseractOcrExtraction(
  buffer: Buffer,
  embeddedMetaText: string
): Promise<ParsedReceiptFields> {
  let ocrText = '';
  const { primary, inverted } = await preprocessReceiptVariants(buffer);
  const candidates = [inverted, primary, buffer].filter((b): b is Buffer => Boolean(b));

  try {
    const tesseract = await import('tesseract.js');
    for (const variant of candidates) {
      const text = await runTesseractWithLang(tesseract, variant, 'eng+fra+ara', 11000);
      if (text.trim()) {
        ocrText = `${ocrText}\n${text}`.trim();
        const probe = parseMauritanianReceiptText(`${ocrText}\n${embeddedMetaText}`);
        if (probe.amount && probe.transactionId && probe.transactionAt) {
          break;
        }
      }
    }
    if (!ocrText.trim()) {
      ocrText = await runTesseractWithLang(tesseract, primary, 'eng', 6000);
    }
  } catch {
    try {
      const tesseract = await import('tesseract.js');
      ocrText = await runTesseractWithLang(tesseract, primary, 'eng', 6000);
    } catch {
      ocrText = '';
    }
  }

  const combinedText = `${ocrText}\n${embeddedMetaText}`.trim();
  const parsed = parseMauritanianReceiptText(combinedText);
  return {
    ...parsed,
    tamperingSignals: [],
    ocrEngine: 'tesseract',
  };
}

function recordSecurityEvent(
  db: Database.Database,
  params: {
    userId: number;
    firebaseUid?: string;
    userName: string;
    userEmail: string;
    phone: string;
    activityType: string;
    paymentMethod: string;
    riskLevel: RiskLevel;
    reason: string;
    technicalDetails: Record<string, any>;
    requestRef?: string;
  }
): void {
  try {
    db.prepare(
      `INSERT INTO security_events
       (user_id, firebase_uid, user_name, user_email, phone, activity_type, payment_method, risk_level, reason, technical_details_json, request_ref)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      params.userId,
      params.firebaseUid || '',
      params.userName,
      params.userEmail,
      params.phone,
      params.activityType,
      params.paymentMethod,
      params.riskLevel,
      params.reason,
      JSON.stringify(params.technicalDetails),
      params.requestRef || ''
    );
  } catch (err) {
    console.error('Security event log failed:', err);
  }
}

function beneficiaryMatchesOfficial(name: string, account: string): boolean {
  const normAcc = normalizeArabicDigits(account || '').replace(/\s+/g, '');
  if (normAcc && EXPECTED_ACCOUNT_NUMBERS.some((acc) => normAcc.includes(acc))) {
    return true;
  }
  const lowerName = (name || '').toLowerCase().trim();
  if (!lowerName) return false;
  return EXPECTED_BENEFICIARY_TOKENS.some((tok) => lowerName.includes(tok));
}

export async function inspectAndVerifyReceipt(params: {
  db: Database.Database;
  userId: number;
  firebaseUid?: string;
  userName: string;
  userEmail: string;
  senderPhone: string;
  planId: number;
  expectedAmount: number;
  paymentMethod: ReceiptMethod;
  proofDataUrl: string;
}): Promise<ReceiptInspectionResult> {
  const { db, userId, firebaseUid, userName, userEmail, senderPhone, planId, expectedAmount, paymentMethod, proofDataUrl } =
    params;

  const inspectionId = `INSP-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
  const warnings: string[] = [];
  const contradictions: string[] = [];

  const reject = (
    reason: string,
    reasonFr: string,
    reasonEn: string,
    riskLevel: RiskLevel,
    partial: {
      proofHash?: string;
      perceptualHash?: string;
      mimeType?: string;
      dimensions?: { width: number; height: number } | null;
      magicBytesValid?: boolean;
      dimensionsValid?: boolean;
      editingTools?: string[];
      aiSignals?: string[];
      duplicateMatch?: string | null;
      ocrEngine?: 'gemini' | 'tesseract' | 'hybrid';
      amountComparison?: 'match' | 'overpaid' | 'underpaid' | 'unreadable';
      recencyHours?: number | null;
      priorRejections24h?: number;
      extracted?: Partial<ReceiptInspectionResult['extracted']>;
      internalReason?: string;
      tamperingSignals?: string[];
      rejectionIssues?: RejectionIssue[];
    }
  ): ReceiptInspectionResult => {
    const result: ReceiptInspectionResult = {
      inspectionId,
      status: 'rejected',
      verdict: 'rejected',
      riskLevel,
      reason,
      reasonFr,
      reasonEn,
      rejectionIssues: partial.rejectionIssues && partial.rejectionIssues.length > 0 ? partial.rejectionIssues : undefined,
      stagesCompleted: 17,
      warnings,
      extracted: {
        appDetected: partial.extracted?.appDetected || '',
        amount: partial.extracted?.amount ?? null,
        currency: partial.extracted?.currency || 'MRU',
        transactionId: partial.extracted?.transactionId || '',
        transactionReference: partial.extracted?.transactionReference || '',
        transactionAt: partial.extracted?.transactionAt || '',
        beneficiaryName: partial.extracted?.beneficiaryName || '',
        beneficiaryAccount: partial.extracted?.beneficiaryAccount || '',
        confidence: partial.extracted?.confidence || 0,
        dimensions: partial.dimensions ?? null,
        mimeType: partial.mimeType || 'unknown',
        proofHash: partial.proofHash || '',
      },
      forensics: {
        magicBytesValid: partial.magicBytesValid ?? false,
        dimensionsValid: partial.dimensionsValid ?? false,
        editingSoftwareDetected: partial.editingTools || [],
        aiGenerationSignals: partial.aiSignals || [],
        contradictions,
        duplicateMatch: partial.duplicateMatch ?? null,
        ocrEngine: partial.ocrEngine || 'tesseract',
        amountComparison: partial.amountComparison || 'unreadable',
        recencyHours: partial.recencyHours ?? null,
        priorRejections24h: partial.priorRejections24h ?? 0,
      },
    };

    try {
      db.prepare(
        `INSERT INTO receipt_inspections
         (id, user_id, plan_id, payment_method, proof_hash, perceptual_hash, proof_data_url, extracted_amount, extracted_currency,
          transaction_id, transaction_reference, transaction_at, beneficiary_name, beneficiary_account, confidence, risk_level, verdict, reason, forensics_json, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'rejected', ?, ?, datetime('now', '+2 hours'))`
      ).run(
        inspectionId,
        userId,
        planId,
        paymentMethod,
        result.extracted.proofHash,
        partial.perceptualHash || '',
        proofDataUrl.slice(0, 900000),
        result.extracted.amount,
        result.extracted.currency,
        result.extracted.transactionId,
        result.extracted.transactionReference,
        result.extracted.transactionAt,
        result.extracted.beneficiaryName,
        result.extracted.beneficiaryAccount,
        result.extracted.confidence,
        riskLevel,
        partial.internalReason || reason,
        JSON.stringify(result.forensics)
      );
    } catch {
      // non-fatal
    }

    recordSecurityEvent(db, {
      userId,
      firebaseUid,
      userName,
      userEmail,
      phone: senderPhone,
      activityType: 'receipt_inspection_rejected',
      paymentMethod,
      riskLevel,
      reason: partial.internalReason || reason,
      technicalDetails: {
        inspectionId,
        extracted: { ...result.extracted, proofHash: result.extracted.proofHash.slice(0, 16) },
        forensics: result.forensics,
        tamperingSignals: partial.tamperingSignals || [],
      },
      requestRef: inspectionId,
    });

    return result;
  };

  // Stages 1-3 & 5: Decode, Validate Bounds, Magic Bytes, Dimensions & Hashes
  const validated = validateAndDecodeReceiptDataUrl(proofDataUrl);
  if (!validated.ok) {
    return reject(
      validated.reason,
      validated.reasonFr,
      validated.reasonEn,
      validated.riskLevel,
      {
        mimeType: validated.mimeType,
        dimensions: validated.dimensions ?? null,
        magicBytesValid: validated.magicBytesValid ?? false,
        internalReason: validated.technicalReason,
      }
    );
  }
  const { mimeType, buffer, dimensions, proofHash, perceptualHash } = validated;
  const magicBytesValid = true;
  const dimensionsValid = true;

  // Stage 4: Metadata Editing Software & AI Generation Forensics (logged internally ONLY; safe user message)
  const meta = inspectMetadataSignatures(buffer);
  if (meta.aiSignals.length > 0) {
    contradictions.push(`ai_signals:${meta.aiSignals.join(',')}`);
    return reject(
      'تم رفض الإيصال لتعذر التحقق من سلامته وصحة بياناته. يرجى إرفاق لقطة الشاشة الأصلية الواضحة مباشرة.',
      'Le reçu a été rejeté : impossible de valider son authenticité. Veuillez joindre la capture originale.',
      'Receipt rejected: unable to validate authenticity. Please upload the original unedited screenshot.',
      'fraud_rejected',
      {
        mimeType,
        dimensions,
        magicBytesValid,
        dimensionsValid,
        proofHash,
        perceptualHash,
        aiSignals: meta.aiSignals,
        editingTools: meta.editingTools,
        internalReason: `AI generation signatures detected: ${meta.aiSignals.join(', ')}`,
      }
    );
  }
  if (meta.editingTools.length > 0) {
    contradictions.push(`editing_tools:${meta.editingTools.join(',')}`);
    return reject(
      'تم رفض الإيصال لتعذر التحقق من سلامته وصحة بياناته. يرجى إرفاق لقطة الشاشة الأصلية الواضحة مباشرة.',
      'Le reçu a été rejeté : veuillez envoyer la capture originale sans modification.',
      'Receipt rejected: please upload the original unedited screenshot.',
      'fraud_rejected',
      {
        mimeType,
        dimensions,
        magicBytesValid,
        dimensionsValid,
        proofHash,
        perceptualHash,
        editingTools: meta.editingTools,
        internalReason: `Editing software metadata detected: ${meta.editingTools.join(', ')}`,
      }
    );
  }

  // Stage 14 (pre-check): Repeated rejected abuse rate in last 24h
  const priorRejectRow = db
    .prepare(
      `SELECT COUNT(*) as c FROM security_events
       WHERE user_id = ? AND risk_level IN ('suspicious', 'fraud_rejected')
       AND datetime(created_at) >= datetime('now', '-24 hours')`
    )
    .get(userId) as { c: number } | undefined;
  const priorRejections24h = Number(priorRejectRow?.c || 0);

  // Stage 13 (pre-check on binary hash): Exact file duplicate across ALL statuses (accepted, pending, AND rejected!)
  const dupHashRow = db
    .prepare(
      `SELECT subscription_request_id, status FROM subscription_requests WHERE proof_hash = ? OR second_proof_hash = ? LIMIT 1`
    )
    .get(proofHash, proofHash) as { subscription_request_id: string; status: string } | undefined;

  if (dupHashRow) {
    return reject(
      'هذا الإيصال أو معرف العملية تم استخدامه من قبل ولا يمكن استخدامه مرة أخرى.',
      'Ce reçu ou cet identifiant de transaction a déjà été utilisé et ne peut pas être réutilisé.',
      'This receipt or transaction ID has already been used and cannot be submitted again.',
      'fraud_rejected',
      {
        proofHash,
        perceptualHash,
        mimeType,
        dimensions,
        magicBytesValid,
        dimensionsValid,
        duplicateMatch: `proof_hash:${dupHashRow.subscription_request_id}(${dupHashRow.status})`,
        priorRejections24h,
        rejectionIssues: [
          {
            code: 'duplicate_receipt_file',
            field: 'duplicate',
            foundValue: dupHashRow.subscription_request_id,
            messageAr: 'صورة الإيصال هذه تم استخدامها في طلب سابق ولا يمكن إعادة استخدامها.',
            messageFr: 'Cette capture de reçu a déjà été soumise précédemment.',
            messageEn: 'This receipt image has already been used in a previous submission.',
          },
        ],
        internalReason: `Duplicate binary proof hash matched ${dupHashRow.subscription_request_id} (${dupHashRow.status})`,
      }
    );
  }

  // Stage 6: Multimodal Vision (Gemini) + Multi-Pass Sharp+Tesseract OCR Extraction
  let parsed = await runGeminiVisionExtraction(buffer, mimeType, paymentMethod, expectedAmount);
  let ocrEngine: 'gemini' | 'tesseract' | 'hybrid' = parsed ? 'gemini' : 'tesseract';
  if (!parsed) {
    parsed = await runTesseractOcrExtraction(buffer, meta.embeddedText);
  } else {
    // Also cross-check raw text with deterministic regex parser & preprocessed OCR if Gemini left key fields blank
    const fallbackRegex = parseMauritanianReceiptText(`${parsed.rawText}\n${meta.embeddedText}`);
    if (!parsed.transactionId && fallbackRegex.transactionId) parsed.transactionId = fallbackRegex.transactionId;
    if (!parsed.transactionReference && fallbackRegex.transactionReference) {
      parsed.transactionReference = fallbackRegex.transactionReference;
    }
    if (!parsed.transactionAt && fallbackRegex.transactionAt) parsed.transactionAt = fallbackRegex.transactionAt;
    if (!parsed.amount && fallbackRegex.amount) parsed.amount = fallbackRegex.amount;
    if (!parsed.beneficiaryAccount && fallbackRegex.beneficiaryAccount) {
      parsed.beneficiaryAccount = fallbackRegex.beneficiaryAccount;
    }
    if (!parsed.amount || !parsed.transactionId) {
      const tessFallback = await runTesseractOcrExtraction(buffer, meta.embeddedText);
      if (!parsed.amount && tessFallback.amount) parsed.amount = tessFallback.amount;
      if (!parsed.transactionId && tessFallback.transactionId) parsed.transactionId = tessFallback.transactionId;
      if (!parsed.transactionReference && tessFallback.transactionReference) {
        parsed.transactionReference = tessFallback.transactionReference;
      }
      if (!parsed.transactionAt && tessFallback.transactionAt) parsed.transactionAt = tessFallback.transactionAt;
      if (!parsed.appDetected && tessFallback.appDetected) parsed.appDetected = tessFallback.appDetected;
    }
    ocrEngine = 'hybrid';
  }

  // Separate HARD fraud/contradiction rejections from SOFT OCR uncertainties eligible for manual_review
  const hardRejectionIssues: RejectionIssue[] = [];
  const manualReviewReasons: RejectionIssue[] = [];
  let maxRisk: RiskLevel = 'normal';
  const elevateRisk = (level: RiskLevel) => {
    const order: Record<RiskLevel, number> = { normal: 0, warning: 1, suspicious: 2, fraud_rejected: 3 };
    if (order[level] > order[maxRisk]) maxRisk = level;
  };

  if (parsed.tamperingSignals.length > 0) {
    contradictions.push(...parsed.tamperingSignals.slice(0, 4));
    elevateRisk('fraud_rejected');
    hardRejectionIssues.push({
      code: 'tampering_detected',
      field: 'file',
      messageAr: 'تعذر التحقق من سلامة لقطة الشاشة (مؤشرات تعديل رقمي). يرجى إرفاق اللقطة الأصلية مباشرة.',
      messageFr: 'Signaux de modification détectés sur la capture. Veuillez joindre la capture originale.',
      messageEn: 'Visual tampering signals detected. Please upload the original unedited screenshot.',
    });
  }

  // Stage 12: App Mismatch / Failed Transfer Contradiction
  if (parsed.appDetected && parsed.appDetected !== 'other' && parsed.appDetected !== paymentMethod) {
    contradictions.push(`app_mismatch:${parsed.appDetected}!=${paymentMethod}`);
    elevateRisk('fraud_rejected');
    hardRejectionIssues.push({
      code: 'app_mismatch',
      field: 'app',
      foundValue: parsed.appDetected,
      expectedValue: paymentMethod,
      messageAr: `وسيلة الدفع الظاهرة في الإيصال (${parsed.appDetected}) لا تطابق الوسيلة المختارة (${paymentMethod}).`,
      messageFr: `Le reçu provient de (${parsed.appDetected}) et ne correspond pas au moyen choisi (${paymentMethod}).`,
      messageEn: `Detected app (${parsed.appDetected}) does not match selected method (${paymentMethod}).`,
    });
  }

  if (parsed.transferStatus === 'failed') {
    contradictions.push('transfer_status_failed');
    elevateRisk('fraud_rejected');
    hardRejectionIssues.push({
      code: 'transfer_failed',
      field: 'status',
      foundValue: 'failed',
      expectedValue: 'success',
      messageAr: 'حالة العملية الظاهرة في الإيصال غير مكتملة أو مرفوضة.',
      messageFr: 'Le reçu indique une opération échouée ou annulée.',
      messageEn: 'The receipt shows a failed or cancelled transfer.',
    });
  }

  // Stage 7 & 8: Transaction ID / Reference Verification
  const txId = parsed.transactionId.trim();
  const txRef = parsed.transactionReference.trim() || txId;
  let duplicateMatchStr: string | null = null;

  if (!txId && !txRef) {
    elevateRisk('warning');
    warnings.push('لم يتمكن التحقق الآلي من استخراج معرف العملية بوضوح — سيُحال الطلب للمراجعة اليدوية.');
    manualReviewReasons.push({
      code: 'missing_transaction_id',
      field: 'transaction_id',
      foundValue: '',
      expectedValue: 'معرف أو مرجع العملية',
      messageAr: 'لم يُقرأ معرف العملية تلقائياً وسيتم التحقق منه يدوياً من قبل الإدارة.',
      messageFr: "L'identifiant de transaction sera vérifié manuellement par l'administration.",
      messageEn: 'Transaction ID was not extracted automatically; queued for manual review.',
    });
  } else {
    // Stage 13 (DB Check on ID & Reference across ALL statuses including 'rejected' and top-up second receipts)
    const dupTxRow = db
      .prepare(
        `SELECT subscription_request_id, status FROM subscription_requests
         WHERE (
           payment_method = ?
           AND (
             (trim(?) != '' AND lower(trim(transaction_id)) = lower(trim(?)))
             OR (trim(?) != '' AND lower(trim(transaction_reference)) = lower(trim(?)))
           )
         ) OR (
           second_payment_method = ?
           AND (
             (trim(?) != '' AND lower(trim(second_transaction_id)) = lower(trim(?)))
             OR (trim(?) != '' AND lower(trim(second_transaction_reference)) = lower(trim(?)))
           )
         )
         LIMIT 1`
      )
      .get(paymentMethod, txId, txId, txRef, txRef, paymentMethod, txId, txId, txRef, txRef) as
      | { subscription_request_id: string; status: string }
      | undefined;

    if (dupTxRow) {
      duplicateMatchStr = `tx:${dupTxRow.subscription_request_id}(${dupTxRow.status})`;
      elevateRisk('fraud_rejected');
      hardRejectionIssues.push({
        code: 'duplicate_transaction_id',
        field: 'duplicate',
        foundValue: txId || txRef,
        messageAr: `معرف العملية (${txId || txRef}) مستخدم مسبقاً في طلب آخر (${dupTxRow.subscription_request_id}).`,
        messageFr: `L'identifiant (${txId || txRef}) a déjà été utilisé (${dupTxRow.subscription_request_id}).`,
        messageEn: `Transaction ID (${txId || txRef}) was already submitted (${dupTxRow.subscription_request_id}).`,
      });
    }
  }

  // Stage 9: Transaction Timestamp Separation & Recency Window
  const maxAgeSetting = db
    .prepare("SELECT value FROM app_settings WHERE key = 'receipt_max_age_hours'")
    .get() as { value?: string } | undefined;
  const maxAgeHours = Math.max(1, Number(maxAgeSetting?.value || 168));
  let recencyHours: number | null = null;
  const nowMs = Date.now();

  if (!parsed.transactionAt) {
    elevateRisk('warning');
    warnings.push('تاريخ العملية غير واضح في القراءة الآلية — سيُراجع يدوياً.');
    manualReviewReasons.push({
      code: 'missing_date',
      field: 'date',
      foundValue: '',
      expectedValue: `خلال آخر ${maxAgeHours} ساعة`,
      messageAr: 'تعذر قراءة تاريخ العملية آلياً وسيتم التحقق منه في المراجعة اليدوية.',
      messageFr: 'Date de transaction non lue automatiquement — vérification manuelle requise.',
      messageEn: 'Transaction timestamp unclear for OCR — queued for manual review.',
    });
  } else {
    const txMs = Date.parse(parsed.transactionAt);
    if (!Number.isNaN(txMs)) {
      recencyHours = Number(((nowMs - txMs) / 3600000).toFixed(2));
    }
    if (Number.isNaN(txMs) || txMs > nowMs + 15 * 60 * 1000) {
      elevateRisk('fraud_rejected');
      hardRejectionIssues.push({
        code: 'invalid_date',
        field: 'date',
        foundValue: parsed.transactionAt,
        messageAr: `تاريخ العملية غير صالح أو مستقبلي (${parsed.transactionAt}).`,
        messageFr: `La date figurant sur le reçu est invalide (${parsed.transactionAt}).`,
        messageEn: `Receipt date is invalid or in the future (${parsed.transactionAt}).`,
      });
    } else if (recencyHours !== null && recencyHours > maxAgeHours) {
      elevateRisk('suspicious');
      hardRejectionIssues.push({
        code: 'expired_date',
        field: 'date',
        foundValue: parsed.transactionAt,
        expectedValue: `أحدث من ${maxAgeHours} ساعة`,
        messageAr: `انتهت صلاحية الإيصال — تاريخ العملية أقدم من الحد المسموح (${Math.round(recencyHours)} ساعة).`,
        messageFr: `Le reçu est expiré (${Math.round(recencyHours)} h, max ${maxAgeHours} h).`,
        messageEn: `Receipt date is expired (${Math.round(recencyHours)}h old, limit ${maxAgeHours}h).`,
      });
    }
  }

  // Stage 10: Amount Verification vs Plan Price
  let amountComparison: 'match' | 'overpaid' | 'underpaid' | 'unreadable' = 'unreadable';
  const paidAmountVal = parsed.amount !== null && Number.isFinite(parsed.amount) && parsed.amount > 0 ? Number(parsed.amount) : 0;
  const remainingAmountVal = paidAmountVal > 0 ? Math.max(0, Number((expectedAmount - paidAmountVal).toFixed(2))) : expectedAmount;

  if (paidAmountVal <= 0) {
    amountComparison = 'unreadable';
    elevateRisk('warning');
    warnings.push('تعذر قراءة المبلغ آلياً من الإيصال — سيُحال الطلب للمراجعة اليدوية.');
    manualReviewReasons.push({
      code: 'unreadable_amount',
      field: 'amount',
      foundValue: '',
      expectedValue: `${expectedAmount} MRU`,
      messageAr: 'تعذر قراءة المبلغ تلقائياً وسيتم تأكيده يدوياً من قبل الإدارة.',
      messageFr: 'Montant non lu automatiquement — vérification manuelle requise.',
      messageEn: 'Transfer amount was not read automatically; queued for manual review.',
    });
  } else if (paidAmountVal + 0.01 < expectedAmount) {
    amountComparison = 'underpaid';
    elevateRisk('warning');
    warnings.push(
      `المبلغ المدفوع (${paidAmountVal.toLocaleString()} MRU) أقل من المطلوب (${expectedAmount.toLocaleString()} MRU). المتبقي لإكمال الاشتراك: ${remainingAmountVal.toLocaleString()} MRU.`
    );
  } else if (paidAmountVal > expectedAmount + 0.01) {
    amountComparison = 'overpaid';
    elevateRisk('warning');
    warnings.push(
      `تنبيه: المبلغ المستخرج (${paidAmountVal.toLocaleString()} MRU) أكبر من سعر الباقة (${expectedAmount.toLocaleString()} MRU) وسيُحال للمراجعة اليدوية.`
    );
  } else {
    amountComparison = 'match';
  }

  // Stage 11: Beneficiary Rules (Bankily omits beneficiary cleanly!)
  const hasExplicitBeneficiary = Boolean(parsed.beneficiaryName.trim() || parsed.beneficiaryAccount.trim());
  if (hasExplicitBeneficiary && !beneficiaryMatchesOfficial(parsed.beneficiaryName, parsed.beneficiaryAccount)) {
    elevateRisk('fraud_rejected');
    hardRejectionIssues.push({
      code: 'beneficiary_mismatch',
      field: 'beneficiary',
      foundValue: [parsed.beneficiaryName, parsed.beneficiaryAccount].filter(Boolean).join(' · '),
      expectedValue: paymentMethod === 'sedad' ? '47526504 · Abderahmane Mohamed Lemine' : 'Abderahmane Mohamed Lemine',
      messageAr:
        paymentMethod === 'bankily'
          ? 'بيانات المستفيد الظاهرة في إيصال بنكيلي لا تطابق الحساب الرسمي للمنصة.'
          : 'بيانات المستفيد أو رقم الحساب لا تطابق الحساب المعتمد (47526504 / Abderahmane Mohamed Lemine).',
      messageFr: 'Le bénéficiaire indiqué sur le reçu ne correspond pas au compte officiel de la plateforme.',
      messageEn: 'Recipient shown on receipt does not match the official platform account.',
    });
  } else if (paymentMethod !== 'bankily' && !hasExplicitBeneficiary) {
    elevateRisk('warning');
    warnings.push('اسم المستفيد غير ظاهر بوضوح في الإيصال — سيُتحقق منه أثناء مراجعة الإدارة.');
  }

  // If ANY hard rejection issue exists, return ALL detected issues simultaneously (plus note underpayment if applicable)
  if (hardRejectionIssues.length > 0) {
    const allIssues = [...hardRejectionIssues, ...manualReviewReasons];
    if (amountComparison === 'underpaid') {
      allIssues.push({
        code: 'insufficient_amount',
        field: 'amount',
        foundValue: `${paidAmountVal} MRU`,
        expectedValue: `${expectedAmount} MRU`,
        messageAr: `المبلغ الظاهر (${paidAmountVal.toLocaleString()} MRU) أقل من المطلوب (${expectedAmount.toLocaleString()} MRU).`,
        messageFr: `Le montant (${paidAmountVal.toLocaleString()} MRU) est inférieur au prix requis (${expectedAmount.toLocaleString()} MRU).`,
        messageEn: `Amount (${paidAmountVal.toLocaleString()} MRU) is less than required (${expectedAmount.toLocaleString()} MRU).`,
      });
    }
    const combinedAr = allIssues.map((iss) => `• ${iss.messageAr}`).join('\n');
    const combinedFr = allIssues.map((iss) => `• ${iss.messageFr}`).join('\n');
    const combinedEn = allIssues.map((iss) => `• ${iss.messageEn}`).join('\n');
    return reject(
      allIssues.length === 1 ? allIssues[0].messageAr : combinedAr,
      allIssues.length === 1 ? allIssues[0].messageFr : combinedFr,
      allIssues.length === 1 ? allIssues[0].messageEn : combinedEn,
      maxRisk === 'normal' || maxRisk === 'warning' ? 'suspicious' : maxRisk,
      {
        proofHash,
        perceptualHash,
        mimeType,
        dimensions,
        magicBytesValid,
        dimensionsValid,
        ocrEngine,
        amountComparison,
        duplicateMatch: duplicateMatchStr,
        recencyHours,
        priorRejections24h,
        extracted: {
          ...parsed,
          transactionId: txId,
          transactionReference: txRef,
        },
        tamperingSignals: parsed.tamperingSignals,
        rejectionIssues: allIssues,
        internalReason: allIssues.map((i) => i.code).join(', '),
      }
    );
  }

  let riskLevel: RiskLevel = maxRisk;
  if (priorRejections24h >= 3 && riskLevel === 'normal') {
    riskLevel = 'suspicious';
  }

  const isUnderpaid = amountComparison === 'underpaid';
  const needsManualReview =
    !isUnderpaid && (manualReviewReasons.length > 0 || amountComparison === 'overpaid');
  const verdict: ReceiptInspectionResult['verdict'] = isUnderpaid
    ? 'underpaid'
    : needsManualReview
      ? 'manual_review'
      : 'verified';

  const resultReasonAr = isUnderpaid
    ? 'المبلغ المدفوع غير كافٍ لإكمال الاشتراك.'
    : needsManualReview
      ? 'تم استلام الإيصال بنجاح وسيتم تحويله للمراجعة اليدوية لتأكيد البيانات قبل التفعيل.'
      : 'تم التحقق من بيانات الإيصال بنجاح';
  const resultReasonFr = isUnderpaid
    ? 'Le montant payé est insuffisant pour finaliser l’abonnement.'
    : needsManualReview
      ? 'Reçu enregistré — certains champs nécessitent une vérification manuelle par l’administration.'
      : 'Données du reçu vérifiées avec succès';
  const resultReasonEn = isUnderpaid
    ? 'The paid amount is insufficient to complete the subscription.'
    : needsManualReview
      ? 'Receipt accepted for manual administrative verification.'
      : 'Receipt details verified successfully';

  const verifiedResult: ReceiptInspectionResult = {
    inspectionId,
    status: verdict,
    verdict,
    riskLevel,
    reason: resultReasonAr,
    reasonFr: resultReasonFr,
    reasonEn: resultReasonEn,
    rejectionIssues: manualReviewReasons.length > 0 ? manualReviewReasons : undefined,
    requiredAmount: expectedAmount,
    paidAmount: paidAmountVal,
    remainingAmount: isUnderpaid ? remainingAmountVal : 0,
    stagesCompleted: 17,
    warnings,
    extracted: {
      appDetected: parsed.appDetected || paymentMethod,
      amount: parsed.amount,
      currency: parsed.currency || 'MRU',
      transactionId: txId,
      transactionReference: txRef,
      transactionAt: parsed.transactionAt,
      beneficiaryName:
        parsed.beneficiaryName || (paymentMethod === 'bankily' ? '' : 'Abderahmane Mohamed Lemine'),
      beneficiaryAccount:
        parsed.beneficiaryAccount || (paymentMethod === 'sedad' ? '47526504' : ''),
      confidence: parsed.confidence,
      dimensions,
      mimeType,
      proofHash,
    },
    forensics: {
      magicBytesValid,
      dimensionsValid,
      editingSoftwareDetected: [],
      aiGenerationSignals: [],
      contradictions,
      duplicateMatch: null,
      ocrEngine,
      amountComparison,
      recencyHours,
      priorRejections24h,
    },
  };

  db.prepare(
    `INSERT INTO receipt_inspections
     (id, user_id, plan_id, payment_method, proof_hash, perceptual_hash, proof_data_url, extracted_amount, extracted_currency,
      transaction_id, transaction_reference, transaction_at, beneficiary_name, beneficiary_account, confidence, risk_level, verdict, reason, forensics_json, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '+2 hours'))`
  ).run(
    inspectionId,
    userId,
    planId,
    paymentMethod,
    proofHash,
    perceptualHash,
    proofDataUrl.slice(0, 900000),
    verifiedResult.extracted.amount,
    verifiedResult.extracted.currency,
    verifiedResult.extracted.transactionId,
    verifiedResult.extracted.transactionReference,
    verifiedResult.extracted.transactionAt,
    verifiedResult.extracted.beneficiaryName,
    verifiedResult.extracted.beneficiaryAccount,
    verifiedResult.extracted.confidence,
    riskLevel,
    verdict,
    verifiedResult.reason,
    JSON.stringify(verifiedResult.forensics)
  );

  recordSecurityEvent(db, {
    userId,
    firebaseUid,
    userName,
    userEmail,
    phone: senderPhone,
    activityType: needsManualReview ? 'receipt_inspection_manual_review' : 'receipt_inspection_verified',
    paymentMethod,
    riskLevel,
    reason: warnings.length > 0 ? warnings.join(' | ') : verifiedResult.reason,
    technicalDetails: {
      inspectionId,
      verdict,
      amount: parsed.amount,
      expectedAmount,
      txId,
      txRef,
      ocrEngine,
      recencyHours,
    },
    requestRef: inspectionId,
  });

  return verifiedResult;
}
