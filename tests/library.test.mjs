import assert from 'node:assert/strict';
import { test } from 'node:test';
import { and, eq, ne } from 'drizzle-orm';
import { database } from './database.mjs';
import {
	bookAccessOptions,
	books,
	sessions,
	sessionSubjects,
	themes,
	users,
	userSubjects
} from '../src/lib/server/db/schema.ts';
import { loadLibrarySubjects } from '../src/lib/server/library.ts';
import { actions as bookActions } from '../src/routes/books/[slug]/+page.server.ts';

async function fixture() {
	const context = database();
	const { db } = context;
	await db.insert(users).values({
		id: 'reader',
		email: 'reader@example.test',
		displayName: 'Reader'
	});
	const reader = await db.select().from(users).where(eq(users.id, 'reader')).get();
	await db.insert(themes).values({ id: 'theme', slug: 'mystery', name: 'Mystery' });
	await db.insert(books).values([
		{
			id: 'current-book',
			slug: 'current-book',
			title: 'Current Book',
			pageCount: 320,
			language: 'English'
		},
		{ id: 'past-book', slug: 'past-book', title: 'Past Book' }
	]);
	await db.insert(sessions).values([
		{
			id: 'next',
			slug: 'next',
			title: 'Next Meeting',
			startsAt: '2099-06-01T18:00',
			themeId: 'theme',
			status: 'scheduled'
		},
		{
			id: 'past',
			slug: 'past',
			title: 'Past Meeting',
			startsAt: '2020-06-01T18:00',
			themeId: 'theme',
			status: 'past'
		},
		{
			id: 'draft',
			slug: 'draft',
			title: 'Private Draft',
			startsAt: '2099-07-01T18:00',
			themeId: 'theme',
			status: 'draft'
		}
	]);
	await db.insert(userSubjects).values({
		userId: 'reader',
		subjectType: 'book',
		subjectId: 'current-book',
		readingStatus: 'reading'
	});
	await db.insert(sessionSubjects).values([
		{
			sessionId: 'next',
			subjectType: 'book',
			subjectId: 'current-book',
			status: 'starter'
		},
		{
			sessionId: 'past',
			subjectType: 'book',
			subjectId: 'past-book',
			status: 'discussed'
		},
		{
			sessionId: 'draft',
			subjectType: 'book',
			subjectId: 'past-book',
			status: 'starter'
		}
	]);
	await db.insert(bookAccessOptions).values({
		id: 'access',
		bookId: 'current-book',
		providerName: 'Town Library',
		providerType: 'library',
		format: 'ebook'
	});
	return { ...context, reader };
}

test('library context combines personal shelves, meeting history, and availability', async () => {
	const { db } = await fixture();
	const library = await loadLibrarySubjects(db, {
		userId: 'reader',
		sessionAccess: ne(sessions.status, 'draft')
	});

	const current = library.books.find((book) => book.id === 'current-book');
	const past = library.books.find((book) => book.id === 'past-book');
	assert.equal(current.readingStatus, 'reading');
	assert.equal(current.pageCount, 320);
	assert.equal(current.accessCount, 1);
	assert.deepEqual(current.accessFormats, ['ebook']);
	assert.equal(current.sessionLinks[0].sessionId, 'next');
	assert.equal(past.sessionLinks.length, 1);
	assert.equal(past.sessionLinks[0].role, 'discussed');
	assert.equal(library.nextSession.id, 'next');
	assert.deepEqual(library.themeOptions, [{ key: 'theme', name: 'Mystery' }]);
	assert.ok(!library.sessionOptions.some((session) => session.id === 'draft'));
});

test('a member can suggest an unlinked book for an upcoming meeting', async () => {
	const { db, reader } = await fixture();
	const request = new Request('https://club.example.test/books/past-book', {
		method: 'POST',
		body: new URLSearchParams({ sessionId: 'next' })
	});

	const result = await bookActions.suggestForSession({
		request,
		params: { slug: 'past-book' },
		locals: { db, user: reader, permissions: new Set(['access:general']) }
	});
	assert.equal(result.suggestedForSession, true);

	const suggestion = await db
		.select()
		.from(sessionSubjects)
		.where(
			and(
				eq(sessionSubjects.sessionId, 'next'),
				eq(sessionSubjects.subjectType, 'book'),
				eq(sessionSubjects.subjectId, 'past-book')
			)
		)
		.get();
	assert.equal(suggestion.status, 'starter');
	assert.equal(suggestion.addedByUserId, 'reader');
});

test('draft meeting suggestions remain limited to members who can view drafts', async () => {
	const { db, reader } = await fixture();
	const request = () =>
		new Request('https://club.example.test/books/current-book', {
			method: 'POST',
			body: new URLSearchParams({ sessionId: 'draft' })
		});

	const memberResult = await bookActions.suggestForSession({
		request: request(),
		params: { slug: 'current-book' },
		locals: { db, user: reader, permissions: new Set(['access:general']) }
	});
	assert.equal(memberResult.status, 400);

	const facilitatorResult = await bookActions.suggestForSession({
		request: request(),
		params: { slug: 'current-book' },
		locals: {
			db,
			user: reader,
			permissions: new Set(['access:general', 'sessions:edit'])
		}
	});
	assert.equal(facilitatorResult.suggestedForSession, true);

	const suggestion = await db
		.select()
		.from(sessionSubjects)
		.where(
			and(
				eq(sessionSubjects.sessionId, 'draft'),
				eq(sessionSubjects.subjectType, 'book'),
				eq(sessionSubjects.subjectId, 'current-book')
			)
		)
		.get();
	assert.equal(suggestion.status, 'starter');
});
