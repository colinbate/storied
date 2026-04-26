import { APP_NAME, APP_SUBTITLE, NOTIFICATION_FROM_ADDRESS } from '$shared/brand';

interface EmailOptions {
	to: string;
	subject: string;
	textBody: string;
	htmlBody?: string;
}

const FROM_ADDRESS = NOTIFICATION_FROM_ADDRESS;
const FROM_NAME = 'Bermuda Triangle Society';

/**
 * Send an email using the Cloudflare Email Sending Workers API.
 * If SEND_EMAILS env var is not set or falsy, logs the email instead.
 */
export async function sendEmail(
	platform: App.Platform,
	options: EmailOptions
): Promise<{ success: boolean; error?: string }> {
	const sendEnabled = platform.env.SEND_EMAILS;

	if (!sendEnabled) {
		console.log('[EMAIL DISABLED] Would send:', {
			to: options.to,
			subject: options.subject,
			text: options.textBody.substring(0, 220)
		});
		return { success: true };
	}

	try {
		// The Cloudflare SendEmail binding supports a builder overload
		// with from, to, subject, text, html fields directly.
		await platform.env.EMAIL.send({
			from: { name: FROM_NAME, email: FROM_ADDRESS },
			to: options.to,
			subject: options.subject,
			text: options.textBody,
			html: options.htmlBody
		});

		return { success: true };
	} catch (err) {
		const error = err instanceof Error ? err.message : 'Unknown error';
		console.error('[EMAIL ERROR]', error);
		return { success: false, error };
	}
}

/** Send a magic link email */
export async function sendMagicLinkEmail(
	platform: App.Platform,
	email: string,
	token: string,
	code: string,
	baseUrl: string
): Promise<{ success: boolean; error?: string }> {
	const magicUrl = `${baseUrl}/auth/verify?token=${encodeURIComponent(token)}`;
	const displayCode = `${code.slice(0, 3)} ${code.slice(3)}`;

	return sendEmail(platform, {
		to: email,
		subject: `Sign in to ${APP_NAME}`,
		textBody: `Click the link below to sign in to ${APP_NAME}.\n\n${magicUrl}\n\nOr enter this code on the sign-in page if you're on a different device:\n\n${displayCode}\n\nThe link and code expire in 15 minutes and can only be used once.\n\nIf you didn't request this, you can safely ignore this email.`,
		htmlBody: `
      <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 16px;">
        <p style="color: #888; font-size: 13px; margin-bottom: 4px;">${APP_SUBTITLE}</p>
        <h2 style="color: #1a1a2e; margin-bottom: 24px;">Sign in to ${APP_NAME}</h2>
        <p style="color: #444; line-height: 1.6;">Click the button below to sign in:</p>
        <div style="margin: 32px 0; text-align: center;">
          <a href="${magicUrl}" style="display: inline-block; background: #6d28d9; color: white; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: 600;">
            Sign In
          </a>
        </div>
        <p style="color: #444; line-height: 1.6; text-align: center; margin: 32px 0 8px;">
          Or if you are on a different device, enter this code on the sign-in page:
        </p>
        <p style="text-align: center; font-size: 28px; font-weight: 700; letter-spacing: 6px; color: #1a1a2e; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; margin: 0 0 32px;">
          ${displayCode}
        </p>
        <p style="color: #888; font-size: 14px; line-height: 1.5;">
          Or copy and paste this URL into your browser:<br>
          <a href="${magicUrl}" style="color: #6d28d9; word-break: break-all;">${magicUrl}</a>
        </p>
        <p style="color: #888; font-size: 13px; margin-top: 32px;">The link and code expire in 15 minutes and can only be used once. If you didn't request this, you can safely ignore this email.</p>
      </div>
    `.trim()
	});
}

