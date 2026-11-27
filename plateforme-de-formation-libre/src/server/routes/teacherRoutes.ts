import crypto from 'crypto';
import { Router } from 'express';
import { requireAuth, type AuthenticatedRequest } from '../auth';
import { db, logAudit } from '../db';
import { broadcastNotificationEvent } from '../realtime';

function generateShareCode(): string {
  return `SEC-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

function getSectionAccess(sectionId: number, userId: number) {
  const section = db.prepare('SELECT * FROM teacher_sections WHERE id = ?').get(sectionId) as any;
  if (!section) return null;
  const isOwner = section.teacher_user_id === userId;
  const assistant = db
    .prepare('SELECT * FROM section_assistants WHERE section_id = ? AND user_id = ?')
    .get(sectionId, userId) as any;
  const member = db
    .prepare('SELECT * FROM section_members WHERE section_id = ? AND user_id = ?')
    .get(sectionId, userId) as any;

  let assistantPerms: string[] = [];
  if (assistant?.permissions_json) {
    try {
      assistantPerms = JSON.parse(assistant.permissions_json);
    } catch {
      assistantPerms = [];
    }
  }

  return {
    section,
    isOwner,
    isAssistant: Boolean(assistant),
    assistantPerms,
    member,
    isActiveMember: Boolean(member && member.status === 'active'),
    canManage: isOwner || Boolean(assistant),
  };
}

export function createTeacherRouter() {
  const router = Router();

  // Search registered users cleanly for inviting students or assistants
  router.get('/teacher/users/search', requireAuth, (req: AuthenticatedRequest, res) => {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) {
      res.json({ users: [] });
      return;
    }
    const like = `%${q}%`;
    const rows = db
      .prepare(
        `SELECT id, name, email, phone, role, level, track, verified_account, verified_badge_label
         FROM users
         WHERE id != ? AND (name LIKE ? OR email LIKE ? OR phone LIKE ?)
         ORDER BY name ASC LIMIT 20`
      )
      .all(req.authUser!.userId, like, like, like);
    res.json({ users: rows });
  });

  // List sections owned, assisted, or joined + public catalog
  router.get('/teacher/sections', requireAuth, (req: AuthenticatedRequest, res) => {
    const userId = req.authUser!.userId;
    const owned = db
      .prepare(
        `SELECT ts.*, u.name as teacher_name, u.verified_account as teacher_verified,
                (SELECT COUNT(*) FROM section_members sm WHERE sm.section_id = ts.id AND sm.status = 'active') as members_count,
                (SELECT COUNT(*) FROM section_content sc WHERE sc.section_id = ts.id) as content_count
         FROM teacher_sections ts
         JOIN users u ON u.id = ts.teacher_user_id
         WHERE ts.teacher_user_id = ?
         ORDER BY ts.id DESC`
      )
      .all(userId);

    const assisted = db
      .prepare(
        `SELECT ts.*, u.name as teacher_name, u.verified_account as teacher_verified, sa.permissions_json,
                (SELECT COUNT(*) FROM section_members sm WHERE sm.section_id = ts.id AND sm.status = 'active') as members_count
         FROM section_assistants sa
         JOIN teacher_sections ts ON ts.id = sa.section_id
         JOIN users u ON u.id = ts.teacher_user_id
         WHERE sa.user_id = ? AND ts.status = 'active'
         ORDER BY ts.id DESC`
      )
      .all(userId);

    const joined = db
      .prepare(
        `SELECT ts.*, u.name as teacher_name, u.verified_account as teacher_verified,
                sm.status as membership_status, sm.id as member_id, sm.joined_at
         FROM section_members sm
         JOIN teacher_sections ts ON ts.id = sm.section_id
         JOIN users u ON u.id = ts.teacher_user_id
         WHERE sm.user_id = ? AND sm.status IN ('active', 'invited', 'pending_approval')
         ORDER BY sm.id DESC`
      )
      .all(userId);

    const publicSections = db
      .prepare(
        `SELECT ts.*, u.name as teacher_name, u.verified_account as teacher_verified,
                (SELECT COUNT(*) FROM section_members sm WHERE sm.section_id = ts.id AND sm.status = 'active') as members_count
         FROM teacher_sections ts
         JOIN users u ON u.id = ts.teacher_user_id
         WHERE ts.visibility = 'public' AND ts.status = 'active'
         ORDER BY members_count DESC, ts.id DESC LIMIT 60`
      )
      .all();

    res.json({ owned, assisted, joined, publicSections });
  });

  // Create a new Teacher/Professor Section (independent of schools)
  router.post('/teacher/sections', requireAuth, (req: AuthenticatedRequest, res) => {
    const userId = req.authUser!.userId;
    const { name, description, subject_name, school_name, school_id, visibility, allow_student_invites } =
      req.body ?? {};
    const cleanName = String(name || '').trim().slice(0, 140);
    if (cleanName.length < 3) {
      res.status(400).json({ error: 'اسم القسم يجب أن يكون 3 أحرف على الأقل.' });
      return;
    }

    const userRow = db.prepare('SELECT id, role, level FROM users WHERE id = ?').get(userId) as any;
    const isEducator =
      ['teacher', 'admin', 'editor'].includes(userRow?.role) ||
      ['teacher', 'professor'].includes(userRow?.level);
    if (!isEducator) {
      res.status(403).json({
        error: 'إنشاء الأقسام متاح للمعلمين والأساتذة. يمكنك تحديث نوع حسابك من الملف الشخصي.',
      });
      return;
    }

    const vis = visibility === 'public' ? 'public' : 'private';
    let shareCode = generateShareCode();
    while (db.prepare('SELECT id FROM teacher_sections WHERE share_code = ?').get(shareCode)) {
      shareCode = generateShareCode();
    }

    const info = db
      .prepare(
        `INSERT INTO teacher_sections (
          teacher_user_id, school_id, school_name, name, description, subject_name,
          visibility, share_code, allow_student_invites
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        userId,
        school_id ? Number(school_id) : null,
        String(school_name || '').trim().slice(0, 140),
        cleanName,
        String(description || '').trim().slice(0, 1200),
        String(subject_name || '').trim().slice(0, 120),
        vis,
        shareCode,
        allow_student_invites ? 1 : 0
      );

    const created = db.prepare('SELECT * FROM teacher_sections WHERE id = ?').get(info.lastInsertRowid);
    logAudit(userId, req.authUser!.email, 'CREATE_TEACHER_SECTION', 'teacher_section', Number(info.lastInsertRowid), cleanName);
    res.status(201).json({ ok: true, section: created });
  });

  // Public Section Preview by shareCode
  router.get('/sections/public/:shareCode', (req: AuthenticatedRequest, res) => {
    const shareCode = String(req.params.shareCode || '').trim().toUpperCase();
    const section = db
      .prepare(
        `SELECT ts.*, u.name as teacher_name, u.verified_account as teacher_verified, u.verified_badge_label,
                u.teacher_category, u.professor_specialty,
                (SELECT COUNT(*) FROM section_members sm WHERE sm.section_id = ts.id AND sm.status = 'active') as members_count
         FROM teacher_sections ts
         JOIN users u ON u.id = ts.teacher_user_id
         WHERE upper(ts.share_code) = ? AND ts.status = 'active'`
      )
      .get(shareCode) as any;

    if (!section) {
      res.status(404).json({ error: 'القسم غير موجود أو تمت أرشفته.' });
      return;
    }

    let myMembership: any = null;
    if (req.authUser) {
      myMembership = db
        .prepare('SELECT id, status, joined_at FROM section_members WHERE section_id = ? AND user_id = ?')
        .get(section.id, req.authUser.userId);
    }

    const canViewDetails =
      section.visibility === 'public' ||
      (req.authUser &&
        (section.teacher_user_id === req.authUser.userId || myMembership?.status === 'active'));

    if (!canViewDetails) {
      res.json({
        section: {
          id: section.id,
          name: section.name,
          subject_name: section.subject_name,
          teacher_user_id: section.teacher_user_id,
          teacher_name: section.teacher_name,
          teacher_verified: section.teacher_verified,
          visibility: section.visibility,
          share_code: section.share_code,
          members_count: section.members_count,
          locked: true,
        },
        myMembership,
      });
      return;
    }

    const content = db
      .prepare(
        `SELECT sc.*, u.name as author_name
         FROM section_content sc
         JOIN users u ON u.id = sc.author_user_id
         WHERE sc.section_id = ? ORDER BY sc.id DESC`
      )
      .all(section.id);

    const tests = db
      .prepare('SELECT id, title, description, duration_minutes, max_score, published, created_at FROM section_tests WHERE section_id = ? AND published = 1 ORDER BY id DESC')
      .all(section.id);

    res.json({
      section: { ...section, locked: false },
      myMembership,
      content,
      tests,
    });
  });

  // Update section settings
  router.patch('/teacher/sections/:id', requireAuth, (req: AuthenticatedRequest, res) => {
    const sectionId = Number(req.params.id);
    const access = getSectionAccess(sectionId, req.authUser!.userId);
    if (!access || !access.isOwner) {
      res.status(403).json({ error: 'فقط منشئ القسم يمكنه تعديل إعداداته.' });
      return;
    }
    const { name, description, subject_name, school_name, visibility, allow_student_invites, status } =
      req.body ?? {};
    db.prepare(
      `UPDATE teacher_sections
       SET name = COALESCE(?, name),
           description = COALESCE(?, description),
           subject_name = COALESCE(?, subject_name),
           school_name = COALESCE(?, school_name),
           visibility = COALESCE(?, visibility),
           allow_student_invites = COALESCE(?, allow_student_invites),
           status = COALESCE(?, status),
           updated_at = datetime('now')
       WHERE id = ?`
    ).run(
      name ? String(name).trim().slice(0, 140) : null,
      description !== undefined ? String(description).trim().slice(0, 1200) : null,
      subject_name !== undefined ? String(subject_name).trim().slice(0, 120) : null,
      school_name !== undefined ? String(school_name).trim().slice(0, 140) : null,
      visibility === 'public' || visibility === 'private' ? visibility : null,
      allow_student_invites !== undefined ? (allow_student_invites ? 1 : 0) : null,
      status === 'active' || status === 'archived' ? status : null,
      sectionId
    );
    const updated = db.prepare('SELECT * FROM teacher_sections WHERE id = ?').get(sectionId);
    res.json({ ok: true, section: updated });
  });

  // Full Section Workspace Details (members, assistants, content, tests, evaluations, messages)
  router.get('/sections/:id/detail', requireAuth, (req: AuthenticatedRequest, res) => {
    const sectionId = Number(req.params.id);
    const userId = req.authUser!.userId;
    const access = getSectionAccess(sectionId, userId);
    if (!access) {
      res.status(404).json({ error: 'القسم غير موجود.' });
      return;
    }

    const canEnter =
      access.canManage ||
      access.isActiveMember ||
      access.section.visibility === 'public';
    if (!canEnter) {
      res.status(403).json({ error: 'هذا القسم خاص ويتطلب دعوة أو موافقة المعلم.' });
      return;
    }

    const teacherRow = db
      .prepare('SELECT id, name, verified_account, verified_badge_label, teacher_category, professor_specialty FROM users WHERE id = ?')
      .get(access.section.teacher_user_id);

    const content = db
      .prepare(
        `SELECT sc.*, u.name as author_name
         FROM section_content sc JOIN users u ON u.id = sc.author_user_id
         WHERE sc.section_id = ? ORDER BY sc.id DESC`
      )
      .all(sectionId);

    const testsRaw = db
      .prepare('SELECT * FROM section_tests WHERE section_id = ? ORDER BY id DESC')
      .all(sectionId) as any[];

    const tests = testsRaw.map((t) => {
      const qs = db
        .prepare('SELECT id, stem, options_json, correct_index, points FROM section_test_questions WHERE test_id = ? ORDER BY id ASC')
        .all(t.id) as any[];
      const mySubmission = db
        .prepare('SELECT * FROM section_test_submissions WHERE test_id = ? AND student_user_id = ?')
        .get(t.id, userId) as any;
      return {
        ...t,
        questions: qs.map((q) => ({
          id: q.id,
          stem: q.stem,
          options: JSON.parse(q.options_json || '[]'),
          ...(access.canManage || mySubmission ? { correct_index: q.correct_index } : {}),
          points: q.points,
        })),
        mySubmission: mySubmission || null,
      };
    });

    const messages = db
      .prepare(
        `SELECT sm.*, u.name as sender_name, u.verified_account as sender_verified
         FROM section_messages sm JOIN users u ON u.id = sm.sender_user_id
         WHERE sm.section_id = ? ORDER BY sm.id DESC LIMIT 80`
      )
      .all(sectionId);

    const members = access.canManage
      ? db
          .prepare(
            `SELECT sm.*, u.name, u.email, u.phone, u.level, u.verified_account
             FROM section_members sm JOIN users u ON u.id = sm.user_id
             WHERE sm.section_id = ? ORDER BY sm.id DESC`
          )
          .all(sectionId)
      : [];

    const assistants = access.canManage
      ? db
          .prepare(
            `SELECT sa.*, u.name, u.email FROM section_assistants sa
             JOIN users u ON u.id = sa.user_id WHERE sa.section_id = ?`
          )
          .all(sectionId)
      : [];

    const evaluations = access.canManage
      ? db
          .prepare(
            `SELECT se.*, u.name as student_name, t.name as teacher_name
             FROM section_evaluations se
             JOIN users u ON u.id = se.student_user_id
             JOIN users t ON t.id = se.teacher_user_id
             WHERE se.section_id = ? ORDER BY se.id DESC`
          )
          .all(sectionId)
      : db
          .prepare(
            `SELECT se.*, t.name as teacher_name
             FROM section_evaluations se
             JOIN users t ON t.id = se.teacher_user_id
             WHERE se.section_id = ? AND se.student_user_id = ? ORDER BY se.id DESC`
          )
          .all(sectionId, userId);

    res.json({
      section: access.section,
      teacher: teacherRow,
      canManage: access.canManage,
      isOwner: access.isOwner,
      isActiveMember: access.isActiveMember,
      memberStatus: access.member?.status || null,
      content,
      tests,
      messages,
      members,
      assistants,
      evaluations,
    });
  });

  // Invite student to section by userId or email/phone
  router.post('/teacher/sections/:id/invite', requireAuth, (req: AuthenticatedRequest, res) => {
    const sectionId = Number(req.params.id);
    const userId = req.authUser!.userId;
    const access = getSectionAccess(sectionId, userId);
    if (!access) {
      res.status(404).json({ error: 'القسم غير موجود.' });
      return;
    }

    const studentAllowedToInvite =
      access.isActiveMember && Boolean(access.section.allow_student_invites);
    if (!access.canManage && !studentAllowedToInvite) {
      res.status(403).json({ error: 'غير مصرح لك بدعوة أعضاء لهذا القسم.' });
      return;
    }

    const { targetUserId, query } = req.body ?? {};
    let target: any = null;
    if (targetUserId) {
      target = db.prepare('SELECT id, name, email FROM users WHERE id = ?').get(Number(targetUserId));
    } else if (query) {
      const cleanQ = String(query).trim().toLowerCase();
      target = db
        .prepare('SELECT id, name, email FROM users WHERE lower(email) = ? OR phone = ? LIMIT 1')
        .get(cleanQ, String(query).trim());
    }
    if (!target) {
      res.status(404).json({ error: 'لم يتم العثور على المستخدم المطلوب.' });
      return;
    }

    db.prepare(
      `INSERT INTO section_members (section_id, user_id, status, invited_by_user_id, updated_at)
       VALUES (?, ?, 'invited', ?, datetime('now'))
       ON CONFLICT(section_id, user_id) DO UPDATE SET
         status = CASE WHEN section_members.status = 'active' THEN 'active' ELSE 'invited' END,
         invited_by_user_id = excluded.invited_by_user_id,
         updated_at = datetime('now')`
    ).run(sectionId, target.id, userId);

    const titleAr = `دعوة للانضمام إلى قسم: ${access.section.name}`;
    const bodyAr = `دعاك الأستاذ للانضمام إلى قسم "${access.section.name}". يمكنك قبول الدعوة أو رفضها من لوحة الطالب.`;
    const nRes = db
      .prepare(
        `INSERT INTO notifications (user_id, title_ar, title_fr, body_ar, body_fr, type, target_scope)
         VALUES (?, ?, ?, ?, ?, 'info', 'current_users')`
      )
      .run(
        target.id,
        titleAr,
        `Invitation à la section : ${access.section.name}`,
        bodyAr,
        `Vous avez été invité à rejoindre la section "${access.section.name}".`
      );

    broadcastNotificationEvent({
      targetUserId: target.id,
      payload: {
        id: Number(nRes.lastInsertRowid),
        title_ar: titleAr,
        body_ar: bodyAr,
        type: 'info',
        created_at: new Date().toISOString(),
      },
    });

    res.status(201).json({ ok: true, invitedUser: { id: target.id, name: target.name } });
  });

  // Student responds to an invitation (accept or reject)
  router.post('/student/invitations/:memberId/respond', requireAuth, (req: AuthenticatedRequest, res) => {
    const memberId = Number(req.params.memberId);
    const { action } = req.body ?? {};
    const accept = action === 'accept';
    const row = db
      .prepare('SELECT sm.*, ts.name as section_name FROM section_members sm JOIN teacher_sections ts ON ts.id = sm.section_id WHERE sm.id = ? AND sm.user_id = ?')
      .get(memberId, req.authUser!.userId) as any;

    if (!row) {
      res.status(404).json({ error: 'الدعوة غير موجودة.' });
      return;
    }

    db.prepare(
      `UPDATE section_members
       SET status = ?, joined_at = CASE WHEN ? = 'active' THEN datetime('now') ELSE joined_at END, updated_at = datetime('now')
       WHERE id = ?`
    ).run(accept ? 'active' : 'rejected', accept ? 'active' : 'rejected', memberId);

    res.json({ ok: true, status: accept ? 'active' : 'rejected' });
  });

  // Join public section (or join via shareCode)
  router.post('/sections/:id/join', requireAuth, (req: AuthenticatedRequest, res) => {
    const sectionId = Number(req.params.id);
    const section = db.prepare("SELECT * FROM teacher_sections WHERE id = ? AND status = 'active'").get(sectionId) as any;
    if (!section) {
      res.status(404).json({ error: 'القسم غير موجود.' });
      return;
    }
    const shareCode = String(req.body?.shareCode || '').trim().toUpperCase();
    const isDirectJoinAllowed = section.visibility === 'public' || (shareCode && shareCode === section.share_code.toUpperCase());
    if (!isDirectJoinAllowed) {
      res.status(403).json({ error: 'هذا القسم خاص ويتطلب دعوة أو رمز انضمام صحيح.' });
      return;
    }

    db.prepare(
      `INSERT INTO section_members (section_id, user_id, status, joined_at, updated_at)
       VALUES (?, ?, 'active', datetime('now'), datetime('now'))
       ON CONFLICT(section_id, user_id) DO UPDATE SET
         status = 'active', joined_at = COALESCE(section_members.joined_at, datetime('now')), updated_at = datetime('now')`
    ).run(sectionId, req.authUser!.userId);

    res.json({ ok: true, status: 'active' });
  });

  router.post('/sections/:id/leave', requireAuth, (req: AuthenticatedRequest, res) => {
    const sectionId = Number(req.params.id);
    db.prepare(
      "UPDATE section_members SET status = 'left', updated_at = datetime('now') WHERE section_id = ? AND user_id = ?"
    ).run(sectionId, req.authUser!.userId);
    res.json({ ok: true });
  });

  router.delete('/teacher/sections/:id/members/:userId', requireAuth, (req: AuthenticatedRequest, res) => {
    const sectionId = Number(req.params.id);
    const targetUserId = Number(req.params.userId);
    const access = getSectionAccess(sectionId, req.authUser!.userId);
    if (!access || !access.canManage) {
      res.status(403).json({ error: 'غير مصرح بإزالة أعضاء القسم.' });
      return;
    }
    db.prepare(
      "UPDATE section_members SET status = 'removed', updated_at = datetime('now') WHERE section_id = ? AND user_id = ?"
    ).run(sectionId, targetUserId);
    res.json({ ok: true });
  });

  // Assistants management
  router.post('/teacher/sections/:id/assistants', requireAuth, (req: AuthenticatedRequest, res) => {
    const sectionId = Number(req.params.id);
    const access = getSectionAccess(sectionId, req.authUser!.userId);
    if (!access || !access.isOwner) {
      res.status(403).json({ error: 'فقط صاحب القسم يمكنه تعيين مساعدين.' });
      return;
    }
    const { userId: targetId, permissions } = req.body ?? {};
    const validPerms = Array.isArray(permissions)
      ? permissions.filter((p) => ['manage_content', 'manage_tests', 'evaluate_students', 'invite_students'].includes(String(p)))
      : ['manage_content', 'evaluate_students'];
    db.prepare(
      `INSERT INTO section_assistants (section_id, user_id, permissions_json, added_by_user_id)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(section_id, user_id) DO UPDATE SET permissions_json = excluded.permissions_json`
    ).run(sectionId, Number(targetId), JSON.stringify(validPerms), req.authUser!.userId);
    res.status(201).json({ ok: true });
  });

  router.delete('/teacher/sections/:id/assistants/:userId', requireAuth, (req: AuthenticatedRequest, res) => {
    const sectionId = Number(req.params.id);
    const access = getSectionAccess(sectionId, req.authUser!.userId);
    if (!access || !access.isOwner) {
      res.status(403).json({ error: 'فقط صاحب القسم يمكنه إزالة المساعدين.' });
      return;
    }
    db.prepare('DELETE FROM section_assistants WHERE section_id = ? AND user_id = ?').run(
      sectionId,
      Number(req.params.userId)
    );
    res.json({ ok: true });
  });

  // Publish content inside section (lessons, explanations, PDF, images, audio)
  router.post('/teacher/sections/:id/content', requireAuth, (req: AuthenticatedRequest, res) => {
    const sectionId = Number(req.params.id);
    const access = getSectionAccess(sectionId, req.authUser!.userId);
    if (!access || !access.canManage) {
      res.status(403).json({ error: 'غير مصرح بنشر محتوى في هذا القسم.' });
      return;
    }
    const { content_type, title, body, file_id } = req.body ?? {};
    const cleanType = ['lesson', 'explanation', 'pdf', 'image', 'audio'].includes(String(content_type))
      ? String(content_type)
      : 'explanation';
    const cleanTitle = String(title || '').trim().slice(0, 180);
    if (!cleanTitle) {
      res.status(400).json({ error: 'عنوان المحتوى مطلوب.' });
      return;
    }
    const info = db
      .prepare(
        `INSERT INTO section_content (section_id, author_user_id, content_type, title, body, file_id)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        sectionId,
        req.authUser!.userId,
        cleanType,
        cleanTitle,
        String(body || '').trim().slice(0, 20000),
        file_id ? String(file_id).trim() : null
      );
    res.status(201).json({ ok: true, id: Number(info.lastInsertRowid) });
  });

  // Create Section Test with Questions
  router.post('/teacher/sections/:id/tests', requireAuth, (req: AuthenticatedRequest, res) => {
    const sectionId = Number(req.params.id);
    const access = getSectionAccess(sectionId, req.authUser!.userId);
    if (!access || !access.canManage) {
      res.status(403).json({ error: 'غير مصرح بإنشاء اختبارات في هذا القسم.' });
      return;
    }
    const { title, description, duration_minutes, max_score, questions } = req.body ?? {};
    const cleanTitle = String(title || '').trim().slice(0, 180);
    if (!cleanTitle || !Array.isArray(questions) || questions.length === 0) {
      res.status(400).json({ error: 'عنوان الاختبار وسؤال واحد على الأقل مطلوبان.' });
      return;
    }

    let createdTestId = 0;
    db.transaction(() => {
      const tInfo = db
        .prepare(
          `INSERT INTO section_tests (section_id, author_user_id, title, description, duration_minutes, max_score)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run(
          sectionId,
          req.authUser!.userId,
          cleanTitle,
          String(description || '').trim().slice(0, 1000),
          Math.max(5, Math.min(180, Number(duration_minutes || 30))),
          Math.max(5, Math.min(100, Number(max_score || 20)))
        );
      createdTestId = Number(tInfo.lastInsertRowid);

      const qStmt = db.prepare(
        `INSERT INTO section_test_questions (test_id, stem, options_json, correct_index, points)
         VALUES (?, ?, ?, ?, ?)`
      );
      for (const q of questions.slice(0, 50)) {
        const opts = Array.isArray(q.options) ? q.options.map((o: any) => String(o).trim()).filter(Boolean) : [];
        if (!q.stem || opts.length < 2) continue;
        qStmt.run(
          createdTestId,
          String(q.stem).trim().slice(0, 1000),
          JSON.stringify(opts.slice(0, 4)),
          Math.max(0, Math.min(opts.length - 1, Number(q.correct_index || 0))),
          Math.max(0.5, Number(q.points || 1))
        );
      }
    })();

    res.status(201).json({ ok: true, id: createdTestId });
  });

  // Student submits a section test -> server calculates exact grade
  router.post('/sections/tests/:testId/submit', requireAuth, (req: AuthenticatedRequest, res) => {
    const testId = Number(req.params.testId);
    const test = db.prepare('SELECT * FROM section_tests WHERE id = ?').get(testId) as any;
    if (!test) {
      res.status(404).json({ error: 'الاختبار غير موجود.' });
      return;
    }

    const access = getSectionAccess(test.section_id, req.authUser!.userId);
    if (!access || (!access.isActiveMember && !access.canManage && access.section.visibility !== 'public')) {
      res.status(403).json({ error: 'يجب الانضمام إلى القسم للمشاركة في اختباره.' });
      return;
    }

    const qs = db.prepare('SELECT * FROM section_test_questions WHERE test_id = ?').all(testId) as any[];
    const answers = req.body?.answers && typeof req.body.answers === 'object' ? req.body.answers : {};

    let earned = 0;
    let totalPts = 0;
    for (const q of qs) {
      const pts = Number(q.points || 1);
      totalPts += pts;
      const chosen = answers[String(q.id)];
      if (chosen !== undefined && Number(chosen) === Number(q.correct_index)) {
        earned += pts;
      }
    }
    const maxScore = Number(test.max_score || 20);
    const normalizedScore = totalPts > 0 ? Number(((earned / totalPts) * maxScore).toFixed(2)) : 0;

    db.prepare(
      `INSERT INTO section_test_submissions (test_id, student_user_id, answers_json, score, max_score, submitted_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(test_id, student_user_id) DO UPDATE SET
         answers_json = excluded.answers_json,
         score = excluded.score,
         max_score = excluded.max_score,
         submitted_at = datetime('now')`
    ).run(testId, req.authUser!.userId, JSON.stringify(answers), normalizedScore, maxScore);

    res.json({ ok: true, score: normalizedScore, maxScore });
  });

  // Teacher records explicit evaluation/note for a student
  router.post('/teacher/sections/:id/evaluations', requireAuth, (req: AuthenticatedRequest, res) => {
    const sectionId = Number(req.params.id);
    const access = getSectionAccess(sectionId, req.authUser!.userId);
    if (!access || !access.canManage) {
      res.status(403).json({ error: 'غير مصرح بتقييم طلاب هذا القسم.' });
      return;
    }
    const { studentUserId, score, maxScore, note } = req.body ?? {};
    const targetId = Number(studentUserId);
    if (!targetId) {
      res.status(400).json({ error: 'يرجى تحديد الطالب.' });
      return;
    }

    db.prepare(
      `INSERT INTO section_evaluations (section_id, student_user_id, teacher_user_id, score, max_score, note)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      sectionId,
      targetId,
      req.authUser!.userId,
      score !== undefined && score !== '' ? Number(score) : null,
      Math.max(1, Number(maxScore || 20)),
      String(note || '').trim().slice(0, 2000)
    );

    res.status(201).json({ ok: true });
  });

  // Student progress overview inside section
  router.get('/teacher/sections/:id/progress', requireAuth, (req: AuthenticatedRequest, res) => {
    const sectionId = Number(req.params.id);
    const access = getSectionAccess(sectionId, req.authUser!.userId);
    if (!access || !access.canManage) {
      res.status(403).json({ error: 'غير مصرح بعرض تقارير هذا القسم.' });
      return;
    }

    const students = db
      .prepare(
        `SELECT sm.user_id, sm.joined_at, u.name, u.email, u.level,
                (SELECT COUNT(*) FROM section_test_submissions sts
                 JOIN section_tests st ON st.id = sts.test_id
                 WHERE st.section_id = ? AND sts.student_user_id = sm.user_id) as tests_completed,
                (SELECT AVG(sts.score) FROM section_test_submissions sts
                 JOIN section_tests st ON st.id = sts.test_id
                 WHERE st.section_id = ? AND sts.student_user_id = sm.user_id) as avg_test_score
         FROM section_members sm
         JOIN users u ON u.id = sm.user_id
         WHERE sm.section_id = ? AND sm.status = 'active'
         ORDER BY u.name ASC`
      )
      .all(sectionId, sectionId, sectionId);

    res.json({ students });
  });

  // Section communication messages
  router.post('/sections/:id/messages', requireAuth, (req: AuthenticatedRequest, res) => {
    const sectionId = Number(req.params.id);
    const access = getSectionAccess(sectionId, req.authUser!.userId);
    if (!access || (!access.canManage && !access.isActiveMember)) {
      res.status(403).json({ error: 'يجب أن تكون عضواً في القسم لإرسال الرسائل.' });
      return;
    }
    const cleanMsg = String(req.body?.message || '').trim().slice(0, 2000);
    if (!cleanMsg) {
      res.status(400).json({ error: 'نص الرسالة مطلوب.' });
      return;
    }
    const info = db
      .prepare('INSERT INTO section_messages (section_id, sender_user_id, message) VALUES (?, ?, ?)')
      .run(sectionId, req.authUser!.userId, cleanMsg);
    res.status(201).json({ ok: true, id: Number(info.lastInsertRowid) });
  });

  // Student dashboard institutional summary (sections, pending invitations, evaluations)
  router.get('/student/institutional-summary', requireAuth, (req: AuthenticatedRequest, res) => {
    const userId = req.authUser!.userId;
    const invitations = db
      .prepare(
        `SELECT sm.id as member_id, sm.section_id, sm.created_at, ts.name as section_name, ts.subject_name, ts.share_code,
                u.name as teacher_name, u.verified_account as teacher_verified
         FROM section_members sm
         JOIN teacher_sections ts ON ts.id = sm.section_id
         JOIN users u ON u.id = ts.teacher_user_id
         WHERE sm.user_id = ? AND sm.status = 'invited' AND ts.status = 'active'
         ORDER BY sm.id DESC`
      )
      .all(userId);

    const joinedSections = db
      .prepare(
        `SELECT ts.id, ts.name, ts.subject_name, ts.share_code, ts.visibility, sm.joined_at,
                u.name as teacher_name, u.verified_account as teacher_verified
         FROM section_members sm
         JOIN teacher_sections ts ON ts.id = sm.section_id
         JOIN users u ON u.id = ts.teacher_user_id
         WHERE sm.user_id = ? AND sm.status = 'active' AND ts.status = 'active'
         ORDER BY sm.id DESC`
      )
      .all(userId);

    const evaluations = db
      .prepare(
        `SELECT se.*, ts.name as section_name, t.name as teacher_name
         FROM section_evaluations se
         JOIN teacher_sections ts ON ts.id = se.section_id
         JOIN users t ON t.id = se.teacher_user_id
         WHERE se.student_user_id = ?
         ORDER BY se.id DESC LIMIT 25`
      )
      .all(userId);

    res.json({ invitations, joinedSections, evaluations });
  });

  return router;
}
