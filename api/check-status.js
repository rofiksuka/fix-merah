import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { requireApiKey, json, onlyMethods } from './_lib/auth.js';
import { getFixJob, getFixJobByNumber, updateFixJob, normalizeNumber } from './_lib/fix-jobs.js';
import { resolveSender } from './_lib/senders.js';

const DEFAULT_LOOKBACK_HOURS = 72;
const DEFAULT_FROM_MATCH = ['support@support.whatsapp.com', 'support@store.whatsapp.com', 'no-reply@account.whatsapp.com'];
const POSITIVE_PATTERNS = [
  /registre-se novamente/i,
  /register again/i,
  /silakan registrasi ulang/i,
  /sila daftar semula/i,
  /crie outra conta/i,
  /you can create a new account/i,
  /your account can now be registered/i,
  /agora voc[eê] pode registrar/i,
  /cadastre-se novamente/i,
  /balasan whatsapp/i
];

function normalizeMessageId(value) {
  return String(value || '').trim().replace(/^<|>$/g, '');
}

async function parseJson(req) {
  return new Promise((resolve, reject) => {
    let buf = '';
    req.on('data', (chunk) => {
      buf += chunk;
      if (buf.length > 1_000_000) {
        reject(new Error('Payload too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(buf ? JSON.parse(buf) : {});
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function pickText(parsed) {
  return [parsed.subject || '', parsed.text || '', parsed.html ? String(parsed.html).replace(/<[^>]+>/g, ' ') : '']
    .join('\n')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasPositiveSignal(text) {
  return POSITIVE_PATTERNS.some((rx) => rx.test(text));
}

function textContainsNumber(text, number) {
  if (!text || !number) return false;
  const digits = number.replace(/\D/g, '');
  if (!digits) return false;
  const compact = String(text).replace(/\D/g, '');
  return compact.includes(digits);
}

function extractExcerpt(text, limit = 220) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  return clean.length > limit ? `${clean.slice(0, limit - 3)}...` : clean;
}

async function findReply({ sender, targetNumber, targetMessageId, lookbackHours = DEFAULT_LOOKBACK_HOURS }) {
  const client = new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: {
      user: sender.email,
      pass: String(sender.appPass || '').replace(/\s+/g, '')
    },
    logger: false
  });

  const since = new Date(Date.now() - lookbackHours * 60 * 60 * 1000);
  const targetMsg = normalizeMessageId(targetMessageId);
  const fromList = String(process.env.WHATSAPP_REPLY_FROM || '')
    .split(',')
    .map(v => v.trim().toLowerCase())
    .filter(Boolean);
  const acceptedFrom = fromList.length ? fromList : DEFAULT_FROM_MATCH;

  await client.connect();
  try {
    await client.mailboxOpen('INBOX');
    const seqs = await client.search({ since });
    const ids = Array.isArray(seqs) ? seqs.slice(-25).reverse() : [];

    for (const seq of ids) {
      const msg = await client.fetchOne(seq, {
        uid: true,
        envelope: true,
        source: true,
        bodyStructure: true,
        internalDate: true,
        flags: true,
        headers: ['message-id', 'in-reply-to', 'references', 'from', 'subject', 'date']
      });
      if (!msg?.source) continue;

      const parsed = await simpleParser(msg.source);
      const fromValue = String(parsed.from?.value?.[0]?.address || parsed.from?.text || '').toLowerCase();
      if (acceptedFrom.length && fromValue && !acceptedFrom.some(f => fromValue.includes(f))) {
        continue;
      }

      const text = pickText(parsed);
      const refs = [parsed.inReplyTo || '', parsed.references || ''].join(' ');
      const byMessageId = targetMsg && refs.includes(targetMsg);
      const byNumber = textContainsNumber(text, targetNumber);
      const positive = hasPositiveSignal(text);

      if (positive || byMessageId || byNumber) {
        return {
          detected: true,
          reply_subject: parsed.subject || msg.envelope?.subject || '(Tanpa subjek)',
          reply_from: parsed.from?.text || fromValue || 'WhatsApp Support',
          reply_date: parsed.date?.toISOString?.() || msg.internalDate?.toISOString?.() || new Date().toISOString(),
          reply_excerpt: extractExcerpt(text),
          match_reason: positive ? 'positive_pattern' : byMessageId ? 'message_id' : 'number_match'
        };
      }
    }

    return { detected: false };
  } finally {
    await client.logout().catch(() => {});
  }
}

export default async function handler(req, res) {
  if (!onlyMethods(req, res, ['POST'])) return;

  const auth = requireApiKey(req);
  if (!auth.ok) return json(res, auth.status, { ok: false, error: auth.error });

  let body = {};
  try {
    body = req.body && typeof req.body === 'object' ? req.body : await parseJson(req);
  } catch (e) {
    return json(res, 400, { ok: false, error: e.message });
  }

  const fixId = body.fix_id || body.fixId || null;
  const number = normalizeNumber(body.number || body.phone || body.target_number || '');
  const senderId = body.sender_id || body.senderId || null;
  const senderEmail = body.sender_email || null;
  const senderAppPass = body.sender_app_pass || null;
  const lookbackHours = Math.max(1, Math.min(Number(body.lookback_hours || DEFAULT_LOOKBACK_HOURS), 24 * 14));

  let job = fixId ? await getFixJob(fixId) : null;
  if (!job && number) {
    job = await getFixJobByNumber(number);
  }

  const finalFixId = fixId || job?.fix_id || null;
  const finalNumber = number || job?.number || '';
  const targetMessageId = job?.message_id || body.message_id || null;

  let sender;
  try {
    sender = await resolveSender({
      senderId: senderId || job?.sender_id || null,
      senderEmail: senderEmail || job?.sender_email || null,
      senderAppPass
    });
  } catch (e) {
    return json(res, 500, { ok: false, error: `Resolve sender failed: ${e.message}` });
  }

  try {
    const result = await findReply({
      sender,
      targetNumber: finalNumber,
      targetMessageId,
      lookbackHours
    });

    if (!finalFixId) {
      return json(res, 200, {
        ok: true,
        fix_id: null,
        number: finalNumber,
        detected_reply: result.detected,
        status: result.detected ? 'reply_detected' : 'pending',
        status_text: result.detected ? 'BALASAN WHATSAPP TERDETEKSI, SILAHKAN REGISTRASI ULANG' : 'BELUM ADA BALASAN FIXMERAH',
        ...result
      });
    }

    const updated = await updateFixJob(finalFixId, {
      status: result.detected ? 'reply_detected' : 'pending',
      status_text: result.detected ? 'BALASAN WHATSAPP TERDETEKSI, SILAHKAN REGISTRASI ULANG' : 'BELUM ADA BALASAN FIXMERAH',
      detected_reply: result.detected,
      reply_subject: result.reply_subject || null,
      reply_from: result.reply_from || null,
      reply_date: result.reply_date || null,
      reply_excerpt: result.reply_excerpt || null,
      last_checked_at: new Date().toISOString()
    });

    return json(res, 200, {
      ok: true,
      fix_id: finalFixId,
      number: finalNumber,
      detected_reply: result.detected,
      status: updated?.status || (result.detected ? 'reply_detected' : 'pending'),
      status_text: updated?.status_text || (result.detected ? 'BALASAN WHATSAPP TERDETEKSI, SILAHKAN REGISTRASI ULANG' : 'BELUM ADA BALASAN FIXMERAH'),
      reply_subject: updated?.reply_subject || null,
      reply_from: updated?.reply_from || null,
      reply_date: updated?.reply_date || null,
      reply_excerpt: updated?.reply_excerpt || null,
      last_checked_at: updated?.last_checked_at || new Date().toISOString(),
      match_reason: result.match_reason || null
    });
  } catch (e) {
    return json(res, 500, { ok: false, error: e.message });
  }
}
