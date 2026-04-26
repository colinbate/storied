import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	books,
	genres,
	notificationPreferences,
	series,
	userProfiles,
	userSubjects,
	users
} from '$lib/server/db/schema';
import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import { parseProfileGenres, serializeProfileGenres } from '$lib/profile-genres';
import {
	DEFAULT_TIMEZONE,
	getOrCreateNotificationPreferences,
	isValidTimezone
} from '$lib/server/notification-preferences';
import { detectFirstSubjectLink, ensureSubjectSource } from '$lib/server/subject-sources';

type NotificationMode = 'off' | 'immediate' | 'daily_digest';
type DefaultSubMode = 'immediate' | 'daily_digest';

function isDefaultSubMode(value: unknown): value is DefaultSubMode {
	return value === 'immediate' || value === 'daily_digest';
}

function isNotificationMode(value: unknown): value is NotificationMode {
	return value === 'off' || value === 'immediate' || value === 'daily_digest';
}

async function ensureUserProfile(locals: App.Locals) {
	if (!locals.user) return;
	await locals.db
		.insert(userProfiles)
		.values({ userId: locals.user.id })
		.onConflictDoNothing({ target: userProfiles.userId });
}

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw redirect(302, '/auth/login');
	const preferences = await getOrCreateNotificationPreferences(locals.db, locals.user.id);
	const [profileRows, featuredBookRows, featuredSeriesRows, allBooks, allSeries, allGenres] =
		await Promise.all([
			locals.db.select().from(userProfiles).where(eq(userProfiles.userId, locals.user.id)).all(),
			locals.db
				.select({
					relation: userSubjects,
					book: books
				})
				.from(userSubjects)
				.innerJoin(books, eq(userSubjects.subjectId, books.id))
				.where(
					and(
						eq(userSubjects.userId, locals.user.id),
						eq(userSubjects.featuredOnProfile, true),
						eq(userSubjects.subjectType, 'book'),
						isNull(books.deletedAt)
					)
				)
				.orderBy(asc(userSubjects.featuredOrder), desc(userSubjects.updatedAt))
				.all(),
			locals.db
				.select({
					relation: userSubjects,
					series
				})
				.from(userSubjects)
				.innerJoin(series, eq(userSubjects.subjectId, series.id))
				.where(
					and(
						eq(userSubjects.userId, locals.user.id),
						eq(userSubjects.featuredOnProfile, true),
						eq(userSubjects.subjectType, 'series'),
						isNull(series.deletedAt)
					)
				)
				.orderBy(asc(userSubjects.featuredOrder), desc(userSubjects.updatedAt))
				.all(),
			locals.db
				.select({
					id: books.id,
					title: books.title,
					authorText: books.authorText,
					slug: books.slug,
					deletedAt: books.deletedAt
				})
				.from(books)
				.orderBy(asc(books.title))
				.all(),
			locals.db
				.select({
					id: series.id,
					title: series.title,
					authorText: series.authorText,
					slug: series.slug,
					deletedAt: series.deletedAt
				})
				.from(series)
				.orderBy(asc(series.title))
				.all(),
			locals.db.select().from(genres).orderBy(asc(genres.name)).all()
		]);
	const profile = profileRows[0] ?? null;
	const featuredSubjects = [
		...featuredBookRows.map(({ relation, book }) => ({ kind: 'book' as const, relation, book })),
		...featuredSeriesRows.map(({ relation, series }) => ({
			kind: 'series' as const,
			relation,
			series
		}))
	].sort(
		(a, b) =>
			(a.relation.featuredOrder ?? -Infinity) - (b.relation.featuredOrder ?? -Infinity) ||
			b.relation.updatedAt.localeCompare(a.relation.updatedAt)
	);

	return {
		user: locals.user,
		profile,
		profileGenres: parseProfileGenres(profile?.favoriteGenresText),
		featuredSubjects,
		allBooks,
		allSeries,
		allGenres,
		preferences,
		defaultTimezone: DEFAULT_TIMEZONE
	};
};

