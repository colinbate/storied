import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { parse } from 'svelte/compiler';

function svelteFiles(directory) {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) return svelteFiles(path);
		return entry.isFile() && entry.name.endsWith('.svelte') ? [path] : [];
	});
}

function walk(node, visit) {
	if (!node || typeof node !== 'object') return;
	visit(node);
	for (const value of Object.values(node)) {
		if (Array.isArray(value)) {
			for (const child of value) walk(child, visit);
		} else {
			walk(value, visit);
		}
	}
}

test('POST page-action forms use progressive enhancement', () => {
	const missingEnhancement = [];

	for (const file of svelteFiles('src')) {
		const source = readFileSync(file, 'utf8');
		const ast = parse(source, { filename: file, modern: true });

		walk(ast.fragment, (node) => {
			if (node.type !== 'RegularElement' || node.name !== 'form') return;

			const method = node.attributes.find(
				(attribute) => attribute.type === 'Attribute' && attribute.name === 'method'
			);
			const methodSource = method ? source.slice(method.start, method.end) : '';
			if (!/POST/i.test(methodSource)) return;

			const action = node.attributes.find(
				(attribute) => attribute.type === 'Attribute' && attribute.name === 'action'
			);
			const actionSource = action ? source.slice(action.start, action.end) : '';
			if (actionSource.includes('/auth/logout')) return;

			const enhanced = node.attributes.some(
				(attribute) =>
					attribute.type === 'UseDirective' &&
					(attribute.name === 'enhance' || attribute.name === 'svelteEnhance')
			);
			if (!enhanced) {
				const line = source.slice(0, node.start).split('\n').length;
				missingEnhancement.push(`${file}:${line}`);
			}
		});
	}

	assert.deepEqual(missingEnhancement, []);
});
