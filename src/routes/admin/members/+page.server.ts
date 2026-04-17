import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { users } from '$lib/server/db/schema';
import { desc, eq } from 'drizzle-orm';
import { findOrCreateUser, isUserRole, requirePermission } from '$lib/server/auth';

export const load: PageServerLoad = async ({ locals }) => {
	requirePermission(locals, 'members:edit');
	const allUsers = await locals.db.select().from(users).orderBy(desc(users.createdAt)).all();

	return { members: allUsers };
};

export const actions: Actions = {
	addMember: async ({ request, locals }) => {
		requirePermission(locals, 'members:edit');

		const data = await request.formData();
		const email = data.get('email')?.toString()?.trim()?.toLowerCase();
		const roleValue = data.get('role')?.toString();

		if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
			return fail(400, { error: 'Please enter a valid email address.' });
		}

		const role = isUserRole(roleValue) ? roleValue : 'member';

		const { isNew } = await findOrCreateUser(locals.db, email, role);

		if (!isNew) {
			return fail(400, { error: 'A member with this email already exists.' });
		}

		return { memberAdded: true, addedEmail: email };
	},

	updateRole: async ({ request, locals }) => {
		requirePermission(locals, 'members:edit');

		const data = await request.formData();
		const userId = data.get('userId')?.toString();
		const roleValue = data.get('role')?.toString();

		if (!userId) {
			return fail(400, { error: 'Missing user id.' });
		}

		if (!isUserRole(roleValue)) {
			return fail(400, { error: 'Invalid role.' });
		}

		// Prevent admins from demoting themselves to avoid lockout.
		if (locals.user?.id === userId && roleValue !== 'admin') {
			return fail(400, { error: "You can't change your own role.", role: 'admin' });
		}

		await locals.db.update(users).set({ role: roleValue }).where(eq(users.id, userId));

		return { roleUpdated: true, updatedUserId: userId, updatedRole: roleValue };
	}
};
