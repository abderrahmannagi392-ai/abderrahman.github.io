import { Router } from 'express';
import {
  requireAdminPermission,
  requireAuth,
  type AuthenticatedRequest,
} from '../auth';
import { db, logAudit } from '../db';
import { broadcastNotificationEvent } from '../realtime';

export function createSocialRouter() {
  const router = Router();

  // Public Educators & Verified Profiles Directory
  router.get('/educators', (req: AuthenticatedRequest, res) => {
    const rows = db
      .prepare(
        `SELECT id, name, role, level, teacher_category, professor_specialty,
                verified_account, verified_badge_label, followers_count,
                (SELECT COUNT(*) FROM teacher_sections ts WHERE ts.teacher_user_id = users.id AND ts.status = 'active' AND ts.visibility = 'public') as public_sections_count
         FROM users
         WHERE level IN ('teacher', 'professor') OR role IN ('teacher', 'editor') OR verified_account = 1
         ORDER BY verified_account DESC, followers_count DESC, id DESC LIMIT 100`
      )
      .all() as any[];

    const followedSet = new Set<number>();
    if (req.authUser) {
      const myFollows = db
        .prepare("SELECT target_id FROM follows WHERE follower_user_id = ? AND target_type = 'user'")
        .all(req.authUser.userId) as Array<{ target_id: number }>;
      myFollows.forEach((f) => followedSet.add(f.target_id));
    }

    res.json({
      educators: rows.map((r) => ({
        ...r,
        is_following: followedSet.has(r.id),
      })),
    });
  });

  // Follow / Unfollow a teacher, professor, or school atomically
  router.post('/follows/toggle', requireAuth, (req: AuthenticatedRequest, res) => {
    const followerId = req.authUser!.userId;
    const { targetType, targetId } = req.body ?? {};
    const cleanType = targetType === 'school' ? 'school' : 'user';
    const cleanTargetId = Number(targetId);
    if (!cleanTargetId) {
      res.status(400).json({ error: 'يرجى تحديد الحساب أو المدرسة المراد متابعتها.' });
      return;
    }
    if (cleanType === 'user' && cleanTargetId === followerId) {
      res.status(400).json({ error: 'لا يمكنك متابعة حسابك الشخصي.' });
      return;
    }

    if (cleanType === 'user') {
      const targetUser = db.prepare('SELECT id, followers_count FROM users WHERE id = ?').get(cleanTargetId);
      if (!targetUser) {
        res.status(404).json({ error: 'الحساب غير موجود.' });
        return;
      }
    } else {
      const targetSchool = db.prepare("SELECT id, followers_count FROM schools WHERE id = ? AND status = 'active'").get(cleanTargetId);
      if (!targetSchool) {
        res.status(404).json({ error: 'المدرسة غير موجودة أو غير مفعلة.' });
        return;
      }
    }

    let followingNow = false;
    let updatedFollowersCount = 0;

    db.transaction(() => {
      const existing = db
        .prepare('SELECT id FROM follows WHERE follower_user_id = ? AND target_type = ? AND target_id = ?')
        .get(followerId, cleanType, cleanTargetId) as { id: number } | undefined;

      if (existing) {
        db.prepare('DELETE FROM follows WHERE id = ?').run(existing.id);
        followingNow = false;
      } else {
        db.prepare('INSERT INTO follows (follower_user_id, target_type, target_id) VALUES (?, ?, ?)').run(
          followerId,
          cleanType,
          cleanTargetId
        );
        followingNow = true;
      }

      const cnt = (
        db
          .prepare('SELECT COUNT(*) as c FROM follows WHERE target_type = ? AND target_id = ?')
          .get(cleanType, cleanTargetId) as { c: number }
      ).c;
      updatedFollowersCount = Number(cnt || 0);

      if (cleanType === 'user') {
        db.prepare('UPDATE users SET followers_count = ? WHERE id = ?').run(updatedFollowersCount, cleanTargetId);
        const myFollowingCount = (
          db
            .prepare("SELECT COUNT(*) as c FROM follows WHERE follower_user_id = ? AND target_type = 'user'")
            .get(followerId) as { c: number }
        ).c;
        db.prepare('UPDATE users SET following_count = ? WHERE id = ?').run(myFollowingCount, followerId);
      } else {
        db.prepare('UPDATE schools SET followers_count = ? WHERE id = ?').run(updatedFollowersCount, cleanTargetId);
      }
    })();

    res.json({
      ok: true,
      following: followingNow,
      followersCount: updatedFollowersCount,
    });
  });

  // Current user's followed educators & schools
  router.get('/follows/mine', requireAuth, (req: AuthenticatedRequest, res) => {
    const userId = req.authUser!.userId;
    const users = db
      .prepare(
        `SELECT u.id, u.name, u.level, u.teacher_category, u.professor_specialty,
                u.verified_account, u.verified_badge_label, u.followers_count, f.created_at as followed_at
         FROM follows f
         JOIN users u ON u.id = f.target_id
         WHERE f.follower_user_id = ? AND f.target_type = 'user'
         ORDER BY f.id DESC`
      )
      .all(userId);

    const schools = db
      .prepare(
        `SELECT s.id, s.name, s.slug, s.city, s.wilaya, s.verified_account, s.followers_count, f.created_at as followed_at
         FROM follows f
         JOIN schools s ON s.id = f.target_id
         WHERE f.follower_user_id = ? AND f.target_type = 'school' AND s.status = 'active'
         ORDER BY f.id DESC`
      )
      .all(userId);

    res.json({ users, schools });
  });

  // Verification Badge Request by User or School Owner
  router.get('/verification/mine', requireAuth, (req: AuthenticatedRequest, res) => {
    const rows = db
      .prepare('SELECT * FROM verification_requests WHERE user_id = ? ORDER BY id DESC LIMIT 20')
      .all(req.authUser!.userId);
    res.json({ requests: rows });
  });

  router.post('/verification/request', requireAuth, (req: AuthenticatedRequest, res) => {
    const userId = req.authUser!.userId;
    const { targetType, targetId, requestedLabel, supportingNote, documentFileId } = req.body ?? {};
    const cleanType = targetType === 'school' ? 'school' : 'user';
    const cleanTargetId = cleanType === 'school' ? Number(targetId) : userId;

    if (cleanType === 'school') {
      const ownedSchool = db
        .prepare('SELECT id FROM schools WHERE id = ? AND owner_user_id = ?')
        .get(cleanTargetId, userId);
      if (!ownedSchool) {
        res.status(403).json({ error: 'فقط مالك المدرسة يمكنه طلب التوثيق لها.' });
        return;
      }
    }

    const existingPending = db
      .prepare("SELECT id FROM verification_requests WHERE target_type = ? AND target_id = ? AND status = 'pending'")
      .get(cleanType, cleanTargetId);
    if (existingPending) {
      res.status(409).json({ error: 'يوجد طلب توثيق قيد المراجعة بالفعل.' });
      return;
    }

    const info = db
      .prepare(
        `INSERT INTO verification_requests (user_id, target_type, target_id, requested_label, supporting_note, document_file_id)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        userId,
        cleanType,
        cleanTargetId,
        String(requestedLabel || '').trim().slice(0, 80),
        String(supportingNote || '').trim().slice(0, 1000),
        documentFileId ? String(documentFileId).trim() : null
      );

    logAudit(userId, req.authUser!.email, 'REQUEST_VERIFICATION_BADGE', cleanType, cleanTargetId);
    res.status(201).json({ ok: true, id: Number(info.lastInsertRowid) });
  });

  // Admin: List and approve/reject/revoke verification badges
  router.get('/admin/verification-requests', requireAdminPermission('verification'), (_req, res) => {
    const rows = db
      .prepare(
        `SELECT vr.*, u.name as user_name, u.email as user_email, u.level as user_level, u.verified_account as current_user_verified,
                s.name as school_name
         FROM verification_requests vr
         JOIN users u ON u.id = vr.user_id
         LEFT JOIN schools s ON vr.target_type = 'school' AND s.id = vr.target_id
         ORDER BY CASE WHEN vr.status = 'pending' THEN 0 ELSE 1 END, vr.id DESC`
      )
      .all();
    res.json({ requests: rows });
  });

  router.patch('/admin/verification-requests/:id', requireAdminPermission('verification'), (req: AuthenticatedRequest, res) => {
    const reqId = Number(req.params.id);
    const { status, badgeLabel, note } = req.body ?? {};
    const vr = db.prepare('SELECT * FROM verification_requests WHERE id = ?').get(reqId) as any;
    if (!vr) {
      res.status(404).json({ error: 'طلب التوثيق غير موجود.' });
      return;
    }
    const nextStatus = ['approved', 'rejected', 'revoked', 'pending'].includes(String(status))
      ? String(status)
      : 'approved';

    const cleanLabel = String(badgeLabel || vr.requested_label || 'حساب موثق').trim().slice(0, 60);

    db.transaction(() => {
      db.prepare(
        `UPDATE verification_requests
         SET status = ?, reviewed_by = ?, reviewed_note = ?, reviewed_at = datetime('now')
         WHERE id = ?`
      ).run(nextStatus, req.authUser!.userId, String(note || '').trim().slice(0, 400), reqId);

      if (vr.target_type === 'user') {
        const verifiedFlag = nextStatus === 'approved' ? 1 : 0;
        db.prepare(
          `UPDATE users
           SET verified_account = ?,
               verified_badge_label = ?,
               verified_at = CASE WHEN ? = 1 THEN datetime('now') ELSE NULL END
           WHERE id = ?`
        ).run(verifiedFlag, verifiedFlag ? cleanLabel : '', verifiedFlag, vr.target_id);
      } else {
        db.prepare('UPDATE schools SET verified_account = ? WHERE id = ?').run(
          nextStatus === 'approved' ? 1 : 0,
          vr.target_id
        );
      }
    })();

    const titleAr =
      nextStatus === 'approved' ? 'تم منح شارة التوثيق لحسابك' : 'تحديث حالة طلب شارة التوثيق';
    const bodyAr =
      nextStatus === 'approved'
        ? `مبروك! تمت الموافقة على توثيق الحساب بشارة "${cleanLabel}".`
        : `تم تحديث حالة طلب التوثيق إلى (${nextStatus})${note ? `: ${note}` : ''}.`;
    const nRes = db
      .prepare(
        `INSERT INTO notifications (user_id, title_ar, title_fr, body_ar, body_fr, type, target_scope)
         VALUES (?, ?, ?, ?, ?, 'info', 'current_users')`
      )
      .run(vr.user_id, titleAr, titleAr, bodyAr, bodyAr);
    broadcastNotificationEvent({
      targetUserId: vr.user_id,
      payload: { id: Number(nRes.lastInsertRowid), title_ar: titleAr, body_ar: bodyAr, type: 'info', created_at: new Date().toISOString() },
    });

    logAudit(req.authUser!.userId, req.authUser!.email, 'UPDATE_VERIFICATION_STATUS', vr.target_type, vr.target_id, nextStatus);
    res.json({ ok: true });
  });

  // Direct Admin Verification Toggle for any user/school without prior request
  router.post('/admin/verification/grant', requireAdminPermission('verification'), (req: AuthenticatedRequest, res) => {
    const { targetType, targetId, verified, badgeLabel } = req.body ?? {};
    const cleanType = targetType === 'school' ? 'school' : 'user';
    const id = Number(targetId);
    const isVerified = verified !== false;
    const cleanLabel = String(badgeLabel || 'حساب موثق').trim().slice(0, 60);

    if (cleanType === 'user') {
      db.prepare(
        `UPDATE users
         SET verified_account = ?, verified_badge_label = ?, verified_at = CASE WHEN ? = 1 THEN datetime('now') ELSE NULL END
         WHERE id = ?`
      ).run(isVerified ? 1 : 0, isVerified ? cleanLabel : '', isVerified ? 1 : 0, id);
    } else {
      db.prepare('UPDATE schools SET verified_account = ? WHERE id = ?').run(isVerified ? 1 : 0, id);
    }

    logAudit(req.authUser!.userId, req.authUser!.email, isVerified ? 'GRANT_VERIFICATION' : 'REVOKE_VERIFICATION', cleanType, id);
    res.json({ ok: true });
  });

  return router;
}
