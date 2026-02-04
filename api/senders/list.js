import { requireApiKey, json, onlyMethods, maskEmail } from '../_lib/auth.js';
import { getSenders, getActiveSenderId } from '../_lib/senders.js';

export default async function handler(req, res) {
  if (!onlyMethods(req, res, ['GET'])) return;
  const auth = requireApiKey(req);
  if (!auth.ok) return json(res, auth.status, { ok: false, error: auth.error });

  const senders = await getSenders();
  const activeId = await getActiveSenderId();

  return json(res, 200, {
    ok: true,
    active_sender_id: activeId,
    senders: senders.map(s => ({
      id: s.id,
      email: maskEmail(s.email),
      createdAt: s.createdAt,
      lastUsedAt: s.lastUsedAt,
      isActive: s.id === activeId
    }))
  });
}
