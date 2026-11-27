import 'dotenv/config';
import { spawn } from 'child_process';
import crypto from 'crypto';
import { GoogleGenAI } from '@google/genai';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { stripArabicDiacritics } from './src/utils/arabicText';
import { enrichArabicTashkeelContextuallyAsync, prepareSpeechText } from './src/server/arabicTashkeel';
import {
  attachAuthIfPresent,
  buildReceiptVerifyUrl,
  clearSessionCookie,
  generateUniqueReferralCode,
  getUserAdminPermissions,
  hashPassword,
  hashResetSecret,
  isDeviceSessionRevoked,
  markFirebaseEmailVerifiedByEmail,
  normalizeQuestionFingerprint,
  OFFICIAL_ADMIN_EMAIL,
  PUBLIC_APP_ORIGIN,
  requireAdminPermission,
  requireAuth,
  requireRole,
  safeHexEquals,
  setSessionCookie,
  signSessionToken,
  updateFirebaseUserPasswordByEmail,
  validateDeviceSessionState,
  verifyCsrfForMutations,
  verifyPassword,
  verifyReceiptVerifyToken,
  type AuthenticatedRequest,
} from './src/server/auth';
import { appCache } from './src/server/cache';
import { db, expireOverdueSubscriptions, initializeDatabase, logAudit } from './src/server/db';
import { checkDatabaseHealth } from './src/server/dbAdapter';
import { backgroundQueue } from './src/server/jobQueue';
import { sendEmailVerificationEmail, sendPasswordResetEmail } from './src/server/mailer';
import {
  addNotificationClient,
  broadcastNotificationEvent,
  consumeStreamTicket,
  issueStreamTicket,
  removeNotificationClient,
} from './src/server/realtime';
import {
  inspectAndVerifyReceipt,
  validateAndDecodeReceiptDataUrl,
  type ReceiptMethod,
} from './src/server/receiptVerifier';
import { createAdminRouter } from './src/server/routes/adminRoutes';
import { createPaymentRouter, nardopayWebhookHandler } from './src/server/routes/paymentRoutes';
import { createSchoolRouter } from './src/server/routes/schoolRoutes';
import { createSocialRouter } from './src/server/routes/socialRoutes';
import { createTeacherRouter } from './src/server/routes/teacherRoutes';
import { getStorageHealth, storeBinaryFile } from './src/server/storage';

initializeDatabase();
expireOverdueSubscriptions();
setInterval(() => {
  try {
    expireOverdueSubscriptions();
  } catch {
    // ignore background sweep error
  }
}, 60_000);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

const ALLOWED_EXACT_ORIGINS = new Set(
  [
    'https://tadribi.chtbqi.com',
    'https://www.tadribi.chtbqi.com',
    'https://api.tadribi.chtbqi.com',
    'https://tedribi.pages.dev',
    'https://b495be73.tedribi.pages.dev',
    'https://ip.tadribi.chtbqi.com',
    // Native Capacitor apps (Android WebView / iOS WKWebView) call the API from these origins.
    'https://localhost',
    'capacitor://localhost',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    ...(process.env.APP_URL ? [process.env.APP_URL.trim().replace(/\/+$/, '')] : []),
    ...(process.env.CORS_ORIGINS
      ? process.env.CORS_ORIGINS.split(',').map((o) => o.trim().replace(/\/+$/, '')).filter(Boolean)
      : []),
  ].filter(Boolean)
);

function isOriginAllowed(origin: string | undefined): origin is string {
  if (!origin) return false;
  const clean = origin.trim().replace(/\/+$/, '');
  if (ALLOWED_EXACT_ORIGINS.has(clean)) return true;
  if (/^https:\/\/[a-z0-9-]+\.tedribi\.pages\.dev$/i.test(clean)) return true;
  return false;
}

app.set('trust proxy', 1);
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (isOriginAllowed(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, X-Device-Session-Id');
    res.setHeader('Access-Control-Max-Age', '86400');
  }
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
});

// NardoPay webhook MUST receive the unparsed raw Buffer BEFORE express.json() for HMAC-SHA256 verification
app.post('/webhooks/nardopay', express.raw({ type: 'application/json', limit: '2mb' }), nardopayWebhookHandler);

app.use(express.json({ limit: '15mb' }));
app.use(verifyCsrfForMutations);
app.use(attachAuthIfPresent);
app.use((req: AuthenticatedRequest, _res, next) => {
  if (req.authUser) {
    const row = db.prepare('SELECT token_version FROM users WHERE id = ?').get(req.authUser.userId) as
      | { token_version: number }
      | undefined;
    const currentTv = row?.token_version ?? 1;
    if (!row || (req.authUser.tv ?? 1) !== currentTv) {
      req.authUser = undefined;
    }
  }
  next();
});

// Google Search Console verification file served explicitly at domain root (dev + prod)
app.get('/google8bc75b3f6bec4076.html', (_req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.type('text/html; charset=utf-8').send('google-site-verification: google8bc75b3f6bec4076.html');
});

// Helper: parse JSON safely
function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function getGradingPolicy(): { maxScore: number; wrongPenalty: number; passingScore: number } {
  const row = db.prepare("SELECT value FROM app_settings WHERE key = 'grading_policy'").get() as
    | { value: string }
    | undefined;
  return parseJson(row?.value, { maxScore: 20, wrongPenalty: 0, passingScore: 10 });
}

const DEFAULT_SITE_CONFIG = {
  tickerMessages: [
    {
      id: 't1',
      text_ar: 'جديد: **بنك الأسئلة المحقق** بالاستماع الصوتي التلقائي',
      text_fr: 'Nouveau : **Banque de questions vérifiée** avec audio automatique',
    },
    {
      id: 't2',
      text_ar: '**{{questionsCount}}** سؤال محقق جاهز للمراجعة',
      text_fr: '**{{questionsCount}}** questions vérifiées prêtes pour révision',
    },
    {
      id: 't3',
      text_ar: 'تابع تقدمك من **لوحة الطالب**',
      text_fr: 'Suivez votre progression depuis **Tableau étudiant**',
    },
  ],
  heroSlides: [
    {
      id: 's1',
      tag_ar: 'مسارات التحضير لمسابقة المعلمين في موريتانيا',
      tag_fr: 'Parcours du concours des instituteurs en Mauritanie',
      title_ar: 'التحضير المنهجي المتكامل لمسابقة اكتتاب المعلمين في موريتانيا',
      title_fr: 'Préparation officielle complète au concours des instituteurs en Mauritanie',
      desc_ar:
        'دروس منظمة حسب الشعبة (عربي، فرنسي، مزدوج)، ملخصات مركزة، وبنك أسئلة مع امتحانات محاكية وفق نظام التقييم من 20.',
      desc_fr:
        'Leçons par filière (Arabe, Français, Bilingue), fiches de synthèse et examens blancs notés sur 20.',
      cta1_ar: 'ابدأ بالاختبار الرسمي المحاكي',
      cta1_fr: 'Démarrer la simulation officielle',
      cta1_view: 'exams',
      cta1_exam_mode: 'official_sim',
      cta2_ar: 'الدروس والمقررات',
      cta2_fr: 'Leçons & Cours',
      cta2_view: 'lessons',
    },
    {
      id: 's2',
      tag_ar: 'الملخصات ومركز المراجعة',
      tag_fr: 'Résumés et centre de révision',
      title_ar: 'ملخصات مركّزة وخطة مراجعة واضحة حتى يوم المسابقة',
      title_fr: 'Fiches condensées et plan de révision structuré jusqu’au concours',
      desc_ar:
        'نظّم مراجعتك درساً بعد درس، وتابع تقدمك في بنك الأسئلة والاستماع الصوتي من لوحة الطالب.',
      desc_fr:
        'Organisez votre révision leçon par leçon et suivez votre progression depuis le tableau étudiant.',
      cta1_ar: 'مركز المراجعة',
      cta1_fr: 'Centre de révision',
      cta1_view: 'review-center',
      cta2_ar: 'الملخصات',
      cta2_fr: 'Résumés',
      cta2_view: 'summaries',
    },
    {
      id: 's3',
      tag_ar: 'الامتحانات التجريبية',
      tag_fr: 'Examens blancs chronométrés',
      title_ar: 'اختبر نفسك بامتحانات على نمط المسابقة الحقيقية',
      title_fr: 'Entraînez-vous avec des examens conformes au format officiel',
      desc_ar:
        'امتحانات موقّتة مع تصحيح فوري وفق المقياس الرسمي على 20 وتحليل لنقاط القوة والضعف.',
      desc_fr:
        'Épreuves chronométrées avec correction immédiate sur 20 et diagnostic détaillé des acquis.',
      cta1_ar: 'ابدأ امتحاناً',
      cta1_fr: 'Démarrer un examen',
      cta1_view: 'exams',
      cta1_exam_mode: 'mock',
      cta2_ar: 'لوحة الطالب',
      cta2_fr: 'Tableau étudiant',
      cta2_view: 'dashboard',
    },
  ],
};

function getSiteConfig() {
  const row = db.prepare("SELECT value FROM app_settings WHERE key = 'site_config'").get() as
    | { value: string }
    | undefined;
  const parsed = parseJson<typeof DEFAULT_SITE_CONFIG>(row?.value, DEFAULT_SITE_CONFIG);
  return {
    tickerMessages:
      Array.isArray(parsed?.tickerMessages) && parsed.tickerMessages.length > 0
        ? parsed.tickerMessages
        : DEFAULT_SITE_CONFIG.tickerMessages,
    heroSlides:
      Array.isArray(parsed?.heroSlides) && parsed.heroSlides.length > 0
        ? parsed.heroSlides
        : DEFAULT_SITE_CONFIG.heroSlides,
  };
}

function getUserActiveSubscription(userId: number) {
  expireOverdueSubscriptions();

  const row = db
    .prepare(
      `SELECT us.id, us.plan_id, us.status, us.starts_at, us.expires_at,
              sp.slug as plan_slug, sp.name_ar, sp.name_fr, sp.billing_cycle
       FROM user_subscriptions us
       JOIN subscription_plans sp ON sp.id = us.plan_id
       WHERE us.user_id = ? AND us.status = 'active'
       ORDER BY us.id DESC LIMIT 1`
    )
    .get(userId) as any;

  if (!row) return null;
  return {
    id: row.id,
    plan_id: row.plan_id,
    plan_slug: row.plan_slug,
    name_ar: row.name_ar,
    name_fr: row.name_fr,
    billing_cycle: row.billing_cycle,
    status: row.status,
    starts_at: row.starts_at,
    expires_at: row.expires_at,
  };
}

function getUserLatestExpiredSubscription(userId: number) {
  const row = db
    .prepare(
      `SELECT us.id, us.plan_id, us.status, us.starts_at, us.expires_at,
              sp.slug as plan_slug, sp.name_ar, sp.name_fr, sp.billing_cycle
       FROM user_subscriptions us
       JOIN subscription_plans sp ON sp.id = us.plan_id
       WHERE us.user_id = ? AND us.status = 'expired' AND sp.price_mru > 0
       ORDER BY us.id DESC LIMIT 1`
    )
    .get(userId) as any;
  if (!row) return null;
  return {
    id: row.id,
    plan_id: row.plan_id,
    plan_slug: row.plan_slug,
    name_ar: row.name_ar,
    name_fr: row.name_fr,
    billing_cycle: row.billing_cycle,
    status: row.status,
    starts_at: row.starts_at,
    expires_at: row.expires_at,
  };
}

function getEffectivePlanTier(user: { userId: number; role: string } | undefined): 'free' | 'paid' {
  if (!user) return 'free';
  if (user.role === 'admin') return 'paid';
  const sub = getUserActiveSubscription(user.userId);
  if (!sub) return 'free';
  if (sub.plan_slug === 'free-starter' || sub.billing_cycle === 'free') return 'free';
  return 'paid';
}

function getPlanLimitsForTier(tier: 'free' | 'paid') {
  const row = db.prepare('SELECT * FROM plan_limits WHERE plan_tier = ?').get(tier) as any;
  return (
    row || {
      plan_tier: tier,
      daily_questions_limit: tier === 'paid' ? 99999 : 25,
      daily_lessons_limit: tier === 'paid' ? 99999 : 3,
      daily_exams_limit: tier === 'paid' ? 99999 : 2,
      allow_official_sim: tier === 'paid' ? 1 : 0,
      allow_review_center: 1,
    }
  );
}

function sanitizeUser(row: any) {
  if (!row) return null;
  const activeSubscription = getUserActiveSubscription(row.id);
  const latestExpiredSubscription = activeSubscription ? null : getUserLatestExpiredSubscription(row.id);
  const permissions = getUserAdminPermissions(row.id, String(row.email || ''));
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    track: row.track,
    preferred_lang: row.preferred_lang,
    level: row.level,
    teacher_category: row.teacher_category || '',
    professor_specialty: row.professor_specialty || '',
    phone: row.phone || '',
    referral_code: row.referral_code || '',
    referral_points: Number(row.referral_points || 0),
    email_verified: Boolean(row.email_verified),
    verified_account: Boolean(row.verified_account),
    verified_badge_label: row.verified_badge_label || '',
    verified_at: row.verified_at || null,
    followers_count: Number(row.followers_count || 0),
    following_count: Number(row.following_count || 0),
    notification_sound_enabled: row.notification_sound_enabled === undefined ? true : Boolean(row.notification_sound_enabled),
    permissions,
    geo_permission_status: row.geo_permission_status || 'prompt',
    last_geo_lat: row.last_geo_lat !== null && row.last_geo_lat !== undefined ? Number(row.last_geo_lat) : null,
    last_geo_lng: row.last_geo_lng !== null && row.last_geo_lng !== undefined ? Number(row.last_geo_lng) : null,
    last_geo_label: row.last_geo_label || '',
    last_geo_updated_at: row.last_geo_updated_at || null,
    notification_permission_status: row.notification_permission_status || 'default',
    last_profile_updated_at: row.last_profile_updated_at || null,
    last_password_updated_at: row.last_password_updated_at || null,
    last_login_at: row.last_login_at || null,
    last_active_at: row.last_active_at || null,
    created_at: row.created_at,
    activeSubscription,
    latestExpiredSubscription,
  };
}

function getReferralSettingsRow() {
  const row = db.prepare('SELECT * FROM referral_settings WHERE id = 1').get() as any;
  return (
    row || {
      id: 1,
      enabled: 1,
      points_per_referral: 20,
      reward_threshold_points: 1000,
      reward_duration_days: 30,
      welcome_bonus_points: 0,
      max_rewards_per_user: 12,
    }
  );
}

function settlePendingReferralIfVerified(userId: number, emailVerified: boolean): void {
  if (!emailVerified) return;
  const pending = db
    .prepare("SELECT * FROM referral_logs WHERE referred_user_id = ? AND status = 'pending_verification' LIMIT 1")
    .get(userId) as any;
  if (!pending) return;

  const settings = getReferralSettingsRow();
  if (!settings.enabled) return;

  const pts = Math.max(1, Number(settings.points_per_referral || 20));
  const tx = db.transaction(() => {
    const upd = db
      .prepare(
        "UPDATE referral_logs SET status = 'verified_rewarded', points_awarded = ?, verified_at = datetime('now') WHERE id = ? AND status = 'pending_verification'"
      )
      .run(pts, pending.id);
    if (upd.changes === 0) return;
    db.prepare('UPDATE users SET referral_points = COALESCE(referral_points, 0) + ? WHERE id = ?').run(
      pts,
      pending.referrer_user_id
    );
    if (Number(settings.welcome_bonus_points || 0) > 0) {
      db.prepare('UPDATE users SET referral_points = COALESCE(referral_points, 0) + ? WHERE id = ?').run(
        Number(settings.welcome_bonus_points),
        userId
      );
    }
    db.prepare(
      `INSERT INTO notifications (user_id, title_ar, title_fr, body_ar, body_fr, type)
       VALUES (?, ?, ?, ?, ?, 'offer')`
    ).run(
      pending.referrer_user_id,
      `مكافأة إحالة جديدة (+${pts} نقطة)`,
      `Nouveau bonus de parrainage (+${pts} points)`,
      `قام صديق مدعو بكودك (${pending.referral_code}) بتأكيد حسابه، وتمت إضافة ${pts} نقطة إلى رصيدك.`,
      `Un ami inscrit avec votre code (${pending.referral_code}) a vérifié son compte : +${pts} points ajoutés.`
    );
  });
  tx();
}

