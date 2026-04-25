import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { searchSessions, searchSubjects, searchThreads } from '$shared/search';
import {
	authors,
	books,
	categories,
	sessions,
	series,
	threads,
	users
} from '$lib/server/db/schema';
import { and, eq, inArray, isNull, ne } from 'drizzle-orm';
import type { SubjectType } from '$shared/worker-messages';

const RESULT_LIMIT = 8;

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) {
		throw redirect(302, '/auth/login');
	}

	const q = url.searchParams.get('q')?.trim() ?? '';
	if (!q) {
		return {
			q,
			threads: [],
			sessions: [],
			subjects: []
		};
	}

	const [threadCandidates, sessionCandidates, subjectCandidates] = await Promise.all([
		searchThreads(locals.db.$client, q, RESULT_LIMIT),
		searchSessions(locals.db.$client, q, RESULT_LIMIT),
		searchSubjects(locals.db.$client, q, RESULT_LIMIT + 4)
	]);

	const [threadResults, sessionResults, subjectResults] = await Promise.all([
		loadThreadResults(locals.db, threadCandidates, locals.permissions.has('admin:view')),
		loadSessionResults(locals.db, sessionCandidates),
		loadSubjectResults(locals.db, subjectCandidates)
	]);

	return {
		q,
		threads: threadResults,
		sessions: sessionResults,
		subjects: subjectResults
	};
};

async function loadThreadResults(
	db: App.Locals['db'],
	candidates: { id: string; rank: number }[],
	isAdmin: boolean
) {
	if (candidates.length === 0) return [];

	const rankById = new Map(candidates.map((candidate, index) => [candidate.id, index]));
	const ids = candidates.map((candidate) => candidate.id);
	const rows = await db
		.select({
			thread: {
				id: threads.id,
				title: threads.title,
				slug: threads.slug,
				bodySource: threads.bodySource,
				replyCount: threads.replyCount,
				visibility: threads.visibility,
				createdAt: threads.createdAt,
				lastPostAt: threads.lastPostAt
			},
			author: {
				id: users.id,
				displayName: users.displayName,
				avatarUrl: users.avatarUrl
			},
			category: {
				name: categories.name,
				slug: categories.slug
			}
		})
		.from(threads)
		.innerJoin(users, eq(users.id, threads.authorUserId))
		.innerJoin(categories, eq(categories.id, threads.categoryId))
		.where(
			and(
				inArray(threads.id, ids),
				isNull(threads.deletedAt),
				isAdmin ? undefined : ne(threads.visibility, 'admins')
			)
		)
		.all();

	return rows.sort(
		(a, b) => (rankById.get(a.thread.id) ?? Infinity) - (rankById.get(b.thread.id) ?? Infinity)
	);
}

async function loadSessionResults(
	db: App.Locals['db'],
	candidates: { id: string; rank: number }[]
) {
	if (candidates.length === 0) return [];

	const rankById = new Map(candidates.map((candidate, index) => [candidate.id, index]));
	const ids = candidates.map((candidate) => candidate.id);
	const rows = await db.select().from(sessions).where(inArray(sessions.id, ids)).all();

	return rows.sort((a, b) => (rankById.get(a.id) ?? Infinity) - (rankById.get(b.id) ?? Infinity));
}

async function loadSubjectResults(
	db: App.Locals['db'],
	candidates: { subjectType: SubjectType; subjectId: string; rank: number }[]
) {
	if (candidates.length === 0) return [];

	const order = new Map(
		candidates.map((candidate, index) => [`${candidate.subjectType}:${candidate.subjectId}`, index])
	);
	const idsByType = {
		book: candidates
			.filter((candidate) => candidate.subjectType === 'book')
			.map((candidate) => candidate.subjectId),
		series: candidates
			.filter((candidate) => candidate.subjectType === 'series')
			.map((candidate) => candidate.subjectId),
		author: candidates
			.filter((candidate) => candidate.subjectType === 'author')
			.map((candidate) => candidate.subjectId)
	};

	const [bookRows, seriesRows, authorRows] = await Promise.all([
		idsByType.book.length
			? db
					.select()
					.from(books)
					.where(and(inArray(books.id, idsByType.book), isNull(books.deletedAt)))
					.all()
			: [],
		idsByType.series.length
			? db
					.select()
					.from(series)
					.where(and(inArray(series.id, idsByType.series), isNull(series.deletedAt)))
					.all()
			: [],
		idsByType.author.length
			? db
					.select()
					.from(authors)
					.where(and(inArray(authors.id, idsByType.author), isNull(authors.deletedAt)))
					.all()
			: []
	]);

	return [
		...bookRows.map((subject) => ({ type: 'book' as const, subject })),
		...seriesRows.map((subject) => ({ type: 'series' as const, subject })),
		...authorRows.map((subject) => ({ type: 'author' as const, subject }))
	].sort(
		(a, b) =>
			(order.get(`${a.type}:${a.subject.id}`) ?? Infinity) -
			(order.get(`${b.type}:${b.subject.id}`) ?? Infinity)
	);
}
