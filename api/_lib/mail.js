import nodemailer from 'nodemailer';

function normalizePass(p) {
  return String(p || '').replace(/\s+/g, '');
}

export function createTransport(sender) {
  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    requireTLS: true,
    auth: { user: sender.email, pass: normalizePass(sender.appPass) },
    tls: { rejectUnauthorized: false },
    connectionTimeout: 30000,
    socketTimeout: 30000
  });
}

export async function sendTextMail({ sender, to, subject, text }) {
  const transporter = createTransport(sender);
  return transporter.sendMail({
    from: sender.email,
    to,
    subject,
    text
  });
}
