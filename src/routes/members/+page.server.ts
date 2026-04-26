import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { userProfiles, userSubjects, users } from '$lib/server/db/schema';
import { and, asc, count, eq } from 'drizzle-orm';
import { parseProfileGenres } from '$lib/profile-genres';

function hasProfileContent(profile: typeof userProfiles.$inferSelect) {
	return Boolean(
		profile.headline?.trim() ||
		profile.bio?.trim() ||
		profile.favoriteGenresText?.trim() ||
		profile.locationText?.trim() ||
		profile.websiteUrl?.trim()
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
				profile: userProfiles
			})
			.from(users)
			.innerJoin(userProfiles, eq(userProfiles.userId, users.id))
			.where(and(eq(users.status, 'active'), eq(userProfiles.showProfile, true)))
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
			.innerJoin(userProfiles, eq(userProfiles.userId, users.id))
			.where(and(eq(users.status, 'active'), eq(userProfiles.showProfile, true)))
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

	const publicProfileMembers = members
		.map((member) => ({
			...member,
			profileGenres: parseProfileGenres(member.profile.favoriteGenresText),
			stats: statsMap.get(member.id) ?? { recommendations: 0, read: 0, featured: 0 }
		}))
		.filter((member) => hasProfileContent(member.profile) || member.stats.featured > 0);

	return {
		members: publicProfileMembers,
		membersWithoutPublicProfiles: Math.max(0, activeMemberCount - publicProfileMembers.length),
		isCurrentUserListed: publicProfileMembers.some((member) => member.id === locals.user?.id)
	};
};
