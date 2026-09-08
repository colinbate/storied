import assert from 'node:assert/strict';
import test from 'node:test';
import { and, eq } from 'drizzle-orm';

import { database } from './database.mjs';
import {
	categories,
	posts,
	threadReadStates,
	threads,
	users
} from '../src/lib/server/db/schema.ts';
import {
	advanceThreadReadState,
	loadThreadPostPage,
	THREAD_POST_PAGE_SIZE
} from '../src/lib/server/thread-view.ts';
import { withThreadReadContext } from '../src/lib/server/discussions.ts';

async function fixture(replyCount = 65) {
	const context = database();
	const { db } = context;
	await db.insert(users).values([
		{ id: 'reader', email: 'reader@example.test', displayName: 'Reader' },
		{ id: 'author', email: 'author@example.test', displayName: 'Author' }
	]);
	await db.insert(categories).values({ id: 'category', slug: 'category', name: 'Category' });
	await db.insert(threads).values({
		id: 'thread',
		categoryId: 'category',
		authorUserId: 'author',
		title: 'A long discussion',
		slug: 'long-discussion',
		bodySource: 'Opening post',
		bodyHtml: '<p>Opening post</p>',
		replyCount
	});
	await addReplies(db, 0, replyCount);
	return context;
}

async function addReplies(db, start, count) {
	const base = Date.parse('2026-01-01T00:00:00.000Z');
	await db.insert(posts).values(
		Array.from({ length: count }, (_, offset) => {
			const index = start + offset;
			return {
				id: `post-${String(index).padStart(3, '0')}`,
				threadId: 'thread',
				authorUserId: 'author',
				bodySource: `Reply ${index}`,
				bodyHtml: `<p>Reply ${index}</p>`,
				createdAt: new Date(base + index * 60_000).toISOString(),
				updatedAt: new Date(base + index * 60_000).toISOString()
			};
		})
	);
}

test('thread pages begin at recent replies, then continue from the first unread reply', async () => {
	const { db } = await fixture();

	const firstVisit = await loadThreadPostPage({
		db,
		threadId: 'thread',
		userId: 'reader'
	});
	assert.equal(THREAD_POST_PAGE_SIZE, 30);
	assert.equal(firstVisit.pagination.page, 3);
	assert.equal(firstVisit.pagination.totalPosts, 65);
	assert.equal(firstVisit.posts[0].post.id, 'post-060');
	assert.equal(firstVisit.pagination.firstUnreadPostId, null);
	await advanceThreadReadState(db, {
		userId: 'reader',
		threadId: 'thread',
		post: firstVisit.posts.at(-1).post
	});

	await addReplies(db, 65, 40);
	const returnVisit = await loadThreadPostPage({
		db,
		threadId: 'thread',
		userId: 'reader'
	});
	assert.equal(returnVisit.pagination.page, 3);
	assert.equal(returnVisit.pagination.firstUnreadPostId, 'post-065');
	assert.equal(returnVisit.pagination.unreadCount, 40);
	assert.equal(returnVisit.pagination.hasNewer, true);
	assert.equal(returnVisit.posts.at(-1).post.id, 'post-089');
	await advanceThreadReadState(db, {
		userId: 'reader',
		threadId: 'thread',
		post: returnVisit.posts.at(-1).post
	});

	const nextVisit = await loadThreadPostPage({
		db,
		threadId: 'thread',
		userId: 'reader'
	});
	assert.equal(nextVisit.pagination.page, 4);
	assert.equal(nextVisit.pagination.firstUnreadPostId, 'post-090');
	assert.equal(nextVisit.pagination.unreadCount, 15);
	assert.equal(nextVisit.posts.at(-1).post.id, 'post-104');
});

test('focused post links select the containing page without moving read state backwards', async () => {
	const { db } = await fixture();
	const firstVisit = await loadThreadPostPage({ db, threadId: 'thread', userId: 'reader' });
	await advanceThreadReadState(db, {
		userId: 'reader',
		threadId: 'thread',
		post: firstVisit.posts.at(-1).post
	});

	const focused = await loadThreadPostPage({
		db,
		threadId: 'thread',
		userId: 'reader',
		focusPostId: 'post-005'
	});
	assert.equal(focused.pagination.page, 1);
	assert.equal(focused.posts[5].post.id, 'post-005');
	await advanceThreadReadState(db, {
		userId: 'reader',
		threadId: 'thread',
		post: focused.posts.at(-1).post
	});

	const readState = await db
		.select()
		.from(threadReadStates)
		.where(and(eq(threadReadStates.userId, 'reader'), eq(threadReadStates.threadId, 'thread')))
		.get();
	assert.equal(readState.lastReadPostId, 'post-064');
});

test('a member’s own replies do not count as unread', async () => {
	const { db } = await fixture(2);
	const firstVisit = await loadThreadPostPage({ db, threadId: 'thread', userId: 'reader' });
	await advanceThreadReadState(db, {
		userId: 'reader',
		threadId: 'thread',
		post: firstVisit.posts.at(-1).post
	});

	const base = Date.parse('2026-01-01T00:00:00.000Z');
	await db.insert(posts).values([
		{
			id: 'post-002',
			threadId: 'thread',
			authorUserId: 'reader',
			bodySource: 'My reply',
			bodyHtml: '<p>My reply</p>',
			createdAt: new Date(base + 2 * 60_000).toISOString(),
			updatedAt: new Date(base + 2 * 60_000).toISOString()
		},
		{
			id: 'post-003',
			threadId: 'thread',
			authorUserId: 'author',
			bodySource: 'Another reply',
			bodyHtml: '<p>Another reply</p>',
			createdAt: new Date(base + 3 * 60_000).toISOString(),
			updatedAt: new Date(base + 3 * 60_000).toISOString()
		}
	]);

	const returnVisit = await loadThreadPostPage({ db, threadId: 'thread', userId: 'reader' });
	assert.equal(returnVisit.pagination.firstUnreadPostId, 'post-003');
	assert.equal(returnVisit.pagination.unreadCount, 1);

	const [listed] = await withThreadReadContext(db, 'reader', [{ thread: { id: 'thread' } }]);
	assert.equal(listed.unreadCount, 1);
	assert.equal(listed.firstUnreadPostId, 'post-003');
});
