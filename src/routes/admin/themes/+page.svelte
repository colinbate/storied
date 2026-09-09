<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { pageTitle } from '$shared/brand';
	import { tick } from 'svelte';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { NativeSelect, NativeSelectOption } from '$lib/components/ui/native-select/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import CheckIcon from '@lucide/svelte/icons/check';
	import LightbulbIcon from '@lucide/svelte/icons/lightbulb';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import { toast } from 'svelte-sonner';

	type ThemeStatus = 'idea' | 'shortlist' | 'selected' | 'archived';
	let { data, form } = $props();
	let loading = $state(false);
	let showCreateForm = $state(false);
	let createNameInput = $state<HTMLInputElement | null>(null);
	let quickStatusForm = $state<HTMLFormElement | null>(null);
	let quickThemeId = $state('');
	let quickStatus = $state<ThemeStatus>('idea');
	const statuses: ThemeStatus[] = ['idea', 'shortlist', 'selected', 'archived'];
	const groups = [
		{ status: 'shortlist' as const, title: 'Shortlist' },
		{ status: 'idea' as const, title: 'Ideas' },
		{ status: 'selected' as const, title: 'Selected' },
		{ status: 'archived' as const, title: 'Archived' }
	];

	function themesFor(status: ThemeStatus) {
		return data.themes.filter((entry) => entry.theme.status === status);
	}

	function sessionCount(themeId: string) {
		return data.sessions.filter((session) => session.themeId === themeId).length;
	}

	function bookCount(themeId: string) {
		return data.themeBooks.filter((link) => link.themeId === themeId).length;
	}

	function setStatus(id: string, status: ThemeStatus) {
		quickThemeId = id;
		quickStatus = status;
		requestAnimationFrame(() => quickStatusForm?.requestSubmit());
	}

	async function toggleCreateForm() {
		showCreateForm = !showCreateForm;
		if (showCreateForm) {
			await tick();
			createNameInput?.focus();
		}
	}
</script>

<svelte:head>
	<title>{pageTitle('Themes · Admin')}</title>
</svelte:head>

<div class="space-y-6">
	<div class="flex items-center justify-between gap-4">
		<div>
			<h1 class="text-2xl font-bold">Themes</h1>
			<p class="text-muted-foreground">Curate theme guides, books, and session use.</p>
		</div>
		<Button onclick={toggleCreateForm} size="sm">
			<PlusIcon class="h-4 w-4" />
			New Theme
		</Button>
	</div>

	{#if form?.error}
		<div class="rounded border border-destructive p-3 text-destructive">{form.error}</div>
	{/if}

	<form
		bind:this={quickStatusForm}
		method="POST"
		action="?/setStatus"
		use:enhance={() => {
			loading = true;
			return async ({ result, update }) => {
				loading = false;
				await update({ reset: false });
				if (result.type === 'success' && result.data?.statusUpdated)
					toast.success('Theme updated.');
			};
		}}
		class="hidden"
	>
		<input type="hidden" name="id" value={quickThemeId} />
		<input type="hidden" name="status" value={quickStatus} />
	</form>

	{#if showCreateForm}
		<Card.Root>
			<Card.Header>
				<Card.Title class="text-base">Create a Theme</Card.Title>
				<Card.Description>Add the initial pitch and submitted examples.</Card.Description>
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
							if (result.type === 'success' && result.data?.created) {
								toast.success('Theme created.');
								showCreateForm = false;
							}
						};
					}}
					class="space-y-4"
				>
					<div class="grid gap-4 sm:grid-cols-2">
						<div class="space-y-2">
							<Label for="create-name">Name</Label>
							<Input id="create-name" name="name" bind:ref={createNameInput} required />
						</div>
						<div class="space-y-2">
							<Label for="create-status">Status</Label>
							<NativeSelect id="create-status" name="status" value="idea">
								{#each statuses as status (status)}
									<NativeSelectOption value={status}>{status}</NativeSelectOption>
								{/each}
							</NativeSelect>
						</div>
						<div class="space-y-2 sm:col-span-2">
							<Label for="create-description">Description</Label>
							<Input id="create-description" name="description" />
						</div>
						<div class="space-y-2 sm:col-span-2">
							<Label for="create-examples">Submitted Examples</Label>
							<Textarea id="create-examples" name="exampleText" rows={3} />
						</div>
					</div>
					<div class="flex gap-2">
						<Button type="submit" disabled={loading}
							>{loading ? 'Creating...' : 'Create Theme'}</Button
						>
						<Button type="button" variant="ghost" onclick={() => (showCreateForm = false)}
							>Cancel</Button
						>
					</div>
				</form>
			</Card.Content>
		</Card.Root>
	{/if}

	<Card.Root>
		<Card.Header>
			<div class="flex items-center gap-2">
				<LightbulbIcon class="h-5 w-5 text-primary" />
				<Card.Title class="text-base">Theme Library</Card.Title>
			</div>
		</Card.Header>
		<Card.Content class="space-y-6">
			{#each groups as group (group.status)}
				{@const groupThemes = themesFor(group.status)}
				<section class="space-y-2">
					<div class="flex items-center gap-2">
						<h2 class="text-sm font-semibold">{group.title}</h2>
						<Badge variant="secondary">{groupThemes.length}</Badge>
					</div>
					{#if groupThemes.length > 0}
						<div class="grid gap-2 md:grid-cols-2">
							{#each groupThemes as entry (entry.theme.id)}
								<div
									class="flex min-h-14 items-center justify-between gap-3 rounded-md border px-3 py-2"
								>
									<div class="min-w-0">
										<a
											class="truncate text-sm font-medium hover:underline"
											href={resolve('/admin/themes/[slug]', { slug: entry.theme.slug })}
										>
											{entry.theme.name}
										</a>
										<p class="text-xs text-muted-foreground">
											{bookCount(entry.theme.id)}
											{bookCount(entry.theme.id) === 1 ? 'book' : 'books'} ·
											{sessionCount(entry.theme.id)}
											{sessionCount(entry.theme.id) === 1 ? 'session' : 'sessions'}
										</p>
									</div>
									<div class="flex shrink-0 items-center gap-1">
										{#if entry.theme.status === 'idea'}
											<Button
												size="sm"
												variant="outline"
												disabled={loading}
												onclick={() => setStatus(entry.theme.id, 'shortlist')}>Shortlist</Button
											>
										{:else if entry.theme.status === 'shortlist'}
											<Button
												size="sm"
												variant="outline"
												disabled={loading}
												onclick={() => setStatus(entry.theme.id, 'selected')}
											>
												<CheckIcon class="h-4 w-4" /> Select
											</Button>
										{/if}
										<Button
											variant="ghost"
											size="icon-sm"
											href={resolve('/admin/themes/[slug]', { slug: entry.theme.slug })}
											title="Edit theme"
										>
											<PencilIcon class="h-4 w-4" />
										</Button>
									</div>
								</div>
							{/each}
						</div>
					{:else}
						<p class="rounded-md border px-3 py-4 text-sm text-muted-foreground">
							No {group.title.toLowerCase()} themes.
						</p>
					{/if}
				</section>
			{/each}
		</Card.Content>
	</Card.Root>
</div>
