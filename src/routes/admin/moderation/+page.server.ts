import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { threads, users, moderationEvents, sessions } from '$lib/server/db/schema';
import { eq, desc, asc } from 'drizzle-orm';
import { newId } from '$lib/server/ids';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _eq: any = eq;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _desc: any = desc;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _asc: any = asc;

export const load: PageServerLoad = async ({ locals }) => {
	const allThreads = await locals.db
		.select({
			thread: threads,
			author: {
				id: users.id,
				displayName: users.displayName
			}
		})
		.from(threads)
		.innerJoin(users, _eq(threads.authorUserId, users.id))
		.orderBy(_desc(threads.createdAt))
		.all();

	const allSessions = await locals.db.select().from(sessions).orderBy(_asc(sessions.title)).all();

	return { threads: allThreads, sessions: allSessions };
};

export const actions: Actions = {
	toggleLock: async ({ request, locals }) => {
		if (!locals.user || (locals.user.role !== 'admin' && locals.user.role !== 'moderator')) {
			return fail(403, { error: 'Forbidden' });
		}

		const data = await request.formData();
		const threadId = data.get('threadId')?.toString();
		if (!threadId) return fail(400, { error: 'Missing thread ID' });

		const thread = await locals.db.select().from(threads).where(_eq(threads.id, threadId)).get();
		if (!thread) return fail(404, { error: 'Thread not found' });

		const newLocked = thread.isLocked ? 0 : 1;
		await locals.db
			.update(threads)
			.set({ isLocked: newLocked, updatedAt: new Date().toISOString() })
			.where(_eq(threads.id, threadId));

		await locals.db.insert(moderationEvents).values({
			id: newId(),
			actorUserId: locals.user.id,
			targetType: 'thread',
			targetId: threadId,
			action: newLocked ? 'lock' : 'unlock'
		});

		return { success: true };
	},

	togglePin: async ({ request, locals }) => {
		if (!locals.user || (locals.user.role !== 'admin' && locals.user.role !== 'moderator')) {
			return fail(403, { error: 'Forbidden' });
		}

		const data = await request.formData();
		const threadId = data.get('threadId')?.toString();
		if (!threadId) return fail(400, { error: 'Missing thread ID' });

		const thread = await locals.db.select().from(threads).where(_eq(threads.id, threadId)).get();
		if (!thread) return fail(404, { error: 'Thread not found' });

		const newPinned = thread.isPinned ? 0 : 1;
		await locals.db
			.update(threads)
			.set({ isPinned: newPinned, updatedAt: new Date().toISOString() })
			.where(_eq(threads.id, threadId));

		await locals.db.insert(moderationEvents).values({
			id: newId(),
			actorUserId: locals.user.id,
			targetType: 'thread',
			targetId: threadId,
			action: newPinned ? 'pin' : 'unpin'
		});

		return { success: true };
	},

	softDelete: async ({ request, locals }) => {
		if (!locals.user || (locals.user.role !== 'admin' && locals.user.role !== 'moderator')) {
			return fail(403, { error: 'Forbidden' });
		}

		const data = await request.formData();
		const threadId = data.get('threadId')?.toString();
		if (!threadId) return fail(400, { error: 'Missing thread ID' });

		const now = new Date().toISOString();
		await locals.db
			.update(threads)
			.set({ deletedAt: now, updatedAt: now })
			.where(_eq(threads.id, threadId));

		await locals.db.insert(moderationEvents).values({
			id: newId(),
			actorUserId: locals.user.id,
			targetType: 'thread',
			targetId: threadId,
			action: 'soft_delete'
		});

		return { success: true };
	},

	linkSession: async ({ request, locals }) => {
		if (!locals.user || (locals.user.role !== 'admin' && locals.user.role !== 'moderator')) {
			return fail(403, { error: 'Forbidden' });
		}

		const data = await request.formData();
		const threadId = data.get('threadId')?.toString();
		const sessionId = data.get('sessionId')?.toString() || null;
		if (!threadId) return fail(400, { error: 'Missing thread ID' });

		await locals.db
			.update(threads)
			.set({ sessionId: sessionId || null, updatedAt: new Date().toISOString() })
			.where(_eq(threads.id, threadId));

		await locals.db.insert(moderationEvents).values({
			id: newId(),
			actorUserId: locals.user.id,
			targetType: 'thread',
			targetId: threadId,
			action: sessionId ? 'link_session' : 'unlink_session',
			reason: sessionId ?? undefined
		});

		return { success: true };
	},

	restore: async ({ request, locals }) => {
		if (!locals.user || locals.user.role !== 'admin') {
			return fail(403, { error: 'Forbidden' });
		}

		const data = await request.formData();
		const threadId = data.get('threadId')?.toString();
		if (!threadId) return fail(400, { error: 'Missing thread ID' });

		await locals.db
			.update(threads)
			.set({ deletedAt: null, updatedAt: new Date().toISOString() })
			.where(_eq(threads.id, threadId));

		await locals.db.insert(moderationEvents).values({
			id: newId(),
			actorUserId: locals.user.id,
			targetType: 'thread',
			targetId: threadId,
			action: 'restore'
		});

		return { success: true };
	}
};
