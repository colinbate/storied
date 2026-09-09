import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	books,
	authors,
	attendeeIdentities,
	series,
	sessionParticipants,
	sessionReadingChoices,
	sessions,
	sessionSubjects,
	themeBooks,
	users
} from '$lib/server/db/schema';
import { eq, and, desc, asc, sql, isNull, inArray, count } from 'drizzle-orm';
import { requirePermission } from '$lib/server/auth';
import { ensureSubjectSource } from '$lib/server/subject-sources';
import { detectSubjectLinks, type DetectedSubjectLink } from '$lib/server/book-links';
import { renderMarkdown } from '$lib/server/markdown';
import { DEFAULT_TIMEZONE, isValidTimezone } from '$lib/server/notification-preferences';
import {
	getPrimaryThreadForSession,
	subscribeActiveMembersToSessionThread
} from '$lib/server/discussions';
import { getOrCreateMemberAttendee, getSessionRsvpSlug } from '$lib/server/rsvp';
import { changeSessionStatus, selectThemeStatement } from '$lib/server/session-lifecycle';
import { isSessionStatus, sessionPublicationError } from '$shared/session-lifecycle';
import { createTheme, listThemes, resolveSessionTheme } from '$lib/server/themes';
import {
	isSessionReadingStatus,
	removeSessionReadingChoice,
	upsertSessionReadingChoice
} from '$lib/server/session-reading';
import { detectSessionDetailChanges } from '$shared/session-messages';

type SubjectKind = 'book' | 'series' | 'author';
type SessionSubjectStatus = 'starter' | 'featured' | 'discussed' | 'mentioned_off_theme';

const sessionSubjectStatuses = new Set(['starter', 'featured', 'discussed', 'mentioned_off_theme']);

const subjectUrlBatchFields = [
	{ name: 'starterUrls', label: 'Starter', status: 'starter' },
	{ name: 'featuredUrls', label: 'Featured', status: 'featured' },
	{ name: 'discussedUrls', label: 'Discussed', status: 'discussed' },
	{
		name: 'mentionedOffThemeUrls',
		label: 'Mentioned off theme',
		status: 'mentioned_off_theme'
	}
] as const satisfies readonly {
	name: string;
	label: string;
	status: SessionSubjectStatus;
}[];

type SubjectUrlBatchItem = {
	link: DetectedSubjectLink;
	status: SessionSubjectStatus;
};

function parseSubjectUrlBatches(data: FormData) {
	const items: SubjectUrlBatchItem[] = [];
	const invalidEntries: string[] = [];
	const conflictingEntries: string[] = [];
	const seen = new Map<string, { status: SessionSubjectStatus; location: string }>();
	let duplicateCount = 0;

	for (const field of subjectUrlBatchFields) {
		const lines = (data.get(field.name)?.toString() ?? '').split(/\r?\n/);
		for (const [index, rawLine] of lines.entries()) {
			const line = rawLine.trim();
			if (!line) continue;

			let isUrl = false;
			try {
				const parsedUrl = new URL(line);
				isUrl = parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:';
			} catch {
				// The validation message below covers malformed and unsupported URLs together.
			}

			const detectedLinks = isUrl ? detectSubjectLinks(line) : [];
			if (detectedLinks.length !== 1) {
				invalidEntries.push(`${field.label} line ${index + 1}`);
				continue;
			}

			const link = detectedLinks[0];
			const key = `${link.sourceType}:${link.sourceKey}`;
			const location = `${field.label} line ${index + 1}`;
			const previous = seen.get(key);
			if (previous) {
				if (previous.status === field.status) {
					duplicateCount += 1;
				} else {
					conflictingEntries.push(`${previous.location} and ${location}`);
				}
				continue;
			}

			seen.set(key, { status: field.status, location });
			items.push({ link, status: field.status });
		}
	}

	return { items, invalidEntries, conflictingEntries, duplicateCount };
}

function rejectStaleSession(data: FormData, updatedAt: string) {
	const expectedUpdatedAt = data.get('expectedUpdatedAt')?.toString();
	if (expectedUpdatedAt === updatedAt) return null;

	return fail(409, {
		error: 'This session changed after the form was loaded. Reload the page and try again.',
		staleSession: true
	});
}

function getOptionalString(data: FormData, key: string) {
	return data.get(key)?.toString()?.trim() || null;
}

