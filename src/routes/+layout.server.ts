import type { LayoutServerLoad } from './$types';
import { userAchievements } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { getUnreadConversationCount } from '$lib/server/private-messages';
import { RESTRICTED_CATALOG_ACHIEVEMENT } from '$lib/server/achievements';

export const load: LayoutServerLoad = async ({ depends, locals }) => {
	depends('app:message-unread-count');

	const [unreadMessageConversationCount, achievementRows] = locals.user
		? await Promise.all([
				getUnreadConversationCount(locals.db, locals.user.id),
				locals.db
					.select({ userId: userAchievements.userId })
					.from(userAchievements)
					.where(eq(userAchievements.achievementKey, RESTRICTED_CATALOG_ACHIEVEMENT))
			])
		: [0, []];

	return {
		user: locals.user,
		permissions: locals.permissions,
		dyslexicFont: !!locals.user?.dyslexicFont,
		unreadMessageConversationCount,
		achievementUserIds: achievementRows.map((row) => row.userId)
	};
};
