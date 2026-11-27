import { Pool } from 'pg';
import { db } from './db';

export type DatabaseDialect = 'sqlite' | 'postgresql';

export interface DatabaseStatus {
  activeDriver: 'sqlite';
  postgresConfigured: boolean;
  postgresConnected: boolean;
  postgresLatencyMs: number | null;
  postgresError?: string;
}

let pgPool: Pool | null = null;

export function getPostgresPool(): Pool | null {
  const conn = (process.env.DATABASE_URL || '').trim();
  if (!conn) return null;
  if (!pgPool) {
    pgPool = new Pool({
      connectionString: conn,
      max: Number(process.env.PG_POOL_MAX || 20),
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
  }
  return pgPool;
}

export const sqlDialect = {
  nowUtc(dialect: DatabaseDialect): string {
    return dialect === 'postgresql' ? 'NOW()' : "datetime('now')";
  },
  hoursAgo(dialect: DatabaseDialect, hours: number): string {
    const safeHours = Math.max(1, Math.floor(hours));
    return dialect === 'postgresql'
      ? `NOW() - INTERVAL '${safeHours} hours'`
      : `datetime('now', '-${safeHours} hours')`;
  },
  daysAgo(dialect: DatabaseDialect, days: number): string {
    const safeDays = Math.max(1, Math.floor(days));
    return dialect === 'postgresql'
      ? `NOW() - INTERVAL '${safeDays} days'`
      : `datetime('now', '-${safeDays} days')`;
  },
  placeholder(dialect: DatabaseDialect, index: number): string {
    return dialect === 'postgresql' ? `$${index}` : '?';
  },
};

export async function checkDatabaseHealth(): Promise<DatabaseStatus> {
  let sqliteOk = false;
  try {
    db.prepare('SELECT 1 as ok').get();
    sqliteOk = true;
  } catch {
    sqliteOk = false;
  }

  const pool = getPostgresPool();
  if (!pool) {
    return {
      activeDriver: 'sqlite',
      postgresConfigured: false,
      postgresConnected: false,
      postgresLatencyMs: null,
      ...(sqliteOk ? {} : { postgresError: 'SQLite health check failed' }),
    };
  }

  const start = Date.now();
  try {
    await pool.query('SELECT 1');
    return {
      activeDriver: 'sqlite',
      postgresConfigured: true,
      postgresConnected: true,
      postgresLatencyMs: Date.now() - start,
    };
  } catch (err: any) {
    return {
      activeDriver: 'sqlite',
      postgresConfigured: true,
      postgresConnected: false,
      postgresLatencyMs: null,
      postgresError: err?.message || 'PostgreSQL connection check failed',
    };
  }
}

export function getPostgreSqlMigrationPlan(): {
  ready: boolean;
  configured: boolean;
  coreTables: string[];
  notes: string[];
} {
  return {
    ready: true,
    configured: Boolean((process.env.DATABASE_URL || '').trim()),
    coreTables: [
      'users',
      'user_sessions',
      'email_verification_codes',
      'password_resets',
      'subjects',
      'lessons',
      'questions',
      'exam_configs',
      'exam_attempts',
      'subscription_plans',
      'user_subscriptions',
      'payment_orders',
      'nardopay_webhook_events',
      'subscription_requests',
      'files',
      'notifications',
      'admin_permissions',
      'teacher_sections',
      'section_members',
      'section_content',
      'section_tests',
      'schools',
      'school_departments',
      'school_teachers',
      'school_students',
      'follows',
      'verification_requests',
      'audit_logs',
    ],
    notes: [
      'SQL dialect differences isolated in sqlDialect helper.',
      'Binary receipt & educational files abstracted via object storage (files table holds metadata only).',
      'Composite indexes defined across filter/sort/pagination queries.',
    ],
  };
}
