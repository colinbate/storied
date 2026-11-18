import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { database } from './database.mjs';
import { linkThemeBook } from '../workers/storied-worker/src/subject/links.ts';
import { sessions, themes, users } from '../src/lib/server/db/schema.ts';
import { actions as themeAdminActions } from '../src/routes/admin/themes/[slug]/+page.server.ts';
import { GET as publicSessions } from '../src/routes/api/v1/sessions/+server.ts';

const formRequest = (fields) =>
	new Request('https://club.example.test/admin/themes/theme-one', {
		method: 'POST',
		body: new URLSearchParams(fields)
	});

function bulkImportFixture() {
	const { sqlite, db } = database();
	sqlite.exec(`
		INSERT INTO users (id, email, display_name, role) VALUES ('admin', 'admin@example.test', 'Admin', 'admin');
		INSERT INTO themes (id, slug, name) VALUES ('theme-one', 'theme-one', 'Theme One');
		INSERT INTO books (id, slug, title) VALUES ('book-one', 'book-one', 'Book One');
		INSERT INTO subject_sources (id, source_type, source_url, source_key, subject_type, subject_id, fetch_status)
		VALUES ('source-one', 'hardcover', 'https://hardcover.app/books/book-one', 'book-one', 'book', 'book-one', 'resolved');
	`);
	const messages = [];
	const event = {
		locals: { db, user: { id: 'admin' }, permissions: new Set(['sessions:edit']) },
		params: { slug: 'theme-one' },
		platform: { env: { STORIED_WORKER: { send: async (message) => messages.push(message) } } }
	};
	return {
		sqlite,
		messages,
		event,
		add: (bookUrls) => themeAdminActions.addBooks({ ...event, request: formRequest({ bookUrls }) })
	};
}

test('bulk theme import links resolved books, queues new books, and deduplicates source URLs', async () => {
	const { sqlite, messages, add } = bulkImportFixture();
	const urls = [
		'https://hardcover.app/books/book-one',
		'',
		'https://hardcover.app/books/book-two',
		'https://hardcover.app/books/book-two?ref=list',
		'https://www.goodreads.com/book/show/123.Book_Three'
	].join('\r\n');
	const result = await add(urls);
	assert.equal(result.linkedCount, 1);
	assert.equal(result.queuedCount, 2);
	assert.equal(sqlite.prepare('SELECT count(*) AS n FROM theme_books').get().n, 1);
	assert.equal(sqlite.prepare('SELECT count(*) AS n FROM subject_sources').get().n, 3);
	assert.deepEqual(
		messages.map((message) => ({
			topic: message.topic,
			key: message.payload.sourceKey,
			themeBookLink: message.payload.themeBookLink
		})),
		[
			{
				topic: 'subject.resolve',
				key: 'book-two',
				themeBookLink: { themeId: 'theme-one', addedByUserId: 'admin' }
			},
			{
				topic: 'subject.resolve',
				key: '123',
				themeBookLink: { themeId: 'theme-one', addedByUserId: 'admin' }
			}
		]
	);

	await add(urls);
	assert.equal(sqlite.prepare('SELECT count(*) AS n FROM theme_books').get().n, 1);
	assert.equal(sqlite.prepare('SELECT count(*) AS n FROM subject_sources').get().n, 3);
});

test('bulk theme import validates every line before linking or queuing any book', async () => {
	for (const invalid of [
		'https://hardcover.app/series/a-series',
		'https://hardcover.app/authors/an-author',
		'https://example.test/books/a-book',
		'https://hardcover.app/books/book_two',
		'https://hardcover.app/books/book-two https://hardcover.app/books/book-three',
		'https://hardcover.app.evil.test/books/book-two',
		'not a URL'
	]) {
		const { sqlite, messages, add } = bulkImportFixture();
		const bookUrls = `https://hardcover.app/books/book-one\n\n${invalid}`;
		const result = await add(bookUrls);
		assert.equal(result.status, 400, invalid);
		assert.match(result.data.error, /Line 3:/);
		assert.equal(result.data.bookUrls, bookUrls);
		assert.equal(sqlite.prepare('SELECT count(*) AS n FROM theme_books').get().n, 0);
		assert.equal(sqlite.prepare('SELECT count(*) AS n FROM subject_sources').get().n, 1);
		assert.equal(messages.length, 0);
	}
});

test('bulk theme import rejects empty and oversized lists', async () => {
	const { add, messages } = bulkImportFixture();
	for (const urls of [
		'',
		' \n\t',
		Array.from({ length: 51 }, (_, n) => `https://hardcover.app/books/book-${n}`).join('\n')
	]) {
		assert.equal((await add(urls)).status, 400);
	}
	const result = await add(
		Array.from({ length: 50 }, (_, n) => `https://hardcover.app/books/book-${n}`).join('\n')
	);
	assert.equal(result.queuedCount, 50);
	assert.equal(messages.length, 50);
});

test('bulk theme import reports partial progress and allows a safe retry', async (t) => {
	t.mock.method(console, 'error', () => {});
	const { event, sqlite, add } = bulkImportFixture();
	const send = event.platform.env.STORIED_WORKER.send;
	event.platform.env.STORIED_WORKER.send = async () => {
		throw new Error('Worker unavailable');
	};
	const bookUrls = 'https://hardcover.app/books/book-one\nhttps://hardcover.app/books/book-two';
	const result = await add(bookUrls);
	assert.equal(result.status, 503);
	assert.match(result.data.error, /1 linked and 0 queued/);
	assert.equal(result.data.bookUrls, bookUrls);
	event.platform.env.STORIED_WORKER.send = send;
	const retried = await add(bookUrls);
	assert.equal(retried.linkedCount, 1);
	assert.equal(retried.queuedCount, 1);
	assert.equal(sqlite.prepare('SELECT count(*) AS n FROM theme_books').get().n, 1);
	assert.equal(sqlite.prepare('SELECT count(*) AS n FROM subject_sources').get().n, 2);
});

