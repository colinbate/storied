import { error } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { cancelParticipantByToken, getParticipantByConfirmationToken } from '$lib/server/rsvp';
import {
	sendCancellationConfirmationEmail,
	sendWaitlistPromotionEmail
} from '$lib/server/rsvp-email';

export const load: PageServerLoad = async ({ params, locals }) => {
	const row = await getParticipantByConfirmationToken(locals.db, params.token);
	if (!row) throw error(404, 'Registration not found.');
	return { session: row.session, participant: row.participant, attendee: row.attendee };
};

export const actions = {
	default: async ({ params, locals, platform, url }) => {
		const result = await cancelParticipantByToken(locals.db, params.token);
		if (!result) throw error(404, 'Registration not found.');
		if ('cannotCancel' in result && result.cannotCancel)
			throw error(400, 'This registration cannot be cancelled.');
		if (!result.alreadyCancelled) {
			await sendCancellationConfirmationEmail(platform, result.session, result.attendee);
			if (result.promoted)
				await sendWaitlistPromotionEmail(
					platform,
					result.session,
					result.promoted.participant,
					result.promoted.attendee,
					url.origin
				);
		}
		return { cancelled: true, alreadyCancelled: result.alreadyCancelled };
	}
} satisfies Actions;
