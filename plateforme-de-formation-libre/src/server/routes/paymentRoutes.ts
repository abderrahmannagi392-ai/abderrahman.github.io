import crypto from 'crypto';
import express, { Router } from 'express';
import {
  buildReceiptVerifyUrl,
  getUserAdminPermissions,
  isOfficialSuperAdminEmail,
  PUBLIC_APP_ORIGIN,
  requireAuth,
  type AuthenticatedRequest,
} from '../auth';
import { db, expireOverdueSubscriptions, logAudit } from '../db';
import { broadcastNotificationEvent } from '../realtime';
import {
  deleteStoredFile,
  readStoredFile,
  storeBinaryFile,
} from '../storage';

function addFullMonths(baseDate: Date, months: number): Date {
  const target = new Date(baseDate.getTime());
  const originalDay = target.getUTCDate();
  target.setUTCDate(1);
  target.setUTCMonth(target.getUTCMonth() + months);
  const daysInTargetMonth = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(originalDay, daysInTargetMonth));
  return target;
}

function getUserActiveSubscriptionSnapshot(userId: number) {
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
  return row || null;
}

function getNardoPayConfig() {
  const apiKey = (process.env.NARDOPAY_API_KEY || '').trim();
  const webhookSecret = (process.env.NARDOPAY_WEBHOOK_SECRET || '').trim();
  const apiBase = (
    process.env.NARDOPAY_BASE_URL ||
    process.env.NARDOPAY_API_BASE_URL ||
    'https://api.nardopay.com/v1'
  )
    .trim()
    .replace(/\/+$/, '');
  const merchantId = (process.env.NARDOPAY_MERCHANT_ID || '').trim();
  const widgetScriptUrl = (
    process.env.NARDOPAY_WIDGET_URL || 'https://checkout.nardopay.com/widget.js'
  ).trim();
  return {
    apiKey,
    webhookSecret,
    apiBase,
    merchantId,
    widgetScriptUrl,
    configured: Boolean(apiKey),
  };
}

function verifyNardoPayWebhookSignature(
  rawBody: Buffer,
  signatureHeader: string,
  secret: string
): boolean {
  const cleanSig = String(signatureHeader || '').trim().replace(/^sha256=/i, '');
  if (!cleanSig || !secret) return false;

  const expectedHex = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const expectedB64 = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');

  for (const expected of [expectedHex, expectedB64]) {
    const a = Buffer.from(cleanSig, 'utf8');
    const b = Buffer.from(expected, 'utf8');
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
      return true;
    }
  }
  return false;
}

function canUserAccessFile(
  fileRecord: { owner_user_id: number; entity_type: string; entity_id: string; visibility: string },
  authUser?: AuthenticatedRequest['authUser']
): boolean {
  if (fileRecord.visibility === 'public') return true;
  if (!authUser) return false;
  if (fileRecord.owner_user_id === authUser.userId) return true;
  if (isOfficialSuperAdminEmail(authUser.email) && authUser.role === 'admin') return true;

  const perms = new Set(getUserAdminPermissions(authUser.userId, authUser.email));
  if (perms.has('files') || perms.has('receipts') || perms.has('verification') || perms.has('schools')) {
    return true;
  }

  if (fileRecord.visibility === 'section' || fileRecord.entity_type === 'section_lesson' || fileRecord.entity_type === 'section_test') {
    const sectionId = Number(fileRecord.entity_id || 0);
    if (sectionId > 0) {
      const owner = db
        .prepare('SELECT id FROM teacher_sections WHERE id = ? AND teacher_user_id = ?')
        .get(sectionId, authUser.userId);
      if (owner) return true;
      const member = db
        .prepare("SELECT id FROM section_members WHERE section_id = ? AND user_id = ? AND status = 'active'")
        .get(sectionId, authUser.userId);
      if (member) return true;
      const assistant = db
        .prepare('SELECT id FROM section_assistants WHERE section_id = ? AND user_id = ?')
        .get(sectionId, authUser.userId);
      if (assistant) return true;
    }
  }

  if (fileRecord.visibility === 'school' || fileRecord.entity_type === 'school_material') {
    const schoolId = Number(fileRecord.entity_id || 0);
    if (schoolId > 0) {
      const owner = db
        .prepare('SELECT id FROM schools WHERE id = ? AND owner_user_id = ?')
        .get(schoolId, authUser.userId);
      if (owner) return true;
      const teacher = db
        .prepare("SELECT id FROM school_teachers WHERE school_id = ? AND user_id = ? AND status = 'active'")
        .get(schoolId, authUser.userId);
      if (teacher) return true;
      const student = db
        .prepare("SELECT id FROM school_students WHERE school_id = ? AND user_id = ? AND status = 'active'")
        .get(schoolId, authUser.userId);
      if (student) return true;
    }
  }

  return false;
}

