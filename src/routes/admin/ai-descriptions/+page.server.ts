import { fail, error } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { books, series } from '$lib/server/db/schema';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { publishWorkerMessage } from '$lib/server/worker-queue';

const MIN_DESCRIPTION_LENGTH = 65;
const MAX_DESCRIPTION_LENGTH = 1200;

type AugmentationType = 'book' | 'series';

interface DescriptionUpdate {
	type: AugmentationType;
	id: string;
	description: string;
}

function canEditDescriptions(locals: App.Locals) {
	return locals.permissions.has('book:edit') || locals.permissions.has('series:edit');
}

function unwrapJsonPayload(raw: string) {
	const trimmed = raw.trim();
	const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
	const cleaned = fenced?.[1]?.trim() ?? trimmed;
	return cleaned.replaceAll('”', '"').replaceAll('“', '"');
}

function parseDescriptionUpdates(raw: string): DescriptionUpdate[] {
	const parsed: unknown = JSON.parse(unwrapJsonPayload(raw));
	const rows = Array.isArray(parsed)
		? parsed
		: parsed &&
			  typeof parsed === 'object' &&
			  Array.isArray((parsed as { descriptions?: unknown }).descriptions)
			? (parsed as { descriptions: unknown[] }).descriptions
			: null;

	if (!rows) throw new Error('Expected a JSON array.');

	return rows.map((row, index) => {
		if (!row || typeof row !== 'object') {
			throw new Error(`Entry ${index + 1} must be an object.`);
		}

		const candidate = row as Partial<Record<keyof DescriptionUpdate, unknown>>;
		const type = candidate.type;
		const id = candidate.id;
		const description = candidate.description;

		if (type !== 'book' && type !== 'series') {
			throw new Error(`Entry ${index + 1} needs type "book" or "series".`);
		}
		if (typeof id !== 'string' || !id.trim()) {
			throw new Error(`Entry ${index + 1} is missing an id.`);
		}
		if (typeof description !== 'string' || description.trim().length < MIN_DESCRIPTION_LENGTH) {
			throw new Error(
				`Entry ${index + 1} needs a description of at least ${MIN_DESCRIPTION_LENGTH} characters.`
			);
		}
		if (description.trim().length > MAX_DESCRIPTION_LENGTH) {
			throw new Error(`Entry ${index + 1} is longer than ${MAX_DESCRIPTION_LENGTH} characters.`);
		}

		return { type, id: id.trim(), description: description.trim() };
	});
}

export const load: PageServerLoad = async ({ locals }) => {
	if (!canEditDescriptions(locals)) error(403, 'Unauthorized');

	const shortDescription = sql`length(trim(coalesce(description, ''))) < ${MIN_DESCRIPTION_LENGTH}`;

	const [bookRows, seriesRows] = await Promise.all([
		locals.permissions.has('book:edit')
			? locals.db
					.select({
						id: books.id,
						title: books.title,
						authorText: books.authorText,
						slug: books.slug,
						description: books.description,
						goodreadsUrl: books.goodreadsUrl
					})
					.from(books)
					.where(and(isNull(books.deletedAt), shortDescription))
					.orderBy(asc(books.title))
					.all()
			: [],
		locals.permissions.has('series:edit')
			? locals.db
					.select({
						id: series.id,
						title: series.title,
						authorText: series.authorText,
						slug: series.slug,
						description: series.description,
						goodreadsUrl: series.goodreadsUrl
					})
					.from(series)
					.where(and(isNull(series.deletedAt), shortDescription))
					.orderBy(asc(series.title))
					.all()
			: []
	]);

	return {
		minDescriptionLength: MIN_DESCRIPTION_LENGTH,
		maxDescriptionLength: MAX_DESCRIPTION_LENGTH,
		books: bookRows,
		series: seriesRows
	};
};

export const actions: Actions = {
	saveDescriptions: async ({ request, locals, platform }) => {
		if (!canEditDescriptions(locals)) error(403, 'Unauthorized');

		const data = await request.formData();
		const raw = data.get('descriptions')?.toString() ?? '';
		if (!raw.trim()) return fail(400, { error: 'Paste the AI response before saving.' });

		let updates: DescriptionUpdate[];
		try {
			updates = parseDescriptionUpdates(raw);
		} catch (err) {
			return fail(400, {
				error: err instanceof Error ? err.message : 'Could not parse the pasted descriptions.'
			});
		}

		const now = new Date().toISOString();
		let saved = 0;
		const missing: string[] = [];

		for (const update of updates) {
			if (update.type === 'book') {
				if (!locals.permissions.has('book:edit')) {
					missing.push(`book:${update.id}`);
					continue;
				}

				const row = await locals.db
					.update(books)
					.set({ description: update.description, updatedAt: now })
					.where(eq(books.id, update.id))
					.returning({ id: books.id })
					.get();

				if (!row) {
					missing.push(`book:${update.id}`);
					continue;
				}

				saved += 1;
				await publishWorkerMessage(platform?.env.WORKER_QUEUE, 'search.subject.reindex', {
					subjectType: 'book',
					subjectId: row.id
				});
			} else {
				if (!locals.permissions.has('series:edit')) {
					missing.push(`series:${update.id}`);
					continue;
				}

				const row = await locals.db
					.update(series)
					.set({ description: update.description, updatedAt: now })
					.where(eq(series.id, update.id))
					.returning({ id: series.id })
					.get();

				if (!row) {
					missing.push(`series:${update.id}`);
					continue;
				}

				saved += 1;
				await publishWorkerMessage(platform?.env.WORKER_QUEUE, 'search.subject.reindex', {
					subjectType: 'series',
					subjectId: row.id
				});
			}
		}

		if (saved === 0) {
			return fail(400, { error: 'No matching editable books or series were found.' });
		}

		return { saved, missing };
	}
};
