import crypto from 'crypto';
import { kv } from '@vercel/kv';

const JOB_PREFIX = 'fixjob:';
const MSG_PREFIX = 'fixmsg:';
const PENDING_SET = 'fixjobs:pending';
const PROCESSED_REPLY_SET = 'fixreplies:processed';

export function buildFixId(prefix = 'FYN') {
  return `${prefix}${Date.now()}${crypto.randomInt(100000, 999999)}`;
}

export function maskNumber(number) {
  const raw = String(number || '').replace(/\D+/g, '');
  if (!raw) return '***';
  if (raw.length <= 5) return `${raw.slice(0, 2)}***`;
  return `${raw.slice(0, 3)}***${raw.slice(-3)}`;
}

function jobKey(fixId) {
  return `${JOB_PREFIX}${fixId}`;
}

function msgKey(messageId) {
  return `${MSG_PREFIX}${normalizeMessageId(messageId)}`;
}

export function normalizeMessageId(value) {
  return String(value || '').trim().replace(/[<>]/g, '').toLowerCase();
}

export function classifyReplyText(text) {
  const body = String(text || '').toLowerCase();
  if (!body.trim()) return 'replied';

  const successHints = [
    'try again',
    'you can log in again',
    'review completed',
    'your account has been restored',
    'restored',
    'access has been restored',
    'you may now access',
    'silakan coba lagi',
    'coba lagi'
  ];
  const failedHints = [
    'cannot restore',
    'can\'t restore',
    'violated',
    'not enough information',
    'unable to process',
    'we cannot',
    'tidak dapat',
    'ditolak'
  ];

  if (successHints.some((hint) => body.includes(hint))) return 'success';
  if (failedHints.some((hint) => body.includes(hint))) return 'failed';
  return 'replied';
}

export async function saveFixJob(job) {
  const now = new Date().toISOString();
  const full = {
    status: 'pending',
    notified: false,
    createdAt: now,
    updatedAt: now,
    ...job
  };
  await kv.set(jobKey(full.fixId), full);
  if (full.outboundMessageId) {
    await kv.set(msgKey(full.outboundMessageId), full.fixId);
  }
  if (!['success', 'failed'].includes(full.status)) {
    await kv.sadd(PENDING_SET, full.fixId);
  }
  return full;
}

export async function getFixJob(fixId) {
  return kv.get(jobKey(fixId));
}

export async function updateFixJob(fixId, patch) {
  const current = await getFixJob(fixId);
  if (!current) return null;
  const next = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString()
  };
  await kv.set(jobKey(fixId), next);
  if (next.outboundMessageId) {
    await kv.set(msgKey(next.outboundMessageId), fixId);
  }
  if (['success', 'failed'].includes(next.status)) await kv.srem(PENDING_SET, fixId);
  else await kv.sadd(PENDING_SET, fixId);
  return next;
}

export async function findJobByOutboundMessageId(messageId) {
  const normalized = normalizeMessageId(messageId);
  if (!normalized) return null;
  const fixId = await kv.get(msgKey(normalized));
  if (!fixId) return null;
  return getFixJob(fixId);
}

export async function listPendingFixJobs() {
  const ids = await kv.smembers(PENDING_SET);
  if (!Array.isArray(ids) || !ids.length) return [];
  const jobs = await Promise.all(ids.map((id) => getFixJob(id)));
  return jobs.filter(Boolean);
}

export async function markReplyProcessed(messageId) {
  const normalized = normalizeMessageId(messageId);
  if (!normalized) return;
  await kv.sadd(PROCESSED_REPLY_SET, normalized);
}

export async function isReplyProcessed(messageId) {
  const normalized = normalizeMessageId(messageId);
  if (!normalized) return false;
  const result = await kv.sismember(PROCESSED_REPLY_SET, normalized);
  return Boolean(result);
}
