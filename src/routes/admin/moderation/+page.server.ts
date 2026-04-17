import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { threads, users, moderationEvents, sessions } from '$lib/server/db/schema';
import { eq, desc, asc } from 'drizzle-orm';
import { newId } from '$lib/server/ids';
import { requirePermission } from '$lib/server/auth';

export const load: PageServerLoad = async ({ locals }) => {
	requirePermission(locals, 'moderate');
	const allThreads = await locals.db
		.select({
			thread: threads,
			author: {
				id: users.id,
				displayName: users.displayName
			}
		})
		.from(threads)
		.innerJoin(users, eq(threads.authorUserId, users.id))
		.orderBy(desc(threads.createdAt))
		.all();

	const allSessions = await locals.db.select().from(sessions).orderBy(asc(sessions.title)).all();

	return { threads: allThreads, sessions: allSessions };
};

export const actions: Actions = {
	toggleLock: async ({ request, locals }) => {
		requirePermission(locals, 'moderate');

		const data = await request.formData();
		const threadId = data.get('threadId')?.toString();
		if (!threadId) return fail(400, { error: 'Missing thread ID' });

		const thread = await locals.db.select().from(threads).where(eq(threads.id, threadId)).get();
		if (!thread) return fail(404, { error: 'Thread not found' });

		const newLocked = thread.isLocked ? 0 : 1;
		await locals.db
			.update(threads)
			.set({ isLocked: newLocked, updatedAt: new Date().toISOString() })
			.where(eq(threads.id, threadId));

		await locals.db.insert(moderationEvents).values({
			id: newId(),
			actorUserId: locals.user!.id,
			targetType: 'thread',
			targetId: threadId,
			action: newLocked ? 'lock' : 'unlock'
		});

		return { success: true };
	},

	togglePin: async ({ request, locals }) => {
		requirePermission(locals, 'moderate');

		const data = await request.formData();
		const threadId = data.get('threadId')?.toString();
		if (!threadId) return fail(400, { error: 'Missing thread ID' });

		const thread = await locals.db.select().from(threads).where(eq(threads.id, threadId)).get();
		if (!thread) return fail(404, { error: 'Thread not found' });

		const newPinned = thread.isPinned ? 0 : 1;
		await locals.db
			.update(threads)
			.set({ isPinned: newPinned, updatedAt: new Date().toISOString() })
			.where(eq(threads.id, threadId));

		await locals.db.insert(moderationEvents).values({
			id: newId(),
			actorUserId: locals.user!.id,
			targetType: 'thread',
			targetId: threadId,
			action: newPinned ? 'pin' : 'unpin'
		});

		return { success: true };
	},

	softDelete: async ({ request, locals }) => {
		requirePermission(locals, 'moderate');

		const data = await request.formData();
		const threadId = data.get('threadId')?.toString();
		if (!threadId) return fail(400, { error: 'Missing thread ID' });

		const now = new Date().toISOString();
		await locals.db
			.update(threads)
			.set({ deletedAt: now, updatedAt: now })
			.where(eq(threads.id, threadId));

		await locals.db.insert(moderationEvents).values({
			id: newId(),
			actorUserId: locals.user!.id,
			targetType: 'thread',
			targetId: threadId,
			action: 'soft_delete'
		});

		return { success: true };
	},

	linkSession: async ({ request, locals }) => {
		requirePermission(locals, 'moderate');

		const data = await request.formData();
		const threadId = data.get('threadId')?.toString();
		const sessionId = data.get('sessionId')?.toString() || null;
		if (!threadId) return fail(400, { error: 'Missing thread ID' });

		await locals.db
			.update(threads)
			.set({ sessionId: sessionId || null, updatedAt: new Date().toISOString() })
			.where(eq(threads.id, threadId));

		await locals.db.insert(moderationEvents).values({
			id: newId(),
			actorUserId: locals.user!.id,
			targetType: 'thread',
			targetId: threadId,
			action: sessionId ? 'link_session' : 'unlink_session',
			reason: sessionId ?? undefined
		});

		return { success: true };
	},

	restore: async ({ request, locals }) => {
		requirePermission(locals, 'moderate');

		const data = await request.formData();
		const threadId = data.get('threadId')?.toString();
		if (!threadId) return fail(400, { error: 'Missing thread ID' });

		await locals.db
			.update(threads)
			.set({ deletedAt: null, updatedAt: new Date().toISOString() })
			.where(eq(threads.id, threadId));

		await locals.db.insert(moderationEvents).values({
			id: newId(),
			actorUserId: locals.user!.id,
			targetType: 'thread',
			targetId: threadId,
			action: 'restore'
		});

		return { success: true };
	}
};
