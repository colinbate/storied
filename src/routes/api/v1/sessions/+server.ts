import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { sessions } from '$lib/server/db/schema';
import { asc, desc, eq } from 'drizzle-orm';

const publicApiHeaders = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'GET, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type',
	'Cache-Control': 'public, max-age=300'
};

export const OPTIONS: RequestHandler = async () => {
	return new Response(null, { headers: publicApiHeaders });
};

export const GET: RequestHandler = async ({ locals }) => {
	const rows = await locals.db
		.select({
			id: sessions.id,
			slug: sessions.slug,
			title: sessions.title,
			startsAt: sessions.startsAt,
			status: sessions.status,
			theme: sessions.theme,
			themeTitle: sessions.themeTitle,
			themeSummary: sessions.themeSummary,
			bodyHtml: sessions.bodyHtml,
			durationMinutes: sessions.durationMinutes,
			locationName: sessions.locationName,
			isPublic: sessions.isPublic,
			astroPath: sessions.astroPath,
			externalUrl: sessions.externalUrl,
			createdAt: sessions.createdAt,
			updatedAt: sessions.updatedAt
		})
		.from(sessions)
		.where(eq(sessions.isPublic, true))
		.orderBy(asc(sessions.startsAt), desc(sessions.createdAt))
		.all();

	return json(rows, { headers: publicApiHeaders });
};
