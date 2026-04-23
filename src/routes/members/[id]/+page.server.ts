import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { books, series, userProfiles, userSubjects, users } from '$lib/server/db/schema';
import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';
import { parseProfileGenres } from '$lib/profile-genres';

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

	const profile =
		(await locals.db.select().from(userProfiles).where(eq(userProfiles.userId, member.id)).get()) ??
		null;

	if (profile?.showProfile === false && locals.user.id !== member.id) {
		throw error(404, 'Member not found');
	}

	const relations = await locals.db
		.select()
		.from(userSubjects)
		.where(eq(userSubjects.userId, member.id))
		.orderBy(
			desc(userSubjects.featuredOnProfile),
			asc(userSubjects.featuredOrder),
			desc(userSubjects.updatedAt)
		)
		.all();

	const bookIds = relations
		.filter((relation) => relation.subjectType === 'book')
		.map((relation) => relation.subjectId);
	const seriesIds = relations
		.filter((relation) => relation.subjectType === 'series')
		.map((relation) => relation.subjectId);

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
	const subjects = relations
		.map((relation) => {
			if (relation.subjectType === 'book') {
				const book = bookMap.get(relation.subjectId);
				return book ? { kind: 'book' as const, relation, book } : null;
			}
			if (relation.subjectType === 'series') {
				const row = seriesMap.get(relation.subjectId);
				return row ? { kind: 'series' as const, relation, series: row } : null;
			}
			return null;
		})
		.filter((item): item is NonNullable<typeof item> => item !== null);

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
