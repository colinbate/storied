import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { EMOJIS } from '$shared/emoji-data';
import { reactionTargetKey, type ReactionSummary } from '$shared/reactions';
import type { ORM } from '$lib/server/db';
import { postReactions } from '$lib/server/db/schema';
import { newId } from '$lib/server/ids';

// Canonicalize presentation selectors so heart and heart + VS16 share a chip.
const emojiOptions = new Map(
	EMOJIS.map((option) => [option.emoji.replaceAll('\uFE0F', ''), option])
);

export function normalizeReactionEmoji(value: string) {
	return emojiOptions.get(value.trim().replaceAll('\uFE0F', ''))?.emoji ?? null;
}

export async function loadReactions(db: ORM, targetKeys: string[], viewerId: string) {
	const summaries: Record<string, ReactionSummary[]> = {};
	if (!targetKeys.length) return summaries;
	const rows = await db
		.select({
			targetKey: postReactions.targetKey,
			emoji: postReactions.emoji,
			count: sql<number>`count(*)`,
			reacted: sql<number>`max(case when ${postReactions.userId} = ${viewerId} then 1 else 0 end)`
		})
		.from(postReactions)
		.where(inArray(postReactions.targetKey, targetKeys))
		.groupBy(postReactions.targetKey, postReactions.emoji)
		.orderBy(asc(sql`min(${postReactions.createdAt})`), asc(postReactions.emoji))
		.all();
	for (const row of rows) {
		(summaries[row.targetKey] ??= []).push({
			emoji: row.emoji,
			name: emojiOptions.get(row.emoji.replaceAll('\uFE0F', ''))?.name ?? row.emoji,
			count: Number(row.count),
			reacted: Boolean(row.reacted)
		});
	}
	return summaries;
}

/** Explicit add/remove operations make repeated requests idempotent. */
export async function setReaction(args: {
	db: ORM;
	threadId: string;
	postId: string | null;
	userId: string;
	emoji: string;
	remove: boolean;
}) {
	const { db, threadId, postId, userId, emoji, remove } = args;
	const targetKey = reactionTargetKey(threadId, postId);
	if (remove) {
		await db
			.delete(postReactions)
			.where(
				and(
					eq(postReactions.targetKey, targetKey),
					eq(postReactions.userId, userId),
					eq(postReactions.emoji, emoji)
				)
			);
		return { added: false, atLimit: false };
	}
	const inserted = await db
		.insert(postReactions)
		.values({
			id: newId(),
			targetKey,
			threadId,
			postId,
			userId,
			emoji
		})
		.onConflictDoNothing()
		.returning({ id: postReactions.id });
	if (inserted.length) return { added: true, atLimit: false };
	const existing = await db
		.select({ id: postReactions.id })
		.from(postReactions)
		.where(
			and(
				eq(postReactions.targetKey, targetKey),
				eq(postReactions.userId, userId),
				eq(postReactions.emoji, emoji)
			)
		)
		.get();
	return { added: false, atLimit: !existing };
}
