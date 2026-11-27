import Database from 'better-sqlite3';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { stripArabicDiacritics } from '../utils/arabicText';
import { normalizeQuestionFingerprint } from './auth';
import {
  SEED_EXAM_CONFIGS,
  SEED_LESSONS,
  SEED_NOTIFICATIONS,
  SEED_SUBJECTS,
  SEED_SUMMARIES,
  SEED_TRACKS,
} from './seedData';
import { getAllExtendedQuestions } from './seedQuestions';
import {
  SEED_BAC_COEFFICIENTS,
  SEED_BAC_LESSONS,
  SEED_BAC_SERIES,
  getBaccalaureateSeedQuestions,
} from './seedBaccalaureate';

const DATA_DIR = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'formation_libre.db');
export const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function expireOverdueSubscriptions(): number {
  const res = db
    .prepare(
      `UPDATE user_subscriptions
       SET status = 'expired'
       WHERE status = 'active' AND expires_at IS NOT NULL AND datetime(expires_at) <= datetime('now')`
    )
    .run();

  db.prepare(
    `UPDATE subscription_requests
     SET status = 'expired', updated_at = datetime('now')
     WHERE status = 'approved' AND expires_at IS NOT NULL AND datetime(expires_at) <= datetime('now')`
  ).run();

  return res.changes;
}

