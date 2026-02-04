import { requireApiKey, json, onlyMethods, maskEmail } from '../_lib/auth.js';
import { addSender, validateEmail, validateAppPass } from '../_lib/senders.js';

export default async function handler(req, res) {
  if (!onlyMethods(req, res, ['POST'])) return;
  const auth = requireApiKey(req);
  if (!auth.ok) return json(res, auth.status, { ok: false, error: auth.error });

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    return json(res, 400, { ok: false, error: 'Invalid JSON body' });
  }

  const email = body?.email;
  const appPass = body?.app_password || body?.appPass || body?.pass;

  if (!email || !appPass) {
    return json(res, 400, {
      ok: false,
      error: 'Missing fields',
      hint: 'POST { "email": "you@gmail.com", "app_password": "xxxx xxxx xxxx xxxx" }'
    });
  }
  if (!validateEmail(email)) return json(res, 400, { ok: false, error: 'Invalid email' });
  if (!validateAppPass(appPass)) return json(res, 400, { ok: false, error: 'Invalid app_password (too short?)' });

  const { id } = await addSender({ email, appPass });
  return json(res, 200, {
    ok: true,
    id,
    email: maskEmail(String(email).trim()),
    note: process.env.MASTER_KEY ? 'stored_encrypted' : 'stored_plain (set MASTER_KEY to encrypt at rest)'
  });
}
