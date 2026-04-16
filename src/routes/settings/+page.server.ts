import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { users } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

// pnpm resolves two drizzle-orm copies (D1 vs libsql peer variants) whose private types
// are structurally identical but nominally incompatible. The cast avoids the TS2345 mismatch.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _eq: any = eq;

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw redirect(302, '/auth/login');
	return { user: locals.user };
};

export const actions: Actions = {
	updateProfile: async ({ request, locals }) => {
		if (!locals.user) throw redirect(302, '/auth/login');

		const data = await request.formData();
		const displayName = data.get('displayName')?.toString()?.trim();

		if (!displayName || displayName.length < 2 || displayName.length > 50) {
			return fail(400, { error: 'Display name must be between 2 and 50 characters.' });
		}

		await locals.db
			.update(users)
			.set({ displayName, updatedAt: new Date().toISOString() })
			.where(_eq(users.id, locals.user.id));

		return { success: true };
	}
};
