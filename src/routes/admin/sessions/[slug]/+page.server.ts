import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { books, series, sessions, sessionSubjects } from '$lib/server/db/schema';
import { eq, and, desc, asc } from 'drizzle-orm';
import { requirePermission } from '$lib/server/auth';
import { detectFirstSubjectLink, ensureSubjectSource } from '$lib/server/subject-sources';

type SubjectKind = 'book' | 'series';

export const load: PageServerLoad = async ({ params, locals }) => {
	requirePermission(locals, 'sessions:edit');

	const session = await locals.db
		.select()
		.from(sessions)
		.where(eq(sessions.slug, params.slug))
		.get();
	if (!session) throw error(404, 'Session not found');

	// Load all links for this session
	const rawLinks = await locals.db
		.select()
		.from(sessionSubjects)
		.where(eq(sessionSubjects.sessionId, session.id))
		.orderBy(desc(sessionSubjects.createdAt))
		.all();

	// Hydrate books
	const bookIds = rawLinks.filter((l) => l.subjectType === 'book').map((l) => l.subjectId);
	const seriesIds = rawLinks.filter((l) => l.subjectType === 'series').map((l) => l.subjectId);

	const bookRows = bookIds.length
		? await locals.db.select().from(books).all()
		: [];
	const seriesRows = seriesIds.length
		? await locals.db.select().from(series).all()
		: [];

	const bookMap = new Map(bookRows.filter((b) => bookIds.includes(b.id)).map((b) => [b.id, b]));
	const seriesMap = new Map(
		seriesRows.filter((s) => seriesIds.includes(s.id)).map((s) => [s.id, s])
	);

	const linkedSubjects = rawLinks
		.map((l) => {
			if (l.subjectType === 'book') {
				const b = bookMap.get(l.subjectId);
				return b ? { kind: 'book' as const, link: l, book: b } : null;
			}
			if (l.subjectType === 'series') {
				const s = seriesMap.get(l.subjectId);
				return s ? { kind: 'series' as const, link: l, series: s } : null;
			}
			return null;
		})
		.filter((x): x is NonNullable<typeof x> => x !== null);

	// For adding new links — all books/series not yet linked, excluding deleted.
	const allBooks = await locals.db
		.select({
			id: books.id,
			title: books.title,
			authorText: books.authorText,
			slug: books.slug,
			deletedAt: books.deletedAt
		})
		.from(books)
		.orderBy(asc(books.title))
		.all();
	const allSeries = await locals.db
		.select({
			id: series.id,
			title: series.title,
			authorText: series.authorText,
			slug: series.slug,
			deletedAt: series.deletedAt
		})
		.from(series)
		.orderBy(asc(series.title))
		.all();

	return {
		session,
		linkedSubjects,
		allBooks,
		allSeries
	};
};

export const actions: Actions = {
	updateSession: async ({ request, params, locals }) => {
		requirePermission(locals, 'sessions:edit');

		const row = await locals.db
			.select()
			.from(sessions)
			.where(eq(sessions.slug, params.slug))
			.get();
		if (!row) return fail(404, { error: 'Session not found' });

		const data = await request.formData();
		const title = data.get('title')?.toString()?.trim();
		if (!title || title.length < 2) return fail(400, { error: 'Title must be at least 2 characters.' });

		await locals.db
			.update(sessions)
			.set({
				title,
				theme: data.get('theme')?.toString()?.trim() || null,
				startsAt: data.get('startsAt')?.toString()?.trim() || null,
				astroPath: data.get('astroPath')?.toString()?.trim() || null,
				externalUrl: data.get('externalUrl')?.toString()?.trim() || null,
				updatedAt: new Date().toISOString()
			})
			.where(eq(sessions.id, row.id));

		return { updated: true };
	},

	addLink: async ({ request, params, locals }) => {
		requirePermission(locals, 'sessions:edit');
		const row = await locals.db
			.select()
			.from(sessions)
			.where(eq(sessions.slug, params.slug))
			.get();
		if (!row) return fail(404, { error: 'Session not found' });

		const data = await request.formData();
		const kind = data.get('kind')?.toString() as SubjectKind | undefined;
		const subjectId = data.get('subjectId')?.toString();
		if (!kind || (kind !== 'book' && kind !== 'series'))
			return fail(400, { error: 'Invalid subject kind.' });
		if (!subjectId) return fail(400, { error: 'Select a subject to link.' });

		const status = data.get('status')?.toString() || 'mentioned';
		const note = data.get('note')?.toString()?.trim() || null;

		await locals.db
			.insert(sessionSubjects)
			.values({
				sessionId: row.id,
				subjectType: kind,
				subjectId,
				status,
				note,
				addedByUserId: locals.user?.id ?? null
			})
			.onConflictDoNothing();

		return { linkAdded: true };
	},

	addLinkFromUrl: async ({ request, params, locals, platform }) => {
		requirePermission(locals, 'sessions:edit');
		const row = await locals.db
			.select()
			.from(sessions)
			.where(eq(sessions.slug, params.slug))
			.get();
		if (!row) return fail(404, { error: 'Session not found' });

		const data = await request.formData();
		const url = data.get('url')?.toString()?.trim() || '';
		const status = data.get('status')?.toString() || 'mentioned';
		const note = data.get('note')?.toString()?.trim() || null;

		const link = detectFirstSubjectLink(url);
		if (!link) return fail(400, { error: 'Only Goodreads book or series URLs are supported.' });

		const result = await ensureSubjectSource(locals.db, link, platform?.env, {
			sessionLink: {
				sessionId: row.id,
				status,
				note,
				addedByUserId: locals.user?.id ?? null
			}
		});

		if (result.resolvedSubjectId) {
			return { linkAddedFromResolved: true };
		}
		return { linkQueuedFromUrl: true };
	},

	updateLink: async ({ request, params, locals }) => {
		requirePermission(locals, 'sessions:edit');
		const row = await locals.db
			.select()
			.from(sessions)
			.where(eq(sessions.slug, params.slug))
			.get();
		if (!row) return fail(404, { error: 'Session not found' });

		const data = await request.formData();
		const kind = data.get('kind')?.toString() as SubjectKind | undefined;
		const subjectId = data.get('subjectId')?.toString();
		if (!kind || !subjectId) return fail(400, { error: 'Missing subject reference.' });

		const status = data.get('status')?.toString() || 'mentioned';
		const note = data.get('note')?.toString()?.trim() || null;

		await locals.db
			.update(sessionSubjects)
			.set({ status, note, updatedAt: new Date().toISOString() })
			.where(
				and(
					eq(sessionSubjects.sessionId, row.id),
					eq(sessionSubjects.subjectType, kind),
					eq(sessionSubjects.subjectId, subjectId)
				)
			);

		return { linkUpdated: true };
	},

	removeLink: async ({ request, params, locals }) => {
		requirePermission(locals, 'sessions:edit');
		const row = await locals.db
			.select()
			.from(sessions)
			.where(eq(sessions.slug, params.slug))
			.get();
		if (!row) return fail(404, { error: 'Session not found' });

		const data = await request.formData();
		const kind = data.get('kind')?.toString() as SubjectKind | undefined;
		const subjectId = data.get('subjectId')?.toString();
		if (!kind || !subjectId) return fail(400, { error: 'Missing subject reference.' });

		await locals.db
			.delete(sessionSubjects)
			.where(
				and(
					eq(sessionSubjects.sessionId, row.id),
					eq(sessionSubjects.subjectType, kind),
					eq(sessionSubjects.subjectId, subjectId)
				)
			);

		return { linkRemoved: true };
	}
};
