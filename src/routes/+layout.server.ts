import type { LayoutServerLoad } from './$types';
import { categories, userAchievements } from '$lib/server/db/schema';
import { eq, inArray } from 'drizzle-orm';
import { getUnreadConversationCount } from '$lib/server/private-messages';
import { RESTRICTED_CATALOG_ACHIEVEMENT } from '$lib/server/achievements';

const SECONDARY_NAV_CATEGORY_SLUGS = ['recommendations', 'general', 'off-topic'];

export const load: LayoutServerLoad = async ({ depends, locals }) => {
	depends('app:message-unread-count');

	const [navCategories, unreadMessageConversationCount, achievementRows] = locals.user
		? await Promise.all([
				locals.db
					.select({
						id: categories.id,
						name: categories.name,
						slug: categories.slug
					})
					.from(categories)
					.where(inArray(categories.slug, SECONDARY_NAV_CATEGORY_SLUGS))
					.all(),
				getUnreadConversationCount(locals.db, locals.user.id),
				locals.db
					.select({ userId: userAchievements.userId })
					.from(userAchievements)
					.where(eq(userAchievements.achievementKey, RESTRICTED_CATALOG_ACHIEVEMENT))
			])
		: [[], 0, []];

	return {
		user: locals.user,
		permissions: locals.permissions,
		dyslexicFont: !!locals.user?.dyslexicFont,
		unreadMessageConversationCount,
		achievementUserIds: achievementRows.map((row) => row.userId),
		navCategories: navCategories.sort(
			(a, b) =>
				SECONDARY_NAV_CATEGORY_SLUGS.indexOf(a.slug) - SECONDARY_NAV_CATEGORY_SLUGS.indexOf(b.slug)
		)
	};
};