/** People who would expect to hear about a change: confirmed, waitlisted, or maybe. */
async function responsiveParticipantCount(db: App.Locals['db'], sessionId: string) {
	const row = await db
		.select({ total: count() })
		.from(sessionParticipants)
		.where(
			and(
				eq(sessionParticipants.sessionId, sessionId),
				inArray(sessionParticipants.attendanceStatus, ['attending', 'waitlisted', 'maybe'])
			)
		)
		.get();
	return row?.total ?? 0;
}

function getSessionSubjectStatus(data: FormData): SessionSubjectStatus {
	const status = data.get('status')?.toString();
	return sessionSubjectStatuses.has(status ?? '') ? (status as SessionSubjectStatus) : 'starter';
}

export const load: PageServerLoad = async ({ params, locals }) => {
	requirePermission(locals, 'sessions:edit');

	const session = await locals.db
		.select()
		.from(sessions)
		.where(eq(sessions.slug, params.slug))
		.get();
	if (!session) throw error(404, 'Session not found');

	// Load all links for this session
	const rawLinks = await locals.db
		.select()
		.from(sessionSubjects)
		.where(eq(sessionSubjects.sessionId, session.id))
		.orderBy(desc(sessionSubjects.createdAt))
		.all();

	// Hydrate books
	const bookIds = rawLinks.filter((l) => l.subjectType === 'book').map((l) => l.subjectId);
	const seriesIds = rawLinks.filter((l) => l.subjectType === 'series').map((l) => l.subjectId);
	const authorIds = rawLinks.filter((l) => l.subjectType === 'author').map((l) => l.subjectId);

	const bookRows = bookIds.length ? await locals.db.select().from(books).all() : [];
	const seriesRows = seriesIds.length ? await locals.db.select().from(series).all() : [];
	const authorRows = authorIds.length ? await locals.db.select().from(authors).all() : [];

	const bookMap = new Map(bookRows.filter((b) => bookIds.includes(b.id)).map((b) => [b.id, b]));
	const seriesMap = new Map(
		seriesRows.filter((s) => seriesIds.includes(s.id)).map((s) => [s.id, s])
	);
	const authorMap = new Map(
		authorRows.filter((a) => authorIds.includes(a.id)).map((a) => [a.id, a])
	);

	const linkedSubjects = rawLinks
		.map((l) => {
			if (l.subjectType === 'book') {
				const b = bookMap.get(l.subjectId);
				return b ? { kind: 'book' as const, link: l, book: b } : null;
			}
			if (l.subjectType === 'series') {
				const s = seriesMap.get(l.subjectId);
				return s ? { kind: 'series' as const, link: l, series: s } : null;
			}
			if (l.subjectType === 'author') {
				const a = authorMap.get(l.subjectId);
				return a ? { kind: 'author' as const, link: l, author: a } : null;
			}
			return null;
		})
		.filter((x): x is NonNullable<typeof x> => x !== null);

	const allThemes = await listThemes(locals.db);
	const curatedThemeBooks = session.themeId
		? await locals.db
				.select({
					link: themeBooks,
					book: {
						id: books.id,
						slug: books.slug,
						title: books.title,
						authorText: books.authorText,
						coverUrl: books.coverUrl
					}
				})
				.from(themeBooks)
				.innerJoin(books, eq(themeBooks.bookId, books.id))
				.where(and(eq(themeBooks.themeId, session.themeId), isNull(books.deletedAt)))
				.orderBy(asc(books.title))
				.all()
		: [];

	const readingChoices = await locals.db
		.select({
			choice: sessionReadingChoices,
			attendee: attendeeIdentities,
			book: books
		})
		.from(sessionReadingChoices)
		.innerJoin(attendeeIdentities, eq(sessionReadingChoices.attendeeId, attendeeIdentities.id))
		.innerJoin(books, eq(sessionReadingChoices.bookId, books.id))
		.where(eq(sessionReadingChoices.sessionId, session.id))
		.orderBy(asc(attendeeIdentities.name), asc(sessionReadingChoices.createdAt))
		.all();

	// For adding new links — all books/series not yet linked, excluding deleted.
	const allBooks = await locals.db
		.select({
			id: books.id,
			title: books.title,
			authorText: books.authorText,
			slug: books.slug,
			deletedAt: books.deletedAt
		})
		.from(books)
		.orderBy(asc(books.title))
		.all();
	const allSeries = await locals.db
		.select({
			id: series.id,
			title: series.title,
			authorText: series.authorText,
			slug: series.slug,
			deletedAt: series.deletedAt
		})
		.from(series)
		.orderBy(asc(series.title))
		.all();
	const allAuthors = await locals.db
		.select({
			id: authors.id,
			name: authors.name,
			slug: authors.slug,
			deletedAt: authors.deletedAt
		})
		.from(authors)
		.orderBy(asc(authors.name))
		.all();
	const allUsers = await locals.db
		.select({
			id: users.id,
			displayName: users.displayName,
			email: users.email,
			status: users.status,
			avatarUrl: users.avatarUrl
		})
		.from(users)
		.orderBy(asc(users.displayName))
		.all();
	const guestAttendees = await locals.db
		.select()
		.from(attendeeIdentities)
		.where(isNull(attendeeIdentities.userId))
		.orderBy(asc(attendeeIdentities.name))
		.all();

	return {
		session,
		themes: allThemes,
		linkedSubjects,
		curatedThemeBooks,
		readingChoices,
		allBooks,
		allSeries,
		allAuthors,
		allUsers,
		guestAttendees
	};
};

