import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { books, userSubjects, threadSubjects, threads, users } from '$lib/server/db/schema';
import { eq, and, isNull, desc, count } from 'drizzle-orm';

// pnpm resolves two drizzle-orm copies (D1 vs libsql peer variants) whose private types
// are structurally identical but nominally incompatible. The cast avoids the TS2345 mismatch.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _eq: any = eq;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _and: any = and;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _isNull: any = isNull;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _desc: any = desc;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _count: any = count;

const SUBJECT = 'book';

export const load: PageServerLoad = async ({ params, locals }) => {
	if (!locals.user) {
		throw redirect(302, '/auth/login');
	}

	const book = await locals.db.select().from(books).where(_eq(books.slug, params.slug)).get();

	if (!book) {
		throw error(404, 'Book not found');
	}

	// Load user's personal relationship to this book
	const myBookRelation = await locals.db
		.select()
		.from(userSubjects)
		.where(
			_and(
				_eq(userSubjects.userId, locals.user.id),
				_eq(userSubjects.subjectType, SUBJECT),
				_eq(userSubjects.subjectId, book.id)
			)
		)
		.get();

	// Load threads that reference this book (through thread_subjects)
	const relatedThreads = await locals.db
		.select({
			thread: {
				id: threads.id,
				title: threads.title,
				slug: threads.slug,
				replyCount: threads.replyCount,
				createdAt: threads.createdAt
			},
			author: {
				id: users.id,
				displayName: users.displayName,
				avatarUrl: users.avatarUrl
			}
		})
		.from(threadSubjects)
		.innerJoin(threads, _eq(threadSubjects.threadId, threads.id))
		.innerJoin(users, _eq(threads.authorUserId, users.id))
		.where(
			_and(
				_eq(threadSubjects.subjectType, SUBJECT),
				_eq(threadSubjects.subjectId, book.id),
				_isNull(threads.deletedAt)
			)
		)
		.orderBy(_desc(threads.createdAt))
		.all();

	// Deduplicate threads (same thread shouldn't appear twice now, but keep for safety)
	const seenIds = new Set<string>();
	const uniqueThreads = relatedThreads.filter(({ thread }) => {
		if (seenIds.has(thread.id)) return false;
		seenIds.add(thread.id);
		return true;
	});

	// Aggregate stats: how many members recommend, have read, etc.
	const [recommendCount] = await locals.db
		.select({ count: _count() })
		.from(userSubjects)
		.where(
			_and(
				_eq(userSubjects.subjectType, SUBJECT),
				_eq(userSubjects.subjectId, book.id),
				_eq(userSubjects.isRecommended, 1)
			)
		);

	const [readCount] = await locals.db
		.select({ count: _count() })
		.from(userSubjects)
		.where(
			_and(
				_eq(userSubjects.subjectType, SUBJECT),
				_eq(userSubjects.subjectId, book.id),
				_eq(userSubjects.readingStatus, 'read')
			)
		);

	return {
		book,
		myBookRelation: myBookRelation ?? null,
		relatedThreads: uniqueThreads,
		stats: {
			recommendations: recommendCount.count,
			readers: readCount.count
		}
	};
};

export const actions: Actions = {
	updateStatus: async ({ request, locals, params }) => {
		if (!locals.user) {
			throw redirect(302, '/auth/login');
		}

		const data = await request.formData();
		const readingStatus = data.get('readingStatus')?.toString();

		if (!readingStatus) {
			return fail(400, { error: 'Missing reading status.' });
		}

		const book = await locals.db.select().from(books).where(_eq(books.slug, params.slug)).get();

		if (!book) {
			throw error(404, 'Book not found');
		}

		const existing = await locals.db
			.select()
			.from(userSubjects)
			.where(
				_and(
					_eq(userSubjects.userId, locals.user.id),
					_eq(userSubjects.subjectType, SUBJECT),
					_eq(userSubjects.subjectId, book.id)
				)
			)
			.get();

		if (existing) {
			await locals.db
				.update(userSubjects)
				.set({ readingStatus, updatedAt: new Date().toISOString() })
				.where(
					_and(
						_eq(userSubjects.userId, locals.user.id),
						_eq(userSubjects.subjectType, SUBJECT),
						_eq(userSubjects.subjectId, book.id)
					)
				);
		} else {
			await locals.db.insert(userSubjects).values({
				userId: locals.user.id,
				subjectType: SUBJECT,
				subjectId: book.id,
				readingStatus
			});
		}

		return { statusUpdated: true };
	},

	toggleRecommend: async ({ locals, params }) => {
		if (!locals.user) {
			throw redirect(302, '/auth/login');
		}

		const book = await locals.db.select().from(books).where(_eq(books.slug, params.slug)).get();

		if (!book) {
			throw error(404, 'Book not found');
		}

		const existing = await locals.db
			.select()
			.from(userSubjects)
			.where(
				_and(
					_eq(userSubjects.userId, locals.user.id),
					_eq(userSubjects.subjectType, SUBJECT),
					_eq(userSubjects.subjectId, book.id)
				)
			)
			.get();

		if (existing) {
			await locals.db
				.update(userSubjects)
				.set({
					isRecommended: existing.isRecommended ? 0 : 1,
					updatedAt: new Date().toISOString()
				})
				.where(
					_and(
						_eq(userSubjects.userId, locals.user.id),
						_eq(userSubjects.subjectType, SUBJECT),
						_eq(userSubjects.subjectId, book.id)
					)
				);
		} else {
			await locals.db.insert(userSubjects).values({
				userId: locals.user.id,
				subjectType: SUBJECT,
				subjectId: book.id,
				isRecommended: 1
			});
		}

		return { recommendToggled: true };
	}
};