function parseUserAgentSummary(uaRaw: string) {
  const ua = uaRaw || '';
  const isTablet = /ipad|tablet|playbook|silk/i.test(ua);
  const isMobile = !isTablet && /mobile|iphone|ipod|android.*mobile|windows phone/i.test(ua);
  const deviceType = isTablet ? 'tablet' : isMobile ? 'mobile' : 'desktop';

  let browser = 'متصفح ويب';
  if (/edg\//i.test(ua)) browser = 'Microsoft Edge';
  else if (/opr\//i.test(ua) || /opera/i.test(ua)) browser = 'Opera';
  else if (/chrome|crios/i.test(ua)) browser = 'Google Chrome';
  else if (/firefox|fxios/i.test(ua)) browser = 'Mozilla Firefox';
  else if (/safari/i.test(ua)) browser = 'Safari';

  let os = 'نظام غير محدد';
  if (/windows nt/i.test(ua)) os = 'Windows';
  else if (/android/i.test(ua)) os = 'Android';
  else if (/iphone|ipad|ipod/i.test(ua)) os = 'iOS / iPadOS';
  else if (/mac os x/i.test(ua)) os = 'macOS';
  else if (/linux/i.test(ua)) os = 'Linux';

  return {
    deviceType,
    browser,
    os,
    deviceName: `${browser} · ${os}`,
  };
}

function getApproxLocation(req: express.Request): string {
  const country = String(req.headers['cf-ipcountry'] || req.headers['x-vercel-ip-country'] || '').trim().toUpperCase();
  if (country === 'MR') return 'موريتانيا';
  if (country && country !== 'XX') return `المنطقة: ${country}`;
  return 'نواكشوط / موريتانيا (تقديري)';
}

// =====================================================================
// HEALTH CHECK
// =====================================================================
app.get('/api/health', async (_req, res) => {
  const start = Date.now();
  let sqliteOk = false;
  try {
    db.prepare('SELECT 1 as ok').get();
    sqliteOk = true;
  } catch {
    sqliteOk = false;
  }
  const pgHealth = await checkDatabaseHealth();
  res.status(sqliteOk ? 200 : 503).json({
    status: sqliteOk ? 'ok' : 'degraded',
    service: 'tedribi-api',
    latencyMs: Date.now() - start,
    database: {
      sqlite: sqliteOk ? 'connected' : 'error',
      postgres: pgHealth,
    },
    storage: getStorageHealth(),
    cache: appCache.getStats(),
    queue: backgroundQueue.getStats(),
  });
});

// =====================================================================
// AUTH & ACCOUNT MANAGEMENT
// =====================================================================
const ALLOWED_USER_LEVELS = new Set([
  'foundation',
  'intermediate',
  'advanced',
  'prep_student',
  'highschool_student',
  'university_student',
  'teacher',
  'professor',
]);

app.get('/api/auth/admin-status', (_req, res) => {
  res.json({
    adminClaimed: true,
    envPasscodeConfigured: false,
  });
});

app.post('/api/auth/claim-admin', (_req, res) => {
  res.status(403).json({
    error: 'Admin initialization is locked to the official administrator account.',
  });
});

app.post('/api/auth/register', (req, res) => {
  const { name, email, password, track, preferred_lang, level, teacher_category, professor_specialty } =
    req.body ?? {};
  if (!name || typeof name !== 'string' || !email || typeof email !== 'string' || !password || typeof password !== 'string') {
    res.status(400).json({ code: 'MISSING_FIELDS', error: 'Name, email, and password are required.' });
    return;
  }
  if (password.length < 6) {
    res.status(400).json({ code: 'WEAK_PASSWORD', error: 'Password must be at least 6 characters.' });
    return;
  }
  const normalizedEmail = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    res.status(400).json({ code: 'INVALID_EMAIL', error: 'Invalid email format.' });
    return;
  }
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail);
  if (existing) {
    res.status(409).json({ code: 'EMAIL_EXISTS', error: 'An account with this email already exists.' });
    return;
  }

  const safeTrack = ['arabic', 'french', 'bilingual'].includes(track) ? track : 'bilingual';
  const safeLang = ['ar', 'fr', 'en'].includes(preferred_lang) ? preferred_lang : 'ar';
  const safeLevel = ALLOWED_USER_LEVELS.has(String(level)) ? String(level) : 'foundation';
  const safeTeacherCategory = ['bilingual', 'arabic', 'french'].includes(String(teacher_category || ''))
    ? String(teacher_category)
    : '';
  const safeProfessorSpecialty =
    safeLevel === 'professor' ? String(professor_specialty || '').trim().slice(0, 120) : '';
  const safeRole: 'teacher' | 'student' = safeLevel === 'teacher' ? 'teacher' : 'student';

  const hash = hashPassword(password);
  const generatedRefCode = generateUniqueReferralCode(db);
  const result = db
    .prepare(
      `INSERT INTO users (
        name, email, password_hash, role, track, preferred_lang, level,
        teacher_category, professor_specialty, referral_code, last_login_at, last_active_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
    )
    .run(
      name.trim(),
      normalizedEmail,
      hash,
      safeRole,
      safeTrack,
      safeLang,
      safeLevel,
      safeTeacherCategory,
      safeProfessorSpecialty,
      generatedRefCode
    );

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid) as any;
  const token = signSessionToken({ userId: user.id, email: user.email, role: user.role, tv: user.token_version ?? 1 });
  setSessionCookie(req, res, token);
  logAudit(user.id, user.email, 'REGISTER', 'user', user.id, `Track=${safeTrack};Level=${safeLevel}`);
  res.status(201).json({ user: sanitizeUser(user), token });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body ?? {};
  if (!email || typeof email !== 'string' || !password || typeof password !== 'string') {
    res.status(400).json({ error: 'Email and password are required.' });
    return;
  }
  const normalizedEmail = email.trim().toLowerCase();
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(normalizedEmail) as any;

  // Optional env ADMIN_PASSCODE override for admin login when configured
  const envAdminPass = process.env.ADMIN_PASSCODE?.trim();
  if (user && user.role === 'admin' && envAdminPass && password === envAdminPass) {
    db.prepare("UPDATE users SET last_login_at = datetime('now'), last_active_at = datetime('now') WHERE id = ?").run(
      user.id
    );
    const refreshed = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id) as any;
    const token = signSessionToken({ userId: user.id, email: user.email, role: user.role, tv: user.token_version ?? 1 });
    setSessionCookie(req, res, token);
    logAudit(user.id, user.email, 'LOGIN_ADMIN_PASSCODE', 'user', user.id);
    res.json({ user: sanitizeUser(refreshed), token });
    return;
  }

  if (!user || !verifyPassword(password, user.password_hash)) {
    res.status(401).json({ code: 'INVALID_CREDENTIALS', error: 'Invalid email or password.' });
    return;
  }

  db.prepare("UPDATE users SET last_login_at = datetime('now'), last_active_at = datetime('now') WHERE id = ?").run(
    user.id
  );
  const refreshed = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id) as any;
  const token = signSessionToken({ userId: user.id, email: user.email, role: user.role, tv: user.token_version ?? 1 });
  setSessionCookie(req, res, token);
  logAudit(user.id, user.email, 'LOGIN', 'user', user.id);
  res.json({ user: sanitizeUser(refreshed), token });
});

app.post('/api/auth/logout', (req: AuthenticatedRequest, res) => {
  const sid = String(req.headers['x-device-session-id'] || '').trim();
  if (req.authUser && sid) {
    db.prepare(
      "UPDATE user_sessions SET is_revoked = 1, revoked_at = datetime('now') WHERE user_id = ? AND session_id = ?"
    ).run(req.authUser.userId, sid);
  }
  clearSessionCookie(req, res);
  res.json({ ok: true });
});

app.post('/api/auth/logout-all', requireAuth, (req: AuthenticatedRequest, res) => {
  const userId = req.authUser!.userId;
  db.transaction(() => {
    db.prepare(
      "UPDATE user_sessions SET is_revoked = 1, revoked_at = datetime('now') WHERE user_id = ? AND is_revoked = 0"
    ).run(userId);
    db.prepare('UPDATE users SET token_version = COALESCE(token_version, 1) + 1 WHERE id = ?').run(userId);
  })();
  clearSessionCookie(req, res);
  logAudit(userId, req.authUser!.email, 'LOGOUT_ALL_DEVICES', 'user', userId);
  res.json({ ok: true });
});

app.get('/api/auth/me', (req: AuthenticatedRequest, res) => {
  if (!req.authUser) {
    res.json({ user: null });
    return;
  }
  const sessionState = validateDeviceSessionState(req.authUser.userId, req);
  if (sessionState.ok === false) {
    res.status(401).json({
      code: sessionState.code,
      error: sessionState.error,
    });
    return;
  }
  if (req.authUser.emailVerified) {
    db.prepare('UPDATE users SET email_verified = 1 WHERE id = ? AND email_verified = 0').run(req.authUser.userId);
    settlePendingReferralIfVerified(req.authUser.userId, true);
  }
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.authUser.userId) as any;
  res.json({ user: sanitizeUser(user) });
});

app.get('/api/auth/copy-permission', (req: AuthenticatedRequest, res) => {
  const email = (req.authUser?.email || '').trim().toLowerCase();
  const isOfficialAdmin =
    req.authUser?.role === 'admin' &&
    email === OFFICIAL_ADMIN_EMAIL &&
    (req.authUser.firebaseUid ? Boolean(req.authUser.emailVerified) : true);
  res.json({
    canCopy: isOfficialAdmin,
    disableRightClick: true,
    role: isOfficialAdmin ? 'admin' : req.authUser?.role || 'guest',
  });
});

app.patch('/api/auth/profile', requireAuth, (req: AuthenticatedRequest, res) => {
  const {
    name,
    track,
    preferred_lang,
    level,
    teacher_category,
    professor_specialty,
    phone,
    notification_sound_enabled,
    currentPassword,
    newPassword,
  } = req.body ?? {};
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.authUser!.userId) as any;
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const nextName = typeof name === 'string' && name.trim().length > 1 ? name.trim() : user.name;
  const nextTrack = ['arabic', 'french', 'bilingual'].includes(track) ? track : user.track;
  const nextLang = ['ar', 'fr', 'en'].includes(preferred_lang) ? preferred_lang : user.preferred_lang;
  const nextLevel = ALLOWED_USER_LEVELS.has(String(level)) ? String(level) : user.level;
  const nextTeacherCategory =
    teacher_category !== undefined
      ? ['bilingual', 'arabic', 'french'].includes(String(teacher_category))
        ? String(teacher_category)
        : ''
      : user.teacher_category || '';
  const nextProfessorSpecialty =
    professor_specialty !== undefined
      ? String(professor_specialty).trim().slice(0, 120)
      : user.professor_specialty || '';
  const nextPhone = typeof phone === 'string' ? phone.trim().slice(0, 40) : user.phone || '';
  const nextSoundEnabled =
    notification_sound_enabled !== undefined
      ? notification_sound_enabled
        ? 1
        : 0
      : user.notification_sound_enabled ?? 1;
  const nextRole =
    user.role === 'admin' || user.role === 'editor'
      ? user.role
      : nextLevel === 'teacher' || nextLevel === 'professor'
        ? 'teacher'
        : 'student';

  let nextHash = user.password_hash;
  let nextTokenVersion = user.token_version ?? 1;
  let passwordChanged = false;

  if (newPassword && typeof newPassword === 'string') {
    if (newPassword.length < 6) {
      res.status(400).json({ error: 'New password must be at least 6 characters.' });
      return;
    }
    if (!currentPassword || !verifyPassword(String(currentPassword), user.password_hash)) {
      res.status(400).json({ error: 'Current password is incorrect.' });
      return;
    }
    nextHash = hashPassword(newPassword);
    nextTokenVersion += 1;
    passwordChanged = true;
  }

  db.prepare(
    `UPDATE users SET
      name = ?,
      role = ?,
      track = ?,
      preferred_lang = ?,
      level = ?,
      teacher_category = ?,
      professor_specialty = ?,
      phone = ?,
      notification_sound_enabled = ?,
      password_hash = ?,
      token_version = ?,
      last_profile_updated_at = datetime('now'),
      last_password_updated_at = CASE WHEN ? = 1 THEN datetime('now') ELSE last_password_updated_at END
     WHERE id = ?`
  ).run(
    nextName,
    nextRole,
    nextTrack,
    nextLang,
    nextLevel,
    nextTeacherCategory,
    nextProfessorSpecialty,
    nextPhone,
    nextSoundEnabled,
    nextHash,
    nextTokenVersion,
    passwordChanged ? 1 : 0,
    user.id
  );

  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id) as any;
  let refreshedToken: string | undefined;
  if (passwordChanged) {
    refreshedToken = signSessionToken({
      userId: updated.id,
      email: updated.email,
      role: updated.role,
      tv: updated.token_version ?? 1,
    });
    setSessionCookie(req, res, refreshedToken);
  }
  logAudit(user.id, user.email, 'UPDATE_PROFILE', 'user', user.id);
  res.json({ user: sanitizeUser(updated), ...(refreshedToken ? { token: refreshedToken } : {}) });
});

app.patch('/api/auth/notification-preferences', requireAuth, (req: AuthenticatedRequest, res) => {
  const enabled = req.body?.soundEnabled !== false ? 1 : 0;
  db.prepare('UPDATE users SET notification_sound_enabled = ? WHERE id = ?').run(enabled, req.authUser!.userId);
  res.json({ ok: true, soundEnabled: Boolean(enabled) });
});

app.post('/api/auth/password-updated', requireAuth, (req: AuthenticatedRequest, res) => {
  const userId = req.authUser!.userId;
  const { revokeOthers } = req.body ?? {};
  const currentSid = String(req.headers['x-device-session-id'] || '').trim();
  db.prepare("UPDATE users SET last_password_updated_at = datetime('now') WHERE id = ?").run(userId);
  if (revokeOthers) {
    db.prepare(
      "UPDATE user_sessions SET is_revoked = 1, revoked_at = datetime('now') WHERE user_id = ? AND session_id != ?"
    ).run(userId, currentSid);
  }
  logAudit(userId, req.authUser!.email, 'PASSWORD_UPDATED_AUDIT', 'user', userId);
  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as any;
  res.json({ ok: true, user: sanitizeUser(updated) });
});

app.patch('/api/auth/permissions', requireAuth, (req: AuthenticatedRequest, res) => {
  const userId = req.authUser!.userId;
  const { geoStatus, lat, lng, label, notificationStatus } = req.body ?? {};
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as any;
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const nextGeoStatus = ['prompt', 'granted', 'denied'].includes(String(geoStatus || ''))
    ? String(geoStatus)
    : user.geo_permission_status || 'prompt';
  const nextNotifStatus = ['default', 'granted', 'denied'].includes(String(notificationStatus || ''))
    ? String(notificationStatus)
    : user.notification_permission_status || 'default';

  const validCoords =
    nextGeoStatus === 'granted' &&
    lat !== undefined &&
    lng !== undefined &&
    Number.isFinite(Number(lat)) &&
    Number.isFinite(Number(lng)) &&
    Math.abs(Number(lat)) <= 90 &&
    Math.abs(Number(lng)) <= 180;

  const nextLat = nextGeoStatus === 'denied' ? null : validCoords ? Number(Number(lat).toFixed(5)) : user.last_geo_lat;
  const nextLng = nextGeoStatus === 'denied' ? null : validCoords ? Number(Number(lng).toFixed(5)) : user.last_geo_lng;
  const nextLabel =
    nextGeoStatus === 'denied'
      ? ''
      : typeof label === 'string' && label.trim()
        ? label.trim().slice(0, 140)
        : validCoords
          ? `${Number(lat).toFixed(4)}, ${Number(lng).toFixed(4)}`
          : user.last_geo_label || '';

  db.prepare(
    `UPDATE users SET
       geo_permission_status = ?,
       last_geo_lat = ?,
       last_geo_lng = ?,
       last_geo_label = ?,
       last_geo_updated_at = CASE WHEN ? IN ('granted', 'denied') THEN datetime('now') ELSE last_geo_updated_at END,
       notification_permission_status = ?
     WHERE id = ?`
  ).run(nextGeoStatus, nextLat, nextLng, nextLabel, geoStatus ? String(geoStatus) : '', nextNotifStatus, userId);

  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as any;
  res.json({ ok: true, user: sanitizeUser(updated) });
});

app.post('/api/auth/sessions/heartbeat', requireAuth, (req: AuthenticatedRequest, res) => {
  const userId = req.authUser!.userId;
  const sidRaw = String(req.headers['x-device-session-id'] || req.body?.sessionId || '').trim().slice(0, 96);
  const sid = sidRaw || `dev-${crypto.createHash('sha256').update(String(req.headers['user-agent'] || userId)).digest('hex').slice(0, 16)}`;

  const existing = db
    .prepare('SELECT id, is_revoked FROM user_sessions WHERE user_id = ? AND session_id = ?')
    .get(userId, sid) as { id: number; is_revoked: number } | undefined;

  if (existing && Number(existing.is_revoked) === 1) {
    res.status(401).json({
      code: 'SESSION_REVOKED',
      error: 'تم تسجيل خروج هذا الجهاز من إعدادات الأمان.',
    });
    return;
  }

  const uaInfo = parseUserAgentSummary(String(req.headers['user-agent'] || ''));
  const approxLocation = getApproxLocation(req);
  const uaHash = crypto.createHash('sha256').update(String(req.headers['user-agent'] || '')).digest('hex').slice(0, 24);

  db.prepare(
    `INSERT INTO user_sessions (user_id, session_id, device_name, device_type, browser, os, approx_location, user_agent_hash, is_revoked, last_active_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, datetime('now'))
     ON CONFLICT(user_id, session_id) DO UPDATE SET
       device_name = excluded.device_name,
       device_type = excluded.device_type,
       browser = excluded.browser,
       os = excluded.os,
       approx_location = excluded.approx_location,
       last_active_at = datetime('now')`
  ).run(userId, sid, uaInfo.deviceName, uaInfo.deviceType, uaInfo.browser, uaInfo.os, approxLocation, uaHash);

  db.prepare("UPDATE users SET last_active_at = datetime('now') WHERE id = ?").run(userId);
  if (req.authUser?.emailVerified) {
    settlePendingReferralIfVerified(userId, true);
  }
  res.json({ ok: true, sessionId: sid });
});

app.get('/api/auth/sessions', requireAuth, (req: AuthenticatedRequest, res) => {
  const userId = req.authUser!.userId;
  const currentSid = String(req.headers['x-device-session-id'] || '').trim();
  const rows = db
    .prepare(
      `SELECT id, session_id, device_name, device_type, browser, os, approx_location, is_revoked, created_at, last_active_at
       FROM user_sessions
       WHERE user_id = ? AND is_revoked = 0
       ORDER BY datetime(last_active_at) DESC, id DESC
       LIMIT 25`
    )
    .all(userId) as any[];

  res.json({
    sessions: rows.map((r) => ({
      ...r,
      is_current: currentSid ? r.session_id === currentSid : false,
    })),
  });
});

app.delete('/api/auth/sessions/:sessionId', requireAuth, (req: AuthenticatedRequest, res) => {
  const userId = req.authUser!.userId;
  const targetSid = String(req.params.sessionId || '').trim();
  const currentSid = String(req.headers['x-device-session-id'] || '').trim();
  const info = db
    .prepare(
      "UPDATE user_sessions SET is_revoked = 1, revoked_at = datetime('now') WHERE user_id = ? AND session_id = ?"
    )
    .run(userId, targetSid);
  if (info.changes === 0) {
    res.status(404).json({ error: 'Device session not found' });
    return;
  }
  logAudit(userId, req.authUser!.email, 'REVOKE_DEVICE_SESSION', 'user_sessions', targetSid);
  res.json({ ok: true, revokedCurrent: Boolean(currentSid && targetSid === currentSid) });
});

app.post('/api/auth/sessions/revoke-others', requireAuth, (req: AuthenticatedRequest, res) => {
  const userId = req.authUser!.userId;
  const currentSid = String(req.headers['x-device-session-id'] || '').trim();
  if (!currentSid) {
    res.status(400).json({ error: 'Missing active device identifier' });
    return;
  }
  const info = db
    .prepare(
      "UPDATE user_sessions SET is_revoked = 1, revoked_at = datetime('now') WHERE user_id = ? AND session_id != ? AND is_revoked = 0"
    )
    .run(userId, currentSid);
  logAudit(userId, req.authUser!.email, 'REVOKE_ALL_OTHER_SESSIONS', 'user', userId, `revoked=${info.changes}`);
  res.json({ ok: true, revokedCount: info.changes });
});

function getClientIp(req: express.Request): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.trim().length > 0) {
    return fwd.split(',')[0].trim();
  }
  return req.ip || 'unknown';
}

function getSafeBaseUrl(_req: express.Request): string {
  const envUrl = process.env.APP_URL?.trim();
  if (
    envUrl &&
    /^https?:\/\//i.test(envUrl) &&
    !envUrl.includes('MY_APP_URL') &&
    !/aistudio|run\.app|ais-dev|ais-pre|localhost|127\.0\.0\.1/i.test(envUrl)
  ) {
    return envUrl.replace(/\/+$/, '');
  }
  return PUBLIC_APP_ORIGIN;
}

function checkRateLimitEntry(
  key: string,
  maxRequests: number,
  windowMs: number,
  cooldownMs = 0
): { allowed: boolean; code?: 'RESEND_COOLDOWN' | 'RATE_LIMITED'; retryAfter: number } {
  const now = Date.now();
  const row = db
    .prepare('SELECT count, window_start, last_attempt FROM auth_rate_limits WHERE key = ?')
    .get(key) as { count: number; window_start: number; last_attempt: number } | undefined;

  if (!row) {
    return { allowed: true, retryAfter: 0 };
  }
  if (cooldownMs > 0 && now - row.last_attempt < cooldownMs) {
    return {
      allowed: false,
      code: 'RESEND_COOLDOWN',
      retryAfter: Math.max(1, Math.ceil((row.last_attempt + cooldownMs - now) / 1000)),
    };
  }
  const withinWindow = now - row.window_start < windowMs;
  if (withinWindow && row.count >= maxRequests) {
    return {
      allowed: false,
      code: 'RATE_LIMITED',
      retryAfter: Math.max(1, Math.ceil((row.window_start + windowMs - now) / 1000)),
    };
  }
  return { allowed: true, retryAfter: 0 };
}

function recordRateLimitHit(key: string, windowMs: number): void {
  const now = Date.now();
  const row = db
    .prepare('SELECT count, window_start FROM auth_rate_limits WHERE key = ?')
    .get(key) as { count: number; window_start: number } | undefined;

  if (!row) {
    db.prepare('INSERT INTO auth_rate_limits (key, count, window_start, last_attempt) VALUES (?, 1, ?, ?)').run(
      key,
      now,
      now
    );
    return;
  }
  const withinWindow = now - row.window_start < windowMs;
  const nextCount = withinWindow ? row.count + 1 : 1;
  const nextWindowStart = withinWindow ? row.window_start : now;
  db.prepare('UPDATE auth_rate_limits SET count = ?, window_start = ?, last_attempt = ? WHERE key = ?').run(
    nextCount,
    nextWindowStart,
    now,
    key
  );
}

const handleForgotPassword: express.RequestHandler = async (req, res) => {
  const { email, method, lang } = req.body ?? {};
  if (!email || typeof email !== 'string') {
    res.status(400).json({ code: 'INVALID_EMAIL', error: 'Valid email is required.' });
    return;
  }
  const normalizedEmail = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    res.status(400).json({ code: 'INVALID_EMAIL', error: 'Valid email is required.' });
    return;
  }

  const safeMethod: 'link' | 'otp' = method === 'otp' ? 'otp' : 'link';
  const safeLang: 'ar' | 'fr' = lang === 'fr' ? 'fr' : 'ar';
  const clientIp = getClientIp(req);
  const windowMs = 15 * 60 * 1000;
  const cooldownMs = 30 * 1000;

  // Server-side 30s resend cooldown + per-email (5/15m) + per-IP (15/15m) rate limiting
  const emailKey = `fp_email:${normalizedEmail}`;
  const ipKey = `fp_ip:${clientIp}`;
  const emailCheck = checkRateLimitEntry(emailKey, 5, windowMs, cooldownMs);
  if (!emailCheck.allowed) {
    res.status(429).json({
      code: emailCheck.code,
      retryAfter: emailCheck.retryAfter,
      error:
        emailCheck.code === 'RESEND_COOLDOWN'
          ? 'Please wait 30 seconds before requesting another reset.'
          : 'Too many password reset requests. Please try again later.',
    });
    return;
  }
  const ipCheck = checkRateLimitEntry(ipKey, 15, windowMs, 0);
  if (!ipCheck.allowed) {
    res.status(429).json({
      code: ipCheck.code,
      retryAfter: ipCheck.retryAfter,
      error: 'Too many password reset requests from your network. Please try again later.',
    });
    return;
  }

  recordRateLimitHit(emailKey, windowMs);
  recordRateLimitHit(ipKey, windowMs);

  const user = db
    .prepare('SELECT id, name, email, preferred_lang FROM users WHERE email = ?')
    .get(normalizedEmail) as any;

  if (user) {
    const now = Date.now();
    // Invalidate previous active reset tokens/OTPs for this user
    db.prepare('UPDATE password_resets SET used_at = ? WHERE user_id = ? AND used_at IS NULL').run(now, user.id);

    if (safeMethod === 'otp') {
      const otpCode = crypto.randomInt(0, 1000000).toString().padStart(6, '0');
      const otpHash = hashResetSecret(`${user.id}:${otpCode}`);
      const expiresAt = now + 5 * 60 * 1000; // Strictly 5 minutes max TTL
      db.prepare(
        'INSERT INTO password_resets (user_id, method, token_hash, attempts, max_attempts, expires_at, created_at) VALUES (?, ?, ?, 0, 5, ?, ?)'
      ).run(user.id, 'otp', otpHash, expiresAt, now);

      await sendPasswordResetEmail({
        to: user.email,
        name: user.name,
        method: 'otp',
        lang: safeLang,
        otp: otpCode,
      });
    } else {
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = hashResetSecret(rawToken);
      const expiresAt = now + 5 * 60 * 1000; // Strictly 5 minutes max TTL
      db.prepare(
        'INSERT INTO password_resets (user_id, method, token_hash, attempts, max_attempts, expires_at, created_at) VALUES (?, ?, ?, 0, 1, ?, ?)'
      ).run(user.id, 'link', tokenHash, expiresAt, now);

      const resetUrl = `${getSafeBaseUrl(req)}/reset-password?token=${rawToken}`;
      await sendPasswordResetEmail({
        to: user.email,
        name: user.name,
        method: 'link',
        lang: safeLang,
        resetUrl,
      });
    }

    logAudit(user.id, user.email, 'PASSWORD_RESET_REQUEST', 'user', user.id, `method=${safeMethod}`);
  }

  // Uniform response regardless of whether account exists (prevents email enumeration)
  res.json({
    ok: true,
    method: safeMethod,
    cooldownSeconds: 30,
    message: 'If this email is registered, recovery instructions have been sent.',
  });
};

const handleVerifyOtp: express.RequestHandler = (req, res) => {
  const { email, otp } = req.body ?? {};
  if (!email || typeof email !== 'string' || !otp || typeof otp !== 'string') {
    res.status(400).json({ code: 'INVALID_OTP', error: 'Email and 6-digit verification code are required.' });
    return;
  }
  const normalizedEmail = email.trim().toLowerCase();
  const cleanOtp = otp.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) || !/^\d{6}$/.test(cleanOtp)) {
    res.status(400).json({ code: 'INVALID_OTP', error: 'Valid email and 6-digit OTP code are required.' });
    return;
  }

  const clientIp = getClientIp(req);
  const windowMs = 15 * 60 * 1000;
  const emailKey = `vo_email:${normalizedEmail}`;
  const ipKey = `vo_ip:${clientIp}`;

  const emailCheck = checkRateLimitEntry(emailKey, 12, windowMs);
  if (!emailCheck.allowed) {
    res.status(429).json({
      code: 'RATE_LIMITED',
      retryAfter: emailCheck.retryAfter,
      error: 'Too many verification attempts. Please try again later.',
    });
    return;
  }
  const ipCheck = checkRateLimitEntry(ipKey, 25, windowMs);
  if (!ipCheck.allowed) {
    res.status(429).json({
      code: 'RATE_LIMITED',
      retryAfter: ipCheck.retryAfter,
      error: 'Too many verification attempts. Please try again later.',
    });
    return;
  }
  recordRateLimitHit(emailKey, windowMs);
  recordRateLimitHit(ipKey, windowMs);

  const user = db.prepare('SELECT id, email FROM users WHERE email = ?').get(normalizedEmail) as any;
  if (!user) {
    res.status(400).json({ code: 'INVALID_OR_EXPIRED_OTP', error: 'Invalid or expired verification code.' });
    return;
  }

  const now = Date.now();
  const record = db
    .prepare(
      "SELECT * FROM password_resets WHERE user_id = ? AND method = 'otp' AND used_at IS NULL ORDER BY id DESC LIMIT 1"
    )
    .get(user.id) as any;

  if (!record || now > Number(record.expires_at)) {
    if (record && !record.used_at) {
      db.prepare('UPDATE password_resets SET used_at = ? WHERE id = ?').run(now, record.id);
    }
    res.status(400).json({ code: 'INVALID_OR_EXPIRED_OTP', error: 'Invalid or expired verification code.' });
    return;
  }

  if (Number(record.attempts) >= Number(record.max_attempts)) {
    db.prepare('UPDATE password_resets SET used_at = ? WHERE id = ?').run(now, record.id);
    res.status(400).json({
      code: 'OTP_MAX_ATTEMPTS',
      error: 'Maximum verification attempts exceeded. Please request a new code.',
    });
    return;
  }

  const candidateHash = hashResetSecret(`${user.id}:${cleanOtp}`);
  if (!safeHexEquals(candidateHash, record.token_hash)) {
    const nextAttempts = Number(record.attempts) + 1;
    const lockedOut = nextAttempts >= Number(record.max_attempts);
    db.prepare('UPDATE password_resets SET attempts = ?, used_at = ? WHERE id = ?').run(
      nextAttempts,
      lockedOut ? now : null,
      record.id
    );
    res.status(400).json({
      code: lockedOut ? 'OTP_MAX_ATTEMPTS' : 'INVALID_OTP',
      remainingAttempts: Math.max(0, Number(record.max_attempts) - nextAttempts),
      error: lockedOut
        ? 'Maximum verification attempts exceeded. Please request a new code.'
        : 'Invalid verification code.',
    });
    return;
  }

  const resetToken = crypto.randomBytes(32).toString('hex');
  const resetTokenHash = hashResetSecret(resetToken);
  const resetExpires = now + 5 * 60 * 1000; // Strictly 5 minutes max TTL

  const consumeAndIssue = db.transaction(() => {
    const upd = db
      .prepare('UPDATE password_resets SET used_at = ? WHERE id = ? AND used_at IS NULL')
      .run(now, record.id);
    if (upd.changes === 0) {
      return false;
    }
    db.prepare(
      'INSERT INTO password_resets (user_id, method, token_hash, attempts, max_attempts, expires_at, created_at) VALUES (?, ?, ?, 0, 1, ?, ?)'
    ).run(user.id, 'verified_otp', resetTokenHash, resetExpires, now);
    return true;
  });

  if (!consumeAndIssue()) {
    res.status(400).json({ code: 'INVALID_OR_EXPIRED_OTP', error: 'Verification code already used.' });
    return;
  }

  logAudit(user.id, user.email, 'OTP_VERIFIED', 'user', user.id);
  res.json({ ok: true, reset_token: resetToken });
};

const handleResetPassword: express.RequestHandler = async (req, res) => {
  const { token, password, newPassword } = req.body ?? {};
  const nextPassword = typeof password === 'string' ? password : typeof newPassword === 'string' ? newPassword : '';
  if (!token || typeof token !== 'string' || token.trim().length < 16 || nextPassword.length < 8) {
    res.status(400).json({
      code: nextPassword.length < 8 ? 'WEAK_PASSWORD' : 'INVALID_OR_EXPIRED_TOKEN',
      error:
        nextPassword.length < 8
          ? 'كلمة المرور الجديدة يجب أن تتكون من 8 أحرف على الأقل.'
          : 'رابط استعادة كلمة المرور غير صالح أو منتهي الصلاحية.',
    });
    return;
  }

  const clientIp = getClientIp(req);
  const windowMs = 15 * 60 * 1000;
  const ipKey = `rp_ip:${clientIp}`;
  const ipCheck = checkRateLimitEntry(ipKey, 15, windowMs);
  if (!ipCheck.allowed) {
    res.status(429).json({
      code: 'RATE_LIMITED',
      retryAfter: ipCheck.retryAfter,
      error: 'Too many password reset attempts. Please try again later.',
    });
    return;
  }
  recordRateLimitHit(ipKey, windowMs);

  const now = Date.now();
  const tokenHash = hashResetSecret(token.trim());
  const record = db
    .prepare(
      "SELECT * FROM password_resets WHERE token_hash = ? AND method IN ('link', 'verified_otp') ORDER BY id DESC LIMIT 1"
    )
    .get(tokenHash) as any;

  if (!record) {
    res.status(400).json({
      code: 'INVALID_TOKEN',
      error: 'رابط استعادة كلمة المرور غير صالح. يرجى طلب رابط جديد.',
    });
    return;
  }

  if (record.used_at) {
    res.status(410).json({
      code: 'TOKEN_ALREADY_USED',
      error: 'تم استخدام رابط استعادة كلمة المرور مسبقاً. يرجى طلب رابط جديد.',
    });
    return;
  }

  if (now > Number(record.expires_at)) {
    db.prepare('UPDATE password_resets SET used_at = ? WHERE id = ? AND used_at IS NULL').run(now, record.id);
    res.status(410).json({
      code: 'TOKEN_EXPIRED',
      error: 'انتهت صلاحية رابط استعادة كلمة المرور (الحد الأقصى 5 دقائق). يرجى طلب رابط جديد.',
    });
    return;
  }

  const user = db.prepare('SELECT id, email FROM users WHERE id = ?').get(record.user_id) as any;
  if (!user) {
    res.status(400).json({ code: 'INVALID_OR_EXPIRED_TOKEN', error: 'Invalid or expired reset token.' });
    return;
  }

  const hash = hashPassword(nextPassword);
  const tx = db.transaction(() => {
    const consume = db
      .prepare('UPDATE password_resets SET used_at = ? WHERE id = ? AND used_at IS NULL')
      .run(now, record.id);
    if (consume.changes === 0) {
      return false;
    }
    db.prepare('UPDATE password_resets SET used_at = ? WHERE user_id = ? AND used_at IS NULL').run(now, user.id);
    db.prepare(
      "UPDATE users SET password_hash = ?, reset_token = NULL, reset_expires = NULL, token_version = COALESCE(token_version, 1) + 1, last_password_updated_at = datetime('now') WHERE id = ?"
    ).run(hash, user.id);
    return true;
  });

  if (!tx()) {
    res.status(410).json({
      code: 'TOKEN_ALREADY_USED',
      error: 'تم استخدام رابط استعادة كلمة المرور مسبقاً.',
    });
    return;
  }

  // Synchronize Firebase Auth password if Firebase Admin credentials are available
  await updateFirebaseUserPasswordByEmail(user.email, nextPassword);

  clearSessionCookie(req, res);
  logAudit(user.id, user.email, 'PASSWORD_RESET_COMPLETE', 'user', user.id);
  res.json({ ok: true });
};

app.get('/api/auth/reset-token-status', (req, res) => {
  const rawToken = String(req.query.token || '').trim();
  const actionToken = String(req.query.at || req.query.actionToken || '').trim();
  const now = Date.now();

  if (rawToken) {
    const tokenHash = hashResetSecret(rawToken);
    const record = db
      .prepare(
        "SELECT id, expires_at, used_at FROM password_resets WHERE token_hash = ? AND method IN ('link', 'verified_otp') ORDER BY id DESC LIMIT 1"
      )
      .get(tokenHash) as any;

    if (!record) {
      res.status(400).json({
        valid: false,
        code: 'INVALID_TOKEN',
        error: 'رابط استعادة كلمة المرور غير صالح أو غير موجود.',
      });
      return;
    }
    if (record.used_at) {
      res.status(410).json({
        valid: false,
        code: 'TOKEN_ALREADY_USED',
        error: 'تم استخدام رابط استعادة كلمة المرور مسبقاً. يرجى طلب رابط جديد.',
      });
      return;
    }
    if (now > Number(record.expires_at)) {
      db.prepare('UPDATE password_resets SET used_at = ? WHERE id = ? AND used_at IS NULL').run(now, record.id);
      res.status(410).json({
        valid: false,
        code: 'TOKEN_EXPIRED',
        error: 'انتهت صلاحية رابط استعادة كلمة المرور (5 دقائق). يرجى طلب رابط جديد.',
      });
      return;
    }
    res.json({
      valid: true,
      kind: 'server_token',
      expiresAt: Number(record.expires_at),
      remainingSeconds: Math.max(1, Math.ceil((Number(record.expires_at) - now) / 1000)),
    });
    return;
  }

  if (actionToken) {
    const tokenHash = hashResetSecret(`password_reset:${actionToken}`);
    const record = db
      .prepare("SELECT id, email, expires_at, used_at FROM auth_action_tokens WHERE token_hash = ? AND purpose = 'password_reset' LIMIT 1")
      .get(tokenHash) as any;
    if (!record) {
      res.status(400).json({
        valid: false,
        code: 'INVALID_TOKEN',
        error: 'رابط استعادة كلمة المرور غير صالح أو غير موجود.',
      });
      return;
    }
    if (record.used_at) {
      res.status(410).json({
        valid: false,
        code: 'TOKEN_ALREADY_USED',
        error: 'تم استخدام رابط استعادة كلمة المرور مسبقاً. يرجى طلب رابط جديد.',
      });
      return;
    }
    if (now > Number(record.expires_at)) {
      db.prepare('UPDATE auth_action_tokens SET used_at = ? WHERE id = ? AND used_at IS NULL').run(now, record.id);
      res.status(410).json({
        valid: false,
        code: 'TOKEN_EXPIRED',
        error: 'انتهت صلاحية رابط استعادة كلمة المرور (الحد الأقصى 5 دقائق). يرجى طلب رابط جديد.',
      });
      return;
    }
    res.json({
      valid: true,
      kind: 'action_token',
      email: record.email,
      expiresAt: Number(record.expires_at),
      remainingSeconds: Math.max(1, Math.ceil((Number(record.expires_at) - now) / 1000)),
    });
    return;
  }

  res.status(400).json({
    valid: false,
    code: 'INVALID_TOKEN',
    error: 'رمز الاستعادة مفقود.',
  });
});

app.post('/api/auth/forgot-password', handleForgotPassword);
app.post('/auth/forgot-password', handleForgotPassword);

app.post('/api/auth/verify-otp', handleVerifyOtp);
app.post('/auth/verify-otp', handleVerifyOtp);

app.post('/api/auth/reset-password', handleResetPassword);
app.post('/auth/reset-password', handleResetPassword);

// Server-enforced 5-minute single-use action tokens for verification & reset links
app.post('/api/auth/action-tokens/issue', (req: AuthenticatedRequest, res) => {
  const { purpose, email } = req.body ?? {};
  const cleanPurpose = purpose === 'password_reset' ? 'password_reset' : 'email_verify';
  const cleanEmail = String(email || req.authUser?.email || '').trim().toLowerCase();
  if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    res.status(400).json({ error: 'Valid email is required.' });
    return;
  }
  const now = Date.now();
  const ttlMs = 5 * 60 * 1000; // Strictly 5 minutes
  const rawToken = crypto.randomBytes(24).toString('hex');
  const tokenHash = hashResetSecret(`${cleanPurpose}:${rawToken}`);
  const userId = req.authUser?.userId || null;

  db.prepare(
    'UPDATE auth_action_tokens SET used_at = ? WHERE email = ? AND purpose = ? AND used_at IS NULL'
  ).run(now, cleanEmail, cleanPurpose);

  db.prepare(
    'INSERT INTO auth_action_tokens (user_id, email, purpose, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(userId, cleanEmail, cleanPurpose, tokenHash, now + ttlMs, now);

  res.status(201).json({
    ok: true,
    actionToken: rawToken,
    expiresInSeconds: 300,
    expiresAt: now + ttlMs,
  });
});

app.post('/api/auth/action-tokens/consume', (req, res) => {
  const { purpose, token } = req.body ?? {};
  const cleanPurpose = purpose === 'password_reset' ? 'password_reset' : 'email_verify';
  const rawToken = String(token || '').trim();
  if (!rawToken) {
    res.status(400).json({ code: 'INVALID_TOKEN', error: 'الرابط غير صالح.' });
    return;
  }
  const tokenHash = hashResetSecret(`${cleanPurpose}:${rawToken}`);
  const record = db
    .prepare('SELECT * FROM auth_action_tokens WHERE token_hash = ? AND purpose = ? LIMIT 1')
    .get(tokenHash, cleanPurpose) as any;

  if (!record) {
    res.status(400).json({ code: 'INVALID_TOKEN', error: 'الرابط غير صالح أو غير موجود.' });
    return;
  }
  if (record.used_at) {
    res.status(410).json({ code: 'TOKEN_ALREADY_USED', error: 'تم استخدام هذا الرابط مسبقاً. يرجى طلب رابط جديد.' });
    return;
  }
  const now = Date.now();
  if (now > Number(record.expires_at)) {
    db.prepare('UPDATE auth_action_tokens SET used_at = ? WHERE id = ?').run(now, record.id);
    res.status(410).json({
      code: 'TOKEN_EXPIRED',
      error: 'انتهت صلاحية هذا الرابط (الحد الأقصى 5 دقائق). يرجى طلب رابط جديد.',
    });
    return;
  }

  db.prepare('UPDATE auth_action_tokens SET used_at = ? WHERE id = ? AND used_at IS NULL').run(now, record.id);
  res.json({ ok: true, email: record.email, purpose: cleanPurpose });
});

// =====================================================================
// EMAIL VERIFICATION VIA 6-DIGIT REAL EMAIL OTP (SEPARATE CHOICE FROM LINK)
// =====================================================================
app.post('/api/auth/email-otp/send', async (req: AuthenticatedRequest, res) => {
  const targetEmail = String(req.body?.email || req.authUser?.email || '').trim().toLowerCase();
  const safeLang: 'ar' | 'fr' | 'en' = req.body?.lang === 'fr' ? 'fr' : req.body?.lang === 'en' ? 'en' : 'ar';

  if (!targetEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(targetEmail)) {
    res.status(400).json({ error: 'يرجى إدخال بريد إلكتروني صحيح.' });
    return;
  }

  const clientIp = getClientIp(req);
  const windowMs = 15 * 60 * 1000;
  const emailKey = `ev_otp_email:${targetEmail}`;
  const ipKey = `ev_otp_ip:${clientIp}`;
  const emailCheck = checkRateLimitEntry(emailKey, 5, windowMs, 30 * 1000);
  if (!emailCheck.allowed) {
    res.status(429).json({
      code: emailCheck.code,
      retryAfter: emailCheck.retryAfter,
      error:
        emailCheck.code === 'RESEND_COOLDOWN'
          ? `يرجى الانتظار ${emailCheck.retryAfter} ثانية قبل طلب رمز جديد.`
          : 'تم تجاوز الحد الأقصى لطلبات رمز التحقق. يرجى المحاولة لاحقاً.',
    });
    return;
  }
  const ipCheck = checkRateLimitEntry(ipKey, 15, windowMs);
  if (!ipCheck.allowed) {
    res.status(429).json({ error: 'محاولات متكررة من شبكتك. يرجى الانتظار قليلاً.' });
    return;
  }
  recordRateLimitHit(emailKey, windowMs);
  recordRateLimitHit(ipKey, windowMs);

  const user = db.prepare('SELECT id, name, email FROM users WHERE lower(email) = ? LIMIT 1').get(targetEmail) as any;
  const now = Date.now();
  const expiresAt = now + 10 * 60 * 1000; // Strictly 10 minutes
  const otpCode = crypto.randomInt(0, 1000000).toString().padStart(6, '0');
  const codeHash = hashResetSecret(`email_verify:${targetEmail}:${otpCode}`);

  db.prepare(
    "UPDATE email_verification_codes SET used_at = ? WHERE lower(email) = ? AND purpose = 'email_verify' AND used_at IS NULL"
  ).run(now, targetEmail);
  db.prepare(
    `INSERT INTO email_verification_codes (user_id, email, purpose, code_hash, attempts, max_attempts, expires_at, created_at)
     VALUES (?, ?, 'email_verify', ?, 0, 5, ?, ?)`
  ).run(user?.id || req.authUser?.userId || null, targetEmail, codeHash, expiresAt, now);

  const delivery = await sendEmailVerificationEmail({
    to: targetEmail,
    name: user?.name || targetEmail.split('@')[0],
    method: 'otp',
    lang: safeLang,
    otp: otpCode,
  });

  if (!delivery.delivered) {
    res.status(503).json({
      code: 'MAILER_NOT_CONFIGURED',
      error:
        'تعذر إرسال رمز التحقق عبر البريد الإلكتروني لأن خدمة SMTP/Resend غير مضبوطة على الخادم حالياً. يمكنك استخدام رابط التفعيل أو ضبط إعدادات البريد.',
    });
    return;
  }

  res.json({
    ok: true,
    cooldownSeconds: 30,
    expiresInSeconds: 600,
    message: 'تم إرسال رمز التحقق المكون من 6 أرقام إلى بريدك الإلكتروني.',
  });
});

app.post('/api/auth/email-otp/verify', async (req: AuthenticatedRequest, res) => {
  const targetEmail = String(req.body?.email || req.authUser?.email || '').trim().toLowerCase();
  const cleanOtp = String(req.body?.otp || '').replace(/\D/g, '').trim();

  if (!targetEmail || !/^\d{6}$/.test(cleanOtp)) {
    res.status(400).json({ error: 'يرجى إدخال رمز التحقق المكون من 6 أرقام كاملاً.' });
    return;
  }

  const now = Date.now();
  const record = db
    .prepare(
      `SELECT * FROM email_verification_codes
       WHERE lower(email) = ? AND purpose = 'email_verify' AND used_at IS NULL
       ORDER BY id DESC LIMIT 1`
    )
    .get(targetEmail) as any;

  if (!record || now > Number(record.expires_at)) {
    if (record && !record.used_at) {
      db.prepare('UPDATE email_verification_codes SET used_at = ? WHERE id = ?').run(now, record.id);
    }
    res.status(400).json({ code: 'INVALID_OR_EXPIRED_OTP', error: 'رمز التحقق غير صالح أو منتهي الصلاحية.' });
    return;
  }

  if (Number(record.attempts) >= Number(record.max_attempts)) {
    db.prepare('UPDATE email_verification_codes SET used_at = ? WHERE id = ?').run(now, record.id);
    res.status(400).json({ code: 'OTP_MAX_ATTEMPTS', error: 'تم تجاوز عدد المحاولات المسموح. يرجى طلب رمز جديد.' });
    return;
  }

  const candidateHash = hashResetSecret(`email_verify:${targetEmail}:${cleanOtp}`);
  if (!safeHexEquals(candidateHash, record.code_hash)) {
    const nextAttempts = Number(record.attempts) + 1;
    const lockedOut = nextAttempts >= Number(record.max_attempts);
    db.prepare('UPDATE email_verification_codes SET attempts = ?, used_at = ? WHERE id = ?').run(
      nextAttempts,
      lockedOut ? now : null,
      record.id
    );
    res.status(400).json({
      code: lockedOut ? 'OTP_MAX_ATTEMPTS' : 'INVALID_OTP',
      remainingAttempts: Math.max(0, Number(record.max_attempts) - nextAttempts),
      error: lockedOut ? 'تم قفل الرمز بعد 5 محاولات خاطئة. يرجى طلب رمز جديد.' : 'رمز التحقق غير صحيح.',
    });
    return;
  }

  let verifiedUserId: number | null = record.user_id || req.authUser?.userId || null;
  const userRow = db.prepare('SELECT id FROM users WHERE lower(email) = ? LIMIT 1').get(targetEmail) as
    | { id: number }
    | undefined;
  if (userRow) verifiedUserId = userRow.id;

  db.transaction(() => {
    db.prepare('UPDATE email_verification_codes SET used_at = ? WHERE id = ? AND used_at IS NULL').run(now, record.id);
    if (verifiedUserId) {
      db.prepare('UPDATE users SET email_verified = 1 WHERE id = ?').run(verifiedUserId);
    }
  })();

  await markFirebaseEmailVerifiedByEmail(targetEmail);
  if (verifiedUserId) {
    settlePendingReferralIfVerified(verifiedUserId, true);
    logAudit(verifiedUserId, targetEmail, 'EMAIL_OTP_VERIFIED', 'user', verifiedUserId);
  }

  const refreshedUser = verifiedUserId ? db.prepare('SELECT * FROM users WHERE id = ?').get(verifiedUserId) : null;
  res.json({
    ok: true,
    emailVerified: true,
    user: refreshedUser ? sanitizeUser(refreshedUser) : null,
  });
});

// =====================================================================
// CATALOG: TRACKS, SUBJECTS, LESSONS, SUMMARIES, BANK READINESS
// =====================================================================
app.get('/api/catalog', (req: AuthenticatedRequest, res) => {
  const tracks = db.prepare('SELECT * FROM tracks WHERE active = 1 ORDER BY id ASC').all();
  const subjectsRaw = db.prepare('SELECT * FROM subjects ORDER BY display_order ASC').all() as any[];
  const subjects = subjectsRaw.map((s) => ({
    ...s,
    tracks: parseJson<string[]>(s.tracks_json, []),
  }));

  const lessonsRaw = db.prepare('SELECT * FROM lessons ORDER BY lesson_order ASC, id ASC').all() as any[];
  const progressMap = new Map<number, { completed: boolean; is_favorite: boolean }>();
  if (req.authUser) {
    const rows = db
      .prepare('SELECT lesson_id, completed, is_favorite FROM user_lesson_progress WHERE user_id = ?')
      .all(req.authUser.userId) as any[];
    for (const r of rows) {
      progressMap.set(r.lesson_id, { completed: Boolean(r.completed), is_favorite: Boolean(r.is_favorite) });
    }
  }

  const subjectFirstSeen = new Set<string>();
  const lessons = lessonsRaw.map((l, idx) => {
    const p = progressMap.get(l.id);
    const isStarterFree =
      !subjectFirstSeen.has(l.subject_slug) ||
      l.subject_slug === 'bac-sn-cell-genetics' ||
      l.subject_slug === 'bac-lm-philosophy-lit';
    subjectFirstSeen.add(l.subject_slug);
    return {
      id: l.id,
      subject_slug: l.subject_slug,
      track: l.track,
      level: l.level,
      title_ar: stripArabicDiacritics(l.title_ar),
      title_fr: l.title_fr,
      summary_ar: stripArabicDiacritics(l.summary_ar),
      summary_fr: l.summary_fr,
      explanation_ar: stripArabicDiacritics(l.explanation_ar),
      explanation_speech_ar: l.explanation_speech_ar,
      explanation_fr: l.explanation_fr,
      examples: parseJson<any[]>(l.examples_json, []).map((ex) => ({
        ...ex,
        title_ar: stripArabicDiacritics(ex.title_ar || ''),
        content_ar: stripArabicDiacritics(ex.content_ar || ''),
      })),
      exercises: parseJson<any[]>(l.exercises_json, []).map((ex) => ({
        ...ex,
        prompt_ar: stripArabicDiacritics(ex.prompt_ar || ''),
        solution_ar: stripArabicDiacritics(ex.solution_ar || ''),
      })),
      mcq: parseJson<any[]>(l.mcq_json, []).map((m) => ({
        ...m,
        stem_ar: stripArabicDiacritics(m.stem_ar || ''),
        options_ar: Array.isArray(m.options_ar) ? m.options_ar.map((o: string) => stripArabicDiacritics(o)) : [],
        explanation_ar: stripArabicDiacritics(m.explanation_ar || ''),
      })),
      lesson_order: l.lesson_order || idx + 1,
      is_free: isStarterFree,
      is_starter_free: isStarterFree,
      completed: p?.completed || false,
      is_favorite: p?.is_favorite || false,
      created_at: l.created_at,
    };
  });

  const summariesRaw = db.prepare('SELECT * FROM summaries ORDER BY id ASC').all() as any[];
  const summaries = summariesRaw.map((sm) => ({
    id: sm.id,
    subject_slug: sm.subject_slug,
    track: sm.track,
    level: sm.level,
    title_ar: stripArabicDiacritics(sm.title_ar),
    title_fr: sm.title_fr,
    content_ar: stripArabicDiacritics(sm.content_ar),
    content_speech_ar: sm.content_speech_ar,
    content_fr: sm.content_fr,
    key_points: parseJson<any[]>(sm.key_points_json, []).map((kp) => ({
      ...kp,
      ar: stripArabicDiacritics(kp.ar || ''),
    })),
    file_url: sm.file_url,
    created_at: sm.created_at,
  }));

  // Honest Question Bank Readiness Stats cached for scalability across thousands of questions
  let bankStats = appCache.get<any>('catalog:bankStats');
  if (!bankStats) {
    const totalVerified = (
      db
        .prepare("SELECT COUNT(*) as c FROM questions WHERE verified = 1 AND content_status = 'published'")
        .get() as { c: number }
    ).c;
    const bySubject = db
      .prepare(
        "SELECT subject_slug, COUNT(*) as count FROM questions WHERE verified = 1 AND content_status = 'published' GROUP BY subject_slug"
      )
      .all() as Array<{ subject_slug: string; count: number }>;
    const byTrack = db
      .prepare(
        "SELECT track, COUNT(*) as count FROM questions WHERE verified = 1 AND content_status = 'published' GROUP BY track"
      )
      .all() as Array<{ track: string; count: number }>;
    bankStats = {
      totalVerifiedQuestions: totalVerified,
      officialThreshold: 70,
      isComprehensiveOfficialReady: totalVerified >= 70,
      bySubject,
      byTrack,
    };
    appCache.set('catalog:bankStats', bankStats, 60_000);
  }

  res.json({
    tracks,
    subjects,
    lessons,
    summaries,
    bankStats,
    gradingPolicy: getGradingPolicy(),
    siteConfig: getSiteConfig(),
  });
});

// High-scale paginated Lessons API (metadata + summaries only; full content lazy-loaded via GET /api/lessons/:id)
app.get('/api/lessons', (req: AuthenticatedRequest, res) => {
  const { subject, track, level, search, favoritesOnly, page: rawPage, limit: rawLimit } = req.query;
  const page = Math.max(1, Number(rawPage) || 1);
  const limit = Math.min(50, Math.max(6, Number(rawLimit) || 18));
  const offset = (page - 1) * limit;

  const clauses: string[] = [];
  const params: any[] = [];
  if (subject && subject !== 'all') {
    clauses.push('l.subject_slug = ?');
    params.push(String(subject));
  }
  if (track && track !== 'all') {
    clauses.push("(l.track = ? OR l.track = 'all')");
    params.push(String(track));
  }
  if (level && level !== 'all') {
    clauses.push('l.level = ?');
    params.push(String(level));
  }
  if (search && String(search).trim()) {
    const q = `%${String(search).trim()}%`;
    clauses.push('(l.title_ar LIKE ? OR l.title_fr LIKE ? OR l.summary_ar LIKE ? OR l.summary_fr LIKE ?)');
    params.push(q, q, q, q);
  }
  if ((favoritesOnly === 'true' || favoritesOnly === '1') && req.authUser) {
    clauses.push('EXISTS (SELECT 1 FROM user_lesson_progress ulp WHERE ulp.lesson_id = l.id AND ulp.user_id = ? AND ulp.is_favorite = 1)');
    params.push(req.authUser.userId);
  }

  const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  const total = (db.prepare(`SELECT COUNT(*) as c FROM lessons l ${whereSql}`).get(...params) as { c: number }).c;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const safePage = Math.min(page, totalPages);

  const rows = db
    .prepare(
      `SELECT l.id, l.subject_slug, l.track, l.level, l.title_ar, l.title_fr,
              l.summary_ar, l.summary_fr, l.lesson_order, l.created_at
       FROM lessons l ${whereSql}
       ORDER BY l.lesson_order ASC, l.id ASC
       LIMIT ? OFFSET ?`
    )
    .all(...params, limit, (safePage - 1) * limit) as any[];

  const progressMap = new Map<number, { completed: boolean; is_favorite: boolean }>();
  if (req.authUser && rows.length > 0) {
    const ids = rows.map((r) => r.id);
    const placeholders = ids.map(() => '?').join(',');
    const pRows = db
      .prepare(`SELECT lesson_id, completed, is_favorite FROM user_lesson_progress WHERE user_id = ? AND lesson_id IN (${placeholders})`)
      .all(req.authUser.userId, ...ids) as any[];
    for (const r of pRows) {
      progressMap.set(r.lesson_id, { completed: Boolean(r.completed), is_favorite: Boolean(r.is_favorite) });
    }
  }

  const firstPerSubject = new Map<string, number>();
  const starterRows = db
    .prepare('SELECT subject_slug, MIN(id) as first_id FROM lessons GROUP BY subject_slug')
    .all() as Array<{ subject_slug: string; first_id: number }>;
  starterRows.forEach((r) => firstPerSubject.set(r.subject_slug, r.first_id));

  res.json({
    lessons: rows.map((l) => {
      const p = progressMap.get(l.id);
      const isStarterFree =
        firstPerSubject.get(l.subject_slug) === l.id ||
        l.subject_slug === 'bac-sn-cell-genetics' ||
        l.subject_slug === 'bac-lm-philosophy-lit';
      return {
        id: l.id,
        subject_slug: l.subject_slug,
        track: l.track,
        level: l.level,
        title_ar: stripArabicDiacritics(l.title_ar),
        title_fr: l.title_fr,
        summary_ar: stripArabicDiacritics(l.summary_ar),
        summary_fr: l.summary_fr,
        lesson_order: l.lesson_order,
        is_free: isStarterFree,
        is_starter_free: isStarterFree,
        completed: p?.completed || false,
        is_favorite: p?.is_favorite || false,
        created_at: l.created_at,
      };
    }),
    total,
    page: safePage,
    limit,
    totalPages,
    hasMore: safePage < totalPages,
  });
});

app.get('/api/lessons/:id', (req: AuthenticatedRequest, res) => {
  const id = Number(req.params.id);
  const l = db.prepare('SELECT * FROM lessons WHERE id = ?').get(id) as any;
  if (!l) {
    res.status(404).json({ error: 'Lesson not found' });
    return;
  }
  const firstInSubject = db
    .prepare('SELECT id FROM lessons WHERE subject_slug = ? ORDER BY lesson_order ASC, id ASC LIMIT 1')
    .get(l.subject_slug) as { id: number } | undefined;
  const isStarterFree =
    firstInSubject?.id === l.id ||
    l.subject_slug === 'bac-sn-cell-genetics' ||
    l.subject_slug === 'bac-lm-philosophy-lit';
  let p: { completed?: number; is_favorite?: number } | undefined;
  if (req.authUser) {
    p = db
      .prepare('SELECT completed, is_favorite FROM user_lesson_progress WHERE user_id = ? AND lesson_id = ?')
      .get(req.authUser.userId, l.id) as any;
  }
  res.json({
    lesson: {
      id: l.id,
      subject_slug: l.subject_slug,
      track: l.track,
      level: l.level,
      title_ar: stripArabicDiacritics(l.title_ar),
      title_fr: l.title_fr,
      summary_ar: stripArabicDiacritics(l.summary_ar),
      summary_fr: l.summary_fr,
      explanation_ar: stripArabicDiacritics(l.explanation_ar),
      explanation_speech_ar: l.explanation_speech_ar,
      explanation_fr: l.explanation_fr,
      examples: parseJson<any[]>(l.examples_json, []).map((ex) => ({
        ...ex,
        title_ar: stripArabicDiacritics(ex.title_ar || ''),
        content_ar: stripArabicDiacritics(ex.content_ar || ''),
      })),
      exercises: parseJson<any[]>(l.exercises_json, []).map((ex) => ({
        ...ex,
        prompt_ar: stripArabicDiacritics(ex.prompt_ar || ''),
        solution_ar: stripArabicDiacritics(ex.solution_ar || ''),
      })),
      mcq: parseJson<any[]>(l.mcq_json, []).map((m) => ({
        ...m,
        stem_ar: stripArabicDiacritics(m.stem_ar || ''),
        options_ar: Array.isArray(m.options_ar) ? m.options_ar.map((o: string) => stripArabicDiacritics(o)) : [],
        explanation_ar: stripArabicDiacritics(m.explanation_ar || ''),
      })),
      lesson_order: l.lesson_order || 1,
      is_free: isStarterFree,
      is_starter_free: isStarterFree,
      completed: Boolean(p?.completed),
      is_favorite: Boolean(p?.is_favorite),
      created_at: l.created_at,
    },
  });
});

app.get('/api/site-config', (_req, res) => {
  res.json(getSiteConfig());
});

app.post('/api/lessons/:id/progress', requireAuth, (req: AuthenticatedRequest, res) => {
  const lessonId = Number(req.params.id);
  const { completed, is_favorite } = req.body ?? {};
  const lesson = db.prepare('SELECT id FROM lessons WHERE id = ?').get(lessonId);
  if (!lesson) {
    res.status(404).json({ error: 'Lesson not found' });
    return;
  }

  const existing = db
    .prepare('SELECT completed, is_favorite FROM user_lesson_progress WHERE user_id = ? AND lesson_id = ?')
    .get(req.authUser!.userId, lessonId) as { completed: number; is_favorite: number } | undefined;

  const nextCompleted = typeof completed === 'boolean' ? (completed ? 1 : 0) : existing?.completed ?? 0;
  const nextFav = typeof is_favorite === 'boolean' ? (is_favorite ? 1 : 0) : existing?.is_favorite ?? 0;

  db.prepare(`
    INSERT INTO user_lesson_progress (user_id, lesson_id, completed, is_favorite, last_accessed)
    VALUES (?, ?, ?, ?, datetime('now'))
    ON CONFLICT(user_id, lesson_id) DO UPDATE SET
      completed = excluded.completed,
      is_favorite = excluded.is_favorite,
      last_accessed = datetime('now')
  `).run(req.authUser!.userId, lessonId, nextCompleted, nextFav);

  res.json({ lessonId, completed: Boolean(nextCompleted), is_favorite: Boolean(nextFav) });
});

app.post('/api/lessons/:id/access', (req: AuthenticatedRequest, res) => {
  const lessonId = Number(req.params.id);
  const lesson = db.prepare('SELECT id, subject_slug FROM lessons WHERE id = ?').get(lessonId) as
    | { id: number; subject_slug: string }
    | undefined;
  if (!lesson) {
    res.status(404).json({ error: 'Lesson not found' });
    return;
  }
  const firstInSubject = db
    .prepare('SELECT id FROM lessons WHERE subject_slug = ? ORDER BY lesson_order ASC, id ASC LIMIT 1')
    .get(lesson.subject_slug) as { id: number } | undefined;
  const isStarterFree =
    firstInSubject?.id === lesson.id ||
    lesson.subject_slug === 'bac-sn-cell-genetics' ||
    lesson.subject_slug === 'bac-lm-philosophy-lit';

  const tier = getEffectivePlanTier(req.authUser);
  if (tier === 'paid' || isStarterFree) {
    res.json({ allowed: true, tier, isFreeLesson: isStarterFree });
    return;
  }
  if (!req.authUser) {
    res.status(403).json({
      allowed: false,
      code: 'PLAN_UPGRADE_REQUIRED',
      error: 'هذا الدرس مخصص للمشتركين في الباقات المدفوعة. يمكنك تصفح الدروس المجانية التأسيسية أو الاشتراك لفتح كامل المقرر.',
    });
    return;
  }
  const limits = getPlanLimitsForTier('free');
  const today = new Date().toISOString().slice(0, 10);
  const usage = db
    .prepare('SELECT lessons_viewed FROM user_daily_usage WHERE user_id = ? AND usage_date = ?')
    .get(req.authUser.userId, today) as { lessons_viewed: number } | undefined;
  const maxLessons = Number(limits.daily_lessons_limit || 3);
  if ((usage?.lessons_viewed || 0) >= maxLessons) {
    res.status(403).json({
      allowed: false,
      code: 'QUOTA_EXCEEDED',
      limit: maxLessons,
      error: `بلغت الحد اليومي للباقة المجانية (${maxLessons} دروس يومياً). يمكنك الترقية إلى الباقة الشهرية أو السنوية لفتح جميع الدروس.`,
    });
    return;
  }
  db.prepare(
    `INSERT INTO user_daily_usage (user_id, usage_date, lessons_viewed) VALUES (?, ?, 1)
     ON CONFLICT(user_id, usage_date) DO UPDATE SET lessons_viewed = lessons_viewed + 1`
  ).run(req.authUser.userId, today);
  res.json({ allowed: true, tier, usedToday: (usage?.lessons_viewed || 0) + 1, limit: maxLessons });
});

// =====================================================================
// QUESTION BANK & PRE-EXAM REVIEW CENTER (PAGINATED & FACETED)
// =====================================================================
function mapQuestionRow(r: any, seenSet?: Set<number>) {
  const optionsAr = parseJson<string[]>(r.options_ar_json, []).map((o) => stripArabicDiacritics(o));
  const optionsFr = parseJson<string[]>(r.options_fr_json, []);
  return {
    id: r.id,
    subject_slug: r.subject_slug,
    track: r.track,
    level: r.level,
    axis_ar: stripArabicDiacritics(r.axis_ar || r.topic_ar || ''),
    axis_fr: r.axis_fr || r.topic_fr || '',
    lesson_id: r.lesson_id ?? null,
    topic_ar: stripArabicDiacritics(r.topic_ar || ''),
    topic_fr: r.topic_fr || '',
    skill_ar: stripArabicDiacritics(r.skill_ar || ''),
    skill_fr: r.skill_fr || '',
    question_type: r.question_type || 'mcq',
    difficulty: r.difficulty,
    stem_ar: stripArabicDiacritics(r.stem_ar || ''),
    stem_speech_ar: r.stem_speech_ar || r.stem_ar || '',
    stem_fr: r.stem_fr || '',
    options_ar: optionsAr,
    options_speech_ar: parseJson<string[]>(r.options_speech_ar_json, optionsAr),
    options_fr: optionsFr,
    correct_index: r.correct_index,
    answer_ar: stripArabicDiacritics(r.answer_ar || optionsAr[r.correct_index] || ''),
    answer_speech_ar: r.answer_speech_ar || r.answer_ar || optionsAr[r.correct_index] || '',
    answer_fr: r.answer_fr || optionsFr[r.correct_index] || '',
    explanation_ar: stripArabicDiacritics(r.explanation_ar || ''),
    explanation_speech_ar: r.explanation_speech_ar || r.explanation_ar || '',
    explanation_fr: r.explanation_fr || '',
    exam_ref: r.exam_ref || '',
    target_competition: r.target_competition || '',
    content_status: r.content_status || 'published',
    reviewed_by: r.reviewed_by || null,
    reviewed_at: r.reviewed_at || null,
    verified: r.verified,
    seen_before: seenSet ? seenSet.has(r.id) : false,
  };
}

app.get('/api/questions/stats', (_req, res) => {
  const totalPublished = (
    db
      .prepare("SELECT COUNT(*) as c FROM questions WHERE verified = 1 AND content_status = 'published'")
      .get() as { c: number }
  ).c;
  const byTrack = db
    .prepare(
      "SELECT track, COUNT(*) as count FROM questions WHERE verified = 1 AND content_status = 'published' GROUP BY track"
    )
    .all() as Array<{ track: string; count: number }>;
  const bySubject = db
    .prepare(
      "SELECT subject_slug, COUNT(*) as count FROM questions WHERE verified = 1 AND content_status = 'published' GROUP BY subject_slug"
    )
    .all() as Array<{ subject_slug: string; count: number }>;
  const byStatus = db
    .prepare('SELECT content_status, COUNT(*) as count FROM questions GROUP BY content_status')
    .all() as Array<{ content_status: string; count: number }>;
  res.json({ totalPublished, byTrack, bySubject, byStatus });
});

app.get('/api/questions', (req: AuthenticatedRequest, res) => {
  const {
    track,
    subject,
    axis,
    lessonId,
    level,
    difficulty,
    questionType,
    status,
    search,
    trackExact,
    langFilter,
    examLang,
    page: rawPage,
    limit: rawLimit,
  } = req.query;

  const isAdminUser = req.authUser?.role === 'admin';
  const clauses: string[] = [];
  const params: any[] = [];

  if (isAdminUser && status && status !== 'all') {
    clauses.push('content_status = ?');
    params.push(String(status));
  } else if (!isAdminUser) {
    clauses.push("verified = 1 AND content_status = 'published'");
  }

  if (track && track !== 'all') {
    if (trackExact === 'true' || trackExact === '1') {
      clauses.push('track = ?');
      params.push(String(track));
    } else {
      clauses.push("(track = ? OR track = 'all')");
      params.push(String(track));
    }
  }
  const activeLang = String(langFilter || examLang || '').trim().toLowerCase();
  if (activeLang === 'fr') {
    clauses.push("trim(stem_fr) != '' AND trim(options_fr_json) != '[]' AND track != 'arabic' AND subject_slug NOT IN ('arabic-lang', 'islamic-education')");
  } else if (activeLang === 'ar') {
    clauses.push("trim(stem_ar) != '' AND trim(options_ar_json) != '[]' AND track != 'french' AND subject_slug != 'french-lang'");
  }
  if (subject && subject !== 'all') {
    clauses.push('subject_slug = ?');
    params.push(String(subject));
  }
  if (axis && axis !== 'all') {
    clauses.push('(axis_ar = ? OR axis_fr = ?)');
    params.push(String(axis), String(axis));
  }
  if (lessonId && lessonId !== 'all') {
    clauses.push('lesson_id = ?');
    params.push(Number(lessonId));
  }
  if (level && level !== 'all') {
    clauses.push('level = ?');
    params.push(String(level));
  }
  if (difficulty && difficulty !== 'all') {
    clauses.push('difficulty = ?');
    params.push(String(difficulty));
  }
  if (questionType && questionType !== 'all') {
    clauses.push('question_type = ?');
    params.push(String(questionType));
  }
  if (search && String(search).trim()) {
    const q = `%${String(search).trim()}%`;
    clauses.push(
      '(stem_ar LIKE ? OR stem_fr LIKE ? OR topic_ar LIKE ? OR topic_fr LIKE ? OR axis_ar LIKE ? OR axis_fr LIKE ?)'
    );
    params.push(q, q, q, q, q, q);
  }

  const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  const total = (
    db.prepare(`SELECT COUNT(*) as c FROM questions ${whereSql}`).get(...params) as { c: number }
  ).c;

  const page = Math.max(1, Number(rawPage) || 1);
  const limit = Math.min(100, Math.max(1, Number(rawLimit) || 20));
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const safePage = Math.min(page, totalPages);
  const offset = (safePage - 1) * limit;

  // Package gating: free/guest accounts are capped at daily_questions_limit (page 1 starter bank)
  const effectiveTier = getEffectivePlanTier(req.authUser);
  if (effectiveTier === 'free' && !isAdminUser) {
    const freeLimits = getPlanLimitsForTier('free');
    const maxFreeQuestions = Math.max(10, Number(freeLimits.daily_questions_limit || 25));
    if (offset >= maxFreeQuestions) {
      res.status(403).json({
        code: 'QUOTA_EXCEEDED',
        limit: maxFreeQuestions,
        error: `في الباقة المجانية يمكنك تصفح أول ${maxFreeQuestions} سؤالاً تجريبياً يومياً في بنك الأسئلة. قم بالترقية للوصول الكامل إلى أكثر من ${total.toLocaleString()} سؤالاً وشروحاتها.`,
      });
      return;
    }
    if (req.authUser) {
      const today = new Date().toISOString().slice(0, 10);
      db.prepare(
        `INSERT INTO user_daily_usage (user_id, usage_date, questions_viewed) VALUES (?, ?, ?)
         ON CONFLICT(user_id, usage_date) DO UPDATE SET questions_viewed = MAX(questions_viewed, excluded.questions_viewed)`
      ).run(req.authUser.userId, today, Math.min(maxFreeQuestions, offset + limit));
    }
  }

  const effectiveLimit =
    effectiveTier === 'free' && !isAdminUser
      ? Math.max(1, Math.min(limit, Math.max(10, Number(getPlanLimitsForTier('free').daily_questions_limit || 25)) - offset))
      : limit;

  const rows = db
    .prepare(`SELECT * FROM questions ${whereSql} ORDER BY id ASC LIMIT ? OFFSET ?`)
    .all(...params, effectiveLimit, offset) as any[];

  const seenSet = new Set<number>();
  if (req.authUser) {
    const seenRows = db
      .prepare('SELECT question_id FROM user_question_history WHERE user_id = ?')
      .all(req.authUser.userId) as Array<{ question_id: number }>;
    seenRows.forEach((r) => seenSet.add(r.question_id));
  }

  const axes = db
    .prepare(
      `SELECT DISTINCT axis_ar, axis_fr FROM questions WHERE ${isAdminUser ? '1=1' : "verified = 1 AND content_status = 'published'"} AND axis_ar != '' ORDER BY axis_ar ASC LIMIT 120`
    )
    .all() as Array<{ axis_ar: string; axis_fr: string }>;

  const questions = rows.map((r) => mapQuestionRow(r, seenSet));

  res.json({
    questions,
    total,
    page: safePage,
    limit,
    totalPages,
    tier: effectiveTier,
    facets: { axes },
  });
});

// =====================================================================
// EXAMS SYSTEM: CONFIGS, START, AUTO-SAVE, RESUME, SUBMIT, REVIEW
// =====================================================================
function countAvailableQuestions(track: string, subjectSlug: string, level: string): number {
  const clauses: string[] = ["verified = 1", "content_status = 'published'"];
  const params: any[] = [];
  if (track && track !== 'all') {
    clauses.push("(track = ? OR track = 'all')");
    params.push(track);
  }
  if (subjectSlug && subjectSlug !== 'all') {
    clauses.push('subject_slug = ?');
    params.push(subjectSlug);
  }
  if (level && level !== 'all') {
    clauses.push('level = ?');
    params.push(level);
  }
  const row = db
    .prepare(`SELECT COUNT(*) as c FROM questions WHERE ${clauses.join(' AND ')}`)
    .get(...params) as { c: number };
  return row.c;
}

app.get('/api/exams/configs', (_req, res) => {
  const configs = db.prepare('SELECT * FROM exam_configs WHERE is_active = 1 ORDER BY id ASC').all() as any[];
  const enriched = configs.map((c) => {
    const avail = countAvailableQuestions(c.track, c.subject_slug, c.level);
    return {
      ...c,
      available_unique_questions: avail,
      is_official_complete: avail >= 70,
    };
  });
  res.json({ configs: enriched, gradingPolicy: getGradingPolicy() });
});

function sanitizeQuestionForActiveExam(q: any) {
  return {
    id: q.id,
    subject_slug: q.subject_slug,
    track: q.track,
    level: q.level,
    topic_ar: q.topic_ar,
    topic_fr: q.topic_fr,
    skill_ar: q.skill_ar,
    skill_fr: q.skill_fr,
    difficulty: q.difficulty,
    stem_ar: q.stem_ar,
    stem_speech_ar: q.stem_speech_ar,
    stem_fr: q.stem_fr,
    options_ar: parseJson<string[]>(q.options_ar_json, []),
    options_speech_ar: parseJson<string[]>(q.options_speech_ar_json, []),
    options_fr: parseJson<string[]>(q.options_fr_json, []),
    verified: q.verified,
  };
}

app.get('/api/exams/active', requireAuth, (req: AuthenticatedRequest, res) => {
  const attempt = db
    .prepare("SELECT * FROM exam_attempts WHERE user_id = ? AND status = 'in_progress' ORDER BY id DESC LIMIT 1")
    .get(req.authUser!.userId) as any;

  if (!attempt) {
    res.json({ attempt: null, questions: [] });
    return;
  }

  const qIds = parseJson<number[]>(attempt.question_ids_json, []);
  if (qIds.length === 0) {
    res.json({ attempt: null, questions: [] });
    return;
  }
  const placeholders = qIds.map(() => '?').join(',');
  const rows = db
    .prepare(`SELECT * FROM questions WHERE id IN (${placeholders})`)
    .all(...qIds) as any[];
  const rowMap = new Map(rows.map((r) => [r.id, r]));
  const orderedQuestions = qIds
    .map((id) => rowMap.get(id))
    .filter(Boolean)
    .map(sanitizeQuestionForActiveExam);

  const cfg = db.prepare('SELECT title_ar, title_fr FROM exam_configs WHERE id = ?').get(attempt.config_id) as any;

  res.json({
    attempt: {
      id: attempt.id,
      user_id: attempt.user_id,
      config_id: attempt.config_id,
      title_ar: cfg?.title_ar || '',
      title_fr: cfg?.title_fr || '',
      mode: attempt.mode,
      track: attempt.track,
      subject_slug: attempt.subject_slug,
      level: attempt.level,
      question_ids: qIds,
      answers: parseJson<Record<string, number>>(attempt.answers_json, {}),
      flagged: parseJson<number[]>(attempt.flagged_json, []),
      started_at: attempt.started_at,
      time_spent_seconds: attempt.time_spent_seconds,
      duration_minutes: attempt.duration_minutes,
      status: attempt.status,
      camera_checked: attempt.camera_checked,
      camera_photo_data_url: attempt.camera_photo_data_url || '',
      device_mode: attempt.device_mode,
    },
    questions: orderedQuestions,
  });
});

app.post('/api/exams/start', requireAuth, (req: AuthenticatedRequest, res) => {
  const {
    configId,
    track,
    subjectSlug,
    level,
    mode,
    questionCount,
    durationMinutes,
    cameraChecked,
    cameraPhotoDataUrl,
    deviceMode,
    examLang,
    trackExact,
  } = req.body ?? {};

  // Check if user already has an active attempt; close or refuse cleanly unless replace=true
  const activeAttempt = db
    .prepare("SELECT id FROM exam_attempts WHERE user_id = ? AND status = 'in_progress' LIMIT 1")
    .get(req.authUser!.userId) as { id: number } | undefined;

  if (activeAttempt && !req.body?.forceNew) {
    res.status(409).json({
      error: 'An exam attempt is already in progress. Resume or submit it first.',
      activeAttemptId: activeAttempt.id,
    });
    return;
  }

  let cfg: any = null;
  if (configId) {
    cfg = db.prepare('SELECT * FROM exam_configs WHERE id = ?').get(Number(configId));
  }

  const chosenMode = cfg?.mode || (['mock', 'official_sim', 'placement'].includes(mode) ? mode : 'mock');
  const chosenTrack = track || cfg?.track || 'all';
  const chosenSubject = subjectSlug || cfg?.subject_slug || 'all';
  const chosenLevel = level || cfg?.level || 'all';
  const requestedCount = Number(questionCount || cfg?.question_count || 10);
  const chosenDuration = Number(durationMinutes || cfg?.duration_minutes || Math.max(10, Math.round(requestedCount * 1.3)));

  // Enforce Free Tier Quotas cleanly
  const tier = getEffectivePlanTier(req.authUser);
  const limits = getPlanLimitsForTier(tier);
  if (tier === 'free') {
    if (chosenMode === 'official_sim' && !limits.allow_official_sim) {
      res.status(403).json({
        code: 'PLAN_UPGRADE_REQUIRED',
        error: 'المحاكاة الرسمية الكاملة (70 سؤالاً) مخصصة للمشتركين. يرجى الترقية إلى الباقة الشهرية أو السنوية.',
      });
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    const usage = db
      .prepare('SELECT exams_started FROM user_daily_usage WHERE user_id = ? AND usage_date = ?')
      .get(req.authUser!.userId, today) as { exams_started: number } | undefined;
    if ((usage?.exams_started || 0) >= Number(limits.daily_exams_limit || 2)) {
      res.status(403).json({
        code: 'QUOTA_EXCEEDED',
        error: `بلغت الحد اليومي للباقة المجانية (${limits.daily_exams_limit} اختبارات في اليوم). يمكنك الترقية لفتح الاختبارات غير المحدودة.`,
      });
      return;
    }
    db.prepare(
      `INSERT INTO user_daily_usage (user_id, usage_date, exams_started) VALUES (?, ?, 1)
       ON CONFLICT(user_id, usage_date) DO UPDATE SET exams_started = exams_started + 1`
    ).run(req.authUser!.userId, today);
  }

  // Build query prioritizing unseen published questions first, strictly unique (no duplicates!)
  const clauses: string[] = ["q.verified = 1", "q.content_status = 'published'"];
  const params: any[] = [req.authUser!.userId];

  if (chosenTrack !== 'all') {
    if (trackExact === true || trackExact === 'true') {
      clauses.push('q.track = ?');
      params.push(chosenTrack);
    } else {
      clauses.push("(q.track = ? OR q.track = 'all')");
      params.push(chosenTrack);
    }
  }
  const cleanExamLang = String(examLang || '').trim().toLowerCase();
  if (cleanExamLang === 'fr') {
    clauses.push("trim(q.stem_fr) != '' AND trim(q.options_fr_json) != '[]' AND q.track != 'arabic' AND q.subject_slug NOT IN ('arabic-lang', 'islamic-education')");
  } else if (cleanExamLang === 'ar') {
    clauses.push("trim(q.stem_ar) != '' AND trim(q.options_ar_json) != '[]' AND q.track != 'french' AND q.subject_slug != 'french-lang'");
  }
  if (chosenSubject !== 'all') {
    clauses.push('q.subject_slug = ?');
    params.push(chosenSubject);
  }
  if (chosenLevel !== 'all') {
    clauses.push('q.level = ?');
    params.push(chosenLevel);
  }

  const candidateRows = db
    .prepare(
      `SELECT q.*, COALESCE(h.times_seen, 0) as seen_count
       FROM questions q
       LEFT JOIN user_question_history h ON h.question_id = q.id AND h.user_id = ?
       WHERE ${clauses.join(' AND ')}
       ORDER BY seen_count ASC, RANDOM()`
    )
    .all(...params) as any[];

  if (candidateRows.length === 0) {
    res.status(400).json({ error: 'No verified questions available for the selected filters.' });
    return;
  }

  // Enforce Section 6 Rule: Never pad or duplicate questions to hit 70!
  if (chosenMode === 'official_sim' && requestedCount >= 70 && candidateRows.length < 70) {
    res.status(400).json({
      error: `Official 70-question simulation requires at least 70 unique verified questions. Only ${candidateRows.length} unique questions exist for this filter.`,
      available: candidateRows.length,
    });
    return;
  }

  const selected = candidateRows.slice(0, Math.min(requestedCount, candidateRows.length));
  const questionIds = selected.map((q) => q.id);

  // If forceNew was requested, abandon any stale in-progress attempt
  if (activeAttempt && req.body?.forceNew) {
    db.prepare("DELETE FROM exam_attempts WHERE id = ? AND user_id = ? AND status = 'in_progress'").run(
      activeAttempt.id,
      req.authUser!.userId
    );
  }

  const safeCameraPhoto =
    typeof cameraPhotoDataUrl === 'string' &&
    /^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=\s]+$/i.test(cameraPhotoDataUrl) &&
    cameraPhotoDataUrl.length <= 750_000
      ? cameraPhotoDataUrl
      : '';

  const insertAttempt = db
    .prepare(
      `INSERT INTO exam_attempts (
        user_id, config_id, mode, track, subject_slug, level,
        question_ids_json, answers_json, flagged_json, duration_minutes,
        status, camera_checked, camera_photo_data_url, device_mode
      ) VALUES (?, ?, ?, ?, ?, ?, ?, '{}', '[]', ?, 'in_progress', ?, ?, ?)`
    )
    .run(
      req.authUser!.userId,
      cfg?.id || 0,
      chosenMode,
      chosenTrack,
      chosenSubject,
      chosenLevel,
      JSON.stringify(questionIds),
      chosenDuration,
      cameraChecked ? 1 : 0,
      safeCameraPhoto,
      String(deviceMode || 'desktop')
    );

  const attemptId = Number(insertAttempt.lastInsertRowid);
  logAudit(req.authUser!.userId, req.authUser!.email, 'START_EXAM', 'exam_attempt', attemptId, `Mode=${chosenMode};Q=${questionIds.length}`);

  res.status(201).json({
    attempt: {
      id: attemptId,
      user_id: req.authUser!.userId,
      config_id: cfg?.id || 0,
      title_ar: cfg?.title_ar || '',
      title_fr: cfg?.title_fr || '',
      mode: chosenMode,
      track: chosenTrack,
      subject_slug: chosenSubject,
      level: chosenLevel,
      question_ids: questionIds,
      answers: {},
      flagged: [],
      started_at: new Date().toISOString(),
      time_spent_seconds: 0,
      duration_minutes: chosenDuration,
      status: 'in_progress',
      camera_checked: cameraChecked ? 1 : 0,
      camera_photo_data_url: safeCameraPhoto,
      device_mode: String(deviceMode || 'desktop'),
    },
    questions: selected.map(sanitizeQuestionForActiveExam),
  });
});

app.patch('/api/exams/:attemptId/answer', requireAuth, (req: AuthenticatedRequest, res) => {
  const attemptId = Number(req.params.attemptId);
  const { questionId, optionIndex, flagged, timeSpentSeconds } = req.body ?? {};
  const attempt = db
    .prepare('SELECT * FROM exam_attempts WHERE id = ? AND user_id = ?')
    .get(attemptId, req.authUser!.userId) as any;

  if (!attempt) {
    res.status(404).json({ error: 'Exam attempt not found' });
    return;
  }
  if (attempt.status !== 'in_progress') {
    res.status(400).json({ error: 'Exam attempt is already submitted' });
    return;
  }

  const answers = parseJson<Record<string, number>>(attempt.answers_json, {});
  if (questionId !== undefined && typeof optionIndex === 'number' && optionIndex >= 0 && optionIndex <= 3) {
    answers[String(questionId)] = optionIndex;
  }
  const nextFlagged = Array.isArray(flagged) ? flagged.map(Number) : parseJson<number[]>(attempt.flagged_json, []);
  const nextElapsed =
    typeof timeSpentSeconds === 'number' && timeSpentSeconds >= 0
      ? Math.min(Math.round(timeSpentSeconds), attempt.duration_minutes * 60 + 60)
      : attempt.time_spent_seconds;

  db.prepare(
    'UPDATE exam_attempts SET answers_json = ?, flagged_json = ?, time_spent_seconds = ? WHERE id = ?'
  ).run(JSON.stringify(answers), JSON.stringify(nextFlagged), nextElapsed, attemptId);

  res.json({ ok: true, answers, flagged: nextFlagged, time_spent_seconds: nextElapsed });
});

app.post('/api/exams/:attemptId/submit', requireAuth, (req: AuthenticatedRequest, res) => {
  const attemptId = Number(req.params.attemptId);
  const { answers: clientAnswers, timeSpentSeconds } = req.body ?? {};
  const attempt = db
    .prepare('SELECT * FROM exam_attempts WHERE id = ? AND user_id = ?')
    .get(attemptId, req.authUser!.userId) as any;

  if (!attempt) {
    res.status(404).json({ error: 'Exam attempt not found' });
    return;
  }
  if (attempt.status === 'submitted') {
    res.json({
      attempt: {
        ...attempt,
        question_ids: parseJson(attempt.question_ids_json, []),
        answers: parseJson(attempt.answers_json, {}),
        topic_breakdown: parseJson(attempt.topic_breakdown_json, []),
        subject_breakdown: parseJson(attempt.subject_breakdown_json, []),
        camera_photo_data_url: attempt.camera_photo_data_url || '',
      },
    });
    return;
  }

  const mergedAnswers: Record<string, number> = {
    ...parseJson<Record<string, number>>(attempt.answers_json, {}),
    ...(clientAnswers && typeof clientAnswers === 'object' ? clientAnswers : {}),
  };
  const qIds = parseJson<number[]>(attempt.question_ids_json, []);
  const placeholders = qIds.map(() => '?').join(',');
  const questions = db
    .prepare(`SELECT * FROM questions WHERE id IN (${placeholders})`)
    .all(...qIds) as any[];
  const qMap = new Map(questions.map((q) => [q.id, q]));

  const subjectRows = db.prepare('SELECT slug, name_ar, name_fr FROM subjects').all() as Array<{
    slug: string;
    name_ar: string;
    name_fr: string;
  }>;
  const subjectNameMap = new Map(subjectRows.map((s) => [s.slug, s]));

  let correctCount = 0;
  let wrongCount = 0;
  let unansweredCount = 0;
  const topicAcc = new Map<
    string,
    { topic_ar: string; topic_fr: string; subject_slug: string; total: number; correct: number }
  >();
  const subjectAcc = new Map<
    string,
    { subject_slug: string; name_ar: string; name_fr: string; total: number; correct: number }
  >();

  const upsertHistory = db.prepare(`
    INSERT INTO user_question_history (user_id, question_id, times_seen, times_correct, last_seen_at)
    VALUES (?, ?, 1, ?, datetime('now'))
    ON CONFLICT(user_id, question_id) DO UPDATE SET
      times_seen = times_seen + 1,
      times_correct = times_correct + excluded.times_correct,
      last_seen_at = datetime('now')
  `);

  const gradeTx = db.transaction(() => {
    for (const qId of qIds) {
      const q = qMap.get(qId);
      if (!q) continue;
      const ans = mergedAnswers[String(qId)];
      const isAnswered = typeof ans === 'number' && ans >= 0 && ans <= 3;
      const isCorrect = isAnswered && ans === q.correct_index;

      if (!isAnswered) unansweredCount++;
      else if (isCorrect) correctCount++;
      else wrongCount++;

      upsertHistory.run(req.authUser!.userId, qId, isCorrect ? 1 : 0);

      const tKey = `${q.subject_slug}::${q.topic_ar}`;
      const existingTopic = topicAcc.get(tKey) || {
        topic_ar: q.topic_ar,
        topic_fr: q.topic_fr,
        subject_slug: q.subject_slug,
        total: 0,
        correct: 0,
      };
      existingTopic.total += 1;
      if (isCorrect) existingTopic.correct += 1;
      topicAcc.set(tKey, existingTopic);

      const subInfo = subjectNameMap.get(q.subject_slug);
      const existingSub = subjectAcc.get(q.subject_slug) || {
        subject_slug: q.subject_slug,
        name_ar: subInfo?.name_ar || q.subject_slug,
        name_fr: subInfo?.name_fr || q.subject_slug,
        total: 0,
        correct: 0,
      };
      existingSub.total += 1;
      if (isCorrect) existingSub.correct += 1;
      subjectAcc.set(q.subject_slug, existingSub);
    }
  });
  gradeTx();

  const totalQuestions = qIds.length || 1;
  const policy = getGradingPolicy();
  const rawPoints = Math.max(0, correctCount - wrongCount * (policy.wrongPenalty || 0));
  const score20 = Number(((rawPoints / totalQuestions) * (policy.maxScore || 20)).toFixed(2));
  const percentage = Number(((correctCount / totalQuestions) * 100).toFixed(1));
  const topicBreakdown = Array.from(topicAcc.values()).map((t) => ({
    ...t,
    percentage: Number(((t.correct / t.total) * 100).toFixed(1)),
  }));
  const subjectBreakdown = Array.from(subjectAcc.values()).map((s) => ({
    ...s,
    percentage: Number(((s.correct / s.total) * 100).toFixed(1)),
    score_20: Number(((s.correct / Math.max(1, s.total)) * (policy.maxScore || 20)).toFixed(2)),
  }));

  const finalElapsed =
    typeof timeSpentSeconds === 'number' && timeSpentSeconds >= 0
      ? Math.min(Math.round(timeSpentSeconds), attempt.duration_minutes * 60)
      : attempt.time_spent_seconds;

  db.prepare(
    `UPDATE exam_attempts SET
      answers_json = ?,
      submitted_at = datetime('now'),
      time_spent_seconds = ?,
      status = 'submitted',
      score_20 = ?,
      correct_count = ?,
      wrong_count = ?,
      unanswered_count = ?,
      percentage = ?,
      topic_breakdown_json = ?,
      subject_breakdown_json = ?
     WHERE id = ?`
  ).run(
    JSON.stringify(mergedAnswers),
    finalElapsed,
    score20,
    correctCount,
    wrongCount,
    unansweredCount,
    percentage,
    JSON.stringify(topicBreakdown),
    JSON.stringify(subjectBreakdown),
    attemptId
  );

  logAudit(
    req.authUser!.userId,
    req.authUser!.email,
    'SUBMIT_EXAM',
    'exam_attempt',
    attemptId,
    `Score=${score20}/20`
  );

  const updated = db.prepare('SELECT * FROM exam_attempts WHERE id = ?').get(attemptId) as any;
  res.json({
    attempt: {
      ...updated,
      question_ids: qIds,
      answers: mergedAnswers,
      topic_breakdown: topicBreakdown,
      subject_breakdown: subjectBreakdown,
      camera_photo_data_url: updated.camera_photo_data_url || '',
    },
  });
});

app.get('/api/exams/history', requireAuth, (req: AuthenticatedRequest, res) => {
  const rows = db
    .prepare(
      `SELECT ea.*, ec.title_ar, ec.title_fr
       FROM exam_attempts ea
       LEFT JOIN exam_configs ec ON ec.id = ea.config_id
       WHERE ea.user_id = ? AND ea.status = 'submitted'
       ORDER BY ea.submitted_at DESC, ea.id DESC`
    )
    .all(req.authUser!.userId) as any[];

  const history = rows.map((r) => ({
    id: r.id,
    config_id: r.config_id,
    title_ar: r.title_ar,
    title_fr: r.title_fr,
    mode: r.mode,
    track: r.track,
    subject_slug: r.subject_slug,
    level: r.level,
    question_count: parseJson<number[]>(r.question_ids_json, []).length,
    started_at: r.started_at,
    submitted_at: r.submitted_at,
    time_spent_seconds: r.time_spent_seconds,
    duration_minutes: r.duration_minutes,
    status: r.status,
    score_20: r.score_20,
    correct_count: r.correct_count,
    wrong_count: r.wrong_count,
    unanswered_count: r.unanswered_count,
    percentage: r.percentage,
    topic_breakdown: parseJson(r.topic_breakdown_json, []),
    subject_breakdown: parseJson(r.subject_breakdown_json, []),
    camera_photo_data_url: r.camera_photo_data_url || '',
  }));

  res.json({ history });
});

app.get('/api/exams/:attemptId/review', requireAuth, (req: AuthenticatedRequest, res) => {
  const attemptId = Number(req.params.attemptId);
  const attempt = db.prepare('SELECT * FROM exam_attempts WHERE id = ?').get(attemptId) as any;
  if (!attempt) {
    res.status(404).json({ error: 'Exam attempt not found' });
    return;
  }
  if (attempt.user_id !== req.authUser!.userId && req.authUser!.role !== 'admin') {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  if (attempt.status !== 'submitted') {
    res.status(400).json({ error: 'Attempt must be submitted before review' });
    return;
  }

  const qIds = parseJson<number[]>(attempt.question_ids_json, []);
  const answers = parseJson<Record<string, number>>(attempt.answers_json, {});
  const placeholders = qIds.map(() => '?').join(',');
  const rows = db.prepare(`SELECT * FROM questions WHERE id IN (${placeholders})`).all(...qIds) as any[];
  const qMap = new Map(rows.map((r) => [r.id, r]));

  const items = qIds
    .map((id) => qMap.get(id))
    .filter(Boolean)
    .map((q) => {
      const userAnswer = answers[String(q.id)];
      const isAnswered = typeof userAnswer === 'number';
      const status = !isAnswered
        ? 'unanswered'
        : userAnswer === q.correct_index
          ? 'correct'
          : 'wrong';
      return {
        id: q.id,
        subject_slug: q.subject_slug,
        topic_ar: q.topic_ar,
        topic_fr: q.topic_fr,
        level: q.level,
        difficulty: q.difficulty,
        stem_ar: q.stem_ar,
        stem_speech_ar: q.stem_speech_ar,
        stem_fr: q.stem_fr,
        options_ar: parseJson<string[]>(q.options_ar_json, []),
        options_speech_ar: parseJson<string[]>(q.options_speech_ar_json, []),
        options_fr: parseJson<string[]>(q.options_fr_json, []),
        correct_index: q.correct_index,
        user_answer: isAnswered ? userAnswer : null,
        status,
        explanation_ar: q.explanation_ar,
        explanation_speech_ar: q.explanation_speech_ar,
        explanation_fr: q.explanation_fr,
      };
    });

  res.json({
    attempt: {
      id: attempt.id,
      mode: attempt.mode,
      track: attempt.track,
      subject_slug: attempt.subject_slug,
      level: attempt.level,
      submitted_at: attempt.submitted_at,
      time_spent_seconds: attempt.time_spent_seconds,
      duration_minutes: attempt.duration_minutes,
      score_20: attempt.score_20,
      correct_count: attempt.correct_count,
      wrong_count: attempt.wrong_count,
      unanswered_count: attempt.unanswered_count,
      percentage: attempt.percentage,
      topic_breakdown: parseJson(attempt.topic_breakdown_json, []),
      subject_breakdown: parseJson(attempt.subject_breakdown_json, []),
      camera_photo_data_url: attempt.camera_photo_data_url || '',
    },
    items,
  });
});

// =====================================================================
// STUDENT ANALYTICS DASHBOARD
// =====================================================================
app.get('/api/student/stats', requireAuth, (req: AuthenticatedRequest, res) => {
  const userId = req.authUser!.userId;
  const submitted = db
    .prepare("SELECT * FROM exam_attempts WHERE user_id = ? AND status = 'submitted' ORDER BY id ASC")
    .all(userId) as any[];

  const examsCompleted = submitted.length;
  const avgScore =
    examsCompleted > 0
      ? Number((submitted.reduce((acc, r) => acc + (r.score_20 || 0), 0) / examsCompleted).toFixed(2))
      : 0;
  const bestScore =
    examsCompleted > 0 ? Math.max(...submitted.map((r) => Number(r.score_20 || 0))) : 0;

  let totalCorrect = 0;
  let totalWrong = 0;
  let totalUnanswered = 0;
  const topicTotals = new Map<
    string,
    { topic_ar: string; topic_fr: string; subject_slug: string; total: number; correct: number }
  >();

  for (const r of submitted) {
    totalCorrect += r.correct_count || 0;
    totalWrong += r.wrong_count || 0;
    totalUnanswered += r.unanswered_count || 0;
    const breakdown = parseJson<any[]>(r.topic_breakdown_json, []);
    for (const tb of breakdown) {
      const k = `${tb.subject_slug}::${tb.topic_ar}`;
      const prev = topicTotals.get(k) || {
        topic_ar: tb.topic_ar,
        topic_fr: tb.topic_fr,
        subject_slug: tb.subject_slug,
        total: 0,
        correct: 0,
      };
      prev.total += tb.total;
      prev.correct += tb.correct;
      topicTotals.set(k, prev);
    }
  }

  const topicStats = Array.from(topicTotals.values()).map((t) => ({
    ...t,
    percentage: Number(((t.correct / Math.max(1, t.total)) * 100).toFixed(1)),
  }));

  const lessonsCompleted = (
    db
      .prepare('SELECT COUNT(*) as c FROM user_lesson_progress WHERE user_id = ? AND completed = 1')
      .get(userId) as { c: number }
  ).c;
  const totalLessons = (db.prepare('SELECT COUNT(*) as c FROM lessons').get() as { c: number }).c;
  const favoriteLessons = (
    db
      .prepare('SELECT COUNT(*) as c FROM user_lesson_progress WHERE user_id = ? AND is_favorite = 1')
      .get(userId) as { c: number }
  ).c;

  res.json({
    examsCompleted,
    avgScore,
    bestScore,
    totalCorrect,
    totalWrong,
    totalUnanswered,
    lessonsCompleted,
    totalLessons,
    favoriteLessons,
    trend: submitted.map((r) => ({
      id: r.id,
      date: r.submitted_at,
      score_20: r.score_20,
      mode: r.mode,
      subject_slug: r.subject_slug,
    })),
    strongTopics: topicStats.filter((t) => t.percentage >= 70).sort((a, b) => b.percentage - a.percentage),
    weakTopics: topicStats.filter((t) => t.percentage < 70).sort((a, b) => a.percentage - b.percentage),
  });
});

// =====================================================================
// NOTIFICATIONS, SUPPORT TICKETS & NEWSLETTER
// =====================================================================
app.get('/api/notifications', (req: AuthenticatedRequest, res) => {
  const userId = req.authUser?.userId || null;
  const limit = Math.min(60, Math.max(10, Number(req.query.limit) || 35));
  const rows = userId
    ? db
        .prepare(
          `SELECT n.*, CASE WHEN nr.notification_id IS NOT NULL OR n.is_read = 1 THEN 1 ELSE 0 END AS is_read
           FROM notifications n
           JOIN users u ON u.id = ?
           LEFT JOIN user_notification_reads nr
             ON nr.notification_id = n.id AND nr.user_id = ?
           WHERE n.user_id = ?
              OR (
                n.user_id IS NULL
                AND (
                  n.target_scope = 'all_including_future'
                  OR datetime(u.created_at) <= datetime(COALESCE(n.eligible_before, n.created_at))
                )
              )
           ORDER BY n.id DESC LIMIT ?`
        )
        .all(userId, userId, userId, limit)
    : db
        .prepare(
          "SELECT * FROM notifications WHERE user_id IS NULL AND target_scope = 'all_including_future' ORDER BY id DESC LIMIT 20"
        )
        .all();
  res.json({ notifications: rows });
});

app.post('/api/notifications/stream-token', requireAuth, (req: AuthenticatedRequest, res) => {
  const ticket = issueStreamTicket(req.authUser!.userId);
  res.json({ ticket });
});

app.get('/api/notifications/stream', (req: AuthenticatedRequest, res) => {
  let userId: number | null = req.authUser?.userId ?? null;
  if (!userId && typeof req.query.ticket === 'string') {
    userId = consumeStreamTicket(req.query.ticket);
  }
  if (!userId) {
    res.status(401).json({ error: 'Authentication required for real-time notifications stream.' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const clientId = addNotificationClient(userId, res);
  res.write(`event: connected\ndata: ${JSON.stringify({ ok: true })}\n\n`);

  const keepAlive = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch {
      clearInterval(keepAlive);
      removeNotificationClient(clientId);
    }
  }, 25_000);

  req.on('close', () => {
    clearInterval(keepAlive);
    removeNotificationClient(clientId);
  });
});

app.post('/api/notifications/mark-read', requireAuth, (req: AuthenticatedRequest, res) => {
  const userId = req.authUser!.userId;
  const rows = db
    .prepare(
      `SELECT n.id
       FROM notifications n
       JOIN users u ON u.id = ?
       WHERE n.user_id = ?
          OR (
            n.user_id IS NULL
            AND (
              n.target_scope = 'all_including_future'
              OR datetime(u.created_at) <= datetime(COALESCE(n.eligible_before, n.created_at))
            )
          )
       ORDER BY n.id DESC LIMIT 60`
    )
    .all(userId, userId) as Array<{ id: number }>;
  const insertRead = db.prepare(
    'INSERT OR IGNORE INTO user_notification_reads (user_id, notification_id) VALUES (?, ?)'
  );
  const tx = db.transaction(() => {
    for (const r of rows) {
      insertRead.run(userId, r.id);
    }
    db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(userId);
  });
  tx();
  res.json({ ok: true });
});

app.post('/api/support', (req: AuthenticatedRequest, res) => {
  const { name, email, subject, message } = req.body ?? {};
  if (!name || !email || !subject || !message) {
    res.status(400).json({ error: 'All support ticket fields are required.' });
    return;
  }
  const result = db
    .prepare('INSERT INTO support_tickets (user_id, name, email, subject, message) VALUES (?, ?, ?, ?, ?)')
    .run(
      req.authUser?.userId || null,
      String(name).trim(),
      String(email).trim(),
      String(subject).trim(),
      String(message).trim()
    );
  res.status(201).json({ id: Number(result.lastInsertRowid), status: 'open' });
});

app.get('/api/support/mine', requireAuth, (req: AuthenticatedRequest, res) => {
  const rows = db
    .prepare('SELECT * FROM support_tickets WHERE user_id = ? ORDER BY id DESC')
    .all(req.authUser!.userId);
  res.json({ tickets: rows });
});

app.post('/api/newsletter', (req, res) => {
  const { email, country } = req.body ?? {};
  if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    res.status(400).json({ error: 'Valid email is required.' });
    return;
  }
  db.prepare('INSERT OR IGNORE INTO newsletter_subscribers (email, country) VALUES (?, ?)').run(
    email.trim().toLowerCase(),
    String(country || '')
  );
  res.json({ ok: true });
});

// =====================================================================
// STUDENT STUDY GOALS & POMODORO PROGRESS + BACCALAUREATE + ISSUE REPORTS
// =====================================================================
app.get('/api/student/goals', requireAuth, (req: AuthenticatedRequest, res) => {
  const userId = req.authUser!.userId;
  db.prepare(
    `INSERT OR IGNORE INTO user_study_goals (user_id) VALUES (?)`
  ).run(userId);
  const row = db.prepare('SELECT * FROM user_study_goals WHERE user_id = ?').get(userId);
  res.json({ goals: row });
});

app.put('/api/student/goals', requireAuth, (req: AuthenticatedRequest, res) => {
  const userId = req.authUser!.userId;
  const { dailyTargetMinutes, dailyQuestionsTarget, examGoalScore, logStudyMinutes, incrementPomodoro } =
    req.body ?? {};
  db.prepare('INSERT OR IGNORE INTO user_study_goals (user_id) VALUES (?)').run(userId);
  const current = db.prepare('SELECT * FROM user_study_goals WHERE user_id = ?').get(userId) as any;

  const nextMinutesTarget =
    dailyTargetMinutes !== undefined
      ? Math.min(480, Math.max(10, Number(dailyTargetMinutes) || 45))
      : current.daily_target_minutes;
  const nextQuestionsTarget =
    dailyQuestionsTarget !== undefined
      ? Math.min(300, Math.max(5, Number(dailyQuestionsTarget) || 20))
      : current.daily_questions_target;
  const nextExamGoal =
    examGoalScore !== undefined ? Math.min(20, Math.max(10, Number(examGoalScore) || 14)) : current.exam_goal_score;

  const addedStudyMins = Math.min(180, Math.max(0, Math.round(Number(logStudyMinutes || 0))));
  const addedPomodoros = incrementPomodoro ? 1 : 0;
  const todayStr = new Date().toISOString().slice(0, 10);
  let nextStreak = Number(current.streak_days || 0);
  if (addedStudyMins > 0 || addedPomodoros > 0) {
    if (current.last_study_date !== todayStr) {
      const yesterdayStr = new Date(Date.now() - 86400_000).toISOString().slice(0, 10);
      nextStreak = current.last_study_date === yesterdayStr ? nextStreak + 1 : 1;
    } else if (nextStreak === 0) {
      nextStreak = 1;
    }
  }

  db.prepare(
    `UPDATE user_study_goals
     SET daily_target_minutes = ?,
         daily_questions_target = ?,
         exam_goal_score = ?,
         streak_days = ?,
         last_study_date = CASE WHEN ? > 0 OR ? > 0 THEN ? ELSE last_study_date END,
         completed_pomodoros = completed_pomodoros + ?,
         total_study_minutes = total_study_minutes + ?,
         updated_at = datetime('now')
     WHERE user_id = ?`
  ).run(
    nextMinutesTarget,
    nextQuestionsTarget,
    nextExamGoal,
    nextStreak,
    addedStudyMins,
    addedPomodoros,
    todayStr,
    addedPomodoros,
    addedStudyMins,
    userId
  );

  const updated = db.prepare('SELECT * FROM user_study_goals WHERE user_id = ?').get(userId);
  res.json({ ok: true, goals: updated });
});

function bacLessonSeriesList(subjectSlug: string): string[] {
  const s = String(subjectSlug || '').toLowerCase();
  if (s.startsWith('bac-sn')) return ['bac-sn'];
  if (s.startsWith('bac-m-') || s.startsWith('bac-math-') || s.startsWith('bac-physics-')) {
    return ['bac-m', 'bac-sn'];
  }
  if (s.startsWith('bac-lm')) return ['bac-lm'];
  if (s.startsWith('bac-lo')) return ['bac-lo'];
  return ['bac-sn'];
}

// Baccalaureate Series, Official Mauritanian Coefficients & Content
app.get('/api/baccalaureate/catalog', (_req, res) => {
  const series = db
    .prepare('SELECT * FROM bac_series WHERE active = 1 ORDER BY display_order ASC, id ASC')
    .all() as any[];
  const coefficients = db
    .prepare('SELECT * FROM bac_coefficients ORDER BY series_slug ASC, display_order ASC, id ASC')
    .all() as any[];
  const lessons = db
    .prepare("SELECT * FROM lessons WHERE subject_slug LIKE 'bac-%' ORDER BY lesson_order ASC, id ASC")
    .all() as any[];
  const bacQuestionsCount = (
    db
      .prepare(
        "SELECT COUNT(*) as c FROM questions WHERE verified = 1 AND content_status = 'published' AND (target_competition LIKE '%باكالوريا%' OR axis_ar LIKE '%باكالوريا%' OR axis_fr LIKE '%Baccalauréat%')"
      )
      .get() as { c: number }
  ).c;

  res.json({
    series,
    coefficients,
    lessons: lessons.map((l) => ({
      ...l,
      series_slugs: bacLessonSeriesList(l.subject_slug),
      examples: parseJson(l.examples_json, []),
      exercises: parseJson(l.exercises_json, []),
      mcq: parseJson(l.mcq_json, []),
    })),
    bacQuestionsCount,
  });
});

app.get('/api/admin/baccalaureate/coefficients', requireAdminPermission('baccalaureate', 'content'), (_req, res) => {
  const series = db.prepare('SELECT * FROM bac_series ORDER BY display_order ASC, id ASC').all();
  const coefficients = db
    .prepare('SELECT * FROM bac_coefficients ORDER BY series_slug ASC, display_order ASC, id ASC')
    .all();
  res.json({ series, coefficients });
});

app.post('/api/admin/baccalaureate/coefficients', requireAdminPermission('baccalaureate', 'content'), (req: AuthenticatedRequest, res) => {
  const { series_slug, subject_slug, subject_name_ar, subject_name_fr, coefficient, max_grade, is_optional } =
    req.body ?? {};
  const cleanSeries = String(series_slug || '').trim();
  const cleanSubj = String(subject_slug || '').trim();
  const cleanAr = String(subject_name_ar || '').trim();
  const cleanFr = String(subject_name_fr || cleanAr).trim();
  const coeffVal = Math.max(0.5, Math.min(20, Number(coefficient || 1)));
  if (!cleanSeries || !cleanSubj || !cleanAr) {
    res.status(400).json({ error: 'Series, subject slug, and Arabic subject name are required.' });
    return;
  }
  const nextOrder =
    (
      db.prepare('SELECT COUNT(*) as c FROM bac_coefficients WHERE series_slug = ?').get(cleanSeries) as {
        c: number;
      }
    ).c + 1;
  const info = db
    .prepare(
      `INSERT INTO bac_coefficients (series_slug, subject_slug, subject_name_ar, subject_name_fr, coefficient, max_grade, is_optional, display_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(series_slug, subject_slug) DO UPDATE SET
         subject_name_ar = excluded.subject_name_ar,
         subject_name_fr = excluded.subject_name_fr,
         coefficient = excluded.coefficient,
         max_grade = excluded.max_grade,
         is_optional = excluded.is_optional`
    )
    .run(
      cleanSeries,
      cleanSubj,
      cleanAr,
      cleanFr,
      coeffVal,
      Math.max(10, Number(max_grade || 20)),
      is_optional ? 1 : 0,
      nextOrder
    );
  logAudit(req.authUser!.userId, req.authUser!.email, 'UPSERT_BAC_COEFF', 'bac_coefficients', `${cleanSeries}:${cleanSubj}`);
  res.status(201).json({ ok: true, id: Number(info.lastInsertRowid) });
});

app.put('/api/admin/baccalaureate/coefficients/:id', requireAdminPermission('baccalaureate', 'content'), (req: AuthenticatedRequest, res) => {
  const id = Number(req.params.id);
  const { subject_name_ar, subject_name_fr, coefficient, max_grade, is_optional } = req.body ?? {};
  const existing = db.prepare('SELECT * FROM bac_coefficients WHERE id = ?').get(id) as any;
  if (!existing) {
    res.status(404).json({ error: 'Coefficient entry not found.' });
    return;
  }
  db.prepare(
    `UPDATE bac_coefficients
     SET subject_name_ar = COALESCE(?, subject_name_ar),
         subject_name_fr = COALESCE(?, subject_name_fr),
         coefficient = COALESCE(?, coefficient),
         max_grade = COALESCE(?, max_grade),
         is_optional = COALESCE(?, is_optional)
     WHERE id = ?`
  ).run(
    subject_name_ar ? String(subject_name_ar).trim() : null,
    subject_name_fr ? String(subject_name_fr).trim() : null,
    coefficient !== undefined ? Math.max(0.5, Math.min(20, Number(coefficient))) : null,
    max_grade !== undefined ? Math.max(10, Number(max_grade)) : null,
    is_optional !== undefined ? (is_optional ? 1 : 0) : null,
    id
  );
  logAudit(req.authUser!.userId, req.authUser!.email, 'UPDATE_BAC_COEFF', 'bac_coefficients', id);
  res.json({ ok: true });
});

app.delete('/api/admin/baccalaureate/coefficients/:id', requireAdminPermission('baccalaureate', 'content'), (req: AuthenticatedRequest, res) => {
  const id = Number(req.params.id);
  db.prepare('DELETE FROM bac_coefficients WHERE id = ?').run(id);
  logAudit(req.authUser!.userId, req.authUser!.email, 'DELETE_BAC_COEFF', 'bac_coefficients', id);
  res.json({ ok: true });
});

// User-Isolated Issue / Bug Reporting System
app.post('/api/reports', requireAuth, (req: AuthenticatedRequest, res) => {
  const { reportType, reason, description, screenshotDataUrl } = req.body ?? {};
  const cleanType = ['bug', 'content_error', 'payment_issue', 'account', 'suggestion'].includes(String(reportType || ''))
    ? String(reportType)
    : 'bug';
  const cleanReason = String(reason || '').trim().slice(0, 180);
  const cleanDesc = String(description || '').trim();
  if (cleanDesc.length < 8) {
    res.status(400).json({ error: 'يرجى كتابة وصف واضح للمشكلة (8 أحرف على الأقل).' });
    return;
  }

  let safeShot = '';
  if (typeof screenshotDataUrl === 'string' && screenshotDataUrl.trim()) {
    const validImg = /^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=\s]+$/i.test(screenshotDataUrl.trim());
    if (!validImg || screenshotDataUrl.length > 950_000) {
      res.status(400).json({ error: 'صورة المشكلة غير صالحة أو يتجاوز حجمها الحد المسموح (900 كيلوبايت).' });
      return;
    }
    safeShot = screenshotDataUrl.trim();
  }

  const uRow = db
    .prepare('SELECT name, email FROM users WHERE id = ?')
    .get(req.authUser!.userId) as { name?: string; email?: string } | undefined;

  const info = db
    .prepare(
      `INSERT INTO issue_reports (user_id, firebase_uid, user_name, user_email, report_type, reason, description, screenshot_data_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      req.authUser!.userId,
      req.authUser!.firebaseUid || '',
      uRow?.name || req.authUser!.email.split('@')[0],
      uRow?.email || req.authUser!.email,
      cleanType,
      cleanReason || cleanType,
      cleanDesc.slice(0, 4000),
      safeShot
    );

  const created = db
    .prepare(
      'SELECT id, user_id, report_type, reason, description, status, admin_reply, admin_action, created_at, updated_at FROM issue_reports WHERE id = ?'
    )
    .get(Number(info.lastInsertRowid));
  res.status(201).json({ ok: true, report: created });
});

app.get('/api/reports/mine', requireAuth, (req: AuthenticatedRequest, res) => {
  const reports = db
    .prepare(
      `SELECT id, report_type, reason, description,
              CASE WHEN screenshot_data_url != '' THEN 1 ELSE 0 END as has_screenshot,
              status, admin_reply, admin_action, created_at, updated_at
       FROM issue_reports
       WHERE user_id = ?
       ORDER BY id DESC LIMIT 40`
    )
    .all(req.authUser!.userId);
  res.json({ reports });
});

app.get('/api/admin/reports', requireAdminPermission('reports'), (req, res) => {
  const statusFilter = String(req.query.status || 'all');
  const where = statusFilter !== 'all' ? 'WHERE status = ?' : '';
  const reports = db
    .prepare(`SELECT * FROM issue_reports ${where} ORDER BY CASE WHEN status = 'open' THEN 0 ELSE 1 END, id DESC LIMIT 120`)
    .all(...(statusFilter !== 'all' ? [statusFilter] : []));
  res.json({ reports });
});

app.patch('/api/admin/reports/:id', requireAdminPermission('reports'), (req: AuthenticatedRequest, res) => {
  const id = Number(req.params.id);
  const { status, adminReply, adminAction } = req.body ?? {};
  const row = db.prepare('SELECT * FROM issue_reports WHERE id = ?').get(id) as any;
  if (!row) {
    res.status(404).json({ error: 'Report not found.' });
    return;
  }
  const cleanStatus = ['open', 'in_review', 'resolved', 'closed'].includes(String(status || ''))
    ? String(status)
    : row.status;
  const cleanReply = String(adminReply ?? row.admin_reply ?? '').trim().slice(0, 2000);
  const cleanAction = String(adminAction ?? row.admin_action ?? '').trim().slice(0, 300);

  db.prepare(
    `UPDATE issue_reports
     SET status = ?, admin_reply = ?, admin_action = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(cleanStatus, cleanReply, cleanAction, id);

  if (row.user_id && cleanReply) {
    db.prepare(
      'INSERT INTO notifications (user_id, title_ar, title_fr, body_ar, body_fr, type) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(
      row.user_id,
      `تحديث حول بلاغك رقم #${id}`,
      `Mise à jour concernant votre signalement #${id}`,
      `الحالة: ${cleanStatus}. رد الإدارة: ${cleanReply}`,
      `Statut : ${cleanStatus}. Réponse : ${cleanReply}`,
      'info'
    );
  }
  logAudit(req.authUser!.userId, req.authUser!.email, 'UPDATE_ISSUE_REPORT', 'issue_reports', id, `status=${cleanStatus}`);
  res.json({ ok: true });
});

// =====================================================================
// BROADCAST-GRADE 3-VOICE AUDIO TTS PIPELINE (GEMINI TTS + CONTEXTUAL TASHKEEL)
// =====================================================================
export type VoiceProfileId = 'voice1' | 'voice2' | 'voice3';

const VOICE_PROFILES: Record<
  VoiceProfileId,
  {
    id: VoiceProfileId;
    label_ar: string;
    label_fr: string;
    label_en: string;
    description_ar: string;
    description_fr: string;
    geminiVoice: 'Charon' | 'Kore' | 'Zephyr';
    ffmpegFilter: string;
  }
> = {
  voice1: {
    id: 'voice1',
    label_ar: 'الأستاذ الوقور (نبرة إذاعية عميقة)',
    label_fr: 'Voix Professeur (grave et posée)',
    label_en: 'Professor Voice (Deep Broadcast)',
    description_ar: 'صوت تعليمي رصين بدرجة منخفضة وتشكيل نطقي متزن',
    description_fr: 'Timbre profond et posé avec articulation nette',
    geminiVoice: 'Charon',
    ffmpegFilter: 'rubberband=pitch=0.88:tempo=0.96:formant=shifted,equalizer=f=180:t=q:w=1.2:g=3,equalizer=f=2400:t=q:w=1.2:g=2',
  },
  voice2: {
    id: 'voice2',
    label_ar: 'القارئ القياسي (نبرة إعلامية متوازنة)',
    label_fr: 'Voix Standard (équilibrée)',
    label_en: 'Standard Narrator (Balanced Clear)',
    description_ar: 'النطق القياسي الواضح والمعتدل للأسئلة والدروس',
    description_fr: 'Voix naturelle claire et équilibrée',
    geminiVoice: 'Kore',
    ffmpegFilter: 'equalizer=f=2800:t=q:w=1.2:g=2',
  },
  voice3: {
    id: 'voice3',
    label_ar: 'المُحاور المشرق (نبرة حيوية)',
    label_fr: 'Voix Claire (dynamique)',
    label_en: 'Clear Host (Dynamic Warm)',
    description_ar: 'صوت مشرق وحيوي بدرجة مرتفعة قليلاً للمراجعة السريعة',
    description_fr: 'Timbre clair et dynamique idéal pour la révision',
    geminiVoice: 'Zephyr',
    ffmpegFilter: 'rubberband=pitch=1.10:tempo=1.01:formant=shifted,equalizer=f=3200:t=q:w=1.2:g=2.5',
  },
};

const TTS_CACHE_DIR = path.resolve(process.cwd(), 'data', 'tts_cache');
if (!fs.existsSync(TTS_CACHE_DIR)) {
  fs.mkdirSync(TTS_CACHE_DIR, { recursive: true });
}
const ttsMemoryCache = new Map<string, Buffer>();

function convertBufferToMp3WithFfmpeg(inputBuf: Buffer, filterArg?: string): Promise<Buffer> {
  const args = ['-hide_banner', '-loglevel', 'error', '-i', 'pipe:0'];
  if (filterArg) {
    args.push('-af', filterArg);
  }
  args.push('-f', 'mp3', '-b:a', '96k', 'pipe:1');

  return new Promise((resolve) => {
    const proc = spawn('ffmpeg', args, { stdio: ['pipe', 'pipe', 'pipe'] });
    const chunks: Buffer[] = [];
    let settled = false;
    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        try {
          proc.kill('SIGKILL');
        } catch {
          // ignore
        }
        resolve(inputBuf);
      }
    }, 8000);

    proc.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
    proc.on('error', () => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        resolve(inputBuf);
      }
    });
    proc.on('close', (code) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        const out = Buffer.concat(chunks);
        if (code === 0 && out.length > 256) {
          resolve(out);
        } else {
          resolve(inputBuf);
        }
      }
    });
    proc.stdin.end(inputBuf);
  });
}

