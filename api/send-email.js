import nodemailer from 'nodemailer';
import { requireApiKey, json, onlyMethods } from './_lib/auth.js';
import { resolveSender } from './_lib/senders.js';

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
    // Vercel may pre-parse body for some runtimes; handle both.
    if (req.body && typeof req.body === 'object') body = req.body;
    else body = await parseJson(req);
  } catch (e) {
    return json(res, 400, { ok: false, error: e.message });
  }

  const to_email = body.to_email || body.to;
  const subject = body.subject || '';
  const text = body.body || body.text || '';

  if (!to_email || !subject || !text) {
    return json(res, 400, { ok: false, error: 'Missing to_email/subject/body' });
  }

  // New: support stored senders
  const sender_id = body.sender_id || body.senderId;
  const sender_email = body.sender_email;
  const sender_app_pass = body.sender_app_pass;

  let sender;
  try {
    sender = await resolveSender({
      senderId: sender_id,
      senderEmail: sender_email,
      senderAppPass: sender_app_pass
    });
  } catch (e) {
    return json(res, 500, { ok: false, error: e.message });
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

  try {
    const info = await transporter.sendMail({
      from: sender.email,
      to: to_email,
      subject,
      text
    });

    return json(res, 200, {
      ok: true,
      message: 'Email sent',
      messageId: info.messageId,
      sender_source: sender.source,
      sender_id: sender.senderId || null
    });
  } catch (e) {
    return json(res, 500, { ok: false, error: e.message });
  }
}
