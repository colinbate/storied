import type { Env } from '../env';

interface EmailOptions {
	to: string;
	subject: string;
	textBody: string;
	htmlBody?: string;
}

const FROM_ADDRESS = 'notify@discuss.bermudatrianglesociety.com';
const FROM_NAME = 'Bermuda Triangle Society';

/**
 * Send an email via the Cloudflare send_email binding. When SEND_EMAILS is
 * unset/falsy (local dev) the email is logged instead of sent.
 */
export async function sendEmail(
	env: Env,
	options: EmailOptions
): Promise<{ success: boolean; error?: string }> {
	if (!env.SEND_EMAILS) {
		console.log('[EMAIL DISABLED] Would send:', {
			to: options.to,
			subject: options.subject,
			text: options.textBody.substring(0, 200)
		});
		return { success: true };
	}

	try {
		await env.EMAIL.send({
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

export interface ReplyNotificationTemplateArgs {
	threadTitle: string;
	threadSlug: string;
	replyAuthor: string;
	replyPreview: string;
	baseUrl: string;
}

export function renderReplyNotificationEmail(args: ReplyNotificationTemplateArgs): {
	subject: string;
	textBody: string;
	htmlBody: string;
} {
	const threadUrl = `${args.baseUrl}/thread/${args.threadSlug}`;
	return {
		subject: `New reply in "${args.threadTitle}" — BTS Discussions`,
		textBody: `${args.replyAuthor} replied in "${args.threadTitle}":\n\n${args.replyPreview}\n\nView the thread: ${threadUrl}`,
		htmlBody: `
      <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 16px;">
        <p style="color: #888; font-size: 13px; margin-bottom: 4px;">Bermuda Triangle Society Discussions</p>
        <h3 style="color: #1a1a2e; margin-top: 0;">${args.replyAuthor} replied in "${args.threadTitle}"</h3>
        <div style="background: #f5f3ff; border-left: 3px solid #6d28d9; padding: 12px 16px; border-radius: 4px; margin: 16px 0;">
          <p style="color: #444; margin: 0; line-height: 1.5;">${args.replyPreview}</p>
        </div>
        <div style="margin: 24px 0;">
          <a href="${threadUrl}" style="display: inline-block; background: #6d28d9; color: white; padding: 10px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">
            View Thread
          </a>
        </div>
        <p style="color: #aaa; font-size: 12px;">You're receiving this because you're watching this thread.</p>
      </div>
    `.trim()
	};
}
