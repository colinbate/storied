import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	series,
	seriesBooks,
	books,
	genres,
	genreLinks,
	userSubjects,
	threadSubjects,
	threads,
	users
} from '$lib/server/db/schema';
import { eq, and, isNull, desc, asc, sql } from 'drizzle-orm';

const SUBJECT = 'series';

export const load: PageServerLoad = async ({ params, locals }) => {
	if (!locals.user) {
		throw redirect(302, '/auth/login');
	}

	const seriesRecord = await locals.db
		.select()
		.from(series)
		.where(eq(series.slug, params.slug))
		.get();

	if (!seriesRecord || seriesRecord.deletedAt) {
		throw error(404, 'Series not found');
	}

	const seriesGenres = await locals.db
		.select({
			id: genres.id,
			name: genres.name,
			slug: genres.slug
		})
		.from(genreLinks)
		.innerJoin(genres, eq(genreLinks.genreId, genres.id))
		.where(and(eq(genreLinks.subjectType, SUBJECT), eq(genreLinks.subjectId, seriesRecord.id)))
		.orderBy(asc(genres.name))
		.all();

	const mySeriesRelation = await locals.db
		.select()
		.from(userSubjects)
		.where(
			and(
				eq(userSubjects.userId, locals.user.id),
				eq(userSubjects.subjectType, SUBJECT),
				eq(userSubjects.subjectId, seriesRecord.id)
			)
		)
		.get();

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
		.innerJoin(threads, eq(threadSubjects.threadId, threads.id))
		.innerJoin(users, eq(threads.authorUserId, users.id))
		.where(
			and(
				eq(threadSubjects.subjectType, SUBJECT),
				eq(threadSubjects.subjectId, seriesRecord.id),
				isNull(threads.deletedAt)
			)
		)
		.orderBy(desc(threads.createdAt))
		.all();

	const seenIds = new Set<string>();
	const uniqueThreads = relatedThreads.filter(({ thread }) => {
		if (seenIds.has(thread.id)) return false;
		seenIds.add(thread.id);
		return true;
	});

	const recommendCount = await locals.db.$count(
		userSubjects,
		and(
			eq(userSubjects.subjectType, SUBJECT),
			eq(userSubjects.subjectId, seriesRecord.id),
			eq(userSubjects.isRecommended, true)
		)
	);

	const readCount = await locals.db.$count(
		userSubjects,
		and(
			eq(userSubjects.subjectType, SUBJECT),
			eq(userSubjects.subjectId, seriesRecord.id),
			eq(userSubjects.readingStatus, 'read')
		)
	);

	const seriesEntries = await locals.db
		.select({
			book: {
				id: books.id,
				slug: books.slug,
				title: books.title,
				subtitle: books.subtitle,
				authorText: books.authorText,
				coverUrl: books.coverUrl,
				firstPublishYear: books.firstPublishYear
			},
			entry: {
				position: seriesBooks.position,
				positionSort: seriesBooks.positionSort
			}
		})
		.from(seriesBooks)
		.innerJoin(books, eq(seriesBooks.bookId, books.id))
		.where(and(eq(seriesBooks.seriesId, seriesRecord.id), isNull(books.deletedAt)))
		.orderBy(asc(seriesBooks.positionSort), asc(books.title))
		.all();

	return {
		series: seriesRecord,
		seriesGenres,
		mySeriesRelation: mySeriesRelation ?? null,
		relatedThreads: uniqueThreads,
		seriesEntries,
		stats: {
			recommendations: recommendCount,
			readers: readCount
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

		await locals.db
			.insert(userSubjects)
			.values({
				userId: locals.user.id,
				subjectType: SUBJECT,
				subjectId: sql`(SELECT ${series.id} FROM ${series} WHERE ${series.slug} = ${params.slug})`,
				readingStatus
			})
			.onConflictDoUpdate({
				target: [userSubjects.userId, userSubjects.subjectType, userSubjects.subjectId],
				set: {
					readingStatus,
					updatedAt: sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`
				}
			});

		return { statusUpdated: true };
	},

	toggleRecommend: async ({ locals, params }) => {
		if (!locals.user) {
			throw redirect(302, '/auth/login');
		}

		const seriesRecord = await locals.db
			.select()
			.from(series)
			.where(eq(series.slug, params.slug))
			.get();

		if (!seriesRecord || seriesRecord.deletedAt) {
			throw error(404, 'Series not found');
		}

		await locals.db
			.insert(userSubjects)
			.values({
				userId: locals.user.id,
				subjectType: SUBJECT,
				subjectId: seriesRecord.id,
				isRecommended: true
			})
			.onConflictDoUpdate({
				target: [userSubjects.userId, userSubjects.subjectType, userSubjects.subjectId],
				set: {
					isRecommended: sql`1 - ${userSubjects.isRecommended}`,
					updatedAt: sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`
				}
			});

		return { recommendToggled: true };
	}
};
