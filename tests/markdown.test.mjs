import assert from 'node:assert/strict';
import test from 'node:test';

import { renderMarkdown } from '../src/lib/server/markdown.ts';
import { spoilerSafeExcerpt } from '../shared/spoilers.ts';

test('renders inline spoilers with Markdown content', () => {
	const html = renderMarkdown('The answer is ||**forty-two**||.');

	assert.match(html, /class="spoiler-inline"/);
	assert.match(html, /class="spoiler-inline-content"><strong>forty-two<\/strong>/);
	assert.doesNotMatch(html, /\|\|/);
});

test('renders titled spoiler blocks with nested Markdown', () => {
	const html = renderMarkdown(`Before.

:::spoiler Chapter 2
This has **weight**.

* First
* Second
:::

After.`);

	assert.match(html, /<details class="spoiler-block"><summary>Chapter 2<\/summary>/);
	assert.match(html, /<strong>weight<\/strong>/);
	assert.match(html, /<ul>[\s\S]*<li>First<\/li>[\s\S]*<li>Second<\/li>/);
	assert.match(html, /<p>After.<\/p>/);
});

test('uses a default spoiler block title and escapes custom titles', () => {
	assert.match(renderMarkdown(':::spoiler\nHidden.\n:::'), /<summary>Spoiler<\/summary>/);
	assert.match(
		renderMarkdown(':::spoiler <img src=x onerror=alert(1)>\nHidden.\n:::'),
		/<summary>&lt;img src=x onerror=alert\(1\)&gt;<\/summary>/
	);
});

test('keeps spoiler syntax working alongside member mentions', () => {
	const html = renderMarkdown('Hello @Ada and ||the **secret**||.', {
		mentionableUsers: [{ id: 'user_ada', email: 'ada@example.com', displayName: 'Ada' }]
	});

	assert.match(html, /class="mention-link"/);
	assert.match(html, /class="spoiler-inline"/);
});

test('redacts spoiler content from excerpts', () => {
	const source = `Safe opening. ||Inline secret||.

:::spoiler Final chapter
The ending is here.
:::`;

	assert.equal(spoilerSafeExcerpt(source), 'Safe opening. [spoiler]. [Spoiler: Final chapter]');
	assert.equal(
		spoilerSafeExcerpt(source, { containsSpoilers: true }),
		'Contains spoilers. Open it to reveal the content.'
	);
});
