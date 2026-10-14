export type PickerItem = {
	id: string;
	title: string;
	authorText?: string | null;
};

type SearchEntry<T> = {
	item: T;
	title: string;
	author: string;
	text: string;
};

export const PICKER_RESULT_LIMIT = 50;

function normalize(text: string): string {
	return text
		.normalize('NFKD')
		.replace(/\p{M}/gu, '')
		.toLowerCase()
		.replace(/[^\p{L}\p{N}]+/gu, ' ')
		.trim();
}

// Build once per library update, rather than normalizing and sorting on every keystroke.
export function createPickerSearchIndex<T extends PickerItem>(
	items: readonly T[]
): SearchEntry<T>[] {
	const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
	return items
		.map((item) => {
			const title = normalize(item.title);
			const author = normalize(item.authorText ?? '');
			return { item, title, author, text: `${title} ${author}` };
		})
		.sort(
			(a, b) =>
				collator.compare(a.title, b.title) ||
				collator.compare(a.author, b.author) ||
				collator.compare(a.item.id, b.item.id)
		);
}

export function searchPickerItems<T>(index: readonly SearchEntry<T>[], query: string) {
	const search = normalize(query);
	if (!search) {
		return {
			items: index.slice(0, PICKER_RESULT_LIMIT).map((entry) => entry.item),
			total: index.length
		};
	}

	const tokens = search.split(' ');
	const buckets: T[][] = Array.from({ length: 6 }, () => []);
	let total = 0;
	for (const entry of index) {
		let rank: number;
		if (entry.title === search) rank = 0;
		else if (entry.title.startsWith(search)) rank = 1;
		else if (entry.title.includes(` ${search}`)) rank = 2;
		else if (entry.title.includes(search)) rank = 3;
		else if (tokens.every((token) => entry.title.includes(token))) rank = 4;
		else if (tokens.every((token) => entry.text.includes(token))) rank = 5;
		else continue;

		total++;
		// Keep bounded buckets so broad searches do not allocate or sort the whole library.
		if (buckets[rank].length < PICKER_RESULT_LIMIT) buckets[rank].push(entry.item);
	}

	return { items: buckets.flat().slice(0, PICKER_RESULT_LIMIT), total };
}
