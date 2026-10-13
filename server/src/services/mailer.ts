import sgMail from '@sendgrid/mail';

/**
 * Email transport. Uses SendGrid when SENDGRID_API_KEY is configured;
 * otherwise logs to stdout so the dev flow (forgot-password, invites) still
 * works end-to-end without live credentials.
 *
 * Required env:
 *   SENDGRID_API_KEY         — SG.* key
 *   MAIL_FROM                — verified sender (default: no-reply@example.com)
 *   APP_BASE_URL             — frontend origin used in link construction
 */

const apiKey = process.env.SENDGRID_API_KEY;
const isConfigured = !!apiKey && apiKey.startsWith('SG.');

if (isConfigured) {
  sgMail.setApiKey(apiKey!);
}

const FROM = process.env.MAIL_FROM ?? 'no-reply@example.com';

export interface MailInput {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/**
 * Send an email. Returns true when the provider accepted it (or in dev, when
 * we logged it successfully); never throws — a mail failure should not
 * propagate to block the originating business operation.
 */
export async function sendMail(input: MailInput): Promise<boolean> {
  if (!isConfigured) {
    console.log(`[mailer:dev] to=${input.to} subj="${input.subject}"\n${input.text}`);
    return true;
  }
  try {
    await sgMail.send({
      to: input.to,
      from: FROM,
      subject: input.subject,
      text: input.text,
      html: input.html,
    });
    return true;
  } catch (err) {
    console.error('[mailer] send failed', err);
    return false;
  }
}

// --- Templates ---
