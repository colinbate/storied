import type { PageServerLoad } from './$types';
import { loadLibrarySubjects } from '$lib/server/library';
import { sessionAccessCondition } from '$lib/server/session-lifecycle';
import { redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw redirect(302, '/auth/login');
	return loadLibrarySubjects(locals.db, {
		userId: locals.user.id,
		sessionAccess: sessionAccessCondition(locals)
	});
};
