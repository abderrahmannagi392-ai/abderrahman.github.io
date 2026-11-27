import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import type { Language } from '../types';
import { localeCode, tr } from './locale';
import {
  drawMixedText,
  loadArabicFonts,
  wrapMixedLines,
  type FontState,
} from './transcriptPdf';

export const PUBLIC_APP_ORIGIN = 'https://tadribi.chtbqi.com';

export interface PrintableReceiptData {
  rid: string;
  kind: 'local_request' | 'card_tx';
  studentName: string;
  studentEmail: string;
  planName: string;
  amount: number;
  paidAmount: number;
  remainingAmount?: number;
  currency: string;
  paymentMethod: string;
  cardBrand?: string;
  cardLast4?: string;
  transactionId: string;
  transactionReference?: string;
  beneficiaryName?: string;
  status: string;
  verified: boolean;
  transactionAt: string;
  startsAt?: string | null;
  expiresAt?: string | null;
  verifyUrl?: string;
}

export interface BacResultRowExport {
  nameAr: string;
  nameFr: string;
  coefficient: number;
  grade: number | null;
  points: number | null;
  isOptional?: boolean;
  isCustom?: boolean;
}

export interface BacResultExportData {
  seriesCode: string;
  seriesNameAr: string;
  seriesNameFr: string;
  average: number;
  weightedSum: number;
  totalCoefficients: number;
  mentionAr: string;
  mentionFr: string;
  rows: BacResultRowExport[];
  generatedAt?: string;
}

let cachedLogoPngPromise: Promise<string | null> | null = null;

async function loadLogoPngDataUrl(): Promise<string | null> {
  if (!cachedLogoPngPromise) {
    cachedLogoPngPromise = new Promise<string | null>((resolve) => {
      if (typeof window === 'undefined') {
        resolve(null);
        return;
      }
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth || 256;
          canvas.height = img.naturalHeight || 256;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(null);
            return;
          }
          ctx.drawImage(img, 0, 0);
          resolve(canvas.toDataURL('image/png'));
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = '/assets/images/platform-logo.webp';
    });
  }
  return cachedLogoPngPromise;
}

function loadImageElement(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

export function getCanonicalReceiptVerifyUrl(receipt: Pick<PrintableReceiptData, 'rid' | 'verifyUrl'>): string {
  const url = String(receipt.verifyUrl || '').trim();
  if (url && url.startsWith(PUBLIC_APP_ORIGIN)) {
    return url;
  }
  return `${PUBLIC_APP_ORIGIN}/verify-receipt?rid=${encodeURIComponent(receipt.rid)}`;
}

async function generateQrPngDataUrl(targetUrl: string): Promise<string> {
  return QRCode.toDataURL(targetUrl, {
    width: 360,
    margin: 2,
    errorCorrectionLevel: 'M',
    color: {
      dark: '#1c2a0e',
      light: '#ffffff',
    },
  });
}

// Writes genuine JFIF APP0 DPI density into a JPEG blob matching the actual pixel canvas size
function injectJpegDpiMetadata(jpegDataUrl: string, dpi = 300): Blob {
  const commaIdx = jpegDataUrl.indexOf(',');
  const b64 = commaIdx >= 0 ? jpegDataUrl.slice(commaIdx + 1) : jpegDataUrl;
  const binStr = atob(b64);
  const src = new Uint8Array(binStr.length);
  for (let i = 0; i < binStr.length; i++) {
    src[i] = binStr.charCodeAt(i);
  }

  // Locate JFIF APP0 marker (FF E0 ... 'JFIF\0')
  if (src.length >= 20 && src[0] === 0xff && src[1] === 0xd8 && src[2] === 0xff && src[3] === 0xe0) {
    if (src[6] === 0x4a && src[7] === 0x46 && src[8] === 0x49 && src[9] === 0x46 && src[10] === 0x00) {
      const patched = new Uint8Array(src);
      patched[13] = 1; // units = pixels per inch
      patched[14] = (dpi >> 8) & 0xff;
      patched[15] = dpi & 0xff;
      patched[16] = (dpi >> 8) & 0xff;
      patched[17] = dpi & 0xff;
      return new Blob([patched], { type: 'image/jpeg' });
    }
  }
  return new Blob([src], { type: 'image/jpeg' });
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function printHtmlViaHiddenIframe(html: string): void {
  if (typeof document === 'undefined') return;
  const existing = document.getElementById('tadribi-print-frame') as HTMLIFrameElement | null;
  if (existing) existing.remove();

  const iframe = document.createElement('iframe');
  iframe.id = 'tadribi-print-frame';
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.style.visibility = 'hidden';
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!doc) return;
  doc.open();
  doc.write(html);
  doc.close();

  const trigger = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch {
      window.print();
    }
    window.setTimeout(() => {
      iframe.remove();
    }, 3000);
  };

  window.setTimeout(trigger, 350);
}

function receiptStatusLabel(status: string, lang: Language): string {
  switch (status) {
    case 'approved':
    case 'succeeded':
      return tr(lang, 'مؤكد ومفعل', 'Validé et activé', 'Verified & Active');
    case 'pending_review':
      return tr(lang, 'قيد المراجعة', 'En cours de validation', 'Pending Review');
    case 'partial_pending':
      return tr(lang, 'دفعة جزئية', 'Paiement partiel', 'Partial Payment');
    case 'needs_info':
      return tr(lang, 'يتطلب توضيحاً', 'Action requise', 'Needs Info');
    case 'rejected':
      return tr(lang, 'مرفوض', 'Rejeté', 'Rejected');
    case 'expired':
      return tr(lang, 'منتهي', 'Expiré', 'Expired');
    default:
      return status;
  }
}

function receiptMethodLabel(receipt: PrintableReceiptData, lang: Language): string {
  const m = (receipt.cardBrand || receipt.paymentMethod || '').toLowerCase();
  if (m === 'visa') return receipt.cardLast4 ? `Visa •••• ${receipt.cardLast4}` : 'Visa';
  if (m === 'mastercard') return receipt.cardLast4 ? `Mastercard •••• ${receipt.cardLast4}` : 'Mastercard';
  if (m === 'sedad') return tr(lang, 'السداد (Sedad)', 'Sedad', 'Sedad');
  if (m === 'masrvi') return tr(lang, 'مصرفي (Masrvi)', 'Masrvi', 'Masrvi');
  if (m === 'bankily') return tr(lang, 'بنكيلي (Bankily)', 'Bankily', 'Bankily');
  return receipt.paymentMethod.toUpperCase();
}

