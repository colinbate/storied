interface EmailOptions {
	to: string;
	subject: string;
	textBody: string;
	htmlBody?: string;
}

const FROM_ADDRESS = 'notify@discuss.bermudatrianglesociety.com';
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
			text: options.textBody.substring(0, 200)
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
	baseUrl: string
): Promise<{ success: boolean; error?: string }> {
	const magicUrl = `${baseUrl}/auth/verify?token=${encodeURIComponent(token)}`;

	return sendEmail(platform, {
		to: email,
		subject: 'Sign in to Bermuda Triangle Society Discussions',
		textBody: `Click the link below to sign in:\n\n${magicUrl}\n\nThis link expires in 15 minutes.\n\nIf you didn't request this, you can safely ignore this email.`,
		htmlBody: `
      <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 16px;">
        <h2 style="color: #1a1a2e; margin-bottom: 24px;">Sign in to Bermuda Triangle Society</h2>
        <p style="color: #444; line-height: 1.6;">Click the button below to sign in to the discussion forum:</p>
        <div style="margin: 32px 0; text-align: center;">
          <a href="${magicUrl}" style="display: inline-block; background: #6d28d9; color: white; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: 600;">
            Sign In
          </a>
        </div>
        <p style="color: #888; font-size: 14px; line-height: 1.5;">
          Or copy and paste this URL into your browser:<br>
          <a href="${magicUrl}" style="color: #6d28d9; word-break: break-all;">${magicUrl}</a>
        </p>
        <p style="color: #888; font-size: 13px; margin-top: 32px;">This link expires in 15 minutes. If you didn't request this, you can safely ignore this email.</p>
      </div>
    `.trim()
	});
}

/** Send a notification email for a new reply */
export async function sendReplyNotificationEmail(
	platform: App.Platform,
	email: string,
	threadTitle: string,
	threadSlug: string,
	replyAuthor: string,
	replyPreview: string,
	baseUrl: string
): Promise<{ success: boolean; error?: string }> {
	const threadUrl = `${baseUrl}/thread/${threadSlug}`;

	return sendEmail(platform, {
		to: email,
		subject: `New reply in "${threadTitle}" — BTS Discussions`,
		textBody: `${replyAuthor} replied in "${threadTitle}":\n\n${replyPreview}\n\nView the thread: ${threadUrl}`,
		htmlBody: `
      <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 16px;">
        <p style="color: #888; font-size: 13px; margin-bottom: 4px;">Bermuda Triangle Society Discussions</p>
        <h3 style="color: #1a1a2e; margin-top: 0;">${replyAuthor} replied in "${threadTitle}"</h3>
        <div style="background: #f5f3ff; border-left: 3px solid #6d28d9; padding: 12px 16px; border-radius: 4px; margin: 16px 0;">
          <p style="color: #444; margin: 0; line-height: 1.5;">${replyPreview}</p>
        </div>
        <div style="margin: 24px 0;">
          <a href="${threadUrl}" style="display: inline-block; background: #6d28d9; color: white; padding: 10px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">
            View Thread
          </a>
        </div>
        <p style="color: #aaa; font-size: 12px;">You're receiving this because you're watching this thread.</p>
      </div>
    `.trim()
	});
}
