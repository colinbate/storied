import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { sessions, subscriptions } from '$lib/server/db/schema';
import { desc } from 'drizzle-orm';
import { newId } from '$lib/server/ids';
import { slugify } from '$lib/server/slugify';
import { requirePermission } from '$lib/server/auth';
import { renderMarkdown } from '$lib/server/markdown';
import { createPrimarySessionThread } from '$lib/server/discussions';
import { getOrCreateNotificationPreferences } from '$lib/server/notification-preferences';
import { upsertRsvpEvent } from '$lib/server/rsvp';
import { createTheme, listThemes, resolveSessionTheme } from '$lib/server/themes';

const sessionStatuses = new Set(['draft', 'current', 'past']);

function getOptionalString(data: FormData, key: string) {
	return data.get(key)?.toString()?.trim() || null;
}

function getSessionStatus(data: FormData) {
	const status = data.get('status')?.toString();
	return sessionStatuses.has(status ?? '') ? (status as 'draft' | 'current' | 'past') : 'draft';
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
	create: async ({ request, locals, platform }) => {
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
		const status = getSessionStatus(data);
		const startsAt = getOptionalString(data, 'startsAt');
		if (!startsAt) {
			return fail(400, { error: 'Starts At is required to create an RSVP event.' });
		}
		const rsvpDb = platform?.env.RSVP_DB;
		if (!rsvpDb) {
			return fail(500, { error: 'RSVP database binding is not configured.' });
		}
		const sessionTheme = await resolveSessionTheme(locals.db, {
			themeId: getOptionalString(data, 'themeId')
		});
		if (!sessionTheme.themeId || !sessionTheme.themeName) {
			return fail(400, { error: 'Choose a theme from the library before creating the session.' });
		}
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
			durationMinutes: Number.isFinite(durationMinutes) ? durationMinutes : null,
			locationName: getOptionalString(data, 'locationName'),
			rsvpSlug,
			isPublic: data.get('isPublic') === 'on',
			astroPath: getOptionalString(data, 'astroPath'),
			externalUrl: getOptionalString(data, 'externalUrl')
		};

		const rsvpEvent = await upsertRsvpEvent({
			db: rsvpDb,
			session: newSession
		});
		if (!rsvpEvent) {
			return fail(400, { error: 'Starts At must be a valid date for the RSVP event.' });
		}

		await locals.db.insert(sessions).values({
			...newSession,
			rsvpSlug: rsvpEvent.slug
		});

		const primaryThread = await createPrimarySessionThread({
			db: locals.db,
			session: { id: sessionId, title, themeTitle },
			authorUserId: locals.user!.id
		});

		const prefs = await getOrCreateNotificationPreferences(locals.db, locals.user!.id);
		if (prefs.autoSubscribeOwn) {
			await locals.db.insert(subscriptions).values({
				id: newId(),
				userId: locals.user!.id,
				threadId: primaryThread.id,
				mode: prefs.defaultSubMode
			});
		}

		return { created: true };
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
