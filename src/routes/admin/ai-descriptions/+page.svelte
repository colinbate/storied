<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import BookOpenIcon from '@lucide/svelte/icons/book-open';
	import CheckIcon from '@lucide/svelte/icons/check';
	import ClipboardIcon from '@lucide/svelte/icons/clipboard';
	import LibraryIcon from '@lucide/svelte/icons/library';
	import SparklesIcon from '@lucide/svelte/icons/sparkles';
	import { toast } from 'svelte-sonner';

	let { data } = $props();

	let responseText = $state('');
	let saving = $state(false);

	const candidates = $derived([
		...data.books.map((book) => ({ ...book, type: 'book' as const })),
		...data.series.map((item) => ({ ...item, type: 'series' as const }))
	]);

	const prompt =
		$derived(`Write short, spoiler-free, one-paragraph descriptions for these books and series.

Rules:
- Return only valid JSON. Do not wrap it in Markdown.
- Return a JSON array. Each object must have exactly these keys: "type", "id", "description".
- Ensure your JSON uses straight quotes (") not curly quotes (“)
- Keep each description between ${data.minDescriptionLength} and ${data.maxDescriptionLength} characters.
- Make each description useful for readers deciding whether to discuss or read the work.
- Avoid spoilers, twist reveals, ending details, and invented publication facts.
- Preserve every identifier exactly as provided.
- If you are not confident about a title, omit that item.

Items:
${candidates
	.map((item) =>
		JSON.stringify({
			type: item.type,
			id: item.id,
			title: item.title,
			author: item.authorText ?? null
		})
	)
	.join('\n')}
`);

	async function copyPrompt() {
		await navigator.clipboard.writeText(prompt);
		toast.success('Prompt copied.');
	}
</script>

<svelte:head>
	<title>AI Descriptions — Admin — The Archive</title>
</svelte:head>

<div class="space-y-6">
	<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
		<div>
			<h1 class="text-2xl font-bold">AI Descriptions</h1>
			<p class="text-sm text-muted-foreground">
				{candidates.length} items have descriptions under {data.minDescriptionLength} characters.
			</p>
		</div>
		<Button type="button" variant="outline" onclick={copyPrompt} disabled={candidates.length === 0}>
			<ClipboardIcon class="h-4 w-4" />
			Copy Prompt
		</Button>
	</div>

	<Card.Root>
		<Card.Header>
			<div class="flex items-center gap-2">
				<SparklesIcon class="h-5 w-5 text-primary" />
				<Card.Title class="text-base">Prompt</Card.Title>
			</div>
			<Card.Description>
				Use this with an AI assistant, then paste the returned JSON below.
			</Card.Description>
		</Card.Header>
		<Card.Content>
			<Textarea readonly value={prompt} rows={16} class="font-mono text-xs" />
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title class="text-base">Save Descriptions</Card.Title>
			<Card.Description>
				Descriptions are matched by type and identifier, then saved to the matching record.
			</Card.Description>
		</Card.Header>
		<Card.Content>
			<form
				method="POST"
				action="?/saveDescriptions"
				use:enhance={() => {
					saving = true;
					return async ({ result, update }) => {
						saving = false;
						if (result.type === 'success') {
							const saved = Number(result.data?.saved ?? 0);
							const missing = Array.isArray(result.data?.missing) ? result.data.missing.length : 0;
							toast.success(
								missing > 0
									? `Saved ${saved} descriptions; ${missing} entries were skipped.`
									: `Saved ${saved} descriptions.`
							);
							responseText = '';
						} else if (result.type === 'failure') {
							toast.error(String(result.data?.error ?? 'Something went wrong.'));
						}
						await update();
					};
				}}
				class="space-y-4"
			>
				<div class="space-y-2">
					<Label for="descriptions">AI response</Label>
					<Textarea
						id="descriptions"
						name="descriptions"
						rows={12}
						class="font-mono text-xs"
						bind:value={responseText}
						placeholder={`[{"type":"book","id":"...","description":"..."}]`}
					/>
				</div>
				<Button type="submit" disabled={saving || !responseText.trim()}>
					<CheckIcon class="h-4 w-4" />
					{saving ? 'Saving...' : 'Save Descriptions'}
				</Button>
			</form>
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title class="text-base">Items Needing Descriptions</Card.Title>
		</Card.Header>
		<Card.Content class="p-0">
			<div class="divide-y">
				{#each candidates as item (item.type + item.id)}
					<a
						href={resolve(item.type === 'book' ? '/admin/books/[slug]' : '/admin/series/[slug]', {
							slug: item.slug
						})}
						class="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-muted/50"
					>
						<div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted">
							{#if item.type === 'book'}
								<BookOpenIcon class="h-4 w-4 text-muted-foreground" />
							{:else}
								<LibraryIcon class="h-4 w-4 text-muted-foreground" />
							{/if}
						</div>
						<div class="min-w-0 flex-1">
							<div class="flex items-center gap-2">
								<p class="truncate leading-tight font-medium">{item.title}</p>
								<Badge variant="outline">{item.type}</Badge>
							</div>
							<p class="truncate text-sm text-muted-foreground">
								{item.authorText ?? 'Unknown author'}
							</p>
							<p class="font-mono text-xs text-muted-foreground/70">{item.id}</p>
						</div>
						<Badge variant="secondary">
							{(item.description ?? '').trim().length}
						</Badge>
					</a>
				{:else}
					<div class="py-12 text-center text-muted-foreground">
						<p>All book and series descriptions meet the current length threshold.</p>
					</div>
				{/each}
			</div>
		</Card.Content>
	</Card.Root>
</div>
