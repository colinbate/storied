export const PROFILE_GENRE_LIMIT = 5;
const PROFILE_GENRE_SEPARATOR = '|';

export type GenreItem = { id: number; name: string };

export function normalizeGenreName(value: string) {
	return value.trim().replace(/\s+/g, ' ');
}

export function createCustomGenre(name: string): GenreItem {
	let hash = 0;
	for (let index = 0; index < name.length; index += 1) {
		hash = (hash * 31 + name.charCodeAt(index)) | 0;
	}

	return {
		id: -Math.abs(hash || 1),
		name
	};
}

export function parseProfileGenres(value: string | null | undefined): string[] {
	if (!value) return [];

	return value
		.split(PROFILE_GENRE_SEPARATOR)
		.map((part) => normalizeGenreName(part))
		.filter(Boolean)
		.filter(
			(genre, index, items) =>
				items.findIndex((item) => item.toLowerCase() === genre.toLowerCase()) === index
		)
		.slice(0, PROFILE_GENRE_LIMIT);
}

export function serializeProfileGenres(genres: GenreItem[] | string[]): string | null {
	const normalized = genres
		.map((genre) => normalizeGenreName(typeof genre === 'string' ? genre : genre.name))
		.filter(Boolean)
		.filter(
			(genre, index, items) =>
				items.findIndex((item) => item.toLowerCase() === genre.toLowerCase()) === index
		)
		.slice(0, PROFILE_GENRE_LIMIT);

	return normalized.length > 0 ? normalized.join(PROFILE_GENRE_SEPARATOR) : null;
}
