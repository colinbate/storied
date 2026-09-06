import { error, fail } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { sessions, type SessionMessageKind } from '$lib/server/db/schema';
import { requirePermission } from '$lib/server/auth';
import {
	draftFromTemplate,
	listSessionMessageDeliveries,
	listSessionMessages,
	resolveSessionMessageRecipients,
	retrySessionMessage,
	sendSessionMessage
} from '$lib/server/session-messages';
import { isSessionMessageAudience, SESSION_MESSAGE_AUDIENCES } from '$shared/session-messages';

const messageKinds = new Set<SessionMessageKind>(['custom', 'update', 'cancellation']);

async function requireSession(locals: App.Locals, slug: string) {
	requirePermission(locals, 'sessions:edit');
	const session = await locals.db.select().from(sessions).where(eq(sessions.slug, slug)).get();
	if (!session) throw error(404, 'Session not found');
	return session;
}

export const load: PageServerLoad = async ({ params, locals, url }) => {
	const session = await requireSession(locals, params.slug);

	const [{ byAudience }, messages, deliveries] = await Promise.all([
		resolveSessionMessageRecipients(locals.db, session, [...SESSION_MESSAGE_AUDIENCES]),
		listSessionMessages(locals.db, session.id),
		listSessionMessageDeliveries(locals.db, session.id)
	]);

	return {
		session,
		audiences: SESSION_MESSAGE_AUDIENCES.map((audience) => ({
			key: audience,
			recipients: byAudience[audience].map(({ attendeeId, name, email, userId }) => ({
				attendeeId,
				name,
				email,
				isMember: Boolean(userId)
			}))
		})),
		template: draftFromTemplate(session, url.searchParams),
		messages: messages.map(({ message, sender }) => ({
			...message,
			sender,
			deliveries: deliveries.filter((delivery) => delivery.messageId === message.id)
		}))
	};
};

export const actions: Actions = {
	send: async ({ request, params, locals, platform }) => {
		const session = await requireSession(locals, params.slug);
		const data = await request.formData();
		const audiences = data.getAll('audiences').map(String).filter(isSessionMessageAudience);
		const kindValue = data.get('kind')?.toString() as SessionMessageKind | undefined;
		const kind = kindValue && messageKinds.has(kindValue) ? kindValue : 'custom';

		const result = await sendSessionMessage({
			db: locals.db,
			platform,
			session,
			senderUserId: locals.user?.id ?? null,
			kind,
			audiences,
			subject: data.get('subject')?.toString() ?? '',
			bodySource: data.get('body')?.toString() ?? ''
		});
		if ('error' in result) return fail(400, { error: result.error });
		return { sent: true, ...result };
	},

	retry: async ({ request, params, locals, platform }) => {
		const session = await requireSession(locals, params.slug);
		const messageId = (await request.formData()).get('messageId')?.toString();
		if (!messageId) return fail(400, { error: 'Missing message.' });
		const result = await retrySessionMessage({ db: locals.db, platform, session, messageId });
		if (!result) return fail(404, { error: 'Message not found.' });
		return { retryComplete: true, ...result };
	}
};
