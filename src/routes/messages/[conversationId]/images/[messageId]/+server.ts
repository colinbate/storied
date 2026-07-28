import { error, redirect } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import type { RequestHandler } from './$types';

import { conversationMembers, privateMessages } from '$lib/server/db/schema';

export const GET: RequestHandler = async ({ locals, params, platform }) => {
	if (!locals.user) throw redirect(302, '/auth/login');

	const message = await locals.db
		.select({ imageKey: privateMessages.imageKey })
		.from(privateMessages)
		.innerJoin(
			conversationMembers,
			and(
				eq(conversationMembers.conversationId, privateMessages.conversationId),
				eq(conversationMembers.userId, locals.user.id)
			)
		)
		.where(
			and(
				eq(privateMessages.id, params.messageId),
				eq(privateMessages.conversationId, params.conversationId),
				isNull(privateMessages.deletedAt)
			)
		)
		.get();

	if (!message?.imageKey) throw error(404, 'Image not found');
	if (!platform?.env.FILES) throw error(503, 'File storage is not available');

	const image = await platform.env.FILES.get(message.imageKey);
	if (!image) throw error(404, 'Image not found');

	const headers = new Headers({
		'Cache-Control': 'private, max-age=3600',
		'Content-Length': String(image.size),
		'Content-Type': image.httpMetadata?.contentType ?? 'application/octet-stream',
		'X-Content-Type-Options': 'nosniff'
	});

	return new Response(image.body, { headers });
};
