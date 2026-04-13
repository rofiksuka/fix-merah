import Imap from 'imap';
import { simpleParser } from 'mailparser';
import { getSenders } from './_lib/senders.js';
import { getPendingFixes, updatePendingFix } from './_lib/pending-fixes.js';
import { decryptIfNeeded } from './_lib/crypto.js';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

// Kirim notif ke user Telegram
async function sendTelegramNotif(userId, number, fixId) {
  if (!TELEGRAM_BOT_TOKEN) return false;
  
  const text = `Ã¢ÂÂ <b>NOMOR DIBALAS WHATSAPP!</b>\n\nNomor: <code>${number}</code>\nFix ID: <code>${fixId}</code>\n\nÃ°ÂÂÂ Coba login WhatsApp sekarang.`;
  
  try {
    await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: userId, text, parse_mode: 'HTML' })
    });
    return true;
  } catch {
    return false;
  }
}

// Extract nomor dari subject/body email balasan
function extractNumber(text) {
  const patterns = [
    /62[0-9]{9,13}/g,
    /\+62[0-9]{9,13}/g,
    /0[0-9]{9,12}/g,
    /[0-9]{10,15}/g
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      let num = match[0].replace(/\D/g, '');
      if (num.startsWith('0')) num = '62' + num.slice(1);
      if (num.startsWith('8')) num = '62' + num;
      if (num.length >= 10 && num.length <= 15) return num;
    }
  }
  return null;
}

// Cek inbox satu sender
async function checkSenderInbox(sender) {
  return new Promise((resolve) => {
    const email = sender.email;
    const appPass = typeof sender.appPass === 'string' 
      ? sender.appPass 
      : decryptIfNeeded(sender.appPass);

    const imap = new Imap({
      user: email,
      password: appPass,
      host: 'imap.gmail.com',
      port: 993,
      tls: true,
      tlsOptions: { rejectUnauthorized: false },
      connTimeout: 15000,
      authTimeout: 15000
    });

    const replies = [];

    imap.once('ready', () => {
      imap.openBox('INBOX', false, (err) => {
        if (err) {
          imap.end();
          return resolve([]);
        }

        // Cari email dari support@support.whatsapp.com yang UNSEEN
        imap.search([['FROM', 'support@support.whatsapp.com'], 'UNSEEN'], (err, results) => {
          if (err || !results.length) {
            imap.end();
            return resolve([]);
          }

          const fetch = imap.fetch(results, {
            bodies: ['HEADER.FIELDS (FROM SUBJECT)', 'TEXT'],
            struct: true
          });

          fetch.on('message', (msg) => {
            let subject = '';
            let body = '';

            msg.on('body', (stream, info) => {
              stream.on('data', (chunk) => {
                if (info.which === 'TEXT') body += chunk.toString('utf8');
                else subject += chunk.toString('utf8');
              });
            });

            msg.once('end', () => {
              const fullText = subject + ' ' + body;
              const number = extractNumber(fullText);
              
              if (number) {
                replies.push({
                  number,
                  subject: subject.split('\n')[0] || '',
                  body: body.substring(0, 500)
                });
              }
            });
          });

          fetch.once('error', () => imap.end());
          fetch.once('end', () => imap.end());
        });
      });
    });

    imap.once('error', () => resolve([]));
    imap.once('end', () => resolve(replies));
    imap.connect();
  });
}

export default async function handler(req, res) {
  const apiKey = req.headers['x-api-key'] || req.query.api_key;
  if (apiKey !== process.env.API_KEY) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }

  const results = [];
  
  try {
    const senders = await getSenders();
    
    for (const sender of senders) {
      const replies = await checkSenderInbox(sender);
      
      for (const reply of replies) {
        const pending = await getPendingFixByNumber(reply.number, sender.email);
        
        if (pending) {
          await updatePendingFix(pending.fix_id, {
            status: 'replied',
            replied_at: new Date().toISOString()
          });
          
          await sendTelegramNotif(pending.user_id, reply.number, pending.fix_id);
          
          results.push({
            fix_id: pending.fix_id,
            number: reply.number,
            user_id: pending.user_id,
            notified: true
          });
        }
      }
    }
    
    return res.status(200).json({ ok: true, results });
    
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
}