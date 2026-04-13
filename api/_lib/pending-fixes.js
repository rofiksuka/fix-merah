import { kv } from '@vercel/kv';

const KEY_PENDING = 'pending_fixes';

export async function addPendingFix(data) {
  const list = await getPendingFixes();
  const item = {
    ...data,
    status: 'pending',
    created_at: new Date().toISOString(),
    replied_at: null
  };
  
  list.push(item);
  
  // Keep only last 3 days
  const threeDaysAgo = Date.now() - 3 * 24 * 60 * 60 * 1000;
  const filtered = list.filter(f => new Date(f.created_at).getTime() > threeDaysAgo);
  
  await kv.set(KEY_PENDING, filtered);
  return item;
}

export async function getPendingFixes() {
  const list = await kv.get(KEY_PENDING);
  return Array.isArray(list) ? list : [];
}

export async function updatePendingFix(fixId, updates) {
  const list = await getPendingFixes();
  const index = list.findIndex(f => f.fix_id === fixId);
  if (index !== -1) {
    list[index] = { ...list[index], ...updates };
    await kv.set(KEY_PENDING, list);
    return true;
  }
  return false;
}

export async function getPendingFixByNumber(number, senderEmail) {
  const list = await getPendingFixes();
  const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
  return list.find(f => 
    f.number === number && 
    f.sender_email === senderEmail &&
    f.status === 'pending' &&
    new Date(f.created_at).getTime() > oneDayAgo
  );
}