/** Send an invitation email */
export async function sendInviteEmail(
	platform: App.Platform,
	email: string,
	inviteUrl: string
): Promise<{ success: boolean; error?: string }> {
	return sendEmail(platform, {
		to: email,
		subject: `Invitation to ${APP_NAME}`,
		textBody: `You've been invited to join ${APP_NAME}, ${APP_SUBTITLE}.\n\nUse this invitation link to sign in:\n\n${inviteUrl}\n\nIf you weren't expecting this, you can safely ignore this email.`,
		htmlBody: `
      <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 16px;">
        <h2 style="color: #1a1a2e; margin-bottom: 24px;">You're invited</h2>
        <p style="color: #444; line-height: 1.6;">Use the button below to join ${APP_NAME}, ${APP_SUBTITLE}:</p>
        <div style="margin: 32px 0; text-align: center;">
          <a href="${inviteUrl}" style="display: inline-block; background: #6d28d9; color: white; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: 600;">
            Accept Invitation
          </a>
        </div>
        <p style="color: #888; font-size: 14px; line-height: 1.5;">
          Or copy and paste this URL into your browser:<br>
          <a href="${inviteUrl}" style="color: #6d28d9; word-break: break-all;">${inviteUrl}</a>
        </p>
        <p style="color: #888; font-size: 13px; margin-top: 32px;">If you weren't expecting this, you can safely ignore this email.</p>
      </div>
    `.trim()
	});
}

/** Notify a pending member that their account has been approved. */
export async function sendAccountApprovedEmail(
	platform: App.Platform,
	email: string,
	loginUrl: string
): Promise<{ success: boolean; error?: string }> {
	return sendEmail(platform, {
		to: email,
		subject: `Your account for ${APP_NAME} is ready`,
		textBody: `Your account for ${APP_NAME}, ${APP_SUBTITLE}, has been approved.\n\nYou can sign in here:\n\n${loginUrl}\n\nIf you no longer want to join, you can ignore this email.`,
		htmlBody: `
      <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 16px;">
        <p style="color: #888; font-size: 13px; margin-bottom: 4px;">${APP_SUBTITLE}</p>
        <h2 style="color: #1a1a2e; margin-bottom: 24px;">Your account is ready</h2>
        <p style="color: #444; line-height: 1.6;">Your membership request has been approved. You can sign in below:</p>
        <div style="margin: 32px 0; text-align: center;">
          <a href="${loginUrl}" style="display: inline-block; background: #6d28d9; color: white; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: 600;">
            Sign In
          </a>
        </div>
        <p style="color: #888; font-size: 14px; line-height: 1.5;">
          Or copy and paste this URL into your browser:<br>
          <a href="${loginUrl}" style="color: #6d28d9; word-break: break-all;">${loginUrl}</a>
        </p>
      </div>
    `.trim()
	});
}

/** Notify an admin that a new signup is pending approval. */
export async function sendPendingSignupAlertEmail(
	platform: App.Platform,
	email: string,
	member: { email: string; displayName: string },
	adminUrl: string
): Promise<{ success: boolean; error?: string }> {
	return sendEmail(platform, {
		to: email,
		subject: `New signup pending approval for ${APP_NAME}`,
		textBody: `${member.displayName} <${member.email}> has confirmed their email and is waiting for approval.\n\nReview pending members here:\n\n${adminUrl}`,
		htmlBody: `
      <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 16px;">
        <p style="color: #888; font-size: 13px; margin-bottom: 4px;">${APP_SUBTITLE}</p>
        <h2 style="color: #1a1a2e; margin-bottom: 24px;">New signup pending approval</h2>
        <p style="color: #444; line-height: 1.6;">
          <strong>${member.displayName}</strong> &lt;${member.email}&gt; has confirmed their email and is waiting for approval.
        </p>
        <div style="margin: 32px 0; text-align: center;">
          <a href="${adminUrl}" style="display: inline-block; background: #6d28d9; color: white; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: 600;">
            Review Pending Members
          </a>
        </div>
        <p style="color: #888; font-size: 14px; line-height: 1.5;">
          Or copy and paste this URL into your browser:<br>
          <a href="${adminUrl}" style="color: #6d28d9; word-break: break-all;">${adminUrl}</a>
        </p>
      </div>
    `.trim()
	});
}
