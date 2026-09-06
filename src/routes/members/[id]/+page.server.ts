import { error, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	authors,
	books,
	series,
	userProfileLinks,
	userProfiles,
	userSubjects,
	users
} from '$lib/server/db/schema';
import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import { parseProfileGenres } from '$lib/profile-genres';
import { getOrCreateDirectConversation } from '$lib/server/private-messages';
import { loadClassificationsBySubject } from '$lib/server/classifications';
import { renderMarkdown } from '$lib/server/markdown';

export const load: PageServerLoad = async ({ params, locals }) => {
	if (!locals.user) throw redirect(302, '/auth/login');
	const member = await locals.db
		.select({
			id: users.id,
			displayName: users.displayName,
			avatarUrl: users.avatarUrl,
			status: users.status
		})
		.from(users)
		.where(eq(users.id, params.id))
		.get();

	if (!member || member.status !== 'active') throw error(404, 'Member not found');

	const [profileRows, profileLinks, bookSubjectRows, seriesSubjectRows, authorSubjectRows] =
		await Promise.all([
			locals.db.select().from(userProfiles).where(eq(userProfiles.userId, member.id)).all(),
			locals.db
				.select()
				.from(userProfileLinks)
				.where(eq(userProfileLinks.userId, member.id))
				.orderBy(asc(userProfileLinks.displayOrder), asc(userProfileLinks.createdAt))
				.all(),
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
	const [bookClassifications, seriesClassifications] = await Promise.all([
		loadClassificationsBySubject(
			locals.db,
			'book',
			bookSubjectRows.map(({ book }) => book.id)
		),
		loadClassificationsBySubject(
			locals.db,
			'series',
			seriesSubjectRows.map(({ series }) => series.id)
		)
	]);
	const profile = profileRows[0] ?? null;
	const subjects = [
		...bookSubjectRows.map(({ relation, book }) => ({
			kind: 'book' as const,
			relation: {
				...relation,
				noteHtml: relation.note ? renderMarkdown(relation.note) : null
			},
			book: { ...book, classifications: bookClassifications[book.id] ?? [] }
		})),
		...seriesSubjectRows.map(({ relation, series }) => ({
			kind: 'series' as const,
			relation: {
				...relation,
				noteHtml: relation.note ? renderMarkdown(relation.note) : null
			},
			series: { ...series, classifications: seriesClassifications[series.id] ?? [] }
		})),
		...authorSubjectRows.map(({ relation, author }) => ({
			kind: 'author' as const,
			relation: {
				...relation,
				noteHtml: relation.note ? renderMarkdown(relation.note) : null
			},
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
		profileLinks,
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
