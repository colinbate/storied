import type { ThreadReplyFanoutPayload } from '$shared/worker-messages';
import { spoilerSafeExcerpt } from '$shared/spoilers';
import type { HandlerContext } from '../dispatch';
import { generateId } from '../shared/ids';
import { sendEmail, renderMentionNotificationEmail, renderReplyNotificationEmail } from './email';
import { queuePushoverForRecipients } from './pushover';

type EmailRecipient = {
	user_id: string;
	email: string;
};

type PushoverRecipient = {
	user_id: string;
	pushover_user_key: string;
	pushover_device: string | null;
};

type MentionRecipient = EmailRecipient & {
	email_enabled: number;
	pushover_user_key: string | null;
	pushover_device: string | null;
};

type ReplyRecipient = MentionRecipient;

type MentionPushoverRecipient = MentionRecipient & PushoverRecipient;

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
	const mentionedUserIds = [...new Set(payload.mentionedUserIds ?? [])].filter(
		(userId) => userId !== replyAuthorUserId
	);
	const mentionedUserIdsJson = JSON.stringify(mentionedUserIds);

	const thread = await env.DB.prepare(
		`SELECT id, slug, title, visibility, audience_group_id
		 FROM threads WHERE id = ? AND deleted_at IS NULL
 AND NOT EXISTS (SELECT 1 FROM sessions se WHERE se.id = threads.session_id AND se.status = 'draft')`
	)
		.bind(threadId)
		.first<{
			id: string;
			slug: string;
			title: string;
			visibility: string;
			audience_group_id: string | null;
		}>();
	if (!thread) return;

	const post = await env.DB.prepare(
		`SELECT id, body_source, contains_spoilers FROM posts WHERE id = ? AND deleted_at IS NULL`
	)
		.bind(postId)
		.first<{ id: string; body_source: string; contains_spoilers: number }>();
	if (!post) return;

	const author = await env.DB.prepare(`SELECT display_name FROM users WHERE id = ?`)
		.bind(replyAuthorUserId)
		.first<{ display_name: string }>();
	if (!author) return;
	const replyPreview =
		spoilerSafeExcerpt(post.body_source, {
			containsSpoilers: Boolean(post.contains_spoilers),
			maxLength: 200
		}) ?? '';
	const pushoverPreview =
		spoilerSafeExcerpt(post.body_source, {
			containsSpoilers: Boolean(post.contains_spoilers),
			maxLength: 400
		}) ?? '';
	const postUrl = `${baseUrl}/thread/${thread.slug}#post-${post.id}`;

	// Respect per-user email_enabled. Users who haven't set a preferences row
	// yet (LEFT JOIN returning NULL) are treated as enabled (matching the
	// users.email_enabled=1 default on the table).
	const replyRecipientsResult = await env.DB.prepare(
		`SELECT
			 s.user_id AS user_id,
			 u.email AS email,
			 COALESCE(np.email_enabled, 1) AS email_enabled,
			 CASE
				 WHEN u.role = 'admin'
					 AND np.pushover_enabled = 1
					 AND np.pushover_user_key IS NOT NULL
					 AND np.pushover_user_key != ''
				 THEN np.pushover_user_key
				 ELSE NULL
			 END AS pushover_user_key,
			 CASE
				 WHEN u.role = 'admin'
					 AND np.pushover_enabled = 1
					 AND np.pushover_user_key IS NOT NULL
					 AND np.pushover_user_key != ''
				 THEN np.pushover_device
				 ELSE NULL
			 END AS pushover_device
		 FROM subscriptions s
		 INNER JOIN users u ON u.id = s.user_id
		 LEFT JOIN notification_preferences np ON np.user_id = s.user_id
		 WHERE s.thread_id = ?
		   AND s.mode = 'immediate'
		   AND s.user_id != ?
		   AND s.user_id NOT IN (SELECT value FROM json_each(?))
		   AND (? != 'admins' OR u.role IN ('admin', 'moderator'))
		   AND (
		     ? IS NULL
		     OR EXISTS (
		       SELECT 1 FROM group_memberships gm
		       WHERE gm.group_id = ? AND gm.user_id = u.id
		     )
		   )
		   AND u.status = 'active'
		   AND u.last_login_at IS NOT NULL`
	)
		.bind(
			threadId,
			replyAuthorUserId,
			mentionedUserIdsJson,
			thread.visibility,
			thread.audience_group_id,
			thread.audience_group_id
		)
		.all<ReplyRecipient>();

	const replyRecipients = replyRecipientsResult.results ?? [];
	const emailRecipients = replyRecipients.filter((recipient) => recipient.email_enabled === 1);
	const replyPushoverRecipients = replyRecipients.filter(hasPushoverKey);

	const template = renderReplyNotificationEmail({
		threadTitle: thread.title,
		threadSlug: thread.slug,
		replyAuthor: author.display_name,
		replyPreview,
		baseUrl
	});

	if (mentionedUserIds.length > 0) {
		const mentionRecipientsResult = await env.DB.prepare(
			`SELECT
				 u.id AS user_id,
				 u.email AS email,
				 COALESCE(np.email_enabled, 1) AS email_enabled,
				 CASE
					 WHEN np.pushover_enabled = 1
						 AND np.pushover_user_key IS NOT NULL
						 AND np.pushover_user_key != ''
					 THEN np.pushover_user_key
					 ELSE NULL
				 END AS pushover_user_key,
				 CASE
					 WHEN np.pushover_enabled = 1
						 AND np.pushover_user_key IS NOT NULL
						 AND np.pushover_user_key != ''
					 THEN np.pushover_device
					 ELSE NULL
				 END AS pushover_device
			 FROM users u
			 LEFT JOIN notification_preferences np ON np.user_id = u.id
			 WHERE u.id IN (SELECT value FROM json_each(?))
			   AND u.id != ?
			   AND (? != 'admins' OR u.role IN ('admin', 'moderator'))
			   AND (
			     ? IS NULL
			     OR EXISTS (
			       SELECT 1 FROM group_memberships gm
			       WHERE gm.group_id = ? AND gm.user_id = u.id
			     )
			   )
			   AND u.status = 'active'
			   AND u.last_login_at IS NOT NULL`
		)
			.bind(
				mentionedUserIdsJson,
				replyAuthorUserId,
				thread.visibility,
				thread.audience_group_id,
				thread.audience_group_id
			)
			.all<MentionRecipient>();
		const mentionRecipients = mentionRecipientsResult.results ?? [];
		const mentionEmailRecipients = mentionRecipients.filter(
			(recipient) => recipient.email_enabled === 1
		);

		const mentionTemplate = renderMentionNotificationEmail({
			threadTitle: thread.title,
			threadSlug: thread.slug,
			replyAuthor: author.display_name,
			replyPreview,
			baseUrl
		});

		await insertNotificationEvents(env, mentionEmailRecipients, 'mention', threadId, postId);

		for (const recipient of mentionEmailRecipients) {
			await sendEmail(env, {
				to: recipient.email,
				subject: mentionTemplate.subject,
				textBody: mentionTemplate.textBody,
				htmlBody: mentionTemplate.htmlBody
			});
		}

		await queuePushoverForRecipients(env, mentionRecipients.filter(hasPushoverKey), {
			title: `Mention: ${thread.title}`,
			message: `${author.display_name} mentioned you: ${pushoverPreview}`,
			url: postUrl,
			urlTitle: 'Open reply',
			priority: 0,
			eventType: 'mention',
			threadId,
			postId
		});
	}

	await queuePushoverForRecipients(env, replyPushoverRecipients, {
		title: `New reply: ${thread.title}`,
		message: `${author.display_name} replied: ${pushoverPreview}`,
		url: postUrl,
		urlTitle: 'Open reply',
		priority: 0,
		eventType: 'reply',
		threadId,
		postId
	});

	if (emailRecipients.length === 0) return;

	await insertNotificationEvents(env, emailRecipients, 'reply', threadId, postId);

	for (const sub of emailRecipients) {
		await sendEmail(env, {
			to: sub.email,
			subject: template.subject,
			textBody: template.textBody,
			htmlBody: template.htmlBody
		});
	}
}

function hasPushoverKey(recipient: MentionRecipient): recipient is MentionPushoverRecipient {
	return recipient.pushover_user_key !== null;
}

async function insertNotificationEvents(
	env: HandlerContext['env'],
	recipients: Array<{ user_id: string }>,
	eventType: 'mention' | 'reply',
	threadId: string,
	postId: string
): Promise<void> {
	if (recipients.length === 0) return;

	const now = new Date().toISOString();
	const statements = recipients.map((recipient) =>
		env.DB.prepare(
			`INSERT INTO notification_events (id, user_id, event_type, thread_id, post_id, status, created_at, updated_at)
			 VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`
		).bind(generateId(), recipient.user_id, eventType, threadId, postId, now, now)
	);

	await env.DB.batch(statements);
}
