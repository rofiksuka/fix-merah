import { kv } from '@vercel/kv';
import crypto from 'crypto';
import { encryptIfPossible, decryptIfNeeded } from './crypto.js';

const KEY_SENDERS = 'fix_merah:senders';
const KEY_ACTIVE = 'fix_merah:active_sender_id';

export async function getSenders() {
  const list = await kv.get(KEY_SENDERS);
  return Array.isArray(list) ? list : [];
}

export async function saveSenders(list) {
  await kv.set(KEY_SENDERS, list);
}

export async function getActiveSenderId() {
  const id = await kv.get(KEY_ACTIVE);
  return typeof id === 'string' ? id : null;
}

export async function setActiveSenderId(id) {
  if (!id) {
    await kv.del(KEY_ACTIVE);
    return;
  }
  await kv.set(KEY_ACTIVE, id);
}

export function validateEmail(email) {
  if (typeof email !== 'string') return false;
  const e = email.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

export function validateAppPass(pass) {
  return typeof pass === 'string' && pass.trim().length >= 8;
}

export function newId() {
  return crypto.randomBytes(6).toString('hex') + Date.now().toString(36);
}

export async function addSender({ email, appPass }) {
  const list = await getSenders();
  const id = newId();
  const enc = encryptIfPossible(appPass);
  const item = {
    id,
    email: email.trim(),
    appPass: enc,
    createdAt: new Date().toISOString(),
    lastUsedAt: null
  };
  list.push(item);
  await saveSenders(list);
  return { id, item };
}

export async function deleteSender(id) {
  const list = await getSenders();
  const next = list.filter(s => s?.id !== id);
  const deleted = next.length !== list.length;
  if (!deleted) return { deleted: false };
  await saveSenders(next);
  const active = await getActiveSenderId();
  if (active === id) {
    await setActiveSenderId(null);
  }
  return { deleted: true };
}

export async function resolveSender({ senderId, senderEmail, senderAppPass }) {
  // Priority:
  // 1) explicit senderId in request
  // 2) explicit senderEmail+senderAppPass in request
  // 3) active sender in KV
  // 4) default env GMAIL_USER/GMAIL_PASS

  if (senderId) {
    const list = await getSenders();
    const found = list.find(s => s?.id === senderId);
    if (!found) throw new Error('sender_id not found');
    const pass = decryptIfNeeded(found.appPass);
    found.lastUsedAt = new Date().toISOString();
    await saveSenders(list);
    return { email: found.email, appPass: pass, source: 'sender_id', senderId: found.id };
  }

  if (senderEmail && senderAppPass) {
    return { email: String(senderEmail).trim(), appPass: String(senderAppPass).trim(), source: 'request' };
  }

  const activeId = await getActiveSenderId();
  if (activeId) {
    const list = await getSenders();
    const found = list.find(s => s?.id === activeId);
    if (found) {
      const pass = decryptIfNeeded(found.appPass);
      found.lastUsedAt = new Date().toISOString();
      await saveSenders(list);
      return { email: found.email, appPass: pass, source: 'active_sender', senderId: found.id };
    }
  }

  const envEmail = process.env.GMAIL_USER;
  const envPass = process.env.GMAIL_PASS;
  if (envEmail && envPass) {
    return { email: envEmail, appPass: envPass, source: 'env_default' };
  }

  throw new Error('No sender configured. Provide sender_id OR sender_email+sender_app_pass OR set active sender OR set env GMAIL_USER/GMAIL_PASS');
}
