import nodemailer from 'nodemailer';
import { requireApiKey, json, onlyMethods } from './_lib/auth.js';
import { resolveSender } from './_lib/senders.js';
import { buildFixId, saveFixJob, normalizeNumber } from './_lib/fix-jobs.js';

function normalizePass(p) {
  return String(p || '').replace(/\s+/g, '');
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

export default async function handler(req, res) {
  if (!onlyMethods(req, res, ['POST'])) return;

  const auth = requireApiKey(req);
  if (!auth.ok) return json(res, auth.status, { ok: false, error: auth.error });

  let body = {};
  try {
    if (req.body && typeof req.body === 'object') body = req.body;
    else body = await parseJson(req);
  } catch (e) {
    return json(res, 400, { ok: false, error: e.message });
  }

  const to_email = body.to_email || body.to;
  const subject = body.subject || '';
  const text = body.body || body.text || '';
  const number = normalizeNumber(body.number || body.phone || body.target_number || '');
  const fix_id = body.fix_id || body.fixId || buildFixId('FYN');

  if (!to_email || !subject || !text) {
    return json(res, 400, { ok: false, error: 'Missing to_email/subject/body' });
  }

  const sender_id = body.sender_id || body.senderId;
  const sender_email = body.sender_email;
  const sender_app_pass = body.sender_app_pass;

  let sender;
  try {
    console.log('[API] resolveSender:start', {
      sender_id,
      sender_email,
      has_sender_app_pass: !!sender_app_pass
    });

    sender = await resolveSender({
      senderId: sender_id,
      senderEmail: sender_email,
      senderAppPass: sender_app_pass
    });

    console.log('[API] resolveSender:ok', {
      email: sender?.email,
      source: sender?.source,
      senderId: sender?.senderId || null
    });
  } catch (e) {
    console.error('[API] resolveSender:error', {
      message: e.message,
      stack: e.stack
    });
    return json(res, 500, { ok: false, phase: 'resolveSender', error: e.message });
  }

  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    requireTLS: true,
    auth: { user: sender.email, pass: normalizePass(sender.appPass) },
    tls: { rejectUnauthorized: false },
    connectionTimeout: 30000,
    socketTimeout: 30000
  });

  let info;
  try {
    console.log('[API] sendMail:start', {
      from: sender.email,
      to: to_email,
      subject
    });

    info = await transporter.sendMail({
      from: sender.email,
      to: to_email,
      subject,
      text
    });

    console.log('[API] sendMail:ok', { messageId: info.messageId });
  } catch (e) {
    console.error('[API] sendMail:error', {
      message: e.message,
      stack: e.stack,
      code: e.code,
      response: e.response,
      responseCode: e.responseCode,
      command: e.command
    });
    return json(res, 500, { ok: false, phase: 'sendMail', error: e.message });
  }

  let save_status = 'saved';
  try {
    console.log('[API] saveFixJob:start', {
      fix_id,
      number,
      sender_email: sender.email,
      message_id: info.messageId
    });

    await saveFixJob({
      fix_id,
      number,
      to_email,
      sender_email: sender.email,
      sender_id: sender.senderId || null,
      subject,
      message_id: info.messageId,
      status: 'pending',
      status_text: 'MENUNGGU BALASAN WHATSAPP'
    });

    console.log('[API] saveFixJob:ok', { fix_id });
  } catch (e) {
    save_status = 'skipped';
    console.error('[API] saveFixJob:error', {
      message: e.message,
      stack: e.stack
    });
  }

  return json(res, 200, {
    ok: true,
    message: 'Email sent',
    messageId: info.messageId,
    fix_id,
    number,
    sender_source: sender.source,
    sender_id: sender.senderId || null,
    save_status
  });
}
