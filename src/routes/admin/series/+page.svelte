<script lang="ts">
	import { pageTitle } from '$shared/brand';
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { tick } from 'svelte';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import LibraryIcon from '@lucide/svelte/icons/library';
	import CheckCircle2Icon from '@lucide/svelte/icons/check-circle-2';
	import CircleDashedIcon from '@lucide/svelte/icons/circle-dashed';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import LinkIcon from '@lucide/svelte/icons/link';
	import SearchIcon from '@lucide/svelte/icons/search';
	import UnmatchedSources from '$lib/components/admin/unmatched-sources.svelte';
	import { toast } from 'svelte-sonner';

	let { data } = $props();
	let creating = $state(false);
	let queueing = $state(false);
	let showManualForm = $state(false);
	let showUrlForm = $state(false);
	let isComplete = $state(false);
	let filter = $state('');
	let manualTitleInput = $state<HTMLInputElement | null>(null);
	let urlInput = $state<HTMLInputElement | null>(null);

	const filteredSeries = $derived.by(() => {
		const q = filter.trim().toLowerCase();
		if (!q) return data.series;
		return data.series.filter((s) => {
			return (
				s.title.toLowerCase().includes(q) ||
				(s.authorText ?? '').toLowerCase().includes(q) ||
				s.slug.toLowerCase().includes(q)
			);
		});
	});

	async function toggleUrlForm() {
		showUrlForm = !showUrlForm;
		if (showUrlForm) {
			showManualForm = false;
			await tick();
			urlInput?.focus();
		}
	}

	async function toggleManualForm() {
		showManualForm = !showManualForm;
		if (showManualForm) {
			showUrlForm = false;
			await tick();
			manualTitleInput?.focus();
		}
	}
</script>

<svelte:head>
	<title>{pageTitle('Series — Admin')}</title>