async function synthesizeWithGeminiTts(
  text: string,
  lang: 'ar' | 'fr' | 'en',
  voice: VoiceProfileId
): Promise<Buffer | null> {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) return null;

  const profile = VOICE_PROFILES[voice] || VOICE_PROFILES.voice2;
  const stylePrompt =
    lang === 'ar'
      ? 'Read this Modern Standard Arabic educational text with natural human prosody, crisp classical articulation, balanced pacing, and warm broadcast-anchor clarity.'
      : lang === 'fr'
        ? 'Read this French educational content with natural native clarity, poised pacing, and studio broadcast articulation.'
        : 'Read this English educational content with natural native clarity, poised pacing, and studio broadcast articulation.';

  try {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash-lite-tts',
      contents: text,
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: profile.geminiVoice,
            },
          },
        },
        speechMetadata: {
          style: stylePrompt,
        },
      } as any,
    });
    const b64 = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!b64) return null;
    const wavBuf = Buffer.from(b64, 'base64');
    if (wavBuf.length < 128) return null;
    // Transcode Gemini WAV (24kHz mono 16-bit) cleanly to 96k MP3 for fast browser streaming
    const mp3Buf = await convertBufferToMp3WithFfmpeg(wavBuf);
    return mp3Buf.length > 256 ? mp3Buf : wavBuf;
  } catch (err) {
    console.warn('Gemini TTS fallback triggered:', (err as Error)?.message || err);
    return null;
  }
}

