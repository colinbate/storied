import assert from 'node:assert/strict';
import test from 'node:test';

import { database } from './database.mjs';
import {
	categories,
	posts,
	subscriptions,
	threadReadStates,
	threads,
	users
} from '../src/lib/server/db/schema.ts';
import { loadDigestContent } from '../workers/storied-worker/src/notifications/scheduled-digest.ts';

const windowStart = '2026-09-08T09:00:00.000Z';

async function createFixture() {
	const context = database();
	const { db } = context;
	await db.insert(users).values([
		{ id: 'reader', email: 'reader@example.test', displayName: 'Reader' },
		{ id: 'ada', email: 'ada@example.test', displayName: 'Ada' },
		{ id: 'grace', email: 'grace@example.test', displayName: 'Grace' }
	]);
	await db.insert(categories).values([
		{ id: 'followed-category', slug: 'followed-category', name: 'Followed category' },
		{ id: 'general-category', slug: 'digest-general', name: 'General' }
	]);
	await db.insert(threads).values([
		{
			id: 'followed-thread',
			categoryId: 'general-category',
			authorUserId: 'ada',
			title: 'Followed thread',
			slug: 'followed-thread',
			bodySource: 'Opening post',
			bodyHtml: '<p>Opening post</p>',
			createdAt: '2026-09-08T08:00:00.000Z',
			updatedAt: '2026-09-08T08:00:00.000Z'
		},
		{
			id: 'other-thread',
			categoryId: 'general-category',
			authorUserId: 'grace',
			title: 'Other thread',
			slug: 'other-thread',
			bodySource: 'Opening post',
			bodyHtml: '<p>Opening post</p>',
			createdAt: '2026-09-08T08:00:00.000Z',
			updatedAt: '2026-09-08T08:00:00.000Z'
		},
		{
			id: 'unseen-thread',
			categoryId: 'general-category',
			authorUserId: 'ada',
			title: 'Unseen thread',
			slug: 'unseen-thread',
			bodySource: 'Opening post',
			bodyHtml: '<p>Opening post</p>',
			createdAt: '2026-09-08T08:00:00.000Z',
			updatedAt: '2026-09-08T08:00:00.000Z'
		},
		{
			id: 'category-thread',
			categoryId: 'followed-category',
			authorUserId: 'ada',
			title: 'Category thread',
			slug: 'category-thread',
			bodySource: 'A new category thread',
			bodyHtml: '<p>A new category thread</p>',
			createdAt: '2026-09-08T11:00:00.000Z',
			updatedAt: '2026-09-08T11:00:00.000Z'
		},
		{
			id: 'forum-thread',
			categoryId: 'general-category',
			authorUserId: 'grace',
			title: 'Forum thread',
			slug: 'forum-thread',
			bodySource: 'A new forum thread',
			bodyHtml: '<p>A new forum thread</p>',
			createdAt: '2026-09-08T12:00:00.000Z',
			updatedAt: '2026-09-08T12:00:00.000Z'
		}
	]);
	await db.insert(subscriptions).values([
		{
			id: 'follow-thread',
			userId: 'reader',
			threadId: 'followed-thread',
			mode: 'daily_digest'
		},
		{
			id: 'follow-category',
			userId: 'reader',
			categoryId: 'followed-category',
			mode: 'daily_digest'
		}
	]);
	await db.insert(posts).values([
		{
			id: 'post-followed-read',
			threadId: 'followed-thread',
			authorUserId: 'ada',
			bodySource: 'Already read in followed thread',
			bodyHtml: '<p>Already read in followed thread</p>',
			createdAt: '2026-09-08T10:00:00.000Z',
			updatedAt: '2026-09-08T10:00:00.000Z'
		},
		{
			id: 'post-followed-before-own',
			threadId: 'followed-thread',
			authorUserId: 'ada',
			bodySource: 'Seen before my reply',
			bodyHtml: '<p>Seen before my reply</p>',
			createdAt: '2026-09-08T10:15:00.000Z',
			updatedAt: '2026-09-08T10:15:00.000Z'
		},
		{
			id: 'post-followed-unread',
			threadId: 'followed-thread',
			authorUserId: 'ada',
			bodySource: 'Unread in followed thread',
			bodyHtml: '<p>Unread in followed thread</p>',
			createdAt: '2026-09-08T11:00:00.000Z',
			updatedAt: '2026-09-08T11:00:00.000Z'
		},
		{
			id: 'post-followed-own',
			threadId: 'followed-thread',
			authorUserId: 'reader',
			bodySource: 'My reply',
			bodyHtml: '<p>My reply</p>',
			createdAt: '2026-09-08T10:30:00.000Z',
			updatedAt: '2026-09-08T10:30:00.000Z'
		},
		{
			id: 'post-other-read',
			threadId: 'other-thread',
			authorUserId: 'grace',
			bodySource: 'Already read in other thread',
			bodyHtml: '<p>Already read in other thread</p>',
			createdAt: '2026-09-08T10:30:00.000Z',
			updatedAt: '2026-09-08T10:30:00.000Z'
		},
		{
			id: 'post-other-unread',
			threadId: 'other-thread',
			authorUserId: 'grace',
			bodySource: 'Unread in other thread',
			bodyHtml: '<p>Unread in other thread</p>',
			createdAt: '2026-09-08T11:30:00.000Z',
			updatedAt: '2026-09-08T11:30:00.000Z'
		},
		{
			id: 'post-unseen-thread',
			threadId: 'unseen-thread',
			authorUserId: 'ada',
			bodySource: 'Unread in a separate thread',
			bodyHtml: '<p>Unread in a separate thread</p>',
			createdAt: '2026-09-08T10:20:00.000Z',
			updatedAt: '2026-09-08T10:20:00.000Z'
		}
	]);
	await db.insert(threadReadStates).values([
		{
			userId: 'reader',
			threadId: 'followed-thread',
			lastReadPostId: 'post-followed-read',
			lastReadPostCreatedAt: '2026-09-08T10:00:00.000Z'
		},
		{
			userId: 'reader',
			threadId: 'other-thread',
			lastReadPostId: 'post-other-read',
			lastReadPostCreatedAt: '2026-09-08T10:30:00.000Z'
		}
	]);

	return context;
}

test('digest content is unread per thread and does not repeat followed activity', async () => {
	const { binding } = await createFixture();
	const content = await loadDigestContent({ DB: binding }, 'reader', windowStart);

	assert.deepEqual(
		content.followedThreads.map((thread) => ({
			id: thread.threadId,
			posts: thread.posts.map((post) => post.bodyPreview)
		})),
		[{ id: 'followed-thread', posts: ['Unread in followed thread'] }]
	);
	assert.deepEqual(
		content.followedCategories.map((category) => category.threads.map((thread) => thread.threadId)),
		[['category-thread']]
	);
	assert.deepEqual(content.siteCounts, { newThreads: 1, newPosts: 2 });
	assert.deepEqual(
		content.siteActivity.map((item) =>
			item.kind === 'post' ? `post:${item.postId}` : `thread:${item.threadSlug}`
		),
		['thread:forum-thread', 'post:post-other-unread', 'post:post-unseen-thread']
	);
});
