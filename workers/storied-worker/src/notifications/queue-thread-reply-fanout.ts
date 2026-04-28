import type { ThreadReplyFanoutPayload } from '$shared/worker-messages';
import type { HandlerContext } from '../dispatch';
import { generateId } from '../shared/ids';
import { sendEmail, renderReplyNotificationEmail } from './email';
import { queuePushoverForRecipients } from './pushover';

/**
 * Fan out reply notification emails to all immediate subscribers of a thread,
 * excluding the reply author. A notification_events row is written per
 * recipient for audit purposes.
 */
export async function handleThreadReplyFanout(
	payload: ThreadReplyFanoutPayload,
	{ env }: HandlerContext
): Promise<void> {
	const { threadId, postId, replyAuthorUserId, baseUrl } = payload;

	const thread = await env.DB.prepare(
		`SELECT id, slug, title FROM threads WHERE id = ? AND deleted_at IS NULL`
	)
		.bind(threadId)
		.first<{ id: string; slug: string; title: string }>();
	if (!thread) return;

	const post = await env.DB.prepare(
		`SELECT id, body_source FROM posts WHERE id = ? AND deleted_at IS NULL`
	)
		.bind(postId)
		.first<{ id: string; body_source: string }>();
	if (!post) return;

	const author = await env.DB.prepare(`SELECT display_name FROM users WHERE id = ?`)
		.bind(replyAuthorUserId)
		.first<{ display_name: string }>();
	if (!author) return;

	// Respect per-user email_enabled. Users who haven't set a preferences row
	// yet (LEFT JOIN returning NULL) are treated as enabled (matching the
	// users.email_enabled=1 default on the table).
	const subsResult = await env.DB.prepare(
		`SELECT s.user_id AS user_id, u.email AS email
		 FROM subscriptions s
		 INNER JOIN users u ON u.id = s.user_id
		 LEFT JOIN notification_preferences np ON np.user_id = s.user_id
		 WHERE s.thread_id = ?
		   AND s.mode = 'immediate'
		   AND s.user_id != ?
		   AND (np.email_enabled IS NULL OR np.email_enabled = 1)`
	)
		.bind(threadId, replyAuthorUserId)
		.all<{ user_id: string; email: string }>();

	const subs = subsResult.results ?? [];

	const template = renderReplyNotificationEmail({
		threadTitle: thread.title,
		threadSlug: thread.slug,
		replyAuthor: author.display_name,
		replyPreview: post.body_source.substring(0, 200),
		baseUrl
	});

	const pushoverRecipientsResult = await env.DB.prepare(
		`SELECT s.user_id AS user_id, np.pushover_user_key AS pushover_user_key, np.pushover_device AS pushover_device
		 FROM subscriptions s
		 INNER JOIN users u ON u.id = s.user_id
		 INNER JOIN notification_preferences np ON np.user_id = s.user_id
		 WHERE s.thread_id = ?
		   AND s.mode = 'immediate'
		   AND s.user_id != ?
		   AND u.role = 'admin'
		   AND u.status = 'active'
		   AND np.pushover_enabled = 1
		   AND np.pushover_user_key IS NOT NULL
		   AND np.pushover_user_key != ''`
	)
		.bind(threadId, replyAuthorUserId)
		.all<{ user_id: string; pushover_user_key: string; pushover_device: string | null }>();

	await queuePushoverForRecipients(env, pushoverRecipientsResult.results ?? [], {
		title: `New reply: ${thread.title}`,
		message: `${author.display_name} replied: ${post.body_source.substring(0, 400)}`,
		url: `${baseUrl}/thread/${thread.slug}`,
		urlTitle: 'Open thread',
		priority: 0,
		eventType: 'reply',
		threadId,
		postId
	});

	if (subs.length === 0) return;

	for (const sub of subs) {
		const now = new Date().toISOString();
		await env.DB.prepare(
			`INSERT INTO notification_events (id, user_id, event_type, thread_id, post_id, status, created_at, updated_at)
			 VALUES (?, ?, 'reply', ?, ?, 'pending', ?, ?)`
		)
			.bind(generateId(), sub.user_id, threadId, postId, now, now)
			.run();

		await sendEmail(env, {
			to: sub.email,
			subject: template.subject,
			textBody: template.textBody,
			htmlBody: template.htmlBody
		});
	}
}
