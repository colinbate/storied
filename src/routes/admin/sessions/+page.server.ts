import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { sessions } from '$lib/server/db/schema';
import { desc } from 'drizzle-orm';
import { newId } from '$lib/server/ids';
import { slugify } from '$lib/server/slugify';
import { requirePermission } from '$lib/server/auth';
import { renderMarkdown } from '$lib/server/markdown';
import { subscribeActiveMembersToSessionThread } from '$lib/server/discussions';
import { createClubSession } from '$lib/server/session-lifecycle';
import { isSessionStatus, sessionPublicationError } from '$shared/session-lifecycle';
import {
	DEFAULT_TIMEZONE,
	getOrCreateNotificationPreferences,
	isValidTimezone
} from '$lib/server/notification-preferences';
import { createTheme, listThemes, resolveSessionTheme } from '$lib/server/themes';

function getOptionalString(data: FormData, key: string) {
	return data.get(key)?.toString()?.trim() || null;
}

export const load: PageServerLoad = async ({ locals }) => {
	requirePermission(locals, 'sessions:edit');
	const [allSessions, allThemes] = await Promise.all([
		locals.db.select().from(sessions).orderBy(desc(sessions.createdAt)).all(),
		listThemes(locals.db)
	]);

	return { sessions: allSessions, themes: allThemes };
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		requirePermission(locals, 'sessions:edit');

		const data = await request.formData();
		const title = data.get('title')?.toString()?.trim();
		const bodySource = getOptionalString(data, 'bodySource');
		const durationMinutes = Number.parseInt(data.get('durationMinutes')?.toString() ?? '', 10);

		if (!title || title.length < 2) {
			return fail(400, { error: 'Title must be at least 2 characters.' });
		}

		const slug = slugify(getOptionalString(data, 'slug') ?? title);
		const rsvpSlug = getOptionalString(data, 'rsvpSlug') ?? slug;
		const status = data.get('status')?.toString() ?? 'draft';
		if (!isSessionStatus(status)) return fail(400, { error: 'Choose a valid session status.' });
		if (!slug) return fail(400, { error: 'Enter a title or slug containing letters or numbers.' });
		const existing = await locals.db
			.select({ slug: sessions.slug, rsvpSlug: sessions.rsvpSlug })
			.from(sessions)
			.all();
		if (
			existing.some(
				(item) =>
					item.slug === slug ||
					item.rsvpSlug === rsvpSlug ||
					item.slug === rsvpSlug ||
					item.rsvpSlug === slug
			)
		)
			return fail(400, { error: 'That session or RSVP slug is already in use.' });
		const startsAt = getOptionalString(data, 'startsAt');
		const timezone = getOptionalString(data, 'timezone') ?? DEFAULT_TIMEZONE;
		if (!isValidTimezone(timezone)) {
			return fail(400, { error: 'Timezone must be a valid IANA timezone.' });
		}
		const sessionTheme = await resolveSessionTheme(locals.db, {
			themeId: getOptionalString(data, 'themeId')
		});
		if (getOptionalString(data, 'themeId') && !sessionTheme.themeId)
			return fail(400, { error: 'Choose an existing theme.' });
		const publicationError = sessionPublicationError({
			status,
			startsAt,
			timezone,
			themeId: sessionTheme.themeId
		});
		if (publicationError) return fail(400, { error: publicationError });
		const themeTitle = sessionTheme.themeName;
		const sessionId = newId();
		const newSession = {
			id: sessionId,
			slug,
			title,
			status,
			themeId: sessionTheme.themeId,
			theme: themeTitle,
			themeTitle,
			themeSummary: getOptionalString(data, 'themeSummary'),
			bodySource,
			bodyHtml: bodySource ? renderMarkdown(bodySource) : null,
			startsAt,
			timezone,
			durationMinutes: Number.isFinite(durationMinutes) ? durationMinutes : null,
			locationName: getOptionalString(data, 'locationName'),
			rsvpSlug,
			rsvpCapacity: Math.max(
				1,
				Number.parseInt(data.get('rsvpCapacity')?.toString() ?? '12', 10) || 12
			),
			rsvpEnabled: data.get('rsvpEnabled') === 'on',
			rsvpWaitlistEnabled: data.get('rsvpWaitlistEnabled') === 'on',
			isPublic: data.get('isPublic') === 'on',
			astroPath: getOptionalString(data, 'astroPath'),
			externalUrl: getOptionalString(data, 'externalUrl')
		};

		const prefs = await getOrCreateNotificationPreferences(locals.db, locals.user!.id);
		const { threadId } = await createClubSession(
			locals.db,
			newSession,
			locals.user!.id,
			prefs.autoSubscribeOwn ? prefs.defaultSubMode : null
		);
		if (status === 'current') await subscribeActiveMembersToSessionThread(locals.db, threadId);
		throw redirect(303, `/admin/sessions/${slug}`);
	},

	createTheme: async ({ request, locals }) => {
		requirePermission(locals, 'sessions:edit');

		const data = await request.formData();
		const name = getOptionalString(data, 'name');
		if (!name || name.length < 2) {
			return fail(400, { error: 'Theme name must be at least 2 characters.' });
		}

		const theme = await createTheme(locals.db, {
			name,
			status: 'idea',
			submittedByUserId: locals.user?.id ?? null
		});

		return { themeCreated: true, theme };
	}
};
