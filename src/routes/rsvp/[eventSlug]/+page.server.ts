import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { PUBLIC_ORIGIN } from '$shared/brand';
import {
	canAcceptSessionRsvps,
	getOrCreatePublicAttendee,
	getSessionByRsvpSlug,
	isValidRsvpEmail,
	RsvpCapacityError,
	setAttendeeRsvp
} from '$lib/server/rsvp';
import {
	sendRegistrationConfirmationEmail,
	sendWaitlistConfirmationEmail,
	sendWaitlistPromotionEmail
} from '$lib/server/rsvp-email';

const declineResponses = new Set(['declined', 'decline', 'not_attending', 'not-attending', 'no']);

function statusRedirect(rawTarget: string, fallbackSlug: string, status: string) {
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
	return `/success?event=${encodeURIComponent(fallbackSlug)}&status=${encodeURIComponent(status)}`;
}

export const load: PageServerLoad = async ({ params, locals }) => {
	const session = await getSessionByRsvpSlug(locals.db, params.eventSlug);
	if (!session) return { session: null, error: 'Session not found.' };
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
		if (!session) return fail(404, { name, email, error: 'Session not found.' });
		if (!session.isPublic || !canAcceptSessionRsvps(session)) {
			return fail(400, { name, email, error: 'This session is not currently accepting RSVPs.' });
		}

		const attendee = await getOrCreatePublicAttendee(locals.db, name, email);
		try {
			const result = await setAttendeeRsvp({
				db: locals.db,
				session,
				attendee,
				response: declineResponses.has(response) ? 'declined' : 'attending',
				source: 'public_form',
				confirmationToken: crypto.randomUUID()
			});

			if (result.promoted) {
				await sendWaitlistPromotionEmail(
					platform,
					session,
					result.promoted.participant,
					result.promoted.attendee,
					url.origin
				);
			}
			if (!result.duplicate && result.status === 'registered') {
				await sendRegistrationConfirmationEmail(
					platform,
					session,
					result.participant,
					attendee,
					url.origin
				);
			} else if (!result.duplicate && result.status === 'waitlisted') {
				await sendWaitlistConfirmationEmail(
					platform,
					session,
					result.participant,
					attendee,
					url.origin
				);
			}

			const publicStatus = result.duplicate
				? 'duplicate'
				: result.status === 'registered'
					? 'success'
					: result.status;
			return redirect(303, statusRedirect(redirectTo, params.eventSlug, publicStatus));
		} catch (error) {
			if (error instanceof RsvpCapacityError) {
				return fail(400, { name, email, error: error.message });
			}
			throw error;
		}
	}
} satisfies Actions;
