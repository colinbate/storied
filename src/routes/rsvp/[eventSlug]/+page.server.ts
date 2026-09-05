import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { PUBLIC_ORIGIN } from '$shared/brand';
import {
	canAcceptSessionRsvps,
	getOrCreatePublicAttendee,
	getSessionByRsvpSlug,
	isValidRsvpEmail,
	RsvpCapacityError,
	submitSessionRsvp
} from '$lib/server/rsvp';

const declineResponses = new Set(['declined', 'decline', 'not_attending', 'not-attending', 'no']);

function statusRedirect(
	rawTarget: string,
	fallbackSlug: string,
	status: string,
	actualStatus = status,
	emailFailed = false
) {
	if (rawTarget) {
		try {
			const target = new URL(rawTarget);
			if (target.origin === new URL(PUBLIC_ORIGIN).origin) {
				target.searchParams.set('rsvp', status);
				return target.toString();
			}
		} catch {
			// Invalid or untrusted redirects fall back to Storied's success page.
		}
	}
	return `/success?event=${encodeURIComponent(fallbackSlug)}&status=${encodeURIComponent(actualStatus)}${emailFailed ? '&email=failed' : ''}`;
}

export const load: PageServerLoad = async ({ params, locals }) => {
	const session = await getSessionByRsvpSlug(locals.db, params.eventSlug);
	if (!session || !session.isPublic || session.status === 'draft')
		return { session: null, error: 'Session not found.' };
	if (!session.isPublic || !canAcceptSessionRsvps(session)) {
		return { session, error: 'This session is not currently accepting RSVPs.' };
	}
	return { session, error: null };
};

export const actions = {
	default: async ({ request, params, locals, platform, url }) => {
		const data = await request.formData();
		const name = data.get('name')?.toString().trim() ?? '';
		const email = data.get('email')?.toString().trim() ?? '';
		const response = data.get('response')?.toString().trim().toLowerCase() ?? '';
		const redirectTo = data.get('redirect_to')?.toString() ?? '';

		if (data.get('phone')?.toString()) {
			return redirect(303, statusRedirect(redirectTo, params.eventSlug, 'success'));
		}
		if (!name) return fail(400, { name, email, error: 'Name is required.' });
		if (!email || !isValidRsvpEmail(email)) {
			return fail(400, { name, email, error: 'A valid email address is required.' });
		}

		const session = await getSessionByRsvpSlug(locals.db, params.eventSlug);
		if (!session || !session.isPublic || session.status === 'draft')
			return fail(404, { name, email, error: 'Session not found.' });
		if (!session.isPublic || !canAcceptSessionRsvps(session)) {
			return fail(400, { name, email, error: 'This session is not currently accepting RSVPs.' });
		}

		const attendee = await getOrCreatePublicAttendee(locals.db, name, email);
		try {
			const result = await submitSessionRsvp({
				db: locals.db,
				platform,
				baseUrl: url.origin,
				session,
				attendee,
				response: declineResponses.has(response) ? 'declined' : 'attending',
				source: 'public_form',
				confirmationToken: crypto.randomUUID()
			});

			const publicStatus = result.duplicate
				? 'duplicate'
				: result.status === 'registered'
					? 'success'
					: result.status;
			return redirect(
				303,
				statusRedirect(
					redirectTo,
					params.eventSlug,
					publicStatus,
					result.status,
					result.confirmationEmailFailed
				)
			);
		} catch (error) {
			if (error instanceof RsvpCapacityError) {
				return fail(400, { name, email, error: error.message });
			}
			throw error;
		}
	}
} satisfies Actions;