</svelte:head>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<h1 class="text-2xl font-bold">Series</h1>
		<div class="flex items-center gap-2">
			<Button variant="outline" size="sm" onclick={toggleUrlForm}>
				<LinkIcon class="h-4 w-4" />
				From URL
			</Button>
			<Button size="sm" onclick={toggleManualForm}>
				<PlusIcon class="h-4 w-4" />
				New Series
			</Button>
		</div>
	</div>

	{#if showUrlForm}
		<Card.Root>
			<Card.Header>
				<Card.Title class="text-base">Add Series from URL</Card.Title>
				<Card.Description>
					Paste a Hardcover or Goodreads series URL. It'll be queued for resolution by the worker.
				</Card.Description>
			</Card.Header>
			<Card.Content>
				<form
					method="POST"
					action="?/createFromUrl"
					use:enhance={() => {
						queueing = true;
						return async ({ result, update }) => {
							queueing = false;
							await update();
							if (result.type === 'success') {
								if (result.data?.queued) {
									toast.success('URL queued for resolution.');
									showUrlForm = false;
								}
								if (result.data?.error) toast.error(String(result.data.error));
							} else if (result.type === 'failure') {
								toast.error(String(result.data?.error ?? 'Something went wrong.'));
							}
						};
					}}
					class="flex flex-col gap-3 sm:flex-row sm:items-end"
				>
					<div class="flex-1 space-y-2">
						<Label for="url-input">Series URL</Label>
						<Input
							id="url-input"
							name="url"
							type="url"
							placeholder="https://hardcover.app/series/..."
							bind:ref={urlInput}
							required
						/>
					</div>
					<Button type="submit" disabled={queueing}>
						{queueing ? 'Queueing…' : 'Queue'}
					</Button>
				</form>
			</Card.Content>
		</Card.Root>
	{/if}

	{#if showManualForm}
		<Card.Root>
			<Card.Header>
				<Card.Title class="text-base">Add Series Manually</Card.Title>
				<Card.Description>
					Fill in what you know. Slug auto-generates from title if left blank.
				</Card.Description>
			</Card.Header>
			<Card.Content>
				<form
					method="POST"
					action="?/createManual"
					use:enhance={() => {
						creating = true;
						return async ({ result, update }) => {
							creating = false;
							if (result.type === 'redirect') {
								toast.success('Series created.');
							} else if (result.type === 'failure') {
								toast.error(String(result.data?.error ?? 'Something went wrong.'));
							}
							await update();
						};
					}}
					class="space-y-4"
				>
					<div class="grid gap-4 sm:grid-cols-2">
						<div class="space-y-2 sm:col-span-2">
							<Label for="title">Title</Label>
							<Input id="title" name="title" bind:ref={manualTitleInput} required />
						</div>
						<div class="space-y-2">
							<Label for="authorText">Author</Label>
							<Input id="authorText" name="authorText" />
						</div>
						<div class="space-y-2">
							<Label for="slug">Slug (optional)</Label>
							<Input id="slug" name="slug" placeholder="auto-generated" />
						</div>
						<div class="space-y-2 sm:col-span-2">
							<Label for="coverUrl">Cover URL</Label>
							<Input id="coverUrl" name="coverUrl" type="url" />
						</div>
						<div class="space-y-2">
							<Label for="bookCount">Book Count</Label>
							<Input id="bookCount" name="bookCount" type="number" min="0" />
						</div>
						<div class="space-y-2">
							<Label for="amazonAsin">Amazon ASIN</Label>
							<Input id="amazonAsin" name="amazonAsin" />
						</div>
						<div class="space-y-2 sm:col-span-2">
							<Label for="goodreadsUrl">Goodreads URL</Label>
							<Input id="goodreadsUrl" name="goodreadsUrl" type="url" />
						</div>
						<div class="space-y-2 sm:col-span-2">
							<Label for="hardcoverUrl">Hardcover URL</Label>
							<Input id="hardcoverUrl" name="hardcoverUrl" type="url" />
						</div>
						<div class="flex items-center gap-2">
							<input
								type="checkbox"
								id="create-isComplete"
								bind:checked={isComplete}
								class="h-4 w-4"
							/>
							<Label for="create-isComplete">Series is complete</Label>
							<input type="hidden" name="isComplete" value={isComplete ? '1' : '0'} />
						</div>
						<div class="space-y-2 sm:col-span-2">
							<Label for="description">Description</Label>
							<Textarea id="description" name="description" rows={4} />
						</div>
					</div>
					<div class="flex items-center gap-2">
						<Button type="submit" disabled={creating}>
							{creating ? 'Creating…' : 'Create Series'}
						</Button>
						<Button
							type="button"
							variant="ghost"
							onclick={() => {
								showManualForm = false;
							}}
						>
							Cancel
						</Button>
					</div>
				</form>
			</Card.Content>
		</Card.Root>
	{/if}

	<UnmatchedSources sources={data.unresolvedSources} subjectLabel="series" />

	<Card.Root>
		<Card.Header>
			<div class="flex items-center justify-between gap-2">
				<div class="flex items-center gap-2">
					<LibraryIcon class="h-5 w-5 text-primary" />
					<Card.Title class="text-base">
						All Series ({filteredSeries.length} / {data.series.length})
					</Card.Title>
				</div>
				<div class="relative w-64 max-w-full">
					<SearchIcon
						class="pointer-events-none absolute top-1/2 left-2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
					/>
					<Input type="search" placeholder="Filter series..." class="pl-8" bind:value={filter} />
				</div>
			</div>
		</Card.Header>
		<Card.Content class="p-0">
			<div class="divide-y">
				{#each filteredSeries as s (s.id)}
					<a
						href={resolve('/admin/series/[slug]', { slug: s.slug })}
						class="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-muted/50 {s.deletedAt
							? 'opacity-60'
							: ''}"
					>
						{#if s.coverUrl}
							<img
								src={s.coverUrl}
								alt="Cover of {s.title}"
								class="h-12 w-8 shrink-0 rounded object-cover"
							/>
						{:else}
							<div class="flex h-12 w-8 shrink-0 items-center justify-center rounded bg-muted">
								<LibraryIcon class="h-4 w-4 text-muted-foreground" />
							</div>
						{/if}
						<div class="min-w-0 flex-1">
							<p class="leading-tight font-medium {s.deletedAt ? 'line-through' : ''}">
								{s.title}
								{#if s.deletedAt}
									<Badge variant="outline" class="ml-2">deleted</Badge>
								{/if}
							</p>
							{#if s.authorText}
								<p class="text-sm text-muted-foreground">{s.authorText}</p>
							{/if}
						</div>
						<div class="flex shrink-0 flex-col items-end gap-0.5">
							{#if s.bookCount != null}
								<span class="text-xs text-muted-foreground">
									{s.bookCount} book{s.bookCount === 1 ? '' : 's'}
								</span>
							{/if}
							{#if s.isComplete != null}
								<span class="inline-flex items-center gap-1 text-xs text-muted-foreground">
									{#if s.isComplete}
										<CheckCircle2Icon class="h-3 w-3" />
										Complete
									{:else}
										<CircleDashedIcon class="h-3 w-3" />
										Ongoing
									{/if}
								</span>
							{/if}
						</div>
					</a>
				{:else}
					<div class="py-12 text-center text-muted-foreground">
						<p>No series match your filter.</p>
					</div>
				{/each}
			</div>
		</Card.Content>
	</Card.Root>
</div>
