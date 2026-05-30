import { error, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	authors,
	books,
	series,
	userProfiles,
	userSubjects,
	users
} from '$lib/server/db/schema';
import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import { parseProfileGenres } from '$lib/profile-genres';
import { getOrCreateDirectConversation } from '$lib/server/private-messages';

export const load: PageServerLoad = async ({ params, locals }) => {
	if (!locals.user) throw redirect(302, '/auth/login');

	const member = await locals.db
		.select({
			id: users.id,
			displayName: users.displayName,
			avatarUrl: users.avatarUrl,
			status: users.status,
			threadCount: sql<number>`(
				SELECT count(*)
				FROM threads
				WHERE threads.author_user_id = users.id
					AND threads.deleted_at IS NULL
			)`,
			postCount: sql<number>`(
				SELECT count(*)
				FROM posts
				INNER JOIN threads ON threads.id = posts.thread_id
				WHERE posts.author_user_id = users.id
					AND posts.deleted_at IS NULL
					AND threads.deleted_at IS NULL
			)`
		})
		.from(users)
		.where(eq(users.id, params.id))
		.get();

	if (!member || member.status !== 'active') throw error(404, 'Member not found');

	const [profileRows, bookSubjectRows, seriesSubjectRows, authorSubjectRows] = await Promise.all([
		locals.db.select().from(userProfiles).where(eq(userProfiles.userId, member.id)).all(),
		locals.db
			.select({
				relation: userSubjects,
				book: books
			})
			.from(userSubjects)
			.innerJoin(books, eq(userSubjects.subjectId, books.id))
			.where(
				and(
					eq(userSubjects.userId, member.id),
					eq(userSubjects.subjectType, 'book'),
					isNull(books.deletedAt)
				)
			)
			.orderBy(
				desc(userSubjects.featuredOnProfile),
				asc(userSubjects.featuredOrder),
				desc(userSubjects.updatedAt)
			)
			.all(),
		locals.db
			.select({
				relation: userSubjects,
				series
			})
			.from(userSubjects)
			.innerJoin(series, eq(userSubjects.subjectId, series.id))
			.where(
				and(
					eq(userSubjects.userId, member.id),
					eq(userSubjects.subjectType, 'series'),
					isNull(series.deletedAt)
				)
			)
			.orderBy(
				desc(userSubjects.featuredOnProfile),
				asc(userSubjects.featuredOrder),
				desc(userSubjects.updatedAt)
			)
			.all(),
		locals.db
			.select({
				relation: userSubjects,
				author: authors
			})
			.from(userSubjects)
			.innerJoin(authors, eq(userSubjects.subjectId, authors.id))
			.where(
				and(
					eq(userSubjects.userId, member.id),
					eq(userSubjects.subjectType, 'author'),
					isNull(authors.deletedAt)
				)
			)
			.orderBy(
				desc(userSubjects.featuredOnProfile),
				asc(userSubjects.featuredOrder),
				desc(userSubjects.updatedAt)
			)
			.all()
	]);
	const profile = profileRows[0] ?? null;
	const hasPostedOrReplied = member.threadCount > 0 || member.postCount > 0;

	if (profile?.showProfile === false && !hasPostedOrReplied && locals.user.id !== member.id) {
		throw error(404, 'Member not found');
	}

	const subjects = [
		...bookSubjectRows.map(({ relation, book }) => ({ kind: 'book' as const, relation, book })),
		...seriesSubjectRows.map(({ relation, series }) => ({
			kind: 'series' as const,
			relation,
			series
		})),
		...authorSubjectRows.map(({ relation, author }) => ({
			kind: 'author' as const,
			relation,
			author
		}))
	].sort((a, b) => {
		if (a.relation.featuredOnProfile !== b.relation.featuredOnProfile) {
			return a.relation.featuredOnProfile ? -1 : 1;
		}
		return (
			(a.relation.featuredOrder ?? -Infinity) - (b.relation.featuredOrder ?? -Infinity) ||
			b.relation.updatedAt.localeCompare(a.relation.updatedAt)
		);
	});

	return {
		member,
		profile,
		profileGenres: parseProfileGenres(profile?.favoriteGenresText),
		isOwnProfile: locals.user.id === member.id,
		featuredSubjects: subjects.filter(({ relation }) => relation.featuredOnProfile),
		recommendations:
			profile?.showRecommendations === false
				? []
				: subjects.filter(({ relation }) => relation.isRecommended && !relation.featuredOnProfile),
		readSubjects:
			profile?.showReadBooks === false
				? []
				: subjects.filter(
						({ relation }) => relation.readingStatus === 'read' && !relation.featuredOnProfile
					)
	};
};

export const actions: Actions = {
	message: async ({ locals, params }) => {
		if (!locals.user) throw redirect(302, '/auth/login');
		if (locals.user.id === params.id) throw redirect(303, '/settings');

		const conversation = await getOrCreateDirectConversation(locals.db, locals.user.id, params.id);

		throw redirect(303, `/messages/${conversation.conversationId}`);
	}
};
