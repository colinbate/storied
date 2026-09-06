import type { NewThreadFanoutPayload } from '$shared/worker-messages';
import { spoilerSafeExcerpt } from '$shared/spoilers';

import type { HandlerContext } from '../dispatch';
import { generateId } from '../shared/ids';
import {
	sendEmail,
	renderAnnouncementBroadcastEmail,
	renderNewThreadNotificationEmail
} from './email';
import { queuePushoverForRecipients } from './pushover';

export async function handleNewThreadFanout(
	payload: NewThreadFanoutPayload,
	{ env }: HandlerContext
): Promise<void> {
	const { threadId, threadAuthorUserId, baseUrl, broadcastToAllMembers } = payload;

	const thread = await env.DB.prepare(
		`SELECT t.id, t.slug, t.title, t.body_source, t.contains_spoilers, t.category_id,
		        t.visibility, t.audience_group_id, c.name AS category_name
		 FROM threads t
		 INNER JOIN categories c ON c.id = t.category_id
		 WHERE t.id = ? AND t.deleted_at IS NULL
 AND NOT EXISTS (SELECT 1 FROM sessions se WHERE se.id = t.session_id AND se.status = 'draft')`
	)
		.bind(threadId)
		.first<{
			id: string;
			slug: string;
			title: string;
			body_source: string;
			contains_spoilers: number;
			category_id: string;
			visibility: string;
			audience_group_id: string | null;
			category_name: string;
		}>();
	if (!thread) return;

	const author = await env.DB.prepare(`SELECT display_name FROM users WHERE id = ?`)
		.bind(threadAuthorUserId)
		.first<{ display_name: string }>();
	if (!author) return;
	const threadPreview =
		spoilerSafeExcerpt(thread.body_source, {
			containsSpoilers: Boolean(thread.contains_spoilers),
			maxLength: 200
		}) ?? '';
	const pushoverPreview =
		spoilerSafeExcerpt(thread.body_source, {
			containsSpoilers: Boolean(thread.contains_spoilers),
			maxLength: 400
		}) ?? '';

	if (broadcastToAllMembers) {
		const recipientsResult = await env.DB.prepare(
			`SELECT u.id AS user_id, u.email AS email
			 FROM users u
			 LEFT JOIN notification_preferences np ON np.user_id = u.id
			 WHERE u.status = 'active'
			   AND u.id != ?
			   AND (? != 'admins' OR u.role IN ('admin', 'moderator'))
			   AND (
			     ? IS NULL
			     OR EXISTS (
			       SELECT 1 FROM group_memberships gm
			       WHERE gm.group_id = ? AND gm.user_id = u.id
			     )
			   )
			   AND (np.email_enabled IS NULL OR np.email_enabled = 1)`
		)
			.bind(
				threadAuthorUserId,
				thread.visibility,
				thread.audience_group_id,
				thread.audience_group_id
			)
			.all<{ user_id: string; email: string }>();

		const recipients = recipientsResult.results ?? [];
		const template = renderAnnouncementBroadcastEmail({
			threadTitle: thread.title,
			threadSlug: thread.slug,
			threadAuthor: author.display_name,
			threadPreview,
			baseUrl
		});

		const pushoverRecipientsResult = await env.DB.prepare(
			`SELECT u.id AS user_id, np.pushover_user_key AS pushover_user_key, np.pushover_device AS pushover_device
			 FROM users u
			 INNER JOIN notification_preferences np ON np.user_id = u.id
			 WHERE u.status = 'active'
			   AND u.role = 'admin'
			   AND u.id != ?
			   AND (? != 'admins' OR u.role IN ('admin', 'moderator'))
			   AND (
			     ? IS NULL
			     OR EXISTS (
			       SELECT 1 FROM group_memberships gm
			       WHERE gm.group_id = ? AND gm.user_id = u.id
			     )
			   )
			   AND np.pushover_enabled = 1
			   AND np.pushover_user_key IS NOT NULL
			   AND np.pushover_user_key != ''`
		)
			.bind(
				threadAuthorUserId,
				thread.visibility,
				thread.audience_group_id,
				thread.audience_group_id
			)
			.all<{ user_id: string; pushover_user_key: string; pushover_device: string | null }>();

		await queuePushoverForRecipients(env, pushoverRecipientsResult.results ?? [], {
			title: `New announcement: ${thread.title}`,
			message: `${author.display_name}: ${pushoverPreview}`,
			url: `${baseUrl}/thread/${thread.slug}`,
			urlTitle: 'Open thread',
			priority: 0,
			eventType: 'announcement',
			threadId: thread.id
		});

		if (recipients.length === 0) return;

		for (const recipient of recipients) {
			const now = new Date().toISOString();
			await env.DB.prepare(
				`INSERT INTO notification_events (id, user_id, event_type, thread_id, status, created_at, updated_at)
				 VALUES (?, ?, 'announcement', ?, 'pending', ?, ?)`
			)
				.bind(generateId(), recipient.user_id, thread.id, now, now)
				.run();

			await sendEmail(env, {
				to: recipient.email,
				subject: template.subject,
				textBody: template.textBody,
				htmlBody: template.htmlBody
			});
		}

		return;
	}

	const recipientsResult = await env.DB.prepare(
		`SELECT s.user_id AS user_id, u.email AS email
		 FROM subscriptions s
		 INNER JOIN users u ON u.id = s.user_id
		 LEFT JOIN notification_preferences np ON np.user_id = s.user_id
		 WHERE s.category_id = ?
		   AND s.mode = 'immediate'
		   AND s.user_id != ?
		   AND u.status = 'active'
		   AND (? != 'admins' OR u.role IN ('admin', 'moderator'))
		   AND (
		     ? IS NULL
		     OR EXISTS (
		       SELECT 1 FROM group_memberships gm
		       WHERE gm.group_id = ? AND gm.user_id = u.id
		     )
		   )
		   AND (np.email_enabled IS NULL OR np.email_enabled = 1)`
	)
		.bind(
			thread.category_id,
			threadAuthorUserId,
			thread.visibility,
			thread.audience_group_id,
			thread.audience_group_id
		)
		.all<{ user_id: string; email: string }>();

	const recipients = recipientsResult.results ?? [];
	const template = renderNewThreadNotificationEmail({
		threadTitle: thread.title,
		threadSlug: thread.slug,
		threadAuthor: author.display_name,
		categoryName: thread.category_name,
		threadPreview,
		baseUrl
	});

	const pushoverRecipientsResult = await env.DB.prepare(
		`SELECT s.user_id AS user_id, np.pushover_user_key AS pushover_user_key, np.pushover_device AS pushover_device
		 FROM subscriptions s
		 INNER JOIN users u ON u.id = s.user_id
		 INNER JOIN notification_preferences np ON np.user_id = s.user_id
		 WHERE s.category_id = ?
		   AND s.mode = 'immediate'
		   AND s.user_id != ?
		   AND u.status = 'active'
		   AND (? != 'admins' OR u.role IN ('admin', 'moderator'))
		   AND (
		     ? IS NULL
		     OR EXISTS (
		       SELECT 1 FROM group_memberships gm
		       WHERE gm.group_id = ? AND gm.user_id = u.id
		     )
		   )
		   AND u.role = 'admin'
		   AND u.status = 'active'
		   AND np.pushover_enabled = 1
		   AND np.pushover_user_key IS NOT NULL
		   AND np.pushover_user_key != ''`
	)
		.bind(
			thread.category_id,
			threadAuthorUserId,
			thread.visibility,
			thread.audience_group_id,
			thread.audience_group_id
		)
		.all<{ user_id: string; pushover_user_key: string; pushover_device: string | null }>();

	await queuePushoverForRecipients(env, pushoverRecipientsResult.results ?? [], {
		title: `New thread: ${thread.title}`,
		message: `${author.display_name} in ${thread.category_name}: ${pushoverPreview}`,
		url: `${baseUrl}/thread/${thread.slug}`,
		urlTitle: 'Open thread',
		priority: 0,
		eventType: 'new_thread',
		threadId: thread.id
	});

	if (recipients.length === 0) return;

	for (const recipient of recipients) {
		const now = new Date().toISOString();
		await env.DB.prepare(
			`INSERT INTO notification_events (id, user_id, event_type, thread_id, status, created_at, updated_at)
			 VALUES (?, ?, 'new_thread', ?, 'pending', ?, ?)`
		)
			.bind(generateId(), recipient.user_id, thread.id, now, now)
			.run();

		await sendEmail(env, {
			to: recipient.email,
			subject: template.subject,
			textBody: template.textBody,
			htmlBody: template.htmlBody
		});
	}
}
