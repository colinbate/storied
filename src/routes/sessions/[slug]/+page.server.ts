import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { books, series, sessionSubjects, sessions, threads, users } from '$lib/server/db/schema';
import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';

export const load: PageServerLoad = async ({ params, locals }) => {
	if (!locals.user) {
		throw redirect(302, '/auth/login');
	}

	const session = await locals.db
		.select()
		.from(sessions)
		.where(eq(sessions.slug, params.slug))
		.get();

	if (!session) throw error(404, 'Session not found');

	const subjectLinks = await locals.db
		.select()
		.from(sessionSubjects)
		.where(eq(sessionSubjects.sessionId, session.id))
		.orderBy(asc(sessionSubjects.status), asc(sessionSubjects.createdAt))
		.all();

	const bookIds = subjectLinks.filter((link) => link.subjectType === 'book').map((link) => link.subjectId);
	const seriesIds = subjectLinks
		.filter((link) => link.subjectType === 'series')
		.map((link) => link.subjectId);

	const bookRows = bookIds.length
		? await locals.db
				.select()
				.from(books)
				.where(and(inArray(books.id, bookIds), isNull(books.deletedAt)))
				.all()
		: [];
	const seriesRows = seriesIds.length
		? await locals.db
				.select()
				.from(series)
				.where(and(inArray(series.id, seriesIds), isNull(series.deletedAt)))
				.all()
		: [];

	const bookMap = new Map(bookRows.map((book) => [book.id, book]));
	const seriesMap = new Map(seriesRows.map((row) => [row.id, row]));
	const subjects = subjectLinks
		.map((link) => {
			if (link.subjectType === 'book') {
				const book = bookMap.get(link.subjectId);
				return book ? { kind: 'book' as const, link, book } : null;
			}
			const row = seriesMap.get(link.subjectId);
			return row ? { kind: 'series' as const, link, series: row } : null;
		})
		.filter((item): item is NonNullable<typeof item> => item !== null);

	const sessionThreads = await locals.db
		.select({
			thread: threads,
			author: {
				id: users.id,
				displayName: users.displayName,
				avatarUrl: users.avatarUrl
			}
		})
		.from(threads)
		.innerJoin(users, eq(threads.authorUserId, users.id))
		.where(and(eq(threads.sessionId, session.id), isNull(threads.deletedAt)))
		.orderBy(desc(threads.createdAt))
		.all();

	const primaryThread =
		sessionThreads.find(({ thread }) => thread.sessionThreadRole === 'primary') ?? sessionThreads[0] ?? null;

	return {
		session,
		primaryThread,
		relatedThreads: sessionThreads.filter(({ thread }) => thread.id !== primaryThread?.thread.id),
		starterSubjects: subjects.filter(({ link }) => link.status === 'starter'),
		featuredSubjects: subjects.filter(({ link }) => link.status === 'featured'),
		discussedSubjects: subjects.filter(({ link }) => link.status === 'discussed'),
		offThemeSubjects: subjects.filter(({ link }) => link.status === 'mentioned_off_theme')
	};
};
