import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { invites, moderationEvents, users } from '$lib/server/db/schema';
import { desc, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import {
	findOrCreateUser,
	hashToken,
	isUserRole,
	isUserStatus,
	requirePermission
} from '$lib/server/auth';
import { sendInviteEmail } from '$lib/server/email';

function normalizeEmail(value: FormDataEntryValue | null): string | null {
	const email = value?.toString()?.trim()?.toLowerCase();
	if (!email) return null;
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
	return email;
}

export const load: PageServerLoad = async ({ locals }) => {
	requirePermission(locals, 'members:edit');
	const allUsers = await locals.db.select().from(users).orderBy(desc(users.createdAt)).all();
	const allInvites = await locals.db.select().from(invites).orderBy(desc(invites.createdAt)).all();

	return { members: allUsers, invites: allInvites };
};

export const actions: Actions = {
	addMember: async ({ request, locals }) => {
		requirePermission(locals, 'members:edit');

		const data = await request.formData();
		const email = data.get('email')?.toString()?.trim()?.toLowerCase();
		const displayName = data.get('displayName')?.toString()?.trim();
		const roleValue = data.get('role')?.toString();

		if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
			return fail(400, { error: 'Please enter a valid email address.' });
		}

		const role = isUserRole(roleValue) ? roleValue : 'member';

		const { isNew } = await findOrCreateUser(locals.db, email, { role, name: displayName });

		if (!isNew) {
			return fail(400, { error: 'A member with this email already exists.' });
		}

		return { memberAdded: true, addedEmail: email };
	},

	createInvite: async ({ request, locals, platform, url }) => {
		requirePermission(locals, 'members:edit');

		if (!locals.user) {
			return fail(401, { error: 'Missing current user.' });
		}

		const data = await request.formData();
		const rawEmail = data.get('email');
		const emailValue = rawEmail?.toString()?.trim();
		const email = emailValue ? normalizeEmail(rawEmail) : null;
		const expiresInDaysValue = Number(data.get('expiresInDays')?.toString() ?? '30');
		const expiresInDays =
			Number.isFinite(expiresInDaysValue) && expiresInDaysValue > 0
				? Math.min(Math.floor(expiresInDaysValue), 365)
				: 30;

		if (emailValue && !email) {
			return fail(400, { error: 'Please enter a valid email address.' });
		}

		if (email) {
			const existing = await locals.db
				.select({ id: users.id })
				.from(users)
				.where(eq(users.email, email))
				.get();
			if (existing) {
				return fail(400, { error: 'A member with this email already exists.' });
			}
		}

		const code = nanoid(32);
		const id = nanoid();
		const codeHash = await hashToken(code);
		const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString();

		await locals.db.insert(invites).values({
			id,
			email,
			codeHash,
			createdByUserId: locals.user.id,
			expiresAt
		});

		const inviteUrl = `${url.origin}/auth/login?invite=${encodeURIComponent(code)}`;
		let emailSent = false;
		if (email && platform) {
			const sent = await sendInviteEmail(platform, email, inviteUrl);
			emailSent = sent.success;
		}

		return { inviteCreated: true, inviteUrl, invitedEmail: email, emailSent };
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
	},

	updateStatus: async ({ request, locals }) => {
		requirePermission(locals, 'members:edit');

		const data = await request.formData();
		const userId = data.get('userId')?.toString();
		const statusValue = data.get('status')?.toString();

		if (!userId) {
			return fail(400, { error: 'Missing user id.' });
		}

		if (!isUserStatus(statusValue)) {
			return fail(400, { error: 'Invalid status.' });
		}

		if (locals.user?.id === userId && statusValue !== 'active') {
			return fail(400, { error: "You can't suspend your own account.", status: 'active' });
		}

		await locals.db.update(users).set({ status: statusValue }).where(eq(users.id, userId));

		return { statusUpdated: true, updatedUserId: userId, updatedStatus: statusValue };
	},

	approveSignup: async ({ request, locals }) => {
		requirePermission(locals, 'members:edit');

		if (!locals.user) {
			return fail(401, { error: 'Missing current user.' });
		}

		const data = await request.formData();
		const userId = data.get('userId')?.toString();
		if (!userId) {
			return fail(400, { error: 'Missing user id.' });
		}

		await locals.db.update(users).set({ status: 'active' }).where(eq(users.id, userId));
		await locals.db.insert(moderationEvents).values({
			id: nanoid(),
			actorUserId: locals.user.id,
			targetType: 'user',
			targetId: userId,
			action: 'approve_signup'
		});

		return { signupApproved: true, updatedUserId: userId };
	},

	rejectSignup: async ({ request, locals }) => {
		requirePermission(locals, 'members:edit');

		if (!locals.user) {
			return fail(401, { error: 'Missing current user.' });
		}

		const data = await request.formData();
		const userId = data.get('userId')?.toString();
		if (!userId) {
			return fail(400, { error: 'Missing user id.' });
		}

		await locals.db.update(users).set({ status: 'suspended' }).where(eq(users.id, userId));
		await locals.db.insert(moderationEvents).values({
			id: nanoid(),
			actorUserId: locals.user.id,
			targetType: 'user',
			targetId: userId,
			action: 'reject_signup'
		});

		return { signupRejected: true, updatedUserId: userId };
	}
};
