import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { books, series, sessions, sessionSubjects } from '$lib/server/db/schema';
import { eq, and, desc, asc } from 'drizzle-orm';
import { requirePermission } from '$lib/server/auth';
import { detectFirstSubjectLink, ensureSubjectSource } from '$lib/server/subject-sources';
import { renderMarkdown } from '$lib/server/markdown';
import { slugify } from '$lib/server/slugify';

type SubjectKind = 'book' | 'series';
type SessionSubjectStatus = 'starter' | 'featured' | 'discussed' | 'mentioned_off_theme';

const sessionStatuses = new Set(['draft', 'current', 'past']);
const sessionSubjectStatuses = new Set(['starter', 'featured', 'discussed', 'mentioned_off_theme']);

function getOptionalString(data: FormData, key: string) {
	return data.get(key)?.toString()?.trim() || null;
}

function getSessionStatus(data: FormData) {
	const status = data.get('status')?.toString();
	return sessionStatuses.has(status ?? '') ? (status as 'draft' | 'current' | 'past') : 'draft';
}

function getSessionSubjectStatus(data: FormData): SessionSubjectStatus {
	const status = data.get('status')?.toString();
	return sessionSubjectStatuses.has(status ?? '') ? (status as SessionSubjectStatus) : 'starter';
}

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
		const slug = slugify(getOptionalString(data, 'slug') ?? '');
		if (!title || title.length < 2) return fail(400, { error: 'Title must be at least 2 characters.' });
		if (!slug) return fail(400, { error: 'Slug is required.' });

		const bodySource = getOptionalString(data, 'bodySource');
		const durationMinutes = Number.parseInt(data.get('durationMinutes')?.toString() ?? '', 10);
		const themeTitle = getOptionalString(data, 'themeTitle') ?? getOptionalString(data, 'theme');

		await locals.db
			.update(sessions)
			.set({
				title,
				slug,
				status: getSessionStatus(data),
				theme: themeTitle,
				themeTitle,
				themeSummary: getOptionalString(data, 'themeSummary'),
				bodySource,
				bodyHtml: bodySource ? renderMarkdown(bodySource) : null,
				startsAt: getOptionalString(data, 'startsAt'),
				durationMinutes: Number.isFinite(durationMinutes) ? durationMinutes : null,
				locationName: getOptionalString(data, 'locationName'),
				rsvpSlug: getOptionalString(data, 'rsvpSlug'),
				isPublic: data.get('isPublic') === 'on',
				astroPath: getOptionalString(data, 'astroPath'),
				externalUrl: getOptionalString(data, 'externalUrl'),
				updatedAt: new Date().toISOString()
			})
			.where(eq(sessions.id, row.id));

		if (slug !== row.slug) {
			throw redirect(303, `/admin/sessions/${slug}`);
		}

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

		const status = getSessionSubjectStatus(data);
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
		const status = getSessionSubjectStatus(data);
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

		const status = getSessionSubjectStatus(data);
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
