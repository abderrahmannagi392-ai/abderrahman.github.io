import nodemailer from 'nodemailer';

interface EmailDispatchParams {
  to: string;
  subject: string;
  html: string;
  method?: 'link' | 'otp';
}

interface SendPasswordResetParams {
  to: string;
  name?: string;
  method: 'link' | 'otp';
  lang?: 'ar' | 'fr' | 'en';
  resetUrl?: string;
  otp?: string;
}

interface SendVerificationEmailParams {
  to: string;
  name?: string;
  method: 'link' | 'otp';
  lang?: 'ar' | 'fr' | 'en';
  verifyUrl?: string;
  otp?: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getSmtpTransporter() {
  const host = (process.env.SMTP_HOST || '').trim();
  const user = (process.env.SMTP_USER || '').trim();
  const pass = (process.env.SMTP_PASS || '').trim();
  if (!host || !user || !pass) return null;
  const port = Number(process.env.SMTP_PORT || 587);
  const secure =
    String(process.env.SMTP_SECURE || '').toLowerCase() === 'true' || port === 465;
  return nodemailer.createTransport({
    host,
    port: Number.isFinite(port) && port > 0 ? port : 587,
    secure,
    auth: { user, pass },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 12000,
  });
}

async function dispatchTransactionalEmail(
  params: EmailDispatchParams
): Promise<{ delivered: boolean; channel: 'smtp' | 'resend' | 'webhook' | 'none' }> {
  const fromAddress =
    (process.env.EMAIL_FROM || '').trim() || 'Tedribi <no-reply@tadribi.chtbqi.com>';

  const transporter = getSmtpTransporter();
  if (transporter) {
    try {
      await transporter.sendMail({
        from: fromAddress,
        to: params.to,
        subject: params.subject,
        html: params.html,
      });
      return { delivered: true, channel: 'smtp' };
    } catch (err: any) {
      console.error('[mailer] SMTP dispatch failed:', err?.code || err?.message || 'error');
    }
  }

  const resendKey = (process.env.RESEND_API_KEY || '').trim();
  if (resendKey) {
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: fromAddress,
          to: [params.to],
          subject: params.subject,
          html: params.html,
        }),
      });
      if (response.ok) {
        return { delivered: true, channel: 'resend' };
      }
      console.error('[mailer] Resend dispatch status:', response.status);
    } catch (err: any) {
      console.error('[mailer] Resend dispatch failed:', err?.message || 'error');
    }
  }

  const webhookUrl = (process.env.SMTP_WEBHOOK_URL || '').trim();
  if (webhookUrl) {
    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: params.to,
          from: fromAddress,
          subject: params.subject,
          html: params.html,
          method: params.method || 'otp',
        }),
      });
      if (response.ok) {
        return { delivered: true, channel: 'webhook' };
      }
    } catch (err: any) {
      console.error('[mailer] Webhook dispatch failed:', err?.message || 'error');
    }
  }

  return { delivered: false, channel: 'none' };
}

export function isMailDeliveryConfigured(): boolean {
  const smtpOk = Boolean(
    (process.env.SMTP_HOST || '').trim() &&
      (process.env.SMTP_USER || '').trim() &&
      (process.env.SMTP_PASS || '').trim()
  );
  return (
    smtpOk ||
    Boolean((process.env.RESEND_API_KEY || '').trim()) ||
    Boolean((process.env.SMTP_WEBHOOK_URL || '').trim())
  );
}