export const actions: Actions = {
	updateSession: async ({ request, params, locals }) => {
		requirePermission(locals, 'sessions:edit');

		const row = await locals.db.select().from(sessions).where(eq(sessions.slug, params.slug)).get();
		if (!row) return fail(404, { error: 'Session not found' });

		const data = await request.formData();
		const staleFailure = rejectStaleSession(data, row.updatedAt);
		if (staleFailure) return staleFailure;

		const title = data.get('title')?.toString()?.trim();
		if (!title || title.length < 2)
			return fail(400, { error: 'Title must be at least 2 characters.' });

		const bodySource = getOptionalString(data, 'bodySource');
		const durationMinutes = Number.parseInt(data.get('durationMinutes')?.toString() ?? '', 10);
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
			status: row.status,
			startsAt,
			timezone,
			themeId: sessionTheme.themeId
		});
		if (publicationError) return fail(400, { error: publicationError });
		const themeTitle = sessionTheme.themeName;
		const updatedSession = {
			...row,
			title,
			themeId: sessionTheme.themeId,
			theme: themeTitle,
			themeTitle,
			themeSummary: row.themeSummary,
			bodySource,
			bodyHtml: bodySource ? renderMarkdown(bodySource) : null,
			startsAt,
			timezone,
			durationMinutes: Number.isFinite(durationMinutes) ? durationMinutes : null,
			locationName: getOptionalString(data, 'locationName'),
			rsvpSlug: getOptionalString(data, 'rsvpSlug') ?? getSessionRsvpSlug(row),
			rsvpCapacity: Math.max(
				1,
				Number.parseInt(data.get('rsvpCapacity')?.toString() ?? '12', 10) || 12
			),
			rsvpEnabled: data.get('rsvpEnabled') === 'on',
			rsvpWaitlistEnabled: data.get('rsvpWaitlistEnabled') === 'on',
			isPublic: data.get('isPublic') === 'on',
			astroPath: getOptionalString(data, 'astroPath'),
			externalUrl: getOptionalString(data, 'externalUrl'),
			updatedAt: new Date().toISOString()
		};

		const update = locals.db
			.update(sessions)
			.set({
				title: updatedSession.title,
				themeId: updatedSession.themeId,
				theme: updatedSession.theme,
				themeTitle: updatedSession.themeTitle,
				themeSummary: updatedSession.themeSummary,
				bodySource: updatedSession.bodySource,
				bodyHtml: updatedSession.bodyHtml,
				startsAt: updatedSession.startsAt,
				timezone: updatedSession.timezone,
				durationMinutes: updatedSession.durationMinutes,
				locationName: updatedSession.locationName,
				rsvpSlug: updatedSession.rsvpSlug,
				rsvpCapacity: updatedSession.rsvpCapacity,
				rsvpEnabled: updatedSession.rsvpEnabled,
				rsvpWaitlistEnabled: updatedSession.rsvpWaitlistEnabled,
				isPublic: updatedSession.isPublic,
				astroPath: updatedSession.astroPath,
				externalUrl: updatedSession.externalUrl,
				updatedAt: updatedSession.updatedAt
			})
			.where(and(eq(sessions.id, row.id), eq(sessions.updatedAt, row.updatedAt)))
			.returning({ id: sessions.id });

		const saved =
			updatedSession.status !== 'draft' && updatedSession.themeId
				? (
						await locals.db.batch([
							selectThemeStatement(
								locals.db,
								updatedSession.themeId,
								sql`EXISTS (SELECT 1 FROM sessions target WHERE target.id = ${row.id} AND target.updated_at = ${row.updatedAt})`
							),
							update
						])
					)[1]
				: (await locals.db.batch([update]))[0];
		if (!saved.length)
			return fail(409, {
				error: 'This session changed while you were saving. Reload the page and try again.'
			});

		// Offer a prepared attendee update when the time or place of a published session moves.
		const detailChanges = detectSessionDetailChanges(row, updatedSession);
		const notifyAttendees =
			detailChanges.length > 0 &&
			(row.status === 'scheduled' || row.status === 'current') &&
			(await responsiveParticipantCount(locals.db, row.id)) > 0;
		return {
			updated: true,
			detailChanges: notifyAttendees ? detailChanges : [],
			previousDetails: notifyAttendees
				? { startsAt: row.startsAt, timezone: row.timezone, locationName: row.locationName }
				: null
		};
	},

	updateStatus: async ({ request, params, locals }) => {
		requirePermission(locals, 'sessions:edit');

		const row = await locals.db.select().from(sessions).where(eq(sessions.slug, params.slug)).get();
		if (!row) return fail(404, { error: 'Session not found' });

		const data = await request.formData();
		const staleFailure = rejectStaleSession(data, row.updatedAt);
		if (staleFailure) return staleFailure;

		const requestedStatus = data.get('status')?.toString();
		if (!isSessionStatus(requestedStatus))
			return fail(400, { error: 'Choose a valid session status.' });
		const status = requestedStatus;
		const publicationError = sessionPublicationError({ ...row, status });
		if (publicationError) return fail(400, { error: publicationError });
		const result = await changeSessionStatus(locals.db, row, status);
		if (result.error) return fail(409, { error: result.error });

		if (row.status !== 'current' && status === 'current') {
			const primaryThread = await getPrimaryThreadForSession(locals.db, row.id);
			if (primaryThread) {
				await subscribeActiveMembersToSessionThread(locals.db, primaryThread.id);
			}
		}

		const cancelled =
			status === 'cancelled' &&
			row.status !== 'cancelled' &&
			(await responsiveParticipantCount(locals.db, row.id)) > 0;

		return {
			statusUpdated: true,
			cancelled,
			previousPastCount: result.previousPastCount,
			previousUpcomingCount: result.previousUpcomingCount
		};
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
	},

	addLink: async ({ request, params, locals }) => {
		requirePermission(locals, 'sessions:edit');
		const row = await locals.db.select().from(sessions).where(eq(sessions.slug, params.slug)).get();
		if (!row) return fail(404, { error: 'Session not found' });

		const data = await request.formData();
		const kind = data.get('kind')?.toString() as SubjectKind | undefined;
		const subjectId = data.get('subjectId')?.toString();
		if (!kind || !['book', 'series', 'author'].includes(kind))
			return fail(400, { error: 'Invalid subject kind.' });
		if (!subjectId) return fail(400, { error: 'Select a subject to link.' });

		const status = getSessionSubjectStatus(data);
		const note = data.get('note')?.toString()?.trim() || null;

		await locals.db
			.insert(sessionSubjects)
			.values({
				sessionId: row.id,
				subjectType: kind,
				subjectId,
				status,
				note,
				addedByUserId: locals.user?.id ?? null
			})
			.onConflictDoNothing();

		return { linkAdded: true };
	},

	addLinkFromUrl: async ({ request, params, locals, platform }) => {
		requirePermission(locals, 'sessions:edit');
		const row = await locals.db.select().from(sessions).where(eq(sessions.slug, params.slug)).get();
		if (!row) return fail(404, { error: 'Session not found' });

		const data = await request.formData();
		const note = data.get('note')?.toString()?.trim() || null;
		const { items, invalidEntries, conflictingEntries, duplicateCount } =
			parseSubjectUrlBatches(data);

		if (invalidEntries.length > 0) {
			return fail(400, {
				error: `Check ${invalidEntries.slice(0, 4).join(', ')}${invalidEntries.length > 4 ? `, and ${invalidEntries.length - 4} more` : ''}. Enter one supported Goodreads or Hardcover book, series, or author URL per line.`
			});
		}
		if (conflictingEntries.length > 0) {
			return fail(400, {
				error: `The same URL cannot be in different status groups. Check ${conflictingEntries.slice(0, 3).join(', ')}${conflictingEntries.length > 3 ? `, and ${conflictingEntries.length - 3} more` : ''}.`
			});
		}
		if (items.length === 0) {
			return fail(400, {
				error: 'Add at least one Goodreads or Hardcover book, series, or author URL.'
			});
		}

		let resolvedCount = 0;
		let queuedCount = 0;
		for (const item of items) {
			const result = await ensureSubjectSource(locals.db, item.link, platform?.env, {
				sessionLink: {
					sessionId: row.id,
					status: item.status,
					note,
					addedByUserId: locals.user?.id ?? null
				}
			});

			if (result.resolvedSubjectId) resolvedCount += 1;
			else queuedCount += 1;
		}

		return {
			batchLinksAdded: true,
			processedCount: items.length,
			resolvedCount,
			queuedCount,
			duplicateCount
		};
	},

	updateLink: async ({ request, params, locals }) => {
		requirePermission(locals, 'sessions:edit');
		const row = await locals.db.select().from(sessions).where(eq(sessions.slug, params.slug)).get();
		if (!row) return fail(404, { error: 'Session not found' });

		const data = await request.formData();
		const kind = data.get('kind')?.toString() as SubjectKind | undefined;
		const subjectId = data.get('subjectId')?.toString();
		if (!kind || !subjectId) return fail(400, { error: 'Missing subject reference.' });

		const status = getSessionSubjectStatus(data);
		const note = data.get('note')?.toString()?.trim() || null;

		await locals.db
			.update(sessionSubjects)
			.set({ status, note, updatedAt: new Date().toISOString() })
			.where(
				and(
					eq(sessionSubjects.sessionId, row.id),
					eq(sessionSubjects.subjectType, kind),
					eq(sessionSubjects.subjectId, subjectId)
				)
			);

		return { linkUpdated: true };
	},

	removeLink: async ({ request, params, locals }) => {
		requirePermission(locals, 'sessions:edit');
		const row = await locals.db.select().from(sessions).where(eq(sessions.slug, params.slug)).get();
		if (!row) return fail(404, { error: 'Session not found' });

		const data = await request.formData();
		const kind = data.get('kind')?.toString() as SubjectKind | undefined;
		const subjectId = data.get('subjectId')?.toString();
		if (!kind || !subjectId) return fail(400, { error: 'Missing subject reference.' });

		await locals.db
			.delete(sessionSubjects)
			.where(
				and(
					eq(sessionSubjects.sessionId, row.id),
					eq(sessionSubjects.subjectType, kind),
					eq(sessionSubjects.subjectId, subjectId)
				)
			);

		return { linkRemoved: true };
	},

	promoteThemeBook: async ({ request, params, locals }) => {
		requirePermission(locals, 'sessions:edit');
		const row = await locals.db.select().from(sessions).where(eq(sessions.slug, params.slug)).get();
		if (!row) return fail(404, { error: 'Session not found' });
		if (!row.themeId) return fail(400, { error: 'Choose a theme for this session first.' });

		const data = await request.formData();
		const bookId = data.get('bookId')?.toString();
		if (!bookId) return fail(400, { error: 'Missing theme book.' });
		const relation = await locals.db
			.select({ bookId: themeBooks.bookId })
			.from(themeBooks)
			.innerJoin(books, eq(themeBooks.bookId, books.id))
			.where(
				and(
					eq(themeBooks.themeId, row.themeId),
					eq(themeBooks.bookId, bookId),
					isNull(books.deletedAt)
				)
			)
			.get();
		if (!relation) return fail(404, { error: 'That book is not linked to this theme.' });

		await locals.db
			.insert(sessionSubjects)
			.values({
				sessionId: row.id,
				subjectType: 'book',
				subjectId: bookId,
				status: 'starter',
				addedByUserId: locals.user?.id ?? null
			})
			.onConflictDoNothing();

		return { themeBookPromoted: true };
	},

	upsertReadingChoice: async ({ request, params, locals, platform }) => {
		requirePermission(locals, 'sessions:edit');
		const row = await locals.db.select().from(sessions).where(eq(sessions.slug, params.slug)).get();
		if (!row) return fail(404, { error: 'Session not found' });

		const data = await request.formData();
		const readerId = data.get('readerId')?.toString();
		const bookId = data.get('bookId')?.toString();
		const bookUrl = data.get('url')?.toString().trim() ?? '';
		const readingStatusValue = data.get('readingStatus')?.toString();
		if (!readerId) return fail(400, { error: 'Select a reader.' });
		if (!isSessionReadingStatus(readingStatusValue)) {
			return fail(400, { error: 'Select a reading status.' });
		}
		let attendee;
		if (readerId.startsWith('user:')) {
			const user = await locals.db
				.select()
				.from(users)
				.where(eq(users.id, readerId.slice(5)))
				.get();
			if (!user) return fail(404, { error: 'Member not found.' });
			attendee = await getOrCreateMemberAttendee(locals.db, user);
		} else if (readerId.startsWith('attendee:')) {
			attendee = await locals.db
				.select()
				.from(attendeeIdentities)
				.where(eq(attendeeIdentities.id, readerId.slice(9)))
				.get();
			if (!attendee) return fail(404, { error: 'Reader not found.' });
		} else {
			return fail(400, { error: 'Select a valid reader.' });
		}

		if (bookUrl) {
			const links = detectSubjectLinks(bookUrl);
			if (links.length !== 1 || links[0].subjectKind !== 'book') {
				return fail(400, { error: 'Use one Goodreads or Hardcover book URL.' });
			}
			const result = await ensureSubjectSource(locals.db, links[0], platform?.env, {
				sessionReadingChoice: {
					sessionId: row.id,
					attendeeId: attendee.id,
					readingStatus: readingStatusValue
				}
			});
			return result.resolvedSubjectId
				? { readingChoiceSaved: true }
				: { readingChoiceQueued: true };
		}
		if (!bookId) return fail(400, { error: 'Choose a book or enter a book URL.' });
		const book = await locals.db
			.select({ id: books.id })
			.from(books)
			.where(and(eq(books.id, bookId), isNull(books.deletedAt)))
			.get();
		if (!book) return fail(404, { error: 'That book is unavailable.' });

		await upsertSessionReadingChoice(locals.db, {
			sessionId: row.id,
			attendeeId: attendee.id,
			bookId,
			readingStatus: readingStatusValue
		});

		return { readingChoiceSaved: true };
	},

	removeReadingChoice: async ({ request, params, locals }) => {
		requirePermission(locals, 'sessions:edit');
		const row = await locals.db.select().from(sessions).where(eq(sessions.slug, params.slug)).get();
		if (!row) return fail(404, { error: 'Session not found' });

		const data = await request.formData();
		const attendeeId = data.get('attendeeId')?.toString();
		const bookId = data.get('bookId')?.toString();
		if (!attendeeId || !bookId) return fail(400, { error: 'Missing reading choice.' });
		await removeSessionReadingChoice(locals.db, {
			sessionId: row.id,
			attendeeId,
			bookId
		});

		return { readingChoiceRemoved: true };
	},

	promoteReadingChoice: async ({ request, params, locals }) => {
		requirePermission(locals, 'sessions:edit');
		const row = await locals.db.select().from(sessions).where(eq(sessions.slug, params.slug)).get();
		if (!row) return fail(404, { error: 'Session not found' });

		const data = await request.formData();
		const bookId = data.get('bookId')?.toString();
		if (!bookId) return fail(400, { error: 'Missing reading choice.' });
		const choice = await locals.db
			.select({ bookId: sessionReadingChoices.bookId })
			.from(sessionReadingChoices)
			.where(
				and(eq(sessionReadingChoices.sessionId, row.id), eq(sessionReadingChoices.bookId, bookId))
			)
			.get();
		if (!choice) return fail(404, { error: 'Reading choice not found.' });

		await locals.db
			.insert(sessionSubjects)
			.values({
				sessionId: row.id,
				subjectType: 'book',
				subjectId: bookId,
				status: 'featured',
				addedByUserId: locals.user?.id ?? null
			})
			.onConflictDoUpdate({
				target: [sessionSubjects.sessionId, sessionSubjects.subjectType, sessionSubjects.subjectId],
				set: {
					status: 'featured',
					updatedAt: new Date().toISOString()
				}
			});

		return { readingChoicePromoted: true };
	}
};
