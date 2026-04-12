import crypto from 'crypto';

function getKey() {
  const raw = process.env.MASTER_KEY;
  if (!raw) return null;
  // Accept 32+ chars passphrase OR 64-hex.
  const isHex = /^[0-9a-fA-F]{64}$/.test(raw);
  return isHex ? Buffer.from(raw, 'hex') : crypto.createHash('sha256').update(raw, 'utf8').digest();
}

export function encryptIfPossible(plain) {
  const key = getKey();
  if (!key) return { scheme: 'plain', value: plain };

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  // base64url-ish (safe in JSON)
  const packed = Buffer.concat([iv, tag, ciphertext]).toString('base64');
  return { scheme: 'aes-256-gcm', value: packed };
}

export function decryptIfNeeded(packedObj) {
  if (!packedObj) return null;
  if (typeof packedObj === 'string') return packedObj; // backward compat

  const { scheme, value } = packedObj;
  if (scheme === 'plain') return value;

  const key = getKey();
  if (!key) throw new Error('MASTER_KEY missing: cannot decrypt stored sender password');

  const buf = Buffer.from(value, 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ciphertext = buf.subarray(28);

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  return plain;
}
