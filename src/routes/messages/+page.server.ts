import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

import { getInboxConversations } from '$lib/server/private-messages';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw redirect(302, '/auth/login');

	return {
		conversations: await getInboxConversations(locals.db, locals.user.id)
	};
};