export function initializeDatabase(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('admin', 'editor', 'teacher', 'student')),
      track TEXT NOT NULL DEFAULT 'bilingual' CHECK (track IN ('arabic', 'french', 'bilingual')),
      preferred_lang TEXT NOT NULL DEFAULT 'ar' CHECK (preferred_lang IN ('ar', 'fr', 'en')),
      level TEXT NOT NULL DEFAULT 'foundation' CHECK (level IN ('foundation', 'intermediate', 'advanced')),
      token_version INTEGER NOT NULL DEFAULT 1,
      reset_token TEXT,
      reset_expires INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS password_resets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      method TEXT NOT NULL CHECK (method IN ('link', 'otp', 'verified_otp')),
      token_hash TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 5,
      expires_at INTEGER NOT NULL,
      used_at INTEGER,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_password_resets_token ON password_resets(token_hash);
    CREATE INDEX IF NOT EXISTS idx_password_resets_user ON password_resets(user_id);

    CREATE TABLE IF NOT EXISTS auth_rate_limits (
      key TEXT PRIMARY KEY,
      count INTEGER NOT NULL DEFAULT 0,
      window_start INTEGER NOT NULL,
      last_attempt INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tracks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      name_ar TEXT NOT NULL,
      name_fr TEXT NOT NULL,
      description_ar TEXT NOT NULL,
      description_fr TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS subjects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      name_ar TEXT NOT NULL,
      name_fr TEXT NOT NULL,
      tracks_json TEXT NOT NULL,
      official_program_ref TEXT NOT NULL,
      icon_name TEXT NOT NULL DEFAULT 'BookOpen',
      display_order INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS lessons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subject_slug TEXT NOT NULL,
      track TEXT NOT NULL,
      level TEXT NOT NULL,
      title_ar TEXT NOT NULL,
      title_fr TEXT NOT NULL,
      summary_ar TEXT NOT NULL,
      summary_fr TEXT NOT NULL,
      explanation_ar TEXT NOT NULL,
      explanation_speech_ar TEXT NOT NULL,
      explanation_fr TEXT NOT NULL,
      examples_json TEXT NOT NULL DEFAULT '[]',
      exercises_json TEXT NOT NULL DEFAULT '[]',
      mcq_json TEXT NOT NULL DEFAULT '[]',
      lesson_order INTEGER NOT NULL DEFAULT 1,
      created_by INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS summaries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subject_slug TEXT NOT NULL,
      track TEXT NOT NULL,
      level TEXT NOT NULL,
      title_ar TEXT NOT NULL,
      title_fr TEXT NOT NULL,
      content_ar TEXT NOT NULL,
      content_speech_ar TEXT NOT NULL,
      content_fr TEXT NOT NULL,
      key_points_json TEXT NOT NULL DEFAULT '[]',
      file_url TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subject_slug TEXT NOT NULL,
      track TEXT NOT NULL,
      level TEXT NOT NULL,
      axis_ar TEXT NOT NULL DEFAULT '',
      axis_fr TEXT NOT NULL DEFAULT '',
      lesson_id INTEGER,
      topic_ar TEXT NOT NULL,
      topic_fr TEXT NOT NULL,
      skill_ar TEXT NOT NULL,
      skill_fr TEXT NOT NULL,
      question_type TEXT NOT NULL DEFAULT 'mcq',
      difficulty TEXT NOT NULL DEFAULT 'medium' CHECK (difficulty IN ('easy', 'medium', 'hard')),
      stem_ar TEXT NOT NULL,
      stem_speech_ar TEXT NOT NULL,
      stem_fr TEXT NOT NULL,
      options_ar_json TEXT NOT NULL,
      options_speech_ar_json TEXT NOT NULL,
      options_fr_json TEXT NOT NULL,
      correct_index INTEGER NOT NULL CHECK (correct_index >= 0 AND correct_index <= 3),
      answer_ar TEXT NOT NULL DEFAULT '',
      answer_speech_ar TEXT NOT NULL DEFAULT '',
      answer_fr TEXT NOT NULL DEFAULT '',
      explanation_ar TEXT NOT NULL,
      explanation_speech_ar TEXT NOT NULL,
      explanation_fr TEXT NOT NULL,
      exam_ref TEXT NOT NULL DEFAULT '',
      target_competition TEXT NOT NULL DEFAULT '',
      content_status TEXT NOT NULL DEFAULT 'published' CHECK (content_status IN ('draft', 'review', 'approved', 'published', 'archived')),
      reviewed_by TEXT,
      reviewed_at TEXT,
      fingerprint_hash TEXT NOT NULL UNIQUE,
      verified INTEGER NOT NULL DEFAULT 1,
      created_by INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS user_lesson_progress (
      user_id INTEGER NOT NULL,
      lesson_id INTEGER NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0,
      is_favorite INTEGER NOT NULL DEFAULT 0,
      last_accessed TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, lesson_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (lesson_id) REFERENCES lessons(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS user_question_history (
      user_id INTEGER NOT NULL,
      question_id INTEGER NOT NULL,
      times_seen INTEGER NOT NULL DEFAULT 0,
      times_correct INTEGER NOT NULL DEFAULT 0,
      last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, question_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS exam_configs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title_ar TEXT NOT NULL,
      title_fr TEXT NOT NULL,
      mode TEXT NOT NULL CHECK (mode IN ('mock', 'official_sim', 'placement')),
      track TEXT NOT NULL DEFAULT 'all',
      subject_slug TEXT NOT NULL DEFAULT 'all',
      level TEXT NOT NULL DEFAULT 'all',
      question_count INTEGER NOT NULL,
      duration_minutes INTEGER NOT NULL,
      max_score REAL NOT NULL DEFAULT 20,
      require_camera_check INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS exam_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      config_id INTEGER NOT NULL,
      mode TEXT NOT NULL,
      track TEXT NOT NULL,
      subject_slug TEXT NOT NULL,
      level TEXT NOT NULL,
      question_ids_json TEXT NOT NULL,
      answers_json TEXT NOT NULL DEFAULT '{}',
      flagged_json TEXT NOT NULL DEFAULT '[]',
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      submitted_at TEXT,
      time_spent_seconds INTEGER NOT NULL DEFAULT 0,
      duration_minutes INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'submitted')),
      score_20 REAL,
      correct_count INTEGER,
      wrong_count INTEGER,
      unanswered_count INTEGER,
      percentage REAL,
      topic_breakdown_json TEXT,
      camera_checked INTEGER NOT NULL DEFAULT 0,
      device_mode TEXT NOT NULL DEFAULT 'desktop',
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      title_ar TEXT NOT NULL,
      title_fr TEXT NOT NULL,
      body_ar TEXT NOT NULL,
      body_fr TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'info',
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS user_notification_reads (
      user_id INTEGER NOT NULL,
      notification_id INTEGER NOT NULL,
      read_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, notification_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (notification_id) REFERENCES notifications(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS support_tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      subject TEXT NOT NULL,
      message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
      admin_reply TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS newsletter_subscribers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      country TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_id INTEGER,
      actor_email TEXT NOT NULL,
      action TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      details TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS subscription_plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      name_ar TEXT NOT NULL,
      name_fr TEXT NOT NULL,
      description_ar TEXT NOT NULL,
      description_fr TEXT NOT NULL,
      price_mru REAL NOT NULL,
      price_eur REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'MRU',
      duration_days INTEGER NOT NULL,
      billing_cycle TEXT NOT NULL CHECK (billing_cycle IN ('free', 'monthly', 'quarterly', 'season', 'annual')),
      features_ar_json TEXT NOT NULL DEFAULT '[]',
      features_fr_json TEXT NOT NULL DEFAULT '[]',
      is_popular INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      display_order INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS user_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      plan_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'pending', 'cancelled')),
      starts_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT,
      payment_tx_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (plan_id) REFERENCES subscription_plans(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS payment_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      plan_id INTEGER NOT NULL,
      amount_mru REAL NOT NULL,
      amount_eur REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'MRU',
      card_brand TEXT NOT NULL CHECK (card_brand IN ('visa', 'mastercard')),
      card_last4 TEXT NOT NULL,
      card_exp_month INTEGER NOT NULL,
      card_exp_year INTEGER NOT NULL,
      cardholder_name TEXT NOT NULL,
      provider TEXT NOT NULL DEFAULT 'sandbox_ready',
      provider_tx_id TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('pending', 'succeeded', 'failed')),
      failure_reason TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (plan_id) REFERENCES subscription_plans(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS plan_limits (
      plan_tier TEXT PRIMARY KEY CHECK (plan_tier IN ('free', 'paid')),
      daily_questions_limit INTEGER NOT NULL DEFAULT 25,
      daily_lessons_limit INTEGER NOT NULL DEFAULT 3,
      daily_exams_limit INTEGER NOT NULL DEFAULT 1,
      allow_official_sim INTEGER NOT NULL DEFAULT 0,
      allow_review_center INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS user_daily_usage (
      user_id INTEGER NOT NULL,
      usage_date TEXT NOT NULL,
      questions_viewed INTEGER NOT NULL DEFAULT 0,
      lessons_viewed INTEGER NOT NULL DEFAULT 0,
      exams_started INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, usage_date),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS payment_methods (
      code TEXT PRIMARY KEY,
      name_ar TEXT NOT NULL,
      name_fr TEXT NOT NULL,
      beneficiary_name TEXT NOT NULL DEFAULT '',
      account_number TEXT NOT NULL DEFAULT '',
      instructions_ar TEXT NOT NULL DEFAULT '',
      instructions_fr TEXT NOT NULL DEFAULT '',
      requires_receipt INTEGER NOT NULL DEFAULT 1,
      active INTEGER NOT NULL DEFAULT 1,
      display_order INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS subscription_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subscription_request_id TEXT NOT NULL UNIQUE,
      user_id INTEGER NOT NULL,
      plan_id INTEGER NOT NULL,
      plan_slug TEXT NOT NULL,
      plan_name TEXT NOT NULL,
      amount REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'MRU',
      payment_method TEXT NOT NULL,
      beneficiary_name TEXT NOT NULL DEFAULT '',
      transaction_reference TEXT NOT NULL DEFAULT '',
      transaction_id TEXT NOT NULL DEFAULT '',
      transaction_at TEXT NOT NULL DEFAULT '',
      proof_data_url TEXT NOT NULL DEFAULT '',
      proof_hash TEXT NOT NULL DEFAULT '',
      uploaded_at TEXT NOT NULL DEFAULT (datetime('now')),
      status TEXT NOT NULL DEFAULT 'pending_review' CHECK (status IN ('pending_review', 'approved', 'rejected', 'expired')),
      rejection_reason TEXT NOT NULL DEFAULT '',
      approved_by TEXT NOT NULL DEFAULT '',
      approved_at TEXT,
      starts_at TEXT,
      expires_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (plan_id) REFERENCES subscription_plans(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS pronunciation_dictionary (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pattern TEXT NOT NULL UNIQUE,
      replacement TEXT NOT NULL,
      lang TEXT NOT NULL DEFAULT 'ar' CHECK (lang IN ('ar', 'fr', 'en', 'all')),
      match_type TEXT NOT NULL DEFAULT 'word' CHECK (match_type IN ('word', 'exact', 'regex')),
      is_regex INTEGER NOT NULL DEFAULT 0,
      enabled INTEGER NOT NULL DEFAULT 1,
      active INTEGER NOT NULL DEFAULT 1,
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS receipt_uploads (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      mime_type TEXT NOT NULL,
      file_name TEXT NOT NULL DEFAULT '',
      size_bytes INTEGER NOT NULL,
      width INTEGER NOT NULL DEFAULT 0,
      height INTEGER NOT NULL DEFAULT 0,
      proof_hash TEXT NOT NULL,
      proof_data_url TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS receipt_inspections (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      plan_id INTEGER NOT NULL,
      payment_method TEXT NOT NULL,
      proof_hash TEXT NOT NULL,
      perceptual_hash TEXT NOT NULL DEFAULT '',
      proof_data_url TEXT NOT NULL,
      extracted_amount REAL,
      extracted_currency TEXT NOT NULL DEFAULT '',
      transaction_id TEXT NOT NULL DEFAULT '',
      transaction_reference TEXT NOT NULL DEFAULT '',
      transaction_at TEXT NOT NULL DEFAULT '',
      beneficiary_name TEXT NOT NULL DEFAULT '',
      beneficiary_account TEXT NOT NULL DEFAULT '',
      confidence REAL NOT NULL DEFAULT 0,
      risk_level TEXT NOT NULL DEFAULT 'normal',
      verdict TEXT NOT NULL CHECK (verdict IN ('verified', 'rejected')),
      reason TEXT NOT NULL DEFAULT '',
      forensics_json TEXT NOT NULL DEFAULT '{}',
      used_at TEXT,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS security_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      firebase_uid TEXT NOT NULL DEFAULT '',
      user_name TEXT NOT NULL DEFAULT '',
      user_email TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      activity_type TEXT NOT NULL,
      payment_method TEXT NOT NULL DEFAULT '',
      risk_level TEXT NOT NULL CHECK (risk_level IN ('normal', 'warning', 'suspicious', 'fraud_rejected')),
      reason TEXT NOT NULL,
      technical_details_json TEXT NOT NULL DEFAULT '{}',
      request_ref TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS analytics_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type TEXT NOT NULL,
      page_view TEXT NOT NULL DEFAULT '',
      user_id INTEGER,
      session_id TEXT NOT NULL DEFAULT '',
      target TEXT NOT NULL DEFAULT '',
      media_id TEXT NOT NULL DEFAULT '',
      position_seconds REAL NOT NULL DEFAULT 0,
      duration_seconds REAL NOT NULL DEFAULT 0,
      max_percent REAL NOT NULL DEFAULT 0,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS issue_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      firebase_uid TEXT NOT NULL DEFAULT '',
      user_name TEXT NOT NULL DEFAULT '',
      user_email TEXT NOT NULL DEFAULT '',
      report_type TEXT NOT NULL DEFAULT 'bug',
      reason TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL,
      screenshot_data_url TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_review', 'resolved', 'closed')),
      admin_reply TEXT NOT NULL DEFAULT '',
      admin_action TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS bac_series (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      code TEXT NOT NULL,
      name_ar TEXT NOT NULL,
      name_fr TEXT NOT NULL,
      description_ar TEXT NOT NULL DEFAULT '',
      description_fr TEXT NOT NULL DEFAULT '',
      passing_average REAL NOT NULL DEFAULT 10,
      active INTEGER NOT NULL DEFAULT 1,
      display_order INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS bac_coefficients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      series_slug TEXT NOT NULL,
      subject_slug TEXT NOT NULL,
      subject_name_ar TEXT NOT NULL,
      subject_name_fr TEXT NOT NULL,
      coefficient REAL NOT NULL DEFAULT 1,
      max_grade REAL NOT NULL DEFAULT 20,
      is_optional INTEGER NOT NULL DEFAULT 0,
      display_order INTEGER NOT NULL DEFAULT 1,
      UNIQUE(series_slug, subject_slug)
    );

    CREATE TABLE IF NOT EXISTS user_study_goals (
      user_id INTEGER PRIMARY KEY,
      daily_target_minutes INTEGER NOT NULL DEFAULT 45,
      daily_questions_target INTEGER NOT NULL DEFAULT 20,
      exam_goal_score REAL NOT NULL DEFAULT 14,
      streak_days INTEGER NOT NULL DEFAULT 0,
      last_study_date TEXT NOT NULL DEFAULT '',
      completed_pomodoros INTEGER NOT NULL DEFAULT 0,
      total_study_minutes INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS user_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      session_id TEXT NOT NULL,
      device_name TEXT NOT NULL DEFAULT '',
      device_type TEXT NOT NULL DEFAULT 'desktop',
      browser TEXT NOT NULL DEFAULT '',
      os TEXT NOT NULL DEFAULT '',
      approx_location TEXT NOT NULL DEFAULT '',
      user_agent_hash TEXT NOT NULL DEFAULT '',
      is_revoked INTEGER NOT NULL DEFAULT 0,
      revoked_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_active_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, session_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id, is_revoked, last_active_at);

    CREATE TABLE IF NOT EXISTS auth_action_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      email TEXT NOT NULL DEFAULT '',
      purpose TEXT NOT NULL CHECK (purpose IN ('email_verify', 'password_reset')),
      token_hash TEXT NOT NULL UNIQUE,
      expires_at INTEGER NOT NULL,
      used_at INTEGER,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_auth_action_tokens_hash ON auth_action_tokens(token_hash);

    CREATE TABLE IF NOT EXISTS contact_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT NOT NULL DEFAULT '',
      subject TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'general',
      message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'unread' CHECK (status IN ('unread', 'read', 'replied', 'archived')),
      admin_note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS referral_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      enabled INTEGER NOT NULL DEFAULT 1,
      points_per_referral INTEGER NOT NULL DEFAULT 20,
      reward_threshold_points INTEGER NOT NULL DEFAULT 1000,
      reward_duration_days INTEGER NOT NULL DEFAULT 30,
      welcome_bonus_points INTEGER NOT NULL DEFAULT 0,
      max_rewards_per_user INTEGER NOT NULL DEFAULT 12,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS referral_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      referrer_user_id INTEGER NOT NULL,
      referred_user_id INTEGER NOT NULL UNIQUE,
      referral_code TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending_verification' CHECK (status IN ('pending_verification', 'verified_rewarded', 'blocked')),
      points_awarded INTEGER NOT NULL DEFAULT 0,
      reason TEXT NOT NULL DEFAULT '',
      verified_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (referrer_user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (referred_user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_referral_logs_referrer ON referral_logs(referrer_user_id, status);

    CREATE TABLE IF NOT EXISTS referral_rewards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      points_spent INTEGER NOT NULL,
      duration_days INTEGER NOT NULL,
      plan_slug TEXT NOT NULL DEFAULT 'referral-monthly-reward',
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  // Safe migration for pre-existing lessons table without lesson_order
  const lessonCols = db.prepare('PRAGMA table_info(lessons)').all() as Array<{ name: string }>;
  if (!lessonCols.some((c) => c.name === 'lesson_order')) {
    db.exec('ALTER TABLE lessons ADD COLUMN lesson_order INTEGER NOT NULL DEFAULT 1');
    db.exec('UPDATE lessons SET lesson_order = id');
  }

  // Safe migration for pre-existing users table without token_version
  const userCols = db.prepare('PRAGMA table_info(users)').all() as Array<{ name: string }>;
  if (!userCols.some((c) => c.name === 'token_version')) {
    db.exec('ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 1');
  }

  // Safe migration for pre-existing questions table lacking taxonomy/workflow columns
  const qCols = db.prepare('PRAGMA table_info(questions)').all() as Array<{ name: string }>;
  const qColNames = new Set(qCols.map((c) => c.name));
  const qMigrations: Array<[string, string]> = [
    ['axis_ar', "ALTER TABLE questions ADD COLUMN axis_ar TEXT NOT NULL DEFAULT ''"],
    ['axis_fr', "ALTER TABLE questions ADD COLUMN axis_fr TEXT NOT NULL DEFAULT ''"],
    ['lesson_id', 'ALTER TABLE questions ADD COLUMN lesson_id INTEGER'],
    ['question_type', "ALTER TABLE questions ADD COLUMN question_type TEXT NOT NULL DEFAULT 'mcq'"],
    ['answer_ar', "ALTER TABLE questions ADD COLUMN answer_ar TEXT NOT NULL DEFAULT ''"],
    ['answer_speech_ar', "ALTER TABLE questions ADD COLUMN answer_speech_ar TEXT NOT NULL DEFAULT ''"],
    ['answer_fr', "ALTER TABLE questions ADD COLUMN answer_fr TEXT NOT NULL DEFAULT ''"],
    ['exam_ref', "ALTER TABLE questions ADD COLUMN exam_ref TEXT NOT NULL DEFAULT ''"],
    ['target_competition', "ALTER TABLE questions ADD COLUMN target_competition TEXT NOT NULL DEFAULT ''"],
    ['content_status', "ALTER TABLE questions ADD COLUMN content_status TEXT NOT NULL DEFAULT 'published'"],
    ['reviewed_by', 'ALTER TABLE questions ADD COLUMN reviewed_by TEXT'],
    ['reviewed_at', 'ALTER TABLE questions ADD COLUMN reviewed_at TEXT'],
    ['updated_at', "ALTER TABLE questions ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''"],
  ];
  for (const [colName, sql] of qMigrations) {
    if (!qColNames.has(colName)) {
      db.exec(sql);
    }
  }

  // Safe migration for pre-existing pronunciation_dictionary table lacking lang/match_type/active
  const pdCols = db.prepare('PRAGMA table_info(pronunciation_dictionary)').all() as Array<{ name: string }>;
  const pdColNames = new Set(pdCols.map((c) => c.name));
  if (!pdColNames.has('lang')) {
    db.exec("ALTER TABLE pronunciation_dictionary ADD COLUMN lang TEXT NOT NULL DEFAULT 'ar'");
  }
  if (!pdColNames.has('match_type')) {
    db.exec("ALTER TABLE pronunciation_dictionary ADD COLUMN match_type TEXT NOT NULL DEFAULT 'word'");
    db.exec("UPDATE pronunciation_dictionary SET match_type = CASE WHEN is_regex = 1 THEN 'regex' ELSE 'word' END");
  }
  if (!pdColNames.has('active')) {
    db.exec('ALTER TABLE pronunciation_dictionary ADD COLUMN active INTEGER NOT NULL DEFAULT 1');
    db.exec('UPDATE pronunciation_dictionary SET active = COALESCE(enabled, 1)');
  }

  // Safe non-destructive migration for users.preferred_lang ('en') and expanded educational/professional levels
  const userTableSql = (
    db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'").get() as
      | { sql?: string }
      | undefined
  )?.sql;
  if (userTableSql && (!userTableSql.includes("'en'") || !userTableSql.includes("'university_student'") || !userTableSql.includes("'professor'"))) {
    const existingUserCols = (db.prepare('PRAGMA table_info(users)').all() as Array<{ name: string }>).map(
      (c) => c.name
    );
    const colList = existingUserCols.join(', ');
    const migratedUsersSql = userTableSql
      .replace(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["`\[]?users["`\]]?/i, 'CREATE TABLE users_new')
      .replace(
        /CHECK\s*\(\s*preferred_lang\s+IN\s*\([^)]+\)\s*\)/i,
        "CHECK (preferred_lang IN ('ar', 'fr', 'en'))"
      )
      .replace(
        /CHECK\s*\(\s*level\s+IN\s*\([^)]+\)\s*\)/i,
        "CHECK (level IN ('foundation', 'intermediate', 'advanced', 'prep_student', 'highschool_student', 'university_student', 'teacher', 'professor'))"
      );
    db.pragma('foreign_keys = OFF');
    db.exec(`
      DROP TABLE IF EXISTS users_new;
      ${migratedUsersSql};
      INSERT INTO users_new (${colList}) SELECT ${colList} FROM users;
      DROP TABLE users;
      ALTER TABLE users_new RENAME TO users;
    `);
    db.pragma('foreign_keys = ON');
  }

  // Ensure payment_transactions supports nardopay and card alongside visa/mastercard
  const ptTableSql = (
    db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='payment_transactions'").get() as
      | { sql?: string }
      | undefined
  )?.sql;
  if (ptTableSql && !ptTableSql.includes("'nardopay'")) {
    const existingCols = (db.prepare('PRAGMA table_info(payment_transactions)').all() as Array<{ name: string }>).map(
      (c) => c.name
    );
    const colList = existingCols.join(', ');
    const migratedPtSql = ptTableSql
      .replace(
        /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["`\[]?payment_transactions["`\]]?/i,
        'CREATE TABLE payment_transactions_new'
      )
      .replace(
        /CHECK\s*\(\s*card_brand\s+IN\s*\([^)]+\)\s*\)/i,
        "CHECK (card_brand IN ('visa', 'mastercard', 'nardopay', 'card'))"
      );
    db.pragma('foreign_keys = OFF');
    db.exec(`
      DROP TABLE IF EXISTS payment_transactions_new;
      ${migratedPtSql};
      INSERT INTO payment_transactions_new (${colList}) SELECT ${colList} FROM payment_transactions;
      DROP TABLE payment_transactions;
      ALTER TABLE payment_transactions_new RENAME TO payment_transactions;
    `);
    db.pragma('foreign_keys = ON');
  }

  // Safe migration for notifications targeting scopes (current_users vs all_including_future)
  const notifCols = db.prepare('PRAGMA table_info(notifications)').all() as Array<{ name: string }>;
  const notifColNames = new Set(notifCols.map((c) => c.name));
  if (!notifColNames.has('target_scope')) {
    db.exec("ALTER TABLE notifications ADD COLUMN target_scope TEXT NOT NULL DEFAULT 'current_users'");
  }
  if (!notifColNames.has('eligible_before')) {
    db.exec('ALTER TABLE notifications ADD COLUMN eligible_before TEXT');
    db.exec("UPDATE notifications SET eligible_before = created_at WHERE eligible_before IS NULL AND target_scope = 'current_users'");
  }

  // New institutional, verification, NardoPay, storage, OTP, and RBAC tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS email_verification_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      email TEXT NOT NULL,
      purpose TEXT NOT NULL DEFAULT 'email_verify' CHECK (purpose IN ('email_verify', 'password_reset')),
      code_hash TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 5,
      expires_at INTEGER NOT NULL,
      used_at INTEGER,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_email_verification_codes_email ON email_verification_codes(email, purpose, used_at);

    CREATE TABLE IF NOT EXISTS payment_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id TEXT NOT NULL UNIQUE,
      user_id INTEGER NOT NULL,
      plan_id INTEGER NOT NULL,
      provider TEXT NOT NULL DEFAULT 'nardopay',
      amount REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'MRU',
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'cancelled', 'expired')),
      provider_session_id TEXT NOT NULL DEFAULT '',
      provider_tx_id TEXT NOT NULL DEFAULT '',
      checkout_url TEXT NOT NULL DEFAULT '',
      failure_reason TEXT NOT NULL DEFAULT '',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      verified_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (plan_id) REFERENCES subscription_plans(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_payment_orders_user_status ON payment_orders(user_id, status, created_at);

    CREATE TABLE IF NOT EXISTS nardopay_webhook_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id TEXT NOT NULL UNIQUE,
      event_type TEXT NOT NULL,
      order_id TEXT NOT NULL DEFAULT '',
      provider_tx_id TEXT NOT NULL DEFAULT '',
      signature_verified INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'processed',
      payload_json TEXT NOT NULL DEFAULT '{}',
      processed_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_nardopay_events_tx ON nardopay_webhook_events(provider_tx_id, order_id);

    CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY,
      owner_user_id INTEGER NOT NULL,
      storage_provider TEXT NOT NULL DEFAULT 'local' CHECK (storage_provider IN ('local', 's3')),
      storage_key TEXT NOT NULL UNIQUE,
      original_name TEXT NOT NULL DEFAULT '',
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      checksum_sha256 TEXT NOT NULL,
      entity_type TEXT NOT NULL DEFAULT 'other',
      entity_id TEXT NOT NULL DEFAULT '',
      visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'section', 'school', 'public')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_files_owner_entity ON files(owner_user_id, entity_type, created_at);

    CREATE TABLE IF NOT EXISTS admin_permissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      permission TEXT NOT NULL,
      granted_by INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, permission),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_admin_permissions_user ON admin_permissions(user_id);

    CREATE TABLE IF NOT EXISTS schools (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL DEFAULT '',
      city TEXT NOT NULL DEFAULT '',
      wilaya TEXT NOT NULL DEFAULT '',
      owner_user_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'rejected', 'suspended')),
      verified_account INTEGER NOT NULL DEFAULT 0,
      followers_count INTEGER NOT NULL DEFAULT 0,
      approved_by INTEGER,
      approved_at TEXT,
      rejection_reason TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_schools_status_owner ON schools(status, owner_user_id);

    CREATE TABLE IF NOT EXISTS school_departments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      school_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      head_user_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_school_departments_school ON school_departments(school_id);

    CREATE TABLE IF NOT EXISTS school_teachers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      school_id INTEGER NOT NULL,
      department_id INTEGER,
      user_id INTEGER NOT NULL,
      subject_name TEXT NOT NULL DEFAULT '',
      role_title TEXT NOT NULL DEFAULT 'teacher',
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(school_id, user_id),
      FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS school_students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      school_id INTEGER NOT NULL,
      department_id INTEGER,
      user_id INTEGER NOT NULL,
      level TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(school_id, user_id),
      FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS school_curriculum (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      school_id INTEGER NOT NULL,
      department_id INTEGER,
      subject_name TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      file_id TEXT,
      created_by INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS school_announcements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      school_id INTEGER NOT NULL,
      department_id INTEGER,
      author_user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS teacher_sections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      teacher_user_id INTEGER NOT NULL,
      school_id INTEGER,
      school_name TEXT NOT NULL DEFAULT '',
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      subject_name TEXT NOT NULL DEFAULT '',
      visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'public')),
      share_code TEXT NOT NULL UNIQUE,
      allow_student_invites INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (teacher_user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_teacher_sections_teacher_vis ON teacher_sections(teacher_user_id, visibility, status);

    CREATE TABLE IF NOT EXISTS section_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      section_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'pending_approval', 'active', 'rejected', 'left', 'removed')),
      invited_by_user_id INTEGER,
      joined_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(section_id, user_id),
      FOREIGN KEY (section_id) REFERENCES teacher_sections(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_section_members_user_status ON section_members(user_id, status);

    CREATE TABLE IF NOT EXISTS section_assistants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      section_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      permissions_json TEXT NOT NULL DEFAULT '["manage_content","evaluate_students"]',
      added_by_user_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(section_id, user_id),
      FOREIGN KEY (section_id) REFERENCES teacher_sections(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS section_content (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      section_id INTEGER NOT NULL,
      author_user_id INTEGER NOT NULL,
      content_type TEXT NOT NULL CHECK (content_type IN ('lesson', 'explanation', 'pdf', 'image', 'audio')),
      title TEXT NOT NULL,
      body TEXT NOT NULL DEFAULT '',
      file_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (section_id) REFERENCES teacher_sections(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_section_content_section ON section_content(section_id, created_at);

    CREATE TABLE IF NOT EXISTS section_tests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      section_id INTEGER NOT NULL,
      author_user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      duration_minutes INTEGER NOT NULL DEFAULT 30,
      max_score REAL NOT NULL DEFAULT 20,
      published INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (section_id) REFERENCES teacher_sections(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS section_test_questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      test_id INTEGER NOT NULL,
      stem TEXT NOT NULL,
      options_json TEXT NOT NULL,
      correct_index INTEGER NOT NULL CHECK (correct_index >= 0 AND correct_index <= 3),
      points REAL NOT NULL DEFAULT 1,
      FOREIGN KEY (test_id) REFERENCES section_tests(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS section_test_submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      test_id INTEGER NOT NULL,
      student_user_id INTEGER NOT NULL,
      answers_json TEXT NOT NULL DEFAULT '{}',
      score REAL NOT NULL DEFAULT 0,
      max_score REAL NOT NULL DEFAULT 20,
      submitted_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(test_id, student_user_id),
      FOREIGN KEY (test_id) REFERENCES section_tests(id) ON DELETE CASCADE,
      FOREIGN KEY (student_user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS section_evaluations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      section_id INTEGER NOT NULL,
      student_user_id INTEGER NOT NULL,
      teacher_user_id INTEGER NOT NULL,
      score REAL,
      max_score REAL NOT NULL DEFAULT 20,
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (section_id) REFERENCES teacher_sections(id) ON DELETE CASCADE,
      FOREIGN KEY (student_user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_section_eval_student ON section_evaluations(student_user_id, created_at);

    CREATE TABLE IF NOT EXISTS section_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      section_id INTEGER NOT NULL,
      sender_user_id INTEGER NOT NULL,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (section_id) REFERENCES teacher_sections(id) ON DELETE CASCADE,
      FOREIGN KEY (sender_user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS follows (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      follower_user_id INTEGER NOT NULL,
      target_type TEXT NOT NULL CHECK (target_type IN ('user', 'school')),
      target_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(follower_user_id, target_type, target_id),
      FOREIGN KEY (follower_user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_follows_target ON follows(target_type, target_id);
    CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows(follower_user_id, target_type);

    CREATE TABLE IF NOT EXISTS verification_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      target_type TEXT NOT NULL DEFAULT 'user' CHECK (target_type IN ('user', 'school')),
      target_id INTEGER NOT NULL,
      requested_label TEXT NOT NULL DEFAULT '',
      supporting_note TEXT NOT NULL DEFAULT '',
      document_file_id TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'revoked')),
      reviewed_by INTEGER,
      reviewed_note TEXT NOT NULL DEFAULT '',
      reviewed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_verification_requests_status ON verification_requests(status, created_at);

    -- Additional Scalability Indexes for 15,000+ lessons/questions & high notification/audit traffic
    CREATE INDEX IF NOT EXISTS idx_lessons_filter ON lessons(subject_slug, track, level, lesson_order);
    CREATE INDEX IF NOT EXISTS idx_notifications_scope_date ON notifications(user_id, target_scope, created_at);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at, action);
    CREATE INDEX IF NOT EXISTS idx_exam_attempts_user_status ON exam_attempts(user_id, status, started_at);
  `);

  // Safe migration for users profile audit, specialty, verification & referral fields
  const refreshedUserCols = db.prepare('PRAGMA table_info(users)').all() as Array<{ name: string }>;
  const userColNames = new Set(refreshedUserCols.map((c) => c.name));
  const userExtraMigrations: Array<[string, string]> = [
    ['phone', "ALTER TABLE users ADD COLUMN phone TEXT NOT NULL DEFAULT ''"],
    ['referral_code', 'ALTER TABLE users ADD COLUMN referral_code TEXT'],
    ['referred_by_user_id', 'ALTER TABLE users ADD COLUMN referred_by_user_id INTEGER'],
    ['referral_points', 'ALTER TABLE users ADD COLUMN referral_points INTEGER NOT NULL DEFAULT 0'],
    ['last_profile_updated_at', 'ALTER TABLE users ADD COLUMN last_profile_updated_at TEXT'],
    ['last_password_updated_at', 'ALTER TABLE users ADD COLUMN last_password_updated_at TEXT'],
    ['last_active_at', 'ALTER TABLE users ADD COLUMN last_active_at TEXT'],
    ['last_login_at', 'ALTER TABLE users ADD COLUMN last_login_at TEXT'],
    ['geo_permission_status', "ALTER TABLE users ADD COLUMN geo_permission_status TEXT NOT NULL DEFAULT 'prompt'"],
    ['last_geo_lat', 'ALTER TABLE users ADD COLUMN last_geo_lat REAL'],
    ['last_geo_lng', 'ALTER TABLE users ADD COLUMN last_geo_lng REAL'],
    ['last_geo_label', "ALTER TABLE users ADD COLUMN last_geo_label TEXT NOT NULL DEFAULT ''"],
    ['last_geo_updated_at', 'ALTER TABLE users ADD COLUMN last_geo_updated_at TEXT'],
    ['notification_permission_status', "ALTER TABLE users ADD COLUMN notification_permission_status TEXT NOT NULL DEFAULT 'default'"],
    ['notification_sound_enabled', 'ALTER TABLE users ADD COLUMN notification_sound_enabled INTEGER NOT NULL DEFAULT 1'],
    ['email_verified', 'ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0'],
    ['teacher_category', "ALTER TABLE users ADD COLUMN teacher_category TEXT NOT NULL DEFAULT ''"],
    ['professor_specialty', "ALTER TABLE users ADD COLUMN professor_specialty TEXT NOT NULL DEFAULT ''"],
    ['verified_account', 'ALTER TABLE users ADD COLUMN verified_account INTEGER NOT NULL DEFAULT 0'],
    ['verified_badge_label', "ALTER TABLE users ADD COLUMN verified_badge_label TEXT NOT NULL DEFAULT ''"],
    ['verified_at', 'ALTER TABLE users ADD COLUMN verified_at TEXT'],
    ['followers_count', 'ALTER TABLE users ADD COLUMN followers_count INTEGER NOT NULL DEFAULT 0'],
    ['following_count', 'ALTER TABLE users ADD COLUMN following_count INTEGER NOT NULL DEFAULT 0'],
  ];
  for (const [colName, sql] of userExtraMigrations) {
    if (!userColNames.has(colName)) {
      db.exec(sql);
    }
  }
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_referral_code ON users(referral_code) WHERE referral_code IS NOT NULL AND trim(referral_code) != ''`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_users_role_level_created ON users(role, level, created_at)`);

  // Backfill unique unambiguous TD-XXXXXXXX referral codes for users lacking one
  const REF_ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const genRef = () => {
    const b = crypto.randomBytes(8);
    let out = 'TD-';
    for (let i = 0; i < 8; i++) out += REF_ALPHA[b[i] % REF_ALPHA.length];
    return out;
  };
  const usersWithoutRef = db.prepare("SELECT id FROM users WHERE referral_code IS NULL OR trim(referral_code) = ''").all() as Array<{ id: number }>;
  const updUserRef = db.prepare('UPDATE users SET referral_code = ? WHERE id = ?');
  for (const u of usersWithoutRef) {
    for (let attempt = 0; attempt < 8; attempt++) {
      try {
        updUserRef.run(genRef(), u.id);
        break;
      } catch {
        // retry on collision
      }
    }
  }

  // Seed default referral_settings (50 verified referrals * 20 pts = 1000 pts = 30 days subscription)
  db.prepare(`
    INSERT OR IGNORE INTO referral_settings (
      id, enabled, points_per_referral, reward_threshold_points, reward_duration_days, welcome_bonus_points, max_rewards_per_user
    ) VALUES (1, 1, 20, 1000, 30, 0, 12)
  `).run();

  // Safe migration for exam_attempts camera photo & subject breakdown
  const eaCols = db.prepare('PRAGMA table_info(exam_attempts)').all() as Array<{ name: string }>;
  const eaColNames = new Set(eaCols.map((c) => c.name));
  if (!eaColNames.has('camera_photo_data_url')) {
    db.exec("ALTER TABLE exam_attempts ADD COLUMN camera_photo_data_url TEXT NOT NULL DEFAULT ''");
  }
  if (!eaColNames.has('subject_breakdown_json')) {
    db.exec("ALTER TABLE exam_attempts ADD COLUMN subject_breakdown_json TEXT NOT NULL DEFAULT '[]'");
  }

  // Ensure subscription_requests supports partial_pending, needs_info & manual_review statuses on pre-existing DBs
  const srTableSql = (
    db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='subscription_requests'").get() as
      | { sql?: string }
      | undefined
  )?.sql;
  if (
    srTableSql &&
    (!srTableSql.includes("'partial_pending'") ||
      !srTableSql.includes("'needs_info'") ||
      !srTableSql.includes("'manual_review'"))
  ) {
    const existingCols = (db.prepare('PRAGMA table_info(subscription_requests)').all() as Array<{ name: string }>).map(
      (c) => c.name
    );
    const colList = existingCols.join(', ');
    const migratedTableSql = srTableSql
      .replace(
        /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["`\[]?subscription_requests["`\]]?/i,
        'CREATE TABLE subscription_requests_new'
      )
      .replace(
        /CHECK\s*\(\s*status\s+IN\s*\([^)]+\)\s*\)/i,
        "CHECK (status IN ('pending_review', 'manual_review', 'partial_pending', 'needs_info', 'approved', 'rejected', 'expired'))"
      );
    db.pragma('foreign_keys = OFF');
    db.exec(`
      DROP TABLE IF EXISTS subscription_requests_new;
      ${migratedTableSql};
      INSERT INTO subscription_requests_new (${colList}) SELECT ${colList} FROM subscription_requests;
      DROP TABLE subscription_requests;
      ALTER TABLE subscription_requests_new RENAME TO subscription_requests;
    `);
    db.pragma('foreign_keys = ON');
  }

  // Ensure receipt_inspections supports underpaid & manual_review verdicts
  const riTableSql = (
    db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='receipt_inspections'").get() as
      | { sql?: string }
      | undefined
  )?.sql;
  if (riTableSql && (!riTableSql.includes("'manual_review'") || !riTableSql.includes("'underpaid'"))) {
    const existingCols = (db.prepare('PRAGMA table_info(receipt_inspections)').all() as Array<{ name: string }>).map(
      (c) => c.name
    );
    const colList = existingCols.join(', ');
    const migratedRiSql = riTableSql
      .replace(
        /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["`\[]?receipt_inspections["`\]]?/i,
        'CREATE TABLE receipt_inspections_new'
      )
      .replace(
        /CHECK\s*\(\s*verdict\s+IN\s*\([^)]+\)\s*\)/i,
        "CHECK (verdict IN ('verified', 'underpaid', 'manual_review', 'rejected'))"
      );
    db.pragma('foreign_keys = OFF');
    db.exec(`
      DROP TABLE IF EXISTS receipt_inspections_new;
      ${migratedRiSql};
      INSERT INTO receipt_inspections_new (${colList}) SELECT ${colList} FROM receipt_inspections;
      DROP TABLE receipt_inspections;
      ALTER TABLE receipt_inspections_new RENAME TO receipt_inspections;
    `);
    db.pragma('foreign_keys = ON');
  }

  // Safe migration for subscription_requests local verification + partial top-up + clarification fields
  const srCols = db.prepare('PRAGMA table_info(subscription_requests)').all() as Array<{ name: string }>;
  const srColNames = new Set(srCols.map((c) => c.name));
  const srMigrations: Array<[string, string]> = [
    ['sender_phone', "ALTER TABLE subscription_requests ADD COLUMN sender_phone TEXT NOT NULL DEFAULT ''"],
    ['extracted_amount', 'ALTER TABLE subscription_requests ADD COLUMN extracted_amount REAL'],
    ['extracted_currency', "ALTER TABLE subscription_requests ADD COLUMN extracted_currency TEXT NOT NULL DEFAULT ''"],
    ['extraction_confidence', 'ALTER TABLE subscription_requests ADD COLUMN extraction_confidence REAL NOT NULL DEFAULT 0'],
    ['risk_level', "ALTER TABLE subscription_requests ADD COLUMN risk_level TEXT NOT NULL DEFAULT 'normal'"],
    ['forensics_json', "ALTER TABLE subscription_requests ADD COLUMN forensics_json TEXT NOT NULL DEFAULT '{}'"],
    ['inspection_status', "ALTER TABLE subscription_requests ADD COLUMN inspection_status TEXT NOT NULL DEFAULT 'verified'"],
    ['perceptual_hash', "ALTER TABLE subscription_requests ADD COLUMN perceptual_hash TEXT NOT NULL DEFAULT ''"],
    ['paid_amount', 'ALTER TABLE subscription_requests ADD COLUMN paid_amount REAL NOT NULL DEFAULT 0'],
    ['remaining_amount', 'ALTER TABLE subscription_requests ADD COLUMN remaining_amount REAL NOT NULL DEFAULT 0'],
    ['second_payment_method', "ALTER TABLE subscription_requests ADD COLUMN second_payment_method TEXT NOT NULL DEFAULT ''"],
    ['second_transaction_id', "ALTER TABLE subscription_requests ADD COLUMN second_transaction_id TEXT NOT NULL DEFAULT ''"],
    ['second_transaction_reference', "ALTER TABLE subscription_requests ADD COLUMN second_transaction_reference TEXT NOT NULL DEFAULT ''"],
    ['second_transaction_at', "ALTER TABLE subscription_requests ADD COLUMN second_transaction_at TEXT NOT NULL DEFAULT ''"],
    ['second_proof_data_url', "ALTER TABLE subscription_requests ADD COLUMN second_proof_data_url TEXT NOT NULL DEFAULT ''"],
    ['second_proof_hash', "ALTER TABLE subscription_requests ADD COLUMN second_proof_hash TEXT NOT NULL DEFAULT ''"],
    ['second_sender_phone', "ALTER TABLE subscription_requests ADD COLUMN second_sender_phone TEXT NOT NULL DEFAULT ''"],
    ['second_extracted_amount', 'ALTER TABLE subscription_requests ADD COLUMN second_extracted_amount REAL'],
    ['second_uploaded_at', "ALTER TABLE subscription_requests ADD COLUMN second_uploaded_at TEXT NOT NULL DEFAULT ''"],
    ['admin_clarification_note', "ALTER TABLE subscription_requests ADD COLUMN admin_clarification_note TEXT NOT NULL DEFAULT ''"],
    ['clarification_requested_at', "ALTER TABLE subscription_requests ADD COLUMN clarification_requested_at TEXT NOT NULL DEFAULT ''"],
  ];
  for (const [colName, sql] of srMigrations) {
    if (!srColNames.has(colName)) {
      db.exec(sql);
    }
  }

  db.exec(`
    UPDATE subscription_requests
    SET paid_amount = COALESCE(extracted_amount, amount),
        remaining_amount = 0
    WHERE status = 'approved' AND (paid_amount IS NULL OR paid_amount = 0);

    UPDATE subscription_requests
    SET paid_amount = COALESCE(extracted_amount, amount)
    WHERE status = 'pending_review' AND (paid_amount IS NULL OR paid_amount = 0);
  `);

  // Enforce STRICT anti-reuse across ALL statuses (accepted, pending, AND rejected) for first & second proofs
  db.exec(`
    DROP INDEX IF EXISTS idx_subreq_unique_proof_hash;
    DROP INDEX IF EXISTS idx_subreq_unique_tx_id;
    DROP INDEX IF EXISTS idx_subreq_unique_tx_ref;
    DROP INDEX IF EXISTS idx_subreq_unique_second_proof_hash;
    DROP INDEX IF EXISTS idx_subreq_unique_second_tx_id;
    DROP INDEX IF EXISTS idx_subreq_unique_second_tx_ref;
    CREATE INDEX IF NOT EXISTS idx_questions_filter
      ON questions(content_status, verified, track, subject_slug, level, difficulty, question_type);
    CREATE INDEX IF NOT EXISTS idx_questions_axis
      ON questions(axis_ar, lesson_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_subreq_unique_proof_hash
      ON subscription_requests(proof_hash)
      WHERE trim(proof_hash) != '';
    CREATE UNIQUE INDEX IF NOT EXISTS idx_subreq_unique_tx_id
      ON subscription_requests(payment_method, lower(trim(transaction_id)))
      WHERE trim(transaction_id) != '';
    CREATE UNIQUE INDEX IF NOT EXISTS idx_subreq_unique_tx_ref
      ON subscription_requests(payment_method, lower(trim(transaction_reference)))
      WHERE trim(transaction_reference) != '';
    CREATE UNIQUE INDEX IF NOT EXISTS idx_subreq_unique_second_proof_hash
      ON subscription_requests(second_proof_hash)
      WHERE trim(second_proof_hash) != '';
    CREATE UNIQUE INDEX IF NOT EXISTS idx_subreq_unique_second_tx_id
      ON subscription_requests(second_payment_method, lower(trim(second_transaction_id)))
      WHERE trim(second_transaction_id) != '';
    CREATE UNIQUE INDEX IF NOT EXISTS idx_subreq_unique_second_tx_ref
      ON subscription_requests(second_payment_method, lower(trim(second_transaction_reference)))
      WHERE trim(second_transaction_reference) != '';
    CREATE INDEX IF NOT EXISTS idx_subreq_user_status
      ON subscription_requests(user_id, status, created_at);
    CREATE INDEX IF NOT EXISTS idx_security_events_created
      ON security_events(risk_level, created_at);
    CREATE INDEX IF NOT EXISTS idx_analytics_events_type_created
      ON analytics_events(event_type, created_at);
    CREATE INDEX IF NOT EXISTS idx_issue_reports_user_status
      ON issue_reports(user_id, status, created_at);
  `);

  // Ensure subscription_plans allows 'annual' billing_cycle on pre-existing DBs
  const planTableSql = (
    db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='subscription_plans'").get() as
      | { sql?: string }
      | undefined
  )?.sql;
  if (planTableSql && !planTableSql.includes("'annual'")) {
    db.pragma('foreign_keys = OFF');
    db.exec(`
      CREATE TABLE subscription_plans_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        slug TEXT NOT NULL UNIQUE,
        name_ar TEXT NOT NULL,
        name_fr TEXT NOT NULL,
        description_ar TEXT NOT NULL,
        description_fr TEXT NOT NULL,
        price_mru REAL NOT NULL,
        price_eur REAL NOT NULL,
        currency TEXT NOT NULL DEFAULT 'MRU',
        duration_days INTEGER NOT NULL,
        billing_cycle TEXT NOT NULL CHECK (billing_cycle IN ('free', 'monthly', 'quarterly', 'season', 'annual')),
        features_ar_json TEXT NOT NULL DEFAULT '[]',
        features_fr_json TEXT NOT NULL DEFAULT '[]',
        is_popular INTEGER NOT NULL DEFAULT 0,
        active INTEGER NOT NULL DEFAULT 1,
        display_order INTEGER NOT NULL DEFAULT 1
      );
      INSERT INTO subscription_plans_new SELECT * FROM subscription_plans;
      DROP TABLE subscription_plans;
      ALTER TABLE subscription_plans_new RENAME TO subscription_plans;
    `);
    db.pragma('foreign_keys = ON');
  }

  // Seed default grading, ElevenLabs TTS & site configuration settings
  const upsertSetting = db.prepare('INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)');
  upsertSetting.run('receipt_max_age_hours', '168');
  upsertSetting.run(
    'elevenlabs_config',
    JSON.stringify({
      enabled: false,
      freeTierAllowed: false,
      voiceIdAr: 'pNInz6obpgDQGcFmaJgB',
      voiceIdFr: '21m00Tcm4TlvDq8ikWAM',
      modelId: 'eleven_multilingual_v2',
    })
  );
  upsertSetting.run(
    'grading_policy',
    JSON.stringify({ maxScore: 20, wrongPenalty: 0, passingScore: 10 })
  );
  upsertSetting.run(
    'site_config',
    JSON.stringify({
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
          title_ar: 'ملخصات مركزة وخطة مراجعة واضحة حتى يوم المسابقة',
          title_fr: 'Fiches condensées et plan de révision structuré jusqu’au concours',
          desc_ar:
            'نظم مراجعتك درسا بعد درس، وتابع تقدمك في بنك الأسئلة والاستماع الصوتي من لوحة الطالب.',
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
            'امتحانات موقتة مع تصحيح فوري وفق المقياس الرسمي على 20 وتحليل لنقاط القوة والضعف.',
          desc_fr:
            'Épreuves chronométrées avec correction immédiate sur 20 et diagnostic détaillé des acquis.',
          cta1_ar: 'ابدأ امتحانا',
          cta1_fr: 'Démarrer un examen',
          cta1_view: 'exams',
          cta1_exam_mode: 'mock',
          cta2_ar: 'لوحة الطالب',
          cta2_fr: 'Tableau étudiant',
          cta2_view: 'dashboard',
        },
      ],
    })
  );

  // Seed tracks if empty
  const trackCount = (db.prepare('SELECT COUNT(*) as c FROM tracks').get() as { c: number }).c;
  if (trackCount === 0) {
    const insertTrack = db.prepare(
      'INSERT INTO tracks (slug, name_ar, name_fr, description_ar, description_fr, active) VALUES (?, ?, ?, ?, ?, ?)'
    );
    for (const t of SEED_TRACKS) {
      insertTrack.run(t.slug, t.name_ar, t.name_fr, t.description_ar, t.description_fr, t.active);
    }
  }

  // Seed subjects if empty
  const subjectCount = (db.prepare('SELECT COUNT(*) as c FROM subjects').get() as { c: number }).c;
  if (subjectCount === 0) {
    const insertSubject = db.prepare(
      'INSERT INTO subjects (slug, name_ar, name_fr, tracks_json, official_program_ref, icon_name, display_order) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    for (const s of SEED_SUBJECTS) {
      insertSubject.run(
        s.slug,
        s.name_ar,
        s.name_fr,
        JSON.stringify(s.tracks),
        s.official_program_ref,
        s.icon_name,
        s.display_order
      );
    }
  }

  // Seed lessons if empty (visible UI fields stripped of Arabic diacritics; *_speech_ar preserves pronunciation)
  const lessonCount = (db.prepare('SELECT COUNT(*) as c FROM lessons').get() as { c: number }).c;
  if (lessonCount === 0) {
    const insertLesson = db.prepare(`
      INSERT INTO lessons (
        subject_slug, track, level, title_ar, title_fr, summary_ar, summary_fr,
        explanation_ar, explanation_speech_ar, explanation_fr,
        examples_json, exercises_json, mcq_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const l of SEED_LESSONS) {
      const cleanExamples = l.examples.map((ex: any) => ({
        ...ex,
        title_ar: stripArabicDiacritics(ex.title_ar),
        content_ar: stripArabicDiacritics(ex.content_ar),
      }));
      const cleanExercises = l.exercises.map((ex: any) => ({
        ...ex,
        prompt_ar: stripArabicDiacritics(ex.prompt_ar),
        solution_ar: stripArabicDiacritics(ex.solution_ar),
      }));
      const cleanMcq = l.mcq.map((m: any) => ({
        ...m,
        stem_ar: stripArabicDiacritics(m.stem_ar),
        options_ar: Array.isArray(m.options_ar) ? m.options_ar.map((o: string) => stripArabicDiacritics(o)) : m.options_ar,
        explanation_ar: stripArabicDiacritics(m.explanation_ar),
      }));
      insertLesson.run(
        l.subject_slug,
        l.track,
        l.level,
        stripArabicDiacritics(l.title_ar),
        l.title_fr,
        stripArabicDiacritics(l.summary_ar),
        l.summary_fr,
        stripArabicDiacritics(l.explanation_ar),
        l.explanation_speech_ar,
        l.explanation_fr,
        JSON.stringify(cleanExamples),
        JSON.stringify(cleanExercises),
        JSON.stringify(cleanMcq)
      );
    }
  }

  // Seed summaries if empty
  const summaryCount = (db.prepare('SELECT COUNT(*) as c FROM summaries').get() as { c: number }).c;
  if (summaryCount === 0) {
    const insertSummary = db.prepare(`
      INSERT INTO summaries (
        subject_slug, track, level, title_ar, title_fr, content_ar, content_speech_ar, content_fr, key_points_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const sm of SEED_SUMMARIES) {
      const cleanKeyPoints = sm.key_points.map((kp: any) => ({
        ...kp,
        ar: stripArabicDiacritics(kp.ar),
      }));
      insertSummary.run(
        sm.subject_slug,
        sm.track,
        sm.level,
        stripArabicDiacritics(sm.title_ar),
        sm.title_fr,
        stripArabicDiacritics(sm.content_ar),
        sm.content_speech_ar,
        sm.content_fr,
        JSON.stringify(cleanKeyPoints)
      );
    }
  }

  // Idempotent Question Bank Seeding (>3,700 genuine unique questions across all 3 tracks)
  const existingQuestionCount = (db.prepare('SELECT COUNT(*) as c FROM questions').get() as { c: number }).c;
  const extendedQuestions = getAllExtendedQuestions();
  if (existingQuestionCount < extendedQuestions.length) {
    const insertQ = db.prepare(`
      INSERT OR IGNORE INTO questions (
        subject_slug, track, level, axis_ar, axis_fr, lesson_id,
        topic_ar, topic_fr, skill_ar, skill_fr, question_type, difficulty,
        stem_ar, stem_speech_ar, stem_fr,
        options_ar_json, options_speech_ar_json, options_fr_json,
        correct_index, answer_ar, answer_speech_ar, answer_fr,
        explanation_ar, explanation_speech_ar, explanation_fr,
        exam_ref, target_competition, content_status, fingerprint_hash, verified
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `);
    const insertMany = db.transaction((items: typeof extendedQuestions) => {
      for (const q of items) {
        const fp = normalizeQuestionFingerprint(q.stem_ar, q.stem_fr);
        insertQ.run(
          q.subject_slug,
          q.track,
          q.level,
          stripArabicDiacritics(q.axis_ar || q.topic_ar),
          q.axis_fr || q.topic_fr,
          q.lesson_id ?? null,
          stripArabicDiacritics(q.topic_ar),
          q.topic_fr,
          stripArabicDiacritics(q.skill_ar),
          q.skill_fr,
          q.question_type || 'mcq',
          q.difficulty,
          stripArabicDiacritics(q.stem_ar),
          q.stem_speech_ar || q.stem_ar,
          q.stem_fr,
          JSON.stringify(q.options_ar.map((o) => stripArabicDiacritics(o))),
          JSON.stringify(q.options_speech_ar || q.options_ar),
          JSON.stringify(q.options_fr),
          q.correct_index,
          stripArabicDiacritics(q.answer_ar || q.options_ar[q.correct_index] || ''),
          q.answer_speech_ar || q.answer_ar || q.options_ar[q.correct_index] || '',
          q.answer_fr || q.options_fr[q.correct_index] || '',
          stripArabicDiacritics(q.explanation_ar),
          q.explanation_speech_ar || q.explanation_ar,
          q.explanation_fr,
          q.exam_ref || 'بنك المسابقة المحقق',
          q.target_competition || 'مسابقة اكتتاب المعلمين - موريتانيا',
          q.content_status || 'published',
          fp
        );
      }
    });
    insertMany(extendedQuestions);
  }

  // Ensure existing visible question fields carry no stray diacritics
  const sampleDiacriticRow = db
    .prepare("SELECT id FROM questions WHERE stem_ar LIKE '%َ%' OR stem_ar LIKE '%ِ%' OR stem_ar LIKE '%ُ%' LIMIT 1")
    .get();
  if (sampleDiacriticRow) {
    const allRows = db
      .prepare('SELECT id, topic_ar, skill_ar, axis_ar, stem_ar, options_ar_json, answer_ar, explanation_ar FROM questions')
      .all() as any[];
    const updQ = db.prepare(
      'UPDATE questions SET topic_ar = ?, skill_ar = ?, axis_ar = ?, stem_ar = ?, options_ar_json = ?, answer_ar = ?, explanation_ar = ? WHERE id = ?'
    );
    const cleanTx = db.transaction(() => {
      for (const r of allRows) {
        let opts: string[] = [];
        try {
          opts = JSON.parse(r.options_ar_json || '[]');
        } catch {
          opts = [];
        }
        updQ.run(
          stripArabicDiacritics(r.topic_ar || ''),
          stripArabicDiacritics(r.skill_ar || ''),
          stripArabicDiacritics(r.axis_ar || r.topic_ar || ''),
          stripArabicDiacritics(r.stem_ar || ''),
          JSON.stringify(opts.map((o) => stripArabicDiacritics(String(o)))),
          stripArabicDiacritics(r.answer_ar || opts[0] || ''),
          stripArabicDiacritics(r.explanation_ar || ''),
          r.id
        );
      }
    });
    cleanTx();
  }

  // Seed exam configs if empty
  const cfgCount = (db.prepare('SELECT COUNT(*) as c FROM exam_configs').get() as { c: number }).c;
  if (cfgCount === 0) {
    const insertCfg = db.prepare(`
      INSERT INTO exam_configs (
        title_ar, title_fr, mode, track, subject_slug, level,
        question_count, duration_minutes, max_score, require_camera_check, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const c of SEED_EXAM_CONFIGS) {
      insertCfg.run(
        stripArabicDiacritics(c.title_ar),
        c.title_fr,
        c.mode,
        c.track,
        c.subject_slug,
        c.level,
        c.question_count,
        c.duration_minutes,
        c.max_score,
        c.require_camera_check,
        c.is_active
      );
    }
  }

  // Seed notifications if empty
  const notifCount = (db.prepare('SELECT COUNT(*) as c FROM notifications').get() as { c: number }).c;
  if (notifCount === 0) {
    const insertNotif = db.prepare(
      'INSERT INTO notifications (user_id, title_ar, title_fr, body_ar, body_fr, type) VALUES (NULL, ?, ?, ?, ?, ?)'
    );
    for (const n of SEED_NOTIFICATIONS) {
      insertNotif.run(n.title_ar, n.title_fr, n.body_ar, n.body_fr, n.type);
    }
  }

  // Seed / Migrate authoritative Subscription Plans (Free = 0, Monthly = 400 MRU / 30d, Annual = 1000 MRU / 365d)
  const monthlyFeaturesAr = JSON.stringify([
    'فتح جميع الدروس والمقررات في 12 مادة رسمية',
    'بنك الأسئلة الكامل (أكثر من 1000 سؤال محقق لكل شعبة)',
    'قراءة صوتية ذكية بثلاثة أصوات متميزة بالعربية والفرنسية',
    'امتحانات تجريبية ومحاكاة رسمية غير محدودة (70 سؤالاً / 20 نقطة)',
    'تحليل نقاط القوة والضعف في لوحة الطالب',
  ]);
  const monthlyFeaturesFr = JSON.stringify([
    'Accès illimité aux 12 matières officielles',
    'Banque complète (+1000 questions vérifiées par filière)',
    'Synthèse vocale à 3 voix distinctes (AR / FR)',
    'Examens blancs et simulations officielles illimités (/20)',
    'Analyse détaillée des points forts et faibles',
  ]);
  const annualFeaturesAr = JSON.stringify([
    'صلاحية كاملة لمدة 12 شهراً (365 يوماً) من تاريخ التفعيل',
    'تغطية المسارات الثلاثة: عربي · فرنسي · مزدوج',
    'المحاكاة الرسمية الكاملة (70 سؤالاً / 20 نقطة) بلا قيود',
    'مركز المراجعة الصوتي قبل الاختبار مع التفسيرات والتصحيح',
    'وفر 3800 أوقية (نحو 79%) مقارنة بالاشتراك الشهري طوال العام',
  ]);
  const annualFeaturesFr = JSON.stringify([
    'Accès complet pendant 12 mois (365 jours) dès validation',
    'Couverture des 3 filières : Arabe · Français · Bilingue',
    'Simulations officielles complètes (70 Q / note sur 20)',
    'Centre de révision audio pré-examen avec corrigés détaillés',
    'Économisez 3 800 MRU (~79 %) par rapport au tarif mensuel annuel',
  ]);

  db.prepare(
    `INSERT INTO subscription_plans (
      slug, name_ar, name_fr, description_ar, description_fr,
      price_mru, price_eur, currency, duration_days, billing_cycle,
      features_ar_json, features_fr_json, is_popular, active, display_order
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'MRU', ?, ?, ?, ?, ?, 1, ?)
    ON CONFLICT(slug) DO UPDATE SET
      name_ar = excluded.name_ar,
      name_fr = excluded.name_fr,
      description_ar = excluded.description_ar,
      description_fr = excluded.description_fr,
      price_mru = excluded.price_mru,
      price_eur = excluded.price_eur,
      duration_days = excluded.duration_days,
      billing_cycle = excluded.billing_cycle,
      features_ar_json = excluded.features_ar_json,
      features_fr_json = excluded.features_fr_json,
      is_popular = excluded.is_popular,
      active = 1,
      display_order = excluded.display_order`
  ).run(
    'free-starter',
    'الباقة المجانية الأساسية',
    'Formule Gratuite',
    'انطلاقة أساسية للاطلاع على الدروس التأسيسية وعينة من بنك الأسئلة وفق الحصص اليومية المجانية.',
    'Accès de découverte aux leçons de base et à un quota quotidien de la banque de questions.',
    0,
    0,
    365,
    'free',
    JSON.stringify([
      'الوصول للدروس التأسيسية المفتوحة ضمن الحد اليومي',
      'استعراض عينة من بنك الأسئلة ومركز المراجعة',
      'اختبار تجريبي يومي محدود',
      'دعم القراءة الصوتية بالعربية والفرنسية',
    ]),
    JSON.stringify([
      'Accès aux leçons de base selon le quota quotidien',
      'Aperçu de la banque de questions et révision',
      'Examen blanc quotidien limité',
      'Lecture audio bilingue AR / FR',
    ]),
    0,
    1
  );

  db.prepare(
    `INSERT INTO subscription_plans (
      slug, name_ar, name_fr, description_ar, description_fr,
      price_mru, price_eur, currency, duration_days, billing_cycle,
      features_ar_json, features_fr_json, is_popular, active, display_order
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'MRU', ?, ?, ?, ?, ?, 1, ?)
    ON CONFLICT(slug) DO UPDATE SET
      name_ar = excluded.name_ar,
      name_fr = excluded.name_fr,
      description_ar = excluded.description_ar,
      description_fr = excluded.description_fr,
      price_mru = excluded.price_mru,
      price_eur = excluded.price_eur,
      duration_days = excluded.duration_days,
      billing_cycle = excluded.billing_cycle,
      features_ar_json = excluded.features_ar_json,
      features_fr_json = excluded.features_fr_json,
      is_popular = excluded.is_popular,
      active = 1,
      display_order = excluded.display_order`
  ).run(
    'monthly-intensive',
    'الاشتراك الشهري',
    'Abonnement Mensuel',
    'تحضير متكامل لمدة 30 يوماً يشمل كافة الدروس وبنك الأسئلة الكامل والامتحانات التجريبية والتصحيح الآلي.',
    'Préparation complète pendant 30 jours avec tous les cours, la banque complète et les examens blancs sur 20.',
    400,
    10,
    30,
    'monthly',
    monthlyFeaturesAr,
    monthlyFeaturesFr,
    0,
    2
  );

  // Deactivate legacy season-concours if present, and ensure annual-concours is active at 1000 MRU / 365 days
  db.prepare("UPDATE subscription_plans SET active = 0 WHERE slug = 'season-concours'").run();
  db.prepare(
    `INSERT INTO subscription_plans (
      slug, name_ar, name_fr, description_ar, description_fr,
      price_mru, price_eur, currency, duration_days, billing_cycle,
      features_ar_json, features_fr_json, is_popular, active, display_order
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'MRU', ?, ?, ?, ?, ?, 1, ?)
    ON CONFLICT(slug) DO UPDATE SET
      name_ar = excluded.name_ar,
      name_fr = excluded.name_fr,
      description_ar = excluded.description_ar,
      description_fr = excluded.description_fr,
      price_mru = excluded.price_mru,
      price_eur = excluded.price_eur,
      duration_days = excluded.duration_days,
      billing_cycle = excluded.billing_cycle,
      features_ar_json = excluded.features_ar_json,
      features_fr_json = excluded.features_fr_json,
      is_popular = excluded.is_popular,
      active = 1,
      display_order = excluded.display_order`
  ).run(
    'annual-concours',
    'الاشتراك السنوي الشامل',
    'Abonnement Annuel Complet',
    'اشتراك سنوي ممتد (12 شهراً / 365 يوماً من تاريخ موافقة الإدارة) يغطي كافة المسارات والامتحانات والمراجعة.',
    'Abonnement annuel (12 mois / 365 jours à compter de la validation) couvrant toutes les filières et simulations.',
    1000,
    25,
    365,
    'annual',
    annualFeaturesAr,
    annualFeaturesFr,
    1,
    3
  );

  // Seed default Free/Paid quotas
  db.prepare(
    `INSERT OR IGNORE INTO plan_limits (
      plan_tier, daily_questions_limit, daily_lessons_limit, daily_exams_limit, allow_official_sim, allow_review_center
    ) VALUES ('free', 25, 3, 2, 0, 1)`
  ).run();
  db.prepare(
    `INSERT OR IGNORE INTO plan_limits (
      plan_tier, daily_questions_limit, daily_lessons_limit, daily_exams_limit, allow_official_sim, allow_review_center
    ) VALUES ('paid', 99999, 99999, 99999, 1, 1)`
  ).run();

  // Seed payment methods: 3 Mauritanian banking apps + 4th Card method
  const upsertMethod = db.prepare(`
    INSERT OR IGNORE INTO payment_methods (
      code, name_ar, name_fr, beneficiary_name, account_number, instructions_ar, instructions_fr, requires_receipt, active, display_order
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
  `);
  upsertMethod.run(
    'sedad',
    'السداد (Sedad)',
    'Sedad',
    'Abderahmane Mohamed Lemine',
    '47526504',
    'حوّل مبلغ الاشتراك بالضبط عبر تطبيق السداد إلى الحساب/الهاتف 47526504 باسم المستفيد Abderahmane Mohamed Lemine، ثم أدخل مرجع المعاملة وأرفق لقطة شاشة واضحة للإيصال.',
    'Transférez le montant exact via Sedad au compte/numéro 47526504 (bénéficiaire : Abderahmane Mohamed Lemine), puis saisissez la référence et joignez la capture du reçu.',
    1,
    1
  );
  upsertMethod.run(
    'masrvi',
    'مصرفي (Masrvi)',
    'Masrvi',
    'Abderahmane Mohamed Lemine',
    '47526504',
    'حوّل مبلغ الاشتراك عبر تطبيق مصرفي إلى حساب المستفيد Abderahmane Mohamed Lemine (47526504)، ثم أدخل رقم/مرجع العملية وتاريخها وأرفق صورة الإيصال.',
    'Effectuez le transfert Masrvi vers Abderahmane Mohamed Lemine (47526504), saisissez l’identifiant/référence et la date de transaction puis téléversez le reçu.',
    1,
    2
  );
  upsertMethod.run(
    'bankily',
    'بنكيلي (Bankily)',
    'Bankily',
    '',
    '',
    'قم بالتحويل عبر تطبيق بنكيلي بمبلغ الباقة المطلوب، ثم أدخل اسمك ورقم الهاتف الذي حوّلت منه وأرفق صورة الإيصال ليقوم النظام بالتحقق منها تلقائياً.',
    'Effectuez le transfert via Bankily pour le montant de la formule, puis saisissez votre nom, votre téléphone émetteur et téléversez le reçu.',
    1,
    3
  );
  upsertMethod.run(
    'card',
    'البطاقة المصرفية (Visa / Mastercard)',
    'Carte bancaire (Visa / Mastercard)',
    '',
    '',
    'الدفع الإلكتروني العالمي المباشر عبر بطاقات Visa وMasterCard مع تفعيل فوري للاشتراك.',
    'Paiement international direct par carte Visa et MasterCard avec activation immédiate.',
    0,
    4
  );

  // Do not invent an account number for Bankily or Card if previously auto-seeded with Sedad number
  db.prepare(
    `UPDATE payment_methods
     SET beneficiary_name = '', account_number = '',
         instructions_ar = 'قم بالتحويل عبر تطبيق بنكيلي بمبلغ الباقة المطلوب، ثم أدخل اسمك ورقم الهاتف الذي حوّلت منه وأرفق صورة الإيصال ليقوم النظام بالتحقق منها تلقائياً.',
         instructions_fr = 'Effectuez le transfert via Bankily pour le montant de la formule, puis saisissez votre nom, votre téléphone émetteur et téléversez le reçu.'
     WHERE code = 'bankily' AND account_number = '47526504'`
  ).run();
  db.prepare(
    `UPDATE payment_methods
     SET beneficiary_name = '', account_number = '', requires_receipt = 0
     WHERE code = 'card' AND account_number = '47526504'`
  ).run();

  // Seed default pronunciation dictionary rules for internal speech pipeline
  const upsertRule = db.prepare(
    'INSERT OR IGNORE INTO pronunciation_dictionary (pattern, replacement, lang, match_type, is_regex, enabled, active, notes) VALUES (?, ?, ?, ?, ?, 1, 1, ?)'
  );
  const defaultDict: Array<[string, string, 'ar' | 'fr' | 'all', 'word' | 'exact' | 'regex', number, string]> = [
    ['\\bMRU\\b', 'أوقية جديدة', 'all', 'regex', 1, 'العملة الوطنية الموريتانية'],
    ['أوقية', 'أُوقِيَّة', 'ar', 'word', 0, 'النطق السليم للعملة'],
    ['نواكشوط', 'نْوَاكْشُوطْ', 'ar', 'word', 0, 'العاصمة الموريتانية'],
    ['نواذيبو', 'نْوَاذِيبُو', 'ar', 'word', 0, 'العاصمة الاقتصادية'],
    ['موريتانيا', 'مُورِيتَانْيَا', 'ar', 'word', 0, 'اسم الدولة'],
    ['تدريبي', 'تَدْرِيبِي', 'ar', 'word', 0, 'اسم المنصة'],
    ['السداد', 'السَّدَادْ', 'ar', 'word', 0, 'وسيلة الدفع'],
    ['مصرفي', 'مَصْرِفِي', 'ar', 'word', 0, 'وسيلة الدفع'],
    ['بنكيلي', 'بَنْكِيلِي', 'ar', 'word', 0, 'وسيلة الدفع'],
    ['الديداكتيك', 'الدِّيدَاكْتِيكْ', 'ar', 'word', 0, 'مصطلح تربوي'],
    ['البيداغوجيا', 'الْبِيدَاغُوجْيَا', 'ar', 'word', 0, 'مصطلح تربوي'],
    ['الكفايات', 'الْكِفَايَاتْ', 'ar', 'word', 0, 'المقاربة بالكفايات'],
    ['الجذاذة', 'الْجُذَاذَةُ', 'ar', 'word', 0, 'وثيقة التحضير التربوي'],
    ['الإعراب', 'الْإِعْرَابُ', 'ar', 'word', 0, 'مصطلح نحوي'],
    ['PGCD', 'القَاسِمُ المُشْتَرَكُ الأَكْبَرُ', 'all', 'word', 0, 'مصطلح رياضي'],
    ['PPCM', 'المُضَاعَفُ المُشْتَرَكُ الأَصْغَرُ', 'all', 'word', 0, 'مصطلح رياضي'],
    ['COD', 'المَفْعُولُ بِهِ المُبَاشِرُ', 'all', 'word', 0, 'مصطلح نحوي فرنسي'],
    ['COI', 'المَفْعُولُ غَيْرُ المُبَاشِرِ', 'all', 'word', 0, 'مصطلح نحوي فرنسي'],
    ['ZPD', 'المِنْطَقَةُ القَرِيبَةُ لِلنُّمُوِّ', 'all', 'word', 0, 'مصطلح علم النفس التربوي'],
  ];
  for (const [pat, rep, lang, matchType, isRx, notes] of defaultDict) {
    upsertRule.run(pat, rep, lang, matchType, isRx, notes);
  }

  // Ensure all 4 Mauritanian Baccalaureate Series exist & strictly separate LM vs LO
  const insSeries = db.prepare(
    `INSERT INTO bac_series (slug, code, name_ar, name_fr, description_ar, description_fr, passing_average, active, display_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
     ON CONFLICT(slug) DO UPDATE SET
       code = excluded.code,
       name_ar = excluded.name_ar,
       name_fr = excluded.name_fr,
       description_ar = excluded.description_ar,
       description_fr = excluded.description_fr,
       display_order = excluded.display_order,
       active = 1`
  );
  for (const bs of SEED_BAC_SERIES) {
    insSeries.run(bs.slug, bs.code, bs.name_ar, bs.name_fr, bs.description_ar, bs.description_fr, bs.passing_average, bs.display_order);
  }

  // Upsert Mauritanian Baccalaureate coefficients if missing or if legacy LO/LM separation is needed
  const hasLmCoeff = db.prepare("SELECT id FROM bac_coefficients WHERE series_slug = 'bac-lm' LIMIT 1").get();
  if (!hasLmCoeff) {
    // Replace old merged bac-lo rows cleanly with separated bac-lm & bac-lo sets
    db.prepare("DELETE FROM bac_coefficients WHERE series_slug = 'bac-lo'").run();
  }
  const insCoeff = db.prepare(
    `INSERT OR IGNORE INTO bac_coefficients (series_slug, subject_slug, subject_name_ar, subject_name_fr, coefficient, max_grade, is_optional, display_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  for (const bc of SEED_BAC_COEFFICIENTS) {
    insCoeff.run(
      bc.series_slug,
      bc.subject_slug,
      bc.subject_name_ar,
      bc.subject_name_fr,
      bc.coefficient,
      bc.max_grade,
      bc.is_optional,
      bc.display_order
    );
  }

  // Ensure Baccalaureate lessons for each series (including dedicated bac-lm & bac-lo) are seeded idempotently
  const insertBacLesson = db.prepare(`
    INSERT INTO lessons (
      subject_slug, track, level, title_ar, title_fr, summary_ar, summary_fr,
      explanation_ar, explanation_speech_ar, explanation_fr,
      examples_json, exercises_json, mcq_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const bl of SEED_BAC_LESSONS) {
    const existsBacLesson = db
      .prepare('SELECT id FROM lessons WHERE subject_slug = ? LIMIT 1')
      .get(bl.subject_slug);
    if (!existsBacLesson) {
      insertBacLesson.run(
        bl.subject_slug,
        bl.track,
        bl.level,
        stripArabicDiacritics(bl.title_ar),
        bl.title_fr,
        stripArabicDiacritics(bl.summary_ar),
        bl.summary_fr,
        stripArabicDiacritics(bl.explanation_ar),
        bl.explanation_speech_ar,
        bl.explanation_fr,
        JSON.stringify(bl.examples.map((ex) => ({ ...ex, title_ar: stripArabicDiacritics(ex.title_ar), content_ar: stripArabicDiacritics(ex.content_ar) }))),
        JSON.stringify(bl.exercises.map((ex) => ({ ...ex, prompt_ar: stripArabicDiacritics(ex.prompt_ar), solution_ar: stripArabicDiacritics(ex.solution_ar) }))),
        JSON.stringify(
          bl.mcq.map((m) => ({
            ...m,
            stem_ar: stripArabicDiacritics(m.stem_ar),
            options_ar: m.options_ar.map((o) => stripArabicDiacritics(o)),
            explanation_ar: stripArabicDiacritics(m.explanation_ar),
          }))
        )
      );
    }
  }

  const bacQuestions = getBaccalaureateSeedQuestions();
  const insBacQ = db.prepare(`
    INSERT OR IGNORE INTO questions (
      subject_slug, track, level, axis_ar, axis_fr, lesson_id,
      topic_ar, topic_fr, skill_ar, skill_fr, question_type, difficulty,
      stem_ar, stem_speech_ar, stem_fr,
      options_ar_json, options_speech_ar_json, options_fr_json,
      correct_index, answer_ar, answer_speech_ar, answer_fr,
      explanation_ar, explanation_speech_ar, explanation_fr,
      exam_ref, target_competition, content_status, fingerprint_hash, verified
    ) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `);
  const seedBacTx = db.transaction(() => {
    for (const q of bacQuestions) {
      const fp = normalizeQuestionFingerprint(q.stem_ar, q.stem_fr);
      insBacQ.run(
        q.subject_slug,
        q.track,
        q.level,
        stripArabicDiacritics(q.axis_ar),
        q.axis_fr,
        stripArabicDiacritics(q.topic_ar),
        q.topic_fr,
        stripArabicDiacritics(q.skill_ar),
        q.skill_fr,
        q.question_type,
        q.difficulty,
        stripArabicDiacritics(q.stem_ar),
        q.stem_speech_ar,
        q.stem_fr,
        JSON.stringify(q.options_ar.map((o) => stripArabicDiacritics(o))),
        JSON.stringify(q.options_speech_ar),
        JSON.stringify(q.options_fr),
        q.correct_index,
        stripArabicDiacritics(q.answer_ar),
        q.answer_speech_ar,
        q.answer_fr,
        stripArabicDiacritics(q.explanation_ar),
        q.explanation_speech_ar,
        q.explanation_fr,
        q.exam_ref,
        q.target_competition,
        q.content_status,
        fp
      );
    }
  });
  seedBacTx();

  expireOverdueSubscriptions();
}

export function logAudit(
  actorId: number | null,
  actorEmail: string,
  action: string,
  targetType: string,
  targetId: string | number,
  details = ''
): void {
  try {
    db.prepare(
      'INSERT INTO audit_logs (actor_id, actor_email, action, target_type, target_id, details) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(actorId, actorEmail, action, targetType, String(targetId), details);
  } catch (err) {
    console.error('Audit log error:', err);
  }
}

