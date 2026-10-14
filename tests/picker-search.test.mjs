import assert from 'node:assert/strict';
import test from 'node:test';
import {
	createPickerSearchIndex,
	PICKER_RESULT_LIMIT,
	searchPickerItems
} from '../src/lib/picker-search.ts';

function search(items, query) {
	return searchPickerItems(createPickerSearchIndex(items), query);
}

test('picker search ranks exact titles, title prefixes and title matches above authors', () => {
	const items = [
		{ id: 'author', title: 'A Biography', authorText: 'Dune Writer' },
		{ id: 'substring', title: 'Sandune' },
		{ id: 'word', title: 'The Dune Collection' },
		{ id: 'prefix', title: 'Dune Messiah' },
		{ id: 'exact', title: 'Dune', authorText: 'Frank Herbert' }
	];
	assert.deepEqual(
		search(items, 'dune').items.map((item) => item.id),
		['exact', 'prefix', 'word', 'substring', 'author']
	);
});

test('picker search handles case, accents, punctuation and repeated whitespace', () => {
	const item = { id: '1', title: 'L’Étranger: A Story', authorText: 'Albert Camus' };
	assert.deepEqual(search([item], "  L'ETRANGER:   a story ").items, [item]);
	assert.deepEqual(search([item], 'camus').items, [item]);
	assert.deepEqual(search([item], '   ').items, [item]);
	assert.deepEqual(search([], 'story'), { items: [], total: 0 });
});

test('picker search supports multiple words across titles and authors without arbitrary fuzzy matches', () => {
	const items = [
		{ id: 'mixed', title: 'Dune', authorText: 'Frank Herbert' },
		{ id: 'title', title: 'Herbert and the Dune Chronicles' },
		{ id: 'unrelated', title: 'Distant Unending Night Echoes' }
	];
	assert.deepEqual(
		search(items, 'dune herbert').items.map((item) => item.id),
		['title', 'mixed']
	);
	assert.deepEqual(
		search(items, 'dune').items.map((item) => item.id),
		['mixed', 'title']
	);
	assert.deepEqual(search(items, 'missing'), { items: [], total: 0 });
});

test('duplicate titles remain separate items with deterministic ordering', () => {
	const items = [
		{ id: '3', title: 'Collected Stories', authorText: 'Zoe' },
		{ id: '2', title: 'Collected Stories', authorText: 'Amy' },
		{ id: '1', title: 'Collected Stories', authorText: 'Amy' }
	];
	assert.deepEqual(
		search(items, 'collected stories').items.map((item) => item.id),
		['1', '2', '3']
	);
	assert.deepEqual(
		items.map((item) => item.id),
		['3', '2', '1']
	);
});

test('large libraries have bounded results while searching and counting every matching entry', () => {
	const items = Array.from({ length: 20_000 }, (_, index) => ({
		id: String(index),
		title: `Dune story ${index}`,
		authorText: 'Frank Herbert'
	}));
	const exact = { id: 'exact', title: 'Dune' };
	const last = { id: 'last', title: 'Zoology of Arrakis' };
	const index = createPickerSearchIndex([...items, exact, last]);
	for (const query of ['', 'd', 'dune', 'herbert']) {
		const results = searchPickerItems(index, query);
		assert.equal(results.items.length, PICKER_RESULT_LIMIT);
		assert.equal(results.total, query === '' ? 20_002 : query === 'herbert' ? 20_000 : 20_001);
	}
	assert.equal(searchPickerItems(index, 'dune').items[0], exact);
	assert.deepEqual(searchPickerItems(index, 'zoology'), { items: [last], total: 1 });
});

test('rebuilding the index includes changed titles and newly added items', () => {
	const items = [{ id: '1', title: 'Old title' }];
	assert.equal(search(items, 'old').total, 1);
	items[0].title = 'New title';
	items.push({ id: '2', title: 'New volume' });
	assert.equal(search(items, 'old').total, 0);
	assert.equal(search(items, 'new').total, 2);
});
