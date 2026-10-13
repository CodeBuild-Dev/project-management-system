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
const APP_BASE = process.env.APP_BASE_URL ?? process.env.FRONTEND_URL ?? 'http://localhost:8080';

export function mailerIsLive(): boolean {
  return isConfigured;
}

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

export function passwordResetMail(email: string, token: string): MailInput {
  const url = `${APP_BASE}/reset-password?token=${encodeURIComponent(token)}`;
  return {
    to: email,
    subject: 'Reset your Project Management password',
    text: `We received a request to reset your password. Follow this link within 60 minutes:\n\n${url}\n\nIf you did not request this, ignore this email.`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
        <h2 style="margin:0 0 12px;">Reset your password</h2>
        <p>We received a request to reset your Project Management password. Click the link below within 60 minutes to set a new one.</p>
        <p style="margin:24px 0;">
          <a href="${url}" style="display:inline-block; background:#7c3aed; color:#fff; padding:10px 20px; border-radius:8px; text-decoration:none; font-weight:600;">Reset password</a>
        </p>
        <p style="color:#64748b; font-size:13px;">If the button doesn't work, copy and paste this URL: <br><code>${url}</code></p>
        <p style="color:#64748b; font-size:13px; margin-top:24px;">If you didn't request this, you can safely ignore this email — your password won't change.</p>
      </div>
    `,
  };
}

/**
 * Sent when an admin creates a user account from Admin → Add user. The
 * user follows the link to set their own password (no plaintext credential
 * ever travels by email). Token TTL is 7 days — long enough for the
 * recipient to find the email, short enough that an unused link expires.
 */
export function welcomeMail(
  email: string,
  inviterEmail: string,
  token: string
): MailInput {
  const url = `${APP_BASE}/reset-password?token=${encodeURIComponent(token)}`;
  return {
    to: email,
    subject: 'Welcome to Project Management — set your password',
    text: `${inviterEmail} created a Project Management account for you.\n\nClick the link below to set your password and sign in. The link is valid for 7 days:\n\n${url}\n\nIf you weren't expecting this email, you can safely ignore it.`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
        <h2 style="margin:0 0 12px;">Welcome to Project Management</h2>
        <p><strong>${inviterEmail}</strong> created an account for you. Choose a password to finish setting it up — the link below is valid for 7 days.</p>
        <p style="margin:24px 0;">
          <a href="${url}" style="display:inline-block; background:#7c3aed; color:#fff; padding:10px 20px; border-radius:8px; text-decoration:none; font-weight:600;">Set your password</a>
        </p>
        <p style="color:#64748b; font-size:13px;">If the button doesn't work, copy this URL into your browser:<br><code>${url}</code></p>
        <p style="color:#64748b; font-size:13px; margin-top:24px;">If you weren't expecting this email, you can safely ignore it — nothing changes until you click the link.</p>
      </div>
    `,
  };
}

export function memberInviteMail(email: string, workspaceName: string, inviterEmail: string): MailInput {
  const url = `${APP_BASE}/login`;
  return {
    to: email,
    subject: `You've been invited to ${workspaceName} on Project Management`,
    text: `${inviterEmail} invited you to the ${workspaceName} workspace. Sign in at ${url} to accept.`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
        <h2 style="margin:0 0 12px;">You're invited</h2>
        <p><strong>${inviterEmail}</strong> invited you to the <strong>${workspaceName}</strong> workspace on Project Management.</p>
        <p style="margin:24px 0;">
          <a href="${url}" style="display:inline-block; background:#7c3aed; color:#fff; padding:10px 20px; border-radius:8px; text-decoration:none; font-weight:600;">Open Project Management</a>
        </p>
        <p style="color:#64748b; font-size:13px;">New here? Create an account with this email address at <code>${url.replace('/login', '/register')}</code>.</p>
      </div>
    `,
  };
}