function formatDateSafe(val: string | null | undefined, lang: Language): string {
  if (!val) return '—';
  const d = new Date(val);
  if (Number.isNaN(d.getTime())) return String(val);
  return d.toLocaleString(localeCode(lang), {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function escHtml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ============================================================================
// 1. VECTOR PDF RECEIPT (MULTILINGUAL RTL/LTR + LOGO + VERIFIED BADGE + QR)
// ============================================================================

export async function downloadStudentReceiptPdf(receipt: PrintableReceiptData, lang: Language): Promise<void> {
  const isRtl = lang === 'ar';
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const [fontData, logoPng, qrPng] = await Promise.all([
    loadArabicFonts(),
    loadLogoPngDataUrl(),
    generateQrPngDataUrl(getCanonicalReceiptVerifyUrl(receipt)),
  ]);

  const state: FontState = { hasArabicFont: false };
  if (fontData) {
    doc.addFileToVFS('NotoSansArabic-Regular.ttf', fontData.regular);
    doc.addFont('NotoSansArabic-Regular.ttf', 'NotoSansArabic', 'normal');
    doc.addFileToVFS('NotoSansArabic-Bold.ttf', fontData.bold);
    doc.addFont('NotoSansArabic-Bold.ttf', 'NotoSansArabic', 'bold');
    state.hasArabicFont = true;
  }

  const W = 210;
  const H = 297;
  const M = 14;
  const CW = W - M * 2;

  // Header band (#384D55) + Lime Accent (#A6CE39)
  doc.setFillColor(56, 77, 85);
  doc.rect(0, 0, W, 38, 'F');
  doc.setFillColor(166, 206, 57);
  doc.rect(0, 38, W, 2.5, 'F');

  if (logoPng) {
    doc.addImage(logoPng, 'PNG', isRtl ? W - M - 24 : M, 6, 24, 24);
  }

  const titleX = isRtl ? W - M - 29 : M + 29;
  const titleAlign = isRtl ? 'right' : 'left';
  drawMixedText(
    doc,
    tr(lang, 'منصة تدريبي — التدريب الحر', 'Plateforme Tadribi — Formation Libre', 'Tadribi Platform — Official Receipt'),
    titleX,
    16,
    { fontSize: 15, weight: 'bold', align: titleAlign, baseRtl: isRtl, color: [255, 255, 255] },
    state
  );
  drawMixedText(
    doc,
    tr(lang, 'إيصال اشتراك ودفع إلكتروني رسمي', 'Reçu officiel de paiement et d’abonnement', 'Official Student Payment Receipt'),
    titleX,
    24,
    { fontSize: 10.5, weight: 'normal', align: titleAlign, baseRtl: isRtl, color: [226, 239, 191] },
    state
  );
  drawMixedText(
    doc,
    'https://tadribi.chtbqi.com',
    titleX,
    31,
    { fontSize: 8.5, weight: 'bold', align: titleAlign, baseRtl: false, color: [166, 206, 57] },
    state
  );

  // Verified Badge + Document Title Bar
  let y = 50;
  const badgeColor: [number, number, number] = receipt.verified ? [69, 104, 16] : [146, 64, 14];
  const badgeBg: [number, number, number] = receipt.verified ? [226, 239, 191] : [254, 243, 199];

  doc.setFillColor(247, 249, 250);
  doc.setDrawColor(216, 223, 226);
  doc.roundedRect(M, y, CW, 18, 2, 2, 'FD');

  drawMixedText(
    doc,
    `${tr(lang, 'رقم الإيصال:', 'Réf. Reçu :', 'Receipt No:')}`,
    isRtl ? W - M - 6 : M + 6,
    y + 7.5,
    { fontSize: 9, weight: 'normal', align: isRtl ? 'right' : 'left', baseRtl: isRtl, color: [92, 104, 110] },
    state
  );
  drawMixedText(
    doc,
    receipt.rid,
    isRtl ? W - M - 6 : M + 6,
    y + 13.5,
    { fontSize: 11.5, weight: 'bold', align: isRtl ? 'right' : 'left', baseRtl: false, color: [56, 77, 85] },
    state
  );

  const badgeW = 54;
  const badgeX = isRtl ? M + 5 : W - M - badgeW - 5;
  doc.setFillColor(badgeBg[0], badgeBg[1], badgeBg[2]);
  doc.roundedRect(badgeX, y + 3.5, badgeW, 11, 2, 2, 'F');
  drawMixedText(
    doc,
    receiptStatusLabel(receipt.status, lang),
    badgeX + badgeW / 2,
    y + 10.5,
    { fontSize: 9.5, weight: 'bold', align: 'center', baseRtl: isRtl, color: badgeColor },
    state
  );

  // Student & Transaction Two-Column Summary
  y += 25;
  const colW = (CW - 6) / 2;
  const leftBoxX = M;
  const rightBoxX = M + colW + 6;
  const stuBoxX = isRtl ? rightBoxX : leftBoxX;
  const txBoxX = isRtl ? leftBoxX : rightBoxX;

  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(216, 223, 226);
  doc.roundedRect(stuBoxX, y, colW, 34, 2, 2, 'FD');
  doc.roundedRect(txBoxX, y, colW, 34, 2, 2, 'FD');

  const pad = 5;
  const stuAnchor = isRtl ? stuBoxX + colW - pad : stuBoxX + pad;
  const txAnchor = isRtl ? txBoxX + colW - pad : txBoxX + pad;
  const textAlign = isRtl ? 'right' : 'left';

  drawMixedText(
    doc,
    tr(lang, 'بيانات الطالب', 'Informations de l’étudiant', 'Student Details'),
    stuAnchor,
    y + 7,
    { fontSize: 10, weight: 'bold', align: textAlign, baseRtl: isRtl, color: [56, 77, 85] },
    state
  );
  drawMixedText(
    doc,
    `${tr(lang, 'الاسم:', 'Nom :', 'Name:')} ${receipt.studentName || '—'}`,
    stuAnchor,
    y + 15,
    { fontSize: 9, weight: 'normal', align: textAlign, baseRtl: isRtl, color: [56, 77, 85] },
    state
  );
  drawMixedText(
    doc,
    `${tr(lang, 'البريد:', 'E-mail :', 'Email:')} ${receipt.studentEmail || '—'}`,
    stuAnchor,
    y + 22,
    { fontSize: 8.5, weight: 'normal', align: textAlign, baseRtl: isRtl, color: [92, 104, 110] },
    state
  );
  drawMixedText(
    doc,
    `${tr(lang, 'تاريخ العملية:', 'Date :', 'Date:')} ${formatDateSafe(receipt.transactionAt, lang)}`,
    stuAnchor,
    y + 29,
    { fontSize: 8.5, weight: 'normal', align: textAlign, baseRtl: isRtl, color: [92, 104, 110] },
    state
  );

  drawMixedText(
    doc,
    tr(lang, 'تفاصيل التحقق والباقة', 'Détails de vérification', 'Transaction & Verification'),
    txAnchor,
    y + 7,
    { fontSize: 10, weight: 'bold', align: textAlign, baseRtl: isRtl, color: [56, 77, 85] },
    state
  );
  drawMixedText(
    doc,
    `${tr(lang, 'وسيلة الدفع:', 'Moyen :', 'Method:')} ${receiptMethodLabel(receipt, lang)}`,
    txAnchor,
    y + 15,
    { fontSize: 9, weight: 'normal', align: textAlign, baseRtl: isRtl, color: [56, 77, 85] },
    state
  );
  drawMixedText(
    doc,
    `${tr(lang, 'مرجع المعاملة:', 'Réf. TX :', 'TX ID:')} ${receipt.transactionId || receipt.transactionReference || receipt.rid}`,
    txAnchor,
    y + 22,
    { fontSize: 8.5, weight: 'normal', align: textAlign, baseRtl: isRtl, color: [92, 104, 110] },
    state
  );
  if (receipt.expiresAt) {
    drawMixedText(
      doc,
      `${tr(lang, 'صالح لغاية:', 'Expire le :', 'Valid until:')} ${formatDateSafe(receipt.expiresAt, lang)}`,
      txAnchor,
      y + 29,
      { fontSize: 8.5, weight: 'bold', align: textAlign, baseRtl: isRtl, color: [69, 104, 16] },
      state
    );
  }

  // Structured Payment Table
  y += 42;
  const rows: Array<[string, string]> = [
    [tr(lang, 'الباقة المختارة', 'Formule d’abonnement', 'Subscription Plan'), receipt.planName || '—'],
    [
      tr(lang, 'المبلغ المطلوب', 'Montant requis', 'Required Amount'),
      `${Number(receipt.amount || 0).toLocaleString()} ${receipt.currency || 'MRU'}`,
    ],
    [
      tr(lang, 'المبلغ المدفوع', 'Montant payé', 'Paid Amount'),
      `${Number(receipt.paidAmount ?? receipt.amount ?? 0).toLocaleString()} ${receipt.currency || 'MRU'}`,
    ],
  ];
  if (Number(receipt.remainingAmount || 0) > 0) {
    rows.push([
      tr(lang, 'المبلغ المتبقي', 'Montant restant', 'Remaining Balance'),
      `${Number(receipt.remainingAmount).toLocaleString()} ${receipt.currency || 'MRU'}`,
    ]);
  }
  if (receipt.beneficiaryName) {
    rows.push([tr(lang, 'المستفيد المعتمد', 'Bénéficiaire officiel', 'Official Beneficiary'), receipt.beneficiaryName]);
  }
  if (receipt.startsAt) {
    rows.push([tr(lang, 'بداية التفعيل', 'Date d’activation', 'Activated On'), formatDateSafe(receipt.startsAt, lang)]);
  }

  doc.setFillColor(56, 77, 85);
  doc.rect(M, y, CW, 9.5, 'F');
  drawMixedText(
    doc,
    tr(lang, 'البند', 'Rubrique', 'Item'),
    isRtl ? W - M - 5 : M + 5,
    y + 6.3,
    { fontSize: 9.5, weight: 'bold', align: isRtl ? 'right' : 'left', baseRtl: isRtl, color: [255, 255, 255] },
    state
  );
  drawMixedText(
    doc,
    tr(lang, 'القيمة المؤكدة', 'Valeur vérifiée', 'Verified Details'),
    isRtl ? M + 5 : W - M - 5,
    y + 6.3,
    { fontSize: 9.5, weight: 'bold', align: isRtl ? 'left' : 'right', baseRtl: isRtl, color: [166, 206, 57] },
    state
  );
  y += 9.5;

  rows.forEach(([label, value], idx) => {
    doc.setFillColor(idx % 2 === 0 ? 255 : 247, idx % 2 === 0 ? 255 : 249, idx % 2 === 0 ? 255 : 250);
    doc.setDrawColor(228, 233, 236);
    doc.rect(M, y, CW, 9.5, 'FD');
    drawMixedText(
      doc,
      label,
      isRtl ? W - M - 5 : M + 5,
      y + 6.3,
      { fontSize: 9, weight: 'bold', align: isRtl ? 'right' : 'left', baseRtl: isRtl, color: [56, 77, 85] },
      state
    );
    drawMixedText(
      doc,
      value,
      isRtl ? M + 5 : W - M - 5,
      y + 6.3,
      { fontSize: 9, weight: 'normal', align: isRtl ? 'left' : 'right', baseRtl: isRtl, color: [31, 41, 55] },
      state
    );
    y += 9.5;
  });

  // Scannable QR Verification Card
  y += 10;
  doc.setFillColor(249, 252, 242);
  doc.setDrawColor(166, 206, 57);
  doc.roundedRect(M, y, CW, 46, 2.5, 2.5, 'FD');

  const qrSize = 36;
  const qrX = isRtl ? M + 6 : W - M - qrSize - 6;
  doc.addImage(qrPng, 'PNG', qrX, y + 5, qrSize, qrSize);

  const infoX = isRtl ? W - M - 7 : M + 7;
  drawMixedText(
    doc,
    tr(lang, 'التحقق الرقمي الفوري من صحة الإيصال', 'Vérification numérique authentique du reçu', 'Digital Receipt Verification'),
    infoX,
    y + 12,
    { fontSize: 10.5, weight: 'bold', align: textAlign, baseRtl: isRtl, color: [69, 104, 16] },
    state
  );
  const noteLines = wrapMixedLines(
    doc,
    tr(
      lang,
      'امسح رمز الاستجابة السريعة (QR) للتحقق من صحة هذا الإيصال وحالة الاشتراك مباشرة عبر النطاق الرسمي لمنصة تدريبي.',
      'Scannez ce code QR pour vérifier instantanément l’authenticité de ce reçu sur tadribi.chtbqi.com.',
      'Scan this QR code to verify receipt authenticity and active status directly on tadribi.chtbqi.com.'
    ),
    CW - qrSize - 22,
    8.5,
    'normal',
    isRtl,
    state
  );
  noteLines.slice(0, 2).forEach((ln, idx) => {
    drawMixedText(
      doc,
      ln,
      infoX,
      y + 20 + idx * 5.5,
      { fontSize: 8.5, weight: 'normal', align: textAlign, baseRtl: isRtl, color: [56, 77, 85] },
      state
    );
  });
  drawMixedText(
    doc,
    getCanonicalReceiptVerifyUrl(receipt).slice(0, 74),
    infoX,
    y + 38,
    { fontSize: 7.5, weight: 'bold', align: textAlign, baseRtl: false, color: [92, 104, 110] },
    state
  );

  // Footer
  doc.setDrawColor(216, 223, 226);
  doc.line(M, H - 18, W - M, H - 18);
  drawMixedText(
    doc,
    tr(
      lang,
      'منصة التدريب الحر (تدريبي) • https://tadribi.chtbqi.com • إيصال إلكتروني موثق',
      'Tadribi — Plateforme de Formation Libre • https://tadribi.chtbqi.com',
      'Tadribi Official Platform • https://tadribi.chtbqi.com'
    ),
    W / 2,
    H - 10,
    { fontSize: 8, weight: 'normal', align: 'center', baseRtl: isRtl, color: [107, 120, 126] },
    state
  );

  doc.save(`tadribi-receipt-${receipt.rid}.pdf`);
}

// ============================================================================
// 2. GENUINE 300 DPI HIGH-RES JPG RECEIPT (2480x3508 px A4 + JFIF 300 DPI HEADER)
// ============================================================================

export async function downloadStudentReceiptJpg(receipt: PrintableReceiptData, lang: Language): Promise<void> {
  const isRtl = lang === 'ar';
  const [logoPng, qrPng] = await Promise.all([
    loadLogoPngDataUrl(),
    generateQrPngDataUrl(getCanonicalReceiptVerifyUrl(receipt)),
  ]);
  const [logoImg, qrImg] = await Promise.all([
    logoPng ? loadImageElement(logoPng) : Promise.resolve(null),
    loadImageElement(qrPng),
  ]);

  // Ensure Noto Sans Arabic font is loaded if available
  try {
    await document.fonts.ready;
  } catch {
    // continue gracefully
  }

  // Genuine 300 DPI A4 canvas: 2480 x 3508 pixels
  const canvas = document.createElement('canvas');
  canvas.width = 2480;
  canvas.height = 3508;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Header
  ctx.fillStyle = '#384D55';
  ctx.fillRect(0, 0, canvas.width, 450);
  ctx.fillStyle = '#A6CE39';
  ctx.fillRect(0, 450, canvas.width, 28);

  const M = 165;
  const W = canvas.width;
  if (logoImg) {
    const lx = isRtl ? W - M - 280 : M;
    ctx.drawImage(logoImg, lx, 85, 280, 280);
  }

  ctx.direction = isRtl ? 'rtl' : 'ltr';
  ctx.textAlign = isRtl ? 'right' : 'left';
  const txX = isRtl ? W - M - 330 : M + 330;

  ctx.fillStyle = '#ffffff';
  ctx.font = '700 66px "Noto Sans Arabic", Tahoma, Arial, sans-serif';
  ctx.fillText(
    tr(lang, 'منصة تدريبي — التدريب الحر', 'Plateforme Tadribi — Formation Libre', 'Tadribi Platform — Official Receipt'),
    txX,
    185
  );

  ctx.fillStyle = '#e2efbf';
  ctx.font = '600 44px "Noto Sans Arabic", Tahoma, Arial, sans-serif';
  ctx.fillText(
    tr(lang, 'إيصال اشتراك ودفع إلكتروني رسمي', 'Reçu officiel de paiement et d’abonnement', 'Official Student Payment Receipt'),
    txX,
    270
  );

  ctx.fillStyle = '#A6CE39';
  ctx.font = '700 34px Arial, sans-serif';
  ctx.fillText('https://tadribi.chtbqi.com', txX, 345);

  // Status banner
  let y = 570;
  ctx.fillStyle = '#f7f9fa';
  ctx.strokeStyle = '#d8dfe2';
  ctx.lineWidth = 4;
  ctx.fillRect(M, y, W - M * 2, 220);
  ctx.strokeRect(M, y, W - M * 2, 220);

  ctx.fillStyle = '#5c686e';
  ctx.font = '600 36px "Noto Sans Arabic", Tahoma, Arial, sans-serif';
  ctx.fillText(tr(lang, 'رقم الإيصال المعتمد', 'Référence du reçu', 'Official Receipt No.'), isRtl ? W - M - 55 : M + 55, y + 85);
  ctx.fillStyle = '#384D55';
  ctx.font = '800 50px monospace';
  ctx.fillText(receipt.rid, isRtl ? W - M - 55 : M + 55, y + 162);

  // Badge
  const badgeW = 620;
  const badgeX = isRtl ? M + 50 : W - M - badgeW - 50;
  ctx.fillStyle = receipt.verified ? '#e2efbf' : '#fef3c7';
  ctx.fillRect(badgeX, y + 48, badgeW, 124);
  ctx.fillStyle = receipt.verified ? '#456810' : '#92400e';
  ctx.font = '800 42px "Noto Sans Arabic", Tahoma, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(receiptStatusLabel(receipt.status, lang), badgeX + badgeW / 2, y + 125);

  // Rows Table
  y += 300;
  const tableRows: Array<[string, string]> = [
    [tr(lang, 'اسم الطالب', 'Étudiant', 'Student Name'), receipt.studentName || '—'],
    [tr(lang, 'البريد الإلكتروني', 'E-mail', 'Email Address'), receipt.studentEmail || '—'],
    [tr(lang, 'الباقة المختارة', 'Formule', 'Plan'), receipt.planName || '—'],
    [tr(lang, 'وسيلة الدفع', 'Moyen de paiement', 'Payment Method'), receiptMethodLabel(receipt, lang)],
    [
      tr(lang, 'مرجع المعاملة', 'Référence transaction', 'Transaction ID'),
      receipt.transactionId || receipt.transactionReference || receipt.rid,
    ],
    [
      tr(lang, 'المبلغ المطلوب', 'Montant requis', 'Required Amount'),
      `${Number(receipt.amount || 0).toLocaleString()} ${receipt.currency || 'MRU'}`,
    ],
    [
      tr(lang, 'المبلغ المدفوع', 'Montant payé', 'Paid Amount'),
      `${Number(receipt.paidAmount ?? receipt.amount ?? 0).toLocaleString()} ${receipt.currency || 'MRU'}`,
    ],
    [tr(lang, 'تاريخ العملية', 'Date', 'Date'), formatDateSafe(receipt.transactionAt, lang)],
  ];
  if (receipt.expiresAt) {
    tableRows.push([tr(lang, 'تاريخ انتهاء الاشتراك', 'Date d’expiration', 'Valid Until'), formatDateSafe(receipt.expiresAt, lang)]);
  }

  ctx.textAlign = isRtl ? 'right' : 'left';
  ctx.fillStyle = '#384D55';
  ctx.fillRect(M, y, W - M * 2, 110);
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 40px "Noto Sans Arabic", Tahoma, Arial, sans-serif';
  ctx.fillText(tr(lang, 'بيان الإيصال', 'Détail du reçu', 'Receipt Field'), isRtl ? W - M - 45 : M + 45, y + 70);
  ctx.textAlign = isRtl ? 'left' : 'right';
  ctx.fillStyle = '#A6CE39';
  ctx.fillText(tr(lang, 'القيمة المسجلة', 'Valeur enregistrée', 'Recorded Value'), isRtl ? M + 45 : W - M - 45, y + 70);
  y += 110;

  tableRows.forEach(([k, v], i) => {
    ctx.fillStyle = i % 2 === 0 ? '#ffffff' : '#f7f9fa';
    ctx.fillRect(M, y, W - M * 2, 112);
    ctx.strokeStyle = '#e4e9ec';
    ctx.strokeRect(M, y, W - M * 2, 112);

    ctx.textAlign = isRtl ? 'right' : 'left';
    ctx.fillStyle = '#384D55';
    ctx.font = '700 38px "Noto Sans Arabic", Tahoma, Arial, sans-serif';
    ctx.fillText(k, isRtl ? W - M - 45 : M + 45, y + 70);

    ctx.textAlign = isRtl ? 'left' : 'right';
    ctx.fillStyle = '#1f2937';
    ctx.font = '600 38px "Noto Sans Arabic", Tahoma, Arial, sans-serif';
    ctx.fillText(v, isRtl ? M + 45 : W - M - 45, y + 70);
    y += 112;
  });

  // QR Verification Box
  y += 110;
  ctx.fillStyle = '#f9fcf2';
  ctx.strokeStyle = '#A6CE39';
  ctx.lineWidth = 6;
  ctx.fillRect(M, y, W - M * 2, 520);
  ctx.strokeRect(M, y, W - M * 2, 520);

  if (qrImg) {
    const qSize = 420;
    const qx = isRtl ? M + 65 : W - M - qSize - 65;
    ctx.drawImage(qrImg, qx, y + 50, qSize, qSize);
  }

  ctx.textAlign = isRtl ? 'right' : 'left';
  const qInfoX = isRtl ? W - M - 75 : M + 75;
  ctx.fillStyle = '#456810';
  ctx.font = '800 46px "Noto Sans Arabic", Tahoma, Arial, sans-serif';
  ctx.fillText(
    tr(lang, 'التحقق الرقمي الفوري من الإيصال', 'Vérification numérique du reçu', 'Digital Receipt Verification'),
    qInfoX,
    y + 150
  );
  ctx.fillStyle = '#384D55';
  ctx.font = '600 34px "Noto Sans Arabic", Tahoma, Arial, sans-serif';
  ctx.fillText(
    tr(lang, 'امسح الرمز للتحقق مباشرة عبر tadribi.chtbqi.com', 'Scannez pour vérifier sur tadribi.chtbqi.com', 'Scan to verify on tadribi.chtbqi.com'),
    qInfoX,
    y + 235
  );
  ctx.fillStyle = '#5c686e';
  ctx.font = '600 28px monospace';
  ctx.fillText(getCanonicalReceiptVerifyUrl(receipt).slice(0, 62), qInfoX, y + 320);

  // Footer
  ctx.textAlign = 'center';
  ctx.fillStyle = '#6b787e';
  ctx.font = '600 32px "Noto Sans Arabic", Tahoma, Arial, sans-serif';
  ctx.fillText('https://tadribi.chtbqi.com — منصة تدريبي للتدريب الحر', W / 2, 3360);

  const dataUrl = canvas.toDataURL('image/jpeg', 0.96);
  const dpiBlob = injectJpegDpiMetadata(dataUrl, 300);
  triggerBlobDownload(dpiBlob, `tadribi-receipt-${receipt.rid}.jpg`);
}

// ============================================================================
// 3. PRINT STUDENT RECEIPT (ISOLATED IFRAME + WINDOW.PRINT)
// ============================================================================

export async function printStudentReceipt(receipt: PrintableReceiptData, lang: Language): Promise<void> {
  const isRtl = lang === 'ar';
  const qrUrl = await generateQrPngDataUrl(getCanonicalReceiptVerifyUrl(receipt));
  const verifyLink = getCanonicalReceiptVerifyUrl(receipt);

  const html = `<!doctype html>
<html lang="${lang}" dir="${isRtl ? 'rtl' : 'ltr'}">
<head>
  <meta charset="utf-8" />
  <title>${escHtml(receipt.rid)} - ${tr(lang, 'إيصال تدريبي', 'Reçu Tadribi', 'Tadribi Receipt')}</title>
  <style>
    @page { size: A4; margin: 14mm; }
    * { box-sizing: border-box; font-family: "Noto Sans Arabic", Tahoma, Arial, sans-serif; }
    body { margin: 0; color: #24333a; background: #fff; }
    .hdr { display:flex; justify-content:space-between; align-items:center; background:#384D55; color:#fff; padding:18px 22px; border-bottom:4px solid #A6CE39; border-radius:6px 6px 0 0; }
    .hdr img { width:56px; height:56px; object-fit:contain; }
    .title { font-size:18px; font-weight:800; }
    .sub { font-size:12px; color:#e2efbf; margin-top:4px; }
    .card { border:1px solid #d8dfe2; border-top:0; padding:20px; border-radius:0 0 6px 6px; }
    .badge { display:inline-block; padding:5px 14px; border-radius:4px; font-size:12px; font-weight:800; background:${receipt.verified ? '#e2efbf' : '#fef3c7'}; color:${receipt.verified ? '#456810' : '#92400e'}; }
    .toprow { display:flex; justify-content:space-between; align-items:center; padding:12px 14px; background:#f7f9fa; border:1px solid #e4e9ec; border-radius:4px; margin-bottom:16px; }
    table { width:100%; border-collapse:collapse; font-size:13px; margin-bottom:18px; }
    th, td { padding:10px 12px; border:1px solid #e4e9ec; text-align:${isRtl ? 'right' : 'left'}; }
    th { background:#384D55; color:#fff; font-weight:700; }
    tr:nth-child(even) td { background:#f9fbfb; }
    .qrbox { display:flex; align-items:center; justify-content:space-between; gap:16px; background:#f9fcf2; border:1.5px solid #A6CE39; border-radius:6px; padding:14px 18px; }
    .qrbox img { width:112px; height:112px; }
    .ft { margin-top:18px; text-align:center; font-size:11px; color:#6b787e; }
  </style>
</head>
<body>
  <div class="hdr">
    <div>
      <div class="title">${tr(lang, 'منصة تدريبي — التدريب الحر', 'Plateforme Tadribi', 'Tadribi Official Platform')}</div>
      <div class="sub">${tr(lang, 'إيصال اشتراك ودفع رسمي', 'Reçu officiel d’abonnement', 'Official Payment Receipt')}</div>
    </div>
    <img src="${window.location.origin}/assets/images/platform-logo.webp" alt="Tadribi" />
  </div>
  <div class="card">
    <div class="toprow">
      <div><strong>${tr(lang, 'رقم الإيصال:', 'Réf. :', 'Receipt No:')}</strong> <span dir="ltr">${escHtml(receipt.rid)}</span></div>
      <span class="badge">${escHtml(receiptStatusLabel(receipt.status, lang))}</span>
    </div>
    <table>
      <thead><tr><th>${tr(lang, 'البند', 'Champ', 'Field')}</th><th>${tr(lang, 'التفاصيل', 'Détails', 'Details')}</th></tr></thead>
      <tbody>
        <tr><td>${tr(lang, 'اسم الطالب', 'Étudiant', 'Student Name')}</td><td>${escHtml(receipt.studentName || '—')}</td></tr>
        <tr><td>${tr(lang, 'البريد الإلكتروني', 'E-mail', 'Email')}</td><td dir="ltr">${escHtml(receipt.studentEmail || '—')}</td></tr>
        <tr><td>${tr(lang, 'الباقة', 'Formule', 'Plan')}</td><td>${escHtml(receipt.planName)}</td></tr>
        <tr><td>${tr(lang, 'وسيلة الدفع', 'Moyen de paiement', 'Payment Method')}</td><td>${escHtml(receiptMethodLabel(receipt, lang))}</td></tr>
        <tr><td>${tr(lang, 'مرجع المعاملة', 'Référence TX', 'Transaction ID')}</td><td dir="ltr">${escHtml(receipt.transactionId || receipt.transactionReference || receipt.rid)}</td></tr>
        <tr><td>${tr(lang, 'المبلغ المطلوب', 'Montant requis', 'Required Amount')}</td><td>${Number(receipt.amount || 0).toLocaleString()} ${escHtml(receipt.currency || 'MRU')}</td></tr>
        <tr><td>${tr(lang, 'المبلغ المدفوع', 'Montant payé', 'Paid Amount')}</td><td><strong>${Number(receipt.paidAmount ?? receipt.amount ?? 0).toLocaleString()} ${escHtml(receipt.currency || 'MRU')}</strong></td></tr>
        <tr><td>${tr(lang, 'التاريخ', 'Date', 'Date')}</td><td dir="ltr">${escHtml(formatDateSafe(receipt.transactionAt, lang))}</td></tr>
        ${receipt.expiresAt ? `<tr><td>${tr(lang, 'تاريخ الانتهاء', 'Expiration', 'Expires')}</td><td dir="ltr">${escHtml(formatDateSafe(receipt.expiresAt, lang))}</td></tr>` : ''}
      </tbody>
    </table>
    <div class="qrbox">
      <div>
        <div style="font-weight:800;color:#456810;font-size:14px;margin-bottom:4px;">${tr(lang, 'التحقق الفوري من الإيصال', 'Vérification numérique', 'Instant QR Verification')}</div>
        <div style="font-size:12px;color:#384D55;">${tr(lang, 'امسح الرمز للتحقق عبر الموقع الرسمي', 'Scannez pour vérifier sur le site officiel', 'Scan to verify on tadribi.chtbqi.com')}</div>
        <div style="font-size:10px;color:#6b787e;margin-top:6px;word-break:break-all;" dir="ltr">${escHtml(verifyLink)}</div>
      </div>
      <img src="${qrUrl}" alt="QR" />
    </div>
    <div class="ft">https://tadribi.chtbqi.com — ${tr(lang, 'وثيقة إلكترونية رسمية', 'Document officiel', 'Official Document')}</div>
  </div>
</body>
</html>`;

  printHtmlViaHiddenIframe(html);
}

// ============================================================================
// 5. EXAM GRADE REPORT 300 DPI JPG EXPORT (NO PDF BUTTON ON EXAM RESULTS)
// ============================================================================

export interface ExamTranscriptJpgData {
  attemptId: number | string;
  modeLabel: string;
  trackLabel: string;
  studentName: string;
  studentEmail?: string;
  score: number;
  maxScore: number;
  passingScore: number;
  correctCount: number;
  wrongCount: number;
  unansweredCount: number;
  percentage: number;
  submittedAt?: string | null;
  photoDataUrl?: string | null;
  subjectBreakdown?: Array<{ label: string; correct: number; total: number; percentage: number }>;
  topicBreakdown?: Array<{ label: string; correct: number; total: number; percentage: number }>;
}

export async function downloadExamTranscriptJpg(data: ExamTranscriptJpgData, lang: Language): Promise<void> {
  const isRtl = lang === 'ar';
  const [logoPng, photoImg] = await Promise.all([
    loadLogoPngDataUrl(),
    data.photoDataUrl ? loadImageElement(data.photoDataUrl) : Promise.resolve(null),
  ]);
  const logoImg = logoPng ? await loadImageElement(logoPng) : null;
  try {
    await document.fonts.ready;
  } catch {
    // ignore
  }

  const canvas = document.createElement('canvas');
  canvas.width = 2480;
  canvas.height = 3508;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const W = canvas.width;
  const M = 165;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, canvas.height);

  // Header
  ctx.fillStyle = '#384D55';
  ctx.fillRect(0, 0, W, 430);
  ctx.fillStyle = '#A6CE39';
  ctx.fillRect(0, 430, W, 28);

  if (logoImg) {
    ctx.drawImage(logoImg, isRtl ? W - M - 260 : M, 80, 260, 260);
  }

  ctx.direction = isRtl ? 'rtl' : 'ltr';
  ctx.textAlign = isRtl ? 'right' : 'left';
  const txX = isRtl ? W - M - 310 : M + 310;
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 62px "Noto Sans Arabic", Tahoma, Arial, sans-serif';
  ctx.fillText(
    tr(lang, 'كشف درجات الامتحان — منصة تدريبي', 'Relevé de notes d’examen — Tadribi', 'Exam Grade Report — Tadribi'),
    txX,
    175
  );
  ctx.fillStyle = '#e2efbf';
  ctx.font = '600 38px "Noto Sans Arabic", Tahoma, Arial, sans-serif';
  ctx.fillText(`${data.modeLabel} • ${data.trackLabel}`, txX, 255);
  ctx.fillStyle = '#A6CE39';
  ctx.font = '700 32px Arial, sans-serif';
  ctx.fillText('https://tadribi.chtbqi.com', txX, 325);

  // Candidate + Score Box
  let y = 520;
  const passed = Number(data.score) >= Number(data.passingScore || 10);
  ctx.fillStyle = passed ? '#f9fcf2' : '#fffbeb';
  ctx.strokeStyle = passed ? '#A6CE39' : '#f59e0b';
  ctx.lineWidth = 6;
  ctx.fillRect(M, y, W - M * 2, 340);
  ctx.strokeRect(M, y, W - M * 2, 340);

  if (photoImg) {
    const pSize = 250;
    const px = isRtl ? M + 55 : W - M - pSize - 55;
    ctx.drawImage(photoImg, px, y + 45, pSize, pSize);
    ctx.strokeStyle = '#384D55';
    ctx.lineWidth = 4;
    ctx.strokeRect(px, y + 45, pSize, pSize);
  }

  const infoX = isRtl ? W - M - 60 : M + 60;
  ctx.fillStyle = '#384D55';
  ctx.font = '800 50px "Noto Sans Arabic", Tahoma, Arial, sans-serif';
  ctx.fillText(data.studentName || tr(lang, 'المترشح', 'Candidat', 'Candidate'), infoX, y + 95);

  ctx.fillStyle = '#5c686e';
  ctx.font = '600 34px "Noto Sans Arabic", Tahoma, Arial, sans-serif';
  ctx.fillText(
    `${data.studentEmail ? `${data.studentEmail} • ` : ''}${formatDateSafe(data.submittedAt || new Date().toISOString(), lang)}`,
    infoX,
    y + 158
  );

  ctx.fillStyle = passed ? '#456810' : '#b45309';
  ctx.font = '800 72px "Noto Sans Arabic", Tahoma, Arial, sans-serif';
  ctx.fillText(
    `${tr(lang, 'النتيجة النهائية:', 'Note finale :', 'Final Score:')} ${Number(data.score).toFixed(2)} / ${data.maxScore}`,
    infoX,
    y + 265
  );

  // 4-Stat Strip
  y += 400;
  const gap = 30;
  const boxW = (W - M * 2 - gap * 3) / 4;
  const stats: Array<{ label: string; value: string; color: string }> = [
    { label: tr(lang, 'الإجابات الصحيحة', 'Correctes', 'Correct'), value: String(data.correctCount), color: '#15803d' },
    { label: tr(lang, 'الأخطاء', 'Erronées', 'Wrong'), value: String(data.wrongCount), color: '#b91c1c' },
    { label: tr(lang, 'غير مجاب', 'Sans réponse', 'Unanswered'), value: String(data.unansweredCount), color: '#b45309' },
    { label: tr(lang, 'النسبة المئوية', 'Pourcentage', 'Percentage'), value: `${data.percentage}%`, color: '#384D55' },
  ];
  stats.forEach((st, idx) => {
    const bx = M + idx * (boxW + gap);
    ctx.fillStyle = '#f4f6f7';
    ctx.strokeStyle = '#d8dfe2';
    ctx.lineWidth = 4;
    ctx.fillRect(bx, y, boxW, 200);
    ctx.strokeRect(bx, y, boxW, 200);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#5c686e';
    ctx.font = '700 32px "Noto Sans Arabic", Tahoma, Arial, sans-serif';
    ctx.fillText(st.label, bx + boxW / 2, y + 70);

    ctx.fillStyle = st.color;
    ctx.font = '900 58px monospace';
    ctx.fillText(st.value, bx + boxW / 2, y + 150);
  });

  // Breakdown Rows
  y += 270;
  const rowsToDraw = (data.subjectBreakdown && data.subjectBreakdown.length > 0)
    ? data.subjectBreakdown
    : data.topicBreakdown || [];
  const sectionTitle =
    data.subjectBreakdown && data.subjectBreakdown.length > 0
      ? tr(lang, 'نتائج المواد التفصيلية', 'Résultats par matière', 'Subject Breakdown')
      : tr(lang, 'تحليل الأداء حسب المحاور', 'Analyse par thème', 'Performance by Topic');

  if (rowsToDraw.length > 0) {
    ctx.fillStyle = '#384D55';
    ctx.fillRect(M, y, W - M * 2, 110);
    ctx.fillStyle = '#ffffff';
    ctx.font = '800 40px "Noto Sans Arabic", Tahoma, Arial, sans-serif';
    ctx.textAlign = isRtl ? 'right' : 'left';
    ctx.fillText(sectionTitle, isRtl ? W - M - 45 : M + 45, y + 70);
    ctx.textAlign = isRtl ? 'left' : 'right';
    ctx.fillStyle = '#A6CE39';
    ctx.fillText(tr(lang, 'النتيجة', 'Score', 'Score'), isRtl ? M + 45 : W - M - 45, y + 70);
    y += 110;

    const maxVisible = Math.min(rowsToDraw.length, 15);
    for (let i = 0; i < maxVisible; i++) {
      const r = rowsToDraw[i];
      ctx.fillStyle = i % 2 === 0 ? '#ffffff' : '#f7f9fa';
      ctx.fillRect(M, y, W - M * 2, 108);
      ctx.strokeStyle = '#e4e9ec';
      ctx.lineWidth = 3;
      ctx.strokeRect(M, y, W - M * 2, 108);

      ctx.textAlign = isRtl ? 'right' : 'left';
      ctx.fillStyle = '#384D55';
      ctx.font = '700 36px "Noto Sans Arabic", Tahoma, Arial, sans-serif';
      ctx.fillText(r.label.slice(0, 60), isRtl ? W - M - 45 : M + 45, y + 68);

      ctx.textAlign = isRtl ? 'left' : 'right';
      ctx.fillStyle = r.percentage >= 50 ? '#456810' : '#b45309';
      ctx.font = '800 38px monospace';
      ctx.fillText(`${r.correct}/${r.total} (${r.percentage}%)`, isRtl ? M + 45 : W - M - 45, y + 68);
      y += 108;
    }
  }

  // Footer
  ctx.textAlign = 'center';
  ctx.fillStyle = '#6b787e';
  ctx.font = '600 32px "Noto Sans Arabic", Tahoma, Arial, sans-serif';
  ctx.fillText(
    `https://tadribi.chtbqi.com — ${tr(lang, 'كشف رسمي للنتيجة • محاولة رقم', 'Relevé officiel • Tentative #', 'Official Transcript • Attempt #')}${data.attemptId}`,
    W / 2,
    3360
  );

  const dataUrl = canvas.toDataURL('image/jpeg', 0.96);
  const dpiBlob = injectJpegDpiMetadata(dataUrl, 300);
  triggerBlobDownload(dpiBlob, `tadribi-exam-result-${data.attemptId}.jpg`);
}


// ============================================================================
// 4. BACCALAUREATE GRADE CALCULATOR EXPORTS (PDF + 300 DPI JPG + PRINT)
// ============================================================================

export async function downloadBacResultPdf(data: BacResultExportData, lang: Language): Promise<void> {
  const isRtl = lang === 'ar';
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const [fontData, logoPng] = await Promise.all([loadArabicFonts(), loadLogoPngDataUrl()]);

  const state: FontState = { hasArabicFont: false };
  if (fontData) {
    doc.addFileToVFS('NotoSansArabic-Regular.ttf', fontData.regular);
    doc.addFont('NotoSansArabic-Regular.ttf', 'NotoSansArabic', 'normal');
    doc.addFileToVFS('NotoSansArabic-Bold.ttf', fontData.bold);
    doc.addFont('NotoSansArabic-Bold.ttf', 'NotoSansArabic', 'bold');
    state.hasArabicFont = true;
  }

  const W = 210;
  const H = 297;
  const M = 14;
  const CW = W - M * 2;

  doc.setFillColor(56, 77, 85);
  doc.rect(0, 0, W, 36, 'F');
  doc.setFillColor(166, 206, 57);
  doc.rect(0, 36, W, 2.5, 'F');
  if (logoPng) {
    doc.addImage(logoPng, 'PNG', isRtl ? W - M - 22 : M, 6, 22, 22);
  }

  const anchor = isRtl ? W - M - 27 : M + 27;
  const align = isRtl ? 'right' : 'left';
  drawMixedText(
    doc,
    tr(lang, 'حاسبة معدل الباكالوريا — منصة تدريبي', 'Calculateur Baccalauréat — Tadribi', 'Mauritanian Bac GPA Report — Tadribi'),
    anchor,
    15,
    { fontSize: 14, weight: 'bold', align, baseRtl: isRtl, color: [255, 255, 255] },
    state
  );
  drawMixedText(
    doc,
    isRtl ? data.seriesNameAr : data.seriesNameFr,
    anchor,
    23,
    { fontSize: 10, weight: 'normal', align, baseRtl: isRtl, color: [226, 239, 191] },
    state
  );
  drawMixedText(
    doc,
    'https://tadribi.chtbqi.com',
    anchor,
    30,
    { fontSize: 8.5, weight: 'bold', align, baseRtl: false, color: [166, 206, 57] },
    state
  );

  // Average Summary Card
  let y = 46;
  doc.setFillColor(249, 252, 242);
  doc.setDrawColor(166, 206, 57);
  doc.roundedRect(M, y, CW, 24, 2, 2, 'FD');

  drawMixedText(
    doc,
    `${tr(lang, 'المعدل التقديري:', 'Moyenne estimée :', 'Estimated Average:')} ${data.average.toFixed(2)} / 20`,
    isRtl ? W - M - 6 : M + 6,
    y + 10,
    { fontSize: 13.5, weight: 'bold', align, baseRtl: isRtl, color: [56, 77, 85] },
    state
  );
  drawMixedText(
    doc,
    `${tr(lang, 'التقدير:', 'Mention :', 'Standing:')} ${isRtl ? data.mentionAr : data.mentionFr}`,
    isRtl ? W - M - 6 : M + 6,
    y + 18,
    { fontSize: 10, weight: 'bold', align, baseRtl: isRtl, color: [69, 104, 16] },
    state
  );
  drawMixedText(
    doc,
    `${tr(lang, 'المجموع:', 'Points :', 'Total:')} ${data.weightedSum.toFixed(2)} | ${tr(lang, 'المعاملات:', 'Coeffs :', 'Coeffs:')} ${data.totalCoefficients}`,
    isRtl ? M + 6 : W - M - 6,
    y + 14,
    { fontSize: 9.5, weight: 'bold', align: isRtl ? 'left' : 'right', baseRtl: isRtl, color: [92, 104, 110] },
    state
  );

  // Subjects Table
  y += 32;
  doc.setFillColor(56, 77, 85);
  doc.rect(M, y, CW, 9.5, 'F');

  const cols = isRtl
    ? { subj: W - M - 4, coeff: W - M - 102, grade: W - M - 134, total: M + 4 }
    : { subj: M + 4, coeff: M + 102, grade: M + 134, total: W - M - 4 };

  drawMixedText(doc, tr(lang, 'المادة', 'Matière', 'Subject'), cols.subj, y + 6.3, {
    fontSize: 9.5,
    weight: 'bold',
    align,
    baseRtl: isRtl,
    color: [255, 255, 255],
  }, state);
  drawMixedText(doc, tr(lang, 'المعامل', 'Coeff.', 'Coeff'), cols.coeff, y + 6.3, {
    fontSize: 9.5,
    weight: 'bold',
    align: 'center',
    baseRtl: isRtl,
    color: [255, 255, 255],
  }, state);
  drawMixedText(doc, tr(lang, 'النقطة / 20', 'Note / 20', 'Grade / 20'), cols.grade, y + 6.3, {
    fontSize: 9.5,
    weight: 'bold',
    align: 'center',
    baseRtl: isRtl,
    color: [255, 255, 255],
  }, state);
  drawMixedText(doc, tr(lang, 'المجموع', 'Total', 'Points'), cols.total, y + 6.3, {
    fontSize: 9.5,
    weight: 'bold',
    align: isRtl ? 'left' : 'right',
    baseRtl: isRtl,
    color: [166, 206, 57],
  }, state);

  y += 9.5;
  for (let i = 0; i < data.rows.length; i++) {
    if (y > H - 28) {
      doc.addPage();
      y = 20;
    }
    const r = data.rows[i];
    doc.setFillColor(i % 2 === 0 ? 255 : 247, i % 2 === 0 ? 255 : 249, i % 2 === 0 ? 255 : 250);
    doc.setDrawColor(228, 233, 236);
    doc.rect(M, y, CW, 9.5, 'FD');

    const title = isRtl ? r.nameAr : r.nameFr || r.nameAr;
    const tag = r.isOptional ? (isRtl ? ' (اختيارية)' : ' (Opt.)') : r.isCustom ? (isRtl ? ' (مضافة)' : ' (Perso)') : '';
    drawMixedText(doc, `${title}${tag}`, cols.subj, y + 6.3, {
      fontSize: 9,
      weight: 'bold',
      align,
      baseRtl: isRtl,
      color: [56, 77, 85],
    }, state);
    drawMixedText(doc, String(r.coefficient), cols.coeff, y + 6.3, {
      fontSize: 9,
      weight: 'bold',
      align: 'center',
      baseRtl: false,
      color: [56, 77, 85],
    }, state);
    drawMixedText(doc, r.grade !== null ? r.grade.toFixed(2) : '—', cols.grade, y + 6.3, {
      fontSize: 9,
      weight: 'normal',
      align: 'center',
      baseRtl: false,
      color: [31, 41, 55],
    }, state);
    drawMixedText(doc, r.points !== null ? r.points.toFixed(2) : '—', cols.total, y + 6.3, {
      fontSize: 9,
      weight: 'bold',
      align: isRtl ? 'left' : 'right',
      baseRtl: false,
      color: [69, 104, 16],
    }, state);
    y += 9.5;
  }

  doc.setDrawColor(216, 223, 226);
  doc.line(M, H - 18, W - M, H - 18);
  drawMixedText(
    doc,
    `https://tadribi.chtbqi.com • ${formatDateSafe(data.generatedAt || new Date().toISOString(), lang)}`,
    W / 2,
    H - 10,
    { fontSize: 8, weight: 'normal', align: 'center', baseRtl: false, color: [107, 120, 126] },
    state
  );

  doc.save(`tadribi-bac-${data.seriesCode.toLowerCase().replace(/[^a-z0-9]/g, '')}.pdf`);
}

export async function downloadBacResultJpg(data: BacResultExportData, lang: Language): Promise<void> {
  const isRtl = lang === 'ar';
  const logoPng = await loadLogoPngDataUrl();
  const logoImg = logoPng ? await loadImageElement(logoPng) : null;
  try {
    await document.fonts.ready;
  } catch {
    // ignore
  }

  const canvas = document.createElement('canvas');
  canvas.width = 2480;
  canvas.height = 3508;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const W = canvas.width;
  const M = 165;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, canvas.height);

  ctx.fillStyle = '#384D55';
  ctx.fillRect(0, 0, W, 430);
  ctx.fillStyle = '#A6CE39';
  ctx.fillRect(0, 430, W, 28);
  if (logoImg) {
    ctx.drawImage(logoImg, isRtl ? W - M - 260 : M, 80, 260, 260);
  }

  ctx.direction = isRtl ? 'rtl' : 'ltr';
  ctx.textAlign = isRtl ? 'right' : 'left';
  const txX = isRtl ? W - M - 310 : M + 310;
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 64px "Noto Sans Arabic", Tahoma, Arial, sans-serif';
  ctx.fillText(
    tr(lang, 'حاسبة معدل الباكالوريا — منصة تدريبي', 'Calculateur Baccalauréat — Tadribi', 'Bac GPA Report — Tadribi'),
    txX,
    180
  );
  ctx.fillStyle = '#e2efbf';
  ctx.font = '600 42px "Noto Sans Arabic", Tahoma, Arial, sans-serif';
  ctx.fillText(isRtl ? data.seriesNameAr : data.seriesNameFr, txX, 265);
  ctx.fillStyle = '#A6CE39';
  ctx.font = '700 32px Arial, sans-serif';
  ctx.fillText('https://tadribi.chtbqi.com', txX, 335);

  let y = 530;
  ctx.fillStyle = '#f9fcf2';
  ctx.strokeStyle = '#A6CE39';
  ctx.lineWidth = 6;
  ctx.fillRect(M, y, W - M * 2, 260);
  ctx.strokeRect(M, y, W - M * 2, 260);

  ctx.fillStyle = '#384D55';
  ctx.font = '800 72px "Noto Sans Arabic", Tahoma, Arial, sans-serif';
  ctx.fillText(
    `${tr(lang, 'المعدل التقديري:', 'Moyenne :', 'Average:')} ${data.average.toFixed(2)} / 20`,
    isRtl ? W - M - 60 : M + 60,
    y + 115
  );
  ctx.fillStyle = '#456810';
  ctx.font = '700 44px "Noto Sans Arabic", Tahoma, Arial, sans-serif';
  ctx.fillText(
    `${isRtl ? data.mentionAr : data.mentionFr} • ${tr(lang, 'المجموع:', 'Total :', 'Points:')} ${data.weightedSum.toFixed(2)} / ${data.totalCoefficients}`,
    isRtl ? W - M - 60 : M + 60,
    y + 200
  );

  y += 330;
  ctx.fillStyle = '#384D55';
  ctx.fillRect(M, y, W - M * 2, 110);
  const cols = isRtl
    ? { subj: W - M - 45, coeff: W - M - 1220, grade: W - M - 1600, total: M + 45 }
    : { subj: M + 45, coeff: M + 1220, grade: M + 1600, total: W - M - 45 };

  ctx.fillStyle = '#ffffff';
  ctx.font = '800 40px "Noto Sans Arabic", Tahoma, Arial, sans-serif';
  ctx.textAlign = isRtl ? 'right' : 'left';
  ctx.fillText(tr(lang, 'المادة', 'Matière', 'Subject'), cols.subj, y + 70);
  ctx.textAlign = 'center';
  ctx.fillText(tr(lang, 'المعامل', 'Coeff.', 'Coeff'), cols.coeff, y + 70);
  ctx.fillText(tr(lang, 'النقطة / 20', 'Note / 20', 'Grade'), cols.grade, y + 70);
  ctx.textAlign = isRtl ? 'left' : 'right';
  ctx.fillStyle = '#A6CE39';
  ctx.fillText(tr(lang, 'المجموع', 'Total', 'Points'), cols.total, y + 70);

  y += 110;
  const maxRows = Math.min(data.rows.length, 18);
  for (let i = 0; i < maxRows; i++) {
    const r = data.rows[i];
    ctx.fillStyle = i % 2 === 0 ? '#ffffff' : '#f7f9fa';
    ctx.fillRect(M, y, W - M * 2, 110);
    ctx.strokeStyle = '#e4e9ec';
    ctx.lineWidth = 3;
    ctx.strokeRect(M, y, W - M * 2, 110);

    ctx.textAlign = isRtl ? 'right' : 'left';
    ctx.fillStyle = '#384D55';
    ctx.font = '700 38px "Noto Sans Arabic", Tahoma, Arial, sans-serif';
    ctx.fillText(isRtl ? r.nameAr : r.nameFr || r.nameAr, cols.subj, y + 70);

    ctx.textAlign = 'center';
    ctx.font = '700 38px monospace';
    ctx.fillText(String(r.coefficient), cols.coeff, y + 70);
    ctx.fillStyle = '#1f2937';
    ctx.fillText(r.grade !== null ? r.grade.toFixed(2) : '—', cols.grade, y + 70);

    ctx.textAlign = isRtl ? 'left' : 'right';
    ctx.fillStyle = '#456810';
    ctx.font = '800 38px monospace';
    ctx.fillText(r.points !== null ? r.points.toFixed(2) : '—', cols.total, y + 70);
    y += 110;
  }

  ctx.textAlign = 'center';
  ctx.fillStyle = '#6b787e';
  ctx.font = '600 32px "Noto Sans Arabic", Tahoma, Arial, sans-serif';
  ctx.fillText('https://tadribi.chtbqi.com — منصة تدريبي للتدريب الحر', W / 2, 3360);

  const dataUrl = canvas.toDataURL('image/jpeg', 0.96);
  const dpiBlob = injectJpegDpiMetadata(dataUrl, 300);
  triggerBlobDownload(dpiBlob, `tadribi-bac-${data.seriesCode.toLowerCase().replace(/[^a-z0-9]/g, '')}.jpg`);
}

export function printBacResult(data: BacResultExportData, lang: Language): void {
  const isRtl = lang === 'ar';
  const rowsHtml = data.rows
    .map(
      (r) => `<tr>
        <td>${escHtml(isRtl ? r.nameAr : r.nameFr || r.nameAr)}${r.isOptional ? ` <small>(${isRtl ? 'اختيارية' : 'Opt.'})</small>` : r.isCustom ? ` <small>(${isRtl ? 'مضافة' : 'Perso'})</small>` : ''}</td>
        <td style="text-align:center;">${r.coefficient}</td>
        <td style="text-align:center;" dir="ltr">${r.grade !== null ? r.grade.toFixed(2) : '—'}</td>
        <td style="text-align:${isRtl ? 'left' : 'right'};font-weight:700;color:#456810;" dir="ltr">${r.points !== null ? r.points.toFixed(2) : '—'}</td>
      </tr>`
    )
    .join('');

  const html = `<!doctype html>
<html lang="${lang}" dir="${isRtl ? 'rtl' : 'ltr'}">
<head>
  <meta charset="utf-8" />
  <title>${escHtml(isRtl ? data.seriesNameAr : data.seriesNameFr)} — Tadribi</title>
  <style>
    @page { size: A4; margin: 14mm; }
    * { box-sizing: border-box; font-family: "Noto Sans Arabic", Tahoma, Arial, sans-serif; }
    body { margin: 0; color: #24333a; }
    .hdr { display:flex; justify-content:space-between; align-items:center; background:#384D55; color:#fff; padding:16px 20px; border-bottom:4px solid #A6CE39; border-radius:6px 6px 0 0; }
    .hdr img { width:52px; height:52px; object-fit:contain; }
    .summary { display:flex; justify-content:space-between; align-items:center; background:#f9fcf2; border:1.5px solid #A6CE39; padding:14px 18px; border-radius:6px; margin:16px 0; }
    table { width:100%; border-collapse:collapse; font-size:13px; }
    th, td { padding:9px 12px; border:1px solid #e4e9ec; text-align:${isRtl ? 'right' : 'left'}; }
    th { background:#384D55; color:#fff; }
    tr:nth-child(even) td { background:#f7f9fa; }
  </style>
</head>
<body>
  <div class="hdr">
    <div>
      <div style="font-size:17px;font-weight:800;">${tr(lang, 'كشف حساب معدل الباكالوريا — منصة تدريبي', 'Relevé Calculateur Bac — Tadribi', 'Bac GPA Sheet — Tadribi')}</div>
      <div style="font-size:12px;color:#e2efbf;">${escHtml(isRtl ? data.seriesNameAr : data.seriesNameFr)}</div>
    </div>
    <img src="${window.location.origin}/assets/images/platform-logo.webp" alt="Tadribi" />
  </div>
  <div class="summary">
    <div>
      <div style="font-size:12px;color:#5c686e;">${tr(lang, 'المعدل التقديري على 20', 'Moyenne sur 20', 'Average / 20')}</div>
      <div style="font-size:24px;font-weight:900;color:#456810;" dir="ltr">${data.average.toFixed(2)} / 20</div>
    </div>
    <div style="text-align:${isRtl ? 'left' : 'right'};">
      <div style="font-weight:800;font-size:14px;">${escHtml(isRtl ? data.mentionAr : data.mentionFr)}</div>
      <div style="font-size:12px;color:#5c686e;">${tr(lang, 'المجموع:', 'Total :', 'Points:')} ${data.weightedSum.toFixed(2)} | ${tr(lang, 'المعاملات:', 'Coeffs :', 'Coeffs:')} ${data.totalCoefficients}</div>
    </div>
  </div>
  <table>
    <thead>
      <tr>
        <th>${tr(lang, 'المادة', 'Matière', 'Subject')}</th>
        <th style="text-align:center;">${tr(lang, 'المعامل', 'Coeff.', 'Coeff')}</th>
        <th style="text-align:center;">${tr(lang, 'النقطة / 20', 'Note / 20', 'Grade')}</th>
        <th style="text-align:${isRtl ? 'left' : 'right'};">${tr(lang, 'المجموع', 'Total', 'Points')}</th>
      </tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
  </table>
  <p style="text-align:center;font-size:11px;color:#6b787e;margin-top:18px;">https://tadribi.chtbqi.com</p>
</body>
</html>`;

  printHtmlViaHiddenIframe(html);
}
