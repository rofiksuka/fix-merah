import { requireApiKey, json, onlyMethods } from '../_lib/auth.js';
import { getSenders, setActiveSenderId } from '../_lib/senders.js';

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

  const id = body?.id;
  if (!id) {
    return json(res, 400, { ok: false, error: 'Missing id', hint: 'POST {"id":"..."}' });
  }

  const senders = await getSenders();
  const exists = senders.some(s => s?.id === String(id));
  if (!exists) return json(res, 404, { ok: false, error: 'sender not found' });

  await setActiveSenderId(String(id));
  return json(res, 200, { ok: true, active_sender_id: String(id) });
}
