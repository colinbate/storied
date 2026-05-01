import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { authors, subjectSources } from '$lib/server/db/schema';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { requirePermission } from '$lib/server/auth';
import { newId } from '$lib/server/ids';
import { slugify } from '$lib/server/slugify';
import { detectFirstSubjectLinkOfKind, ensureSubjectSource } from '$lib/server/subject-sources';
import { publishWorkerMessage } from '$lib/server/worker-queue';
import type { SubjectSourceType } from '$shared/worker-messages';

export const load: PageServerLoad = async ({ locals }) => {
	requirePermission(locals, 'author:edit');

	const [allAuthors, unresolvedSources] = await Promise.all([
		locals.db.select().from(authors).orderBy(desc(authors.createdAt)).all(),
		locals.db
			.select()
			.from(subjectSources)
			.where(
				and(isNull(subjectSources.subjectId), eq(subjectSources.sourceType, 'goodreads-author'))
			)
			.orderBy(desc(subjectSources.createdAt))
			.all()
	]);

	return { authors: allAuthors, unresolvedSources };
};

export const actions: Actions = {
	retrySource: async ({ request, locals, platform }) => {
		requirePermission(locals, 'author:edit');

		const sourceId = (await request.formData()).get('sourceId')?.toString();
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
		requirePermission(locals, 'author:edit');

		const sourceId = (await request.formData()).get('sourceId')?.toString();
		if (!sourceId) return fail(400, { error: 'Missing source ID' });

		await locals.db
			.update(subjectSources)
			.set({ fetchStatus: 'ignored', updatedAt: new Date().toISOString() })
			.where(eq(subjectSources.id, sourceId));

		return { ignored: true };
	},

	createManual: async ({ request, locals }) => {
		requirePermission(locals, 'author:edit');

		const data = await request.formData();
		const name = data.get('name')?.toString()?.trim();
		if (!name || name.length < 2) {
			return fail(400, { error: 'Name must be at least 2 characters.' });
		}

		const slug = data.get('slug')?.toString()?.trim() || slugify(name);
		const existing = await locals.db
			.select({ id: authors.id })
			.from(authors)
			.where(eq(authors.slug, slug))
			.get();
		if (existing) {
			return fail(400, { error: `An author with slug "${slug}" already exists.` });
		}

		await locals.db.insert(authors).values({
			id: newId(),
			slug,
			name,
			bio: data.get('bio')?.toString()?.trim() || null,
			photoUrl: data.get('photoUrl')?.toString()?.trim() || null,
			goodreadsUrl: data.get('goodreadsUrl')?.toString()?.trim() || null,
			openLibraryId: data.get('openLibraryId')?.toString()?.trim() || null,
			websiteUrl: data.get('websiteUrl')?.toString()?.trim() || null
		});

		throw redirect(303, `/admin/authors/${slug}`);
	},

	createFromUrl: async ({ request, locals, platform }) => {
		requirePermission(locals, 'author:edit');

		const url = (await request.formData()).get('url')?.toString()?.trim() || '';
		if (!url) return fail(400, { error: 'Please provide a Goodreads author URL.' });

		const link = detectFirstSubjectLinkOfKind(url, 'author');
		if (!link) return fail(400, { error: 'Only Goodreads author URLs are supported right now.' });

		await ensureSubjectSource(locals.db, link, platform?.env);
		return { queued: true };
	}
};
