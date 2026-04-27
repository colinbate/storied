import { and, eq, isNull } from 'drizzle-orm';

import type { ORM } from '$lib/server/db';
import { categories, threads } from '$lib/server/db/schema';
import { newId } from '$lib/server/ids';
import { renderMarkdown } from '$lib/server/markdown';
import { slugify } from '$lib/server/slugify';

export const SESSION_DISCUSSIONS_CATEGORY_ID = 'cat_session_discussions';
export const ANNOUNCEMENTS_CATEGORY_ID = 'cat_announcements';

export function buildSessionDiscussionBody(args: { title: string; themeTitle?: string | null }) {
	const lines = [`Discussion for **${args.title}**.`];

	if (args.themeTitle?.trim()) {
		lines.push('', `Theme: **${args.themeTitle.trim()}**`);
	}

	lines.push(
		'',
		'Use this thread for questions, reactions, reading notes, recommendations, and follow-up discussion related to this session.'
	);

	return lines.join('\n');
}

export async function createPrimarySessionThread(args: {
	db: ORM;
	session: { id: string; title: string; themeTitle?: string | null };
	authorUserId: string;
}) {
	const now = new Date().toISOString();
	const threadId = newId();
	const bodySource = buildSessionDiscussionBody(args.session);
	const slug = await createUniqueThreadSlug(args.db, args.session.title);

	await args.db.insert(threads).values({
		id: threadId,
		categoryId: SESSION_DISCUSSIONS_CATEGORY_ID,
		authorUserId: args.authorUserId,
		sessionId: args.session.id,
		sessionThreadRole: 'primary',
		title: args.session.title,
		slug,
		bodySource,
		bodyHtml: renderMarkdown(bodySource),
		visibility: 'members',
		lastPostAt: now
	});

	return { id: threadId, slug, bodySource };
}

export async function createUniqueThreadSlug(db: ORM, title: string) {
	const baseSlug = slugify(title);
	let slug = baseSlug;
	let suffix = 2;

	while (true) {
		const existing = await db
			.select({ id: threads.id })
			.from(threads)
			.where(eq(threads.slug, slug))
			.get();
		if (!existing) return slug;
		slug = `${baseSlug}-${suffix}`;
		suffix += 1;
	}
}

export async function getCategoryById(db: ORM, categoryId: string) {
	return db.select().from(categories).where(eq(categories.id, categoryId)).get();
}

export function isAnnouncementsCategory(categoryId: string) {
	return categoryId === ANNOUNCEMENTS_CATEGORY_ID;
}

export function isSessionDiscussionsCategory(categoryId: string) {
	return categoryId === SESSION_DISCUSSIONS_CATEGORY_ID;
}

export async function getPrimaryThreadForSession(db: ORM, sessionId: string) {
	return db
		.select()
		.from(threads)
		.where(
			and(
				eq(threads.sessionId, sessionId),
				eq(threads.sessionThreadRole, 'primary'),
				eq(threads.categoryId, SESSION_DISCUSSIONS_CATEGORY_ID),
				isNull(threads.deletedAt)
			)
		)
		.get();
}

export type ThreadParticipant = {
	id: string;
	displayName: string;
	avatarUrl: string | null;
	lastActivityAt: string;
};

export type ThreadListSqlRow = {
	threadId: string;
	threadCategoryId: string;
	threadAuthorUserId: string;
	threadSessionId: string | null;
	threadSessionThreadRole: string | null;
	threadTitle: string;
	threadSlug: string;
	threadBodySource: string;
	threadBodyHtml: string;
	threadVisibility: string;
	threadIsLocked: number;
	threadIsPinned: number;
	threadReplyCount: number;
	threadLastPostAt: string | null;
	threadDeletedAt: string | null;
	threadCreatedAt: string;
	threadUpdatedAt: string;
	authorId: string;
	authorDisplayName: string;
	authorAvatarUrl: string | null;
	participantsJson: string | null;
};

export function mapThreadListSqlRow(row: ThreadListSqlRow) {
	return {
		thread: {
			id: row.threadId,
			categoryId: row.threadCategoryId,
			authorUserId: row.threadAuthorUserId,
			sessionId: row.threadSessionId,
			sessionThreadRole: row.threadSessionThreadRole,
			title: row.threadTitle,
			slug: row.threadSlug,
			bodySource: row.threadBodySource,
			bodyHtml: row.threadBodyHtml,
			visibility: row.threadVisibility,
			isLocked: Boolean(row.threadIsLocked),
			isPinned: Boolean(row.threadIsPinned),
			replyCount: row.threadReplyCount,
			lastPostAt: row.threadLastPostAt,
			deletedAt: row.threadDeletedAt,
			createdAt: row.threadCreatedAt,
			updatedAt: row.threadUpdatedAt
		},
		author: {
			id: row.authorId,
			displayName: row.authorDisplayName,
			avatarUrl: row.authorAvatarUrl
		},
		participants: parseThreadParticipants(row.participantsJson)
	};
}

export function parseThreadParticipants(value: string | null | undefined): ThreadParticipant[] {
	if (!value) return [];

	try {
		const parsed = JSON.parse(value) as ThreadParticipant[];
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
}
