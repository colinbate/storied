import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	if (!locals.user) throw redirect(302, '/auth/login');
	if (locals.user.role !== 'admin' && locals.user.role !== 'moderator') {
		throw redirect(302, '/');
	}
	return { adminUser: locals.user };
};