export const nardopayWebhookHandler: express.RequestHandler = (req, res) => {
  const cfg = getNardoPayConfig();
  if (!cfg.webhookSecret) {
    res.status(503).json({
      code: 'WEBHOOK_SECRET_NOT_CONFIGURED',
      error: 'NardoPay webhook secret is not configured on server.',
    });
    return;
  }

  const rawBody = Buffer.isBuffer(req.body)
    ? req.body
    : Buffer.from(typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {}), 'utf8');

  const sigHeader = String(
    req.headers['x-nardopay-signature'] ||
      req.headers['x-webhook-signature'] ||
      req.headers['x-signature'] ||
      ''
  );

  if (!verifyNardoPayWebhookSignature(rawBody, sigHeader, cfg.webhookSecret)) {
    res.status(401).json({
      code: 'INVALID_WEBHOOK_SIGNATURE',
      error: 'Invalid webhook signature',
    });
    return;
  }

  let event: any = {};
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    res.status(400).json({ error: 'Invalid JSON payload' });
    return;
  }

  const eventId = String(
    event?.event_id || event?.id || crypto.createHash('sha256').update(rawBody).digest('hex')
  ).trim();
  const eventType = String(event?.event || event?.type || event?.event_type || '').trim().toLowerCase();
  const data = event?.data && typeof event.data === 'object' ? event.data : event;
  const orderId = String(
    data?.order_id || data?.metadata?.order_id || data?.reference || event?.order_id || ''
  ).trim();
  const providerTxId = String(
    data?.transaction_id || data?.tx_id || data?.payment_id || data?.id || eventId
  ).trim();

  // Deduplication check
  const existingEvent = db
    .prepare('SELECT id FROM nardopay_webhook_events WHERE event_id = ?')
    .get(eventId);
  if (existingEvent) {
    res.json({ ok: true, duplicate: true });
    return;
  }

  if (eventType === 'webhook.test' || eventType === 'test') {
    db.prepare(
      `INSERT INTO nardopay_webhook_events (event_id, event_type, order_id, provider_tx_id, signature_verified, status, payload_json)
       VALUES (?, ?, ?, ?, 1, 'acknowledged', ?)`
    ).run(eventId, eventType, orderId, providerTxId, rawBody.toString('utf8').slice(0, 12000));
    res.json({ ok: true, eventType: 'webhook.test' });
    return;
  }

  const order = orderId
    ? (db.prepare('SELECT * FROM payment_orders WHERE order_id = ?').get(orderId) as any)
    : null;

  if (!order) {
    db.prepare(
      `INSERT INTO nardopay_webhook_events (event_id, event_type, order_id, provider_tx_id, signature_verified, status, payload_json)
       VALUES (?, ?, ?, ?, 1, 'order_not_found', ?)`
    ).run(eventId, eventType, orderId, providerTxId, rawBody.toString('utf8').slice(0, 12000));
    res.status(404).json({ error: 'Order not found' });
    return;
  }

  if (['payment.completed', 'payment.succeeded', 'subscription.renewed'].includes(eventType)) {
    const incomingAmount = Number(data?.amount ?? order.amount);
    const incomingCurrency = String(data?.currency || order.currency || 'MRU').trim().toUpperCase();
    const expectedAmount = Number(order.amount);
    const expectedCurrency = String(order.currency || 'MRU').trim().toUpperCase();

    if (
      !Number.isFinite(incomingAmount) ||
      Math.abs(incomingAmount - expectedAmount) > 0.01 ||
      incomingCurrency !== expectedCurrency
    ) {
      db.prepare(
        `INSERT INTO nardopay_webhook_events (event_id, event_type, order_id, provider_tx_id, signature_verified, status, payload_json)
         VALUES (?, ?, ?, ?, 1, 'amount_mismatch', ?)`
      ).run(eventId, eventType, orderId, providerTxId, rawBody.toString('utf8').slice(0, 12000));
      res.status(422).json({ error: 'Amount or currency mismatch' });
      return;
    }

    if (order.status === 'completed') {
      db.prepare(
        `INSERT INTO nardopay_webhook_events (event_id, event_type, order_id, provider_tx_id, signature_verified, status, payload_json)
         VALUES (?, ?, ?, ?, 1, 'already_completed', ?)`
      ).run(eventId, eventType, orderId, providerTxId, rawBody.toString('utf8').slice(0, 12000));
      res.json({ ok: true, alreadyCompleted: true });
      return;
    }

    const plan = db.prepare('SELECT * FROM subscription_plans WHERE id = ?').get(order.plan_id) as any;
    const now = new Date();
    const startsAtIso = now.toISOString();
    const durationDays = Number(plan?.duration_days || 30);
    const expiresDate =
      plan?.billing_cycle === 'annual' || plan?.slug === 'annual-concours'
        ? addFullMonths(now, 12)
        : new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);
    const expiresAtIso = expiresDate.toISOString();

    const activateTx = db.transaction(() => {
      db.prepare(
        `INSERT INTO nardopay_webhook_events (event_id, event_type, order_id, provider_tx_id, signature_verified, status, payload_json)
         VALUES (?, ?, ?, ?, 1, 'processed', ?)`
      ).run(eventId, eventType, orderId, providerTxId, rawBody.toString('utf8').slice(0, 12000));

      db.prepare(
        `UPDATE payment_orders
         SET status = 'completed', provider_tx_id = ?, verified_at = datetime('now'), updated_at = datetime('now')
         WHERE id = ?`
      ).run(providerTxId, order.id);

      const userRow = db.prepare('SELECT name FROM users WHERE id = ?').get(order.user_id) as
        | { name?: string }
        | undefined;

      const txRes = db
        .prepare(
          `INSERT INTO payment_transactions (
            user_id, plan_id, amount_mru, amount_eur, currency,
            card_brand, card_last4, card_exp_month, card_exp_year, cardholder_name,
            provider, provider_tx_id, status
          ) VALUES (?, ?, ?, ?, ?, 'nardopay', 'HOST', 0, 0, ?, 'nardopay', ?, 'succeeded')`
        )
        .run(
          order.user_id,
          order.plan_id,
          Number(plan?.price_mru ?? order.amount),
          Number(plan?.price_eur ?? 0),
          expectedCurrency,
          userRow?.name || 'NardoPay Checkout',
          providerTxId || order.order_id
        );
      const txRowId = Number(txRes.lastInsertRowid);

      db.prepare("UPDATE user_subscriptions SET status = 'expired' WHERE user_id = ? AND status = 'active'").run(
        order.user_id
      );
      db.prepare(
        `INSERT INTO user_subscriptions (user_id, plan_id, status, starts_at, expires_at, payment_tx_id)
         VALUES (?, ?, 'active', ?, ?, ?)`
      ).run(order.user_id, order.plan_id, startsAtIso, expiresAtIso, txRowId);

      const titleAr = `تم تأكيد الدفع وتفعيل باقة ${plan?.name_ar || 'الاشتراك'}`;
      const bodyAr = `تم تأكيد الدفع عبر NardoPay بنجاح (الطلب: ${order.order_id}). اشتراكك نشط الآن حتى ${expiresAtIso.slice(0, 10)}.`;
      const notifRes = db
        .prepare(
          `INSERT INTO notifications (user_id, title_ar, title_fr, body_ar, body_fr, type, target_scope)
           VALUES (?, ?, ?, ?, ?, 'info', 'current_users')`
        )
        .run(
          order.user_id,
          titleAr,
          `Paiement confirmé : ${plan?.name_fr || 'Abonnement'}`,
          bodyAr,
          `Paiement confirmé via NardoPay (${order.order_id}) jusqu'au ${expiresAtIso.slice(0, 10)}.`
        );

      broadcastNotificationEvent({
        targetUserId: order.user_id,
        targetScope: 'targeted',
        payload: {
          id: Number(notifRes.lastInsertRowid),
          title_ar: titleAr,
          body_ar: bodyAr,
          type: 'info',
          created_at: startsAtIso,
        },
      });
    });

    activateTx();
    logAudit(
      order.user_id,
      'nardopay-webhook',
      'NARDOPAY_PAYMENT_COMPLETED',
      'payment_order',
      order.order_id,
      `tx=${providerTxId};event=${eventType}`
    );
    res.json({ ok: true, status: 'completed' });
    return;
  }

  if (['payment.failed', 'payment.cancelled', 'payment.expired'].includes(eventType)) {
    const failReason = String(data?.failure_reason || data?.reason || eventType);
    const nextStatus =
      eventType === 'payment.cancelled'
        ? 'cancelled'
        : eventType === 'payment.expired'
          ? 'expired'
          : 'failed';
    db.transaction(() => {
      db.prepare(
        `INSERT INTO nardopay_webhook_events (event_id, event_type, order_id, provider_tx_id, signature_verified, status, payload_json)
         VALUES (?, ?, ?, ?, 1, 'processed', ?)`
      ).run(eventId, eventType, orderId, providerTxId, rawBody.toString('utf8').slice(0, 12000));
      db.prepare(
        `UPDATE payment_orders
         SET status = ?, failure_reason = ?, provider_tx_id = COALESCE(NULLIF(?, ''), provider_tx_id), updated_at = datetime('now')
         WHERE id = ? AND status = 'pending'`
      ).run(nextStatus, failReason.slice(0, 300), providerTxId, order.id);
    })();

    logAudit(
      order.user_id,
      'nardopay-webhook',
      'NARDOPAY_PAYMENT_FAILED',
      'payment_order',
      order.order_id,
      failReason
    );
    res.json({ ok: true, status: nextStatus });
    return;
  }

  db.prepare(
    `INSERT INTO nardopay_webhook_events (event_id, event_type, order_id, provider_tx_id, signature_verified, status, payload_json)
     VALUES (?, ?, ?, ?, 1, 'ignored_event', ?)`
  ).run(eventId, eventType || 'unknown', orderId, providerTxId, rawBody.toString('utf8').slice(0, 12000));
  res.json({ ok: true, ignored: true });
};