app.get('/api/audio/voices', (_req, res) => {
  res.json({
    voices: Object.values(VOICE_PROFILES).map((v) => ({
      id: v.id,
      label_ar: v.label_ar,
      label_fr: v.label_fr,
      label_en: v.label_en,
      description_ar: v.description_ar,
      description_fr: v.description_fr,
    })),
  });
});

app.get('/api/tts', async (req, res) => {
  const rawLang = String(req.query.lang || 'ar').toLowerCase();
  const lang: 'ar' | 'fr' | 'en' = rawLang === 'fr' ? 'fr' : rawLang === 'en' ? 'en' : 'ar';
  const rawVoice = String(req.query.voice || 'voice2').toLowerCase();
  const voice: VoiceProfileId = rawVoice === 'voice1' || rawVoice === 'voice3' ? rawVoice : 'voice2';
  const rawText = String(req.query.text || '').replace(/\s+/g, ' ').trim();

  if (!rawText) {
    res.status(400).json({ error: 'Text is required.' });
    return;
  }

  const clippedRaw = rawText.slice(0, 600);
  const { preparedText, dictVersion } = prepareSpeechText(db, clippedRaw, lang);
  let synthText = (preparedText || clippedRaw).slice(0, 750);
  if (lang === 'ar' && (process.env.GEMINI_API_KEY || '').trim()) {
    synthText = (await enrichArabicTashkeelContextuallyAsync(synthText)).slice(0, 900);
  }

  const cacheHash = crypto
    .createHash('sha1')
    .update(`v2|${lang}|${voice}|${dictVersion}|${synthText}`)
    .digest('hex');

  const sendAudio = (buf: Buffer, engineLabel: string) => {
    const isWav = buf.length >= 12 && buf.subarray(0, 4).toString('ascii') === 'RIFF';
    res.setHeader('Content-Type', isWav ? 'audio/wav' : 'audio/mpeg');
    res.setHeader('Content-Length', buf.length);
    res.setHeader('X-Voice-Profile', voice);
    res.setHeader('X-Dict-Version', dictVersion);
    res.setHeader('X-TTS-Engine', engineLabel);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(buf);
  };

  const memCached = ttsMemoryCache.get(cacheHash);
  if (memCached) {
    sendAudio(memCached, 'cache');
    return;
  }

  const diskPath = path.join(TTS_CACHE_DIR, `${cacheHash}.mp3`);
  if (fs.existsSync(diskPath)) {
    try {
      const diskBuf = fs.readFileSync(diskPath);
      if (diskBuf.length > 256) {
        if (ttsMemoryCache.size >= 400) {
          const oldest = ttsMemoryCache.keys().next().value;
          if (oldest) ttsMemoryCache.delete(oldest);
        }
        ttsMemoryCache.set(cacheHash, diskBuf);
        sendAudio(diskBuf, 'disk-cache');
        return;
      }
    } catch {
      // regenerate
    }
  }

  try {
    let finalBuf = await synthesizeWithGeminiTts(synthText, lang, voice);
    let engineUsed = 'gemini-3.8-flash-lite-tts';

    if (!finalBuf) {
      // Fallback upstream TTS with contextual Tashkeel & ffmpeg broadcast shaping
      const upstreamSnippet = synthText.slice(0, 260);
      const upstreamUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(
        upstreamSnippet
      )}&tl=${lang}&client=tw-ob`;
      const upstream = await fetch(upstreamUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
          Referer: 'https://translate.google.com/',
        },
        signal: AbortSignal.timeout(8000),
      });

      if (!upstream.ok) {
        res.status(502).json({ error: 'TTS service temporarily unavailable.' });
        return;
      }

      const baseBuf = Buffer.from(await upstream.arrayBuffer());
      if (baseBuf.length < 128) {
        res.status(502).json({ error: 'Empty TTS audio received.' });
        return;
      }

      const profile = VOICE_PROFILES[voice] || VOICE_PROFILES.voice2;
      finalBuf = await convertBufferToMp3WithFfmpeg(baseBuf, profile.ffmpegFilter);
      engineUsed = 'contextual-fallback';
    }

    if (ttsMemoryCache.size >= 400) {
      const oldestKey = ttsMemoryCache.keys().next().value;
      if (oldestKey) ttsMemoryCache.delete(oldestKey);
    }
    ttsMemoryCache.set(cacheHash, finalBuf);
    try {
      fs.writeFileSync(diskPath, finalBuf);
    } catch {
      // ignore disk error
    }

    sendAudio(finalBuf, engineUsed);
  } catch {
    res.status(502).json({ error: 'Failed to synthesize audio.' });
  }
});

// =====================================================================
// OPTIONAL ELEVENLABS STUDIO TTS INTEGRATION (SECRET-SAFE SERVER PROXY)
// =====================================================================
interface ElevenLabsConfig {
  enabled: boolean;
  freeTierAllowed: boolean;
  voiceIdAr: string;
  voiceIdFr: string;
  modelId: string;
}

function getElevenLabsConfig(): ElevenLabsConfig {
  const row = db.prepare("SELECT value FROM app_settings WHERE key = 'elevenlabs_config'").get() as
    | { value?: string }
    | undefined;
  return parseJson<ElevenLabsConfig>(row?.value, {
    enabled: false,
    freeTierAllowed: false,
    voiceIdAr: 'pNInz6obpgDQGcFmaJgB',
    voiceIdFr: '21m00Tcm4TlvDq8ikWAM',
    modelId: 'eleven_multilingual_v2',
  });
}

function resolveElevenLabsApiKey(): string {
  const envKey = (process.env.ELEVENLABS_API_KEY || '').trim();
  if (envKey) return envKey;
  const row = db.prepare("SELECT value FROM app_settings WHERE key = 'elevenlabs_api_key_secret'").get() as
    | { value?: string }
    | undefined;
  return String(row?.value || '').trim();
}

app.get('/api/audio/elevenlabs/status', (req: AuthenticatedRequest, res) => {
  const cfg = getElevenLabsConfig();
  const hasKey = Boolean(resolveElevenLabsApiKey());
  const tier = getEffectivePlanTier(req.authUser);
  const tierPermitted = Boolean(cfg.enabled && hasKey && (tier === 'paid' || cfg.freeTierAllowed));
  res.json({
    enabled: cfg.enabled,
    configured: hasKey,
    freeTierAllowed: cfg.freeTierAllowed,
    voiceIdAr: cfg.voiceIdAr,
    voiceIdFr: cfg.voiceIdFr,
    tierPermitted,
  });
});

app.get('/api/admin/elevenlabs', requireAdminPermission('settings'), (_req, res) => {
  const cfg = getElevenLabsConfig();
  const key = resolveElevenLabsApiKey();
  const source = (process.env.ELEVENLABS_API_KEY || '').trim() ? 'env' : key ? 'db' : 'none';
  const maskedHint = key.length >= 8 ? `${key.slice(0, 4)}••••${key.slice(-4)}` : key ? '••••' : '';
  res.json({
    ...cfg,
    configured: Boolean(key),
    source,
    maskedHint,
  });
});

app.put('/api/admin/elevenlabs', requireAdminPermission('settings'), (req: AuthenticatedRequest, res) => {
  const { enabled, freeTierAllowed, voiceIdAr, voiceIdFr, modelId, apiKey, clearApiKey } = req.body ?? {};
  const prev = getElevenLabsConfig();
  const nextCfg: ElevenLabsConfig = {
    enabled: typeof enabled === 'boolean' ? enabled : prev.enabled,
    freeTierAllowed: typeof freeTierAllowed === 'boolean' ? freeTierAllowed : prev.freeTierAllowed,
    voiceIdAr: String(voiceIdAr || prev.voiceIdAr || 'pNInz6obpgDQGcFmaJgB').trim().slice(0, 120),
    voiceIdFr: String(voiceIdFr || prev.voiceIdFr || '21m00Tcm4TlvDq8ikWAM').trim().slice(0, 120),
    modelId: String(modelId || prev.modelId || 'eleven_multilingual_v2').trim().slice(0, 120),
  };

  db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)').run(
    'elevenlabs_config',
    JSON.stringify(nextCfg)
  );

  if (clearApiKey === true) {
    db.prepare("DELETE FROM app_settings WHERE key = 'elevenlabs_api_key_secret'").run();
  } else if (typeof apiKey === 'string' && apiKey.trim()) {
    db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)').run(
      'elevenlabs_api_key_secret',
      apiKey.trim()
    );
  }

  logAudit(req.authUser!.userId, req.authUser!.email, 'UPDATE_ELEVENLABS_CONFIG', 'app_settings', 'elevenlabs');
  const key = resolveElevenLabsApiKey();
  res.json({
    ok: true,
    ...nextCfg,
    configured: Boolean(key),
    maskedHint: key.length >= 8 ? `${key.slice(0, 4)}••••${key.slice(-4)}` : key ? '••••' : '',
  });
});

app.post('/api/tts/elevenlabs', async (req: AuthenticatedRequest, res) => {
  const cfg = getElevenLabsConfig();
  const apiKey = resolveElevenLabsApiKey();
  if (!cfg.enabled || !apiKey) {
    res.status(503).json({
      code: 'ELEVENLABS_UNAVAILABLE',
      error: 'خدمة الصوت الاحترافي ElevenLabs غير مفعلة حالياً.',
    });
    return;
  }

  const tier = getEffectivePlanTier(req.authUser);
  if (tier === 'free' && !cfg.freeTierAllowed) {
    res.status(403).json({
      code: 'PLAN_UPGRADE_REQUIRED',
      error: 'الأصوات فائقة الجودة (ElevenLabs) مخصصة للمشتركين في الباقات المدفوعة.',
    });
    return;
  }

  const { text, lang, voiceId } = req.body ?? {};
  const rawText = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 1200);
  if (!rawText) {
    res.status(400).json({ error: 'Text is required.' });
    return;
  }

  const cleanLang: 'ar' | 'fr' | 'en' = lang === 'fr' ? 'fr' : lang === 'en' ? 'en' : 'ar';
  const { preparedText } = prepareSpeechText(db, rawText, cleanLang);
  const chosenVoiceId = String(
    voiceId || (cleanLang === 'fr' ? cfg.voiceIdFr : cfg.voiceIdAr) || 'pNInz6obpgDQGcFmaJgB'
  ).trim();

  const cacheHash = crypto
    .createHash('sha1')
    .update(`el|${cleanLang}|${chosenVoiceId}|${preparedText}`)
    .digest('hex');
  const memCached = ttsMemoryCache.get(cacheHash);
  if (memCached) {
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('X-TTS-Engine', 'elevenlabs-cache');
    res.send(memCached);
    return;
  }

  try {
    const elResp = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(chosenVoiceId)}`, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        text: preparedText,
        model_id: cfg.modelId || 'eleven_multilingual_v2',
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!elResp.ok) {
      res.status(502).json({ error: 'تعذر توليد الصوت عبر ElevenLabs حالياً.' });
      return;
    }

    const buf = Buffer.from(await elResp.arrayBuffer());
    if (buf.length < 128) {
      res.status(502).json({ error: 'استجابة الصوت من ElevenLabs غير صالحة.' });
      return;
    }

    if (ttsMemoryCache.size >= 400) {
      const oldestKey = ttsMemoryCache.keys().next().value;
      if (oldestKey) ttsMemoryCache.delete(oldestKey);
    }
    ttsMemoryCache.set(cacheHash, buf);
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('X-TTS-Engine', 'elevenlabs');
    res.send(buf);
  } catch {
    res.status(502).json({ error: 'فشل الاتصال بخدمة ElevenLabs.' });
  }
});

