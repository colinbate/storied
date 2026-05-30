import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { userProfiles, userSubjects, users } from '$lib/server/db/schema';
import { asc, count, eq, sql } from 'drizzle-orm';
import { parseProfileGenres } from '$lib/profile-genres';

function hasProfileContent(profile: typeof userProfiles.$inferSelect | null) {
	return Boolean(
		profile?.headline?.trim() ||
		profile?.bio?.trim() ||
		profile?.favoriteGenresText?.trim() ||
		profile?.locationText?.trim() ||
		profile?.websiteUrl?.trim()
	);
}

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw redirect(302, '/auth/login');

	const [members, countResult, relations] = await locals.db.batch([
		locals.db
			.select({
				id: users.id,
				displayName: users.displayName,
				avatarUrl: users.avatarUrl,
				status: users.status,
				profile: userProfiles,
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
			.leftJoin(userProfiles, eq(userProfiles.userId, users.id))
			.where(eq(users.status, 'active'))
			.orderBy(asc(users.displayName)),

		locals.db.select({ count: count() }).from(users).where(eq(users.status, 'active')),

		locals.db
			.select({
				userId: userSubjects.userId,
				isRecommended: userSubjects.isRecommended,
				readingStatus: userSubjects.readingStatus,
				featuredOnProfile: userSubjects.featuredOnProfile
			})
			.from(userSubjects)
			.innerJoin(users, eq(users.id, userSubjects.userId))
			.where(eq(users.status, 'active'))
	]);

	const activeMemberCount = countResult[0]?.count ?? members.length;

	const statsMap = new Map<string, { recommendations: number; read: number; featured: number }>();
	for (const relation of relations) {
		const existing = statsMap.get(relation.userId) ?? { recommendations: 0, read: 0, featured: 0 };
		if (relation.isRecommended) existing.recommendations += 1;
		if (relation.readingStatus === 'read') existing.read += 1;
		if (relation.featuredOnProfile) existing.featured += 1;
		statsMap.set(relation.userId, existing);
	}

	const listedMembers = members
		.map((member) => ({
			...member,
			profileGenres: parseProfileGenres(member.profile?.favoriteGenresText),
			stats: statsMap.get(member.id) ?? { recommendations: 0, read: 0, featured: 0 }
		}))
		.filter((member) => {
			const hasVisibleProfile =
				member.profile?.showProfile !== false &&
				(hasProfileContent(member.profile) || member.stats.featured > 0);
			const hasPostedOrReplied = member.threadCount > 0 || member.postCount > 0;

			return hasVisibleProfile || hasPostedOrReplied;
		});

	return {
		members: listedMembers,
		membersNotYetListed: Math.max(0, activeMemberCount - listedMembers.length),
		isCurrentUserListed: listedMembers.some((member) => member.id === locals.user?.id)
	};
};
