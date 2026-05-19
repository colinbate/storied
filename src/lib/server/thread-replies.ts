import { and, eq } from 'drizzle-orm';

import { detectSubjectLinks } from '$lib/server/book-links';
import type { ORM } from '$lib/server/db';
import {
	posts,
	subjectSources,
	subscriptions,
	threads,
	threadSubjects,
	type SubjectType
} from '$lib/server/db/schema';
import { newId } from '$lib/server/ids';
import { findMentionedUserIds, listActiveMentionableUsers } from '$lib/server/mentions';
import { renderMarkdown } from '$lib/server/markdown';
import { getOrCreateNotificationPreferences } from '$lib/server/notification-preferences';
import { publishWorkerMessage } from '$lib/server/worker-queue';
import type { SubjectSourceType } from '$shared/worker-messages';

export type QueuedSubjectLink = {
	sourceType: 'goodreads' | 'goodreads-series' | 'goodreads-author';
	sourceKey: string;
	subjectKind: 'book' | 'series' | 'author';
};

export async function createThreadReply(args: {
	db: ORM;
	platform: App.Platform | undefined;
	thread: typeof threads.$inferSelect;
	authorUserId: string;
	bodySource: string;
	baseUrl: string;
	parentPostId?: string | null;
	processSubjectLinks?: boolean;
}) {
	const postId = newId();
	const now = new Date().toISOString();

	await args.db.insert(posts).values({
		id: postId,
		threadId: args.thread.id,
		authorUserId: args.authorUserId,
		parentPostId: args.parentPostId ?? null,
		bodySource: args.bodySource,
		bodyHtml: renderMarkdown(args.bodySource)
	});

	await args.db
		.update(threads)
		.set({
			replyCount: args.thread.replyCount + 1,
			lastPostAt: now,
			updatedAt: now
		})
		.where(eq(threads.id, args.thread.id));

	await autoSubscribeReplyAuthor(args.db, args.authorUserId, args.thread.id);

	const queuedSubjectLinks = args.processSubjectLinks
		? await processReplySubjectLinks({
				db: args.db,
				platform: args.platform,
				threadId: args.thread.id,
				postId,
				bodySource: args.bodySource,
				authorUserId: args.authorUserId
			})
		: [];

	const mentionedUserIds = findMentionedUserIds(
		args.bodySource,
		await listActiveMentionableUsers(args.db)
	);

	await publishWorkerMessage(args.platform?.env.STORIED_WORKER, 'notifications.thread-reply', {
		threadId: args.thread.id,
		postId,
		replyAuthorUserId: args.authorUserId,
		mentionedUserIds,
		baseUrl: args.baseUrl
	});

	return { postId, queuedSubjectLinks };
}

async function autoSubscribeReplyAuthor(db: ORM, userId: string, threadId: string) {
	const existingSub = await db
		.select()
		.from(subscriptions)
		.where(and(eq(subscriptions.userId, userId), eq(subscriptions.threadId, threadId)))
		.get();

	if (existingSub) return;

	const prefs = await getOrCreateNotificationPreferences(db, userId);
	if (!prefs.autoSubscribeOwn) return;

	await db.insert(subscriptions).values({
		id: newId(),
		userId,
		threadId,
		mode: prefs.defaultSubMode
	});
}

async function processReplySubjectLinks(args: {
	db: ORM;
	platform: App.Platform | undefined;
	threadId: string;
	postId: string;
	bodySource: string;
	authorUserId: string;
}): Promise<QueuedSubjectLink[]> {
	const detectedLinks = detectSubjectLinks(args.bodySource);
	const queuedSubjectLinks: QueuedSubjectLink[] = [];

	for (let i = 0; i < detectedLinks.length; i++) {
		const link = detectedLinks[i];

		const existingSource = await args.db
			.select()
			.from(subjectSources)
			.where(
				and(
					eq(subjectSources.sourceType, link.sourceType),
					eq(subjectSources.sourceKey, link.sourceKey)
				)
			)
			.get();

		let resolvedSubjectType: string | null = null;
		let resolvedSubjectId: string | null = null;

		if (existingSource) {
			resolvedSubjectType = existingSource.subjectType;
			resolvedSubjectId = existingSource.subjectId;

			if (!resolvedSubjectId) {
				await queueSubjectResolution({
					platform: args.platform,
					subjectSourceId: existingSource.id,
					sourceType: link.sourceType,
					sourceUrl: link.url,
					sourceKey: link.sourceKey,
					threadId: args.threadId,
					postId: args.postId
				});
				queuedSubjectLinks.push({
					sourceType: link.sourceType,
					sourceKey: link.sourceKey,
					subjectKind: link.subjectKind
				});
			}
		} else {
			const subjectSourceId = newId();
			await args.db.insert(subjectSources).values({
				id: subjectSourceId,
				sourceType: link.sourceType,
				sourceUrl: link.url,
				sourceKey: link.sourceKey,
				fetchStatus: 'pending'
			});

			await queueSubjectResolution({
				platform: args.platform,
				subjectSourceId,
				sourceType: link.sourceType,
				sourceUrl: link.url,
				sourceKey: link.sourceKey,
				threadId: args.threadId,
				postId: args.postId
			});
			queuedSubjectLinks.push({
				sourceType: link.sourceType,
				sourceKey: link.sourceKey,
				subjectKind: link.subjectKind
			});
		}

		if (resolvedSubjectType && resolvedSubjectId) {
			await args.db
				.insert(threadSubjects)
				.values({
					id: newId(),
					threadId: args.threadId,
					postId: args.postId,
					subjectType: resolvedSubjectType as SubjectType,
					subjectId: resolvedSubjectId,
					displayOrder: i,
					context: 'linked',
					addedBy: args.authorUserId
				})
				.onConflictDoNothing();
		}
	}

	return queuedSubjectLinks;
}

async function queueSubjectResolution(args: {
	platform: App.Platform | undefined;
	subjectSourceId: string;
	sourceType: QueuedSubjectLink['sourceType'];
	sourceUrl: string;
	sourceKey: string;
	threadId: string;
	postId: string;
}) {
	await publishWorkerMessage(args.platform?.env.STORIED_WORKER, 'subject.resolve', {
		subjectSourceId: args.subjectSourceId,
		sourceType: args.sourceType as SubjectSourceType,
		sourceUrl: args.sourceUrl,
		sourceKey: args.sourceKey,
		threadId: args.threadId,
		postId: args.postId
	});
}
