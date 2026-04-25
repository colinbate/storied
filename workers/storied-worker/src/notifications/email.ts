import { APP_NAME, APP_SUBTITLE, NOTIFICATION_FROM_ADDRESS } from '$shared/brand';
import type { Env } from '../env';

interface EmailOptions {
	to: string;
	subject: string;
	textBody: string;
	htmlBody?: string;
}

const FROM_ADDRESS = NOTIFICATION_FROM_ADDRESS;
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
		subject: `New reply in "${args.threadTitle}" — ${APP_NAME}`,
		textBody: `${args.replyAuthor} replied in "${args.threadTitle}":\n\n${args.replyPreview}\n\nView the thread: ${threadUrl}`,
		htmlBody: `
      <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 16px;">
        <p style="color: #888; font-size: 13px; margin-bottom: 4px;">${APP_SUBTITLE}</p>
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

export interface DigestThreadPost {
	authorDisplayName: string;
	bodyPreview: string;
	createdAt: string;
}

export interface NewThreadNotificationTemplateArgs {
	threadTitle: string;
	threadSlug: string;
	threadAuthor: string;
	categoryName: string;
	threadPreview: string;
	baseUrl: string;
}

export function renderNewThreadNotificationEmail(args: NewThreadNotificationTemplateArgs): {
	subject: string;
	textBody: string;
	htmlBody: string;
} {
	const threadUrl = `${args.baseUrl}/thread/${args.threadSlug}`;
	return {
		subject: `New thread in ${args.categoryName} — ${APP_NAME}`,
		textBody: `${args.threadAuthor} started "${args.threadTitle}" in ${args.categoryName}.\n\n${args.threadPreview}\n\nJoin the conversation: ${threadUrl}`,
		htmlBody: `
      <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 16px;">
        <p style="color: #888; font-size: 13px; margin-bottom: 4px;">${APP_SUBTITLE}</p>
        <h3 style="color: #1a1a2e; margin-top: 0;">New thread in ${escapeHtml(args.categoryName)}</h3>
        <p style="color: #444; line-height: 1.6; margin: 0 0 12px;"><strong>${escapeHtml(args.threadAuthor)}</strong> started <strong>${escapeHtml(args.threadTitle)}</strong>.</p>
        <div style="background: #f5f3ff; border-left: 3px solid #6d28d9; padding: 12px 16px; border-radius: 4px; margin: 16px 0;">
          <p style="color: #444; margin: 0; line-height: 1.5;">${escapeHtml(args.threadPreview)}</p>
        </div>
        <div style="margin: 24px 0;">
          <a href="${threadUrl}" style="display: inline-block; background: #6d28d9; color: white; padding: 10px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">
            View Thread
          </a>
        </div>
        <p style="color: #aaa; font-size: 12px;">You're receiving this because you follow ${escapeHtml(args.categoryName)}.</p>
      </div>
    `.trim()
	};
}

export interface AnnouncementBroadcastTemplateArgs {
	threadTitle: string;
	threadSlug: string;
	threadAuthor: string;
	threadPreview: string;
	baseUrl: string;
}

export function renderAnnouncementBroadcastEmail(args: AnnouncementBroadcastTemplateArgs): {
	subject: string;
	textBody: string;
	htmlBody: string;
} {
	const threadUrl = `${args.baseUrl}/thread/${args.threadSlug}`;
	return {
		subject: `Announcement: ${args.threadTitle}`,
		textBody: `${args.threadAuthor} posted a new announcement.\n\n${args.threadTitle}\n\n${args.threadPreview}\n\nRead it here: ${threadUrl}`,
		htmlBody: `
      <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 16px;">
        <p style="color: #888; font-size: 13px; margin-bottom: 4px;">${APP_SUBTITLE}</p>
        <h3 style="color: #1a1a2e; margin-top: 0;">New announcement</h3>
        <p style="color: #444; line-height: 1.6; margin: 0 0 12px;"><strong>${escapeHtml(args.threadAuthor)}</strong> posted <strong>${escapeHtml(args.threadTitle)}</strong>.</p>
        <div style="background: #f5f3ff; border-left: 3px solid #6d28d9; padding: 12px 16px; border-radius: 4px; margin: 16px 0;">
          <p style="color: #444; margin: 0; line-height: 1.5;">${escapeHtml(args.threadPreview)}</p>
        </div>
        <div style="margin: 24px 0;">
          <a href="${threadUrl}" style="display: inline-block; background: #6d28d9; color: white; padding: 10px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">
            Read Announcement
          </a>
        </div>
        <p style="color: #aaa; font-size: 12px;">You're receiving this because you use the society discussion system.</p>
      </div>
    `.trim()
	};
}

export interface DigestFollowedThread {
	threadId: string;
	threadSlug: string;
	threadTitle: string;
	posts: DigestThreadPost[];
}

export interface DigestFollowedCategoryThread {
	threadId: string;
	threadSlug: string;
	threadTitle: string;
	authorDisplayName: string;
	createdAt: string;
}

export interface DigestFollowedCategory {
	categoryId: string;
	categoryName: string;
	categorySlug: string;
	threads: DigestFollowedCategoryThread[];
}

export interface DigestSiteCounts {
	newThreads: number;
	newPosts: number;
}

export interface DigestEmailTemplateArgs {
	displayName: string;
	windowStart: string; // ISO-8601 — start of the digest window
	followedThreads: DigestFollowedThread[];
	followedCategories: DigestFollowedCategory[];
	siteCounts: DigestSiteCounts;
	baseUrl: string;
}

function escapeHtml(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function truncate(s: string, n: number): string {
	if (s.length <= n) return s;
	return s.slice(0, n - 1).trimEnd() + '…';
}

/**
 * Render the daily digest email. Layout matches the reply-notification
 * aesthetic (system fonts, purple accents). Empty sections are omitted;
 * the caller is expected to skip sending entirely if everything is empty.
 */
export function renderDigestEmail(args: DigestEmailTemplateArgs): {
	subject: string;
	textBody: string;
	htmlBody: string;
} {
	const totalUpdates =
		args.followedThreads.reduce((acc, t) => acc + t.posts.length, 0) +
		args.followedCategories.reduce((acc, c) => acc + c.threads.length, 0);

	const subject =
		totalUpdates > 0
			? `Your ${APP_NAME} digest — ${totalUpdates} update${totalUpdates === 1 ? '' : 's'}`
			: `Your ${APP_NAME} digest`;

	// ─── Text body ──────────────────────────────────────────────────────────
	const textLines: string[] = [];
	textLines.push(`Hi ${args.displayName},`);
	textLines.push('');
	textLines.push(`Here's what's happened since ${new Date(args.windowStart).toLocaleString()}.`);
	textLines.push('');

	if (args.followedThreads.length > 0) {
		textLines.push('── Threads you follow ──');
		for (const t of args.followedThreads) {
			textLines.push('');
			textLines.push(`• ${t.threadTitle}  (${args.baseUrl}/thread/${t.threadSlug})`);
			for (const p of t.posts) {
				textLines.push(`    ${p.authorDisplayName}: ${truncate(p.bodyPreview, 200)}`);
			}
		}
		textLines.push('');
	}

	if (args.followedCategories.length > 0) {
		textLines.push('── Categories you follow ──');
		for (const c of args.followedCategories) {
			textLines.push('');
			textLines.push(`${c.categoryName}:`);
			for (const t of c.threads) {
				textLines.push(`  - ${t.threadTitle} — ${t.authorDisplayName}`);
				textLines.push(`    ${args.baseUrl}/thread/${t.threadSlug}`);
			}
		}
		textLines.push('');
	}

	textLines.push('── Around the forum ──');
	textLines.push(
		`${args.siteCounts.newThreads} new thread${args.siteCounts.newThreads === 1 ? '' : 's'}, ${args.siteCounts.newPosts} new post${args.siteCounts.newPosts === 1 ? '' : 's'} in the last day.`
	);
	textLines.push('');
	textLines.push('Update your preferences at ' + args.baseUrl + '/settings.');

	// ─── HTML body ──────────────────────────────────────────────────────────
	const htmlParts: string[] = [];
	htmlParts.push(
		`<div style="font-family: system-ui, -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 16px; color: #1a1a2e;">`
	);
	htmlParts.push(`<p style="color: #888; font-size: 13px; margin: 0 0 4px;">${APP_SUBTITLE}</p>`);
	htmlParts.push(`<h2 style="margin: 0 0 8px;">Hi ${escapeHtml(args.displayName)},</h2>`);
	htmlParts.push(
		`<p style="color: #444; line-height: 1.5; margin: 0 0 24px;">Here's what's happened since ${escapeHtml(
			new Date(args.windowStart).toLocaleString()
		)}.</p>`
	);

	if (args.followedThreads.length > 0) {
		htmlParts.push(
			`<h3 style="color: #6d28d9; font-size: 15px; text-transform: uppercase; letter-spacing: 0.04em; margin: 32px 0 8px;">Threads you follow</h3>`
		);
		for (const t of args.followedThreads) {
			const threadUrl = `${args.baseUrl}/thread/${t.threadSlug}`;
			htmlParts.push(
				`<div style="margin: 16px 0 24px;"><a href="${escapeHtml(threadUrl)}" style="color: #1a1a2e; text-decoration: none; font-weight: 600; font-size: 16px;">${escapeHtml(t.threadTitle)}</a>`
			);
			for (const p of t.posts) {
				htmlParts.push(
					`<div style="background: #f5f3ff; border-left: 3px solid #6d28d9; padding: 10px 14px; border-radius: 4px; margin: 10px 0;"><div style="font-size: 13px; color: #555; margin-bottom: 4px;"><strong>${escapeHtml(p.authorDisplayName)}</strong></div><div style="color: #333; line-height: 1.5;">${escapeHtml(truncate(p.bodyPreview, 200))}</div></div>`
				);
			}
			htmlParts.push(`</div>`);
		}
	}

	if (args.followedCategories.length > 0) {
		htmlParts.push(
			`<h3 style="color: #6d28d9; font-size: 15px; text-transform: uppercase; letter-spacing: 0.04em; margin: 32px 0 8px;">Categories you follow</h3>`
		);
		for (const c of args.followedCategories) {
			htmlParts.push(
				`<div style="margin: 12px 0 20px;"><div style="font-weight: 600; margin-bottom: 6px;">${escapeHtml(c.categoryName)}</div>`
			);
			htmlParts.push(`<ul style="margin: 0; padding-left: 18px; color: #333; line-height: 1.6;">`);
			for (const t of c.threads) {
				const threadUrl = `${args.baseUrl}/thread/${t.threadSlug}`;
				htmlParts.push(
					`<li><a href="${escapeHtml(threadUrl)}" style="color: #6d28d9; text-decoration: none;">${escapeHtml(t.threadTitle)}</a> — ${escapeHtml(t.authorDisplayName)}</li>`
				);
			}
			htmlParts.push(`</ul></div>`);
		}
	}

	htmlParts.push(
		`<h3 style="color: #6d28d9; font-size: 15px; text-transform: uppercase; letter-spacing: 0.04em; margin: 32px 0 8px;">Around the forum</h3>`
	);
	htmlParts.push(
		`<p style="color: #333; line-height: 1.5; margin: 0 0 24px;">${args.siteCounts.newThreads} new thread${args.siteCounts.newThreads === 1 ? '' : 's'}, ${args.siteCounts.newPosts} new post${args.siteCounts.newPosts === 1 ? '' : 's'} in the last 24 hours.</p>`
	);

	htmlParts.push(
		`<p style="color: #aaa; font-size: 12px; margin-top: 40px;">You're receiving this digest because of your notification preferences. <a href="${escapeHtml(args.baseUrl)}/settings" style="color: #6d28d9;">Change them</a>.</p>`
	);
	htmlParts.push(`</div>`);

	return {
		subject,
		textBody: textLines.join('\n'),
		htmlBody: htmlParts.join('')
	};
}
