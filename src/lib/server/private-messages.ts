import { error, fail } from '@sveltejs/kit';
import { and, asc, eq, isNull, ne, sql } from 'drizzle-orm';

import type { ORM } from '$lib/server/db';
import {
	conversationMembers,
	conversations,
	directConversationKeys,
	privateMessages,
	users
} from '$lib/server/db/schema';
import { newId } from '$lib/server/ids';
import { renderMarkdown } from '$lib/server/markdown';
import { publishWorkerMessage } from '$lib/server/worker-queue';

const MAX_MESSAGE_LENGTH = 10_000;

export type InboxConversation = {
	conversationId: string;
	otherUserId: string;
	otherDisplayName: string;
	otherAvatarUrl: string | null;
	lastMessageBodySource: string | null;
	lastMessageAt: string | null;
	unread: boolean;
	muted: boolean;
};

export type ConversationMessage = {
	message: typeof privateMessages.$inferSelect;
	author: {
		id: string;
		displayName: string;
		avatarUrl: string | null;
	};
};

function directKey(userId: string, otherUserId: string) {
	return [userId, otherUserId].sort() as [string, string];
}

function messageSnippet(source: string | null) {
	if (!source) return null;
	const snippet = source.replace(/\s+/g, ' ').trim();
	return snippet.length > 160 ? `${snippet.slice(0, 157)}...` : snippet;
}

export async function requireActiveUser(db: ORM, userId: string) {
	const user = await db
		.select({
			id: users.id,
			displayName: users.displayName,
			avatarUrl: users.avatarUrl,
			status: users.status
		})
		.from(users)
		.where(eq(users.id, userId))
		.get();

	if (!user || user.status !== 'active') {
		throw error(403, 'Only active members can use messages.');
	}

	return user;
}

export async function getOrCreateDirectConversation(db: ORM, userId: string, otherUserId: string) {
	if (userId === otherUserId) {
		throw error(400, 'You cannot message yourself.');
	}

	await requireActiveUser(db, userId);
	await requireActiveUser(db, otherUserId);

	const [userAId, userBId] = directKey(userId, otherUserId);
	const existing = await db
		.select({ conversationId: directConversationKeys.conversationId })
		.from(directConversationKeys)
		.where(
			and(eq(directConversationKeys.userAId, userAId), eq(directConversationKeys.userBId, userBId))
		)
		.get();

	if (existing) return { conversationId: existing.conversationId };

	const conversationId = newId();

	await db.insert(conversations).values({
		id: conversationId,
		kind: 'direct',
		createdByUserId: userId
	});

	await db.insert(conversationMembers).values([
		{ conversationId, userId },
		{ conversationId, userId: otherUserId }
	]);

	await db
		.insert(directConversationKeys)
		.values({ userAId, userBId, conversationId })
		.onConflictDoNothing();

	const key = await db
		.select({ conversationId: directConversationKeys.conversationId })
		.from(directConversationKeys)
		.where(
			and(eq(directConversationKeys.userAId, userAId), eq(directConversationKeys.userBId, userBId))
		)
		.get();

	return { conversationId: key?.conversationId ?? conversationId };
}

export async function getInboxConversations(db: ORM, userId: string): Promise<InboxConversation[]> {
	const rows = await db.all<{
		conversationId: string;
		otherUserId: string;
		otherDisplayName: string;
		otherAvatarUrl: string | null;
		lastMessageBodySource: string | null;
		lastMessageAt: string | null;
		lastReadAt: string | null;
		mutedAt: string | null;
	}>(sql`
		SELECT
			c.id AS conversationId,
			other_user.id AS otherUserId,
			other_user.display_name AS otherDisplayName,
			other_user.avatar_url AS otherAvatarUrl,
			last_message.body_source AS lastMessageBodySource,
			last_message.created_at AS lastMessageAt,
			cm.last_read_at AS lastReadAt,
			cm.muted_at AS mutedAt
		FROM conversation_members cm
		INNER JOIN conversations c ON c.id = cm.conversation_id
		INNER JOIN conversation_members other_member
			ON other_member.conversation_id = c.id
			AND other_member.user_id <> cm.user_id
		INNER JOIN users other_user ON other_user.id = other_member.user_id
		LEFT JOIN private_messages last_message
			ON last_message.id = (
				SELECT pm.id
				FROM private_messages pm
				WHERE pm.conversation_id = c.id
					AND pm.deleted_at IS NULL
				ORDER BY pm.created_at DESC
				LIMIT 1
			)
		WHERE cm.user_id = ${userId}
			AND cm.archived_at IS NULL
		ORDER BY c.last_message_at DESC NULLS LAST, c.created_at DESC
	`);

	return rows.map((row) => ({
		conversationId: row.conversationId,
		otherUserId: row.otherUserId,
		otherDisplayName: row.otherDisplayName,
		otherAvatarUrl: row.otherAvatarUrl,
		lastMessageBodySource: messageSnippet(row.lastMessageBodySource),
		lastMessageAt: row.lastMessageAt,
		unread: Boolean(row.lastMessageAt && (!row.lastReadAt || row.lastMessageAt > row.lastReadAt)),
		muted: Boolean(row.mutedAt)
	}));
}

