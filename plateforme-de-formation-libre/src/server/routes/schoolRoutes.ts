import crypto from 'crypto';
import { Router } from 'express';
import {
  requireAdminPermission,
  requireAuth,
  type AuthenticatedRequest,
} from '../auth';
import { db, logAudit } from '../db';
import { broadcastNotificationEvent } from '../realtime';

function makeSlug(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9\u0621-\u064a]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
  const rand = crypto.randomBytes(3).toString('hex');
  return `${base || 'school'}-${rand}`;
}

function getSchoolManagementAccess(schoolId: number, userId: number): boolean {
  const school = db.prepare('SELECT id, owner_user_id, status FROM schools WHERE id = ?').get(schoolId) as any;
  if (!school) return false;
  if (school.owner_user_id === userId) return true;
  const headDept = db
    .prepare('SELECT id FROM school_departments WHERE school_id = ? AND head_user_id = ?')
    .get(schoolId, userId);
  return Boolean(headDept);
}

export function createSchoolRouter() {
  const router = Router();

  // Public approved schools directory
  router.get('/schools/public', (_req, res) => {
    const schools = db
      .prepare(
        `SELECT s.id, s.name, s.slug, s.description, s.city, s.wilaya, s.verified_account, s.followers_count, s.created_at,
                u.name as owner_name,
                (SELECT COUNT(*) FROM school_departments sd WHERE sd.school_id = s.id) as departments_count,
                (SELECT COUNT(*) FROM school_teachers st WHERE st.school_id = s.id AND st.status = 'active') as teachers_count,
                (SELECT COUNT(*) FROM school_students ss WHERE ss.school_id = s.id AND ss.status = 'active') as students_count
         FROM schools s
         JOIN users u ON u.id = s.owner_user_id
         WHERE s.status = 'active'
         ORDER BY s.verified_account DESC, s.followers_count DESC, s.id DESC LIMIT 60`
      )
      .all();
    res.json({ schools });
  });

  // Schools owned, taught in, or enrolled by current user
  router.get('/schools/mine', requireAuth, (req: AuthenticatedRequest, res) => {
    const userId = req.authUser!.userId;
    const owned = db
      .prepare(
        `SELECT s.*,
                (SELECT COUNT(*) FROM school_departments sd WHERE sd.school_id = s.id) as departments_count,
                (SELECT COUNT(*) FROM school_teachers st WHERE st.school_id = s.id AND st.status = 'active') as teachers_count,
                (SELECT COUNT(*) FROM school_students ss WHERE ss.school_id = s.id AND ss.status = 'active') as students_count
         FROM schools s WHERE s.owner_user_id = ? ORDER BY s.id DESC`
      )
      .all(userId);

    const teaching = db
      .prepare(
        `SELECT s.*, st.subject_name, st.role_title, sd.name as department_name
         FROM school_teachers st
         JOIN schools s ON s.id = st.school_id
         LEFT JOIN school_departments sd ON sd.id = st.department_id
         WHERE st.user_id = ? AND st.status = 'active' AND s.status = 'active'`
      )
      .all(userId);

    const enrolled = db
      .prepare(
        `SELECT s.*, ss.level, sd.name as department_name
         FROM school_students ss
         JOIN schools s ON s.id = ss.school_id
         LEFT JOIN school_departments sd ON sd.id = ss.department_id
         WHERE ss.user_id = ? AND ss.status = 'active' AND s.status = 'active'`
      )
      .all(userId);

    res.json({ owned, teaching, enrolled });
  });

  // Request creation of a School (always starts 'pending' requiring platform admin approval)
  router.post('/schools/request', requireAuth, (req: AuthenticatedRequest, res) => {
    const { name, description, city, wilaya } = req.body ?? {};
    const cleanName = String(name || '').trim().slice(0, 160);
    if (cleanName.length < 3) {
      res.status(400).json({ error: 'اسم المدرسة يجب أن يكون 3 أحرف على الأقل.' });
      return;
    }

    const slug = makeSlug(cleanName);
    const info = db
      .prepare(
        `INSERT INTO schools (name, slug, description, city, wilaya, owner_user_id, status)
         VALUES (?, ?, ?, ?, ?, ?, 'pending')`
      )
      .run(
        cleanName,
        slug,
        String(description || '').trim().slice(0, 1500),
        String(city || '').trim().slice(0, 80),
        String(wilaya || '').trim().slice(0, 80),
        req.authUser!.userId
      );

    logAudit(req.authUser!.userId, req.authUser!.email, 'REQUEST_SCHOOL_CREATION', 'school', Number(info.lastInsertRowid), cleanName);
    const created = db.prepare('SELECT * FROM schools WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json({ ok: true, school: created });
  });

  // School full management workspace details
  router.get('/schools/:id/detail', requireAuth, (req: AuthenticatedRequest, res) => {
    const schoolId = Number(req.params.id);
    const userId = req.authUser!.userId;
    const school = db
      .prepare(
        `SELECT s.*, u.name as owner_name FROM schools s JOIN users u ON u.id = s.owner_user_id WHERE s.id = ?`
      )
      .get(schoolId) as any;

    if (!school) {
      res.status(404).json({ error: 'المدرسة غير موجودة.' });
      return;
    }

    const isOwner = school.owner_user_id === userId;
    const isTeacher = Boolean(
      db.prepare("SELECT id FROM school_teachers WHERE school_id = ? AND user_id = ? AND status = 'active'").get(schoolId, userId)
    );
    const isStudent = Boolean(
      db.prepare("SELECT id FROM school_students WHERE school_id = ? AND user_id = ? AND status = 'active'").get(schoolId, userId)
    );

    if (school.status !== 'active' && !isOwner) {
      res.status(403).json({ error: 'المدرسة غير مفعلة بعد.' });
      return;
    }
    if (!isOwner && !isTeacher && !isStudent) {
      res.status(403).json({ error: 'غير مصرح بالدخول إلى تفاصيل هذه المدرسة.' });
      return;
    }

    const departments = db
      .prepare('SELECT * FROM school_departments WHERE school_id = ? ORDER BY id ASC')
      .all(schoolId);
    const teachers = db
      .prepare(
        `SELECT st.*, u.name, u.email, u.verified_account, sd.name as department_name
         FROM school_teachers st
         JOIN users u ON u.id = st.user_id
         LEFT JOIN school_departments sd ON sd.id = st.department_id
         WHERE st.school_id = ? AND st.status = 'active'`
      )
      .all(schoolId);
    const students = isOwner || isTeacher
      ? db
          .prepare(
            `SELECT ss.*, u.name, u.email, sd.name as department_name
             FROM school_students ss
             JOIN users u ON u.id = ss.user_id
             LEFT JOIN school_departments sd ON sd.id = ss.department_id
             WHERE ss.school_id = ? AND ss.status = 'active'`
          )
          .all(schoolId)
      : [];
    const curriculum = db
      .prepare(
        `SELECT sc.*, sd.name as department_name, u.name as author_name
         FROM school_curriculum sc
         LEFT JOIN school_departments sd ON sd.id = sc.department_id
         JOIN users u ON u.id = sc.created_by
         WHERE sc.school_id = ? ORDER BY sc.id DESC`
      )
      .all(schoolId);
    const announcements = db
      .prepare(
        `SELECT sa.*, sd.name as department_name, u.name as author_name
         FROM school_announcements sa
         LEFT JOIN school_departments sd ON sd.id = sa.department_id
         JOIN users u ON u.id = sa.author_user_id
         WHERE sa.school_id = ? ORDER BY sa.id DESC LIMIT 40`
      )
      .all(schoolId);

    res.json({
      school,
      isOwner,
      isTeacher,
      isStudent,
      departments,
      teachers,
      students,
      curriculum,
      announcements,
    });
  });

  router.post('/schools/:id/departments', requireAuth, (req: AuthenticatedRequest, res) => {
    const schoolId = Number(req.params.id);
    if (!getSchoolManagementAccess(schoolId, req.authUser!.userId)) {
      res.status(403).json({ error: 'فقط إدارة المدرسة يمكنها إنشاء الشعب والأقسام.' });
      return;
    }
    const cleanName = String(req.body?.name || '').trim().slice(0, 120);
    if (!cleanName) {
      res.status(400).json({ error: 'اسم الشعبة مطلوب.' });
      return;
    }
    const info = db
      .prepare('INSERT INTO school_departments (school_id, name, description) VALUES (?, ?, ?)')
      .run(schoolId, cleanName, String(req.body?.description || '').trim().slice(0, 600));
    res.status(201).json({ ok: true, id: Number(info.lastInsertRowid) });
  });

  router.post('/schools/:id/teachers', requireAuth, (req: AuthenticatedRequest, res) => {
    const schoolId = Number(req.params.id);
    if (!getSchoolManagementAccess(schoolId, req.authUser!.userId)) {
      res.status(403).json({ error: 'فقط إدارة المدرسة يمكنها تعيين المعلمين.' });
      return;
    }
    const { query, userId: targetUserId, departmentId, subjectName, roleTitle } = req.body ?? {};
    let target: any = null;
    if (targetUserId) {
      target = db.prepare('SELECT id, name FROM users WHERE id = ?').get(Number(targetUserId));
    } else if (query) {
      const q = String(query).trim().toLowerCase();
      target = db.prepare('SELECT id, name FROM users WHERE lower(email) = ? OR phone = ? LIMIT 1').get(q, String(query).trim());
    }
    if (!target) {
      res.status(404).json({ error: 'لم يتم العثور على المعلم بهذا البريد أو الهاتف.' });
      return;
    }
    db.prepare(
      `INSERT INTO school_teachers (school_id, department_id, user_id, subject_name, role_title, status)
       VALUES (?, ?, ?, ?, ?, 'active')
       ON CONFLICT(school_id, user_id) DO UPDATE SET
         department_id = excluded.department_id,
         subject_name = excluded.subject_name,
         role_title = excluded.role_title,
         status = 'active'`
    ).run(
      schoolId,
      departmentId ? Number(departmentId) : null,
      target.id,
      String(subjectName || '').trim().slice(0, 100),
      String(roleTitle || 'teacher').trim().slice(0, 60)
    );
    res.status(201).json({ ok: true });
  });

  router.post('/schools/:id/students', requireAuth, (req: AuthenticatedRequest, res) => {
    const schoolId = Number(req.params.id);
    if (!getSchoolManagementAccess(schoolId, req.authUser!.userId)) {
      res.status(403).json({ error: 'فقط إدارة المدرسة يمكنها تسجيل الطلاب.' });
      return;
    }
    const { query, userId: targetUserId, departmentId, level } = req.body ?? {};
    let target: any = null;
    if (targetUserId) {
      target = db.prepare('SELECT id, name, level FROM users WHERE id = ?').get(Number(targetUserId));
    } else if (query) {
      const q = String(query).trim().toLowerCase();
      target = db.prepare('SELECT id, name, level FROM users WHERE lower(email) = ? OR phone = ? LIMIT 1').get(q, String(query).trim());
    }
    if (!target) {
      res.status(404).json({ error: 'لم يتم العثور على الطالب بهذا البريد أو الهاتف.' });
      return;
    }
    db.prepare(
      `INSERT INTO school_students (school_id, department_id, user_id, level, status)
       VALUES (?, ?, ?, ?, 'active')
       ON CONFLICT(school_id, user_id) DO UPDATE SET
         department_id = excluded.department_id,
         level = excluded.level,
         status = 'active'`
    ).run(
      schoolId,
      departmentId ? Number(departmentId) : null,
      target.id,
      String(level || target.level || '').trim().slice(0, 60)
    );
    res.status(201).json({ ok: true });
  });

  router.post('/schools/:id/curriculum', requireAuth, (req: AuthenticatedRequest, res) => {
    const schoolId = Number(req.params.id);
    const userId = req.authUser!.userId;
    const isTeacher = Boolean(
      db.prepare("SELECT id FROM school_teachers WHERE school_id = ? AND user_id = ? AND status = 'active'").get(schoolId, userId)
    );
    if (!getSchoolManagementAccess(schoolId, userId) && !isTeacher) {
      res.status(403).json({ error: 'غير مصرح بنشر مقررات في هذه المدرسة.' });
      return;
    }
    const { departmentId, subjectName, title, description, fileId } = req.body ?? {};
    const cleanTitle = String(title || '').trim().slice(0, 180);
    const cleanSubj = String(subjectName || '').trim().slice(0, 100);
    if (!cleanTitle || !cleanSubj) {
      res.status(400).json({ error: 'اسم المادة وعنوان المقرر مطلوبان.' });
      return;
    }
    const info = db
      .prepare(
        `INSERT INTO school_curriculum (school_id, department_id, subject_name, title, description, file_id, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        schoolId,
        departmentId ? Number(departmentId) : null,
        cleanSubj,
        cleanTitle,
        String(description || '').trim().slice(0, 3000),
        fileId ? String(fileId).trim() : null,
        userId
      );
    res.status(201).json({ ok: true, id: Number(info.lastInsertRowid) });
  });

  router.post('/schools/:id/announcements', requireAuth, (req: AuthenticatedRequest, res) => {
    const schoolId = Number(req.params.id);
    const userId = req.authUser!.userId;
    const isTeacher = Boolean(
      db.prepare("SELECT id FROM school_teachers WHERE school_id = ? AND user_id = ? AND status = 'active'").get(schoolId, userId)
    );
    if (!getSchoolManagementAccess(schoolId, userId) && !isTeacher) {
      res.status(403).json({ error: 'غير مصرح بنشر الإعلانات في هذه المدرسة.' });
      return;
    }
    const cleanTitle = String(req.body?.title || '').trim().slice(0, 180);
    const cleanBody = String(req.body?.body || '').trim().slice(0, 3000);
    if (!cleanTitle || !cleanBody) {
      res.status(400).json({ error: 'عنوان الإعلان ونصه مطلوبان.' });
      return;
    }
    const info = db
      .prepare(
        `INSERT INTO school_announcements (school_id, department_id, author_user_id, title, body)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(
        schoolId,
        req.body?.departmentId ? Number(req.body.departmentId) : null,
        userId,
        cleanTitle,
        cleanBody
      );
    res.status(201).json({ ok: true, id: Number(info.lastInsertRowid) });
  });

  // Admin: list & approve/reject/suspend schools
  router.get('/admin/schools', requireAdminPermission('schools', 'departments'), (_req, res) => {
    const rows = db
      .prepare(
        `SELECT s.*, u.name as owner_name, u.email as owner_email,
                (SELECT COUNT(*) FROM school_departments sd WHERE sd.school_id = s.id) as departments_count,
                (SELECT COUNT(*) FROM school_teachers st WHERE st.school_id = s.id AND st.status = 'active') as teachers_count,
                (SELECT COUNT(*) FROM school_students ss WHERE ss.school_id = s.id AND ss.status = 'active') as students_count
         FROM schools s
         JOIN users u ON u.id = s.owner_user_id
         ORDER BY CASE WHEN s.status = 'pending' THEN 0 ELSE 1 END, s.id DESC`
      )
      .all();
    res.json({ schools: rows });
  });

  router.patch('/admin/schools/:id', requireAdminPermission('schools'), (req: AuthenticatedRequest, res) => {
    const schoolId = Number(req.params.id);
    const { status, rejection_reason, verified_account } = req.body ?? {};
    const school = db.prepare('SELECT * FROM schools WHERE id = ?').get(schoolId) as any;
    if (!school) {
      res.status(404).json({ error: 'المدرسة غير موجودة.' });
      return;
    }
    const nextStatus = ['pending', 'active', 'rejected', 'suspended'].includes(String(status || ''))
      ? String(status)
      : school.status;
    const nextVerified = verified_account !== undefined ? (verified_account ? 1 : 0) : school.verified_account;
    db.prepare(
      `UPDATE schools
       SET status = ?,
           verified_account = ?,
           rejection_reason = ?,
           approved_by = CASE WHEN ? = 'active' THEN ? ELSE approved_by END,
           approved_at = CASE WHEN ? = 'active' THEN datetime('now') ELSE approved_at END,
           updated_at = datetime('now')
       WHERE id = ?`
    ).run(
      nextStatus,
      nextVerified,
      String(rejection_reason ?? school.rejection_reason ?? '').trim().slice(0, 400),
      nextStatus,
      req.authUser!.userId,
      nextStatus,
      schoolId
    );

    const titleAr =
      nextStatus === 'active'
        ? `تمت الموافقة على تفعيل مدرسة ${school.name}`
        : `تحديث حالة طلب مدرسة ${school.name}`;
    const bodyAr =
      nextStatus === 'active'
        ? `تهانينا! تمت الموافقة على إنشاء مدرستك "${school.name}" ويمكنك الآن إضافة الشعب والمعلمين والطلاب.`
        : `تم تحديث حالة المدرسة إلى (${nextStatus})${rejection_reason ? `: ${rejection_reason}` : ''}.`;

    const nRes = db
      .prepare(
        `INSERT INTO notifications (user_id, title_ar, title_fr, body_ar, body_fr, type, target_scope)
         VALUES (?, ?, ?, ?, ?, 'info', 'current_users')`
      )
      .run(school.owner_user_id, titleAr, titleAr, bodyAr, bodyAr);
    broadcastNotificationEvent({
      targetUserId: school.owner_user_id,
      payload: { id: Number(nRes.lastInsertRowid), title_ar: titleAr, body_ar: bodyAr, type: 'info', created_at: new Date().toISOString() },
    });

    logAudit(req.authUser!.userId, req.authUser!.email, 'ADMIN_UPDATE_SCHOOL', 'school', schoolId, `status=${nextStatus}`);
    res.json({ ok: true });
  });

  return router;
}