test('bulk theme import requires permission and an existing theme', async () => {
	const { event, add } = bulkImportFixture();
	event.params.slug = 'missing';
	assert.equal((await add('https://hardcover.app/books/book-one')).status, 404);
	event.locals.permissions.clear();
	await assert.rejects(
		add('https://hardcover.app/books/book-one'),
		(error) => error.status === 403
	);
});

function seedThemeSessionBooks(sqlite) {
	sqlite.exec(`
		INSERT INTO themes (id, slug, name) VALUES ('theme-one', 'theme-one', 'Theme One');
		INSERT INTO books (id, slug, title) VALUES
			('book-starter', 'book-starter', 'Starter Book'),
			('book-featured', 'book-featured', 'Featured Book'),
			('book-discussed', 'book-discussed', 'Discussed Book');
		INSERT INTO sessions (id, slug, title, theme_id) VALUES
			('session-one', 'session-one', 'Session One', 'theme-one');
		INSERT INTO session_subjects (session_id, subject_type, subject_id, status) VALUES
			('session-one', 'book', 'book-starter', 'starter'),
			('session-one', 'book', 'book-featured', 'featured'),
			('session-one', 'book', 'book-discussed', 'discussed');
	`);
}

test('theme book migration backfills starter and featured session books', () => {
	const { sqlite } = database('0034_theme_books.sql');
	seedThemeSessionBooks(sqlite);
	sqlite.exec(readFileSync('migrations/0034_theme_books.sql', 'utf8'));

	const links = sqlite
		.prepare('SELECT theme_id, book_id FROM theme_books ORDER BY book_id')
		.all()
		.map((row) => ({ ...row }));
	assert.deepEqual(links, [
		{ theme_id: 'theme-one', book_id: 'book-featured' },
		{ theme_id: 'theme-one', book_id: 'book-starter' }
	]);
});

test('the import side effect links a resolved book to one or more themes', async () => {
	const { sqlite, binding } = database();
	sqlite.exec(`
		INSERT INTO themes (id, slug, name) VALUES
			('theme-one', 'theme-one', 'Theme One'),
			('theme-two', 'theme-two', 'Theme Two');
		INSERT INTO books (id, slug, title) VALUES ('book-one', 'book-one', 'Book One');
	`);

	await linkThemeBook(binding, 'book', 'book-one', { themeId: 'theme-one' });
	await linkThemeBook(binding, 'book', 'book-one', { themeId: 'theme-two' });
	await linkThemeBook(binding, 'book', 'book-one', { themeId: 'theme-one' });
	await linkThemeBook(binding, 'series', 'book-one', { themeId: 'theme-one' });

	const links = sqlite
		.prepare('SELECT theme_id, book_id FROM theme_books ORDER BY theme_id')
		.all()
		.map((row) => ({ ...row }));
	assert.deepEqual(links, [
		{ theme_id: 'theme-one', book_id: 'book-one' },
		{ theme_id: 'theme-two', book_id: 'book-one' }
	]);
});

test('a theme guide becomes the published session body while session notes remain separate', async () => {
	const { db } = database();
	await db.insert(users).values({
		id: 'admin',
		email: 'admin@example.test',
		displayName: 'Admin',
		role: 'admin'
	});
	await db.insert(themes).values({ id: 'theme-one', slug: 'theme-one', name: 'Theme One' });
	await db.insert(sessions).values({
		id: 'session-one',
		slug: 'session-one',
		title: 'Session One',
		status: 'scheduled',
		startsAt: '2099-01-01T18:00',
		themeId: 'theme-one',
		themeTitle: 'Old Theme Title',
		themeSummary: 'Old summary',
		bodySource: 'Holiday-specific notes.',
		bodyHtml: '<p>Holiday-specific notes.</p>',
		isPublic: true
	});
	const locals = {
		db,
		user: await db.select().from(users).get(),
		permissions: new Set(['sessions:edit'])
	};

	await themeAdminActions.update({
		locals,
		params: { slug: 'theme-one' },
		request: formRequest({
			name: 'Theme One',
			status: 'selected',
			description: 'The current pitch.',
			guideSource: 'Read books about **time**.'
		})
	});

	const savedTheme = await db.select().from(themes).get();
	assert.match(savedTheme.guideHtml, /<strong>time<\/strong>/);
	const api = await (await publicSessions({ locals })).json();
	assert.equal(api[0].themeTitle, 'Theme One');
	assert.equal(api[0].themeSummary, 'The current pitch.');
	assert.equal(api[0].body, 'Read books about **time**.');
	assert.match(api[0].themeGuideHtml, /<strong>time<\/strong>/);
	assert.equal(api[0].sessionNotes, 'Holiday-specific notes.');
});

test('new session form leaves theme content on the theme', () => {
	const source = readFileSync('src/routes/admin/sessions/+page.svelte', 'utf8');
	assert.doesNotMatch(source, /name="themeSummary"/);
	assert.doesNotMatch(source, /name="bodySource"/);
});
