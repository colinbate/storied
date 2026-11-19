import assert from 'node:assert/strict';
import { test } from 'node:test';
import { eq } from 'drizzle-orm';
import { database } from './database.mjs';
import { isLibbyAccessOption } from '../shared/libby.ts';
import { loadLibrarySubjects } from '../src/lib/server/library.ts';
import {
	attendeeIdentities,
	bookAccessOptions,
	books,
	sessionReadingChoices,
	sessions,
	sessionSubjects,
	users
} from '../src/lib/server/db/schema.ts';
import { actions as sessionActions } from '../src/routes/admin/sessions/[slug]/+page.server.ts';
import { actions as bookActions } from '../src/routes/admin/books/[slug]/+page.server.ts';
import { load as sessionPage } from '../src/routes/sessions/[slug]/+page.server.ts';
import { GET as publicSessions } from '../src/routes/api/v1/sessions/+server.ts';

const collection = 'https://libbyapp.com/library/bermuda/curated-123';
const request = (fields) =>
	new Request('https://example.test/admin/sessions/meeting', {
		method: 'POST',
		body: new URLSearchParams(fields)
	});

async function fixture() {
	const context = database();
	const { db } = context;
	await db.insert(users).values({ id: 'host', email: 'host@example.test', displayName: 'Host' });
	const user = await db.select().from(users).get();
	const locals = {
		db,
		user,
		permissions: new Set(['sessions:edit', 'book:edit', 'access:general'])
	};
	await db.insert(sessions).values({
		id: 'meeting',
		slug: 'meeting',
		title: 'Meeting',
		status: 'scheduled',
		isPublic: true,
		updatedAt: '2020-01-01T00:00:00.000Z'
	});
	await db.insert(books).values([
		{ id: 'available', slug: 'available', title: 'Available Book' },
		{ id: 'unknown', slug: 'unknown', title: 'Unknown Book' }
	]);
	await db.insert(sessionSubjects).values(
		['available', 'unknown'].map((subjectId) => ({
			sessionId: 'meeting',
			subjectType: 'book',
			subjectId,
			status: 'starter'
		}))
	);
	await db.insert(attendeeIdentities).values({ id: 'host-attendee', userId: 'host', name: 'Host' });
	await db.insert(sessionReadingChoices).values({
		sessionId: 'meeting',
		attendeeId: 'host-attendee',
		bookId: 'available',
		readingStatus: 'planned'
	});
	const row = () => db.select().from(sessions).where(eq(sessions.id, 'meeting')).get();
	const save = async (url, expectedUpdatedAt) =>
		sessionActions.updateLibbyCollection({
			locals,
			params: { slug: 'meeting' },
			request: request({
				libbyCollectionUrl: url,
				expectedUpdatedAt: expectedUpdatedAt ?? (await row()).updatedAt
			})
		});
	const page = () =>
		sessionPage({
			locals,
			params: { slug: 'meeting' },
			url: new URL('https://example.test/sessions/meeting'),
			depends() {}
		});
	return { ...context, locals, row, save, page };
}

test('collection can be added later, replaced, exposed publicly, and removed without changing session details', async () => {
	const { locals, row, save, page } = await fixture();
	assert.equal((await page()).session.libbyCollectionUrl, null);
	assert.equal((await save(`  ${collection}  `)).libbyCollectionSaved, true);
	assert.equal((await row()).libbyCollectionUrl, collection);
	assert.equal((await row()).title, 'Meeting');
	assert.equal((await row()).status, 'scheduled');
	assert.equal((await page()).session.libbyCollectionUrl, collection);
	assert.equal((await (await publicSessions({ locals })).json())[0].libbyCollectionUrl, collection);
	const replacement = 'https://bermuda.overdrive.com/collection/123';
	assert.equal((await save(replacement)).libbyCollectionSaved, true);
	assert.equal((await row()).libbyCollectionUrl, replacement);
	assert.equal((await save('   ')).libbyCollectionSaved, true);
	assert.equal((await page()).session.libbyCollectionUrl, null);
});

test('collection rejects invalid URLs and stale edits, and requires session permission', async () => {
	const { locals, row, save } = await fixture();
	for (const url of [
		'not a URL',
		'javascript:alert(1)',
		'data:text/html,bad',
		'https://name:secret@example.test'
	]) {
		const result = await save(url);
		assert.equal(result.status, 400);
		assert.ok(result.data.libbyCollectionError);
		assert.equal(result.data.libbyCollectionUrl, url);
		assert.equal((await row()).libbyCollectionUrl, null);
	}
	assert.equal((await save(collection, 'stale')).status, 409);
	await assert.rejects(
		sessionActions.updateLibbyCollection({
			locals: { ...locals, permissions: new Set() },
			params: { slug: 'meeting' },
			request: request({ libbyCollectionUrl: collection })
		}),
		(error) => error.status === 403
	);
	assert.equal(
		(
			await sessionActions.updateLibbyCollection({
				locals,
				params: { slug: 'missing' },
				request: request({ libbyCollectionUrl: collection })
			})
		).status,
		404
	);
	assert.equal((await row()).libbyCollectionUrl, null);
});

test('Libby availability uses existing book records across sessions and disappears when removed', async () => {
	const { db, locals, page } = await fixture();
	const params = { slug: 'available' };
	assert.equal(
		(
			await bookActions.addAccessOption({
				locals,
				params,
				request: request({
					providerName: 'Libby',
					providerType: 'library',
					format: 'ebook',
					url: ''
				})
			})
		).accessOptionAdded,
		true
	);
	const option = await db.select().from(bookAccessOptions).get();
	const loaded = await page();
	assert.equal(
		loaded.starterSubjects.find((row) => row.book.id === 'available').book.libbyAvailable,
		true
	);
	assert.equal(
		loaded.starterSubjects.find((row) => row.book.id === 'unknown').book.libbyAvailable,
		false
	);
	assert.equal(loaded.readingChoices[0].subject.libbyAvailable, true);
	assert.equal(
		(await loadLibrarySubjects(db)).books.find((book) => book.id === 'available').libbyAvailable,
		true
	);
	assert.equal(
		(
			await bookActions.removeAccessOption({
				locals,
				params,
				request: request({ accessOptionId: option.id })
			})
		).accessOptionRemoved,
		true
	);
	assert.equal(
		(await page()).starterSubjects.find((row) => row.book.id === 'available').book.libbyAvailable,
		false
	);
});

test('Libby detection recognises existing library names and real Libby links', () => {
	const option = { providerName: 'Local Library', providerType: 'library' };
	assert.equal(isLibbyAccessOption({ ...option, providerName: 'Libby' }), true);
	assert.equal(isLibbyAccessOption({ ...option, providerName: 'Local Library (LIBBY)' }), true);
	assert.equal(
		isLibbyAccessOption({ ...option, url: 'https://libbyapp.com/library/local/title/123' }),
		true
	);
	assert.equal(
		isLibbyAccessOption({ ...option, url: 'https://share.libbyapp.com/title/123' }),
		true
	);
	for (const url of [
		null,
		'invalid',
		'https://libbyapp.com.evil.test/title/123',
		'https://example.test/libbyapp.com',
		'javascript:alert(1)'
	])
		assert.equal(isLibbyAccessOption({ ...option, url }), false);
	assert.equal(isLibbyAccessOption({ providerName: 'Libby', providerType: 'retailer' }), false);
});
