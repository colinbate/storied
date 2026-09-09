import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import { books, sessions, themeBooks, themes } from '$lib/server/db/schema';
import { sessionAccessCondition } from '$lib/server/session-lifecycle';

export const load: PageServerLoad = async ({ params, locals }) => {
	const theme = await locals.db.select().from(themes).where(eq(themes.slug, params.slug)).get();
	if (!theme) throw error(404, 'Theme not found');

	const [bookRows, sessionRows] = await Promise.all([
		locals.db
			.select({
				id: books.id,
				slug: books.slug,
				title: books.title,
				authorText: books.authorText,
				coverUrl: books.coverUrl
			})
			.from(themeBooks)
			.innerJoin(books, eq(themeBooks.bookId, books.id))
			.where(and(eq(themeBooks.themeId, theme.id), isNull(books.deletedAt)))
			.orderBy(asc(books.title))
			.all(),
		locals.db
			.select()
			.from(sessions)
			.where(and(eq(sessions.themeId, theme.id), sessionAccessCondition(locals)))
			.orderBy(desc(sessions.startsAt), desc(sessions.createdAt))
			.all()
	]);

	return { theme, books: bookRows, sessions: sessionRows };
};