export async function loadConversation(db: ORM, conversationId: string, userId: string) {
	const membership = await db
		.select()
		.from(conversationMembers)
		.where(
			and(
				eq(conversationMembers.conversationId, conversationId),
				eq(conversationMembers.userId, userId)
			)
		)
		.get();

	if (!membership) throw error(404, 'Conversation not found');

	const [conversation, otherMember, messages] = await Promise.all([
		db.select().from(conversations).where(eq(conversations.id, conversationId)).get(),
		db
			.select({
				id: users.id,
				displayName: users.displayName,
				avatarUrl: users.avatarUrl,
				status: users.status
			})
			.from(conversationMembers)
			.innerJoin(users, eq(users.id, conversationMembers.userId))
			.where(
				and(
					eq(conversationMembers.conversationId, conversationId),
					ne(conversationMembers.userId, userId)
				)
			)
			.get(),
		db
			.select({
				message: privateMessages,
				author: {
					id: users.id,
					displayName: users.displayName,
					avatarUrl: users.avatarUrl
				}
			})
			.from(privateMessages)
			.innerJoin(users, eq(users.id, privateMessages.authorUserId))
			.where(
				and(eq(privateMessages.conversationId, conversationId), isNull(privateMessages.deletedAt))
			)
			.orderBy(asc(privateMessages.createdAt))
			.all()
	]);

	if (!conversation || !otherMember) throw error(404, 'Conversation not found');

	const lastMessage = messages.at(-1)?.message ?? null;
	if (lastMessage) {
		const now = new Date().toISOString();
		await db
			.update(conversationMembers)
			.set({ lastReadMessageId: lastMessage.id, lastReadAt: now })
			.where(
				and(
					eq(conversationMembers.conversationId, conversationId),
					eq(conversationMembers.userId, userId)
				)
			);
	}

	return {
		conversation,
		membership: {
			...membership,
			lastReadMessageId: lastMessage?.id ?? membership.lastReadMessageId,
			lastReadAt: lastMessage ? new Date().toISOString() : membership.lastReadAt
		},
		otherMember,
		messages
	};
}

export async function sendPrivateMessage(
	db: ORM,
	args: {
		platform: App.Platform | undefined;
		conversationId: string;
		authorUserId: string;
		bodySource: string;
		baseUrl: string;
	}
) {
	await requireActiveUser(db, args.authorUserId);

	const bodySource = args.bodySource.trim();
	if (!bodySource) return fail(400, { error: 'Message cannot be empty.' });
	if (bodySource.length > MAX_MESSAGE_LENGTH) {
		return fail(400, { error: `Message must be ${MAX_MESSAGE_LENGTH} characters or fewer.` });
	}

	const membership = await db
		.select()
		.from(conversationMembers)
		.where(
			and(
				eq(conversationMembers.conversationId, args.conversationId),
				eq(conversationMembers.userId, args.authorUserId)
			)
		)
		.get();

	if (!membership) throw error(404, 'Conversation not found');

	const recipient = await db
		.select({
			userId: conversationMembers.userId,
			mutedAt: conversationMembers.mutedAt
		})
		.from(conversationMembers)
		.where(
			and(
				eq(conversationMembers.conversationId, args.conversationId),
				ne(conversationMembers.userId, args.authorUserId)
			)
		)
		.get();

	if (!recipient) throw error(404, 'Conversation not found');

	const now = new Date().toISOString();
	const messageId = newId();

	await db.insert(privateMessages).values({
		id: messageId,
		conversationId: args.conversationId,
		authorUserId: args.authorUserId,
		bodySource,
		bodyHtml: renderMarkdown(bodySource),
		createdAt: now,
		updatedAt: now
	});

	await db
		.update(conversations)
		.set({ lastMessageAt: now, updatedAt: now })
		.where(eq(conversations.id, args.conversationId));

	await db
		.update(conversationMembers)
		.set({ archivedAt: null })
		.where(eq(conversationMembers.conversationId, args.conversationId));

	await db
		.update(conversationMembers)
		.set({ lastReadMessageId: messageId, lastReadAt: now })
		.where(
			and(
				eq(conversationMembers.conversationId, args.conversationId),
				eq(conversationMembers.userId, args.authorUserId)
			)
		);

	if (!recipient.mutedAt) {
		await publishWorkerMessage(args.platform?.env.STORIED_WORKER, 'notifications.private-message', {
			conversationId: args.conversationId,
			messageId,
			authorUserId: args.authorUserId,
			recipientUserId: recipient.userId,
			baseUrl: args.baseUrl
		});
	}

	return { sent: true, messageId };
}

export async function setConversationMuted(
	db: ORM,
	args: {
		conversationId: string;
		userId: string;
		muted: boolean;
	}
) {
	const membership = await db
		.select()
		.from(conversationMembers)
		.where(
			and(
				eq(conversationMembers.conversationId, args.conversationId),
				eq(conversationMembers.userId, args.userId)
			)
		)
		.get();

	if (!membership) throw error(404, 'Conversation not found');

	await db
		.update(conversationMembers)
		.set({ mutedAt: args.muted ? new Date().toISOString() : null })
		.where(
			and(
				eq(conversationMembers.conversationId, args.conversationId),
				eq(conversationMembers.userId, args.userId)
			)
		);

	return { muted: args.muted };
}

export async function archiveConversation(db: ORM, conversationId: string, userId: string) {
	const membership = await db
		.select()
		.from(conversationMembers)
		.where(
			and(
				eq(conversationMembers.conversationId, conversationId),
				eq(conversationMembers.userId, userId)
			)
		)
		.get();

	if (!membership) throw error(404, 'Conversation not found');

	await db
		.update(conversationMembers)
		.set({ archivedAt: new Date().toISOString() })
		.where(
			and(
				eq(conversationMembers.conversationId, conversationId),
				eq(conversationMembers.userId, userId)
			)
		);
}
