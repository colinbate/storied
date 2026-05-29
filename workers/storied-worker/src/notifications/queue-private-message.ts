import type { PrivateMessageNotificationPayload } from '$shared/worker-messages';

import type { HandlerContext } from '../dispatch';
import { generateId } from '../shared/ids';
import { renderPrivateMessageNotificationEmail, sendEmail } from './email';

export async function handlePrivateMessageNotification(
	payload: PrivateMessageNotificationPayload,
	{ env }: HandlerContext
): Promise<void> {
	const { conversationId, messageId, authorUserId, recipientUserId, baseUrl } = payload;

	const membership = await env.DB.prepare(
		`SELECT muted_at
		 FROM conversation_members
		 WHERE conversation_id = ?
		   AND user_id = ?`
	)
		.bind(conversationId, recipientUserId)
		.first<{ muted_at: string | null }>();
	if (!membership || membership.muted_at) return;

	const message = await env.DB.prepare(
		`SELECT id, body_source
		 FROM private_messages
		 WHERE id = ?
		   AND conversation_id = ?
		   AND author_user_id = ?
		   AND deleted_at IS NULL`
	)
		.bind(messageId, conversationId, authorUserId)
		.first<{ id: string; body_source: string }>();
	if (!message) return;

	const author = await env.DB.prepare(`SELECT display_name FROM users WHERE id = ?`)
		.bind(authorUserId)
		.first<{ display_name: string }>();
	if (!author) return;

	const recipient = await env.DB.prepare(
		`SELECT
			 u.email AS email,
			 COALESCE(np.email_enabled, 1) AS email_enabled
		 FROM users u
		 LEFT JOIN notification_preferences np ON np.user_id = u.id
		 WHERE u.id = ?
		   AND u.status = 'active'
		   AND u.last_login_at IS NOT NULL`
	)
		.bind(recipientUserId)
		.first<{ email: string; email_enabled: number }>();
	if (!recipient || recipient.email_enabled !== 1) return;

	const now = new Date().toISOString();
	const eventId = generateId();
	const payloadJson = JSON.stringify({
		conversationId,
		messageId,
		authorUserId,
		url: `${baseUrl}/messages/${conversationId}`
	});

	await env.DB.prepare(
		`INSERT INTO notification_events
		   (id, user_id, event_type, payload_json, status, created_at, updated_at)
		 VALUES (?, ?, 'private_message', ?, 'pending', ?, ?)`
	)
		.bind(eventId, recipientUserId, payloadJson, now, now)
		.run();

	const template = renderPrivateMessageNotificationEmail({
		authorDisplayName: author.display_name,
		messagePreview: message.body_source.substring(0, 200),
		conversationUrl: `${baseUrl}/messages/${conversationId}`
	});
	const sent = await sendEmail(env, {
		to: recipient.email,
		subject: template.subject,
		textBody: template.textBody,
		htmlBody: template.htmlBody
	});

	await env.DB.prepare(
		`UPDATE notification_events
		 SET status = ?,
		     sent_at = ?,
		     failure_reason = ?,
		     updated_at = ?
		 WHERE id = ?`
	)
		.bind(
			sent.success ? 'sent' : 'failed',
			sent.success ? now : null,
			sent.error ?? null,
			now,
			eventId
		)
		.run();
}
