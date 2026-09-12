import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { env, isProduction } from '../config/env.js';
import { logger } from '../utils/logger.js';

let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (!env.SMTP_HOST) return null;
  transporter ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    ...(env.SMTP_USER ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASS ?? '' } } : {}),
  });
  return transporter;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export interface PasswordResetEmail {
  to: string;
  firstName: string;
  resetUrl: string;
  expiresInMinutes: number;
}

export const emailService = {
  /** SMTP sozlanmagan bo‘lsa: development’da havola logga yoziladi, production’da xatolik logga yoziladi. */
  async sendPasswordReset(email: PasswordResetEmail): Promise<void> {
    const mailer = getTransporter();

    if (!mailer) {
      if (isProduction) {
        logger.error({ to: email.to }, 'SMTP sozlanmagan — parolni tiklash xati yuborilmadi');
      } else {
        logger.info({ to: email.to, resetUrl: email.resetUrl }, 'SMTP sozlanmagan (development): parolni tiklash havolasi');
      }
      return;
    }

    const name = escapeHtml(email.firstName);
    const url = escapeHtml(email.resetUrl);

    await mailer.sendMail({
      from: env.SMTP_FROM,
      to: email.to,
      subject: 'Parolni tiklash',
      text:
        `Assalomu alaykum, ${email.firstName}!\n\n` +
        `Parolni tiklash uchun quyidagi havolani oching (${email.expiresInMinutes} daqiqa amal qiladi):\n${email.resetUrl}\n\n` +
        'Agar bu so‘rovni siz yubormagan bo‘lsangiz, xatni e’tiborsiz qoldiring.',
      html:
        `<p>Assalomu alaykum, ${name}!</p>` +
        `<p>Parolni tiklash uchun quyidagi tugmani bosing. Havola ${email.expiresInMinutes} daqiqa amal qiladi.</p>` +
        `<p><a href="${url}" style="display:inline-block;padding:10px 18px;background:#3354ec;color:#fff;border-radius:8px;text-decoration:none">Parolni tiklash</a></p>` +
        '<p style="color:#64748b;font-size:13px">Agar bu so‘rovni siz yubormagan bo‘lsangiz, xatni e’tiborsiz qoldiring.</p>',
    });
  },
};
