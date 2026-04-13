import nodemailer from 'nodemailer';
import { requireApiKey, json, onlyMethods } from './_lib/auth.js';
import { resolveSender } from './_lib/senders.js';
import { addPendingFix } from './_lib/pending-fixes.js';

function normalizePass(p) {
  return String(p || '').replace(/\s+/g, '');
}

export default async function handler(req, res) {
  if (!onlyMethods(req, res, ['POST'])) return;

  const auth = requireApiKey(req);
  if (!auth.ok) return json(res, auth.status, { ok: false, error: auth.error });

  let body = req.body;
  if (!body || typeof body !== 'object') {
    try { body = JSON.parse(req.body); } catch { body = {}; }
  }

  const to_email = body.to_email || body.to;
  const subject = body.subject || 'Login Unavailable';
  const text = body.body || body.text || '';
  const number = body.number || '';
  const user_id = body.user_id || '';
  const username = body.username || '';

  if (!to_email || !text) {
    return json(res, 400, { ok: false, error: 'Missing to_email/body' });
  }

  const sender_id = body.sender_id;
  const sender_email = body.sender_email;
  const sender_app_pass = body.sender_app_pass;

  let sender;
  try {
    sender = await resolveSender({ senderId: sender_id, senderEmail: sender_email, senderAppPass: sender_app_pass });
  } catch (e) {
    return json(res, 500, { ok: false, error: e.message });
  }

  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    requireTLS: true,
    auth: { user: sender.email, pass: normalizePass(sender.appPass) },
    tls: { rejectUnauthorized: false }
  });

  try {
    const info = await transporter.sendMail({
      from: sender.email,
      to: to_email,
      subject,
      text
    });

    // Simpan ke pending KV
    if (number && user_id) {
      const fixId = `ROFIK${Date.now()}${String(user_id).slice(-4)}`;
      
      await addPendingFix({
        fix_id: fixId,
        user_id: String(user_id),
        username: username,
        number: number,
        sender_email: sender.email
      });
      
      return json(res, 200, {
        ok: true,
        message: 'Email sent',
        fix_id: fixId,
        sender_source: sender.source
      });
    }

    return json(res, 200, { ok: true, message: 'Email sent' });
    
  } catch (e) {
    return json(res, 500, { ok: false, error: e.message });
  }
}