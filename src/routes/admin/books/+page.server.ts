import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { books, bookSources } from '$lib/server/db/schema';
import { eq, desc, isNull } from 'drizzle-orm';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _eq: any = eq;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _desc: any = desc;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _isNull: any = isNull;

export const load: PageServerLoad = async ({ locals }) => {
	const allBooks = await locals.db
		.select()
		.from(books)
		.orderBy(_desc(books.createdAt))
		.all();

	// Unresolved/failed book sources
	const unresolvedSources = await locals.db
		.select()
		.from(bookSources)
		.where(_isNull(bookSources.canonicalBookId))
		.orderBy(_desc(bookSources.createdAt))
		.all();

	return { books: allBooks, unresolvedSources };
};

export const actions: Actions = {
	retrySource: async ({ request, locals }) => {
		if (locals.user?.role !== 'admin') return fail(403, { error: 'Forbidden' });

		const data = await request.formData();
		const sourceId = data.get('sourceId')?.toString();
		if (!sourceId) return fail(400, { error: 'Missing source ID' });

		await locals.db
			.update(bookSources)
			.set({ fetchStatus: 'pending', updatedAt: new Date().toISOString() })
			.where(_eq(bookSources.id, sourceId));

		return { retried: true };
	},

	ignoreSource: async ({ request, locals }) => {
		if (locals.user?.role !== 'admin') return fail(403, { error: 'Forbidden' });

		const data = await request.formData();
		const sourceId = data.get('sourceId')?.toString();
		if (!sourceId) return fail(400, { error: 'Missing source ID' });

		await locals.db
			.update(bookSources)
			.set({ fetchStatus: 'ignored', updatedAt: new Date().toISOString() })
			.where(_eq(bookSources.id, sourceId));

		return { ignored: true };
	}
};