export function createPaymentRouter() {
  const router = Router();

  // Real File Upload API (persisted on S3/R2 when configured or local disk under data/uploads)
  router.post('/files/upload', requireAuth, async (req: AuthenticatedRequest, res) => {
    const { dataUrl, base64, mimeType, fileName, entityType, entityId, visibility } = req.body ?? {};
    let cleanMime = String(mimeType || '').trim();
    let b64 = String(base64 || '').trim();

    if (typeof dataUrl === 'string' && dataUrl.startsWith('data:')) {
      const m = /^data:([^;,]+);base64,([A-Za-z0-9+/=\s]+)$/i.exec(dataUrl.trim());
      if (!m) {
        res.status(400).json({ error: 'تنسيق الملف المرفق غير صالح.' });
        return;
      }
      cleanMime = m[1];
      b64 = m[2];
    }

    if (!cleanMime || !b64) {
      res.status(400).json({ error: 'بيانات الملف ونوعه مطلوبة.' });
      return;
    }

    const cleanEntityType = ['receipt', 'section_lesson', 'section_test', 'verification_doc', 'school_material', 'other'].includes(
      String(entityType || '')
    )
      ? (String(entityType) as 'receipt' | 'section_lesson' | 'section_test' | 'verification_doc' | 'school_material' | 'other')
      : 'other';
    const cleanVisibility = ['private', 'section', 'school', 'public'].includes(String(visibility || ''))
      ? (String(visibility) as 'private' | 'section' | 'school' | 'public')
      : 'private';

    try {
      const buffer = Buffer.from(b64.replace(/\s+/g, ''), 'base64');
      const stored = await storeBinaryFile({
        ownerUserId: req.authUser!.userId,
        buffer,
        mimeType: cleanMime,
        originalName: String(fileName || '').slice(0, 140),
        entityType: cleanEntityType,
        entityId: String(entityId || '').slice(0, 80),
        visibility: cleanVisibility,
      });
      res.status(201).json({ ok: true, file: stored });
    } catch (err: any) {
      res.status(400).json({ error: err?.message || 'تعذر حفظ الملف المرفق.' });
    }
  });

  router.get('/files/:id', async (req: AuthenticatedRequest, res) => {
    const fileId = String(req.params.id || '').trim();
    const meta = db.prepare('SELECT * FROM files WHERE id = ?').get(fileId) as any;
    if (!meta) {
      res.status(404).json({ error: 'الملف غير موجود.' });
      return;
    }
    if (!canUserAccessFile(meta, req.authUser)) {
      res.status(req.authUser ? 403 : 401).json({ error: 'غير مصرح بالوصول إلى هذا الملف.' });
      return;
    }
    const loaded = await readStoredFile(fileId);
    if (!loaded) {
      res.status(404).json({ error: 'ملف التخزين الفعلي غير متوفر.' });
      return;
    }
    res.setHeader('Content-Type', loaded.record.mime_type);
    res.setHeader('Content-Length', String(loaded.buffer.length));
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.send(loaded.buffer);
  });

  router.delete('/files/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
    const fileId = String(req.params.id || '').trim();
    const meta = db.prepare('SELECT * FROM files WHERE id = ?').get(fileId) as any;
    if (!meta) {
      res.status(404).json({ error: 'الملف غير موجود.' });
      return;
    }
    const perms = new Set(getUserAdminPermissions(req.authUser!.userId, req.authUser!.email));
    const isAdminOrOwner =
      meta.owner_user_id === req.authUser!.userId ||
      isOfficialSuperAdminEmail(req.authUser!.email) ||
      perms.has('files');
    if (!isAdminOrOwner) {
      res.status(403).json({ error: 'غير مصرح بحذف هذا الملف.' });
      return;
    }
    await deleteStoredFile(fileId);
    res.json({ ok: true });
  });

  // NardoPay Gateway Configuration Info (public non-secret status only)
  router.get('/payments/nardopay/config', (_req, res) => {
    const cfg = getNardoPayConfig();
    res.json({
      configured: cfg.configured,
      merchantId: cfg.merchantId || null,
      widgetScriptUrl: cfg.widgetScriptUrl,
    });
  });

  // Create NardoPay Order & Hosted Checkout Session
  router.post('/payments/nardopay/create', requireAuth, async (req: AuthenticatedRequest, res) => {
    const { planId, planSlug, preferredMethod } = req.body ?? {};
    const plan = (planId
      ? db.prepare('SELECT * FROM subscription_plans WHERE id = ? AND active = 1').get(Number(planId))
      : db.prepare('SELECT * FROM subscription_plans WHERE slug = ? AND active = 1').get(String(planSlug || ''))) as any;

    if (!plan || Number(plan.price_mru) <= 0) {
      res.status(404).json({ error: 'الخطة المدفوعة المطلوبة غير موجودة.' });
      return;
    }

    const cfg = getNardoPayConfig();
    if (!cfg.configured) {
      res.status(503).json({
        code: 'NARDOPAY_NOT_CONFIGURED',
        error:
          'بوابة NardoPay غير مفعلة بمفاتيح الإنتاج على الخادم حالياً (NARDOPAY_API_KEY). يرجى ضبط المتغيرات أو استخدام التحويل المحلي وإرفاق الإيصال.',
      });
      return;
    }

    const orderId = `ORD-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const amount = Number(plan.price_mru);
    const currency = String(plan.currency || 'MRU').toUpperCase();
    const userRow = db.prepare('SELECT id, name, email, phone FROM users WHERE id = ?').get(req.authUser!.userId) as any;

    let checkoutUrl = '';
    let providerSessionId = '';
    let widgetToken = '';

    try {
      const apiResp = await fetch(`${cfg.apiBase}/checkout/sessions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cfg.apiKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          order_id: orderId,
          amount,
          currency,
          merchant_id: cfg.merchantId || undefined,
          customer: {
            id: String(req.authUser!.userId),
            name: userRow?.name || '',
            email: userRow?.email || req.authUser!.email,
            phone: userRow?.phone || '',
          },
          description: `Tedribi Subscription - ${plan.name_ar}`,
          payment_method: String(preferredMethod || 'card'),
          success_url: `${PUBLIC_APP_ORIGIN}/checkout/${encodeURIComponent(plan.slug)}?orderId=${encodeURIComponent(orderId)}&status=success`,
          cancel_url: `${PUBLIC_APP_ORIGIN}/checkout/${encodeURIComponent(plan.slug)}?orderId=${encodeURIComponent(orderId)}&status=cancelled`,
          webhook_url: `${(process.env.VITE_API_BASE_URL || 'https://api.tadribi.chtbqi.com').replace(/\/+$/, '')}/webhooks/nardopay`,
          metadata: {
            order_id: orderId,
            user_id: req.authUser!.userId,
            plan_id: plan.id,
            plan_slug: plan.slug,
          },
        }),
        signal: AbortSignal.timeout(15000),
      });

      const apiData = (await apiResp.json().catch(() => ({}))) as any;
      if (!apiResp.ok) {
        res.status(502).json({
          code: 'NARDOPAY_SESSION_FAILED',
          error: apiData?.message || apiData?.error || 'تعذر إنشاء جلسة الدفع لدى NardoPay حالياً.',
        });
        return;
      }

      checkoutUrl = String(apiData?.checkout_url || apiData?.url || apiData?.data?.checkout_url || '');
      providerSessionId = String(apiData?.session_id || apiData?.id || apiData?.data?.id || '');
      widgetToken = String(apiData?.widget_token || apiData?.client_token || apiData?.data?.token || '');
    } catch {
      res.status(502).json({
        code: 'NARDOPAY_UNREACHABLE',
        error: 'تعذر الاتصال بخادم NardoPay حالياً. يرجى إعادة المحاولة أو استخدام الدفع المحلي.',
      });
      return;
    }

    db.prepare(
      `INSERT INTO payment_orders (
        order_id, user_id, plan_id, provider, amount, currency, status,
        provider_session_id, checkout_url, metadata_json
      ) VALUES (?, ?, ?, 'nardopay', ?, ?, 'pending', ?, ?, ?)`
    ).run(
      orderId,
      req.authUser!.userId,
      plan.id,
      amount,
      currency,
      providerSessionId,
      checkoutUrl,
      JSON.stringify({ planSlug: plan.slug, preferredMethod: String(preferredMethod || 'card') })
    );

    logAudit(req.authUser!.userId, req.authUser!.email, 'NARDOPAY_ORDER_CREATED', 'payment_order', orderId, `Plan=${plan.slug};Amount=${amount}`);

    res.status(201).json({
      ok: true,
      order: {
        orderId,
        amount,
        currency,
        status: 'pending',
        checkoutUrl,
        providerSessionId,
        widgetToken,
        widgetScriptUrl: cfg.widgetScriptUrl,
        merchantId: cfg.merchantId || undefined,
      },
    });
  });

  // Poll / Check NardoPay Order Status (Never trust client status alone!)
  router.get('/payments/nardopay/status/:orderId', requireAuth, async (req: AuthenticatedRequest, res) => {
    const orderId = String(req.params.orderId || '').trim();
    const order = db
      .prepare('SELECT * FROM payment_orders WHERE order_id = ?')
      .get(orderId) as any;

    if (!order) {
      res.status(404).json({ error: 'طلب الدفع غير موجود.' });
      return;
    }

    const isSuper = isOfficialSuperAdminEmail(req.authUser!.email);
    if (order.user_id !== req.authUser!.userId && !isSuper) {
      res.status(403).json({ error: 'غير مصرح بالوصول إلى هذا الطلب.' });
      return;
    }

    // If still pending and NardoPay API key configured, query NardoPay API safely
    const cfg = getNardoPayConfig();
    if (order.status === 'pending' && cfg.configured && order.provider_session_id) {
      try {
        const statusResp = await fetch(
          `${cfg.apiBase}/checkout/sessions/${encodeURIComponent(order.provider_session_id)}`,
          {
            headers: {
              Authorization: `Bearer ${cfg.apiKey}`,
              Accept: 'application/json',
            },
            signal: AbortSignal.timeout(8000),
          }
        );
        if (statusResp.ok) {
          const remote = (await statusResp.json().catch(() => ({}))) as any;
          const remoteStatus = String(remote?.status || remote?.data?.status || '').toLowerCase();
          if (['failed', 'cancelled', 'expired'].includes(remoteStatus)) {
            db.prepare(
              "UPDATE payment_orders SET status = ?, updated_at = datetime('now') WHERE id = ? AND status = 'pending'"
            ).run(remoteStatus, order.id);
          }
        }
      } catch {
        // non-fatal polling failure; webhook remains authoritative
      }
    }

    const latestOrder = db.prepare('SELECT * FROM payment_orders WHERE id = ?').get(order.id) as any;
    const verifyMeta = latestOrder?.provider_tx_id
      ? buildReceiptVerifyUrl(latestOrder.provider_tx_id)
      : buildReceiptVerifyUrl(latestOrder.order_id);

    res.json({
      order: {
        orderId: latestOrder.order_id,
        amount: latestOrder.amount,
        currency: latestOrder.currency,
        status: latestOrder.status,
        providerTxId: latestOrder.provider_tx_id || null,
        failureReason: latestOrder.failure_reason || null,
        verifiedAt: latestOrder.verified_at || null,
        createdAt: latestOrder.created_at,
        verify_sig: verifyMeta.sig,
        verify_url: verifyMeta.url,
      },
      activeSubscription: getUserActiveSubscriptionSnapshot(order.user_id),
    });
  });

  // Deprecate insecure legacy raw PAN/CVV endpoint cleanly
  router.post('/payments/checkout', requireAuth, (_req, res) => {
    res.status(410).json({
      code: 'DIRECT_CARD_COLLECTION_REMOVED',
      error:
        'تم إيقاف إدخال بيانات البطاقة مباشرة على الموقع لأسباب أمنية. يرجى استخدام بوابة الدفع المستضافة عبر NardoPay (/api/payments/nardopay/create).',
    });
  });

  return router;
}
