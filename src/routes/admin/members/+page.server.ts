import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { users } from '$lib/server/db/schema';
import { desc } from 'drizzle-orm';
import { findOrCreateUser } from '$lib/server/auth';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _desc: any = desc;

export const load: PageServerLoad = async ({ locals }) => {
	const allUsers = await locals.db.select().from(users).orderBy(_desc(users.createdAt)).all();

	return { members: allUsers };
};

export const actions: Actions = {
	addMember: async ({ request, locals }) => {
		if (locals.user?.role !== 'admin') return fail(403, { error: 'Forbidden' });

		const data = await request.formData();
		const email = data.get('email')?.toString()?.trim()?.toLowerCase();

		if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
			return fail(400, { error: 'Please enter a valid email address.' });
		}

		const { isNew } = await findOrCreateUser(locals.db, email);

		if (!isNew) {
			return fail(400, { error: 'A member with this email already exists.' });
		}

		return { memberAdded: true, addedEmail: email };
	}
};
