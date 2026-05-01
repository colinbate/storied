<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { tick } from 'svelte';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import AlertTriangleIcon from '@lucide/svelte/icons/alert-triangle';
	import EyeOffIcon from '@lucide/svelte/icons/eye-off';
	import LinkIcon from '@lucide/svelte/icons/link';
	import PenLineIcon from '@lucide/svelte/icons/pen-line';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';
	import SearchIcon from '@lucide/svelte/icons/search';
	import UserIcon from '@lucide/svelte/icons/user';
	import { toast } from 'svelte-sonner';

	let { data } = $props();
	let loadingId = $state<string | null>(null);
	let creating = $state(false);
	let queueing = $state(false);
	let showManualForm = $state(false);
	let showUrlForm = $state(false);
	let filter = $state('');
	let manualNameInput = $state<HTMLInputElement | null>(null);
	let urlInput = $state<HTMLInputElement | null>(null);

	const filteredAuthors = $derived.by(() => {
		const q = filter.trim().toLowerCase();
		if (!q) return data.authors;
		return data.authors.filter(
			(author) =>
				author.name.toLowerCase().includes(q) ||
				(author.goodreadsUrl ?? '').toLowerCase().includes(q) ||
				author.slug.toLowerCase().includes(q)
		);
	});

	function statusVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
		if (status === 'resolved') return 'default';
		if (status === 'pending') return 'secondary';
		if (status === 'failed') return 'destructive';
		return 'outline';
	}

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
			manualNameInput?.focus();
		}
	}
</script>

<svelte:head>
	<title>Authors — Admin — The Archive</title>
