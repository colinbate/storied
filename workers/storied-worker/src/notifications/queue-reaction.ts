import type { ReactionNotificationPayload } from '$shared/worker-messages';
import {
	reactionTargetKey,
	REACTION_NOTIFICATION_THROTTLE_MS,
	REACTION_NOTIFICATION_DELAY_SECONDS
} from '$shared/reactions';
import type { HandlerContext } from '../dispatch';
import { renderReactionNotificationEmail, sendEmail } from './email';
import { queuePushoverMessage } from './pushover';

/** Queue messages wait one minute, then coalesce all outstanding reactions per post. */
export async function handleReactionNotification(
	payload: ReactionNotificationPayload,
	{ env }: HandlerContext,
	nowMs = Date.now()
) {
	const { threadId, postId, baseUrl } = payload;
	const targetKey = reactionTargetKey(threadId, postId);
	const now = new Date(nowMs).toISOString();
	const target = await env.DB.prepare(
		`
		SELECT t.title, t.slug, COALESCE(p.author_user_id, t.author_user_id) AS author_id,
			u.email, COALESCE(np.email_enabled, 1) AS email_enabled, np.digest_hour_local,
			CASE WHEN np.pushover_enabled = 1 THEN np.pushover_user_key END AS pushover_user_key,
			np.pushover_device
		FROM threads t
		LEFT JOIN posts p ON p.id = ? AND p.thread_id = t.id
		JOIN users u ON u.id = COALESCE(p.author_user_id, t.author_user_id)
		LEFT JOIN notification_preferences np ON np.user_id = u.id
		WHERE t.id = ? AND t.deleted_at IS NULL
			AND (? IS NULL OR (p.id IS NOT NULL AND p.deleted_at IS NULL))
			AND u.status = 'active' AND u.last_login_at IS NOT NULL
			AND (t.visibility != 'admins' OR u.role IN ('admin', 'moderator'))
			AND (t.audience_group_id IS NULL OR u.role IN ('admin', 'moderator') OR EXISTS (
				SELECT 1 FROM group_memberships gm WHERE gm.group_id = t.audience_group_id AND gm.user_id = u.id
			))
			AND NOT EXISTS (SELECT 1 FROM sessions s WHERE s.id = t.session_id AND s.status = 'draft')
			AND NOT EXISTS (SELECT 1 FROM subscriptions sub WHERE sub.user_id = u.id AND sub.thread_id = t.id AND sub.mode = 'mute')
	`
	)
		.bind(postId, threadId, postId)
		.first<{
			title: string;
			slug: string;
			author_id: string;
			email: string;
			email_enabled: number;
			digest_hour_local: number | null;
			pushover_user_key: string | null;
			pushover_device: string | null;
		}>();
	if (!target || (!target.email_enabled && !target.pushover_user_key)) return;

	await env.DB.prepare(
		`INSERT INTO reaction_notification_state (target_key, thread_id, post_id)
		VALUES (?, ?, ?) ON CONFLICT DO NOTHING`
	)
		.bind(targetKey, threadId, postId)
		.run();
	const state = await env.DB.prepare(
		`SELECT last_notified_at, last_reaction_at FROM reaction_notification_state WHERE target_key = ?`
	)
		.bind(targetKey)
		.first<{ last_notified_at: string; last_reaction_at: string }>();
	if (!state) return;

	const reactions = await env.DB.prepare(
		`
		SELECT r.emoji, u.display_name, r.user_id, r.created_at
		FROM post_reactions r JOIN users u ON u.id = r.user_id
		WHERE r.target_key = ? AND r.user_id != ? AND r.created_at > ? AND r.created_at <= ?
		ORDER BY r.created_at, r.id
	`
	)
		.bind(targetKey, target.author_id, state.last_reaction_at, now)
		.all<{ emoji: string; display_name: string; user_id: string; created_at: string }>();
	if (!reactions.results?.length) return;

	const firstReactionDue =
		Date.parse(reactions.results[0].created_at) + REACTION_NOTIFICATION_DELAY_SECONDS * 1000;
	const remainingMs =
		Math.max(
			firstReactionDue,
			Date.parse(state.last_notified_at) + REACTION_NOTIFICATION_THROTTLE_MS
		) - nowMs;
	if (remainingMs > 0) {
		// Requeue with a delay rather than consuming retry attempts throughout the throttle window.
		await env.WORKER_QUEUE?.send(
			{ topic: 'notifications.reaction', payload },
			{
				delaySeconds: Math.ceil(remainingMs / 1000)
			}
		);
		return;
	}

	// Compare-and-swap prevents simultaneous queue messages from notifying twice.
	const claim = await env.DB.prepare(
		`UPDATE reaction_notification_state SET last_notified_at = ?
		WHERE target_key = ? AND last_notified_at = ? AND last_reaction_at = ? RETURNING target_key`
	)
		.bind(now, targetKey, state.last_notified_at, state.last_reaction_at)
		.first();
	if (!claim) return;

	const people = new Map(
		reactions.results.map((reaction) => [reaction.user_id, reaction.display_name])
	);
	const counts = new Map<string, number>();
	for (const reaction of reactions.results)
		counts.set(reaction.emoji, (counts.get(reaction.emoji) ?? 0) + 1);
	const names = [...people.values()];
	const actors =
		names.length <= 3
			? names.join(', ')
			: `${names.slice(0, 3).join(', ')} and ${names.length - 3} others`;
	const summary = [...counts].map(([emoji, count]) => `${emoji} ${count}`).join('  ');
	const postUrl = `${baseUrl}/thread/${target.slug}${postId ? `?post=${encodeURIComponent(postId)}#post-${encodeURIComponent(postId)}` : '#opening-post'}`;
	// Reuse the batch after a partial delivery failure, so email is not repeated when push retries.
	const eventId = `reaction:${targetKey}:${state.last_reaction_at}`;
	let batch = {
		actors,
		summary,
		postUrl,
		cutoff: now,
		windowStart: state.last_reaction_at,
		emailSent: false,
		emailDeferred: false,
		pushoverQueued: false
	};
	async function saveBatch() {
		await env.DB.prepare(
			'UPDATE notification_events SET payload_json = ?, updated_at = ? WHERE id = ?'
		)
			.bind(JSON.stringify(batch), now, eventId)
			.run();
	}
	try {
		await env.DB.prepare(
			`INSERT INTO notification_events
			(id, user_id, event_type, thread_id, post_id, payload_json, status, created_at, updated_at)
			VALUES (?, ?, 'reaction', ?, ?, ?, 'pending', ?, ?) ON CONFLICT DO NOTHING`
		)
			.bind(eventId, target.author_id, threadId, postId, JSON.stringify(batch), now, now)
			.run();
		const saved = await env.DB.prepare('SELECT payload_json FROM notification_events WHERE id = ?')
			.bind(eventId)
			.first<{ payload_json: string }>();
		if (saved) batch = JSON.parse(saved.payload_json) as typeof batch;
		batch.windowStart ??= state.last_reaction_at;
		if (
			target.email_enabled &&
			!batch.emailSent &&
			!batch.emailDeferred &&
			target.digest_hour_local != null
		) {
			batch.emailDeferred = true;
			await env.DB.batch([
				env.DB.prepare(
					`INSERT INTO notification_events
					(id, user_id, event_type, thread_id, post_id, payload_json, status, created_at, updated_at)
					VALUES (?, ?, 'reaction', ?, ?, ?, 'pending', ?, ?) ON CONFLICT DO NOTHING`
				).bind(
					`${eventId}:email`,
					target.author_id,
					threadId,
					postId,
					JSON.stringify({
						deliveryMode: 'daily_digest',
						windowStart: batch.windowStart,
						cutoff: batch.cutoff
					}),
					now,
					now
				),
				env.DB.prepare(
					'UPDATE notification_events SET payload_json = ?, updated_at = ? WHERE id = ?'
				).bind(JSON.stringify(batch), now, eventId)
			]);
		}
		if (target.email_enabled && !batch.emailSent && !batch.emailDeferred) {
			const template = renderReactionNotificationEmail({
				threadTitle: target.title,
				actors: batch.actors,
				summary: batch.summary,
				postUrl: batch.postUrl
			});
			const sent = await sendEmail(env, { to: target.email, ...template });
			if (!sent.success) throw new Error(sent.error ?? 'Reaction email could not be sent');
			batch.emailSent = true;
			await saveBatch();
		}
		if (target.pushover_user_key && !batch.pushoverQueued) {
			await queuePushoverMessage(env, {
				userId: target.author_id,
				userKey: target.pushover_user_key,
				device: target.pushover_device,
				title: `Reactions: ${target.title}`,
				message: `${batch.actors} reacted to your post: ${batch.summary}`,
				url: batch.postUrl,
				urlTitle: 'Open post',
				eventType: 'reaction',
				threadId,
				postId
			});
			batch.pushoverQueued = true;
			await saveBatch();
		}
		await env.DB.batch([
			env.DB.prepare(
				'UPDATE reaction_notification_state SET last_reaction_at = ? WHERE target_key = ? AND last_notified_at = ?'
			).bind(batch.cutoff, targetKey, now),
			env.DB.prepare(
				"UPDATE notification_events SET failure_reason = NULL, status = 'sent', sent_at = ?, updated_at = ? WHERE id = ?"
			).bind(now, now, eventId)
		]);
	} catch (err) {
		await env.DB.prepare(
			`UPDATE notification_events SET status = 'failed', failure_reason = ?, updated_at = ? WHERE id = ?`
		)
			.bind(err instanceof Error ? err.message : 'Unknown error', now, eventId)
			.run();
		await env.DB.prepare(
			`UPDATE reaction_notification_state SET last_notified_at = ? WHERE target_key = ? AND last_notified_at = ?`
		)
			.bind(state.last_notified_at, targetKey, now)
			.run();
		throw err;
	}
}
