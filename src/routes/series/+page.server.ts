import type { PageServerLoad } from './$types';
import { loadLibrarySubjects } from '$lib/server/library';

export const load: PageServerLoad = async ({ locals }) => {
	return loadLibrarySubjects(locals.db);
};
