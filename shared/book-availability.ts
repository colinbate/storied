export const BOOK_ACCESS_FORMAT_LABELS = {
	print: 'Print',
	ebook: 'Ebook',
	audiobook: 'Audiobook',
	other: 'Other format'
} as const;

export type BookAccessFormat = keyof typeof BOOK_ACCESS_FORMAT_LABELS;

export const BOOK_ACCESS_FORMATS = Object.keys(BOOK_ACCESS_FORMAT_LABELS) as BookAccessFormat[];

/** Read both existing single formats and grouped formats from the same column. */
export function parseBookAccessFormats(value: string) {
	const selected = value.split(',').map((format) => format.trim());
	return BOOK_ACCESS_FORMATS.filter((format) => selected.includes(format));
}
