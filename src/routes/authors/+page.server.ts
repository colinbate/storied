import { loadLibrarySubjects } from '$lib/server/library';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	return loadLibrarySubjects(locals.db);
};
