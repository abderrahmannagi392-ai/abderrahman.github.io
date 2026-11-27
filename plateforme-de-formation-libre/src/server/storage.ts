import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { db } from './db';

const LOCAL_UPLOAD_ROOT = path.resolve(process.cwd(), 'data', 'uploads');

function ensureLocalUploadRoot(): void {
  if (!fs.existsSync(LOCAL_UPLOAD_ROOT)) {
    fs.mkdirSync(LOCAL_UPLOAD_ROOT, { recursive: true });
  }
}

export type AllowedMimeType =
  | 'image/png'
  | 'image/jpeg'
  | 'image/webp'
  | 'application/pdf'
  | 'audio/mpeg'
  | 'audio/wav'
  | 'audio/ogg'
  | 'audio/webm'
  | 'audio/mp4';

const MIME_EXTENSIONS: Record<AllowedMimeType, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/ogg': 'ogg',
  'audio/webm': 'webm',
  'audio/mp4': 'm4a',
};

const MAX_BYTES_BY_CATEGORY = {
  image: 8 * 1024 * 1024,
  pdf: 20 * 1024 * 1024,
  audio: 20 * 1024 * 1024,
};

export function normalizeMimeType(raw: string): AllowedMimeType | null {
  const clean = String(raw || '').split(';')[0].trim().toLowerCase();
  if (clean === 'image/jpg') return 'image/jpeg';
  if (clean === 'audio/mp3') return 'audio/mpeg';
  if (clean in MIME_EXTENSIONS) return clean as AllowedMimeType;
  return null;
}

export function verifyBufferMagicBytes(buffer: Buffer, mimeType: AllowedMimeType): boolean {
  if (!buffer || buffer.length < 12) return false;
  switch (mimeType) {
    case 'image/png':
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
    case 'image/jpeg':
      return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    case 'image/webp':
      return (
        buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
        buffer.subarray(8, 12).toString('ascii') === 'WEBP'
      );
    case 'application/pdf':
      return buffer.subarray(0, 5).toString('ascii') === '%PDF-';
    case 'audio/wav':
      return (
        buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
        buffer.subarray(8, 12).toString('ascii') === 'WAVE'
      );
    case 'audio/ogg':
      return buffer.subarray(0, 4).toString('ascii') === 'OggS';
    case 'audio/mpeg':
      return (
        buffer.subarray(0, 3).toString('ascii') === 'ID3' ||
        (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0)
      );
    case 'audio/webm':
      return buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3;
    case 'audio/mp4':
      return buffer.subarray(4, 8).toString('ascii') === 'ftyp';
    default:
      return false;
  }
}

function getObjectStorageConfig() {
  const endpoint = (process.env.OBJECT_STORAGE_ENDPOINT || '').trim().replace(/\/+$/, '');
  const bucket = (process.env.OBJECT_STORAGE_BUCKET || '').trim();
  const region = (process.env.OBJECT_STORAGE_REGION || 'auto').trim();
  const accessKey = (process.env.OBJECT_STORAGE_ACCESS_KEY || '').trim();
  const secretKey = (process.env.OBJECT_STORAGE_SECRET_KEY || '').trim();
  const publicUrl = (process.env.OBJECT_STORAGE_PUBLIC_URL || '').trim().replace(/\/+$/, '');
  const configured = Boolean(endpoint && bucket && accessKey && secretKey);
  return { configured, endpoint, bucket, region, accessKey, secretKey, publicUrl };
}

