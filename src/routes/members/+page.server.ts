import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { userProfiles, userSubjects, users } from '$lib/server/db/schema';
import { asc, inArray } from 'drizzle-orm';
import { parseProfileGenres } from '$lib/profile-genres';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw redirect(302, '/auth/login');

	const members = await locals.db
		.select({
			id: users.id,
			displayName: users.displayName,
			avatarUrl: users.avatarUrl,
			status: users.status
		})
		.from(users)
		.orderBy(asc(users.displayName))
		.all();

	const activeMembers = members.filter((member) => member.status === 'active');
	const memberIds = activeMembers.map((member) => member.id);

	const profiles = memberIds.length
		? await locals.db
				.select()
				.from(userProfiles)
				.where(inArray(userProfiles.userId, memberIds))
				.all()
		: [];
	const profileMap = new Map(profiles.map((profile) => [profile.userId, profile]));

	const relations = memberIds.length
		? await locals.db
				.select({
					userId: userSubjects.userId,
					isRecommended: userSubjects.isRecommended,
					readingStatus: userSubjects.readingStatus,
					featuredOnProfile: userSubjects.featuredOnProfile
				})
				.from(userSubjects)
				.where(inArray(userSubjects.userId, memberIds))
				.all()
		: [];

	const statsMap = new Map<string, { recommendations: number; read: number; featured: number }>();
	for (const relation of relations) {
		const existing = statsMap.get(relation.userId) ?? { recommendations: 0, read: 0, featured: 0 };
		if (relation.isRecommended) existing.recommendations += 1;
		if (relation.readingStatus === 'read') existing.read += 1;
		if (relation.featuredOnProfile) existing.featured += 1;
		statsMap.set(relation.userId, existing);
	}

	return {
		members: activeMembers
			.map((member) => {
				const profile = profileMap.get(member.id) ?? null;
				const visible = profile?.showProfile !== false || member.id === locals.user?.id;
				if (!visible) return null;
				return {
					...member,
					profile,
					profileGenres: parseProfileGenres(profile?.favoriteGenresText),
					stats: statsMap.get(member.id) ?? { recommendations: 0, read: 0, featured: 0 }
				};
			})
			.filter((member): member is NonNullable<typeof member> => member !== null)
	};
};
