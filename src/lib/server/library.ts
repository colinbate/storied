import {
	authors,
	bookAccessOptions,
	books,
	series,
	sessions,
	sessionSubjects,
	themes,
	userSubjects
} from '$lib/server/db/schema';
import { and, asc, eq, isNull, type SQL } from 'drizzle-orm';
import { loadClassificationsBySubject } from '$lib/server/classifications';
import { sessionStartDate } from '$shared/session-lifecycle';

type LibraryContextOptions = {
	userId: string;
	sessionAccess: SQL;
};

export async function loadLibrarySubjects(db: App.Locals['db'], context?: LibraryContextOptions) {
	const [bookRows, seriesRows, authorRows] = await Promise.all([
		db
			.select({
				id: books.id,
				slug: books.slug,
				title: books.title,
				subtitle: books.subtitle,
				authorText: books.authorText,
				coverUrl: books.coverUrl,
				goodreadsUrl: books.goodreadsUrl,
				hardcoverUrl: books.hardcoverUrl,
				firstPublishYear: books.firstPublishYear,
				editionLabel: books.editionLabel,
				language: books.language,
				pageCount: books.pageCount,
				audiobookMinutes: books.audiobookMinutes,
				description: books.description
			})
			.from(books)
			.where(isNull(books.deletedAt))
			.orderBy(asc(books.title))
			.all(),
		db
			.select({
				id: series.id,
				slug: series.slug,
				title: series.title,
				authorText: series.authorText,
				coverUrl: series.coverUrl,
				goodreadsUrl: series.goodreadsUrl,
				hardcoverUrl: series.hardcoverUrl,
				bookCount: series.bookCount,
				isComplete: series.isComplete,
				description: series.description
			})
			.from(series)
			.where(isNull(series.deletedAt))
			.orderBy(asc(series.title))
			.all(),
		db
			.select({
				id: authors.id,
				slug: authors.slug,
				name: authors.name,
				bio: authors.bio,
				photoUrl: authors.photoUrl,
				goodreadsUrl: authors.goodreadsUrl,
				hardcoverUrl: authors.hardcoverUrl
			})
			.from(authors)
			.where(isNull(authors.deletedAt))
			.orderBy(asc(authors.name))
			.all()
	]);
	const bookIds = bookRows.map((book) => book.id);

	const [
		bookClassifications,
		seriesClassifications,
		relationRows,
		sessionRows,
		accessRows,
		allSessionRows
	] = await Promise.all([
		loadClassificationsBySubject(db, 'book', bookIds),
		loadClassificationsBySubject(
			db,
			'series',
			seriesRows.map((entry) => entry.id)
		),
		context
			? db
					.select({
						subjectId: userSubjects.subjectId,
						readingStatus: userSubjects.readingStatus,
						isRecommended: userSubjects.isRecommended
					})
					.from(userSubjects)
					.innerJoin(books, eq(userSubjects.subjectId, books.id))
					.where(
						and(
							eq(userSubjects.userId, context.userId),
							eq(userSubjects.subjectType, 'book'),
							isNull(books.deletedAt)
						)
					)
					.all()
			: Promise.resolve([]),
		context
			? db
					.select({
						bookId: sessionSubjects.subjectId,
						role: sessionSubjects.status,
						sessionId: sessions.id,
						slug: sessions.slug,
						title: sessions.title,
						startsAt: sessions.startsAt,
						timezone: sessions.timezone,
						status: sessions.status,
						themeId: sessions.themeId,
						themeName: themes.name,
						legacyTheme: sessions.themeTitle,
						legacyThemeFallback: sessions.theme
					})
					.from(sessionSubjects)
					.innerJoin(books, eq(sessionSubjects.subjectId, books.id))
					.innerJoin(sessions, eq(sessionSubjects.sessionId, sessions.id))
					.leftJoin(themes, eq(sessions.themeId, themes.id))
					.where(
						and(
							eq(sessionSubjects.subjectType, 'book'),
							isNull(books.deletedAt),
							context.sessionAccess
						)
					)
					.orderBy(asc(sessions.startsAt), asc(sessions.title))
					.all()
			: Promise.resolve([]),
		context && bookIds.length
			? db
					.select({ bookId: bookAccessOptions.bookId, format: bookAccessOptions.format })
					.from(bookAccessOptions)
					.innerJoin(books, eq(bookAccessOptions.bookId, books.id))
					.where(isNull(books.deletedAt))
					.all()
			: Promise.resolve([]),
		context
			? db
					.select({
						sessionId: sessions.id,
						slug: sessions.slug,
						title: sessions.title,
						startsAt: sessions.startsAt,
						timezone: sessions.timezone,
						status: sessions.status
					})
					.from(sessions)
					.where(context.sessionAccess)
					.all()
			: Promise.resolve([])
	]);

	const relations = new Map(relationRows.map((row) => [row.subjectId, row]));
	type SessionLink = (typeof sessionRows)[number] & {
		themeName: string | null;
		themeKey: string | null;
	};
	const sessionsByBook = new Map<string, SessionLink[]>();
	for (const row of sessionRows) {
		const themeName = row.themeName ?? row.legacyTheme ?? row.legacyThemeFallback;
		const normalizedTheme =
			themeName
				?.trim()
				.toLowerCase()
				.replace(/[^a-z0-9]+/g, '-') ?? null;
		const entry = {
			...row,
			themeName,
			themeKey: row.themeId ?? (normalizedTheme ? `legacy:${normalizedTheme}` : null)
		};
		const existing = sessionsByBook.get(row.bookId) ?? [];
		existing.push(entry);
		sessionsByBook.set(row.bookId, existing);
	}

	const accessByBook = new Map<string, { count: number; formats: string[] }>();
	for (const row of accessRows) {
		const existing = accessByBook.get(row.bookId) ?? { count: 0, formats: [] };
		existing.count += 1;
		if (!existing.formats.includes(row.format)) existing.formats.push(row.format);
		accessByBook.set(row.bookId, existing);
	}

	const nextSession =
		allSessionRows.find((session) => session.status === 'current') ??
		allSessionRows
			.filter((session) => session.status === 'scheduled')
			.filter((session) => {
				const start = sessionStartDate(session);
				return start === null || start >= new Date();
			})
			.sort((a, b) => {
				const aStart = sessionStartDate(a)?.getTime() ?? Number.MAX_SAFE_INTEGER;
				const bStart = sessionStartDate(b)?.getTime() ?? Number.MAX_SAFE_INTEGER;
				return aStart - bStart;
			})[0] ??
		null;

	const sessionOptions = allSessionRows
		.slice()
		.sort((a, b) => {
			const aStart = sessionStartDate(a)?.getTime() ?? 0;
			const bStart = sessionStartDate(b)?.getTime() ?? 0;
			return bStart - aStart;
		})
		.map((session) => ({
			id: session.sessionId,
			slug: session.slug,
			title: session.title,
			startsAt: session.startsAt,
			timezone: session.timezone,
			status: session.status
		}));
	const themeOptions = Array.from(
		new Map(
			sessionRows
				.map((row) => {
					const name = row.themeName ?? row.legacyTheme ?? row.legacyThemeFallback;
					const normalized = name
						?.trim()
						.toLowerCase()
						.replace(/[^a-z0-9]+/g, '-');
					const key = row.themeId ?? (normalized ? `legacy:${normalized}` : null);
					return key && name ? ([key, { key, name }] as const) : null;
				})
				.filter((entry): entry is readonly [string, { key: string; name: string }] => !!entry)
		).values()
	).sort((a, b) => a.name.localeCompare(b.name));

	return {
		books: bookRows.map((book) => ({
			...book,
			classifications: bookClassifications[book.id] ?? [],
			readingStatus: relations.get(book.id)?.readingStatus ?? null,
			isRecommended: relations.get(book.id)?.isRecommended ?? false,
			sessionLinks: sessionsByBook.get(book.id) ?? [],
			accessCount: accessByBook.get(book.id)?.count ?? 0,
			accessFormats: accessByBook.get(book.id)?.formats ?? []
		})),
		series: seriesRows.map((entry) => ({
			...entry,
			classifications: seriesClassifications[entry.id] ?? []
		})),
		authors: authorRows,
		sessionOptions,
		themeOptions,
		nextSession: nextSession
			? {
					id: nextSession.sessionId,
					slug: nextSession.slug,
					title: nextSession.title,
					startsAt: nextSession.startsAt,
					timezone: nextSession.timezone
				}
			: null
	};
}
