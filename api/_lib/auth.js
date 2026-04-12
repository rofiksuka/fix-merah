export function requireApiKey(req) {
  const expected = process.env.API_KEY;
  if (!expected) {
    return { ok: false, status: 500, error: 'Server misconfigured: API_KEY env not set' };
  }
  const provided = req.headers['x-api-key'] || req.headers['X-API-Key'];
  if (!provided || provided !== expected) {
    return { ok: false, status: 401, error: 'Unauthorized' };
  }
  return { ok: true };
}

export function json(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(data, null, 2));
}

export function onlyMethods(req, res, methods) {
  const allowed = new Set(methods);
  if (!allowed.has(req.method)) {
    res.statusCode = 405;
    res.setHeader('Allow', methods.join(', '));
    res.end('Method Not Allowed');
    return false;
  }
  return true;
}

export function maskEmail(email) {
  if (!email || typeof email !== 'string' || !email.includes('@')) return '***';
  const [user, domain] = email.split('@');
  const safeUser = user.length <= 2 ? user[0] + '*' : user.slice(0, 2) + '*'.repeat(Math.min(10, user.length - 2));
  return `${safeUser}@${domain}`;
}
