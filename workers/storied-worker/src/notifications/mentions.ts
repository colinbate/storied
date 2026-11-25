import type { HandlerContext } from '../dispatch';
import { generateId } from '../shared/ids';
import { renderMentionNotificationEmail, sendEmail } from './email';
import { queuePushoverForRecipients } from './pushover';

type MentionRecipient = {
	user_id: string;
	email: string;
	email_enabled: number;
	pushover_user_key: string | null;
	pushover_device: string | null;
};

/** Direct mentions bypass category and thread subscriptions, but retain email and access checks. */
export async function notifyMentionedUsers(
	env: HandlerContext['env'],
	args: {
		thread: {
			id: string;
			slug: string;
			title: string;
			visibility: string;
			audience_group_id: string | null;
		};
		authorUserId: string;
		authorDisplayName: string;
		mentionedUserIds: string[];
		preview: string;
		pushoverPreview: string;
		baseUrl: string;
		postId?: string;
	}
): Promise<void> {
	const { thread, authorUserId, authorDisplayName, preview, pushoverPreview, baseUrl, postId } =
		args;
	const mentionedUserIds = [...new Set(args.mentionedUserIds)].filter((id) => id !== authorUserId);
	if (mentionedUserIds.length === 0) return;
	const mentionedUserIdsJson = JSON.stringify(mentionedUserIds);
	const postUrl = postId
		? `${baseUrl}/thread/${thread.slug}?post=${encodeURIComponent(postId)}#post-${postId}`
		: `${baseUrl}/thread/${thread.slug}`;

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
			authorUserId,
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
		postId,
		replyAuthor: authorDisplayName,
		replyPreview: preview,
		baseUrl
	});

	const now = new Date().toISOString();
	if (mentionEmailRecipients.length > 0) {
		await env.DB.batch(
			mentionEmailRecipients.map((recipient) =>
				env.DB.prepare(
					`INSERT INTO notification_events (id, user_id, event_type, thread_id, post_id, status, created_at, updated_at)
					 VALUES (?, ?, 'mention', ?, ?, 'pending', ?, ?)`
				).bind(generateId(), recipient.user_id, thread.id, postId ?? null, now, now)
			)
		);
	}

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
		message: `${authorDisplayName} mentioned you: ${pushoverPreview}`,
		url: postUrl,
		urlTitle: postId ? 'Open reply' : 'Open thread',
		priority: 0,
		eventType: 'mention',
		threadId: thread.id,
		postId
	});
}

function hasPushoverKey(
	recipient: MentionRecipient
): recipient is MentionRecipient & { pushover_user_key: string } {
	return recipient.pushover_user_key !== null;
}
