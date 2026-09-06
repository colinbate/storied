import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { userProfiles, userSubjects, users } from '$lib/server/db/schema';
import { asc, count, eq } from 'drizzle-orm';
import { parseProfileGenres } from '$lib/profile-genres';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw redirect(302, '/auth/login');
	const [members, countResult, relations] = await locals.db.batch([
		locals.db
			.select({
				id: users.id,
				displayName: users.displayName,
				avatarUrl: users.avatarUrl,
				status: users.status,
				profile: userProfiles
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
		.map((member) => {
			const stats = statsMap.get(member.id) ?? { recommendations: 0, read: 0, featured: 0 };
			return {
				...member,
				profileGenres: parseProfileGenres(member.profile?.favoriteGenresText),
				stats: {
					...stats,
					recommendations:
						member.profile?.showRecommendations === false ? 0 : stats.recommendations,
					read: member.profile?.showReadBooks === false ? 0 : stats.read
				}
			};
		})
		.filter((member) => member.profile?.showInMemberList !== false);

	return {
		members: listedMembers,
		membersNotYetListed: Math.max(0, activeMemberCount - listedMembers.length),
		isCurrentUserListed: listedMembers.some((member) => member.id === locals.user?.id)
	};
};
