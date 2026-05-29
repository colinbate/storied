import type { LayoutServerLoad } from './$types';
import { categories } from '$lib/server/db/schema';
import { inArray } from 'drizzle-orm';
import { getUnreadConversationCount } from '$lib/server/private-messages';

const SECONDARY_NAV_CATEGORY_SLUGS = ['recommendations', 'general', 'off-topic'];

export const load: LayoutServerLoad = async ({ depends, locals }) => {
	depends('app:message-unread-count');

	const [navCategories, unreadMessageConversationCount] = locals.user
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
				getUnreadConversationCount(locals.db, locals.user.id)
			])
		: [[], 0];

	return {
		user: locals.user,
		permissions: locals.permissions,
		dyslexicFont: !!locals.user?.dyslexicFont,
		unreadMessageConversationCount,
		navCategories: navCategories.sort(
			(a, b) =>
				SECONDARY_NAV_CATEGORY_SLUGS.indexOf(a.slug) - SECONDARY_NAV_CATEGORY_SLUGS.indexOf(b.slug)
		)
	};
};
