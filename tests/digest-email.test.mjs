import assert from 'node:assert/strict';
import test from 'node:test';

import { renderDigestEmail } from '../workers/storied-worker/src/notifications/email.ts';

const baseArgs = {
	displayName: 'Reader',
	windowStart: '2026-09-07T12:00:00.000Z',
	followedThreads: [],
	followedCategories: [],
	baseUrl: 'https://example.test'
};

test('digest lists recent forum threads and posts with their context', () => {
	const email = renderDigestEmail({
		...baseArgs,
		siteCounts: { newThreads: 1, newPosts: 1 },
		siteActivity: [
			{
				kind: 'post',
				postId: 'post-1',
				threadSlug: 'chapter-five',
				threadTitle: 'Chapter Five',
				authorDisplayName: 'Ada',
				bodyPreview: 'The locked room changes everything.',
				createdAt: '2026-09-08T10:00:00.000Z'
			},
			{
				kind: 'thread',
				threadSlug: 'next-month',
				threadTitle: 'What should we read next?',
				categoryName: 'Book Club',
				authorDisplayName: 'Grace',
				createdAt: '2026-09-08T09:00:00.000Z'
			}
		]
	});

	assert.match(email.textBody, /Ada posted in Chapter Five/);
	assert.match(email.textBody, /The locked room changes everything\./);
	assert.match(email.textBody, /chapter-five\?post=post-1#post-post-1/);
	assert.match(email.textBody, /What should we read next\? in Book Club, started by Grace/);
	assert.match(email.htmlBody, /<strong>Ada<\/strong> posted in/);
	assert.match(email.htmlBody, /What should we read next\?/);
	assert.doesNotMatch(email.textBody, /more updates? around the forum/);
});

test('digest reports forum activity omitted by the display limit', () => {
	const email = renderDigestEmail({
		...baseArgs,
		siteCounts: { newThreads: 4, newPosts: 9 },
		siteActivity: Array.from({ length: 10 }, (_, index) => ({
			kind: 'post',
			postId: `post-${index}`,
			threadSlug: `thread-${index}`,
			threadTitle: `Thread ${index}`,
			authorDisplayName: `Member ${index}`,
			bodyPreview: `Reply ${index}`,
			createdAt: `2026-09-08T${String(index).padStart(2, '0')}:00:00.000Z`
		}))
	});

	assert.match(email.textBody, /And 3 more updates around the forum\./);
	assert.match(email.htmlBody, /And 3 more updates around the forum\./);
});

test('digest escapes forum activity in its HTML body', () => {
	const email = renderDigestEmail({
		...baseArgs,
		siteCounts: { newThreads: 1, newPosts: 0 },
		siteActivity: [
			{
				kind: 'thread',
				threadSlug: 'safe-slug',
				threadTitle: '<Thread>',
				categoryName: 'Books & More',
				authorDisplayName: '<script>alert(1)</script>',
				createdAt: '2026-09-08T09:00:00.000Z'
			}
		]
	});

	assert.match(email.htmlBody, /&lt;Thread&gt;/);
	assert.match(email.htmlBody, /Books &amp; More/);
	assert.doesNotMatch(email.htmlBody, /<script>/);
});
