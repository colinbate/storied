import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { sessions, themes, users } from '$lib/server/db/schema';
import { asc, desc, eq } from 'drizzle-orm';
import { requirePermission } from '$lib/server/auth';
import { createTheme, getThemeStatus } from '$lib/server/themes';

function getOptionalString(data: FormData, key: string) {
	return data.get(key)?.toString()?.trim() || null;
}

export const load: PageServerLoad = async ({ locals }) => {
	requirePermission(locals, 'sessions:edit');

	const [themeRows, sessionRows] = await Promise.all([
		locals.db
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
			.orderBy(asc(themes.status), asc(themes.name))
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
		requirePermission(locals, 'sessions:edit');

		const data = await request.formData();
		const name = getOptionalString(data, 'name');

		if (!name || name.length < 2) {
			return fail(400, { error: 'Theme name must be at least 2 characters.' });
		}

		await createTheme(locals.db, {
			name,
			description: getOptionalString(data, 'description'),
			exampleText: getOptionalString(data, 'exampleText'),
			status: getThemeStatus(data.get('status')),
			submittedByUserId: locals.user?.id ?? null
		});

		return { created: true };
	},

	update: async ({ request, locals }) => {
		requirePermission(locals, 'sessions:edit');

		const data = await request.formData();
		const id = getOptionalString(data, 'id');
		const name = getOptionalString(data, 'name');
		const status = getThemeStatus(data.get('status'));

		if (!id) return fail(400, { error: 'Missing theme id.' });
		if (!name || name.length < 2) {
			return fail(400, { error: 'Theme name must be at least 2 characters.' });
		}

		const theme = await locals.db.select().from(themes).where(eq(themes.id, id)).get();
		if (!theme) return fail(404, { error: 'Theme not found.' });

		const now = new Date().toISOString();
		await locals.db
			.update(themes)
			.set({
				name,
				description: getOptionalString(data, 'description'),
				exampleText: getOptionalString(data, 'exampleText'),
				status,
				selectedAt: status === 'selected' ? (theme.selectedAt ?? now) : theme.selectedAt,
				archivedAt: status === 'archived' ? (theme.archivedAt ?? now) : null,
				updatedAt: now
			})
			.where(eq(themes.id, id));

		return { updated: true };
	},

	setStatus: async ({ request, locals }) => {
		requirePermission(locals, 'sessions:edit');

		const data = await request.formData();
		const id = getOptionalString(data, 'id');
		const status = getThemeStatus(data.get('status'));

		if (!id) return fail(400, { error: 'Missing theme id.' });

		const theme = await locals.db.select().from(themes).where(eq(themes.id, id)).get();
		if (!theme) return fail(404, { error: 'Theme not found.' });

		const now = new Date().toISOString();
		await locals.db
			.update(themes)
			.set({
				status,
				selectedAt: status === 'selected' ? (theme.selectedAt ?? now) : theme.selectedAt,
				archivedAt: status === 'archived' ? (theme.archivedAt ?? now) : null,
				updatedAt: now
			})
			.where(eq(themes.id, id));

		return { statusUpdated: true };
	}
};
