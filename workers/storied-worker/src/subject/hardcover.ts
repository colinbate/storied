import type { Env } from '../env';

const HARDCOVER_GRAPHQL_URL = 'https://api.hardcover.app/v1/graphql';

type HardcoverQueryType = 'Book' | 'Author' | 'Series';

export interface HardcoverBookMetadata {
	hardcoverId?: string;
	slug: string;
	title: string;
	subtitle?: string;
	authorText?: string;
	coverUrl?: string;
	isbn13?: string;
	description?: string;
	firstPublishYear?: number;
	hardcoverUrl: string;
	raw: unknown;
}

export interface HardcoverAuthorMetadata {
	hardcoverId?: string;
	slug: string;
	name: string;
	bio?: string;
	photoUrl?: string;
	hardcoverUrl: string;
	raw: unknown;
}

export interface HardcoverSeriesMetadata {
	hardcoverId?: string;
	slug: string;
	title: string;
	authorText?: string;
	description?: string;
	coverUrl?: string;
	bookCount?: number;
	hardcoverUrl: string;
	raw: unknown;
}

interface SearchResponse {
	data?: {
		search?: {
			ids?: unknown[];
			results?: unknown;
		};
	};
	errors?: { message?: string }[];
}

interface GraphqlResponse<T> {
	data?: T;
	errors?: { message?: string }[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function stringValue(value: unknown): string | undefined {
	return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown): number | undefined {
	return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function numericValue(value: unknown): number | undefined {
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	if (typeof value !== 'string' || !value.trim()) return undefined;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : undefined;
}

function firstString(values: unknown): string | undefined {
	if (!Array.isArray(values)) return stringValue(values);
	return values.map(stringValue).find(Boolean);
}

function imageUrl(value: unknown): string | undefined {
	if (typeof value === 'string') return stringValue(value);
	if (Array.isArray(value)) return value.map(imageUrl).find(Boolean);
	if (!isRecord(value)) return undefined;
	return (
		stringValue(value.url) ||
		stringValue(value.image_url) ||
		stringValue(value.imageUrl) ||
		stringValue(value.src)
	);
}

function descriptionText(value: unknown): string | undefined {
	const raw = stringValue(value);
	if (!raw) return undefined;
	return raw
		.replace(/<br\s*\/?>/gi, '\n')
		.replace(/<[^>]+>/g, '')
		.replace(/\s+\n/g, '\n')
		.replace(/\n\s+/g, '\n')
		.trim()
		.substring(0, 3000);
}

function slugToQuery(slug: string): string {
	return slug.replace(/-/g, ' ').trim();
}

function hardcoverUrl(kind: 'books' | 'authors' | 'series', slug: string): string {
	return `https://hardcover.app/${kind}/${slug}`;
}

function searchRecords(results: unknown): Record<string, unknown>[] {
	if (Array.isArray(results)) return results.filter(isRecord);
	if (!isRecord(results)) return [];

	const nestedResults =
		results.results ?? results.items ?? results.hits ?? results.books ?? results.authors ?? results.series;
	if (Array.isArray(nestedResults)) {
		return nestedResults
			.map((result) => (isRecord(result) && isRecord(result.document) ? result.document : result))
			.filter(isRecord);
	}

	return Object.values(results).filter(isRecord);
}

async function queryHardcover<T>(
	env: Env,
	query: string,
	variables: Record<string, unknown>,
	context: string
): Promise<T | null> {
	if (!env.HARDCOVER_API_TOKEN) {
		console.warn('[HARDCOVER] Missing HARDCOVER_API_TOKEN');
		return null;
	}

	const response = await fetch(HARDCOVER_GRAPHQL_URL, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			authorization: `Bearer ${env.HARDCOVER_API_TOKEN}`,
			'User-Agent': 'Storied Hardcover resolver'
		},
		body: JSON.stringify({
			query,
			variables
		})
	});

	if (!response.ok) {
		console.warn(`[HARDCOVER] API request failed (${response.status}) for ${context}`);
		return null;
	}

	const payload = (await response.json()) as GraphqlResponse<T>;
	if (payload.errors?.length) {
		console.warn(
			`[HARDCOVER] API error for ${context}: ${payload.errors
				.map((err) => err.message)
				.filter(Boolean)
				.join('; ')}`
		);
		return null;
	}

	return payload.data ?? null;
}

async function searchHardcover(
	env: Env,
	queryType: HardcoverQueryType,
	slug: string
): Promise<Record<string, unknown> | null> {
	const query = `query SearchHardcover($query: String!, $queryType: String!) {
		search(query: $query, query_type: $queryType, per_page: 5, page: 1) {
			ids
			results
		}
	}`;

	const payload = await queryHardcover<SearchResponse['data']>(
		env,
		query,
		{ query: slugToQuery(slug), queryType },
		`${queryType}:${slug}`
	);

	const results = payload?.search?.results;
	const ids = payload?.search?.ids ?? [];
	const normalizedSlug = slug.toLowerCase();
	const records = searchRecords(results);
	const exact = records.find(
		(record) => stringValue(record.slug)?.toLowerCase() === normalizedSlug
	);
	const chosen = exact ?? records[0];
	if (!chosen) return null;

	const index = records.indexOf(chosen);
	const hardcoverId = ids[index];
	if (hardcoverId !== undefined && chosen.id === undefined) chosen.id = hardcoverId;
	return chosen;
}

async function bookBySlug(env: Env, slug: string): Promise<Record<string, unknown> | null> {
	const query = `query BookBySlug($slug: String!) {
		books(where: { slug: { _eq: $slug } }, limit: 1) {
			id
			slug
			title
			subtitle
			description
			release_year
			contributions {
				author {
					name
				}
			}
			default_cover_edition {
				image {
					url
				}
			}
		}
	}`;

	const payload = await queryHardcover<{ books?: unknown[] }>(
		env,
		query,
		{ slug },
		`BookBySlug:${slug}`
	);
	return payload?.books?.find(isRecord) ?? null;
}

async function authorBySlug(env: Env, slug: string): Promise<Record<string, unknown> | null> {
	const query = `query AuthorBySlug($slug: String!) {
		authors(where: { slug: { _eq: $slug } }, limit: 1) {
			id
			slug
			name
			bio
			image {
				url
			}
		}
	}`;

	const payload = await queryHardcover<{ authors?: unknown[] }>(
		env,
		query,
		{ slug },
		`AuthorBySlug:${slug}`
	);
	return payload?.authors?.find(isRecord) ?? null;
}

async function seriesBySlug(env: Env, slug: string): Promise<Record<string, unknown> | null> {
	const query = `query SeriesBySlug($slug: String!) {
		series(where: { slug: { _eq: $slug } }, limit: 1) {
			id
			slug
			name
			description
			books_count
			book_series(
				where: { book: { state: { _eq: "normalized" } } }
				order_by: { position: asc }
			) {
				position
				details
				book {
					id
					slug
					title
					state
					default_cover_edition {
						image {
							url
						}
					}
				}
			}
		}
	}`;

	const payload = await queryHardcover<{ series?: unknown[] }>(
		env,
		query,
		{ slug },
		`SeriesBySlug:${slug}`
	);
	return payload?.series?.find(isRecord) ?? null;
}

export async function fetchHardcoverBook(
	env: Env,
	slug: string
): Promise<HardcoverBookMetadata | null> {
	const result = (await bookBySlug(env, slug)) ?? (await searchHardcover(env, 'Book', slug));
	if (!result) return null;

	const title = stringValue(result.title);
	if (!title) return null;

	const resultSlug = stringValue(result.slug) ?? slug;
	const authorText = Array.isArray(result.author_names)
		? result.author_names.map(stringValue).filter(Boolean).join(', ')
		: stringValue(result.author_names);
	const contributionAuthors = Array.isArray(result.contributions)
		? result.contributions
				.map((contribution) =>
					isRecord(contribution) && isRecord(contribution.author)
						? stringValue(contribution.author.name)
						: undefined
				)
				.filter(Boolean)
				.join(', ')
		: undefined;
	const defaultCoverEdition = isRecord(result.default_cover_edition)
		? result.default_cover_edition
		: undefined;

	return {
		hardcoverId: stringValue(result.id) ?? numberValue(result.id)?.toString(),
		slug: resultSlug,
		title,
		subtitle: stringValue(result.subtitle),
		authorText: authorText || contributionAuthors || undefined,
		coverUrl: imageUrl(result.image) ?? imageUrl(defaultCoverEdition?.image),
		isbn13: firstString(result.isbns),
		description: descriptionText(result.description),
		firstPublishYear: numberValue(result.release_year),
		hardcoverUrl: hardcoverUrl('books', resultSlug),
		raw: result
	};
}

export async function fetchHardcoverAuthor(
	env: Env,
	slug: string
): Promise<HardcoverAuthorMetadata | null> {
	const result = (await authorBySlug(env, slug)) ?? (await searchHardcover(env, 'Author', slug));
	if (!result) return null;

	const name = stringValue(result.name) ?? stringValue(result.name_personal);
	if (!name) return null;

	const resultSlug = stringValue(result.slug) ?? slug;
	return {
		hardcoverId: stringValue(result.id) ?? numberValue(result.id)?.toString(),
		slug: resultSlug,
		name,
		bio: descriptionText(result.bio),
		photoUrl: imageUrl(result.image),
		hardcoverUrl: hardcoverUrl('authors', resultSlug),
		raw: result
	};
}

export async function fetchHardcoverSeries(
	env: Env,
	slug: string
): Promise<HardcoverSeriesMetadata | null> {
	const result = (await seriesBySlug(env, slug)) ?? (await searchHardcover(env, 'Series', slug));
	if (!result) return null;

	const title = stringValue(result.name);
	if (!title) return null;

	const resultSlug = stringValue(result.slug) ?? slug;
	const author = isRecord(result.author) ? stringValue(result.author.name) : undefined;
	const books = Array.isArray(result.books) ? result.books.filter(isRecord) : [];
	const seriesBooks = Array.isArray(result.book_series)
		? result.book_series
				.filter(isRecord)
				.filter(
					(seriesBook) =>
						!isRecord(seriesBook.book) || stringValue(seriesBook.book.state) === 'normalized'
				)
				.sort((a, b) => {
					const aPosition = numericValue(a.position) ?? numericValue(a.details) ?? Number.MAX_SAFE_INTEGER;
					const bPosition = numericValue(b.position) ?? numericValue(b.details) ?? Number.MAX_SAFE_INTEGER;
					return aPosition - bPosition;
				})
		: [];
	const firstSeriesBook = seriesBooks.find(
		(seriesBook) =>
			isRecord(seriesBook.book) &&
			isRecord(seriesBook.book.default_cover_edition) &&
			imageUrl(seriesBook.book.default_cover_edition.image)
	);
	const firstSeriesBookCover =
		firstSeriesBook && isRecord(firstSeriesBook.book)
			? imageUrl(
					isRecord(firstSeriesBook.book.default_cover_edition)
						? firstSeriesBook.book.default_cover_edition.image
						: undefined
				)
			: undefined;

	return {
		hardcoverId: stringValue(result.id) ?? numberValue(result.id)?.toString(),
		slug: resultSlug,
		title,
		authorText: stringValue(result.author_name) ?? author,
		description: descriptionText(result.description),
		coverUrl: imageUrl(result.image) ?? firstSeriesBookCover ?? imageUrl(books[0]?.image),
		bookCount: numberValue(result.books_count) ?? numberValue(result.primary_books_count),
		hardcoverUrl: hardcoverUrl('series', resultSlug),
		raw: result
	};
}
