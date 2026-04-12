import { requireApiKey, json, onlyMethods } from './_lib/auth.js';
import { resolveSender } from './_lib/senders.js';
import { getBody } from './_lib/request.js';
import { sendTextMail } from './_lib/mail.js';
import { buildFixId, maskNumber, saveFixJob } from './_lib/fix-jobs.js';

export default async function handler(req, res) {
  if (!onlyMethods(req, res, ['POST'])) return;

  const auth = requireApiKey(req);
  if (!auth.ok) return json(res, auth.status, { ok: false, error: auth.error });

  let body = {};
  try {
    body = await getBody(req);
  } catch (e) {
    return json(res, 400, { ok: false, error: e.message });
  }

  const to = body.to_email || body.to || 'support@support.whatsapp.com';
  const number = String(body.number || '').trim();
  const subject = String(body.subject || '').trim();
  const text = String(body.body || body.text || '').trim();
  const telegramUserId = body.telegramUserId || body.telegram_user_id || null;
  const telegramChatId = body.telegramChatId || body.telegram_chat_id || telegramUserId || null;
  const username = body.username || null;
  const displayName = body.displayName || body.display_name || null;

  if (!number || !subject || !text) {
    return json(res, 400, { ok: false, error: 'Missing number/subject/body' });
  }
  if (!telegramChatId) {
    return json(res, 400, { ok: false, error: 'Missing telegramChatId or telegramUserId' });
  }

  const sender_id = body.sender_id || body.senderId;
  const sender_email = body.sender_email;
  const sender_app_pass = body.sender_app_pass;

  let sender;
  try {
    sender = await resolveSender({
      senderId: sender_id,
      senderEmail: sender_email,
      senderAppPass: sender_app_pass
    });
  } catch (e) {
    return json(res, 500, { ok: false, error: e.message });
  }

  const fixId = buildFixId(body.fixPrefix || 'FYN');
  const maskedNumber = maskNumber(number);

  try {
    const info = await sendTextMail({ sender, to, subject, text });

    const job = await saveFixJob({
      fixId,
      toEmail: to,
      number,
      maskedNumber,
      subject,
      text,
      telegramUserId,
      telegramChatId,
      username,
      displayName,
      senderEmail: sender.email,
      senderId: sender.senderId || null,
      senderSource: sender.source,
      outboundMessageId: info.messageId,
      status: 'sent'
    });

    return json(res, 200, {
      ok: true,
      message: 'Fix job created and email sent',
      fixId: job.fixId,
      status: job.status,
      numberMasked: job.maskedNumber,
      messageId: job.outboundMessageId,
      sender_source: sender.source,
      sender_id: sender.senderId || null
    });
  } catch (e) {
    return json(res, 500, { ok: false, error: e.message, fixId });
  }
}
