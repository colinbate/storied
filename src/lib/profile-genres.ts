export const PROFILE_GENRE_LIMIT = 5;
const PROFILE_GENRE_SEPARATOR = ' | ';

function normalizeGenreName(value: string) {
	return value.trim().replace(/\s+/g, ' ');
}

export function parseProfileGenres(value: string | null | undefined): string[] {
	if (!value) return [];

	return value
		.split('|')
		.map((part) => normalizeGenreName(part))
		.filter(Boolean)
		.filter(
			(genre, index, items) =>
				items.findIndex((item) => item.toLowerCase() === genre.toLowerCase()) === index
		)
		.slice(0, PROFILE_GENRE_LIMIT);
}

export function serializeProfileGenres(genres: string[]): string | null {
	const normalized = genres
		.map((genre) => normalizeGenreName(genre))
		.filter(Boolean)
		.filter(
			(genre, index, items) =>
				items.findIndex((item) => item.toLowerCase() === genre.toLowerCase()) === index
		)
		.slice(0, PROFILE_GENRE_LIMIT);

	return normalized.length > 0 ? normalized.join(PROFILE_GENRE_SEPARATOR) : null;
}
