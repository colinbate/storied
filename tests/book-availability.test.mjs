import assert from 'node:assert/strict';
import { test } from 'node:test';
import { database } from './database.mjs';
import { bookAccessOptions, books, users } from '../src/lib/server/db/schema.ts';
import { actions } from '../src/routes/admin/books/[slug]/+page.server.ts';
import { loadLibrarySubjects } from '../src/lib/server/library.ts';
import { parseBookAccessFormats } from '../shared/book-availability.ts';

async function fixture() {
	const context = database();
	const { db } = context;
	await db.insert(users).values({ id: 'host', email: 'host@example.test', displayName: 'Host' });
	await db.insert(books).values({ id: 'book', slug: 'book', title: 'The Book' });
	const user = await db.select().from(users).get();
	const locals = { db, user, permissions: new Set(['book:edit']) };
	const save = (formats, fields = {}, action = 'addAccessOption') => {
		const body = new URLSearchParams({ providerName: 'Libby', providerType: 'library', ...fields });
		for (const format of formats) body.append('format', format);
		return actions[action]({
			locals,
			params: { slug: 'book' },
			request: new Request('https://example.test/admin/books/book', { method: 'POST', body })
		});
	};
	return { ...context, save };
}

test('one availability entry stores ebook and audiobook and exposes both library formats', async () => {
	const { db, save } = await fixture();
	assert.equal((await save(['audiobook', 'ebook', 'ebook'])).accessOptionAdded, true);
	const rows = await db.select().from(bookAccessOptions).all();
	assert.equal(rows.length, 1);
	assert.equal(rows[0].format, 'ebook,audiobook');
	const library = await loadLibrarySubjects(db);
	assert.deepEqual(library.books[0].accessFormats, ['ebook', 'audiobook']);
	assert.equal(library.books[0].accessCount, 1);
	assert.equal(library.books[0].libbyAvailable, true);

	assert.equal(
		(await save(['audiobook'], { accessOptionId: rows[0].id }, 'updateAccessOption'))
			.accessOptionUpdated,
		true
	);
	assert.equal((await db.select().from(bookAccessOptions).all()).length, 1);
	assert.equal((await db.select().from(bookAccessOptions).get()).format, 'audiobook');
	assert.deepEqual((await loadLibrarySubjects(db)).books[0].accessFormats, ['audiobook']);
});

test('existing single-format entries remain readable and can gain formats', async () => {
	const { db, save } = await fixture();
	await db.insert(bookAccessOptions).values({
		id: 'legacy',
		bookId: 'book',
		providerName: 'Library',
		providerType: 'library',
		format: 'print'
	});
	assert.deepEqual(parseBookAccessFormats('print'), ['print']);
	assert.deepEqual((await loadLibrarySubjects(db)).books[0].accessFormats, ['print']);
	await save(['print', 'ebook'], { accessOptionId: 'legacy' }, 'updateAccessOption');
	assert.deepEqual((await loadLibrarySubjects(db)).books[0].accessFormats, ['print', 'ebook']);
});

test('invalid or empty format selections do not create or alter availability', async () => {
	const { db, save } = await fixture();
	await save(['ebook']);
	const original = await db.select().from(bookAccessOptions).get();
	for (const formats of [[], ['invalid'], ['ebook', 'invalid']]) {
		assert.equal((await save(formats)).status, 400);
		assert.equal(
			(await save(formats, { accessOptionId: original.id }, 'updateAccessOption')).status,
			400
		);
		assert.deepEqual(await db.select().from(bookAccessOptions).all(), [original]);
	}
});

test('providers can retain separate entries when format links differ', async () => {
	const { db, save } = await fixture();
	for (const format of ['ebook', 'audiobook']) {
		await save([format], {
			providerName: 'Amazon',
			providerType: 'retailer',
			url: `https://amazon.example.test/${format}`
		});
	}
	const rows = await db.select().from(bookAccessOptions).all();
	assert.equal(rows.length, 2);
	assert.deepEqual(
		new Set(rows.map((row) => row.url)),
		new Set(['https://amazon.example.test/ebook', 'https://amazon.example.test/audiobook'])
	);
	assert.deepEqual(
		new Set((await loadLibrarySubjects(db)).books[0].accessFormats),
		new Set(['ebook', 'audiobook'])
	);
});
