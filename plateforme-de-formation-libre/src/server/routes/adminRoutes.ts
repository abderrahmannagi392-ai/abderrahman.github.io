import { Router } from 'express';
import {
  ALL_ADMIN_PERMISSIONS,
  getUserAdminPermissions,
  isOfficialSuperAdminEmail,
  requireAdminPermission,
  type AdminPermission,
  type AuthenticatedRequest,
} from '../auth';
import { appCache } from '../cache';
import { db, expireOverdueSubscriptions, logAudit } from '../db';
import { checkDatabaseHealth } from '../dbAdapter';
import { backgroundQueue } from '../jobQueue';
import { broadcastNotificationEvent, getRealtimeStats } from '../realtime';
import { getStorageHealth } from '../storage';

export function createAdminRouter() {
  const router = Router();

  // Super Admin + Delegated Admin System Health
  router.get('/admin/system-health', requireAdminPermission('dashboard', 'settings'), async (_req, res) => {
    const dbHealth = await checkDatabaseHealth();
    res.json({
      ok: true,
      sqlite: { status: 'connected' },
      postgres: dbHealth,
      storage: getStorageHealth(),
      cache: appCache.getStats(),
      queue: backgroundQueue.getStats(),
      realtime: getRealtimeStats(),
    });
  });

  // Granular 24-section Admin Permissions & Delegated Admins Management
  router.get('/admin/administrators', requireAdminPermission('administrators', 'permissions'), (_req, res) => {
    const adminsRaw = db
      .prepare(
        `SELECT u.id, u.name, u.email, u.role, u.level, u.created_at, u.last_login_at, u.last_active_at
         FROM users u
         WHERE u.role IN ('admin', 'editor')
            OR EXISTS (SELECT 1 FROM admin_permissions ap WHERE ap.user_id = u.id)
         ORDER BY CASE WHEN lower(u.email) = 'elalyatalebjidou@gmail.com' THEN 0 ELSE 1 END, u.id ASC`
      )
      .all() as any[];

    const administrators = adminsRaw.map((u) => ({
      ...u,
      isSuperAdmin: isOfficialSuperAdminEmail(u.email),
      permissions: getUserAdminPermissions(u.id, u.email),
    }));

    res.json({
      allPermissions: ALL_ADMIN_PERMISSIONS,
      administrators,
    });
  });

  router.put('/admin/administrators/:userId/permissions', requireAdminPermission('administrators', 'permissions'), (req: AuthenticatedRequest, res) => {
    const targetUserId = Number(req.params.userId);
    const targetUser = db.prepare('SELECT id, email, role FROM users WHERE id = ?').get(targetUserId) as any;
    if (!targetUser) {
      res.status(404).json({ error: 'المستخدم غير موجود.' });
      return;
    }
    if (isOfficialSuperAdminEmail(targetUser.email)) {
      res.status(400).json({ error: 'لا يمكن تعديل صلاحيات المدير الرسمي الرئيسي.' });
      return;
    }

    const validSet = new Set<string>(ALL_ADMIN_PERMISSIONS);
    const incomingPerms = Array.isArray(req.body?.permissions)
      ? Array.from(new Set(req.body.permissions.map((p: any) => String(p)).filter((p: string): p is AdminPermission => validSet.has(p))))
      : [];

    db.transaction(() => {
      db.prepare('DELETE FROM admin_permissions WHERE user_id = ?').run(targetUserId);
      const ins = db.prepare(
        'INSERT INTO admin_permissions (user_id, permission, granted_by) VALUES (?, ?, ?)'
      );
      for (const perm of incomingPerms) {
        ins.run(targetUserId, perm, req.authUser!.userId);
      }
      if (incomingPerms.length > 0 && targetUser.role === 'student') {
        db.prepare("UPDATE users SET role = 'editor' WHERE id = ?").run(targetUserId);
      }
    })();

    logAudit(
      req.authUser!.userId,
      req.authUser!.email,
      'UPDATE_DELEGATED_ADMIN_PERMISSIONS',
      'user',
      targetUserId,
      incomingPerms.join(',')
    );

    res.json({
      ok: true,
      userId: targetUserId,
      permissions: getUserAdminPermissions(targetUserId, targetUser.email),
    });
  });

  // Grant admin permissions by searching email
  router.post('/admin/administrators/assign', requireAdminPermission('administrators', 'permissions'), (req: AuthenticatedRequest, res) => {
    const { email, permissions } = req.body ?? {};
    const cleanEmail = String(email || '').trim().toLowerCase();
    const user = db.prepare('SELECT id, email, name, role FROM users WHERE lower(email) = ?').get(cleanEmail) as any;
    if (!user) {
      res.status(404).json({ error: 'لم يتم العثور على مستخدم بهذا البريد الإلكتروني.' });
      return;
    }
    if (isOfficialSuperAdminEmail(user.email)) {
      res.status(400).json({ error: 'هذا الحساب هو المدير الرسمي الرئيسي بالفعل.' });
      return;
    }
    const validSet = new Set<string>(ALL_ADMIN_PERMISSIONS);
    const incomingPerms = Array.isArray(permissions)
      ? Array.from(new Set(permissions.map((p: any) => String(p)).filter((p: string): p is AdminPermission => validSet.has(p))))
      : [];
    if (incomingPerms.length === 0) {
      res.status(400).json({ error: 'يرجى اختيار صلاحية واحدة على الأقل.' });
      return;
    }

    db.transaction(() => {
      db.prepare('DELETE FROM admin_permissions WHERE user_id = ?').run(user.id);
      const ins = db.prepare('INSERT INTO admin_permissions (user_id, permission, granted_by) VALUES (?, ?, ?)');
      for (const perm of incomingPerms) {
        ins.run(user.id, perm, req.authUser!.userId);
      }
      if (user.role === 'student') {
        db.prepare("UPDATE users SET role = 'editor' WHERE id = ?").run(user.id);
      }
    })();

    logAudit(req.authUser!.userId, req.authUser!.email, 'ASSIGN_DELEGATED_ADMIN', 'user', user.id, incomingPerms.join(','));
    res.status(201).json({ ok: true, userId: user.id, permissions: incomingPerms });
  });

  // Comprehensive Users Directory with search, category filters & pagination
  router.get('/admin/users/directory', requireAdminPermission('users', 'students', 'teachers', 'professors'), (req, res) => {
    const category = String(req.query.category || 'all').trim();
    const search = String(req.query.search || '').trim();
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(10, Number(req.query.limit) || 25));
    const offset = (page - 1) * limit;

    const clauses: string[] = [];
    const params: any[] = [];

    if (category === 'students') {
      clauses.push("role = 'student' AND level NOT IN ('teacher', 'professor')");
    } else if (category === 'teachers') {
      clauses.push("(role = 'teacher' OR level = 'teacher')");
    } else if (category === 'professors') {
      clauses.push("level = 'professor'");
    }

    if (search) {
      const like = `%${search}%`;
      clauses.push('(name LIKE ? OR email LIKE ? OR phone LIKE ?)');
      params.push(like, like, like);
    }

    const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const total = (db.prepare(`SELECT COUNT(*) as c FROM users ${whereSql}`).get(...params) as { c: number }).c;
    const users = db
      .prepare(
        `SELECT id, name, email, phone, role, track, preferred_lang, level,
                teacher_category, professor_specialty, email_verified,
                verified_account, verified_badge_label, followers_count, following_count,
                last_login_at, last_active_at, created_at
         FROM users ${whereSql}
         ORDER BY id DESC LIMIT ? OFFSET ?`
      )
      .all(...params, limit, offset);

    res.json({
      users,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  });

  // NardoPay Orders & Webhook Logs
  router.get('/admin/nardopay-orders', requireAdminPermission('payments', 'transactions', 'subscriptions'), (req, res) => {
    const status = String(req.query.status || 'all').trim();
    const whereSql = status !== 'all' ? 'WHERE po.status = ?' : '';
    const orders = db
      .prepare(
        `SELECT po.*, u.name as user_name, u.email as user_email, sp.name_ar as plan_name_ar
         FROM payment_orders po
         JOIN users u ON u.id = po.user_id
         LEFT JOIN subscription_plans sp ON sp.id = po.plan_id
         ${whereSql}
         ORDER BY po.id DESC LIMIT 120`
      )
      .all(...(status !== 'all' ? [status] : []));

    const webhooks = db
      .prepare('SELECT * FROM nardopay_webhook_events ORDER BY id DESC LIMIT 100')
      .all();

    const transactions = db
      .prepare(
        `SELECT pt.*, u.name as user_name, u.email as user_email, sp.name_ar as plan_name_ar
         FROM payment_transactions pt
         JOIN users u ON u.id = pt.user_id
         LEFT JOIN subscription_plans sp ON sp.id = pt.plan_id
         ORDER BY pt.id DESC LIMIT 100`
      )
      .all();

    res.json({ orders, webhooks, transactions });
  });

  // Uploaded Files Management
  router.get('/admin/files', requireAdminPermission('files', 'receipts', 'verification'), (_req, res) => {
    const files = db
      .prepare(
        `SELECT f.*, u.name as owner_name, u.email as owner_email
         FROM files f
         LEFT JOIN users u ON u.id = f.owner_user_id
         ORDER BY f.created_at DESC LIMIT 150`
      )
      .all();
    res.json({ files, storage: getStorageHealth() });
  });

  // Admin Baccalaureate Series & Coefficients summary + CRUD
  router.get('/admin/baccalaureate', requireAdminPermission('baccalaureate', 'content'), (_req, res) => {
    const series = db.prepare('SELECT * FROM bac_series ORDER BY display_order ASC').all();
    const coefficients = db
      .prepare('SELECT * FROM bac_coefficients ORDER BY series_slug ASC, display_order ASC')
      .all();
    res.json({ series, coefficients });
  });

  // Manual Review + Local Payment Requests (including manual_review status)
  router.get('/admin/receipts', requireAdminPermission('receipts', 'payments', 'subscriptions'), (req, res) => {
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
         LIMIT 200`
      )
      .all(...(statusFilter !== 'all' ? [statusFilter] : []));
    res.json({ requests: rows });
  });

  // Admin Notification Broadcast with explicit target_scope ('current_users' vs 'all_including_future') & Real-time SSE push
  router.get('/admin/notifications', requireAdminPermission('notifications'), (_req, res) => {
    const rows = db
      .prepare(
        `SELECT n.*, u.name as target_user_name, u.email as target_user_email
         FROM notifications n
         LEFT JOIN users u ON u.id = n.user_id
         ORDER BY n.id DESC LIMIT 120`
      )
      .all();
    res.json({ notifications: rows });
  });

  router.post('/admin/notifications/broadcast', requireAdminPermission('notifications'), (req: AuthenticatedRequest, res) => {
    const { title_ar, title_fr, body_ar, body_fr, type, target_scope, user_id } = req.body ?? {};
    if (!title_ar || !body_ar) {
      res.status(400).json({ error: 'العنوان ونص الإشعار مطلوبان.' });
      return;
    }
    const cleanScope = target_scope === 'all_including_future' ? 'all_including_future' : 'current_users';
    const targetUid = user_id ? Number(user_id) : null;
    const nowSql = new Date().toISOString().replace('T', ' ').slice(0, 19);

    const info = db
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
        id: Number(info.lastInsertRowid),
        title_ar: String(title_ar).trim(),
        title_fr: String(title_fr || title_ar).trim(),
        body_ar: String(body_ar).trim(),
        body_fr: String(body_fr || body_ar).trim(),
        type: String(type || 'info'),
        target_scope: cleanScope,
        created_at: new Date().toISOString(),
      },
    });

    logAudit(
      req.authUser!.userId,
      req.authUser!.email,
      'ADMIN_BROADCAST_NOTIFICATION',
      'notification',
      Number(info.lastInsertRowid),
      `scope=${cleanScope}`
    );

    res.status(201).json({ ok: true, id: Number(info.lastInsertRowid), target_scope: cleanScope });
  });

  return router;
}
