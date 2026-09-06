import { fail, redirect } from '@sveltejs/kit';
import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { sessions, threads } from '$lib/server/db/schema';
import { sessionAccessCondition } from '$lib/server/session-lifecycle';
import { isFutureSession } from '$shared/session-lifecycle';
import { getCurrentUserSessionRsvp } from '$lib/server/rsvp';
import { getHostUser } from '$lib/server/host';
import { getOrCreateDirectConversation } from '$lib/server/private-messages';
import { threadAccessCondition, threadViewer } from '$lib/server/thread-access';

function safeNext(value: string | null) {
	return value && value.startsWith('/') && !value.startsWith('//') ? value : null;
}

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) throw redirect(302, '/auth/login');

	const candidates = await locals.db
		.select()
		.from(sessions)
		.where(sessionAccessCondition(locals))
		.orderBy(asc(sessions.startsAt), desc(sessions.createdAt))
		.all();
	const nextSession =
		candidates.find((session) => session.status === 'current') ??
		candidates.find((session) => session.status === 'scheduled' && isFutureSession(session)) ??
		null;

	const [host, rsvp, discussion] = await Promise.all([
		getHostUser(locals.db, locals.user.id),
		nextSession ? getCurrentUserSessionRsvp(locals.db, nextSession.id, locals.user.id) : null,
		nextSession
			? locals.db
					.select({ replyCount: threads.replyCount })
					.from(threads)
					.where(
						and(
							eq(threads.sessionId, nextSession.id),
							eq(threads.sessionThreadRole, 'primary'),
							isNull(threads.deletedAt),
							threadAccessCondition(locals.db, threadViewer(locals))
						)
					)
					.get()
			: null
	]);

	return {
		nextSession,
		nextSessionRsvpStatus: rsvp?.attendanceStatus ?? null,
		discussionReplyCount: discussion?.replyCount ?? null,
		host,
		next: safeNext(url.searchParams.get('next')),
		isFirstVisit: !locals.user.lastLoginAt || url.searchParams.has('next')
	};
};

export const actions: Actions = {
	/** Open (or resume) a private conversation with the host. */
	messageHost: async ({ locals }) => {
		if (!locals.user) throw redirect(302, '/auth/login');
		const host = await getHostUser(locals.db, locals.user.id);
		if (!host) return fail(404, { error: 'There is no host to message right now.' });
		const conversation = await getOrCreateDirectConversation(locals.db, locals.user.id, host.id);
		throw redirect(303, `/messages/${conversation.conversationId}`);
	}
};