function sha256Hex(data: Buffer | string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function hmacSha256(key: Buffer | string, data: string): Buffer {
  return crypto.createHmac('sha256', key).update(data, 'utf8').digest();
}

function signS3Request(params: {
  method: 'PUT' | 'GET' | 'DELETE';
  storageKey: string;
  payloadHash: string;
  contentType?: string;
  cfg: ReturnType<typeof getObjectStorageConfig>;
}): { url: string; headers: Record<string, string> } {
  const { method, storageKey, payloadHash, contentType, cfg } = params;
  const baseUrl = new URL(cfg.endpoint);
  const encodedKey = storageKey
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/');
  const canonicalUri = `/${encodeURIComponent(cfg.bucket)}/${encodedKey}`;
  const fullUrl = `${baseUrl.origin}${canonicalUri}`;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);

  const rawHeaders: Record<string, string> = {
    host: baseUrl.host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  };
  if (contentType) {
    rawHeaders['content-type'] = contentType;
  }
  const sortedHeaderKeys = Object.keys(rawHeaders).sort();
  const canonicalHeaders = sortedHeaderKeys.map((k) => `${k}:${rawHeaders[k]}\n`).join('');
  const signedHeaders = sortedHeaderKeys.join(';');

  const canonicalRequest = [
    method,
    canonicalUri,
    '',
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const scope = `${dateStamp}/${cfg.region}/s3/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    scope,
    sha256Hex(canonicalRequest),
  ].join('\n');

  const kDate = hmacSha256(`AWS4${cfg.secretKey}`, dateStamp);
  const kRegion = hmacSha256(kDate, cfg.region);
  const kService = hmacSha256(kRegion, 's3');
  const kSigning = hmacSha256(kService, 'aws4_request');
  const signature = crypto.createHmac('sha256', kSigning).update(stringToSign, 'utf8').digest('hex');

  const authorization = `AWS4-HMAC-SHA256 Credential=${cfg.accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  return {
    url: fullUrl,
    headers: {
      ...rawHeaders,
      Authorization: authorization,
    },
  };
}

function resolveConfinedLocalPath(storageKey: string): string {
  ensureLocalUploadRoot();
  const safeKey = storageKey.replace(/[^a-zA-Z0-9/_\-.]/g, '_');
  const resolved = path.resolve(LOCAL_UPLOAD_ROOT, safeKey);
  if (resolved !== LOCAL_UPLOAD_ROOT && !resolved.startsWith(LOCAL_UPLOAD_ROOT + path.sep)) {
    throw new Error('Invalid storage path traversal attempt');
  }
  return resolved;
}

export interface StoredFileRecord {
  id: string;
  owner_user_id: number;
  storage_provider: 's3' | 'local';
  storage_key: string;
  original_name: string;
  mime_type: AllowedMimeType;
  size_bytes: number;
  checksum_sha256: string;
  entity_type: string;
  entity_id: string;
  visibility: 'private' | 'section' | 'school' | 'public';
  created_at: string;
  url: string;
}

export async function storeBinaryFile(params: {
  ownerUserId: number;
  buffer: Buffer;
  mimeType: string;
  originalName?: string;
  entityType: 'receipt' | 'section_lesson' | 'section_test' | 'verification_doc' | 'school_material' | 'other';
  entityId?: string;
  visibility?: 'private' | 'section' | 'school' | 'public';
}): Promise<StoredFileRecord> {
  const mime = normalizeMimeType(params.mimeType);
  if (!mime) {
    throw new Error('نوع الملف غير مدعوم.');
  }
  const category = mime.startsWith('image/') ? 'image' : mime === 'application/pdf' ? 'pdf' : 'audio';
  const maxBytes = MAX_BYTES_BY_CATEGORY[category];
  if (!params.buffer || params.buffer.length < 16 || params.buffer.length > maxBytes) {
    throw new Error(`حجم الملف خارج النطاق المسموح (الحد الأقصى ${Math.round(maxBytes / (1024 * 1024))}MB).`);
  }
  if (!verifyBufferMagicBytes(params.buffer, mime)) {
    throw new Error('تعذر التحقق من تطابق صيغة الملف الفعلية (Magic Bytes).');
  }

  const fileId = `FILE-${crypto.randomBytes(8).toString('hex').toUpperCase()}`;
  const ext = MIME_EXTENSIONS[mime];
  const dateFolder = new Date().toISOString().slice(0, 10);
  const safeEntityType = params.entityType.replace(/[^a-z_]/g, '');
  const storageKey = `${safeEntityType}/${dateFolder}/${fileId}.${ext}`;
  const checksum = sha256Hex(params.buffer);
  const cleanOriginalName = path.basename(String(params.originalName || `${fileId}.${ext}`)).slice(0, 140);
  const visibility = params.visibility || 'private';

  const cfg = getObjectStorageConfig();
  let provider: 's3' | 'local' = 'local';

  if (cfg.configured) {
    const signed = signS3Request({
      method: 'PUT',
      storageKey,
      payloadHash: checksum,
      contentType: mime,
      cfg,
    });
    const putResp = await fetch(signed.url, {
      method: 'PUT',
      headers: signed.headers,
      body: new Uint8Array(params.buffer),
    });
    if (!putResp.ok) {
      throw new Error(`Object storage upload failed (HTTP ${putResp.status})`);
    }
    provider = 's3';
  } else {
    const targetPath = resolveConfinedLocalPath(storageKey);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, params.buffer);
    if (!fs.existsSync(targetPath)) {
      throw new Error('فشل حفظ الملف فعلياً على وحدة التخزين.');
    }
  }

  db.prepare(
    `INSERT INTO files (
      id, owner_user_id, storage_provider, storage_key, original_name,
      mime_type, size_bytes, checksum_sha256, entity_type, entity_id, visibility
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    fileId,
    params.ownerUserId,
    provider,
    storageKey,
    cleanOriginalName,
    mime,
    params.buffer.length,
    checksum,
    safeEntityType,
    String(params.entityId || ''),
    visibility
  );

  return {
    id: fileId,
    owner_user_id: params.ownerUserId,
    storage_provider: provider,
    storage_key: storageKey,
    original_name: cleanOriginalName,
    mime_type: mime,
    size_bytes: params.buffer.length,
    checksum_sha256: checksum,
    entity_type: safeEntityType,
    entity_id: String(params.entityId || ''),
    visibility,
    created_at: new Date().toISOString(),
    url:
      provider === 's3' && cfg.publicUrl && visibility === 'public'
        ? `${cfg.publicUrl}/${storageKey}`
        : `/api/files/${encodeURIComponent(fileId)}`,
  };
}

export async function readStoredFile(fileId: string): Promise<{
  record: StoredFileRecord;
  buffer: Buffer;
} | null> {
  const row = db
    .prepare('SELECT * FROM files WHERE id = ?')
    .get(fileId) as StoredFileRecord | undefined;
  if (!row) return null;

  if (row.storage_provider === 's3') {
    const cfg = getObjectStorageConfig();
    if (!cfg.configured) return null;
    const signed = signS3Request({
      method: 'GET',
      storageKey: row.storage_key,
      payloadHash: sha256Hex(''),
      cfg,
    });
    const resp = await fetch(signed.url, { method: 'GET', headers: signed.headers });
    if (!resp.ok) return null;
    const ab = await resp.arrayBuffer();
    return { record: row, buffer: Buffer.from(ab) };
  }

  const targetPath = resolveConfinedLocalPath(row.storage_key);
  if (!fs.existsSync(targetPath)) return null;
  const buffer = fs.readFileSync(targetPath);
  return { record: row, buffer };
}

export async function deleteStoredFile(fileId: string): Promise<boolean> {
  const row = db
    .prepare('SELECT * FROM files WHERE id = ?')
    .get(fileId) as StoredFileRecord | undefined;
  if (!row) return false;

  if (row.storage_provider === 's3') {
    const cfg = getObjectStorageConfig();
    if (cfg.configured) {
      const signed = signS3Request({
        method: 'DELETE',
        storageKey: row.storage_key,
        payloadHash: sha256Hex(''),
        cfg,
      });
      await fetch(signed.url, { method: 'DELETE', headers: signed.headers }).catch(() => {});
    }
  } else {
    try {
      const targetPath = resolveConfinedLocalPath(row.storage_key);
      if (fs.existsSync(targetPath)) {
        fs.unlinkSync(targetPath);
      }
    } catch {
      // ignore missing file cleanup errors
    }
  }

  db.prepare('DELETE FROM files WHERE id = ?').run(fileId);
  return true;
}

export function getStorageHealth() {
  const cfg = getObjectStorageConfig();
  ensureLocalUploadRoot();
  let fileCount = 0;
  let totalBytes = 0;
  try {
    const stats = db
      .prepare('SELECT COUNT(*) as c, COALESCE(SUM(size_bytes), 0) as bytes FROM files')
      .get() as { c: number; bytes: number };
    fileCount = Number(stats.c || 0);
    totalBytes = Number(stats.bytes || 0);
  } catch {
    // table may not exist during earliest bootstrap
  }
  return {
    provider: cfg.configured ? 's3' : 'local_disk',
    bucket: cfg.configured ? cfg.bucket : 'data/uploads',
    fileCount,
    totalBytes,
  };
}
