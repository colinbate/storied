import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { sessions } from '$lib/server/db/schema';
import { desc, eq } from 'drizzle-orm';
import { newId } from '$lib/server/ids';
import { slugify } from '$lib/server/slugify';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _desc: any = desc;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _eq: any = eq;

export const load: PageServerLoad = async ({ locals }) => {
	const allSessions = await locals.db
		.select()
		.from(sessions)
		.orderBy(_desc(sessions.createdAt))
		.all();

	return { sessions: allSessions };
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		if (locals.user?.role !== 'admin') return fail(403, { error: 'Forbidden' });

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
		if (locals.user?.role !== 'admin') return fail(403, { error: 'Forbidden' });

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
			.where(_eq(sessions.id, id));

		return { updated: true };
	}
};
