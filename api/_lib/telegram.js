function buildBotUrl() {
  const username = process.env.BOT_USERNAME;
  if (!username) return null;
  return `https://t.me/${username}`;
}

export async function sendTelegramFixUpdate(job, status, extra = {}) {
  const token = process.env.BOT_TOKEN;
  if (!token) throw new Error('BOT_TOKEN env not set');
  if (!job?.telegramChatId) throw new Error('telegramChatId missing in job');

  const lines = [
    'â UPDATE FIX MERAH',
    '',
    `ID : ${job.fixId}`,
    `NOMOR : ${job.maskedNumber || '***'}`,
    `STATUS : ${String(status || job.status || 'replied').toUpperCase()}`
  ];

  if (extra.replyFrom) lines.push(`DARI : ${extra.replyFrom}`);
  if (extra.replyDate) lines.push(`WAKTU : ${extra.replyDate}`);
  if (extra.replySnippet) {
    lines.push('');
    lines.push('BALASAN :');
    lines.push(String(extra.replySnippet).slice(0, 500));
  }

  const payload = {
    chat_id: job.telegramChatId,
    text: lines.join('\n')
  };

  const botUrl = buildBotUrl();
  if (botUrl) {
    payload.reply_markup = {
      inline_keyboard: [[{ text: 'FIX MERAH', url: botUrl }]]
    };
  }

  const resp = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || data?.ok === false) {
    throw new Error(data?.description || `Telegram send failed with status ${resp.status}`);
  }

  return data;
}