export async function sendPasswordResetEmail(
  params: SendPasswordResetParams
): Promise<{ delivered: boolean; channel: string }> {
  const isFr = params.lang === 'fr';
  const subject = isFr
    ? params.method === 'otp'
      ? 'Code de vérification (OTP) – Tedribi'
      : 'Réinitialisation du mot de passe – Tedribi'
    : params.method === 'otp'
      ? 'رمز التحقق لاستعادة كلمة المرور – منصة تدريبي'
      : 'استعادة كلمة المرور – منصة تدريبي';

  const safeName = escapeHtml(params.name || (isFr ? 'Apprenant' : 'متدربنا العزيز'));
  const html =
    params.method === 'otp'
      ? `<div dir="${isFr ? 'ltr' : 'rtl'}" style="font-family:Tahoma,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;background:#f8f9f5;border:1px solid #d6dacb;border-radius:8px;color:#3a4650;">
          <h2 style="color:#7c9e1c;margin-top:0;">${isFr ? 'Code de vérification' : 'رمز التحقق لاستعادة كلمة المرور'}</h2>
          <p>${isFr ? `Bonjour ${safeName},` : `مرحباً ${safeName}،`}</p>
          <p>${isFr ? 'Utilisez le code ci-dessous pour réinitialiser votre mot de passe (valide 10 minutes) :' : 'استخدم رمز التحقق التالي لإعادة تعيين كلمة المرور (صالح لمدة 10 دقائق فقط):'}</p>
          <div style="font-size:28px;font-weight:700;letter-spacing:6px;text-align:center;background:#ffffff;border:2px dashed #a4cc39;border-radius:6px;padding:14px;margin:18px 0;color:#2b3a1a;" dir="ltr">${escapeHtml(params.otp || '')}</div>
          <p style="font-size:12px;color:#6f7468;">${isFr ? "Si vous n'avez pas demandé cette réinitialisation, ignorez cet e-mail." : 'إذا لم تطلب استعادة كلمة المرور، يمكنك تجاهل هذه الرسالة.'}</p>
        </div>`
      : `<div dir="${isFr ? 'ltr' : 'rtl'}" style="font-family:Tahoma,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;background:#f8f9f5;border:1px solid #d6dacb;border-radius:8px;color:#3a4650;">
          <h2 style="color:#7c9e1c;margin-top:0;">${isFr ? 'Réinitialisation du mot de passe' : 'رابط استعادة كلمة المرور'}</h2>
          <p>${isFr ? `Bonjour ${safeName},` : `مرحباً ${safeName}،`}</p>
          <p>${isFr ? 'Cliquez sur le bouton ci-dessous pour définir un nouveau mot de passe (lien à usage unique valide 10 minutes) :' : 'اضغط على الزر التالي لتعيين كلمة مرور جديدة (رابط للاستخدام مرة واحدة وصالح لمدة 10 دقائق فقط):'}</p>
          <p style="text-align:center;margin:22px 0;">
            <a href="${escapeHtml(params.resetUrl || '')}" style="display:inline-block;background:#a4cc39;color:#2b3a1a;font-weight:700;text-decoration:none;padding:12px 26px;border-radius:4px;border:1px solid #7c9e1c;">${isFr ? 'Réinitialiser le mot de passe' : 'تعيين كلمة مرور جديدة'}</a>
          </p>
          <p style="font-size:12px;color:#6f7468;">${isFr ? "Si vous n'avez pas demandé cette réinitialisation, ignorez cet e-mail." : 'إذا لم تطلب استعادة كلمة المرور، يمكنك تجاهل هذه الرسالة.'}</p>
        </div>`;

  return dispatchTransactionalEmail({
    to: params.to,
    subject,
    html,
    method: params.method,
  });
}

export async function sendEmailVerificationEmail(
  params: SendVerificationEmailParams
): Promise<{ delivered: boolean; channel: string }> {
  const isFr = params.lang === 'fr';
  const subject = isFr
    ? 'Code de vérification de votre compte – Tedribi'
    : 'رمز التحقق من البريد الإلكتروني – منصة تدريبي';
  const safeName = escapeHtml(params.name || (isFr ? 'Apprenant' : 'متدربنا العزيز'));

  const html =
    params.method === 'otp'
      ? `<div dir="${isFr ? 'ltr' : 'rtl'}" style="font-family:Tahoma,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;background:#f8f9f5;border:1px solid #d6dacb;border-radius:8px;color:#3a4650;">
          <h2 style="color:#7c9e1c;margin-top:0;">${isFr ? 'Vérification de votre adresse e-mail' : 'تأكيد البريد الإلكتروني'}</h2>
          <p>${isFr ? `Bonjour ${safeName},` : `مرحباً ${safeName}،`}</p>
          <p>${isFr ? 'Saisissez ce code à 6 chiffres dans la plateforme pour confirmer votre compte (valide 10 minutes) :' : 'أدخل رمز التحقق المكون من 6 أرقام في المنصة لتأكيد بريدك الإلكتروني (صالح لمدة 10 دقائق فقط):'}</p>
          <div style="font-size:28px;font-weight:700;letter-spacing:6px;text-align:center;background:#ffffff;border:2px dashed #a4cc39;border-radius:6px;padding:14px;margin:18px 0;color:#2b3a1a;" dir="ltr">${escapeHtml(params.otp || '')}</div>
          <p style="font-size:12px;color:#6f7468;">${isFr ? "Ne partagez jamais ce code avec un tiers." : 'لا تشارك هذا الرمز مع أي شخص آخر.'}</p>
        </div>`
      : `<div dir="${isFr ? 'ltr' : 'rtl'}" style="font-family:Tahoma,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;background:#f8f9f5;border:1px solid #d6dacb;border-radius:8px;color:#3a4650;">
          <h2 style="color:#7c9e1c;margin-top:0;">${isFr ? 'Lien de vérification' : 'رابط تفعيل الحساب'}</h2>
          <p>${isFr ? `Bonjour ${safeName},` : `مرحباً ${safeName}،`}</p>
          <p style="text-align:center;margin:22px 0;">
            <a href="${escapeHtml(params.verifyUrl || '')}" style="display:inline-block;background:#a4cc39;color:#2b3a1a;font-weight:700;text-decoration:none;padding:12px 26px;border-radius:4px;border:1px solid #7c9e1c;">${isFr ? 'Confirmer mon e-mail' : 'تأكيد البريد الإلكتروني'}</a>
          </p>
        </div>`;

  return dispatchTransactionalEmail({
    to: params.to,
    subject,
    html,
    method: params.method,
  });
}
