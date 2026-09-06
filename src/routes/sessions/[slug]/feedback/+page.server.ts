import { error, fail, redirect } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { sessions } from '$lib/server/db/schema';
import { sessionAccessCondition } from '$lib/server/session-lifecycle';
import {
	canGiveFeedback,
	getOwnSessionFeedback,
	isFeedbackPace,
	submitSessionFeedback
} from '$lib/server/session-workflow';

async function requireFeedbackSession(locals: App.Locals, slug: string) {
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
	const session = await requireFeedbackSession(locals, params.slug);
	const own = await getOwnSessionFeedback(locals.db, session.id, locals.user.id);
	return {
		session: {
			slug: session.slug,
			title: session.title,
			startsAt: session.startsAt,
			timezone: session.timezone
		},
		open: canGiveFeedback(session),
		feedback: own
			? {
					overallRating: own.overallRating,
					pace: own.pace,
					comments: own.comments,
					futureDiscussion: own.futureDiscussion,
					updatedAt: own.updatedAt
				}
			: null
	};
};

export const actions: Actions = {
	submit: async ({ locals, params, request }) => {
		if (!locals.user) throw redirect(302, '/auth/login');
		const session = await requireFeedbackSession(locals, params.slug);
		if (!canGiveFeedback(session)) {
			return fail(400, { error: 'Feedback is not open for this session.' });
		}
		const data = await request.formData();
		const ratingRaw = data.get('overallRating')?.toString();
		const rating = ratingRaw ? Number.parseInt(ratingRaw, 10) : null;
		if (rating !== null && (!Number.isInteger(rating) || rating < 1 || rating > 5)) {
			return fail(400, { error: 'Choose a rating from 1 to 5.' });
		}
		const paceRaw = data.get('pace')?.toString() || null;
		if (paceRaw && !isFeedbackPace(paceRaw)) return fail(400, { error: 'Choose a pace.' });
		const pace = paceRaw && isFeedbackPace(paceRaw) ? paceRaw : null;
		const comments = data.get('comments')?.toString().trim() || null;
		const futureDiscussion = data.get('futureDiscussion')?.toString().trim() || null;
		if (rating === null && !pace && !comments && !futureDiscussion) {
			return fail(400, { error: 'Answer at least one question.' });
		}
		await submitSessionFeedback(locals.db, {
			sessionId: session.id,
			userId: locals.user.id,
			overallRating: rating,
			pace,
			comments,
			futureDiscussion
		});
		return { saved: true };
	}
};
