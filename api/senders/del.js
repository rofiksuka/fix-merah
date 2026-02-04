import { requireApiKey, json, onlyMethods } from '../_lib/auth.js';
import { deleteSender } from '../_lib/senders.js';

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

  const result = await deleteSender(String(id));
  if (!result.deleted) return json(res, 404, { ok: false, error: 'Not found' });
  return json(res, 200, { ok: true, deleted: true });
}
