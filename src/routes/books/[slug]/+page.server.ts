import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	books,
	bookAccessOptions,
	genres,
	genreLinks,
	sessions,
	sessionSubjects,
	themeBooks,
	themes,
	userSubjects,
	threadSubjects,
	threads,
	users
} from '$lib/server/db/schema';
import { eq, and, isNull, isNotNull, desc, asc, sql, or, ne, inArray } from 'drizzle-orm';
import { threadAccessCondition, threadViewer } from '$lib/server/thread-access';
import { loadClassificationsBySubject } from '$lib/server/classifications';
import { renderMarkdown } from '$lib/server/markdown';
import { sessionAccessCondition } from '$lib/server/session-lifecycle';
import { hasSessionEnded } from '$shared/session-lifecycle';

const SUBJECT = 'book';
const SUGGESTIBLE_SESSION_STATUSES = ['draft', 'scheduled', 'current'] as const;

function acceptsBookSuggestions(session: {
	status: string;
	startsAt: string | null;
	timezone?: string | null;
	durationMinutes?: number | null;
}) {
	return (
		session.status === 'draft' ||
		session.status === 'current' ||
		(session.status === 'scheduled' && !hasSessionEnded(session))
	);
}

export const load: PageServerLoad = async ({ params, locals }) => {
	if (!locals.user) {
		throw redirect(302, '/auth/login');
	}

	const book = await locals.db.select().from(books).where(eq(books.slug, params.slug)).get();

	if (!book || book.deletedAt) {
		throw error(404, 'Book not found');
	}

	const bookClassifications = await loadClassificationsBySubject(locals.db, 'book', [book.id]);

	const bookGenres = await locals.db
		.select({
			id: genres.id,
			name: genres.name,
			slug: genres.slug
		})
		.from(genreLinks)
		.innerJoin(genres, eq(genreLinks.genreId, genres.id))
		.where(and(eq(genreLinks.subjectType, SUBJECT), eq(genreLinks.subjectId, book.id)))
		.orderBy(asc(genres.name))
		.all();

	// Load user's personal relationship to this book
	const myBookRelation = await locals.db
		.select()
		.from(userSubjects)
		.where(
			and(
				eq(userSubjects.userId, locals.user.id),
				eq(userSubjects.subjectType, SUBJECT),
				eq(userSubjects.subjectId, book.id)
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
		.innerJoin(threads, eq(threadSubjects.threadId, threads.id))
		.innerJoin(users, eq(threads.authorUserId, users.id))
		.where(
			and(
				eq(threadSubjects.subjectType, SUBJECT),
				eq(threadSubjects.subjectId, book.id),
				isNull(threads.deletedAt),
				threadAccessCondition(locals.db, threadViewer(locals))
			)
		)
		.orderBy(desc(threads.createdAt))
		.all();

	// Deduplicate threads (same thread shouldn't appear twice now, but keep for safety)
	const seenIds = new Set<string>();
	const uniqueThreads = relatedThreads.filter(({ thread }) => {
		if (seenIds.has(thread.id)) return false;
		seenIds.add(thread.id);
		return true;
	});

	// Aggregate stats: how many members recommend, have read, etc.
	const recommendCount = await locals.db.$count(
		userSubjects,
		and(
			eq(userSubjects.subjectType, SUBJECT),
			eq(userSubjects.subjectId, book.id),
			eq(userSubjects.isRecommended, true)
		)
	);

	const readCount = await locals.db.$count(
		userSubjects,
		and(
			eq(userSubjects.subjectType, SUBJECT),
			eq(userSubjects.subjectId, book.id),
			eq(userSubjects.readingStatus, 'read')
		)
	);

	const memberConnections = await locals.db
		.select({
			member: {
				id: users.id,
				displayName: users.displayName,
				avatarUrl: users.avatarUrl
			},
			relation: {
				readingStatus: userSubjects.readingStatus,
				isRecommended: userSubjects.isRecommended,
				note: userSubjects.note,
				containsSpoilers: userSubjects.containsSpoilers,
				updatedAt: userSubjects.updatedAt
			}
		})
		.from(userSubjects)
		.innerJoin(users, eq(userSubjects.userId, users.id))
		.where(
			and(
				eq(userSubjects.subjectType, SUBJECT),
				eq(userSubjects.subjectId, book.id),
				eq(users.status, 'active'),
				or(
					eq(userSubjects.isRecommended, true),
					ne(userSubjects.readingStatus, 'want_to_read'),
					isNotNull(userSubjects.note)
				)
			)
		)
		.orderBy(desc(userSubjects.isRecommended), desc(userSubjects.updatedAt))
		.all();

	const [sessionLinks, accessOptions, suggestionSessions, themeLinks] = await Promise.all([
		locals.db
			.select({
				link: {
					status: sessionSubjects.status,
					note: sessionSubjects.note
				},
				session: {
					id: sessions.id,
					slug: sessions.slug,
					title: sessions.title,
					startsAt: sessions.startsAt,
					timezone: sessions.timezone,
					status: sessions.status,
					theme: sessions.theme,
					themeTitle: sessions.themeTitle
				},
				themeName: themes.name
			})
			.from(sessionSubjects)
			.innerJoin(sessions, eq(sessionSubjects.sessionId, sessions.id))
			.leftJoin(themes, eq(sessions.themeId, themes.id))
			.where(
				and(
					eq(sessionSubjects.subjectType, SUBJECT),
					eq(sessionSubjects.subjectId, book.id),
					sessionAccessCondition(locals)
				)
			)
			.orderBy(desc(sessions.startsAt), desc(sessions.createdAt))
			.all(),
		locals.db
			.select()
			.from(bookAccessOptions)
			.where(eq(bookAccessOptions.bookId, book.id))
			.orderBy(asc(bookAccessOptions.providerName), asc(bookAccessOptions.format))
			.all(),
		locals.db
			.select({
				id: sessions.id,
				slug: sessions.slug,
				title: sessions.title,
				startsAt: sessions.startsAt,
				timezone: sessions.timezone,
				status: sessions.status,
				theme: sessions.theme,
				themeTitle: sessions.themeTitle,
				themeName: themes.name
			})
			.from(sessions)
			.leftJoin(themes, eq(sessions.themeId, themes.id))
			.where(
				and(inArray(sessions.status, SUGGESTIBLE_SESSION_STATUSES), sessionAccessCondition(locals))
			)
			.orderBy(asc(sessions.startsAt), asc(sessions.title))
			.all(),
		locals.db
			.select({
				id: themes.id,
				name: themes.name,
				slug: themes.slug,
				status: themes.status
			})
			.from(themeBooks)
			.innerJoin(themes, eq(themeBooks.themeId, themes.id))
			.where(eq(themeBooks.bookId, book.id))
			.orderBy(asc(themes.name))
			.all()
	]);

	const linkedSessionIds = new Set(sessionLinks.map((entry) => entry.session.id));

	return {
		book,
		classifications: bookClassifications[book.id] ?? [],
		bookGenres,
		myBookRelation: myBookRelation ?? null,
		memberConnections: memberConnections.map((entry) => ({
			...entry,
			relation: {
				...entry.relation,
				noteHtml: entry.relation.note ? renderMarkdown(entry.relation.note) : null
			},
			canViewProfile: true
		})),
		relatedThreads: uniqueThreads,
		sessionLinks,
		themeLinks,
		accessOptions,
		suggestionSessions: suggestionSessions.filter(
			(session) => !linkedSessionIds.has(session.id) && acceptsBookSuggestions(session)
		),
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

		const book = await locals.db.select().from(books).where(eq(books.slug, params.slug)).get();

		if (!book || book.deletedAt) {
			throw error(404, 'Book not found');
		}

		if (readingStatus === '__clear__') {
			const existing = await locals.db
				.select()
				.from(userSubjects)
				.where(
					and(
						eq(userSubjects.userId, locals.user.id),
						eq(userSubjects.subjectType, SUBJECT),
						eq(userSubjects.subjectId, book.id)
					)
				)
				.get();

			if (existing) {
				if (existing.isRecommended || existing.note || existing.featuredOnProfile) {
					await locals.db
						.update(userSubjects)
						.set({
							readingStatus: 'want_to_read',
							updatedAt: sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`
						})
						.where(
							and(
								eq(userSubjects.userId, locals.user.id),
								eq(userSubjects.subjectType, SUBJECT),
								eq(userSubjects.subjectId, book.id)
							)
						);
				} else {
					await locals.db
						.delete(userSubjects)
						.where(
							and(
								eq(userSubjects.userId, locals.user.id),
								eq(userSubjects.subjectType, SUBJECT),
								eq(userSubjects.subjectId, book.id)
							)
						);
				}
			}

			return { statusUpdated: true };
		}

		if (!['want_to_read', 'reading', 'read', 'did_not_finish'].includes(readingStatus)) {
			return fail(400, { error: 'Choose a valid reading status.' });
		}

		await locals.db
			.insert(userSubjects)
			.values({
				userId: locals.user.id,
				subjectType: SUBJECT,
				subjectId: book.id,
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

	updateNote: async ({ request, locals, params }) => {
		if (!locals.user) {
			throw redirect(302, '/auth/login');
		}

		const book = await locals.db.select().from(books).where(eq(books.slug, params.slug)).get();

		if (!book || book.deletedAt) {
			throw error(404, 'Book not found');
		}

		const data = await request.formData();
		const note = data.get('note')?.toString().trim() || null;
		const containsSpoilers = note ? data.get('containsSpoilers') === 'on' : false;

		const existing = await locals.db
			.select()
			.from(userSubjects)
			.where(
				and(
					eq(userSubjects.userId, locals.user.id),
					eq(userSubjects.subjectType, SUBJECT),
					eq(userSubjects.subjectId, book.id)
				)
			)
			.get();

		if (!note && existing && !existing.isRecommended && !existing.featuredOnProfile) {
			if (existing.readingStatus === 'want_to_read') {
				await locals.db
					.delete(userSubjects)
					.where(
						and(
							eq(userSubjects.userId, locals.user.id),
							eq(userSubjects.subjectType, SUBJECT),
							eq(userSubjects.subjectId, book.id)
						)
					);
				return { noteUpdated: true };
			}
		}

		await locals.db
			.insert(userSubjects)
			.values({
				userId: locals.user.id,
				subjectType: SUBJECT,
				subjectId: book.id,
				note,
				containsSpoilers,
				readingStatus: existing?.readingStatus ?? 'want_to_read',
				isRecommended: existing?.isRecommended ?? false
			})
			.onConflictDoUpdate({
				target: [userSubjects.userId, userSubjects.subjectType, userSubjects.subjectId],
				set: {
					note,
					containsSpoilers,
					updatedAt: sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`
				}
			});

		return { noteUpdated: true };
	},

	toggleRecommend: async ({ locals, params }) => {
		if (!locals.user) {
			throw redirect(302, '/auth/login');
		}

		const book = await locals.db.select().from(books).where(eq(books.slug, params.slug)).get();

		if (!book) {
			throw error(404, 'Book not found');
		}

		await locals.db
			.insert(userSubjects)
			.values({
				userId: locals.user.id,
				subjectType: SUBJECT,
				subjectId: book.id,
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
	},

	suggestForSession: async ({ request, locals, params }) => {
		if (!locals.user) throw redirect(302, '/auth/login');

		const book = await locals.db
			.select({ id: books.id })
			.from(books)
			.where(and(eq(books.slug, params.slug), isNull(books.deletedAt)))
			.get();
		if (!book) throw error(404, 'Book not found');

		const data = await request.formData();
		const sessionId = data.get('sessionId')?.toString();
		if (!sessionId) return fail(400, { error: 'Choose a meeting.' });

		const session = await locals.db
			.select()
			.from(sessions)
			.where(
				and(
					eq(sessions.id, sessionId),
					inArray(sessions.status, SUGGESTIBLE_SESSION_STATUSES),
					sessionAccessCondition(locals)
				)
			)
			.get();
		if (!session || !acceptsBookSuggestions(session)) {
			return fail(400, { error: 'That meeting is no longer accepting suggestions.' });
		}

		await locals.db
			.insert(sessionSubjects)
			.values({
				sessionId,
				subjectType: SUBJECT,
				subjectId: book.id,
				status: 'starter',
				addedByUserId: locals.user.id
			})
			.onConflictDoNothing();

		return { suggestedForSession: true };
	}
};
