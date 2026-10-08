import type { Env } from '../env';
import { spoilerSafeExcerpt } from '$shared/spoilers';
import type { DigestPersonalActivityItem } from './email';

/** Deferred email has its own ledger entry, independent of reaction push delivery. */
export async function loadPersonalDigestActivity(env: Env, userId: string, now: string) {
	const { results: events = [] } = await env.DB.prepare(
		`SELECT id FROM notification_events
		WHERE user_id = ? AND status = 'pending' AND created_at <= ?
		AND event_type IN ('private_message', 'reaction')
		AND json_extract(payload_json, '$.deliveryMode') = 'daily_digest'
		ORDER BY created_at, id LIMIT 100`
	)
		.bind(userId, now)
		.all<{ id: string }>();
	const eventIds = events.map((event) => event.id);
	if (!eventIds.length) return { activity: [] as DigestPersonalActivityItem[], eventIds };
	const ids = JSON.stringify(eventIds);
	const [messages, reactions] = await Promise.all([
		env.DB.prepare(
			`SELECT pm.conversation_id, pm.body_source, author.display_name
			FROM notification_events event
			JOIN private_messages pm ON pm.id = json_extract(event.payload_json, '$.messageId')
				AND pm.conversation_id = json_extract(event.payload_json, '$.conversationId')
			JOIN conversation_members cm ON cm.conversation_id = pm.conversation_id AND cm.user_id = event.user_id
			JOIN users author ON author.id = pm.author_user_id
			WHERE event.id IN (SELECT value FROM json_each(?)) AND event.event_type = 'private_message'
			AND event.status = 'pending' AND pm.deleted_at IS NULL AND cm.muted_at IS NULL
			AND (cm.last_read_at IS NULL OR pm.created_at > cm.last_read_at)
			ORDER BY pm.created_at, pm.id`
		)
			.bind(ids)
			.all<{ conversation_id: string; body_source: string; display_name: string }>(),
		env.DB.prepare(
			`SELECT t.id AS thread_id, t.slug, t.title, event.post_id, r.emoji, r.user_id, actor.display_name
			FROM notification_events event
			JOIN threads t ON t.id = event.thread_id
			LEFT JOIN posts p ON p.id = event.post_id AND p.thread_id = t.id
			JOIN users recipient ON recipient.id = event.user_id
			JOIN post_reactions r ON r.thread_id = t.id AND r.post_id IS event.post_id
				AND r.created_at > json_extract(event.payload_json, '$.windowStart')
				AND r.created_at <= json_extract(event.payload_json, '$.cutoff')
			JOIN users actor ON actor.id = r.user_id
			WHERE event.id IN (SELECT value FROM json_each(?)) AND event.event_type = 'reaction'
			AND event.status = 'pending' AND t.deleted_at IS NULL AND (event.post_id IS NULL OR (p.id IS NOT NULL AND p.deleted_at IS NULL))
			AND COALESCE(p.author_user_id, t.author_user_id) = event.user_id AND r.user_id != event.user_id
			AND (t.visibility != 'admins' OR recipient.role IN ('admin', 'moderator'))
			AND (t.audience_group_id IS NULL OR recipient.role IN ('admin', 'moderator') OR EXISTS (
				SELECT 1 FROM group_memberships gm WHERE gm.group_id = t.audience_group_id AND gm.user_id = event.user_id))
			AND NOT EXISTS (SELECT 1 FROM sessions se WHERE se.id = t.session_id AND se.status = 'draft')
			AND NOT EXISTS (SELECT 1 FROM subscriptions sub WHERE sub.user_id = event.user_id AND sub.thread_id = t.id AND sub.mode = 'mute')
			ORDER BY event.created_at, r.created_at, r.id`
		)
			.bind(ids)
			.all<{
				thread_id: string;
				slug: string;
				title: string;
				post_id: string | null;
				emoji: string;
				user_id: string;
				display_name: string;
			}>()
	]);
	const conversations = new Map<
		string,
		Extract<DigestPersonalActivityItem, { kind: 'private_message' }>
	>();
	for (const row of messages.results ?? []) {
		const previous = conversations.get(row.conversation_id);
		conversations.set(row.conversation_id, {
			kind: 'private_message',
			conversationId: row.conversation_id,
			authorDisplayName: row.display_name,
			messageCount: (previous?.messageCount ?? 0) + 1,
			bodyPreview: spoilerSafeExcerpt(row.body_source, { maxLength: 200 }) ?? ''
		});
	}
	const targets = new Map<
		string,
		{
			item: Extract<DigestPersonalActivityItem, { kind: 'reaction' }>;
			people: Map<string, string>;
			counts: Map<string, number>;
		}
	>();
	for (const row of reactions.results ?? []) {
		const key = row.post_id ?? `thread:${row.thread_id}`;
		let target = targets.get(key);
		if (!target) {
			target = {
				item: {
					kind: 'reaction',
					threadSlug: row.slug,
					threadTitle: row.title,
					postId: row.post_id,
					actors: '',
					summary: ''
				},
				people: new Map(),
				counts: new Map()
			};
			targets.set(key, target);
		}
		target.people.set(row.user_id, row.display_name);
		target.counts.set(row.emoji, (target.counts.get(row.emoji) ?? 0) + 1);
	}
	const activity: DigestPersonalActivityItem[] = [...conversations.values()];
	for (const { item, people, counts } of targets.values()) {
		const names = [...people.values()];
		item.actors =
			names.length <= 3
				? names.join(', ')
				: `${names.slice(0, 3).join(', ')} and ${names.length - 3} others`;
		item.summary = [...counts].map(([emoji, count]) => `${emoji} ${count}`).join('  ');
		activity.push(item);
	}
	// Invalid, read, or muted events are also consumed so they cannot resurface later.
	return { activity, eventIds };
}