// Admin Pronunciation Dictionary CRUD
app.get('/api/admin/pronunciation-dictionary', requireAdminPermission('settings', 'content'), (_req, res) => {
  const rules = db.prepare('SELECT * FROM pronunciation_dictionary ORDER BY id DESC').all();
  res.json({ rules });
});

app.post('/api/admin/pronunciation-dictionary', requireAdminPermission('settings', 'content'), (req: AuthenticatedRequest, res) => {
  const { pattern, replacement, lang, match_type, is_regex, enabled, active, notes } = req.body ?? {};
  const cleanPat = String(pattern || '').trim();
  const cleanRep = String(replacement || '').trim();
  if (!cleanPat || !cleanRep) {
    res.status(400).json({ error: 'Pattern and replacement are required.' });
    return;
  }
  const safeLang = ['ar', 'fr', 'all'].includes(lang) ? lang : 'ar';
  const safeMatchType = ['word', 'exact', 'regex'].includes(match_type)
    ? match_type
    : is_regex
      ? 'regex'
      : 'word';
  const isRxFlag = safeMatchType === 'regex' || is_regex ? 1 : 0;
  const activeFlag = active === false || active === 0 || enabled === false || enabled === 0 ? 0 : 1;

  try {
    const r = db
      .prepare(
        'INSERT INTO pronunciation_dictionary (pattern, replacement, lang, match_type, is_regex, enabled, active, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .run(cleanPat, cleanRep, safeLang, safeMatchType, isRxFlag, activeFlag, activeFlag, String(notes || '').trim());
    ttsMemoryCache.clear();
    logAudit(req.authUser!.userId, req.authUser!.email, 'CREATE_PRONUNCIATION_RULE', 'pronunciation_dictionary', Number(r.lastInsertRowid), `${cleanPat} => ${cleanRep}`);
    res.status(201).json({ id: Number(r.lastInsertRowid) });
  } catch {
    res.status(409).json({ error: 'A pronunciation rule for this pattern already exists.' });
  }
});

app.put('/api/admin/pronunciation-dictionary/:id', requireAdminPermission('settings', 'content'), (req: AuthenticatedRequest, res) => {
  const id = Number(req.params.id);
  const { pattern, replacement, lang, match_type, is_regex, enabled, active, notes } = req.body ?? {};
  const cleanPat = String(pattern || '').trim();
  const cleanRep = String(replacement || '').trim();
  if (!cleanPat || !cleanRep) {
    res.status(400).json({ error: 'Pattern and replacement are required.' });
    return;
  }
  const safeLang = ['ar', 'fr', 'all'].includes(lang) ? lang : 'ar';
  const safeMatchType = ['word', 'exact', 'regex'].includes(match_type)
    ? match_type
    : is_regex
      ? 'regex'
      : 'word';
  const isRxFlag = safeMatchType === 'regex' || is_regex ? 1 : 0;
  const resolvedActive = active !== undefined ? active : enabled;
  const activeFlag = resolvedActive === false || resolvedActive === 0 ? 0 : 1;

  db.prepare(
    `UPDATE pronunciation_dictionary
     SET pattern = ?, replacement = ?, lang = ?, match_type = ?, is_regex = ?, enabled = ?, active = ?, notes = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(cleanPat, cleanRep, safeLang, safeMatchType, isRxFlag, activeFlag, activeFlag, String(notes || '').trim(), id);
  ttsMemoryCache.clear();
  logAudit(req.authUser!.userId, req.authUser!.email, 'UPDATE_PRONUNCIATION_RULE', 'pronunciation_dictionary', id, `${cleanPat} => ${cleanRep}`);
  res.json({ ok: true });
});

app.delete('/api/admin/pronunciation-dictionary/:id', requireAdminPermission('settings', 'content'), (req: AuthenticatedRequest, res) => {
  const id = Number(req.params.id);
  db.prepare('DELETE FROM pronunciation_dictionary WHERE id = ?').run(id);
  ttsMemoryCache.clear();
  logAudit(req.authUser!.userId, req.authUser!.email, 'DELETE_PRONUNCIATION_RULE', 'pronunciation_dictionary', id);
  res.json({ ok: true });
});

// =====================================================================
// CONTACT MESSAGES & REFERRALS / POINTS SYSTEM (SERVER-ENFORCED)
// =====================================================================
app.post('/api/contact', (req: AuthenticatedRequest, res) => {
  const { name, email, phone, subject, category, message } = req.body ?? {};
  const cleanName = String(name || '').trim().slice(0, 120);
  const cleanEmail = String(email || '').trim().toLowerCase().slice(0, 160);
  const cleanPhone = String(phone || '').trim().slice(0, 40);
  const cleanSubject = String(subject || '').trim().slice(0, 180);
  const cleanCategory = ['general', 'subscriptions', 'technical', 'baccalaureate', 'partnership'].includes(
    String(category)
  )
    ? String(category)
    : 'general';
  const cleanMessage = String(message || '').trim().slice(0, 4000);

  if (cleanName.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail) || cleanSubject.length < 3 || cleanMessage.length < 10) {
    res.status(400).json({
      error: 'يرجى تعبئة الاسم والبريد الإلكتروني الصحيح وعنوان الرسالة ونصاً لا يقل عن 10 أحرف.',
    });
    return;
  }

  const clientIp = getClientIp(req);
  const ipKey = `contact_ip:${clientIp}`;
  const rl = checkRateLimitEntry(ipKey, 10, 15 * 60 * 1000, 15 * 1000);
  if (!rl.allowed) {
    res.status(429).json({
      error: 'تم إرسال عدة رسائل مؤخراً. يرجى الانتظار قليلاً قبل إرسال رسالة أخرى.',
    });
    return;
  }
  recordRateLimitHit(ipKey, 15 * 60 * 1000);

  const info = db
    .prepare(
      `INSERT INTO contact_messages (user_id, name, email, phone, subject, category, message, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'unread')`
    )
    .run(req.authUser?.userId || null, cleanName, cleanEmail, cleanPhone, cleanSubject, cleanCategory, cleanMessage);

  res.status(201).json({
    ok: true,
    id: Number(info.lastInsertRowid),
    message: 'تم استلام رسالتك بنجاح وسيتواصل معك فريق منصة تدريبي قريباً.',
  });
});

app.get('/api/admin/contact-messages', requireAdminPermission('reports', 'notifications'), (_req, res) => {
  const messages = db
    .prepare('SELECT * FROM contact_messages ORDER BY id DESC LIMIT 200')
    .all();
  res.json({ messages });
});

app.patch('/api/admin/contact-messages/:id', requireAdminPermission('reports', 'notifications'), (req: AuthenticatedRequest, res) => {
  const msgId = Number(req.params.id);
  const { status, admin_note } = req.body ?? {};
  const validStatus = ['unread', 'read', 'replied', 'archived'].includes(status) ? status : 'read';
  const note = String(admin_note ?? '').trim().slice(0, 2000);

  const info = db
    .prepare(
      `UPDATE contact_messages SET status = ?, admin_note = ?, updated_at = datetime('now') WHERE id = ?`
    )
    .run(validStatus, note, msgId);
  if (info.changes === 0) {
    res.status(404).json({ error: 'Contact message not found' });
    return;
  }
  logAudit(req.authUser!.userId, req.authUser!.email, 'UPDATE_CONTACT_MESSAGE', 'contact_messages', msgId, validStatus);
  res.json({ ok: true });
});

app.get('/api/referrals/validate', (req, res) => {
  const code = String(req.query.code || '').trim().toUpperCase();
  if (!code) {
    res.json({ valid: false });
    return;
  }
  const settings = getReferralSettingsRow();
  if (!settings.enabled) {
    res.json({ valid: false, reason: 'disabled' });
    return;
  }
  const owner = db
    .prepare('SELECT id, name, referral_code FROM users WHERE upper(referral_code) = ? LIMIT 1')
    .get(code) as { id: number; name: string; referral_code: string } | undefined;
  if (!owner) {
    res.json({ valid: false });
    return;
  }
  res.json({
    valid: true,
    code: owner.referral_code,
    referrerName: owner.name,
    pointsPerReferral: Number(settings.points_per_referral || 20),
    welcomeBonusPoints: Number(settings.welcome_bonus_points || 0),
  });
});

app.post('/api/referrals/claim', requireAuth, (req: AuthenticatedRequest, res) => {
  const userId = req.authUser!.userId;
  const rawCode = String(req.body?.code || '').trim().toUpperCase();
  if (!rawCode) {
    res.status(400).json({ error: 'كود الإحالة مطلوب.' });
    return;
  }
  const settings = getReferralSettingsRow();
  if (!settings.enabled) {
    res.status(400).json({ error: 'نظام الإحالات متوقف حالياً من الإدارة.' });
    return;
  }

  const referredUser = db.prepare('SELECT id, email, referred_by_user_id FROM users WHERE id = ?').get(userId) as any;
  if (!referredUser) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  if (referredUser.referred_by_user_id) {
    res.status(409).json({ error: 'تم تسجيل إحالة لهذا الحساب مسبقاً.' });
    return;
  }

  const existingLog = db.prepare('SELECT id FROM referral_logs WHERE referred_user_id = ?').get(userId);
  if (existingLog) {
    res.status(409).json({ error: 'تم تسجيل كود إحالة لهذا الحساب مسبقاً.' });
    return;
  }

  const referrer = db
    .prepare('SELECT id, email, referral_code FROM users WHERE upper(referral_code) = ? LIMIT 1')
    .get(rawCode) as { id: number; email: string; referral_code: string } | undefined;

  if (!referrer) {
    res.status(404).json({ error: 'كود الإحالة غير صالح أو غير موجود.' });
    return;
  }

  if (referrer.id === userId || referrer.email.toLowerCase() === referredUser.email.toLowerCase()) {
    res.status(400).json({ error: 'لا يمكن استخدام كود الإحالة الخاص بك لنفس حسابك.' });
    return;
  }

  db.transaction(() => {
    db.prepare('UPDATE users SET referred_by_user_id = ? WHERE id = ?').run(referrer.id, userId);
    db.prepare(
      `INSERT INTO referral_logs (referrer_user_id, referred_user_id, referral_code, status, points_awarded, reason)
       VALUES (?, ?, ?, 'pending_verification', 0, 'في انتظار تأكيد البريد الإلكتروني')`
    ).run(referrer.id, userId, referrer.referral_code);
  })();

  if (req.authUser?.emailVerified) {
    settlePendingReferralIfVerified(userId, true);
  }

  res.json({
    ok: true,
    verifiedRewarded: Boolean(req.authUser?.emailVerified),
    message: req.authUser?.emailVerified
      ? 'تم تفعيل الإحالة واحتساب النقاط بنجاح.'
      : 'تم ربط كود الإحالة بنجاح، وستُمنح النقاط تلقائياً فور تأكيد بريدك الإلكتروني.',
  });
});

app.get('/api/referrals/me', requireAuth, (req: AuthenticatedRequest, res) => {
  const userId = req.authUser!.userId;
  if (req.authUser?.emailVerified) {
    settlePendingReferralIfVerified(userId, true);
  }
  let user = db.prepare('SELECT id, referral_code, referral_points FROM users WHERE id = ?').get(userId) as any;
  if (user && (!user.referral_code || !String(user.referral_code).trim())) {
    const freshCode = generateUniqueReferralCode(db);
    db.prepare('UPDATE users SET referral_code = ? WHERE id = ?').run(freshCode, userId);
    user = { ...user, referral_code: freshCode };
  }
  const settings = getReferralSettingsRow();
  const logs = db
    .prepare(
      `SELECT rl.*, u.name as referred_name
       FROM referral_logs rl
       LEFT JOIN users u ON u.id = rl.referred_user_id
       WHERE rl.referrer_user_id = ?
       ORDER BY rl.id DESC
       LIMIT 50`
    )
    .all(userId) as any[];
  const rewards = db
    .prepare('SELECT * FROM referral_rewards WHERE user_id = ? ORDER BY id DESC LIMIT 20')
    .all(userId) as any[];

  const counts = db
    .prepare(
      `SELECT
         COUNT(*) as invitedCount,
         SUM(CASE WHEN status = 'verified_rewarded' THEN 1 ELSE 0 END) as verifiedCount,
         SUM(CASE WHEN status = 'pending_verification' THEN 1 ELSE 0 END) as pendingCount
       FROM referral_logs WHERE referrer_user_id = ?`
    )
    .get(userId) as { invitedCount: number; verifiedCount: number; pendingCount: number };

  const currentPts = Number(user?.referral_points || 0);
  const threshold = Math.max(10, Number(settings.reward_threshold_points || 1000));
  const rewardsUsed = rewards.length;
  const canRedeem = Boolean(settings.enabled) && currentPts >= threshold && rewardsUsed < Number(settings.max_rewards_per_user || 12);
  const referralCode = String(user?.referral_code || '');

  res.json({
    referralCode,
    inviteUrl: referralCode ? `${PUBLIC_APP_ORIGIN}/?ref=${encodeURIComponent(referralCode)}` : PUBLIC_APP_ORIGIN,
    referralPoints: currentPts,
    settings,
    invitedCount: Number(counts?.invitedCount || 0),
    verifiedCount: Number(counts?.verifiedCount || 0),
    pendingCount: Number(counts?.pendingCount || 0),
    canRedeem,
    remainingPointsToReward: Math.max(0, threshold - currentPts),
    recentLogs: logs.map((l) => ({
      ...l,
      referred_name: l.referred_name || 'مستخدم مسجل',
    })),
    rewards,
  });
});

app.post('/api/referrals/redeem', requireAuth, (req: AuthenticatedRequest, res) => {
  const userId = req.authUser!.userId;
  if (req.authUser?.firebaseUid && !req.authUser.emailVerified) {
    res.status(403).json({ error: 'يرجى تأكيد بريدك الإلكتروني أولاً لاستبدال النقاط.' });
    return;
  }

  const settings = getReferralSettingsRow();
  if (!settings.enabled) {
    res.status(400).json({ error: 'استبدال نقاط الإحالة متوقف حالياً.' });
    return;
  }

  const threshold = Math.max(10, Number(settings.reward_threshold_points || 1000));
  const durationDays = Math.max(1, Number(settings.reward_duration_days || 30));
  const maxRewards = Math.max(1, Number(settings.max_rewards_per_user || 12));

  const user = db.prepare('SELECT id, email, referral_points FROM users WHERE id = ?').get(userId) as any;
  if (!user || Number(user.referral_points || 0) < threshold) {
    res.status(400).json({
      error: `تحتاج إلى ${threshold} نقطة على الأقل للاستبدال باشتراك مجاني لمدة ${durationDays} يوماً.`,
    });
    return;
  }

  const existingRewardsCount = (
    db.prepare('SELECT COUNT(*) as c FROM referral_rewards WHERE user_id = ?').get(userId) as { c: number }
  ).c;
  if (existingRewardsCount >= maxRewards) {
    res.status(400).json({ error: 'بلغت الحد الأقصى المسموح به لاستبدال مكافآت الإحالة.' });
    return;
  }

  const monthlyPlan = db
    .prepare("SELECT id, slug FROM subscription_plans WHERE slug = 'monthly-intensive' LIMIT 1")
    .get() as { id: number; slug: string } | undefined;
  const planId = monthlyPlan?.id || 2;

  const activeSub = getUserActiveSubscription(userId);
  const startBase =
    activeSub && activeSub.expires_at && new Date(activeSub.expires_at).getTime() > Date.now()
      ? new Date(activeSub.expires_at)
      : new Date();
  const nextExpiry = new Date(startBase.getTime() + durationDays * 86400_000).toISOString();

  const tx = db.transaction(() => {
    const deduct = db
      .prepare('UPDATE users SET referral_points = referral_points - ? WHERE id = ? AND referral_points >= ?')
      .run(threshold, userId, threshold);
    if (deduct.changes === 0) return false;

    db.prepare(
      "UPDATE user_subscriptions SET status = 'expired' WHERE user_id = ? AND status = 'active'"
    ).run(userId);
    db.prepare(
      `INSERT INTO user_subscriptions (user_id, plan_id, status, starts_at, expires_at)
       VALUES (?, ?, 'active', datetime('now'), ?)`
    ).run(userId, planId, nextExpiry);

    db.prepare(
      `INSERT INTO referral_rewards (user_id, points_spent, duration_days, plan_slug, status)
       VALUES (?, ?, ?, 'monthly-intensive', 'active')`
    ).run(userId, threshold, durationDays);

    db.prepare(
      `INSERT INTO notifications (user_id, title_ar, title_fr, body_ar, body_fr, type)
       VALUES (?, ?, ?, ?, ?, 'offer')`
    ).run(
      userId,
      `تم تفعيل اشتراكك المجاني لمدة ${durationDays} يوماً`,
      `Votre abonnement gratuit (${durationDays} jours) est activé`,
      `تم استبدال ${threshold} نقطة من برنامج الإحالات بنجاح، واشتراكك الشامل مفعل الآن حتى ${nextExpiry.slice(0, 10)}.`,
      `${threshold} points échangés avec succès : abonnement activé jusqu'au ${nextExpiry.slice(0, 10)}.`
    );
    return true;
  });

  if (!tx()) {
    res.status(409).json({ error: 'رصيد النقاط غير كافٍ لإتمام العملية.' });
    return;
  }

  logAudit(userId, req.authUser!.email, 'REDEEM_REFERRAL_REWARD', 'referral_rewards', userId, `pts=${threshold},days=${durationDays}`);
  const refreshed = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as any;
  res.json({
    ok: true,
    expiresAt: nextExpiry,
    user: sanitizeUser(refreshed),
  });
});

app.get('/api/admin/referrals', requireAdminPermission('subscriptions', 'settings'), (_req, res) => {
  const settings = getReferralSettingsRow();
  const logs = db
    .prepare(
      `SELECT rl.*,
              r1.name as referrer_name, r1.email as referrer_email,
              r2.name as referred_name, r2.email as referred_email
       FROM referral_logs rl
       LEFT JOIN users r1 ON r1.id = rl.referrer_user_id
       LEFT JOIN users r2 ON r2.id = rl.referred_user_id
       ORDER BY rl.id DESC
       LIMIT 200`
    )
    .all();
  const rewards = db
    .prepare(
      `SELECT rr.*, u.name as user_name, u.email as user_email
       FROM referral_rewards rr
       LEFT JOIN users u ON u.id = rr.user_id
       ORDER BY rr.id DESC
       LIMIT 100`
    )
    .all();
  res.json({ settings, logs, rewards });
});

