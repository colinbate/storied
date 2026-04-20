import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { series, subjectSources } from '$lib/server/db/schema';
import { eq, desc, isNull, and } from 'drizzle-orm';
import { requirePermission } from '$lib/server/auth';
import { newId } from '$lib/server/ids';
import { slugify } from '$lib/server/slugify';
import { detectFirstSubjectLinkOfKind, ensureSubjectSource } from '$lib/server/subject-sources';
import { publishWorkerMessage } from '$lib/server/worker-queue';
import type { SubjectSourceType } from '$shared/worker-messages';

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
		.where(and(isNull(subjectSources.subjectId), eq(subjectSources.sourceType, 'goodreads-series')))
		.orderBy(desc(subjectSources.createdAt))
		.all();

	return { series: allSeries, unresolvedSources };
};

export const actions: Actions = {
	retrySource: async ({ request, locals, platform }) => {
		requirePermission(locals, 'series:edit');

		const data = await request.formData();
		const sourceId = data.get('sourceId')?.toString();
		if (!sourceId) return fail(400, { error: 'Missing source ID' });

		const source = await locals.db
			.select()
			.from(subjectSources)
			.where(eq(subjectSources.id, sourceId))
			.get();
		if (!source) return fail(404, { error: 'Source not found' });

		await locals.db
			.update(subjectSources)
			.set({ fetchStatus: 'pending', updatedAt: new Date().toISOString() })
			.where(eq(subjectSources.id, sourceId));

		await publishWorkerMessage(platform?.env.WORKER_QUEUE, 'subject.resolve', {
			subjectSourceId: source.id,
			sourceType: source.sourceType as SubjectSourceType,
			sourceUrl: source.sourceUrl,
			sourceKey: source.sourceKey
		});

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
	},

	createManual: async ({ request, locals }) => {
		requirePermission(locals, 'series:edit');

		const data = await request.formData();
		const title = data.get('title')?.toString()?.trim();
		if (!title || title.length < 2) {
			return fail(400, { error: 'Title must be at least 2 characters.' });
		}

		const customSlug = data.get('slug')?.toString()?.trim() || '';
		const slug = customSlug || slugify(title);

		const existing = await locals.db
			.select({ id: series.id })
			.from(series)
			.where(eq(series.slug, slug))
			.get();
		if (existing) {
			return fail(400, { error: `A series with slug "${slug}" already exists.` });
		}

		const authorText = data.get('authorText')?.toString()?.trim() || null;
		const description = data.get('description')?.toString()?.trim() || null;
		const coverUrl = data.get('coverUrl')?.toString()?.trim() || null;
		const amazonAsin = data.get('amazonAsin')?.toString()?.trim() || null;
		const goodreadsUrl = data.get('goodreadsUrl')?.toString()?.trim() || null;
		const isComplete = data.get('isComplete')?.toString() === '1';
		const bookCountStr = data.get('bookCount')?.toString()?.trim() || '';
		const bookCount = bookCountStr ? Number(bookCountStr) : null;

		const id = newId();
		await locals.db.insert(series).values({
			id,
			slug,
			title,
			authorText,
			description,
			coverUrl,
			amazonAsin,
			goodreadsUrl,
			isComplete,
			bookCount: bookCount && Number.isFinite(bookCount) ? bookCount : null
		});

		throw redirect(303, `/admin/series/${slug}`);
	},

	createFromUrl: async ({ request, locals, platform }) => {
		requirePermission(locals, 'series:edit');

		const data = await request.formData();
		const url = data.get('url')?.toString()?.trim() || '';
		if (!url) return fail(400, { error: 'Please provide a Goodreads series URL.' });

		const link = detectFirstSubjectLinkOfKind(url, 'series');
		if (!link) return fail(400, { error: 'Only Goodreads series URLs are supported right now.' });

		await ensureSubjectSource(locals.db, link, platform?.env);

		return { queued: true };
	}
};
