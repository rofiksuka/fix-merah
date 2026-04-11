import { kv } from '@vercel/kv';

const KEY_PREFIX = 'fix_merah:fixjob:';
const KEY_BY_NUMBER_PREFIX = 'fix_merah:fixjob_by_number:';

function nowIso() {
  return new Date().toISOString();
}

function kvReady() {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

function normalizeNumber(value) {
  return String(value || '')
    .trim()
    .replace(/[^\d+]/g, '');
}

export function buildFixId(prefix = 'FYN') {
  const head = String(prefix || 'FYN').replace(/[^A-Za-z0-9]/g, '').toUpperCase() || 'FYN';
  return `${head}${Date.now()}${Math.floor(100000 + Math.random() * 900000)}`;
}

export async function saveFixJob(job) {
  const fixId = job.fix_id || job.fixId;
  if (!fixId) throw new Error('fix_id is required');
  const normalized = {
    fix_id: fixId,
    number: normalizeNumber(job.number),
    to_email: job.to_email || '',
    sender_email: job.sender_email || '',
    sender_id: job.sender_id || null,
    subject: job.subject || '',
    message_id: job.message_id || null,
    status: job.status || 'pending',
    status_text: job.status_text || 'MENUNGGU BALASAN WHATSAPP',
    detected_reply: Boolean(job.detected_reply),
    reply_subject: job.reply_subject || null,
    reply_from: job.reply_from || null,
    reply_date: job.reply_date || null,
    reply_excerpt: job.reply_excerpt || null,
    last_checked_at: job.last_checked_at || null,
    created_at: job.created_at || nowIso(),
    updated_at: nowIso()
  };

  if (!kvReady()) {
    return { ...normalized, storage: 'memoryless' };
  }

  await kv.set(`${KEY_PREFIX}${fixId}`, normalized);
  if (normalized.number) {
    await kv.set(`${KEY_BY_NUMBER_PREFIX}${normalized.number}`, fixId);
  }
  return normalized;
}

export async function getFixJob(fixId) {
  if (!fixId || !kvReady()) return null;
  return await kv.get(`${KEY_PREFIX}${fixId}`);
}

export async function getFixJobByNumber(number) {
  if (!kvReady()) return null;
  const normalized = normalizeNumber(number);
  if (!normalized) return null;
  const fixId = await kv.get(`${KEY_BY_NUMBER_PREFIX}${normalized}`);
  if (!fixId) return null;
  return await getFixJob(fixId);
}

export async function updateFixJob(fixId, patch) {
  if (!kvReady()) return null;
  const existing = await getFixJob(fixId);
  if (!existing) return null;
  return await saveFixJob({ ...existing, ...patch, fix_id: fixId });
}

export { normalizeNumber };