app.put('/api/admin/referral-settings', requireAdminPermission('subscriptions', 'settings'), (req: AuthenticatedRequest, res) => {
  const {
    enabled,
    points_per_referral,
    reward_threshold_points,
    reward_duration_days,
    welcome_bonus_points,
    max_rewards_per_user,
  } = req.body ?? {};
  const nextEnabled = enabled ? 1 : 0;
  const pts = Math.min(500, Math.max(1, Number(points_per_referral || 20)));
  const threshold = Math.min(10000, Math.max(10, Number(reward_threshold_points || 1000)));
  const days = Math.min(365, Math.max(1, Number(reward_duration_days || 30)));
  const welcome = Math.min(500, Math.max(0, Number(welcome_bonus_points || 0)));
  const maxRew = Math.min(100, Math.max(1, Number(max_rewards_per_user || 12)));

  db.prepare(
    `INSERT INTO referral_settings (id, enabled, points_per_referral, reward_threshold_points, reward_duration_days, welcome_bonus_points, max_rewards_per_user, updated_at)
     VALUES (1, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(id) DO UPDATE SET
       enabled = excluded.enabled,
       points_per_referral = excluded.points_per_referral,
       reward_threshold_points = excluded.reward_threshold_points,
       reward_duration_days = excluded.reward_duration_days,
       welcome_bonus_points = excluded.welcome_bonus_points,
       max_rewards_per_user = excluded.max_rewards_per_user,
       updated_at = datetime('now')`
  ).run(nextEnabled, pts, threshold, days, welcome, maxRew);

  logAudit(req.authUser!.userId, req.authUser!.email, 'UPDATE_REFERRAL_SETTINGS', 'referral_settings', 1);
  res.json({ ok: true, settings: getReferralSettingsRow() });
});

// =====================================================================
// ADMIN & EDITOR / TEACHER MANAGEMENT ROUTES (RBAC PROTECTED)
// =====================================================================
app.get('/api/admin/overview', requireAdminPermission('dashboard'), (_req, res) => {
  const usersCount = (db.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number }).c;
  const studentsCount = (
    db.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'student' AND level NOT IN ('teacher', 'professor')").get() as { c: number }
  ).c;
  const teachersCount = (
    db.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'teacher' OR level = 'teacher'").get() as { c: number }
  ).c;
  const professorsCount = (
    db.prepare("SELECT COUNT(*) as c FROM users WHERE level = 'professor'").get() as { c: number }
  ).c;
  const schoolsCount = (
    db.prepare("SELECT COUNT(*) as c FROM schools WHERE status = 'active'").get() as { c: number }
  ).c;
  const pendingSchoolsCount = (
    db.prepare("SELECT COUNT(*) as c FROM schools WHERE status = 'pending'").get() as { c: number }
  ).c;
  const lessonsCount = (db.prepare('SELECT COUNT(*) as c FROM lessons').get() as { c: number }).c;
  const questionsCount = (db.prepare('SELECT COUNT(*) as c FROM questions').get() as { c: number }).c;
  const attemptsCount = (
    db.prepare("SELECT COUNT(*) as c FROM exam_attempts WHERE status = 'submitted'").get() as { c: number }
  ).c;
  const avgScoreRow = db
    .prepare("SELECT AVG(score_20) as avg FROM exam_attempts WHERE status = 'submitted'")
    .get() as { avg: number | null };
  const openTickets = (
    db.prepare("SELECT COUNT(*) as c FROM support_tickets WHERE status = 'open'").get() as { c: number }
  ).c;
  const unreadContactMessages = (
    db.prepare("SELECT COUNT(*) as c FROM contact_messages WHERE status = 'unread'").get() as { c: number }
  ).c;
  const verifiedReferrals = (
    db.prepare("SELECT COUNT(*) as c FROM referral_logs WHERE status = 'verified_rewarded'").get() as { c: number }
  ).c;
  const pendingVerificationBadges = (
    db.prepare("SELECT COUNT(*) as c FROM verification_requests WHERE status = 'pending'").get() as { c: number }
  ).c;

  res.json({
    usersCount,
    studentsCount,
    teachersCount,
    professorsCount,
    schoolsCount,
    pendingSchoolsCount,
    lessonsCount,
    questionsCount,
    attemptsCount,
    avgScore: avgScoreRow?.avg ? Number(avgScoreRow.avg.toFixed(2)) : 0,
    openTickets,
    unreadContactMessages,
    verifiedReferrals,
    pendingVerificationBadges,
  });
});

app.get('/api/admin/users', requireAdminPermission('users', 'students', 'teachers', 'professors'), (_req, res) => {
  const users = db
    .prepare(
      `SELECT id, name, email, phone, role, track, preferred_lang, level,
              teacher_category, professor_specialty, email_verified,
              verified_account, verified_badge_label, followers_count,
              last_login_at, last_active_at, created_at
       FROM users ORDER BY id DESC LIMIT 250`
    )
    .all();
  res.json({ users });
});

app.patch('/api/admin/users/:id/role', requireAdminPermission('users', 'administrators', 'permissions'), (req: AuthenticatedRequest, res) => {
  const targetId = Number(req.params.id);
  const { role } = req.body ?? {};
  if (!['admin', 'editor', 'teacher', 'student'].includes(role)) {
    res.status(400).json({ error: 'Invalid role' });
    return;
  }
  const target = db.prepare('SELECT email FROM users WHERE id = ?').get(targetId) as { email?: string } | undefined;
  if (!target) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  if (role === 'admin' && String(target.email || '').trim().toLowerCase() !== OFFICIAL_ADMIN_EMAIL) {
    res.status(403).json({
      error: 'الصلاحية الكاملة (admin) محصورة بالمدير الرسمي الرئيسي. يمكنك منح صلاحيات محددة للمساعدين via قسم الصلاحيات.',
    });
    return;
  }
  db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, targetId);
  logAudit(req.authUser!.userId, req.authUser!.email, 'CHANGE_ROLE', 'user', targetId, `New role=${role}`);
  res.json({ ok: true });
});

// Tracks & Subjects Management
app.post('/api/admin/tracks', requireAdminPermission('content', 'lessons'), (req: AuthenticatedRequest, res) => {
  const { slug, name_ar, name_fr, description_ar, description_fr } = req.body ?? {};
  if (!slug || !name_ar || !name_fr) {
    res.status(400).json({ error: 'slug, name_ar, and name_fr are required' });
    return;
  }
  db.prepare(
    'INSERT INTO tracks (slug, name_ar, name_fr, description_ar, description_fr, active) VALUES (?, ?, ?, ?, ?, 1)'
  ).run(String(slug).trim(), name_ar, name_fr, description_ar || '', description_fr || '');
  logAudit(req.authUser!.userId, req.authUser!.email, 'CREATE_TRACK', 'track', slug);
  res.status(201).json({ ok: true });
});

app.post('/api/admin/subjects', requireAdminPermission('content', 'lessons'), (req: AuthenticatedRequest, res) => {
  const { slug, name_ar, name_fr, tracks, official_program_ref } = req.body ?? {};
  if (!slug || !name_ar || !name_fr) {
    res.status(400).json({ error: 'slug, name_ar, and name_fr are required' });
    return;
  }
  const order = (db.prepare('SELECT COUNT(*) as c FROM subjects').get() as { c: number }).c + 1;
  db.prepare(
    'INSERT INTO subjects (slug, name_ar, name_fr, tracks_json, official_program_ref, icon_name, display_order) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(
    String(slug).trim(),
    name_ar,
    name_fr,
    JSON.stringify(Array.isArray(tracks) ? tracks : ['arabic', 'french', 'bilingual']),
    official_program_ref || '',
    'BookOpen',
    order
  );
  logAudit(req.authUser!.userId, req.authUser!.email, 'CREATE_SUBJECT', 'subject', slug);
  res.status(201).json({ ok: true });
});

// Lessons CRUD
app.post('/api/admin/lessons', requireAdminPermission('lessons', 'content'), (req: AuthenticatedRequest, res) => {
  const b = req.body ?? {};
  if (!b.subject_slug || !b.title_ar || !b.title_fr || !b.explanation_ar) {
    res.status(400).json({ error: 'Missing required lesson fields' });
    return;
  }
  const result = db
    .prepare(
      `INSERT INTO lessons (
        subject_slug, track, level, title_ar, title_fr, summary_ar, summary_fr,
        explanation_ar, explanation_speech_ar, explanation_fr,
        examples_json, exercises_json, mcq_json, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      b.subject_slug,
      b.track || 'all',
      b.level || 'foundation',
      b.title_ar,
      b.title_fr,
      b.summary_ar || '',
      b.summary_fr || '',
      b.explanation_ar,
      b.explanation_speech_ar || b.explanation_ar,
      b.explanation_fr || '',
      JSON.stringify(b.examples || []),
      JSON.stringify(b.exercises || []),
      JSON.stringify(b.mcq || []),
      req.authUser!.userId
    );
  logAudit(req.authUser!.userId, req.authUser!.email, 'CREATE_LESSON', 'lesson', Number(result.lastInsertRowid));
  res.status(201).json({ id: Number(result.lastInsertRowid) });
});

app.put('/api/admin/lessons/:id', requireAdminPermission('lessons', 'content'), (req: AuthenticatedRequest, res) => {
  const id = Number(req.params.id);
  const b = req.body ?? {};
  db.prepare(
    `UPDATE lessons SET
      subject_slug = ?, track = ?, level = ?, title_ar = ?, title_fr = ?,
      summary_ar = ?, summary_fr = ?, explanation_ar = ?, explanation_speech_ar = ?,
      explanation_fr = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    b.subject_slug,
    b.track || 'all',
    b.level || 'foundation',
    b.title_ar,
    b.title_fr,
    b.summary_ar || '',
    b.summary_fr || '',
    b.explanation_ar,
    b.explanation_speech_ar || b.explanation_ar,
    b.explanation_fr || '',
    id
  );
  logAudit(req.authUser!.userId, req.authUser!.email, 'UPDATE_LESSON', 'lesson', id);
  res.json({ ok: true });
});

app.delete('/api/admin/lessons/:id', requireAdminPermission('lessons', 'content'), (req: AuthenticatedRequest, res) => {
  const id = Number(req.params.id);
  db.prepare('DELETE FROM lessons WHERE id = ?').run(id);
  logAudit(req.authUser!.userId, req.authUser!.email, 'DELETE_LESSON', 'lesson', id);
  res.json({ ok: true });
});

