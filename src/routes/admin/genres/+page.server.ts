import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { genres } from '$lib/server/db/schema';
import { asc, eq } from 'drizzle-orm';
import { requirePermission } from '$lib/server/auth';

function slugify(text: string): string {
	return text
		.toLowerCase()
		.trim()
		.replace(/\([^)]*\)/g, '')
		.replace(/[^\w\s-]/g, '')
		.replace(/[\s_]+/g, '-')
		.replace(/-+/g, '-')
		.replace(/^-|-$/g, '')
		.substring(0, 80);
}

export const load: PageServerLoad = async ({ locals }) => {
	requirePermission(locals, 'genre:edit');
	const all = await locals.db.select().from(genres).orderBy(asc(genres.name)).all();
	return { genres: all };
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		requirePermission(locals, 'genre:edit');

		const data = await request.formData();
		const name = data.get('name')?.toString()?.trim();
		const description = data.get('description')?.toString()?.trim() || null;
		const parentIdRaw = data.get('parentId')?.toString()?.trim();
		const isSpeculative = data.get('isSpeculative')?.toString() === '1' ? 1 : 0;

		if (!name || name.length < 2) {
			return fail(400, { error: 'Name must be at least 2 characters.' });
		}

		const parentId = parentIdRaw && parentIdRaw.length > 0 ? Number(parentIdRaw) : null;
		if (parentId !== null && Number.isNaN(parentId)) {
			return fail(400, { error: 'Invalid parent.' });
		}

		const baseSlug = slugify(name);
		if (!baseSlug) return fail(400, { error: 'Could not derive slug from name.' });

		// Ensure slug uniqueness by appending a numeric suffix if needed.
		let slug = baseSlug;
		let attempt = 0;
		while (true) {
			const existing = await locals.db
				.select({ id: genres.id })
				.from(genres)
				.where(eq(genres.slug, slug))
				.get();
			if (!existing) break;
			attempt += 1;
			slug = `${baseSlug}-${attempt + 1}`;
		}

		await locals.db.insert(genres).values({
			name,
			slug,
			parentId,
			description,
			isSpeculative
		});

		return { created: true };
	},

	update: async ({ request, locals }) => {
		requirePermission(locals, 'genre:edit');

		const data = await request.formData();
		const idRaw = data.get('id')?.toString();
		const name = data.get('name')?.toString()?.trim();
		const description = data.get('description')?.toString()?.trim() || null;
		const parentIdRaw = data.get('parentId')?.toString()?.trim();
		const isSpeculative = data.get('isSpeculative')?.toString() === '1' ? 1 : 0;

		if (!idRaw) return fail(400, { error: 'Missing genre id.' });
		const id = Number(idRaw);
		if (Number.isNaN(id)) return fail(400, { error: 'Invalid genre id.' });
		if (!name || name.length < 2) return fail(400, { error: 'Name must be at least 2 characters.' });

		const parentId = parentIdRaw && parentIdRaw.length > 0 ? Number(parentIdRaw) : null;
		if (parentId !== null && Number.isNaN(parentId)) return fail(400, { error: 'Invalid parent.' });
		if (parentId !== null && parentId === id)
			return fail(400, { error: 'A genre cannot be its own parent.' });

		await locals.db
			.update(genres)
			.set({
				name,
				description,
				parentId,
				isSpeculative,
				updatedAt: new Date().toISOString()
			})
			.where(eq(genres.id, id));

		return { updated: true };
	}
};
