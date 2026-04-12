import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { decryptIfNeeded } from './crypto.js';
import { getSenders } from './senders.js';

function normalizePass(p) {
  return String(p || '').replace(/\s+/g, '');
}

function buildImapConfig(email, appPass) {
  return {
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: {
      user: email,
      pass: normalizePass(appPass)
    },
    logger: false
  };
}

export async function getInboxAccounts() {
  const accounts = [];
  const seen = new Set();

  const list = await getSenders();
  for (const sender of list) {
    try {
      const pass = decryptIfNeeded(sender.appPass);
      const key = `${sender.email}::${pass}`;
      if (!sender.email || !pass || seen.has(key)) continue;
      seen.add(key);
      accounts.push({
        email: sender.email,
        appPass: pass,
        senderId: sender.id,
        source: 'kv'
      });
    } catch {
      // skip invalid sender
    }
  }

  if (process.env.GMAIL_USER && process.env.GMAIL_PASS) {
    const key = `${process.env.GMAIL_USER}::${process.env.GMAIL_PASS}`;
    if (!seen.has(key)) {
      seen.add(key);
      accounts.push({
        email: process.env.GMAIL_USER,
        appPass: process.env.GMAIL_PASS,
        senderId: null,
        source: 'env_default'
      });
    }
  }

  return accounts;
}

export async function fetchRecentReplies(account, options = {}) {
  const max = Number(options.max || 10);
  const client = new ImapFlow(buildImapConfig(account.email, account.appPass));
  const items = [];

  try {
    await client.connect();
    await client.mailboxOpen('INBOX');

    const total = client.mailbox.exists || 0;
    if (!total) return [];
    const start = Math.max(1, total - max + 1);

    for await (const msg of client.fetch(`${start}:${total}`, { uid: true, envelope: true, source: true })) {
      const parsed = await simpleParser(msg.source);
      items.push({
        uid: msg.uid,
        inboxEmail: account.email,
        messageId: parsed.messageId || msg.envelope?.messageId || null,
        inReplyTo: parsed.inReplyTo || null,
        references: Array.isArray(parsed.references) ? parsed.references : parsed.references ? [parsed.references] : [],
        from: parsed.from?.text || null,
        subject: parsed.subject || msg.envelope?.subject || '',
        date: parsed.date ? parsed.date.toISOString() : null,
        text: parsed.text || parsed.html || '',
        html: parsed.html || null
      });
    }
  } finally {
    try { await client.logout(); } catch {}
  }

  return items;
}