// Summaries CRUD
app.post('/api/admin/summaries', requireAdminPermission('lessons', 'content'), (req: AuthenticatedRequest, res) => {
  const b = req.body ?? {};
  if (!b.subject_slug || !b.title_ar || !b.content_ar) {
    res.status(400).json({ error: 'Missing required summary fields' });
    return;
  }
  const result = db
    .prepare(
      `INSERT INTO summaries (
        subject_slug, track, level, title_ar, title_fr, content_ar, content_speech_ar, content_fr, key_points_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      b.subject_slug,
      b.track || 'all',
      b.level || 'foundation',
      b.title_ar,
      b.title_fr || b.title_ar,
      b.content_ar,
      b.content_speech_ar || b.content_ar,
      b.content_fr || '',
      JSON.stringify(b.key_points || [])
    );
  logAudit(req.authUser!.userId, req.authUser!.email, 'CREATE_SUMMARY', 'summary', Number(result.lastInsertRowid));
  res.status(201).json({ id: Number(result.lastInsertRowid) });
});

app.delete('/api/admin/summaries/:id', requireAdminPermission('lessons', 'content'), (req: AuthenticatedRequest, res) => {
  const id = Number(req.params.id);
  db.prepare('DELETE FROM summaries WHERE id = ?').run(id);
  logAudit(req.authUser!.userId, req.authUser!.email, 'DELETE_SUMMARY', 'summary', id);
  res.json({ ok: true });
});

// Questions CRUD + Deduplication + Content Workflow + Bulk Import/Export
app.post('/api/admin/questions', requireAdminPermission('questions', 'content'), (req: AuthenticatedRequest, res) => {
  const b = req.body ?? {};
  const qType = ['mcq', 'true_false', 'short_answer', 'essay'].includes(b.question_type) ? b.question_type : 'mcq';
  const cleanStemAr = stripArabicDiacritics(String(b.stem_ar || '').trim());
  const cleanStemFr = String(b.stem_fr || '').trim();
  const optionsAr: string[] = Array.isArray(b.options_ar)
    ? b.options_ar.map((o: any) => stripArabicDiacritics(String(o || '').trim()))
    : [];
  const optionsFr: string[] = Array.isArray(b.options_fr)
    ? b.options_fr.map((o: any) => String(o || '').trim())
    : optionsAr;

  if (!b.subject_slug || !cleanStemAr || !cleanStemFr) {
    res.status(400).json({ error: 'Subject, Arabic stem, and French stem are required.' });
    return;
  }
  if ((qType === 'mcq' || qType === 'true_false') && (optionsAr.length < 2 || optionsFr.length < 2)) {
    res.status(400).json({ error: 'At least 2 options are required for MCQ/True-False questions.' });
    return;
  }

  const nextStatus = ['draft', 'review', 'approved', 'published', 'archived'].includes(b.content_status)
    ? b.content_status
    : 'published';
  const answerAr = stripArabicDiacritics(String(b.answer_ar || optionsAr[Number(b.correct_index) || 0] || '').trim());
  const answerFr = String(b.answer_fr || optionsFr[Number(b.correct_index) || 0] || '').trim();
  if (nextStatus === 'published' && !answerAr) {
    res.status(400).json({ error: 'Published questions must have a verified correct answer.' });
    return;
  }

  const fp = normalizeQuestionFingerprint(cleanStemAr, cleanStemFr);
  const dup = db.prepare('SELECT id FROM questions WHERE fingerprint_hash = ?').get(fp);
  if (dup) {
    res.status(409).json({ error: 'Duplicate question detected! This question already exists in the bank.' });
    return;
  }

  const reviewedBy = nextStatus === 'approved' || nextStatus === 'published' ? req.authUser!.email : null;
  const reviewedAt = reviewedBy ? new Date().toISOString() : null;

  const result = db
    .prepare(
      `INSERT INTO questions (
        subject_slug, track, level, axis_ar, axis_fr, lesson_id,
        topic_ar, topic_fr, skill_ar, skill_fr, question_type, difficulty,
        stem_ar, stem_speech_ar, stem_fr,
        options_ar_json, options_speech_ar_json, options_fr_json,
        correct_index, answer_ar, answer_speech_ar, answer_fr,
        explanation_ar, explanation_speech_ar, explanation_fr,
        exam_ref, target_competition, content_status, reviewed_by, reviewed_at,
        fingerprint_hash, verified, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      b.subject_slug,
      b.track || 'all',
      b.level || 'foundation',
      stripArabicDiacritics(b.axis_ar || b.topic_ar || 'عام'),
      b.axis_fr || b.topic_fr || 'Général',
      b.lesson_id ? Number(b.lesson_id) : null,
      stripArabicDiacritics(b.topic_ar || 'عام'),
      b.topic_fr || 'Général',
      stripArabicDiacritics(b.skill_ar || 'فهم وتطبيق'),
      b.skill_fr || 'Compréhension',
      qType,
      ['easy', 'medium', 'hard'].includes(b.difficulty) ? b.difficulty : 'medium',
      cleanStemAr,
      b.stem_speech_ar || cleanStemAr,
      cleanStemFr,
      JSON.stringify(optionsAr),
      JSON.stringify(b.options_speech_ar || optionsAr),
      JSON.stringify(optionsFr),
      Math.max(0, Math.min(3, Number(b.correct_index) || 0)),
      answerAr,
      b.answer_speech_ar || answerAr,
      answerFr,
      stripArabicDiacritics(b.explanation_ar || ''),
      b.explanation_speech_ar || b.explanation_ar || '',
      b.explanation_fr || '',
      String(b.exam_ref || ''),
      String(b.target_competition || ''),
      nextStatus,
      reviewedBy,
      reviewedAt,
      fp,
      nextStatus === 'published' ? 1 : 0,
      req.authUser!.userId
    );
  logAudit(req.authUser!.userId, req.authUser!.email, 'CREATE_QUESTION', 'question', Number(result.lastInsertRowid));
  res.status(201).json({ id: Number(result.lastInsertRowid) });
});

app.put('/api/admin/questions/:id', requireAdminPermission('questions', 'content'), (req: AuthenticatedRequest, res) => {
  const id = Number(req.params.id);
  const b = req.body ?? {};
  const cleanStemAr = stripArabicDiacritics(String(b.stem_ar || '').trim());
  const cleanStemFr = String(b.stem_fr || '').trim();
  const fp = normalizeQuestionFingerprint(cleanStemAr, cleanStemFr);
  const dup = db.prepare('SELECT id FROM questions WHERE fingerprint_hash = ? AND id != ?').get(fp, id);
  if (dup) {
    res.status(409).json({ error: 'Another question with identical content already exists.' });
    return;
  }

  const optionsAr: string[] = Array.isArray(b.options_ar)
    ? b.options_ar.map((o: any) => stripArabicDiacritics(String(o || '').trim()))
    : [];
  const optionsFr: string[] = Array.isArray(b.options_fr)
    ? b.options_fr.map((o: any) => String(o || '').trim())
    : optionsAr;
  const qType = ['mcq', 'true_false', 'short_answer', 'essay'].includes(b.question_type) ? b.question_type : 'mcq';
  const nextStatus = ['draft', 'review', 'approved', 'published', 'archived'].includes(b.content_status)
    ? b.content_status
    : 'published';
  const cIdx = Math.max(0, Math.min(3, Number(b.correct_index) || 0));
  const answerAr = stripArabicDiacritics(String(b.answer_ar || optionsAr[cIdx] || '').trim());
  const answerFr = String(b.answer_fr || optionsFr[cIdx] || '').trim();
  const reviewedBy = nextStatus === 'approved' || nextStatus === 'published' ? req.authUser!.email : null;
  const reviewedAt = reviewedBy ? new Date().toISOString() : null;

  db.prepare(
    `UPDATE questions SET
      subject_slug = ?, track = ?, level = ?, axis_ar = ?, axis_fr = ?, lesson_id = ?,
      topic_ar = ?, topic_fr = ?, skill_ar = ?, skill_fr = ?, question_type = ?, difficulty = ?,
      stem_ar = ?, stem_speech_ar = ?, stem_fr = ?,
      options_ar_json = ?, options_speech_ar_json = ?, options_fr_json = ?,
      correct_index = ?, answer_ar = ?, answer_speech_ar = ?, answer_fr = ?,
      explanation_ar = ?, explanation_speech_ar = ?, explanation_fr = ?,
      exam_ref = ?, target_competition = ?, content_status = ?, reviewed_by = COALESCE(?, reviewed_by),
      reviewed_at = COALESCE(?, reviewed_at), verified = ?, fingerprint_hash = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    b.subject_slug,
    b.track || 'all',
    b.level || 'foundation',
    stripArabicDiacritics(b.axis_ar || b.topic_ar || 'عام'),
    b.axis_fr || b.topic_fr || 'Général',
    b.lesson_id ? Number(b.lesson_id) : null,
    stripArabicDiacritics(b.topic_ar || 'عام'),
    b.topic_fr || 'Général',
    stripArabicDiacritics(b.skill_ar || ''),
    b.skill_fr || '',
    qType,
    b.difficulty || 'medium',
    cleanStemAr,
    b.stem_speech_ar || cleanStemAr,
    cleanStemFr,
    JSON.stringify(optionsAr),
    JSON.stringify(b.options_speech_ar || optionsAr),
    JSON.stringify(optionsFr),
    cIdx,
    answerAr,
    b.answer_speech_ar || answerAr,
    answerFr,
    stripArabicDiacritics(b.explanation_ar || ''),
    b.explanation_speech_ar || b.explanation_ar || '',
    b.explanation_fr || '',
    String(b.exam_ref || ''),
    String(b.target_competition || ''),
    nextStatus,
    reviewedBy,
    reviewedAt,
    nextStatus === 'published' ? 1 : 0,
    fp,
    id
  );
  logAudit(req.authUser!.userId, req.authUser!.email, 'UPDATE_QUESTION', 'question', id, `Status=${nextStatus}`);
  res.json({ ok: true });
});

app.patch('/api/admin/questions/:id/status', requireAdminPermission('questions', 'content'), (req: AuthenticatedRequest, res) => {
  const id = Number(req.params.id);
  const { content_status } = req.body ?? {};
  if (!['draft', 'review', 'approved', 'published', 'archived'].includes(content_status)) {
    res.status(400).json({ error: 'Invalid content status.' });
    return;
  }
  const existing = db.prepare('SELECT * FROM questions WHERE id = ?').get(id) as any;
  if (!existing) {
    res.status(404).json({ error: 'Question not found.' });
    return;
  }
  if (content_status === 'published' && (!existing.stem_ar || (!existing.answer_ar && !existing.options_ar_json))) {
    res.status(400).json({ error: 'Cannot publish question without verified stem and answer.' });
    return;
  }
  const reviewedBy = content_status === 'approved' || content_status === 'published' ? req.authUser!.email : existing.reviewed_by;
  const reviewedAt = content_status === 'approved' || content_status === 'published' ? new Date().toISOString() : existing.reviewed_at;
  db.prepare(
    "UPDATE questions SET content_status = ?, verified = ?, reviewed_by = ?, reviewed_at = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(content_status, content_status === 'published' ? 1 : 0, reviewedBy, reviewedAt, id);
  logAudit(req.authUser!.userId, req.authUser!.email, 'QUESTION_STATUS', 'question', id, `status=${content_status}`);
  res.json({ ok: true, content_status });
});

app.delete('/api/admin/questions/:id', requireAdminPermission('questions', 'content'), (req: AuthenticatedRequest, res) => {
  const id = Number(req.params.id);
  db.prepare('DELETE FROM questions WHERE id = ?').run(id);
  logAudit(req.authUser!.userId, req.authUser!.email, 'DELETE_QUESTION', 'question', id);
  res.json({ ok: true });
});

app.post('/api/admin/questions/import', requireAdminPermission('questions', 'content'), (req: AuthenticatedRequest, res) => {
  const items = req.body?.questions;
  if (!Array.isArray(items)) {
    res.status(400).json({ error: 'questions array is required' });
    return;
  }
  let inserted = 0;
  let duplicates = 0;

  const insertStmt = db.prepare(`
    INSERT INTO questions (
      subject_slug, track, level, axis_ar, axis_fr, lesson_id,
      topic_ar, topic_fr, skill_ar, skill_fr, question_type, difficulty,
      stem_ar, stem_speech_ar, stem_fr,
      options_ar_json, options_speech_ar_json, options_fr_json,
      correct_index, answer_ar, answer_speech_ar, answer_fr,
      explanation_ar, explanation_speech_ar, explanation_fr,
      exam_ref, target_competition, content_status,
      fingerprint_hash, verified, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const tx = db.transaction(() => {
    for (const q of items) {
      if (!q.stem_ar || !q.stem_fr || !Array.isArray(q.options_ar) || q.options_ar.length < 2) continue;
      const cleanStemAr = stripArabicDiacritics(String(q.stem_ar).trim());
      const cleanStemFr = String(q.stem_fr).trim();
      const fp = normalizeQuestionFingerprint(cleanStemAr, cleanStemFr);
      const exists = db.prepare('SELECT id FROM questions WHERE fingerprint_hash = ?').get(fp);
      if (exists) {
        duplicates++;
        continue;
      }
      const optsAr = q.options_ar.map((o: any) => stripArabicDiacritics(String(o || '').trim()));
      const optsFr = Array.isArray(q.options_fr) ? q.options_fr.map((o: any) => String(o || '').trim()) : optsAr;
      const cIdx = Math.max(0, Math.min(3, Number(q.correct_index) || 0));
      const status = ['draft', 'review', 'approved', 'published', 'archived'].includes(q.content_status)
        ? q.content_status
        : 'published';
      const ansAr = stripArabicDiacritics(String(q.answer_ar || optsAr[cIdx] || '').trim());
      const ansFr = String(q.answer_fr || optsFr[cIdx] || '').trim();
      insertStmt.run(
        q.subject_slug || 'education-sciences',
        q.track || 'all',
        q.level || 'foundation',
        stripArabicDiacritics(q.axis_ar || q.topic_ar || 'عام'),
        q.axis_fr || q.topic_fr || 'Général',
        q.lesson_id ? Number(q.lesson_id) : null,
        stripArabicDiacritics(q.topic_ar || 'عام'),
        q.topic_fr || 'Général',
        stripArabicDiacritics(q.skill_ar || 'مهارة'),
        q.skill_fr || 'Compétence',
        ['mcq', 'true_false', 'short_answer', 'essay'].includes(q.question_type) ? q.question_type : 'mcq',
        ['easy', 'medium', 'hard'].includes(q.difficulty) ? q.difficulty : 'medium',
        cleanStemAr,
        q.stem_speech_ar || q.stem_ar,
        cleanStemFr,
        JSON.stringify(optsAr),
        JSON.stringify(q.options_speech_ar || q.options_ar),
        JSON.stringify(optsFr),
        cIdx,
        ansAr,
        q.answer_speech_ar || ansAr,
        ansFr,
        stripArabicDiacritics(q.explanation_ar || ''),
        q.explanation_speech_ar || q.explanation_ar || '',
        q.explanation_fr || '',
        String(q.exam_ref || ''),
        String(q.target_competition || ''),
        status,
        fp,
        status === 'published' ? 1 : 0,
        req.authUser!.userId
      );
      inserted++;
    }
  });
  tx();

  logAudit(
    req.authUser!.userId,
    req.authUser!.email,
    'IMPORT_QUESTIONS',
    'question_bank',
    'batch',
    `Inserted=${inserted},DuplicatesSkipped=${duplicates}`
  );
  res.json({ inserted, duplicates });
});

app.get('/api/admin/questions/export', requireAdminPermission('questions', 'content'), (_req, res) => {
  const rows = db.prepare('SELECT * FROM questions ORDER BY id ASC').all() as any[];
  const exported = rows.map((r) => ({
    id: r.id,
    subject_slug: r.subject_slug,
    track: r.track,
    level: r.level,
    topic_ar: r.topic_ar,
    topic_fr: r.topic_fr,
    skill_ar: r.skill_ar,
    skill_fr: r.skill_fr,
    difficulty: r.difficulty,
    stem_ar: r.stem_ar,
    stem_speech_ar: r.stem_speech_ar,
    stem_fr: r.stem_fr,
    options_ar: parseJson(r.options_ar_json, []),
    options_speech_ar: parseJson(r.options_speech_ar_json, []),
    options_fr: parseJson(r.options_fr_json, []),
    correct_index: r.correct_index,
    explanation_ar: r.explanation_ar,
    explanation_speech_ar: r.explanation_speech_ar,
    explanation_fr: r.explanation_fr,
  }));
  res.json({ exported_at: new Date().toISOString(), count: exported.length, questions: exported });
});

// Exam Configs & Grading Settings
app.post('/api/admin/exam-configs', requireAdminPermission('exams', 'content'), (req: AuthenticatedRequest, res) => {
  const b = req.body ?? {};
  if (!b.title_ar || !b.title_fr || !b.question_count || !b.duration_minutes) {
    res.status(400).json({ error: 'Missing required exam config fields' });
    return;
  }
  const result = db
    .prepare(
      `INSERT INTO exam_configs (
        title_ar, title_fr, mode, track, subject_slug, level,
        question_count, duration_minutes, max_score, require_camera_check, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
    )
    .run(
      b.title_ar,
      b.title_fr,
      ['mock', 'official_sim', 'placement'].includes(b.mode) ? b.mode : 'mock',
      b.track || 'all',
      b.subject_slug || 'all',
      b.level || 'all',
      Number(b.question_count),
      Number(b.duration_minutes),
      Number(b.max_score || 20),
      b.require_camera_check ? 1 : 0
    );
  logAudit(req.authUser!.userId, req.authUser!.email, 'CREATE_EXAM_CONFIG', 'exam_config', Number(result.lastInsertRowid));
  res.status(201).json({ id: Number(result.lastInsertRowid) });
});

app.put('/api/admin/grading-policy', requireAdminPermission('settings', 'exams'), (req: AuthenticatedRequest, res) => {
  const { maxScore, wrongPenalty, passingScore } = req.body ?? {};
  const next = {
    maxScore: Math.max(10, Math.min(100, Number(maxScore || 20))),
    wrongPenalty: Math.max(0, Math.min(1, Number(wrongPenalty || 0))),
    passingScore: Math.max(1, Math.min(20, Number(passingScore || 10))),
  };
  db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('grading_policy', ?)").run(
    JSON.stringify(next)
  );
  logAudit(req.authUser!.userId, req.authUser!.email, 'UPDATE_GRADING_POLICY', 'settings', 'grading_policy', JSON.stringify(next));
  res.json({ gradingPolicy: next });
});

app.put('/api/admin/site-config', requireAdminPermission('settings', 'content'), (req: AuthenticatedRequest, res) => {
  const { tickerMessages, heroSlides } = req.body ?? {};
  const allowedViews = new Set([
    'home',
    'all-subjects',
    'lessons',
    'summaries',
    'question-bank',
    'review-center',
    'exams',
    'dashboard',
    'subscriptions',
    'support',
    'about',
  ]);
  const allowedModes = new Set(['mock', 'official_sim', 'placement']);
  const current = getSiteConfig();

  const nextTicker = Array.isArray(tickerMessages)
    ? tickerMessages
        .slice(0, 6)
        .map((item: any, idx: number) => ({
          id: String(item?.id || `t${idx + 1}`).slice(0, 32),
          text_ar: String(item?.text_ar || '').trim().slice(0, 200),
          text_fr: String(item?.text_fr || item?.text_ar || '').trim().slice(0, 200),
        }))
        .filter((item) => item.text_ar.length > 0)
    : current.tickerMessages;

  const nextSlides = Array.isArray(heroSlides)
    ? heroSlides
        .slice(0, 6)
        .map((s: any, idx: number) => {
          const view1 = allowedViews.has(String(s?.cta1_view)) ? String(s.cta1_view) : 'exams';
          const view2 = allowedViews.has(String(s?.cta2_view)) ? String(s.cta2_view) : 'lessons';
          const mode1 = allowedModes.has(String(s?.cta1_exam_mode)) ? String(s.cta1_exam_mode) : undefined;
          const mode2 = allowedModes.has(String(s?.cta2_exam_mode)) ? String(s.cta2_exam_mode) : undefined;
          return {
            id: String(s?.id || `s${idx + 1}`).slice(0, 32),
            tag_ar: String(s?.tag_ar || '').trim().slice(0, 120),
            tag_fr: String(s?.tag_fr || s?.tag_ar || '').trim().slice(0, 120),
            title_ar: String(s?.title_ar || '').trim().slice(0, 180),
            title_fr: String(s?.title_fr || s?.title_ar || '').trim().slice(0, 180),
            desc_ar: String(s?.desc_ar || '').trim().slice(0, 360),
            desc_fr: String(s?.desc_fr || s?.desc_ar || '').trim().slice(0, 360),
            cta1_ar: String(s?.cta1_ar || '').trim().slice(0, 80),
            cta1_fr: String(s?.cta1_fr || s?.cta1_ar || '').trim().slice(0, 80),
            cta1_view: view1,
            ...(mode1 ? { cta1_exam_mode: mode1 } : {}),
            cta2_ar: String(s?.cta2_ar || '').trim().slice(0, 80),
            cta2_fr: String(s?.cta2_fr || s?.cta2_ar || '').trim().slice(0, 80),
            cta2_view: view2,
            ...(mode2 ? { cta2_exam_mode: mode2 } : {}),
          };
        })
        .filter((s) => s.title_ar.length > 0 && s.cta1_ar.length > 0)
    : current.heroSlides;

  if (nextTicker.length === 0 || nextSlides.length === 0) {
    res.status(400).json({ error: 'At least one ticker message and one hero slide are required.' });
    return;
  }

  const next = { tickerMessages: nextTicker, heroSlides: nextSlides };
  db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('site_config', ?)").run(
    JSON.stringify(next)
  );
  logAudit(req.authUser!.userId, req.authUser!.email, 'UPDATE_SITE_CONFIG', 'settings', 'site_config', JSON.stringify({ tickerCount: nextTicker.length, slidesCount: nextSlides.length }));
  res.json({ siteConfig: next });
});

// Admin Notifications & Support Tickets
app.post('/api/admin/notifications', requireAdminPermission('notifications'), (req: AuthenticatedRequest, res) => {
  const { title_ar, title_fr, body_ar, body_fr, type, target_scope, user_id } = req.body ?? {};
  if (!title_ar || !body_ar) {
    res.status(400).json({ error: 'title_ar and body_ar are required' });
    return;
  }
  const cleanScope = target_scope === 'all_including_future' ? 'all_including_future' : 'current_users';
  const nowSql = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const targetUid = user_id ? Number(user_id) : null;
  const result = db
    .prepare(
      `INSERT INTO notifications (user_id, title_ar, title_fr, body_ar, body_fr, type, target_scope, eligible_before)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      targetUid,
      String(title_ar).trim(),
      String(title_fr || title_ar).trim(),
      String(body_ar).trim(),
      String(body_fr || body_ar).trim(),
      String(type || 'info'),
      cleanScope,
      cleanScope === 'current_users' ? nowSql : null
    );
  broadcastNotificationEvent({
    targetUserId: targetUid,
    targetScope: targetUid ? 'targeted' : cleanScope,
    payload: {
      id: Number(result.lastInsertRowid),
      title_ar: String(title_ar).trim(),
      title_fr: String(title_fr || title_ar).trim(),
      body_ar: String(body_ar).trim(),
      body_fr: String(body_fr || body_ar).trim(),
      type: String(type || 'info'),
      target_scope: cleanScope,
      created_at: new Date().toISOString(),
    },
  });
  logAudit(req.authUser!.userId, req.authUser!.email, 'BROADCAST_NOTIFICATION', 'notification', Number(result.lastInsertRowid), `scope=${cleanScope}`);
  res.status(201).json({ id: Number(result.lastInsertRowid), target_scope: cleanScope });
});

app.get('/api/admin/tickets', requireAdminPermission('reports', 'content'), (_req, res) => {
  const tickets = db.prepare('SELECT * FROM support_tickets ORDER BY id DESC').all();
  res.json({ tickets });
});

app.patch('/api/admin/tickets/:id', requireAdminPermission('reports', 'content'), (req: AuthenticatedRequest, res) => {
  const id = Number(req.params.id);
  const { status, admin_reply } = req.body ?? {};
  db.prepare('UPDATE support_tickets SET status = ?, admin_reply = ? WHERE id = ?').run(
    status === 'resolved' ? 'resolved' : 'open',
    admin_reply || null,
    id
  );
  logAudit(req.authUser!.userId, req.authUser!.email, 'REPLY_TICKET', 'support_ticket', id);
  res.json({ ok: true });
});

app.get('/api/admin/attempts', requireAdminPermission('exams', 'dashboard'), (_req, res) => {
  const rows = db
    .prepare(
      `SELECT ea.id, ea.mode, ea.track, ea.subject_slug, ea.score_20, ea.percentage, ea.submitted_at, u.name as student_name, u.email as student_email
       FROM exam_attempts ea
       JOIN users u ON u.id = ea.user_id
       WHERE ea.status = 'submitted'
       ORDER BY ea.id DESC LIMIT 100`
    )
    .all();
  res.json({ attempts: rows });
});

app.get('/api/admin/audit-logs', requireAdminPermission('audit_logs'), (_req, res) => {
  const logs = db.prepare('SELECT * FROM audit_logs ORDER BY id DESC LIMIT 200').all();
  res.json({ logs });
});

// =====================================================================
// SUBSCRIPTIONS, MAURITANIAN PAYMENT REQUESTS, ANTI-FRAUD & ADMIN REVIEW
// =====================================================================
app.get('/api/payment-methods', (_req, res) => {
  const methods = db
    .prepare('SELECT * FROM payment_methods WHERE active = 1 ORDER BY display_order ASC')
    .all();
  res.json({ paymentMethods: methods });
});

app.get('/api/plan-limits', (req: AuthenticatedRequest, res) => {
  const freeLimits = getPlanLimitsForTier('free');
  const paidLimits = getPlanLimitsForTier('paid');
  const userTier = getEffectivePlanTier(req.authUser);
  let todayUsage = { questions_viewed: 0, lessons_viewed: 0, exams_started: 0 };
  if (req.authUser) {
    const today = new Date().toISOString().slice(0, 10);
    const u = db
      .prepare('SELECT questions_viewed, lessons_viewed, exams_started FROM user_daily_usage WHERE user_id = ? AND usage_date = ?')
      .get(req.authUser.userId, today) as any;
    if (u) todayUsage = u;
  }
  res.json({
    freeLimits,
    paidLimits,
    userTier,
    todayUsage,
  });
});

app.get('/api/plans', (req: AuthenticatedRequest, res) => {
  expireOverdueSubscriptions();
  const rows = db
    .prepare('SELECT * FROM subscription_plans WHERE active = 1 ORDER BY display_order ASC, id ASC')
    .all() as any[];
  const plans = rows.map((p) => ({
    id: p.id,
    slug: p.slug,
    name_ar: p.name_ar,
    name_fr: p.name_fr,
    description_ar: p.description_ar,
    description_fr: p.description_fr,
    price_mru: p.price_mru,
    price_eur: p.price_eur,
    currency: p.currency,
    duration_days: p.duration_days,
    billing_cycle: p.billing_cycle,
    features_ar: parseJson<string[]>(p.features_ar_json, []),
    features_fr: parseJson<string[]>(p.features_fr_json, []),
    is_popular: p.is_popular,
    active: p.active,
    display_order: p.display_order,
  }));

  const monthlyPlan = plans.find((p) => p.billing_cycle === 'monthly' || p.slug === 'monthly-intensive');
  const annualPlan = plans.find((p) => p.billing_cycle === 'annual' || p.slug === 'annual-concours');
  const monthlyPrice = Number(monthlyPlan?.price_mru ?? 400);
  const annualPrice = Number(annualPlan?.price_mru ?? 1000);
  const twelveMonthsCost = monthlyPrice * 12;
  const savingsAmount = Math.max(0, twelveMonthsCost - annualPrice);
  const savingsPercent = twelveMonthsCost > 0 ? Math.round((savingsAmount / twelveMonthsCost) * 100) : 0;

  const currentSubscription = req.authUser ? getUserActiveSubscription(req.authUser.userId) : null;
  const latestExpiredSubscription =
    req.authUser && !currentSubscription ? getUserLatestExpiredSubscription(req.authUser.userId) : null;
  const paymentMethods = db
    .prepare('SELECT * FROM payment_methods WHERE active = 1 ORDER BY display_order ASC')
    .all();

  res.json({
    plans,
    currentSubscription,
    latestExpiredSubscription,
    paymentMethods,
    planLimits: {
      free: getPlanLimitsForTier('free'),
      paid: getPlanLimitsForTier('paid'),
    },
    annualSavings: {
      monthlyPrice,
      annualPrice,
      twelveMonthsCost,
      savingsAmount,
      savingsPercent,
    },
    gatewayMode: 'manual_admin_review',
  });
});

app.get('/api/subscriptions/mine', requireAuth, (req: AuthenticatedRequest, res) => {
  expireOverdueSubscriptions();
  const active = getUserActiveSubscription(req.authUser!.userId);
  const latestExpiredSubscription = active ? null : getUserLatestExpiredSubscription(req.authUser!.userId);
  const subscriptions = db
    .prepare(
      `SELECT us.*, sp.slug as plan_slug, sp.name_ar, sp.name_fr, sp.billing_cycle
       FROM user_subscriptions us
       JOIN subscription_plans sp ON sp.id = us.plan_id
       WHERE us.user_id = ?
       ORDER BY us.id DESC LIMIT 20`
    )
    .all(req.authUser!.userId);
  const requests = db
    .prepare(
      `SELECT id, subscription_request_id, user_id, plan_id, plan_slug, plan_name,
              amount, currency, payment_method, beneficiary_name, transaction_reference,
              transaction_id, transaction_at, uploaded_at, status, rejection_reason,
              approved_by, approved_at, starts_at, expires_at, created_at
       FROM subscription_requests
       WHERE user_id = ?
       ORDER BY id DESC LIMIT 30`
    )
    .all(req.authUser!.userId);

  res.json({ active, latestExpiredSubscription, subscriptions, requests });
});

app.post('/api/payments/activate-free', requireAuth, (req: AuthenticatedRequest, res) => {
  const { planId } = req.body ?? {};
  const plan = db
    .prepare('SELECT * FROM subscription_plans WHERE id = ? AND active = 1')
    .get(Number(planId)) as any;

  if (!plan || plan.price_mru > 0) {
    res.status(400).json({ error: 'Selected plan is not a free plan.' });
    return;
  }

  const tx = db.transaction(() => {
    db.prepare(
      "UPDATE user_subscriptions SET status = 'expired' WHERE user_id = ? AND status = 'active'"
    ).run(req.authUser!.userId);
    db.prepare(
      `INSERT INTO user_subscriptions (user_id, plan_id, status, starts_at, expires_at, payment_tx_id)
       VALUES (?, ?, 'active', datetime('now'), datetime('now', '+' || ? || ' days'), NULL)`
    ).run(req.authUser!.userId, plan.id, Number(plan.duration_days || 365));
  });
  tx();

  logAudit(req.authUser!.userId, req.authUser!.email, 'ACTIVATE_FREE_PLAN', 'subscription', plan.slug);
  res.json({ ok: true, activeSubscription: getUserActiveSubscription(req.authUser!.userId) });
});

function addFullMonths(baseDate: Date, months: number): Date {
  const target = new Date(baseDate.getTime());
  const originalDay = target.getUTCDate();
  target.setUTCDate(1);
  target.setUTCMonth(target.getUTCMonth() + months);
  const daysInTargetMonth = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(originalDay, daysInTargetMonth));
  return target;
}

function isValidLuhn(cardNum: string): boolean {
  const digits = cardNum.replace(/\D/g, '');
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let shouldDouble = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = Number(digits[i]);
    if (shouldDouble) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
}

function detectGlobalCardBrand(cardNum: string): 'visa' | 'mastercard' | null {
  const digits = cardNum.replace(/\D/g, '');
  if (/^4\d{12,18}$/.test(digits)) return 'visa';
  const two = Number(digits.slice(0, 2));
  const four = Number(digits.slice(0, 4));
  if ((two >= 51 && two <= 55) || (four >= 2221 && four <= 2720)) return 'mastercard';
  return null;
}

// Legacy unsafe card checkout endpoint removed — use NardoPay hosted checkout (/api/payments/nardopay/create)
app.post('/api/payments/checkout', requireAuth, (_req, res) => {
  res.status(410).json({
    code: 'DIRECT_CARD_COLLECTION_REMOVED',
    error:
      'تم إيقاف إدخال بيانات البطاقة مباشرة على الموقع لأسباب أمنية. يرجى استخدام بوابة الدفع المستضافة عبر NardoPay (/api/payments/nardopay/create).',
  });
});

app.get('/api/payments/mine', requireAuth, (req: AuthenticatedRequest, res) => {
  const rows = db
    .prepare(
      `SELECT pt.id, pt.user_id, pt.plan_id, pt.amount_mru, pt.amount_eur, pt.currency,
              pt.card_brand, pt.card_last4, pt.card_exp_month, pt.card_exp_year, pt.cardholder_name,
              pt.provider, pt.provider_tx_id, pt.status, pt.created_at,
              sp.name_ar as plan_name_ar, sp.name_fr as plan_name_fr,
              us.starts_at, us.expires_at
       FROM payment_transactions pt
       LEFT JOIN subscription_plans sp ON sp.id = pt.plan_id
       LEFT JOIN user_subscriptions us ON us.payment_tx_id = pt.id
       WHERE pt.user_id = ?
       ORDER BY pt.id DESC
       LIMIT 30`
    )
    .all(req.authUser!.userId) as any[];

  res.json({
    transactions: rows.map((row) => {
      const verify = buildReceiptVerifyUrl(row.provider_tx_id);
      return {
        ...row,
        verify_sig: verify.sig,
        verify_url: verify.url,
      };
    }),
  });
});

// =====================================================================
// LOCAL PAYMENT SYSTEM #2: RECEIPT UPLOAD, EXTRACTION & LOCAL REQUESTS
// =====================================================================
app.post('/api/payment-requests/upload', requireAuth, async (req: AuthenticatedRequest, res) => {
  const { proofDataUrl, fileName, mimeType } = req.body ?? {};
  const validated = validateAndDecodeReceiptDataUrl(
    String(proofDataUrl || ''),
    typeof mimeType === 'string' && mimeType.trim() ? mimeType.trim() : undefined
  );

  if (!validated.ok) {
    try {
      const uRow = db
        .prepare('SELECT name, email FROM users WHERE id = ?')
        .get(req.authUser!.userId) as { name?: string; email?: string } | undefined;
      db.prepare(
        `INSERT INTO security_events
         (user_id, firebase_uid, user_name, user_email, phone, activity_type, payment_method, risk_level, reason, technical_details_json, request_ref)
         VALUES (?, ?, ?, ?, '', 'receipt_upload_rejected', '', ?, ?, ?, '')`
      ).run(
        req.authUser!.userId,
        req.authUser!.firebaseUid || '',
        uRow?.name || req.authUser!.email.split('@')[0],
        uRow?.email || req.authUser!.email,
        validated.riskLevel,
        validated.technicalReason,
        JSON.stringify({
          fileName: String(fileName || '').slice(0, 120),
          mimeType: validated.mimeType || mimeType || '',
          dimensions: validated.dimensions ?? null,
          magicBytesValid: validated.magicBytesValid ?? false,
        })
      );
    } catch {
      // non-fatal
    }

    res.status(400).json({ error: validated.reason });
    return;
  }

  const uploadId = `UPL-${crypto.randomBytes(8).toString('hex').toUpperCase()}`;
  let storedFileUrl = '';
  let storedFileId = '';
  try {
    const stored = await storeBinaryFile({
      ownerUserId: req.authUser!.userId,
      buffer: validated.buffer,
      mimeType: validated.mimeType,
      originalName: String(fileName || `${uploadId}.png`).slice(0, 140),
      entityType: 'receipt',
      entityId: uploadId,
      visibility: 'private',
    });
    storedFileUrl = stored.url;
    storedFileId = stored.id;

    db.prepare("DELETE FROM receipt_uploads WHERE datetime(expires_at) <= datetime('now')").run();
    db.prepare(
      `INSERT INTO receipt_uploads (
         id, user_id, mime_type, file_name, size_bytes, width, height, proof_hash, proof_data_url, expires_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '+2 hours'))`
    ).run(
      uploadId,
      req.authUser!.userId,
      validated.mimeType,
      String(fileName || '').slice(0, 180),
      validated.buffer.length,
      validated.dimensions.width,
      validated.dimensions.height,
      validated.proofHash,
      String(proofDataUrl || '')
    );
  } catch (err) {
    console.error('Failed to store uploaded receipt:', err);
    res.status(500).json({ error: 'تعذر حفظ ملف الإيصال على الخادم. يرجى إعادة المحاولة.' });
    return;
  }

  res.status(201).json({
    ok: true,
    uploadId,
    fileId: storedFileId,
    fileUrl: storedFileUrl,
    mimeType: validated.mimeType,
    sizeBytes: validated.buffer.length,
    width: validated.dimensions.width,
    height: validated.dimensions.height,
    proofHash: validated.proofHash,
  });
});

app.post('/api/payment-requests/inspect', requireAuth, async (req: AuthenticatedRequest, res) => {
  const { uploadId, planId, planSlug, paymentMethod, proofDataUrl, senderPhone, expectedAmountOverride } =
    req.body ?? {};
  const method = String(paymentMethod || '').trim().toLowerCase();
  if (!['sedad', 'masrvi', 'bankily'].includes(method)) {
    res.status(400).json({
      error: 'فحص الإيصال متاح فقط لوسائل الدفع المحلية (السداد، مصرفي، بنكيلي).',
    });
    return;
  }

  const plan = (planId
    ? db.prepare('SELECT * FROM subscription_plans WHERE id = ? AND active = 1').get(Number(planId))
    : db.prepare('SELECT * FROM subscription_plans WHERE slug = ? AND active = 1').get(String(planSlug || ''))) as any;

  if (!plan || Number(plan.price_mru) <= 0) {
    res.status(404).json({ error: 'الخطة المدفوعة المطلوبة غير موجودة.' });
    return;
  }

  let resolvedProofDataUrl = String(proofDataUrl || '').trim();
  const cleanUploadId = String(uploadId || '').trim();
  if (cleanUploadId) {
    const uploadRow = db
      .prepare(
        `SELECT proof_data_url FROM receipt_uploads
         WHERE id = ? AND user_id = ? AND datetime(expires_at) > datetime('now')`
      )
      .get(cleanUploadId, req.authUser!.userId) as { proof_data_url?: string } | undefined;
    if (uploadRow?.proof_data_url) {
      resolvedProofDataUrl = uploadRow.proof_data_url;
    } else if (!resolvedProofDataUrl) {
      res.status(400).json({ error: 'تم رفض الإيصال لأن الملف غير صالح أو انتهت صلاحية الرفع.' });
      return;
    }
  }

  if (!resolvedProofDataUrl) {
    res.status(400).json({ error: 'تم رفض الإيصال لأن الملف غير صالح أو لا يمكن قراءته.' });
    return;
  }

  const uRow = db
    .prepare('SELECT name, email FROM users WHERE id = ?')
    .get(req.authUser!.userId) as { name?: string; email?: string } | undefined;

  const targetExpectedAmount =
    expectedAmountOverride !== undefined && Number(expectedAmountOverride) > 0
      ? Number(expectedAmountOverride)
      : Number(plan.price_mru);

  const result = await inspectAndVerifyReceipt({
    db,
    userId: req.authUser!.userId,
    firebaseUid: req.authUser!.firebaseUid,
    userName: uRow?.name || req.authUser!.email.split('@')[0],
    userEmail: uRow?.email || req.authUser!.email,
    senderPhone: String(senderPhone || '').trim(),
    planId: plan.id,
    expectedAmount: targetExpectedAmount,
    paymentMethod: method as ReceiptMethod,
    proofDataUrl: resolvedProofDataUrl,
  });

  // Never expose internal forensics, fraud signals, or riskLevel scoring to regular users
  const publicInspection = {
    inspectionId: result.inspectionId,
    verdict: result.verdict,
    status: result.status,
    reason: result.reason,
    reasonFr: result.reasonFr,
    reasonEn: result.reasonEn,
    requiredAmount: result.requiredAmount ?? targetExpectedAmount,
    paidAmount: result.paidAmount ?? result.extracted.amount ?? 0,
    remainingAmount: result.remainingAmount ?? 0,
    warnings: result.warnings,
    stagesCompleted: result.stagesCompleted,
    extracted: {
      appDetected: result.extracted.appDetected,
      amount: result.extracted.amount,
      currency: result.extracted.currency,
      transactionId: result.extracted.transactionId,
      transactionReference: result.extracted.transactionReference,
      transactionAt: result.extracted.transactionAt,
      beneficiaryName: result.extracted.beneficiaryName,
      beneficiaryAccount: result.extracted.beneficiaryAccount,
      amountComparison: result.forensics.amountComparison,
      mimeType: result.extracted.mimeType,
      dimensions: result.extracted.dimensions,
    },
  };

  res.json({ inspection: publicInspection });
});

// Submit Mauritanian Local Payment Request bound strictly to Server-Verified Inspection (Supports Partial Payment Tracking)
app.post('/api/payment-requests', requireAuth, (req: AuthenticatedRequest, res) => {
  const {
    planId,
    planSlug,
    paymentMethod,
    fullName,
    senderPhone,
    inspectionId,
  } = req.body ?? {};

  const methodCode = String(paymentMethod || '').trim().toLowerCase();
  if (!['sedad', 'masrvi', 'bankily'].includes(methodCode)) {
    res.status(400).json({
      error: 'يرجى استخدام بوابة البطاقة العالمية للفيزا/ماستركارد، أو اختيار السداد/مصرفي/بنكيلي هنا.',
    });
    return;
  }

  const plan = (planId
    ? db.prepare('SELECT * FROM subscription_plans WHERE id = ? AND active = 1').get(Number(planId))
    : db.prepare('SELECT * FROM subscription_plans WHERE slug = ? AND active = 1').get(String(planSlug || ''))) as any;

  if (!plan || Number(plan.price_mru) <= 0) {
    res.status(404).json({ error: 'الخطة المدفوعة المطلوبة غير موجودة.' });
    return;
  }

  const methodRow = db
    .prepare('SELECT * FROM payment_methods WHERE code = ? AND active = 1')
    .get(methodCode) as any;
  if (!methodRow) {
    res.status(400).json({ error: 'وسيلة الدفع المحددة غير مفعلة حالياً.' });
    return;
  }

  const cleanFullName = String(fullName || '').trim();
  const cleanSenderPhone = String(senderPhone || '').replace(/[^\d+]/g, '').trim();
  if (cleanFullName.length < 2) {
    res.status(400).json({ error: 'يرجى إدخال الاسم الكامل.' });
    return;
  }
  if (cleanSenderPhone.replace(/\D/g, '').length < 8) {
    res.status(400).json({ error: 'يرجى إدخال رقم الهاتف الذي حُوّل منه المال بشكل صحيح (8 أرقام على الأقل).' });
    return;
  }

  const insp = db
    .prepare(
      `SELECT * FROM receipt_inspections
       WHERE id = ? AND user_id = ? AND payment_method = ? AND plan_id = ?
         AND used_at IS NULL AND datetime(expires_at) > datetime('now')`
    )
    .get(String(inspectionId || '').trim(), req.authUser!.userId, methodCode, plan.id) as any;

  if (!insp) {
    res.status(400).json({
      error: 'يرجى رفع صورة الإيصال وانتظار إتمام الفحص التلقائي بنجاح قبل الإرسال.',
    });
    return;
  }
  if (!['verified', 'underpaid', 'manual_review'].includes(insp.verdict)) {
    res.status(403).json({
      error: insp.reason || 'تم رفض الإيصال أثناء الفحص التلقائي ولا يمكن إرسال الطلب.',
    });
    return;
  }

  const proofHash = String(insp.proof_hash || '');
  const cleanTxId = String(insp.transaction_id || '').trim();
  const cleanTxRef = String(insp.transaction_reference || cleanTxId).trim();

  // Strict Anti-Reuse Check across ALL primary & secondary columns and ALL statuses
  const dupProof = db
    .prepare(
      'SELECT subscription_request_id, status FROM subscription_requests WHERE proof_hash = ? OR second_proof_hash = ? LIMIT 1'
    )
    .get(proofHash, proofHash) as { subscription_request_id: string; status: string } | undefined;
  if (dupProof) {
    res.status(409).json({
      code: 'DUPLICATE_PROOF',
      error: 'هذا الإيصال أو معرف العملية تم استخدامه من قبل ولا يمكن استخدامه مرة أخرى',
    });
    return;
  }

  if (cleanTxId) {
    const dupId = db
      .prepare(
        `SELECT subscription_request_id FROM subscription_requests
         WHERE (payment_method = ? AND lower(trim(transaction_id)) = lower(trim(?)))
            OR (second_payment_method = ? AND lower(trim(second_transaction_id)) = lower(trim(?)))
         LIMIT 1`
      )
      .get(methodCode, cleanTxId, methodCode, cleanTxId) as { subscription_request_id: string } | undefined;
    if (dupId) {
      res.status(409).json({
        code: 'DUPLICATE_TRANSACTION_ID',
        error: 'هذا الإيصال أو معرف العملية تم استخدامه من قبل ولا يمكن استخدامه مرة أخرى',
      });
      return;
    }
  }

  if (cleanTxRef) {
    const dupRef = db
      .prepare(
        `SELECT subscription_request_id FROM subscription_requests
         WHERE (payment_method = ? AND lower(trim(transaction_reference)) = lower(trim(?)))
            OR (second_payment_method = ? AND lower(trim(second_transaction_reference)) = lower(trim(?)))
         LIMIT 1`
      )
      .get(methodCode, cleanTxRef, methodCode, cleanTxRef) as { subscription_request_id: string } | undefined;
    if (dupRef) {
      res.status(409).json({
        code: 'DUPLICATE_TRANSACTION_REF',
        error: 'هذا الإيصال أو معرف العملية تم استخدامه من قبل ولا يمكن استخدامه مرة أخرى',
      });
      return;
    }
  }

  const requiredAmount = Number(plan.price_mru);
  const isManualReview = insp.verdict === 'manual_review';
  const paidAmount = isManualReview
    ? Number(insp.extracted_amount ?? 0)
    : Number(insp.extracted_amount ?? requiredAmount);
  const isUnderpaid = !isManualReview && paidAmount + 0.01 < requiredAmount;
  const remainingAmount = isManualReview
    ? Math.max(0, Number((requiredAmount - paidAmount).toFixed(2)))
    : isUnderpaid
      ? Math.max(0, Number((requiredAmount - paidAmount).toFixed(2)))
      : 0;
  const initialStatus = isManualReview ? 'manual_review' : isUnderpaid ? 'partial_pending' : 'pending_review';

  const subscriptionRequestId = `SUB-${Date.now().toString(36).toUpperCase()}-${crypto
    .randomBytes(2)
    .toString('hex')
    .toUpperCase()}`;
  const uploadedAt = new Date().toISOString();

  let newReqId = 0;
  const submitTx = db.transaction(() => {
    db.prepare("UPDATE receipt_inspections SET used_at = datetime('now') WHERE id = ?").run(insp.id);

    const insert = db
      .prepare(
        `INSERT INTO subscription_requests (
          subscription_request_id, user_id, plan_id, plan_slug, plan_name,
          amount, paid_amount, remaining_amount, currency, payment_method, beneficiary_name,
          transaction_reference, transaction_id, transaction_at,
          proof_data_url, proof_hash, perceptual_hash,
          sender_phone, extracted_amount, extracted_currency,
          extraction_confidence, risk_level, forensics_json, inspection_status,
          uploaded_at, status, expires_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'MRU', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`
      )
      .run(
        subscriptionRequestId,
        req.authUser!.userId,
        plan.id,
        plan.slug,
        plan.name_ar,
        requiredAmount,
        paidAmount,
        remainingAmount,
        methodRow.code,
        String(insp.beneficiary_name || methodRow.beneficiary_name || ''),
        cleanTxRef,
        cleanTxId,
        String(insp.transaction_at || uploadedAt),
        String(insp.proof_data_url || ''),
        proofHash,
        String(insp.perceptual_hash || ''),
        cleanSenderPhone,
        paidAmount,
        String(insp.extracted_currency || 'MRU'),
        Number(insp.confidence || 0.8),
        String(insp.risk_level || 'normal'),
        String(insp.forensics_json || '{}'),
        isManualReview ? 'manual_review' : 'verified',
        uploadedAt,
        initialStatus
      );
    newReqId = Number(insert.lastInsertRowid);

    db.prepare(
      'INSERT INTO notifications (user_id, title_ar, title_fr, body_ar, body_fr, type) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(
      req.authUser!.userId,
      isUnderpaid
        ? `دفعة أولى مسجلة (${subscriptionRequestId}) — بانتظار إكمال المبلغ`
        : `تم استلام طلب الاشتراك (${subscriptionRequestId})`,
      isUnderpaid
        ? `Paiement partiel enregistré (${subscriptionRequestId})`
        : `Demande d'abonnement reçue (${subscriptionRequestId})`,
      isUnderpaid
        ? `تم تسجيل مبلغ ${paidAmount} أوقية من أصل ${requiredAmount} أوقية للباقة (${plan.name_ar}). المتبقي لإكمال الاشتراك: ${remainingAmount} أوقية عبر زر "إكمال المبلغ".`
        : `طلبك للباقة (${plan.name_ar}) بقيمة ${requiredAmount} أوقية عبر ${methodRow.name_ar} قيد مراجعة الإدارة.`,
      isUnderpaid
        ? `Acompte de ${paidAmount} MRU enregistré sur ${requiredAmount} MRU. Reste à régler : ${remainingAmount} MRU.`
        : `Votre demande (${plan.name_fr}) de ${requiredAmount} MRU via ${methodRow.name_fr} est en cours de vérification.`,
      isUnderpaid ? 'warning' : 'info'
    );
  });
  submitTx();

  logAudit(
    req.authUser!.userId,
    req.authUser!.email,
    'SUBMIT_PAYMENT_REQUEST',
    'subscription_request',
    subscriptionRequestId,
    `Method=${methodRow.code};Plan=${plan.slug};Paid=${paidAmount}/${requiredAmount};Status=${initialStatus}`
  );

  const created = db
    .prepare(
      `SELECT id, subscription_request_id, user_id, plan_id, plan_slug, plan_name,
              amount, paid_amount, remaining_amount, currency, payment_method, beneficiary_name, transaction_reference,
              transaction_id, transaction_at, sender_phone, extracted_amount,
              second_payment_method, second_transaction_id, second_transaction_reference, second_extracted_amount, second_uploaded_at,
              admin_clarification_note, clarification_requested_at,
              uploaded_at, status, rejection_reason, approved_at, starts_at, expires_at, created_at
       FROM subscription_requests WHERE id = ?`
    )
    .get(newReqId) as any;

  const verifyMeta = buildReceiptVerifyUrl(created?.subscription_request_id || subscriptionRequestId);
  res.status(201).json({
    ok: true,
    request: created ? { ...created, verify_sig: verifyMeta.sig, verify_url: verifyMeta.url } : created,
  });
});

// Complete Partial / Underpaid Payment Request ("إكمال المبلغ") linked to the SAME subscriptionRequest
app.post('/api/payment-requests/:id/complete', requireAuth, (req: AuthenticatedRequest, res) => {
  const reqId = Number(req.params.id);
  const { paymentMethod, senderPhone, inspectionId } = req.body ?? {};
  const existingReq = db.prepare('SELECT * FROM subscription_requests WHERE id = ?').get(reqId) as any;
  if (!existingReq || existingReq.user_id !== req.authUser!.userId) {
    res.status(404).json({ error: 'طلب الاشتراك غير موجود.' });
    return;
  }
  if (!['partial_pending', 'needs_info'].includes(existingReq.status)) {
    res.status(400).json({ error: 'هذا الطلب لا يتطلب دفعة تكميلية حالياً.' });
    return;
  }

  const methodCode = String(paymentMethod || '').trim().toLowerCase();
  if (!['sedad', 'masrvi', 'bankily'].includes(methodCode)) {
    res.status(400).json({ error: 'وسيلة الدفع غير صالحة لإكمال المبلغ.' });
    return;
  }

  const cleanPhone = String(senderPhone || '').replace(/[^\d+]/g, '').trim();
  if (cleanPhone.replace(/\D/g, '').length < 8) {
    res.status(400).json({ error: 'يرجى إدخال رقم الهاتف الذي حُوّل منه المبلغ التكميلي.' });
    return;
  }

  const insp = db
    .prepare(
      `SELECT * FROM receipt_inspections
       WHERE id = ? AND user_id = ? AND payment_method = ? AND plan_id = ?
         AND used_at IS NULL AND datetime(expires_at) > datetime('now')`
    )
    .get(String(inspectionId || '').trim(), req.authUser!.userId, methodCode, existingReq.plan_id) as any;

  if (!insp || !['verified', 'underpaid'].includes(insp.verdict)) {
    res.status(400).json({
      error: insp?.reason || 'يرجى رفع صورة إيصال إكمال المبلغ وفحصها أولاً.',
    });
    return;
  }

  const secondHash = String(insp.proof_hash || '');
  const secondTxId = String(insp.transaction_id || '').trim();
  const secondTxRef = String(insp.transaction_reference || secondTxId).trim();

  const dupProof = db
    .prepare(
      'SELECT subscription_request_id FROM subscription_requests WHERE proof_hash = ? OR second_proof_hash = ? LIMIT 1'
    )
    .get(secondHash, secondHash);
  if (dupProof) {
    res.status(409).json({
      code: 'DUPLICATE_PROOF',
      error: 'هذا الإيصال أو معرف العملية تم استخدامه من قبل ولا يمكن استخدامه مرة أخرى',
    });
    return;
  }

  if (secondTxId) {
    const dupId = db
      .prepare(
        `SELECT subscription_request_id FROM subscription_requests
         WHERE (payment_method = ? AND lower(trim(transaction_id)) = lower(trim(?)))
            OR (second_payment_method = ? AND lower(trim(second_transaction_id)) = lower(trim(?)))
         LIMIT 1`
      )
      .get(methodCode, secondTxId, methodCode, secondTxId);
    if (dupId) {
      res.status(409).json({
        code: 'DUPLICATE_TRANSACTION_ID',
        error: 'هذا الإيصال أو معرف العملية تم استخدامه من قبل ولا يمكن استخدامه مرة أخرى',
      });
      return;
    }
  }

  const addedPaid = Number(insp.extracted_amount || 0);
  if (addedPaid <= 0) {
    res.status(400).json({ error: 'تعذر قراءة المبلغ التكميلي من الإيصال.' });
    return;
  }

  const prevPaid = Number(existingReq.paid_amount || existingReq.extracted_amount || 0);
  const totalPaid = Number((prevPaid + addedPaid).toFixed(2));
  const totalRequired = Number(existingReq.amount);
  const newRemaining = Math.max(0, Number((totalRequired - totalPaid).toFixed(2)));
  const nextStatus = newRemaining <= 0.01 ? 'pending_review' : 'partial_pending';
  const uploadedAt = new Date().toISOString();

  db.transaction(() => {
    db.prepare("UPDATE receipt_inspections SET used_at = datetime('now') WHERE id = ?").run(insp.id);
    db.prepare(
      `UPDATE subscription_requests
       SET paid_amount = ?,
           remaining_amount = ?,
           second_payment_method = ?,
           second_transaction_id = ?,
           second_transaction_reference = ?,
           second_transaction_at = ?,
           second_proof_data_url = ?,
           second_proof_hash = ?,
           second_sender_phone = ?,
           second_extracted_amount = ?,
           second_uploaded_at = ?,
           status = ?,
           updated_at = datetime('now')
       WHERE id = ?`
    ).run(
      totalPaid,
      newRemaining,
      methodCode,
      secondTxId,
      secondTxRef,
      String(insp.transaction_at || uploadedAt),
      String(insp.proof_data_url || ''),
      secondHash,
      cleanPhone,
      addedPaid,
      uploadedAt,
      nextStatus,
      reqId
    );

    db.prepare(
      'INSERT INTO notifications (user_id, title_ar, title_fr, body_ar, body_fr, type) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(
      req.authUser!.userId,
      nextStatus === 'pending_review'
        ? `تم إكمال مبلغ الاشتراك (${existingReq.subscription_request_id})`
        : `تم تسجيل دفعة إضافية للطلب (${existingReq.subscription_request_id})`,
      `Complément de paiement enregistré (${existingReq.subscription_request_id})`,
      nextStatus === 'pending_review'
        ? `وصل إجمالي المدفوع إلى ${totalPaid} أوقية من ${totalRequired} أوقية، وأُرسل الطلب لمراجعة الإدارة.`
        : `إجمالي المدفوع الآن ${totalPaid} أوقية، والمتبقي ${newRemaining} أوقية.`,
      `Total payé : ${totalPaid} / ${totalRequired} MRU.`,
      nextStatus === 'pending_review' ? 'info' : 'warning'
    );
  })();

  logAudit(
    req.authUser!.userId,
    req.authUser!.email,
    'COMPLETE_PARTIAL_PAYMENT_REQUEST',
    'subscription_request',
    existingReq.subscription_request_id,
    `Added=${addedPaid};TotalPaid=${totalPaid}/${totalRequired};Status=${nextStatus}`
  );

  const updatedRow = db
    .prepare(
      `SELECT id, subscription_request_id, user_id, plan_id, plan_slug, plan_name,
              amount, paid_amount, remaining_amount, currency, payment_method, beneficiary_name, transaction_reference,
              transaction_id, transaction_at, sender_phone, extracted_amount,
              second_payment_method, second_transaction_id, second_transaction_reference, second_extracted_amount, second_uploaded_at,
              admin_clarification_note, clarification_requested_at,
              uploaded_at, status, rejection_reason, approved_at, starts_at, expires_at, created_at
       FROM subscription_requests WHERE id = ?`
    )
    .get(reqId) as any;

  const updatedVerify = buildReceiptVerifyUrl(updatedRow?.subscription_request_id || existingReq.subscription_request_id);
  res.json({
    ok: true,
    request: updatedRow ? { ...updatedRow, verify_sig: updatedVerify.sig, verify_url: updatedVerify.url } : updatedRow,
  });
});

app.get('/api/payment-requests/mine', requireAuth, (req: AuthenticatedRequest, res) => {
  expireOverdueSubscriptions();
  const requests = db
    .prepare(
      `SELECT id, subscription_request_id, user_id, plan_id, plan_slug, plan_name,
              amount, paid_amount, remaining_amount, currency, payment_method, beneficiary_name, transaction_reference,
              transaction_id, transaction_at, sender_phone, extracted_amount,
              second_payment_method, second_transaction_id, second_transaction_reference, second_extracted_amount, second_uploaded_at,
              admin_clarification_note, clarification_requested_at,
              uploaded_at, status, rejection_reason,
              approved_by, approved_at, starts_at, expires_at, created_at
       FROM subscription_requests
       WHERE user_id = ?
       ORDER BY id DESC LIMIT 30`
    )
    .all(req.authUser!.userId) as any[];
  res.json({
    requests: requests.map((r) => {
      const verify = buildReceiptVerifyUrl(r.subscription_request_id);
      return { ...r, verify_sig: verify.sig, verify_url: verify.url };
    }),
  });
});

// HMAC-verified official receipt verification endpoint (requires authenticated owner or official admin)
app.get('/api/receipts/verify', (req: AuthenticatedRequest, res) => {
  const rid = String(req.query.rid || '').trim().toUpperCase();
  const sig = String(req.query.sig || '').trim();

  if (!rid || !sig || !verifyReceiptVerifyToken(rid, sig)) {
    res.status(403).json({
      valid: false,
      code: 'INVALID_SIGNATURE',
      error: 'توقيع التحقق غير صالح أو تم تعديل بيانات رابط الإيصال.',
    });
    return;
  }

  if (!req.authUser) {
    res.status(401).json({
      valid: false,
      requiresAuth: true,
      code: 'AUTH_REQUIRED',
      error: 'يرجى تسجيل الدخول بحسابك لعرض بيانات الإيصال والتحقق من صلاحيته.',
    });
    return;
  }

  const isOfficialAdmin =
    req.authUser.role === 'admin' && req.authUser.email.trim().toLowerCase() === OFFICIAL_ADMIN_EMAIL;

  const localReq = db
    .prepare(
      `SELECT sr.*, u.name as student_name, u.email as student_email
       FROM subscription_requests sr
       LEFT JOIN users u ON u.id = sr.user_id
       WHERE upper(sr.subscription_request_id) = ?
       LIMIT 1`
    )
    .get(rid) as any;

  if (localReq) {
    if (localReq.user_id !== req.authUser.userId && !isOfficialAdmin) {
      res.status(403).json({
        valid: false,
        code: 'FORBIDDEN',
        error: 'هذا الإيصال مسجل باسم مستخدم آخر ولا يمكنك الاطلاع عليه.',
      });
      return;
    }
    const verify = buildReceiptVerifyUrl(localReq.subscription_request_id);
    res.json({
      valid: true,
      kind: 'local_request',
      verified: localReq.status === 'approved',
      receipt: {
        rid: localReq.subscription_request_id,
        status: localReq.status,
        studentName: localReq.student_name || '',
        studentEmail: localReq.student_email || '',
        planName: localReq.plan_name,
        amount: Number(localReq.amount || 0),
        paidAmount: Number(localReq.paid_amount ?? localReq.amount ?? 0),
        remainingAmount: Number(localReq.remaining_amount || 0),
        currency: localReq.currency || 'MRU',
        paymentMethod: localReq.payment_method,
        beneficiaryName: localReq.beneficiary_name || '',
        transactionId: localReq.transaction_id || '',
        transactionReference: localReq.transaction_reference || '',
        transactionAt: localReq.transaction_at || localReq.uploaded_at,
        approvedAt: localReq.approved_at || null,
        startsAt: localReq.starts_at || null,
        expiresAt: localReq.expires_at || null,
        createdAt: localReq.created_at,
        verifySig: verify.sig,
        verifyUrl: verify.url,
      },
    });
    return;
  }

  const cardTx = db
    .prepare(
      `SELECT pt.*, sp.name_ar as plan_name_ar, sp.name_fr as plan_name_fr,
              us.starts_at, us.expires_at,
              u.name as student_name, u.email as student_email
       FROM payment_transactions pt
       LEFT JOIN subscription_plans sp ON sp.id = pt.plan_id
       LEFT JOIN user_subscriptions us ON us.payment_tx_id = pt.id
       LEFT JOIN users u ON u.id = pt.user_id
       WHERE upper(pt.provider_tx_id) = ?
       LIMIT 1`
    )
    .get(rid) as any;

  if (cardTx) {
    if (cardTx.user_id !== req.authUser.userId && !isOfficialAdmin) {
      res.status(403).json({
        valid: false,
        code: 'FORBIDDEN',
        error: 'هذا الإيصال مسجل باسم مستخدم آخر ولا يمكنك الاطلاع عليه.',
      });
      return;
    }
    const verify = buildReceiptVerifyUrl(cardTx.provider_tx_id);
    res.json({
      valid: true,
      kind: 'card_tx',
      verified: cardTx.status === 'succeeded',
      receipt: {
        rid: cardTx.provider_tx_id,
        status: cardTx.status,
        studentName: cardTx.student_name || cardTx.cardholder_name || '',
        studentEmail: cardTx.student_email || '',
        planName: cardTx.plan_name_ar || cardTx.plan_name_fr || '',
        amount: Number(cardTx.amount_mru || 0),
        paidAmount: Number(cardTx.amount_mru || 0),
        remainingAmount: 0,
        currency: cardTx.currency || 'MRU',
        paymentMethod: cardTx.card_brand || 'card',
        cardBrand: cardTx.card_brand,
        cardLast4: cardTx.card_last4,
        transactionId: cardTx.provider_tx_id,
        transactionReference: cardTx.provider_tx_id,
        transactionAt: cardTx.created_at,
        startsAt: cardTx.starts_at || null,
        expiresAt: cardTx.expires_at || null,
        createdAt: cardTx.created_at,
        verifySig: verify.sig,
        verifyUrl: verify.url,
      },
    });
    return;
  }

  res.status(404).json({
    valid: false,
    code: 'NOT_FOUND',
    error: 'لم يتم العثور على إيصال مطابق لهذا الرمز في سجلات المنصة.',
  });
});

app.get('/api/admin/payment-requests', requireAdminPermission('receipts', 'payments', 'subscriptions'), (req, res) => {
  expireOverdueSubscriptions();
  const statusFilter = String(req.query.status || 'all');
  const where = statusFilter !== 'all' ? 'WHERE sr.status = ?' : '';
  const rows = db
    .prepare(
      `SELECT sr.*, u.name as user_name, u.email as user_email
       FROM subscription_requests sr
       JOIN users u ON u.id = sr.user_id
       ${where}
       ORDER BY CASE WHEN sr.status IN ('pending_review', 'manual_review', 'needs_info', 'partial_pending') THEN 0 ELSE 1 END, sr.id DESC
       LIMIT 150`
    )
    .all(...(statusFilter !== 'all' ? [statusFilter] : []));
  res.json({ requests: rows });
});

app.post('/api/admin/payment-requests/:id/approve', requireAdminPermission('receipts', 'payments', 'subscriptions'), (req: AuthenticatedRequest, res) => {
  const reqId = Number(req.params.id);
  const { forceApprove } = req.body ?? {};
  const requestRow = db.prepare('SELECT * FROM subscription_requests WHERE id = ?').get(reqId) as any;
  if (!requestRow) {
    res.status(404).json({ error: 'Subscription request not found.' });
    return;
  }
  if (!['pending_review', 'manual_review', 'needs_info', 'partial_pending'].includes(requestRow.status)) {
    res.status(400).json({ error: `Request is already ${requestRow.status}.` });
    return;
  }
  const effectivePaid = Number(requestRow.paid_amount || requestRow.extracted_amount || requestRow.amount || 0);
  if (effectivePaid + 0.01 < Number(requestRow.amount || 0) && !forceApprove) {
    res.status(400).json({
      error: `المبلغ المدفوع (${effectivePaid} MRU) أقل من المطلوب (${requestRow.amount} MRU). يرجى انتظار إكمال المبلغ من الطالب أو تأكيد الاعتماد اليدوي.`,
    });
    return;
  }

  const plan = db.prepare('SELECT * FROM subscription_plans WHERE id = ?').get(requestRow.plan_id) as any;
  const durationDays = Number(plan?.duration_days || 30);
  const nowDate = new Date();
  const approvedAtIso = nowDate.toISOString();
  let expiresDate: Date;
  if (plan?.billing_cycle === 'annual' || plan?.slug === 'annual-concours') {
    expiresDate = addFullMonths(nowDate, 12);
  } else {
    expiresDate = new Date(nowDate.getTime() + durationDays * 24 * 60 * 60 * 1000);
  }
  const expiresAtIso = expiresDate.toISOString();
  const paymentId = `PAY-${requestRow.subscription_request_id.replace(/^SUB-/, '')}`;

  let createdSubId = 0;
  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE subscription_requests
       SET status = 'approved', remaining_amount = 0, approved_by = ?, approved_at = ?, starts_at = ?, expires_at = ?, updated_at = datetime('now')
       WHERE id = ? AND status IN ('pending_review', 'manual_review', 'needs_info', 'partial_pending')`
    ).run(req.authUser!.email, approvedAtIso, approvedAtIso, expiresAtIso, reqId);

    db.prepare(
      "UPDATE user_subscriptions SET status = 'expired' WHERE user_id = ? AND status = 'active'"
    ).run(requestRow.user_id);

    const subRes = db
      .prepare(
        `INSERT INTO user_subscriptions (user_id, plan_id, status, starts_at, expires_at, payment_tx_id)
         VALUES (?, ?, 'active', ?, ?, NULL)`
      )
      .run(requestRow.user_id, requestRow.plan_id, approvedAtIso, expiresAtIso);
    createdSubId = Number(subRes.lastInsertRowid);

    db.prepare(
      `INSERT INTO notifications (user_id, title_ar, title_fr, body_ar, body_fr, type, target_scope)
       VALUES (?, ?, ?, ?, ?, 'info', 'current_users')`
    ).run(
      requestRow.user_id,
      `تم اعتماد وتفعيل اشتراكك: ${requestRow.plan_name}`,
      `Abonnement approuvé et activé : ${plan?.name_fr || requestRow.plan_name}`,
      `تمت الموافقة على طلب الدفع رقم ${requestRow.subscription_request_id} وبدأ اشتراكك الفعلي حتى ${expiresAtIso.slice(0, 10)}.`,
      `Votre paiement ${requestRow.subscription_request_id} a été approuvé. Accès actif jusqu'au ${expiresAtIso.slice(0, 10)}.`
    );
  });
  tx();

  broadcastNotificationEvent({
    targetUserId: requestRow.user_id,
    payload: {
      title_ar: `تم اعتماد وتفعيل اشتراكك: ${requestRow.plan_name}`,
      body_ar: `تمت الموافقة على طلب الدفع رقم ${requestRow.subscription_request_id}.`,
      type: 'info',
      created_at: approvedAtIso,
    },
  });

  logAudit(
    req.authUser!.userId,
    req.authUser!.email,
    'APPROVE_PAYMENT_REQUEST',
    'subscription_request',
    requestRow.subscription_request_id,
    `User=${requestRow.user_id};ExpiresAt=${expiresAtIso}`
  );
  res.json({
    ok: true,
    approvedAt: approvedAtIso,
    startsAt: approvedAtIso,
    expiresAt: expiresAtIso,
    paymentId,
    subscriptionId: createdSubId,
    subscriptionRequest: {
      subscriptionRequestId: requestRow.subscription_request_id,
      userId: requestRow.user_id,
      planId: plan?.slug || requestRow.plan_slug,
      planName: requestRow.plan_name,
      amount: requestRow.amount,
      paidAmount: effectivePaid,
      remainingAmount: 0,
      currency: requestRow.currency || 'MRU',
      paymentMethod: requestRow.payment_method,
      status: 'approved',
      createdAt: requestRow.created_at,
      startsAt: approvedAtIso,
      expiresAt: expiresAtIso,
    },
  });
});

