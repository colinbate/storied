<script lang="ts">
	import { pageTitle } from '$shared/brand';
	import * as Card from '$lib/components/ui/card/index.js';
</script>

<svelte:head>
	<title>{pageTitle('Formatting Help')}</title>
</svelte:head>

<div class="mx-auto w-full max-w-3xl space-y-6">
	<div>
		<h1 class="text-2xl font-bold">Formatting Help</h1>
		<p class="mt-1 text-muted-foreground">
			Storied uses Markdown, a small set of punctuation patterns for formatting text.
		</p>
	</div>

	<Card.Root>
		<Card.Header>
			<Card.Title class="text-base">Spoilers</Card.Title>
			<Card.Description
				>Choose the smallest spoiler treatment that fits what you wrote.</Card.Description
			>
		</Card.Header>
		<Card.Content class="space-y-5">
			<section class="space-y-2">
				<h2 class="font-medium">Whole post</h2>
				<p class="text-sm text-muted-foreground">
					Use the spoiler checkbox below a discussion composer when the entire post or reply
					contains spoilers. Readers will see a warning before its text and image.
				</p>
			</section>

			<section class="space-y-2">
				<h2 class="font-medium">A few hidden words</h2>
				<p class="text-sm text-muted-foreground">
					Put two pipe characters on each side. Readers can select the concealed text to reveal it.
				</p>
				<pre class="overflow-x-auto rounded-md bg-muted p-3 text-sm"><code
						>The narrator is ||the missing heir||.</code
					></pre>
			</section>

			<section class="space-y-2">
				<h2 class="font-medium">A longer spoiler block</h2>
				<p class="text-sm text-muted-foreground">
					Start with <code>:::spoiler</code> and an optional title. Close the block with
					<code>:::</code> on its own line. Markdown still works inside the block.
				</p>
				<pre class="overflow-x-auto rounded-md bg-muted p-3 text-sm"><code
						>:::spoiler Chapter 2
The **letter** changes how the earlier scene reads.

1. The date matters.
2. The signature matters.
:::</code
					></pre>
			</section>
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title class="text-base">Markdown basics</Card.Title>
		</Card.Header>
		<Card.Content>
			<div class="overflow-x-auto">
				<table class="w-full text-left text-sm">
					<thead class="border-b">
						<tr>
							<th class="py-2 pr-4 font-medium">Write</th>
							<th class="py-2 font-medium">Result</th>
						</tr>
					</thead>
					<tbody class="divide-y">
						<tr
							><td class="py-2 pr-4 font-mono">**bold**</td><td class="py-2"
								><strong>bold</strong></td
							></tr
						>
						<tr
							><td class="py-2 pr-4 font-mono">*italic*</td><td class="py-2"><em>italic</em></td
							></tr
						>
						<tr
							><td class="py-2 pr-4 font-mono">~~struck~~</td><td class="py-2"><s>struck</s></td
							></tr
						>
						<tr
							><td class="py-2 pr-4 font-mono">[label](https://example.com)</td><td class="py-2"
								>a link</td
							></tr
						>
						<tr
							><td class="py-2 pr-4 font-mono">* item</td><td class="py-2">a bulleted list item</td
							></tr
						>
						<tr
							><td class="py-2 pr-4 font-mono">1. item</td><td class="py-2">a numbered list item</td
							></tr
						>
						<tr><td class="py-2 pr-4 font-mono">&gt; quote</td><td class="py-2">a quotation</td></tr
						>
						<tr
							><td class="py-2 pr-4 font-mono">`code`</td><td class="py-2"><code>code</code></td
							></tr
						>
					</tbody>
				</table>
			</div>
			<p class="mt-4 text-sm text-muted-foreground">
				Leave a blank line before and after a list, quotation, or spoiler block. Links to Hardcover
				and Goodreads books, series, and authors are also attached to discussion threads after
				posting.
			</p>
		</Card.Content>
	</Card.Root>
</div>
