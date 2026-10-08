import type { PrivateMessageNotificationPayload } from '$shared/worker-messages';
import type { HandlerContext } from '../dispatch';
import { spoilerSafeExcerpt } from '$shared/spoilers';
import { renderPrivateMessageNotificationEmail, sendEmail } from './email';

export async function handlePrivateMessageNotification(
	payload: PrivateMessageNotificationPayload,
	{ env }: HandlerContext,
	nowMs = Date.now()
): Promise<void> {
	const { conversationId, messageId, authorUserId, recipientUserId, baseUrl } = payload;
	const message = await env.DB.prepare(
		`SELECT pm.body_source, author.display_name,
		u.email, COALESCE(np.email_enabled, 1) AS email_enabled, np.digest_hour_local
		FROM private_messages pm
		JOIN conversation_members cm ON cm.conversation_id = pm.conversation_id AND cm.user_id = ?
		JOIN users u ON u.id = cm.user_id
		JOIN users author ON author.id = pm.author_user_id
		LEFT JOIN notification_preferences np ON np.user_id = u.id
		WHERE pm.id = ? AND pm.conversation_id = ? AND pm.author_user_id = ?
		AND pm.deleted_at IS NULL AND cm.muted_at IS NULL
		AND u.status = 'active' AND u.last_login_at IS NOT NULL`
	)
		.bind(recipientUserId, messageId, conversationId, authorUserId)
		.first<{
			body_source: string;
			display_name: string;
			email: string;
			email_enabled: number;
			digest_hour_local: number | null;
		}>();
	if (!message || message.email_enabled !== 1) return;

	const now = new Date(nowMs).toISOString();
	const eventId = `private-message:${messageId}:${recipientUserId}`;
	const deliveryMode = message.digest_hour_local == null ? 'immediate' : 'daily_digest';
	await env.DB.prepare(
		`INSERT INTO notification_events
		(id, user_id, event_type, payload_json, status, created_at, updated_at)
		VALUES (?, ?, 'private_message', ?, 'pending', ?, ?) ON CONFLICT DO NOTHING`
	)
		.bind(
			eventId,
			recipientUserId,
			JSON.stringify({ conversationId, messageId, authorUserId, deliveryMode }),
			now,
			now
		)
		.run();
	if (deliveryMode === 'daily_digest') {
		// A failed immediate attempt also follows the current preference on retry.
		await env.DB.prepare(
			`UPDATE notification_events SET status = 'pending', available_at = NULL,
			payload_json = json_set(payload_json, '$.deliveryMode', 'daily_digest'), updated_at = ?
			WHERE id = ? AND (status = 'failed' OR (status = 'pending' AND (available_at IS NULL OR available_at <= ?)))`
		)
			.bind(now, eventId, now)
			.run();
		return;
	}
	// The saved mode also prevents a redelivered queue message from sending an already deferred email.
	const claim = await env.DB.prepare(
		`UPDATE notification_events SET status = 'pending', available_at = ?, updated_at = ?
		WHERE id = ? AND json_extract(payload_json, '$.deliveryMode') = 'immediate'
		AND (status = 'failed' OR (status = 'pending' AND (available_at IS NULL OR available_at <= ?)))
		RETURNING id`
	)
		.bind(new Date(Date.parse(now) + 10 * 60_000).toISOString(), now, eventId, now)
		.first();
	if (!claim) {
		const busy = await env.DB.prepare(
			`SELECT available_at FROM notification_events
			WHERE id = ? AND status = 'pending' AND json_extract(payload_json, '$.deliveryMode') = 'immediate'`
		)
			.bind(eventId)
			.first<{ available_at: string }>();
		if (busy) {
			// Do not acknowledge an interrupted send permanently while its lease is still live.
			if (!env.WORKER_QUEUE) throw new Error('Private message delivery is still in progress');
			await env.WORKER_QUEUE.send(
				{ topic: 'notifications.private-message', payload },
				{
					delaySeconds: Math.max(1, Math.ceil((Date.parse(busy.available_at) - nowMs) / 1000))
				}
			);
		}
		return;
	}

	const template = renderPrivateMessageNotificationEmail({
		authorDisplayName: message.display_name,
		messagePreview: spoilerSafeExcerpt(message.body_source, { maxLength: 200 }) ?? '',
		conversationUrl: `${baseUrl}/messages/${conversationId}`
	});
	const sent = await sendEmail(env, { to: message.email, ...template });
	await env.DB.prepare(
		`UPDATE notification_events SET status = ?, sent_at = ?, failure_reason = ?, updated_at = ? WHERE id = ?`
	)
		.bind(
			sent.success ? 'sent' : 'failed',
			sent.success ? now : null,
			sent.error ?? null,
			now,
			eventId
		)
		.run();
	if (!sent.success) throw new Error(sent.error ?? 'Private message email could not be sent');
}
