import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';
import { books, sessionSubjects, sessions, themeBooks, themes, users } from '$lib/server/db/schema';
import { requirePermission } from '$lib/server/auth';
import { detectSubjectLinks } from '$lib/server/book-links';
import { renderMarkdown } from '$lib/server/markdown';
import { ensureSubjectSource } from '$lib/server/subject-sources';
import { getThemeStatus } from '$lib/server/themes';

function optionalString(data: FormData, key: string) {
	return data.get(key)?.toString().trim() || null;
}

async function findTheme(locals: App.Locals, slug: string) {
	return locals.db.select().from(themes).where(eq(themes.slug, slug)).get();
}

export const load: PageServerLoad = async ({ params, locals }) => {
	requirePermission(locals, 'sessions:edit');
	const themeEntry = await locals.db
		.select({
			theme: themes,
			submitter: {
				id: users.id,
				displayName: users.displayName,
				email: users.email
			}
		})
		.from(themes)
		.leftJoin(users, eq(themes.submittedByUserId, users.id))
		.where(eq(themes.slug, params.slug))
		.get();
	if (!themeEntry) throw error(404, 'Theme not found');

	const [bookRows, linkedBookRows, sessionRows] = await Promise.all([
		locals.db
			.select({
				id: books.id,
				slug: books.slug,
				title: books.title,
				authorText: books.authorText,
				coverUrl: books.coverUrl
			})
			.from(books)
			.where(isNull(books.deletedAt))
			.orderBy(asc(books.title))
			.all(),
		locals.db
			.select({
				link: themeBooks,
				book: {
					id: books.id,
					slug: books.slug,
					title: books.title,
					authorText: books.authorText,
					coverUrl: books.coverUrl
				}
			})
			.from(themeBooks)
			.innerJoin(books, eq(themeBooks.bookId, books.id))
			.where(and(eq(themeBooks.themeId, themeEntry.theme.id), isNull(books.deletedAt)))
			.orderBy(asc(books.title))
			.all(),
		locals.db
			.select()
			.from(sessions)
			.where(eq(sessions.themeId, themeEntry.theme.id))
			.orderBy(desc(sessions.startsAt), desc(sessions.createdAt))
			.all()
	]);

	return { ...themeEntry, books: bookRows, linkedBooks: linkedBookRows, sessions: sessionRows };
};

export const actions: Actions = {
	update: async ({ request, params, locals }) => {
		requirePermission(locals, 'sessions:edit');
		const theme = await findTheme(locals, params.slug);
		if (!theme) return fail(404, { error: 'Theme not found.' });

		const data = await request.formData();
		const name = optionalString(data, 'name');
		if (!name || name.length < 2) {
			return fail(400, { error: 'Theme name must be at least 2 characters.' });
		}
		const status = getThemeStatus(data.get('status'));
		const guideSource = optionalString(data, 'guideSource');
		const now = new Date().toISOString();
		await locals.db
			.update(themes)
			.set({
				name,
				description: optionalString(data, 'description'),
				exampleText: optionalString(data, 'exampleText'),
				guideSource,
				guideHtml: guideSource ? renderMarkdown(guideSource) : null,
				status,
				selectedAt: status === 'selected' ? (theme.selectedAt ?? now) : theme.selectedAt,
				archivedAt: status === 'archived' ? (theme.archivedAt ?? now) : null,
				updatedAt: now
			})
			.where(eq(themes.id, theme.id));

		return { updated: true };
	},

	addBook: async ({ request, params, locals, platform }) => {
		requirePermission(locals, 'sessions:edit');
		const theme = await findTheme(locals, params.slug);
		if (!theme) return fail(404, { error: 'Theme not found.' });

		const data = await request.formData();
		const bookId = optionalString(data, 'bookId');
		const url = optionalString(data, 'url');
		if (url) {
			const links = detectSubjectLinks(url);
			if (links.length !== 1 || links[0].subjectKind !== 'book') {
				return fail(400, { error: 'Use one Goodreads or Hardcover book URL.' });
			}
			const result = await ensureSubjectSource(locals.db, links[0], platform?.env, {
				themeBookLink: { themeId: theme.id, addedByUserId: locals.user?.id ?? null }
			});
			return result.resolvedSubjectId ? { themeBookAdded: true } : { themeBookQueued: true };
		}

		if (!bookId) return fail(400, { error: 'Choose a book or enter a book URL.' });
		const book = await locals.db
			.select({ id: books.id })
			.from(books)
			.where(and(eq(books.id, bookId), isNull(books.deletedAt)))
			.get();
		if (!book) return fail(404, { error: 'Book not found.' });

		await locals.db
			.insert(themeBooks)
			.values({ themeId: theme.id, bookId, addedByUserId: locals.user?.id ?? null })
			.onConflictDoNothing();
		return { themeBookAdded: true };
	},

	removeBook: async ({ request, params, locals }) => {
		requirePermission(locals, 'sessions:edit');
		const theme = await findTheme(locals, params.slug);
		if (!theme) return fail(404, { error: 'Theme not found.' });

		const data = await request.formData();
		const bookId = optionalString(data, 'bookId');
		if (!bookId) return fail(400, { error: 'Missing theme book link.' });
		await locals.db
			.delete(themeBooks)
			.where(and(eq(themeBooks.themeId, theme.id), eq(themeBooks.bookId, bookId)));
		return { themeBookRemoved: true };
	},

	backfillBooks: async ({ params, locals }) => {
		requirePermission(locals, 'sessions:edit');
		const theme = await findTheme(locals, params.slug);
		if (!theme) return fail(404, { error: 'Theme not found.' });

		const eligible = await locals.db
			.select({ bookId: sessionSubjects.subjectId })
			.from(sessionSubjects)
			.innerJoin(sessions, eq(sessionSubjects.sessionId, sessions.id))
			.innerJoin(books, eq(sessionSubjects.subjectId, books.id))
			.where(
				and(
					eq(sessions.themeId, theme.id),
					eq(sessionSubjects.subjectType, 'book'),
					inArray(sessionSubjects.status, ['starter', 'featured']),
					isNull(books.deletedAt)
				)
			)
			.groupBy(sessionSubjects.subjectId)
			.all();
		const existing = new Set(
			(
				await locals.db
					.select({ bookId: themeBooks.bookId })
					.from(themeBooks)
					.where(eq(themeBooks.themeId, theme.id))
					.all()
			).map((entry) => entry.bookId)
		);
		const additions = eligible.filter((entry) => !existing.has(entry.bookId));

		if (additions.length > 0) {
			await locals.db
				.insert(themeBooks)
				.values(
					additions.map((entry) => ({
						themeId: theme.id,
						bookId: entry.bookId,
						addedByUserId: locals.user?.id ?? null
					}))
				)
				.onConflictDoNothing();
		}

		return { themeBooksBackfilled: true, addedCount: additions.length };
	}
};
