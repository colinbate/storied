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
	code: string,
	baseUrl: string
): Promise<{ success: boolean; error?: string }> {
	const magicUrl = `${baseUrl}/auth/verify?token=${encodeURIComponent(token)}`;
	const displayCode = `${code.slice(0, 3)} ${code.slice(3)}`;

	return sendEmail(platform, {
		to: email,
		subject: 'Sign in to Bermuda Triangle Society Discussions',
		textBody: `Click the link below to sign in:\n\n${magicUrl}\n\nOr enter this code on the sign-in page if you're on a different device:\n\n${displayCode}\n\nThe link and code expire in 15 minutes and can only be used once.\n\nIf you didn't request this, you can safely ignore this email.`,
		htmlBody: `
      <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 16px;">
        <h2 style="color: #1a1a2e; margin-bottom: 24px;">Sign in to Bermuda Triangle Society</h2>
        <p style="color: #444; line-height: 1.6;">Click the button below to sign in to the discussion forum:</p>
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
