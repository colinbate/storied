import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

import {
	archiveConversation,
	loadConversation,
	sendPrivateMessage,
	setConversationMuted
} from '$lib/server/private-messages';
import { PostImageUploadError, readPostImage } from '$lib/server/post-images';

export const load: PageServerLoad = async ({ locals, params }) => {
	if (!locals.user) throw redirect(302, '/auth/login');

	return await loadConversation(locals.db, params.conversationId, locals.user.id);
};

export const actions: Actions = {
	send: async ({ request, locals, params, platform, url }) => {
		if (!locals.user) throw redirect(302, '/auth/login');

		const data = await request.formData();
		const bodySource = data.get('body')?.toString() ?? '';
		const imageInput = readPostImage(data);
		if (imageInput.error) return fail(400, { error: imageInput.error });

		try {
			return await sendPrivateMessage(locals.db, {
				platform,
				conversationId: params.conversationId,
				authorUserId: locals.user.id,
				bodySource,
				baseUrl: url.origin,
				imageFile: imageInput.file
			});
		} catch (error) {
			if (error instanceof PostImageUploadError) {
				return fail(500, { error: 'The image could not be uploaded. Please try again.' });
			}
			throw error;
		}
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
