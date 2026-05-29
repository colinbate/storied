import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

import {
	archiveConversation,
	loadConversation,
	sendPrivateMessage,
	setConversationMuted
} from '$lib/server/private-messages';

export const load: PageServerLoad = async ({ locals, params }) => {
	if (!locals.user) throw redirect(302, '/auth/login');

	return await loadConversation(locals.db, params.conversationId, locals.user.id);
};

export const actions: Actions = {
	send: async ({ request, locals, params, platform, url }) => {
		if (!locals.user) throw redirect(302, '/auth/login');

		const data = await request.formData();
		const bodySource = data.get('body')?.toString() ?? '';

		return await sendPrivateMessage(locals.db, {
			platform,
			conversationId: params.conversationId,
			authorUserId: locals.user.id,
			bodySource,
			baseUrl: url.origin
		});
	},

	mute: async ({ request, locals, params }) => {
		if (!locals.user) throw redirect(302, '/auth/login');

		const data = await request.formData();
		const muted = data.get('muted')?.toString() === 'true';

		return await setConversationMuted(locals.db, {
			conversationId: params.conversationId,
			userId: locals.user.id,
			muted
		});
	},

	archive: async ({ locals, params }) => {
		if (!locals.user) throw redirect(302, '/auth/login');

		await archiveConversation(locals.db, params.conversationId, locals.user.id);
		throw redirect(303, '/messages');
	},

	noop: async () => fail(400, { error: 'Unknown action.' })
};
