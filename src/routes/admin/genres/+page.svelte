<script lang="ts">
	import { enhance } from '$app/forms';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import GenrePicker from '$lib/components/genre-picker.svelte';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import XIcon from '@lucide/svelte/icons/x';
	import CheckIcon from '@lucide/svelte/icons/check';
	import TagIcon from '@lucide/svelte/icons/tag';
	import { toast } from 'svelte-sonner';

	let { data } = $props();
	let loading = $state(false);
	let showCreateForm = $state(false);
	let editingId = $state<number | null>(null);

	// Form state for create
	let createParentId = $state<number | undefined>(undefined);
	let createIsSpeculative = $state(true);

	// Form state for edit (recreated per genre when editing starts)
	let editParentId = $state<number | undefined>(undefined);
	let editIsSpeculative = $state(true);

	// Build a map for parent name lookup
	const genreById = $derived(new Map(data.genres.map((g) => [g.id, g])));

	// Breadcrumb path for a genre (e.g. "Fantasy › Epic Fantasy › High Fantasy")
	function pathFor(id: number | null): string {
		if (id == null) return '';
		const chain: string[] = [];
		let cur: number | null = id;
		let guard = 0;
		while (cur != null && guard++ < 20) {
			const g = genreById.get(cur);
			if (!g) break;
			chain.unshift(g.name);
			cur = g.parentId;
		}
		return chain.join(' › ');
	}

	function startEdit(id: number) {
		const g = genreById.get(id);
		if (!g) return;
		editParentId = g.parentId ?? undefined;
		editIsSpeculative = !!g.isSpeculative;
		editingId = id;
	}
</script>

<svelte:head>
	<title>Genres — Admin — The Archive</title>
