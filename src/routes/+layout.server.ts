import type { LayoutServerLoad } from './$types';
import { categories } from '$lib/server/db/schema';
import { inArray } from 'drizzle-orm';

const SECONDARY_NAV_CATEGORY_SLUGS = ['recommendations', 'general', 'off-topic'];

export const load: LayoutServerLoad = async ({ locals }) => {
	const navCategories = locals.user
		? await locals.db
				.select({
					id: categories.id,
					name: categories.name,
					slug: categories.slug
				})
				.from(categories)
				.where(inArray(categories.slug, SECONDARY_NAV_CATEGORY_SLUGS))
				.all()
		: [];

	return {
		user: locals.user,
		permissions: locals.permissions,
		dyslexicFont: !!locals.user?.dyslexicFont,
		navCategories: navCategories.sort(
			(a, b) =>
				SECONDARY_NAV_CATEGORY_SLUGS.indexOf(a.slug) -
				SECONDARY_NAV_CATEGORY_SLUGS.indexOf(b.slug)
		)
	};
};
