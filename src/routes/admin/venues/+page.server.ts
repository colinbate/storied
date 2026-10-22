import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { eq, and } from 'drizzle-orm';
import { requirePermission } from '$lib/server/auth';
import { newId } from '$lib/server/ids';
import { venues } from '$lib/server/db/schema';
import { listVenues, parseLogistics } from '$lib/server/session-logistics';

export const load: PageServerLoad = async ({ locals }) => {
	requirePermission(locals, 'sessions:edit');
	return { venues: await listVenues(locals.db) };
};

export const actions: Actions = {
	save: async ({ locals, request }) => {
		requirePermission(locals, 'sessions:edit');
		const data = await request.formData();
		let details;
		try {
			details = parseLogistics(data);
		} catch (error) {
			return fail(400, { error: (error as Error).message });
		}
		if (!details.locationName || !details.meetingFormat)
			return fail(400, { error: 'Enter a venue name and choose a meeting format.' });
		const values = {
			name: details.locationName,
			meetingFormat: details.meetingFormat,
			address: details.locationAddress,
			joiningUrl: details.joiningUrl,
			accessibilityNotes: details.accessibilityNotes,
			updatedAt: new Date().toISOString()
		};
		const id = data.get('id')?.toString();
		if (id) {
			const saved = await locals.db
				.update(venues)
				.set(values)
				.where(
					and(
						eq(venues.id, id),
						eq(venues.updatedAt, data.get('expectedUpdatedAt')?.toString() ?? '')
					)
				)
				.returning({ id: venues.id });
			if (!saved.length)
				return fail(409, { error: 'This venue changed. Reload the page and try again.' });
		} else await locals.db.insert(venues).values({ id: newId(), ...values });
		return { saved: true };
	},
	archive: async ({ locals, request }) => {
		requirePermission(locals, 'sessions:edit');
		const data = await request.formData();
		const id = data.get('id')?.toString();
		if (!id) return fail(400, { error: 'Choose a venue.' });
		const now = new Date().toISOString();
		await locals.db
			.update(venues)
			.set({ archivedAt: data.get('restore') === 'yes' ? null : now, updatedAt: now })
			.where(eq(venues.id, id));
		return { saved: true };
	}
};
