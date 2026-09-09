import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { sessions, themes } from '$lib/server/db/schema';
import { and, asc, desc, eq, ne } from 'drizzle-orm';
import { canAcceptSessionRsvps } from '$lib/server/rsvp';

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
			date: sessions.startsAt,
			start: sessions.startsAt,
			timezone: sessions.timezone,
			status: sessions.status,
			theme: sessions.theme,
			themeTitle: sessions.themeTitle,
			themeSummary: sessions.themeSummary,
			body: sessions.bodySource,
			themeName: themes.name,
			themeSlug: themes.slug,
			themeDescription: themes.description,
			themeGuideSource: themes.guideSource,
			themeGuideHtml: themes.guideHtml,
			durationMinutes: sessions.durationMinutes,
			locationName: sessions.locationName,
			isPublic: sessions.isPublic,
			rsvpSlug: sessions.rsvpSlug,
			rsvpEnabled: sessions.rsvpEnabled,
			astroPath: sessions.astroPath,
			externalUrl: sessions.externalUrl,
			publicRecap: sessions.publicRecap,
			publicRecapHtml: sessions.publicRecapHtml,
			createdAt: sessions.createdAt,
			updatedAt: sessions.updatedAt
		})
		.from(sessions)
		.leftJoin(themes, eq(sessions.themeId, themes.id))
		.where(and(eq(sessions.isPublic, true), ne(sessions.status, 'draft')))
		.orderBy(asc(sessions.startsAt), desc(sessions.createdAt))
		.all();

	return json(
		rows.map((r) => {
			const {
				rsvpSlug,
				rsvpEnabled,
				publicRecap,
				publicRecapHtml,
				themeName,
				themeDescription,
				themeGuideSource,
				themeGuideHtml,
				body: sessionNotes,
				...session
			} = r;
			const acceptsRsvps = canAcceptSessionRsvps({
				status: r.status,
				rsvpEnabled,
				startsAt: r.start,
				timezone: r.timezone
			});

			return {
				...session,
				theme: themeName ?? session.theme,
				themeTitle: themeName ?? session.themeTitle ?? session.theme,
				themeSummary: themeDescription ?? session.themeSummary,
				body: themeGuideSource ?? sessionNotes,
				themeGuide: themeGuideSource ?? undefined,
				themeGuideHtml: themeGuideHtml ?? undefined,
				...(themeGuideSource && sessionNotes ? { sessionNotes } : {}),
				date: r.date?.split('T')[0],
				start: r.start?.split('T')[1],
				...(acceptsRsvps ? { rsvpSlug: rsvpSlug ?? r.slug } : {}),
				// Only the sanitized public recap leaves the member site; it is omitted until written.
				...(publicRecap && r.status !== 'cancelled'
					? { publicRecap, publicRecapHtml: publicRecapHtml ?? undefined }
					: {})
			};
		}),
		{ headers: publicApiHeaders }
	);
};
