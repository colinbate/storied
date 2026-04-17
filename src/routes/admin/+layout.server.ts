import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	if (!locals.permissions.has('admin:view')) {
		throw redirect(302, '/');
	}
	return { adminUser: locals.user, permissions: locals.permissions };
};
