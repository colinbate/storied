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
