const nodemailer = require('nodemailer');

const hasSmtpConfig = () =>
  Boolean(process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.SMTP_USER && process.env.SMTP_PASS);

const createTransporter = () => {
  if (!hasSmtpConfig()) {
    return null;
  }

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
};

const sendEmail = async ({ to, subject, html, text }) => {
  const from = process.env.EMAIL_FROM || process.env.SMTP_USER || 'no-reply@attendance.local';
  const transporter = createTransporter();

  if (!transporter) {
    console.log('Email transport not configured. Previewing email payload instead.');
    console.log({ to, subject, text, html });
    return { delivered: false, preview: true };
  }

  const info = await transporter.sendMail({ from, to, subject, text, html });
  return { delivered: true, messageId: info.messageId };
};

module.exports = { sendEmail };
