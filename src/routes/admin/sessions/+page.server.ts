import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { sessions } from '$lib/server/db/schema';
import { desc, eq } from 'drizzle-orm';
import { newId } from '$lib/server/ids';
import { slugify } from '$lib/server/slugify';
import { requirePermission } from '$lib/server/auth';

export const load: PageServerLoad = async ({ locals }) => {
	requirePermission(locals, 'sessions:edit');
	const allSessions = await locals.db
		.select()
		.from(sessions)
		.orderBy(desc(sessions.createdAt))
		.all();

	return { sessions: allSessions };
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		requirePermission(locals, 'sessions:edit');

		const data = await request.formData();
		const title = data.get('title')?.toString()?.trim();
		const theme = data.get('theme')?.toString()?.trim() || null;
		const startsAt = data.get('startsAt')?.toString()?.trim() || null;
		const astroPath = data.get('astroPath')?.toString()?.trim() || null;
		const externalUrl = data.get('externalUrl')?.toString()?.trim() || null;

		if (!title || title.length < 2) {
			return fail(400, { error: 'Title must be at least 2 characters.' });
		}

		const slug = slugify(title);
		await locals.db.insert(sessions).values({
			id: newId(),
			slug,
			title,
			theme,
			startsAt,
			astroPath,
			externalUrl
		});

		return { created: true };
	},

	update: async ({ request, locals }) => {
		requirePermission(locals, 'sessions:edit');

		const data = await request.formData();
		const id = data.get('id')?.toString();
		const title = data.get('title')?.toString()?.trim();
		const theme = data.get('theme')?.toString()?.trim() || null;
		const startsAt = data.get('startsAt')?.toString()?.trim() || null;
		const astroPath = data.get('astroPath')?.toString()?.trim() || null;
		const externalUrl = data.get('externalUrl')?.toString()?.trim() || null;

		if (!id || !title) return fail(400, { error: 'Missing required fields.' });

		await locals.db
			.update(sessions)
			.set({ title, theme, startsAt, astroPath, externalUrl, updatedAt: new Date().toISOString() })
			.where(eq(sessions.id, id));

		return { updated: true };
	}
};
