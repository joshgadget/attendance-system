const nodemailer = require('nodemailer');

const hasSmtpConfig = () =>
  Boolean(process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.SMTP_USER && process.env.SMTP_PASS);

const hasBrevoApiConfig = () => Boolean(process.env.BREVO_API_KEY);

const parseSender = () => {
  const rawFrom = process.env.EMAIL_FROM || process.env.SMTP_USER || 'Attendance System <no-reply@attendance.local>';
  const match = rawFrom.match(/^(.*)<(.+)>$/);

  if (!match) {
    return { name: 'Attendance System', email: rawFrom.trim() };
  }

  return {
    name: match[1].trim().replace(/^"|"$/g, '') || 'Attendance System',
    email: match[2].trim(),
  };
};

const createTransporter = () => {
  if (!hasSmtpConfig()) {
    return null;
  }

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: Number(process.env.SMTP_PORT) === 465,
    connectionTimeout: 15000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
};

const sendEmail = async ({ to, subject, html, text }) => {
  const from = process.env.EMAIL_FROM || process.env.SMTP_USER || 'no-reply@attendance.local';

  if (hasBrevoApiConfig()) {
    const sender = parseSender();
    console.log(`Attempting Brevo API email delivery to ${to} with subject "${subject}"`);

    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'api-key': process.env.BREVO_API_KEY,
      },
      body: JSON.stringify({
        sender,
        to: [{ email: to }],
        subject,
        headers: {
          'X-Mailin-track': '0',
        },
        ...(html ? { htmlContent: html } : { textContent: text }),
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Brevo API send failed: ${response.status} ${errorBody}`);
    }

    const result = await response.json();
    console.log(`Brevo API delivered email to ${to} with messageId ${result.messageId}`);
    return { delivered: true, messageId: result.messageId, provider: 'brevo-api' };
  }

  const transporter = createTransporter();

  if (!transporter) {
    console.log('Email transport not configured. Previewing email payload instead.');
    console.log({ to, subject, text, html });
    return { delivered: false, preview: true };
  }

  console.log(`Attempting email delivery to ${to} with subject "${subject}"`);
  const info = await transporter.sendMail({ from, to, subject, text, html });
  console.log(`Email delivered to ${to} with messageId ${info.messageId}`);
  return { delivered: true, messageId: info.messageId };
};

module.exports = { sendEmail };