</svelte:head>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<h1 class="text-2xl font-bold">Genres</h1>
		<Button
			onclick={() => {
				createParentId = undefined;
				createIsSpeculative = true;
				showCreateForm = !showCreateForm;
			}}
			size="sm"
		>
			<PlusIcon class="h-4 w-4" />
			New Genre
		</Button>
	</div>

	{#if showCreateForm}
		<Card.Root>
			<Card.Header>
				<Card.Title class="text-base">Create a New Genre</Card.Title>
				<Card.Description
					>Genres can be nested. Leave parent empty for a top-level genre.</Card.Description
				>
			</Card.Header>
			<Card.Content>
				<form
					method="POST"
					action="?/create"
					use:enhance={() => {
						loading = true;
						return async ({ result, update }) => {
							loading = false;
							await update();
							if (result.type === 'success') {
								if (result.data?.created) {
									toast.success('Genre created.');
									showCreateForm = false;
								}
								if (result.data?.error) toast.error(String(result.data.error));
							}
						};
					}}
					class="space-y-4"
				>
					<div class="grid gap-4 sm:grid-cols-2">
						<div class="space-y-2">
							<Label for="create-name">Name</Label>
							<Input id="create-name" name="name" placeholder="e.g. Solarpunk" required />
						</div>
						<div class="space-y-2">
							<Label>Parent</Label>
							<GenrePicker
								genres={data.genres.map((g) => ({ id: g.id, name: pathFor(g.id) || g.name }))}
								bind:selectedId={createParentId}
								name="parentId"
								class="w-full"
								placeholder="No parent (top-level)"
							/>
						</div>
						<div class="space-y-2 sm:col-span-2">
							<Label for="create-description">Description</Label>
							<Textarea
								id="create-description"
								name="description"
								placeholder="Short explanation of what this genre covers."
								rows={3}
							/>
						</div>
						<div class="flex items-center gap-2">
							<input
								type="checkbox"
								id="create-speculative"
								bind:checked={createIsSpeculative}
								class="h-4 w-4"
							/>
							<Label for="create-speculative">Speculative fiction</Label>
							<input type="hidden" name="isSpeculative" value={createIsSpeculative ? '1' : '0'} />
						</div>
					</div>
					<div class="flex items-center gap-2">
						<Button type="submit" disabled={loading}>
							{loading ? 'Creating…' : 'Create Genre'}
						</Button>
						<Button
							type="button"
							variant="ghost"
							onclick={() => {
								showCreateForm = false;
							}}
						>
							Cancel
						</Button>
					</div>
				</form>
			</Card.Content>
		</Card.Root>
	{/if}

	<Card.Root>
		<Card.Header>
			<div class="flex items-center gap-2">
				<TagIcon class="h-5 w-5 text-primary" />
				<Card.Title class="text-base">All Genres ({data.genres.length})</Card.Title>
			</div>
		</Card.Header>
		<Card.Content class="p-0">
			<div class="divide-y">
				{#each data.genres as genre (genre.id)}
					{#if editingId === genre.id}
						<form
							method="POST"
							action="?/update"
							use:enhance={() => {
								loading = true;
								return async ({ result, update }) => {
									loading = false;
									await update({ reset: false });
									if (result.type === 'success') {
										if (result.data?.updated) {
											toast.success('Genre updated.');
											editingId = null;
										}
										if (result.data?.error) toast.error(String(result.data.error));
									}
								};
							}}
							class="space-y-3 px-4 py-3"
						>
							<input type="hidden" name="id" value={genre.id} />
							<div class="grid gap-3 sm:grid-cols-2">
								<div class="space-y-1">
									<Label for="edit-name-{genre.id}">Name</Label>
									<Input id="edit-name-{genre.id}" name="name" value={genre.name} required />
								</div>
								<div class="space-y-1">
									<Label>Parent</Label>
									<GenrePicker
										genres={data.genres
											.filter((g) => g.id !== genre.id)
											.map((g) => ({ id: g.id, name: pathFor(g.id) || g.name }))}
										bind:selectedId={editParentId}
										name="parentId"
										class="w-full"
										placeholder="No parent (top-level)"
									/>
								</div>
								<div class="space-y-1 sm:col-span-2">
									<Label for="edit-description-{genre.id}">Description</Label>
									<Textarea
										id="edit-description-{genre.id}"
										name="description"
										value={genre.description ?? ''}
										rows={3}
									/>
								</div>
								<div class="flex items-center gap-2">
									<input
										type="checkbox"
										id="edit-speculative-{genre.id}"
										bind:checked={editIsSpeculative}
										class="h-4 w-4"
									/>
									<Label for="edit-speculative-{genre.id}">Speculative fiction</Label>
									<input type="hidden" name="isSpeculative" value={editIsSpeculative ? '1' : '0'} />
								</div>
							</div>
							<div class="flex items-center gap-2">
								<Button type="submit" size="sm" disabled={loading}>
									<CheckIcon class="h-4 w-4" />
									Save
								</Button>
								<Button
									type="button"
									variant="ghost"
									size="sm"
									onclick={() => {
										editingId = null;
									}}
								>
									<XIcon class="h-4 w-4" />
									Cancel
								</Button>
							</div>
						</form>
					{:else}
						<div class="flex items-center justify-between px-4 py-3">
							<div class="min-w-0 flex-1">
								<div class="flex items-center gap-2">
									<span class="font-medium">{genre.name}</span>
									{#if !genre.isSpeculative}
										<Badge variant="outline">mainstream</Badge>
									{/if}
								</div>
								<div
									class="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-muted-foreground"
								>
									{#if genre.parentId != null}
										<span class="text-xs">{pathFor(genre.parentId)}</span>
									{:else}
										<span class="text-xs italic">top-level</span>
									{/if}
									<span class="font-mono text-xs text-muted-foreground/60">{genre.slug}</span>
								</div>
								{#if genre.description}
									<p class="mt-1 line-clamp-2 text-sm text-muted-foreground">
										{genre.description}
									</p>
								{/if}
							</div>
							<Button variant="ghost" size="icon-sm" onclick={() => startEdit(genre.id)}>
								<PencilIcon class="h-4 w-4" />
							</Button>
						</div>
					{/if}
				{:else}
					<div class="py-12 text-center text-muted-foreground">
						<p>No genres yet. Create one to get started.</p>
					</div>
				{/each}
			</div>
		</Card.Content>
	</Card.Root>
</div>