app.post('/api/admin/payment-requests/:id/reject', requireAdminPermission('receipts', 'payments', 'subscriptions'), (req: AuthenticatedRequest, res) => {
  const reqId = Number(req.params.id);
  const { rejectionReason } = req.body ?? {};
  const cleanReason = String(rejectionReason || '').trim();
  if (cleanReason.length < 3) {
    res.status(400).json({ error: 'يرجى كتابة سبب الرفض ليظهر للطالب.' });
    return;
  }

  const requestRow = db.prepare('SELECT * FROM subscription_requests WHERE id = ?').get(reqId) as any;
  if (!requestRow) {
    res.status(404).json({ error: 'Subscription request not found.' });
    return;
  }
  if (!['pending_review', 'manual_review', 'partial_pending', 'needs_info'].includes(requestRow.status)) {
    res.status(400).json({ error: `Request is already ${requestRow.status}.` });
    return;
  }

  db.prepare(
    `UPDATE subscription_requests
     SET status = 'rejected', rejection_reason = ?, approved_by = ?, approved_at = datetime('now'), updated_at = datetime('now')
     WHERE id = ?`
  ).run(cleanReason, req.authUser!.email, reqId);

  db.prepare(
    `INSERT INTO notifications (user_id, title_ar, title_fr, body_ar, body_fr, type, target_scope)
     VALUES (?, ?, ?, ?, ?, 'warning', 'current_users')`
  ).run(
    requestRow.user_id,
    `تم رفض طلب الاشتراك (${requestRow.subscription_request_id})`,
    `Demande refusée (${requestRow.subscription_request_id})`,
    `تعذر اعتماد الطلب للسبب التالي: ${cleanReason}`,
    `Motif du refus : ${cleanReason}`
  );

  logAudit(
    req.authUser!.userId,
    req.authUser!.email,
    'REJECT_PAYMENT_REQUEST',
    'subscription_request',
    requestRow.subscription_request_id,
    cleanReason
  );
  res.json({ ok: true });
});

app.post('/api/admin/payment-requests/:id/request-info', requireAdminPermission('receipts', 'payments', 'subscriptions'), (req: AuthenticatedRequest, res) => {
  const reqId = Number(req.params.id);
  const { clarificationNote } = req.body ?? {};
  const cleanNote = String(clarificationNote || '').trim();
  if (cleanNote.length < 3) {
    res.status(400).json({ error: 'يرجى كتابة التوضيح أو المستند الإضافي المطلوب من الطالب.' });
    return;
  }

  const requestRow = db.prepare('SELECT * FROM subscription_requests WHERE id = ?').get(reqId) as any;
  if (!requestRow) {
    res.status(404).json({ error: 'Subscription request not found.' });
    return;
  }
  if (!['pending_review', 'manual_review', 'partial_pending', 'needs_info'].includes(requestRow.status)) {
    res.status(400).json({ error: `Request is already ${requestRow.status}.` });
    return;
  }

  db.prepare(
    `UPDATE subscription_requests
     SET status = 'needs_info', admin_clarification_note = ?, clarification_requested_at = datetime('now'), updated_at = datetime('now')
     WHERE id = ?`
  ).run(cleanNote.slice(0, 600), reqId);

  db.prepare(
    `INSERT INTO notifications (user_id, title_ar, title_fr, body_ar, body_fr, type, target_scope)
     VALUES (?, ?, ?, ?, ?, 'alert', 'current_users')`
  ).run(
    requestRow.user_id,
    `مطلوب معلومات إضافية لطلب الاشتراك (${requestRow.subscription_request_id})`,
    `Complément d'information demandé (${requestRow.subscription_request_id})`,
    `تطلب الإدارة توضيحاً أو إيصالاً مكملاً لطلبك: ${cleanNote}`,
    `L’administration demande une précision : ${cleanNote}`
  );

  logAudit(
    req.authUser!.userId,
    req.authUser!.email,
    'REQUEST_INFO_PAYMENT_REQUEST',
    'subscription_request',
    requestRow.subscription_request_id,
    cleanNote
  );
  res.json({ ok: true });
});

app.put('/api/admin/payment-methods/:code', requireAdminPermission('payments', 'subscriptions', 'settings'), (req: AuthenticatedRequest, res) => {
  const code = String(req.params.code || '').trim().toLowerCase();
  const { beneficiary_name, account_number, instructions_ar, instructions_fr, active } = req.body ?? {};
  const existing = db.prepare('SELECT code FROM payment_methods WHERE code = ?').get(code);
  if (!existing) {
    res.status(404).json({ error: 'Payment method not found.' });
    return;
  }
  db.prepare(
    `UPDATE payment_methods
     SET beneficiary_name = ?, account_number = ?, instructions_ar = ?, instructions_fr = ?, active = ?, updated_at = datetime('now')
     WHERE code = ?`
  ).run(
    String(beneficiary_name || '').trim(),
    String(account_number || '').trim(),
    String(instructions_ar || '').trim(),
    String(instructions_fr || '').trim(),
    active === false || active === 0 ? 0 : 1,
    code
  );
  logAudit(req.authUser!.userId, req.authUser!.email, 'UPDATE_PAYMENT_METHOD', 'payment_method', code);
  res.json({ ok: true });
});

app.post('/api/admin/payment-methods', requireAdminPermission('payments', 'subscriptions', 'settings'), (req: AuthenticatedRequest, res) => {
  const { code, name_ar, name_fr, beneficiary_name, account_number, instructions_ar, instructions_fr, requires_receipt, active } =
    req.body ?? {};
  const cleanCode = String(code || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '');
  if (!cleanCode || !name_ar) {
    res.status(400).json({ error: 'Payment method code and Arabic name are required.' });
    return;
  }
  const existing = db.prepare('SELECT code FROM payment_methods WHERE code = ?').get(cleanCode);
  if (existing) {
    res.status(409).json({ error: 'Payment method code already exists.' });
    return;
  }
  const nextOrder = (db.prepare('SELECT COUNT(*) as c FROM payment_methods').get() as { c: number }).c + 1;
  db.prepare(
    `INSERT INTO payment_methods (code, name_ar, name_fr, beneficiary_name, account_number, instructions_ar, instructions_fr, requires_receipt, active, display_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    cleanCode,
    String(name_ar).trim(),
    String(name_fr || name_ar).trim(),
    String(beneficiary_name || '').trim(),
    String(account_number || '').trim(),
    String(instructions_ar || '').trim(),
    String(instructions_fr || instructions_ar || '').trim(),
    requires_receipt === false ? 0 : 1,
    active === false ? 0 : 1,
    nextOrder
  );
  logAudit(req.authUser!.userId, req.authUser!.email, 'CREATE_PAYMENT_METHOD', 'payment_method', cleanCode);
  res.status(201).json({ ok: true, code: cleanCode });
});

app.put('/api/admin/plan-limits', requireAdminPermission('subscriptions', 'settings'), (req: AuthenticatedRequest, res) => {
  const {
    daily_questions_limit,
    daily_lessons_limit,
    daily_exams_limit,
    allow_official_sim,
    allow_review_center,
  } = req.body ?? {};
  db.prepare(
    `UPDATE plan_limits
     SET daily_questions_limit = ?, daily_lessons_limit = ?, daily_exams_limit = ?,
         allow_official_sim = ?, allow_review_center = ?, updated_at = datetime('now')
     WHERE plan_tier = 'free'`
  ).run(
    Math.max(1, Number(daily_questions_limit || 25)),
    Math.max(1, Number(daily_lessons_limit || 3)),
    Math.max(1, Number(daily_exams_limit || 2)),
    allow_official_sim ? 1 : 0,
    allow_review_center === false ? 0 : 1
  );
  logAudit(req.authUser!.userId, req.authUser!.email, 'UPDATE_PLAN_LIMITS', 'plan_limits', 'free');
  res.json({ ok: true, freeLimits: getPlanLimitsForTier('free') });
});

app.put('/api/admin/plans/:id', requireAdminPermission('subscriptions'), (req: AuthenticatedRequest, res) => {
  const id = Number(req.params.id);
  const { name_ar, name_fr, price_mru, duration_days, active } = req.body ?? {};
  db.prepare(
    `UPDATE subscription_plans
     SET name_ar = COALESCE(?, name_ar),
         name_fr = COALESCE(?, name_fr),
         price_mru = COALESCE(?, price_mru),
         duration_days = COALESCE(?, duration_days),
         active = COALESCE(?, active)
     WHERE id = ?`
  ).run(
    name_ar ? String(name_ar).trim() : null,
    name_fr ? String(name_fr).trim() : null,
    price_mru !== undefined ? Math.max(0, Number(price_mru)) : null,
    duration_days !== undefined ? Math.max(1, Number(duration_days)) : null,
    active !== undefined ? (active ? 1 : 0) : null,
    id
  );
  logAudit(req.authUser!.userId, req.authUser!.email, 'UPDATE_PLAN', 'subscription_plan', id);
  res.json({ ok: true });
});

app.get('/api/admin/subscriptions', requireAdminPermission('subscriptions', 'payments', 'receipts', 'transactions'), (_req, res) => {
  expireOverdueSubscriptions();
  const plans = db.prepare('SELECT * FROM subscription_plans ORDER BY display_order ASC').all() as any[];
  const subscriptions = db
    .prepare(
      `SELECT us.*, u.name as user_name, u.email as user_email, sp.name_ar, sp.name_fr
       FROM user_subscriptions us
       JOIN users u ON u.id = us.user_id
       JOIN subscription_plans sp ON sp.id = us.plan_id
       ORDER BY us.id DESC LIMIT 100`
    )
    .all();
  const requests = db
    .prepare(
      `SELECT sr.*, u.name as user_name, u.email as user_email
       FROM subscription_requests sr
       JOIN users u ON u.id = sr.user_id
       ORDER BY CASE WHEN sr.status IN ('pending_review', 'manual_review', 'partial_pending', 'needs_info') THEN 0 ELSE 1 END, sr.id DESC
       LIMIT 150`
    )
    .all();
  const paymentMethods = db
    .prepare('SELECT * FROM payment_methods ORDER BY display_order ASC')
    .all();
  res.json({
    plans: plans.map((p) => ({
      ...p,
      features_ar: parseJson(p.features_ar_json, []),
      features_fr: parseJson(p.features_fr_json, []),
    })),
    subscriptions,
    requests,
    paymentMethods,
    freeLimits: getPlanLimitsForTier('free'),
    gatewayMode: 'dual_card_and_manual_local',
  });
});

// =====================================================================
// SITE & INTRO VIDEO ANALYTICS + ADMIN SECURITY RISK LOG
// =====================================================================
app.post('/api/analytics/event', (req: AuthenticatedRequest, res) => {
  const b = req.body ?? {};
  const allowedEvents = new Set([
    'site_visit',
    'page_view',
    'site_click',
    'video_view',
    'video_click',
    'video_play',
    'video_pause',
    'video_resume',
    'video_unmute',
    'video_progress',
    'video_complete',
  ]);
  const eventType = String(b.eventType || '').trim();
  if (!allowedEvents.has(eventType)) {
    res.status(400).json({ error: 'Unsupported analytics event type' });
    return;
  }

  db.prepare(
    `INSERT INTO analytics_events
     (event_type, page_view, user_id, session_id, target, media_id, position_seconds, duration_seconds, max_percent, metadata_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    eventType,
    String(b.pageView || '').slice(0, 80),
    req.authUser?.userId || null,
    String(b.sessionId || '').slice(0, 80),
    String(b.target || '').slice(0, 120),
    String(b.mediaId || '').slice(0, 80),
    Math.max(0, Number(b.positionSeconds || 0)),
    Math.max(0, Number(b.durationSeconds || 0)),
    Math.min(100, Math.max(0, Number(b.maxPercent || 0))),
    JSON.stringify(b.metadata && typeof b.metadata === 'object' ? b.metadata : {})
  );
  res.json({ ok: true });
});

app.get('/api/admin/analytics', requireAdminPermission('dashboard', 'audit_logs'), (_req, res) => {
  const dailyVisits = (
    db
      .prepare(
        `SELECT COUNT(DISTINCT CASE WHEN session_id != '' THEN session_id ELSE id END) as c
         FROM analytics_events WHERE event_type IN ('site_visit', 'page_view') AND datetime(created_at) >= datetime('now', '-1 day')`
      )
      .get() as { c: number }
  ).c;
  const weeklyVisits = (
    db
      .prepare(
        `SELECT COUNT(DISTINCT CASE WHEN session_id != '' THEN session_id ELSE id END) as c
         FROM analytics_events WHERE event_type IN ('site_visit', 'page_view') AND datetime(created_at) >= datetime('now', '-7 days')`
      )
      .get() as { c: number }
  ).c;
  const monthlyVisits = (
    db
      .prepare(
        `SELECT COUNT(DISTINCT CASE WHEN session_id != '' THEN session_id ELSE id END) as c
         FROM analytics_events WHERE event_type IN ('site_visit', 'page_view') AND datetime(created_at) >= datetime('now', '-30 days')`
      )
      .get() as { c: number }
  ).c;
  const totalPageViews = (
    db.prepare("SELECT COUNT(*) as c FROM analytics_events WHERE event_type = 'page_view'").get() as { c: number }
  ).c;
  const totalClicks = (
    db.prepare("SELECT COUNT(*) as c FROM analytics_events WHERE event_type = 'site_click'").get() as { c: number }
  ).c;
  const topPages = db
    .prepare(
      `SELECT page_view as page, COUNT(*) as views
       FROM analytics_events WHERE event_type = 'page_view' AND page_view != ''
       GROUP BY page_view ORDER BY views DESC LIMIT 10`
    )
    .all();

  const videoStatsRow = db
    .prepare(
      `SELECT
         SUM(CASE WHEN event_type = 'video_view' THEN 1 ELSE 0 END) as impressions,
         SUM(CASE WHEN event_type = 'video_click' THEN 1 ELSE 0 END) as clicks,
         SUM(CASE WHEN event_type = 'video_play' THEN 1 ELSE 0 END) as plays,
         SUM(CASE WHEN event_type = 'video_pause' THEN 1 ELSE 0 END) as pauses,
         SUM(CASE WHEN event_type = 'video_resume' THEN 1 ELSE 0 END) as resumes,
         SUM(CASE WHEN event_type = 'video_unmute' THEN 1 ELSE 0 END) as unmutes,
         SUM(CASE WHEN event_type = 'video_complete' THEN 1 ELSE 0 END) as completions
       FROM analytics_events
       WHERE media_id = 'tadribi-intro' OR event_type LIKE 'video_%'`
    )
    .get() as any;

  const sessionWatch = db
    .prepare(
      `SELECT
         MAX(position_seconds) as max_pos,
         MAX(max_percent) as max_pct
       FROM analytics_events
       WHERE (media_id = 'tadribi-intro' OR event_type LIKE 'video_%') AND session_id != ''
       GROUP BY session_id`
    )
    .all() as Array<{ max_pos: number; max_pct: number }>;

  const totalWatchSeconds = Number(
    sessionWatch.reduce((acc, s) => acc + Number(s.max_pos || 0), 0).toFixed(1)
  );
  const avgWatchPercent =
    sessionWatch.length > 0
      ? Number(
          (sessionWatch.reduce((acc, s) => acc + Number(s.max_pct || 0), 0) / sessionWatch.length).toFixed(1)
        )
      : 0;

  res.json({
    site: {
      dailyVisits,
      weeklyVisits,
      monthlyVisits,
      totalPageViews,
      totalClicks,
      topPages,
    },
    introVideo: {
      impressions: Number(videoStatsRow?.impressions || 0),
      clicks: Number(videoStatsRow?.clicks || 0),
      plays: Number(videoStatsRow?.plays || 0),
      pauses: Number(videoStatsRow?.pauses || 0),
      resumes: Number(videoStatsRow?.resumes || 0),
      unmutes: Number(videoStatsRow?.unmutes || 0),
      completions: Number(videoStatsRow?.completions || 0),
      uniqueWatchers: sessionWatch.length,
      totalWatchSeconds,
      avgWatchPercent,
    },
  });
});

app.get('/api/admin/security-events', requireAdminPermission('audit_logs', 'receipts', 'payments'), (req, res) => {
  const risk = String(req.query.risk_level || 'all').trim();
  const allowed = ['normal', 'warning', 'suspicious', 'fraud_rejected'];
  const where = allowed.includes(risk) ? 'WHERE risk_level = ?' : '';
  const events = db
    .prepare(
      `SELECT
         id,
         firebase_uid AS uid,
         user_id,
         user_name,
         user_email,
         phone AS sender_phone,
         payment_method,
         activity_type,
         risk_level,
         reason,
         technical_details_json AS details_json,
         request_ref AS linked_request_id,
         created_at
       FROM security_events
       ${where}
       ORDER BY id DESC LIMIT 200`
    )
    .all(...(allowed.includes(risk) ? [risk] : []));
  res.json({ events });
});

// Full JSON Backup & Restore
app.get('/api/admin/backup', requireAdminPermission('settings', 'administrators'), (req: AuthenticatedRequest, res) => {
  const snapshot = {
    version: '1.0',
    exported_at: new Date().toISOString(),
    tracks: db.prepare('SELECT * FROM tracks').all(),
    subjects: db.prepare('SELECT * FROM subjects').all(),
    lessons: db.prepare('SELECT * FROM lessons').all(),
    summaries: db.prepare('SELECT * FROM summaries').all(),
    questions: db.prepare('SELECT * FROM questions').all(),
    exam_configs: db.prepare('SELECT * FROM exam_configs').all(),
    notifications: db.prepare('SELECT * FROM notifications').all(),
    app_settings: db.prepare('SELECT * FROM app_settings').all(),
  };
  logAudit(req.authUser!.userId, req.authUser!.email, 'EXPORT_BACKUP', 'database', 'snapshot');
  res.json(snapshot);
});

app.post('/api/admin/restore', requireAdminPermission('settings', 'administrators'), (req: AuthenticatedRequest, res) => {
  const snap = req.body ?? {};
  if (!snap || !Array.isArray(snap.lessons) || !Array.isArray(snap.questions)) {
    res.status(400).json({ error: 'Invalid backup snapshot format' });
    return;
  }

  const restoreTx = db.transaction(() => {
    if (Array.isArray(snap.tracks)) {
      const stmt = db.prepare(
        'INSERT OR REPLACE INTO tracks (id, slug, name_ar, name_fr, description_ar, description_fr, active) VALUES (?, ?, ?, ?, ?, ?, ?)'
      );
      for (const t of snap.tracks) {
        stmt.run(t.id, t.slug, t.name_ar, t.name_fr, t.description_ar, t.description_fr, t.active);
      }
    }
    if (Array.isArray(snap.questions)) {
      const stmt = db.prepare(
        `INSERT OR IGNORE INTO questions (
          subject_slug, track, level, topic_ar, topic_fr, skill_ar, skill_fr, difficulty,
          stem_ar, stem_speech_ar, stem_fr, options_ar_json, options_speech_ar_json, options_fr_json,
          correct_index, explanation_ar, explanation_speech_ar, explanation_fr, fingerprint_hash, verified
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      for (const q of snap.questions) {
        stmt.run(
          q.subject_slug,
          q.track,
          q.level,
          q.topic_ar,
          q.topic_fr,
          q.skill_ar,
          q.skill_fr,
          q.difficulty,
          q.stem_ar,
          q.stem_speech_ar,
          q.stem_fr,
          q.options_ar_json,
          q.options_speech_ar_json,
          q.options_fr_json,
          q.correct_index,
          q.explanation_ar,
          q.explanation_speech_ar,
          q.explanation_fr,
          q.fingerprint_hash || normalizeQuestionFingerprint(q.stem_ar || '', q.stem_fr || ''),
          q.verified ?? 1
        );
      }
    }
  });
  restoreTx();
  logAudit(req.authUser!.userId, req.authUser!.email, 'RESTORE_BACKUP', 'database', 'snapshot');
  res.json({ ok: true });
});

// =====================================================================
// MODULAR FEATURE ROUTERS (NARDOPAY, FILES, TEACHER SECTIONS, SCHOOLS, SOCIAL/VERIFICATION, ADMIN RBAC)
// =====================================================================
app.use('/api', createPaymentRouter());
app.use('/api', createTeacherRouter());
app.use('/api', createSchoolRouter());
app.use('/api', createSocialRouter());
app.use('/api', createAdminRouter());

// =====================================================================
// VITE MIDDLEWARE (DEV) OR STATIC ASSETS (PROD)
// =====================================================================
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    const indexHtmlPath = path.join(distDir, 'index.html');
    if (fs.existsSync(distDir)) {
      app.use(
        '/assets',
        express.static(path.join(distDir, 'assets'), {
          maxAge: '1y',
          immutable: true,
        })
      );
      app.use(
        express.static(distDir, {
          index: false,
          setHeaders: (res, filePath) => {
            if (filePath.endsWith('.html')) {
              res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            } else if (filePath.endsWith('sw.js')) {
              res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
              res.setHeader('Service-Worker-Allowed', '/mobile');
            } else if (filePath.endsWith('.webmanifest')) {
              res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
              res.setHeader('Cache-Control', 'no-cache, must-revalidate');
            }
          },
        })
      );
    }

    app.use('/api', (_req, res) => {
      res.status(404).json({ error: 'API endpoint not found' });
    });

    app.use('/assets', (_req, res) => {
      res.status(404).type('text/plain').send('Asset not found');
    });

    app.get('*', (_req, res) => {
      if (fs.existsSync(indexHtmlPath)) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.sendFile(indexHtmlPath);
      } else {
        res.json({ status: 'ok', service: 'tedribi-api' });
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Plateforme de Formation Libre running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
