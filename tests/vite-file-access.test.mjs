import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import test from 'node:test';
import { isFileServingAllowed, resolveConfig } from 'vite';

test('Vite serves shared lazy imports while retaining SvelteKit source access and filesystem restrictions', async () => {
	// Resolve the actual plugin-composed configuration without starting a dev server.
	const config = await resolveConfig({ logLevel: 'silent' }, 'serve');
	assert.equal(isFileServingAllowed(config, resolve('shared/emoji-data.ts')), true);
	assert.equal(
		isFileServingAllowed(config, resolve('src/lib/components/post-reactions.svelte')),
		true
	);
	assert.equal(config.server.fs.strict, true);
	assert.equal(isFileServingAllowed(config, resolve('.dev.vars')), false);
	assert.equal(isFileServingAllowed(config, resolve('config-tone.txt')), false);
	assert.equal(isFileServingAllowed(config, resolve('../outside-project.ts')), false);
});
