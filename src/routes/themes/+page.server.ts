import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { sessions, themes } from '$lib/server/db/schema';
import { createTheme } from '$lib/server/themes';
import { asc, desc, ne } from 'drizzle-orm';

function getOptionalString(data: FormData, key: string) {
	return data.get(key)?.toString()?.trim() || null;
}

export const load: PageServerLoad = async ({ locals }) => {
	const [themeRows, sessionRows] = await Promise.all([
		locals.db
			.select()
			.from(themes)
			.where(ne(themes.status, 'archived'))
			.orderBy(asc(themes.name))
			.all(),
		locals.db
			.select({
				id: sessions.id,
				slug: sessions.slug,
				title: sessions.title,
				status: sessions.status,
				startsAt: sessions.startsAt,
				themeId: sessions.themeId
			})
			.from(sessions)
			.orderBy(desc(sessions.startsAt), desc(sessions.createdAt))
			.all()
	]);

	return { themes: themeRows, sessions: sessionRows };
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const data = await request.formData();
		const name = getOptionalString(data, 'name');

		if (!name || name.length < 2) {
			return fail(400, { error: 'Theme name must be at least 2 characters.' });
		}

		await createTheme(locals.db, {
			name,
			description: getOptionalString(data, 'description'),
			exampleText: getOptionalString(data, 'exampleText'),
			status: 'idea',
			submittedByUserId: locals.user?.id ?? null
		});

		return { created: true };
	}
};
