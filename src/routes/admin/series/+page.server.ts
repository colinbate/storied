import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { series, subjectSources } from '$lib/server/db/schema';
import { eq, desc, isNull, and } from 'drizzle-orm';
import { requirePermission } from '$lib/server/auth';

export const load: PageServerLoad = async (event) => {
	requirePermission(event.locals, 'series:edit');
	const allSeries = await event.locals.db
		.select()
		.from(series)
		.orderBy(desc(series.createdAt))
		.all();

	// Unresolved sources producing series
	const unresolvedSources = await event.locals.db
		.select()
		.from(subjectSources)
		.where(
			and(
				isNull(subjectSources.subjectId),
				eq(subjectSources.sourceType, 'goodreads-series')
			)
		)
		.orderBy(desc(subjectSources.createdAt))
		.all();

	return { series: allSeries, unresolvedSources };
};

export const actions: Actions = {
	retrySource: async ({ request, locals }) => {
		requirePermission(locals, 'series:edit');

		const data = await request.formData();
		const sourceId = data.get('sourceId')?.toString();
		if (!sourceId) return fail(400, { error: 'Missing source ID' });

		await locals.db
			.update(subjectSources)
			.set({ fetchStatus: 'pending', updatedAt: new Date().toISOString() })
			.where(eq(subjectSources.id, sourceId));

		return { retried: true };
	},

	ignoreSource: async ({ request, locals }) => {
		requirePermission(locals, 'series:edit');

		const data = await request.formData();
		const sourceId = data.get('sourceId')?.toString();
		if (!sourceId) return fail(400, { error: 'Missing source ID' });

		await locals.db
			.update(subjectSources)
			.set({ fetchStatus: 'ignored', updatedAt: new Date().toISOString() })
			.where(eq(subjectSources.id, sourceId));

		return { ignored: true };
	}
};
