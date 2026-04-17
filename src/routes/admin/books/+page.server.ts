import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { books, bookSources } from '$lib/server/db/schema';
import { eq, desc, isNull } from 'drizzle-orm';
import { requirePermission } from '$lib/server/auth';

export const load: PageServerLoad = async (event) => {
	requirePermission(event.locals, 'book:edit');
	const allBooks = await event.locals.db.select().from(books).orderBy(desc(books.createdAt)).all();

	// Unresolved/failed book sources
	const unresolvedSources = await event.locals.db
		.select()
		.from(bookSources)
		.where(isNull(bookSources.canonicalBookId))
		.orderBy(desc(bookSources.createdAt))
		.all();

	return { books: allBooks, unresolvedSources };
};

export const actions: Actions = {
	retrySource: async ({ request, locals }) => {
		requirePermission(locals, 'book:edit');

		const data = await request.formData();
		const sourceId = data.get('sourceId')?.toString();
		if (!sourceId) return fail(400, { error: 'Missing source ID' });

		await locals.db
			.update(bookSources)
			.set({ fetchStatus: 'pending', updatedAt: new Date().toISOString() })
			.where(eq(bookSources.id, sourceId));

		return { retried: true };
	},

	ignoreSource: async ({ request, locals }) => {
		requirePermission(locals, 'book:edit');

		const data = await request.formData();
		const sourceId = data.get('sourceId')?.toString();
		if (!sourceId) return fail(400, { error: 'Missing source ID' });

		await locals.db
			.update(bookSources)
			.set({ fetchStatus: 'ignored', updatedAt: new Date().toISOString() })
			.where(eq(bookSources.id, sourceId));

		return { ignored: true };
	}
};
