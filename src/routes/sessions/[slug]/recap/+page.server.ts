import { error, redirect } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { attendeeIdentities, sessionAttendance, sessions } from '$lib/server/db/schema';
import { requirePermission } from '$lib/server/auth';
import { sessionAccessCondition } from '$lib/server/session-lifecycle';
import {
	findNextSession,
	getQuickNotes,
	getSessionFeedbackForFacilitator,
	updateSessionRecaps,
	workflowPhase
} from '$lib/server/session-workflow';

async function requireSession(locals: App.Locals, slug: string) {
	requirePermission(locals, 'sessions:facilitate');
	const session = await locals.db
		.select()
		.from(sessions)
		.where(and(eq(sessions.slug, slug), sessionAccessCondition(locals)))
		.get();
	if (!session) throw error(404, 'Session not found');
	return session;
}

export const load: PageServerLoad = async ({ params, locals }) => {
	if (!locals.user) throw redirect(302, '/auth/login');
	const session = await requireSession(locals, params.slug);

	const [notes, feedback, attendance, nextSession] = await Promise.all([
		getQuickNotes(locals.db, session.id),
		getSessionFeedbackForFacilitator(locals.db, session.id),
		locals.db
			.select({ status: sessionAttendance.status, name: attendeeIdentities.name })
			.from(sessionAttendance)
			.innerJoin(attendeeIdentities, eq(sessionAttendance.attendeeId, attendeeIdentities.id))
			.where(eq(sessionAttendance.sessionId, session.id))
			.all(),
		findNextSession(locals.db, session)
	]);

	return {
		session,
		phase: workflowPhase(session),
		notes,
		feedback,
		present: attendance
			.filter((row) => row.status === 'present')
			.map((row) => row.name)
			.sort(),
		absent: attendance
			.filter((row) => row.status === 'absent')
			.map((row) => row.name)
			.sort(),
		nextSession: nextSession
			? { slug: nextSession.slug, title: nextSession.title, themeTitle: nextSession.themeTitle }
			: null
	};
};

export const actions: Actions = {
	save: async ({ locals, params, request }) => {
		const session = await requireSession(locals, params.slug);
		const data = await request.formData();
		await updateSessionRecaps(locals.db, session.id, {
			facilitatorRecap: data.get('facilitatorRecap')?.toString() ?? null,
			memberRecap: data.get('memberRecap')?.toString() ?? null,
			publicRecap: data.get('publicRecap')?.toString() ?? null,
			feedbackEnabled: data.get('feedbackEnabled') === 'on'
		});
		return { saved: true };
	}
};