</svelte:head>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<h1 class="text-2xl font-bold">Authors</h1>
		<div class="flex items-center gap-2">
			<Button variant="outline" size="sm" onclick={toggleUrlForm}>
				<LinkIcon class="h-4 w-4" />
				From URL
			</Button>
			<Button size="sm" onclick={toggleManualForm}>
				<PlusIcon class="h-4 w-4" />
				New Author
			</Button>
		</div>
	</div>

	{#if showUrlForm}
		<Card.Root>
			<Card.Header>
				<Card.Title class="text-base">Add Author from URL</Card.Title>
				<Card.Description>
					Paste a Goodreads author URL. It'll be queued for resolution by the worker.
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
							if (result.type === 'success' && result.data?.queued) {
								toast.success('URL queued for resolution.');
								showUrlForm = false;
							} else if (result.type === 'failure') {
								toast.error(String(result.data?.error ?? 'Something went wrong.'));
							}
						};
					}}
					class="flex flex-col gap-3 sm:flex-row sm:items-end"
				>
					<div class="flex-1 space-y-2">
						<Label for="url-input">Goodreads Author URL</Label>
						<Input
							id="url-input"
							name="url"
							type="url"
							placeholder="https://www.goodreads.com/author/show/..."
							bind:ref={urlInput}
							required
						/>
					</div>
					<Button type="submit" disabled={queueing}>{queueing ? 'Queueing...' : 'Queue'}</Button>
				</form>
			</Card.Content>
		</Card.Root>
	{/if}

	{#if showManualForm}
		<Card.Root>
			<Card.Header>
				<Card.Title class="text-base">Add Author Manually</Card.Title>
				<Card.Description>Fill in what you know. Slug auto-generates from name.</Card.Description>
			</Card.Header>
			<Card.Content>
				<form
					method="POST"
					action="?/createManual"
					use:enhance={() => {
						creating = true;
						return async ({ result, update }) => {
							creating = false;
							if (result.type === 'redirect') toast.success('Author created.');
							if (result.type === 'failure') {
								toast.error(String(result.data?.error ?? 'Something went wrong.'));
							}
							await update();
						};
					}}
					class="space-y-4"
				>
					<div class="grid gap-4 sm:grid-cols-2">
						<div class="space-y-2 sm:col-span-2">
							<Label for="name">Name</Label>
							<Input id="name" name="name" bind:ref={manualNameInput} required />
						</div>
						<div class="space-y-2 sm:col-span-2">
							<Label for="slug">Slug (optional)</Label>
							<Input id="slug" name="slug" placeholder="auto-generated from name" />
						</div>
						<div class="space-y-2">
							<Label for="photoUrl">Photo URL</Label>
							<Input id="photoUrl" name="photoUrl" type="url" />
						</div>
						<div class="space-y-2">
							<Label for="websiteUrl">Website URL</Label>
							<Input id="websiteUrl" name="websiteUrl" type="url" />
						</div>
						<div class="space-y-2">
							<Label for="goodreadsUrl">Goodreads URL</Label>
							<Input id="goodreadsUrl" name="goodreadsUrl" type="url" />
						</div>
						<div class="space-y-2">
							<Label for="openLibraryId">Open Library ID</Label>
							<Input id="openLibraryId" name="openLibraryId" />
						</div>
						<div class="space-y-2 sm:col-span-2">
							<Label for="bio">Bio</Label>
							<Textarea id="bio" name="bio" rows={4} />
						</div>
					</div>
					<div class="flex items-center gap-2">
						<Button type="submit" disabled={creating}>
							{creating ? 'Creating...' : 'Create Author'}
						</Button>
						<Button type="button" variant="ghost" onclick={() => (showManualForm = false)}>
							Cancel
						</Button>
					</div>
				</form>
			</Card.Content>
		</Card.Root>
	{/if}

	{#if data.unresolvedSources.length > 0}
		<Card.Root>
			<Card.Header>
				<div class="flex items-center gap-2">
					<AlertTriangleIcon class="h-5 w-5 text-amber-500" />
					<Card.Title class="text-base">Unmatched Sources</Card.Title>
				</div>
				<Card.Description>
					These author sources haven't been matched to a canonical author yet.
				</Card.Description>
			</Card.Header>
			<Card.Content class="p-0">
				<div class="divide-y">
					{#each data.unresolvedSources as source (source.id)}
						<div class="flex items-center justify-between gap-4 px-4 py-3">
							<div class="min-w-0 flex-1">
								<div class="flex items-center gap-2">
									<Badge variant={statusVariant(source.fetchStatus)}>{source.fetchStatus}</Badge>
									<Badge variant="outline">{source.sourceType}</Badge>
								</div>
								<p class="mt-1 truncate text-sm text-muted-foreground">{source.sourceUrl}</p>
								<p class="font-mono text-xs text-muted-foreground/60">Key: {source.sourceKey}</p>
							</div>
							<div class="flex shrink-0 items-center gap-1">
								<form
									method="POST"
									action="?/retrySource"
									use:enhance={() => {
										loadingId = source.id;
										return async ({ result, update }) => {
											loadingId = null;
											if (result.type === 'success') toast.success('Source queued for retry.');
											if (result.type === 'failure')
												toast.error(String(result.data?.error ?? 'Something went wrong.'));
											await update();
										};
									}}
								>
									<input type="hidden" name="sourceId" value={source.id} />
									<Button
										type="submit"
										variant="outline"
										size="sm"
										disabled={loadingId === source.id}
									>
										<RefreshCwIcon class="h-4 w-4" />
										Retry
									</Button>
								</form>
								<form
									method="POST"
									action="?/ignoreSource"
									use:enhance={() => {
										loadingId = source.id;
										return async ({ result, update }) => {
											loadingId = null;
											if (result.type === 'success') toast.success('Source marked as ignored.');
											if (result.type === 'failure')
												toast.error(String(result.data?.error ?? 'Something went wrong.'));
											await update();
										};
									}}
								>
									<input type="hidden" name="sourceId" value={source.id} />
									<Button
										type="submit"
										variant="ghost"
										size="sm"
										disabled={loadingId === source.id}
									>
										<EyeOffIcon class="h-4 w-4" />
										Ignore
									</Button>
								</form>
							</div>
						</div>
					{/each}
				</div>
			</Card.Content>
		</Card.Root>
	{/if}

	<Card.Root>
		<Card.Header>
			<div class="flex items-center justify-between gap-2">
				<div class="flex items-center gap-2">
					<PenLineIcon class="h-5 w-5 text-primary" />
					<Card.Title class="text-base">
						All Authors ({filteredAuthors.length} / {data.authors.length})
					</Card.Title>
				</div>
				<div class="relative w-64 max-w-full">
					<SearchIcon
						class="pointer-events-none absolute top-1/2 left-2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
					/>
					<Input type="search" placeholder="Filter authors..." class="pl-8" bind:value={filter} />
				</div>
			</div>
		</Card.Header>
		<Card.Content class="p-0">
			<div class="divide-y">
				{#each filteredAuthors as author (author.id)}
					<a
						href={resolve('/admin/authors/[slug]', { slug: author.slug })}
						class="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-muted/50 {author.deletedAt
							? 'opacity-60'
							: ''}"
					>
						{#if author.photoUrl}
							<img
								src={author.photoUrl}
								alt={author.name}
								class="h-12 w-12 shrink-0 rounded object-cover"
							/>
						{:else}
							<div class="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-muted">
								<UserIcon class="h-4 w-4 text-muted-foreground" />
							</div>
						{/if}
						<div class="min-w-0 flex-1">
							<p class="leading-tight font-medium {author.deletedAt ? 'line-through' : ''}">
								{author.name}
								{#if author.deletedAt}
									<Badge variant="outline" class="ml-2">deleted</Badge>
								{/if}
							</p>
							{#if author.goodreadsUrl}
								<p class="truncate text-sm text-muted-foreground">{author.goodreadsUrl}</p>
							{/if}
						</div>
					</a>
				{:else}
					<div class="py-12 text-center text-muted-foreground">
						<p>No authors match your filter.</p>
					</div>
				{/each}
			</div>
		</Card.Content>
	</Card.Root>
</div>