export const actions: Actions = {
	updateAccount: async ({ request, locals }) => {
		if (!locals.user) throw redirect(302, '/auth/login');

		const data = await request.formData();
		const displayName = data.get('displayName')?.toString()?.trim();

		if (!displayName || displayName.length < 2 || displayName.length > 50) {
			return fail(400, { error: 'Display name must be between 2 and 50 characters.' });
		}

		await locals.db
			.update(users)
			.set({ displayName, updatedAt: new Date().toISOString() })
			.where(eq(users.id, locals.user.id));

		return { accountSuccess: true };
	},

	updateProfile: async ({ request, locals }) => {
		if (!locals.user) throw redirect(302, '/auth/login');

		const data = await request.formData();

		await locals.db
			.insert(userProfiles)
			.values({
				userId: locals.user.id,
				headline: data.get('headline')?.toString()?.trim() || null,
				bio: data.get('bio')?.toString()?.trim() || null,
				favoriteGenresText: serializeProfileGenres(
					parseProfileGenres(data.get('favoriteGenresText')?.toString())
				),
				locationText: null,
				websiteUrl: data.get('websiteUrl')?.toString()?.trim() || null,
				showReadBooks: data.get('showReadBooks') === 'on',
				showRecommendations: data.get('showRecommendations') === 'on',
				showProfile: data.get('showProfile') === 'on'
			})
			.onConflictDoUpdate({
				target: userProfiles.userId,
				set: {
					headline: data.get('headline')?.toString()?.trim() || null,
					bio: data.get('bio')?.toString()?.trim() || null,
					favoriteGenresText: serializeProfileGenres(
						parseProfileGenres(data.get('favoriteGenresText')?.toString())
					),
					locationText: null,
					websiteUrl: data.get('websiteUrl')?.toString()?.trim() || null,
					showReadBooks: data.get('showReadBooks') === 'on',
					showRecommendations: data.get('showRecommendations') === 'on',
					showProfile: data.get('showProfile') === 'on',
					updatedAt: new Date().toISOString()
				}
			});

		return { success: true };
	},

	addFeaturedSubject: async ({ request, locals, platform }) => {
		if (!locals.user) throw redirect(302, '/auth/login');

		const data = await request.formData();
		const subjectType = data.get('kind')?.toString();
		if (subjectType === 'url') {
			const url = data.get('url')?.toString()?.trim() || '';
			if (!url) {
				return fail(400, { featureError: 'Paste a Goodreads book or series URL.' });
			}

			const link = detectFirstSubjectLink(url);
			if (!link) {
				return fail(400, { featureError: 'Only Goodreads book or series URLs are supported.' });
			}

			const existingFeatured = await locals.db
				.select()
				.from(userSubjects)
				.where(
					and(eq(userSubjects.userId, locals.user.id), eq(userSubjects.featuredOnProfile, true))
				)
				.all();
			if (existingFeatured.length >= 5) {
				return fail(400, { featureError: 'You can feature up to 5 subjects.' });
			}

			const nextOrder =
				existingFeatured.reduce((max, relation) => Math.max(max, relation.featuredOrder ?? 0), 0) +
				1;
			await ensureUserProfile(locals);
			const result = await ensureSubjectSource(locals.db, link, platform?.env, {
				userFeatureLink: {
					userId: locals.user.id,
					featuredOrder: nextOrder
				}
			});

			if (result.resolvedSubjectId) {
				return { featureAdded: true };
			}

			return { featureQueued: true };
		}
		if (subjectType !== 'book' && subjectType !== 'series') {
			return fail(400, { featureError: 'Choose a book or series.' });
		}
		const subjectId = data.get('subjectId')?.toString();
		if (!subjectId) {
			return fail(400, { featureError: 'Choose something to feature.' });
		}

		const existingFeatured = await locals.db
			.select()
			.from(userSubjects)
			.where(and(eq(userSubjects.userId, locals.user.id), eq(userSubjects.featuredOnProfile, true)))
			.all();
		const alreadyFeatured = existingFeatured.some(
			(relation) => relation.subjectType === subjectType && relation.subjectId === subjectId
		);
		if (!alreadyFeatured && existingFeatured.length >= 5) {
			return fail(400, { featureError: 'You can feature up to 5 subjects.' });
		}

		const nextOrder =
			existingFeatured.reduce((max, relation) => Math.max(max, relation.featuredOrder ?? 0), 0) + 1;

		await ensureUserProfile(locals);
		await locals.db
			.insert(userSubjects)
			.values({
				userId: locals.user.id,
				subjectType,
				subjectId,
				readingStatus: 'want_to_read',
				featuredOnProfile: true,
				featuredOrder: nextOrder
			})
			.onConflictDoUpdate({
				target: [userSubjects.userId, userSubjects.subjectType, userSubjects.subjectId],
				set: {
					featuredOnProfile: true,
					featuredOrder: nextOrder,
					updatedAt: new Date().toISOString()
				}
			});

		return { featureAdded: true };
	},

	removeFeaturedSubject: async ({ request, locals }) => {
		if (!locals.user) throw redirect(302, '/auth/login');

		const data = await request.formData();
		const subjectType = data.get('kind')?.toString();
		const subjectId = data.get('subjectId')?.toString();
		if ((subjectType !== 'book' && subjectType !== 'series') || !subjectId) {
			return fail(400, { featureError: 'Missing featured subject.' });
		}

		await locals.db
			.update(userSubjects)
			.set({
				featuredOnProfile: false,
				featuredOrder: null,
				updatedAt: new Date().toISOString()
			})
			.where(
				and(
					eq(userSubjects.userId, locals.user.id),
					eq(userSubjects.subjectType, subjectType),
					eq(userSubjects.subjectId, subjectId)
				)
			);

		return { featureRemoved: true };
	},

	uploadAvatar: async ({ request, locals, platform }) => {
		if (!locals.user) throw redirect(302, '/auth/login');

		const data = await request.formData();
		const file = data.get('avatar');

		if (!(file instanceof File) || file.size === 0) {
			return fail(400, { avatarError: 'Please select a file.' });
		}

		// Validate file type
		const allowedTypes = ['image/png', 'image/jpeg', 'image/webp'];
		if (!allowedTypes.includes(file.type)) {
			return fail(400, { avatarError: 'Only PNG, JPG, and WEBP images are allowed.' });
		}

		// Validate file size (1MB max)
		if (file.size > 1024 * 1024) {
			return fail(400, { avatarError: 'File must be under 1MB.' });
		}

		if (!platform?.env.FILES) {
			return fail(500, { avatarError: 'File storage is not available.' });
		}

		// Determine extension from MIME type
		const extMap: Record<string, string> = {
			'image/png': 'png',
			'image/jpeg': 'jpg',
			'image/webp': 'webp'
		};
		const ext = extMap[file.type] || 'jpg';
		const key = `avatars/${locals.user.id}.${ext}`;

		// Upload to R2
		const arrayBuffer = await file.arrayBuffer();
		await platform.env.FILES.put(key, arrayBuffer, {
			httpMetadata: {
				contentType: file.type
			}
		});

		// Build the public URL
		const baseUrl = platform.env.FILE_BASE_URL || '';
		const avatarUrl = `${baseUrl}/${key}`;

		// Update user record
		await locals.db
			.update(users)
			.set({ avatarUrl, updatedAt: new Date().toISOString() })
			.where(eq(users.id, locals.user.id));

		return { avatarSuccess: true };
	},

	updateDyslexicFont: async ({ request, locals }) => {
		if (!locals.user) throw redirect(302, '/auth/login');

		const data = await request.formData();
		const enabled = data.get('dyslexicFont')?.toString() === 'on';

		await locals.db
			.update(users)
			.set({ dyslexicFont: enabled, updatedAt: new Date().toISOString() })
			.where(eq(users.id, locals.user.id));

		return { dyslexicFontSuccess: true };
	},

	updateTimezone: async ({ request, locals }) => {
		if (!locals.user) throw redirect(302, '/auth/login');

		const data = await request.formData();
		const timezone = data.get('timezone')?.toString()?.trim();
		if (!timezone || !isValidTimezone(timezone)) {
			return fail(400, { timezoneError: 'Please choose a valid timezone.' });
		}

		await locals.db
			.update(users)
			.set({ timezone, updatedAt: new Date().toISOString() })
			.where(eq(users.id, locals.user.id));

		return { timezoneSuccess: true };
	},

	updatePreferences: async ({ request, locals }) => {
		if (!locals.user) throw redirect(302, '/auth/login');

		const data = await request.formData();
		const mode = data.get('mode')?.toString();
		const digestHourRaw = data.get('digestHour')?.toString();
		const autoSubscribe = data.get('autoSubscribe')?.toString() === 'on';

		if (!isNotificationMode(mode)) {
			return fail(400, { prefsError: 'Invalid notification mode.' });
		}

		let emailEnabled = true;
		let digestHourLocal: number | null = null;
		let defaultSubMode: DefaultSubMode = 'immediate';

		if (mode === 'off') {
			emailEnabled = false;
			digestHourLocal = null;
			// Leave defaultSubMode at 'immediate' — it's only consulted when
			// email_enabled=1 or the user re-enables later. Value is harmless.
			defaultSubMode = 'immediate';
		} else if (mode === 'immediate') {
			emailEnabled = true;
			digestHourLocal = null;
			defaultSubMode = 'immediate';
		} else {
			// daily_digest
			emailEnabled = true;
			const hour = digestHourRaw !== undefined ? Number.parseInt(digestHourRaw, 10) : NaN;
			if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
				return fail(400, { prefsError: 'Please pick a valid digest hour (0–23).' });
			}
			digestHourLocal = hour;
			defaultSubMode = 'daily_digest';
		}

		// Ensure a row exists, then update.
		await getOrCreateNotificationPreferences(locals.db, locals.user.id);
		await locals.db
			.update(notificationPreferences)
			.set({
				emailEnabled,
				digestHourLocal,
				defaultSubMode,
				autoSubscribeOwn: autoSubscribe,
				updatedAt: new Date().toISOString()
			})
			.where(eq(notificationPreferences.userId, locals.user.id));

		// Guard in case TS complains later — keep helper imported.
		void isDefaultSubMode;

		return { prefsSuccess: true };
	}
};
