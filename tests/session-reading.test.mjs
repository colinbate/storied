import assert from 'node:assert/strict';
import { test } from 'node:test';
import { and, eq } from 'drizzle-orm';
import { database } from './database.mjs';
import {
	attendeeIdentities,
	books,
	sessionReadingChoices,
	sessions,
	userSubjects,
	users
} from '../src/lib/server/db/schema.ts';
import { upsertSessionReadingChoice } from '../src/lib/server/session-reading.ts';
import { actions as memberActions } from '../src/routes/sessions/[slug]/+page.server.ts';
import { actions as adminActions } from '../src/routes/admin/sessions/[slug]/+page.server.ts';
import { linkSessionReadingChoice } from '../workers/storied-worker/src/subject/links.ts';

const formRequest = (fields) =>
	new Request('https://club.example.test/sessions/meeting', {
		method: 'POST',
		body: new URLSearchParams(fields)
	});

async function fixture() {
	const context = database();
	const { db } = context;
	await db.insert(users).values([
		{ id: 'reader', email: 'reader@example.test', displayName: 'Reader' },
		{ id: 'admin', email: 'admin@example.test', displayName: 'Admin', role: 'admin' }
	]);
	await db.insert(attendeeIdentities).values([
		{ id: 'attendee', userId: 'reader', name: 'Reader' },
		{ id: 'guest', name: 'Guest' }
	]);
	await db.insert(books).values({ id: 'book', slug: 'book', title: 'The Book' });
	await db.insert(sessions).values({
		id: 'meeting',
		slug: 'meeting',
		title: 'Meeting',
		status: 'current'
	});
	const save = async (path, readingStatus, attendeeId = 'attendee') => {
		if (path === 'worker') {
			return linkSessionReadingChoice(context.binding, 'book', 'book', {
				sessionId: 'meeting',
				attendeeId,
				readingStatus
			});
		}
		const isMember = path === 'member';
		const user = await db
			.select()
			.from(users)
			.where(eq(users.id, isMember ? 'reader' : 'admin'))
			.get();
		const result = await (isMember ? memberActions : adminActions).upsertReadingChoice({
			locals: {
				db,
				user,
				permissions: new Set(isMember ? ['access:general'] : ['sessions:edit'])
			},
			params: { slug: 'meeting' },
			request: formRequest({
				bookId: 'book',
				readingStatus,
				readerId: path === 'admin-user' ? 'user:reader' : `attendee:${attendeeId}`
			})
		});
		assert.equal(result.readingChoiceSaved, true);
	};
	return { ...context, save };
}

for (const path of ['member', 'admin-user', 'admin-attendee', 'worker']) {
	test(`${path} reading choices create and update the reader's book status while preserving personal details`, async () => {
		const { db, save } = await fixture();
		await save(path, 'planned');
		const initial = await db.select().from(userSubjects).get();
		assert.equal(initial.userId, 'reader');
		assert.equal(initial.subjectType, 'book');
		assert.equal(initial.subjectId, 'book');
		assert.equal(initial.readingStatus, 'want_to_read');
		const personalDetails = {
			note: 'My notes',
			rating: 5,
			containsSpoilers: true,
			isRecommended: true,
			featuredOnProfile: true,
			featuredOrder: 2,
			createdAt: '2020-01-01T00:00:00.000Z'
		};
		await db.update(userSubjects).set(personalDetails);
		for (const [choiceStatus, bookStatus] of [
			['finished', 'read'],
			['reading', 'reading'],
			['did_not_finish', 'did_not_finish'],
			['considering', 'want_to_read'],
			['planned', 'want_to_read']
		]) {
			await db.update(userSubjects).set({ updatedAt: '2020-01-01T00:00:00.000Z' });
			await save(path, choiceStatus);
			const [relation] = await db.select().from(userSubjects).all();
			assert.equal(await db.$count(userSubjects), 1);
			assert.equal(relation.userId, 'reader');
			assert.equal(relation.readingStatus, bookStatus);
			assert.notEqual(relation.updatedAt, '2020-01-01T00:00:00.000Z');
			for (const [key, value] of Object.entries(personalDetails)) {
				assert.equal(relation[key], value);
			}
			assert.equal(
				(await db.select().from(sessionReadingChoices).get()).readingStatus,
				choiceStatus
			);
		}
	});
}

for (const path of ['admin-attendee', 'worker']) {
	test(`${path} keeps guest reading choices without creating personal book records`, async () => {
		const { db, save } = await fixture();
		await save(path, 'finished', 'guest');
		assert.equal((await db.select().from(sessionReadingChoices).get()).readingStatus, 'finished');
		assert.equal(await db.$count(userSubjects), 0);
	});
}

for (const path of ['server', 'worker']) {
	test(`${path} rolls back the reading choice if the personal book update fails`, async () => {
		const { db, sqlite, save } = await fixture();
		await save('member', 'planned');
		sqlite.exec(`CREATE TRIGGER reject_book_status BEFORE UPDATE ON user_subjects
			BEGIN SELECT RAISE(ABORT, 'Book status update failed'); END`);
		await assert.rejects(
			path === 'worker'
				? save('worker', 'finished')
				: upsertSessionReadingChoice(db, {
						sessionId: 'meeting',
						attendeeId: 'attendee',
						bookId: 'book',
						readingStatus: 'finished'
					})
		);
		assert.equal((await db.select().from(sessionReadingChoices).get()).readingStatus, 'planned');
		assert.equal((await db.select().from(userSubjects).get()).readingStatus, 'want_to_read');
	});
}

test('removing a reading choice preserves the personal book status', async () => {
	const { db, save } = await fixture();
	await save('member', 'finished');
	await memberActions.removeReadingChoice({
		locals: {
			db,
			user: await db.select().from(users).where(eq(users.id, 'reader')).get(),
			permissions: new Set(['access:general'])
		},
		params: { slug: 'meeting' },
		request: formRequest({ bookId: 'book' })
	});
	assert.equal(await db.$count(sessionReadingChoices), 0);
	const relation = await db
		.select()
		.from(userSubjects)
		.where(and(eq(userSubjects.userId, 'reader'), eq(userSubjects.subjectId, 'book')))
		.get();
	assert.equal(relation.readingStatus, 'read');
});
