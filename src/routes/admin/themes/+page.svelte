<script lang="ts">
	import { enhance } from '$app/forms';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { NativeSelect, NativeSelectOption } from '$lib/components/ui/native-select/index.js';
	import CheckIcon from '@lucide/svelte/icons/check';
	import LightbulbIcon from '@lucide/svelte/icons/lightbulb';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import { toast } from 'svelte-sonner';

	type ThemeStatus = 'idea' | 'shortlist' | 'selected' | 'archived';
	type Theme = {
		id: string;
		slug: string;
		name: string;
		description: string | null;
		exampleText: string | null;
		status: ThemeStatus;
		submittedByUserId: string | null;
		selectedAt: string | null;
		archivedAt: string | null;
		createdAt: string;
		updatedAt: string;
	};
	type ThemeEntry = {
		theme: Theme;
		submitter: { id: string; displayName: string; email: string } | null;
	};

	let { data, form } = $props();
	let loading = $state(false);
	let showCreateForm = $state(false);
	let editDialogOpen = $state(false);
	let editTheme = $state<ThemeEntry | null>(null);
	let quickStatusForm = $state<HTMLFormElement | null>(null);
	let quickThemeId = $state('');
	let quickStatus = $state<ThemeStatus>('idea');

	const themeStatuses: ThemeStatus[] = ['idea', 'shortlist', 'selected', 'archived'];
	const themeGroups = $derived([
		{ status: 'shortlist' as const, title: 'Shortlist' },
		{ status: 'idea' as const, title: 'Ideas' },
		{ status: 'selected' as const, title: 'Selected' },
		{ status: 'archived' as const, title: 'Archived' }
	]);

	function themesFor(status: ThemeStatus) {
		return data.themes.filter((entry) => entry.theme.status === status);
	}

	function sessionCount(themeId: string) {
		return data.sessions.filter((session) => session.themeId === themeId).length;
	}

	function openEdit(entry: ThemeEntry) {
		editTheme = entry;
		editDialogOpen = true;
	}

	function setStatus(id: string, status: ThemeStatus) {
		quickThemeId = id;
		quickStatus = status;
		requestAnimationFrame(() => quickStatusForm?.requestSubmit());
	}
</script>

<svelte:head>
	<title>Themes — Admin — The Archive</title>
</svelte:head>

<div class="space-y-6">
	<div class="flex items-center justify-between gap-4">
		<div>
			<h1 class="text-2xl font-bold">Themes</h1>
			<p class="text-muted-foreground">
				Curate theme ideas, shortlist candidates, and track selections.
			</p>
		</div>
		<Button
			onclick={() => {
				showCreateForm = !showCreateForm;
			}}
			size="sm"
		>
			<PlusIcon class="h-4 w-4" />
			New Theme
		</Button>
	</div>

	{#if form?.error}
		<div class="rounded border border-destructive p-3 text-destructive">
			{form.error}
		</div>
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
				if (result.type === 'success') {
					if (result.data?.statusUpdated) toast.success('Theme updated.');
					if (result.data?.error) toast.error(String(result.data.error));
				}
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
				<Card.Description>
					Use the description for club-facing intent; session summaries stay separate.
				</Card.Description>
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
									toast.success('Theme created.');
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
							<Input id="create-name" name="name" placeholder="e.g. Haunted Futures" required />
						</div>
						<div class="space-y-2">
							<Label for="create-status">Status</Label>
							<NativeSelect id="create-status" name="status" value="idea">
								{#each themeStatuses as status (status)}
									<NativeSelectOption value={status}>{status}</NativeSelectOption>
								{/each}
							</NativeSelect>
						</div>
						<div class="space-y-2 sm:col-span-2">
							<Label for="create-description">Description</Label>
							<Textarea id="create-description" name="description" rows={3} />
						</div>
						<div class="space-y-2 sm:col-span-2">
							<Label for="create-examples">Examples</Label>
							<Textarea id="create-examples" name="exampleText" rows={2} />
						</div>
					</div>
					<div class="flex items-center gap-2">
						<Button type="submit" disabled={loading}>
							{loading ? 'Creating...' : 'Create Theme'}
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
				<LightbulbIcon class="h-5 w-5 text-primary" />
				<Card.Title class="text-base">Theme Library</Card.Title>
			</div>
		</Card.Header>
		<Card.Content class="space-y-6">
			{#each themeGroups as group (group.status)}
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
									class="flex min-h-11 items-center justify-between gap-2 rounded-md border bg-background px-3 py-2"
								>
									<div class="min-w-0">
										<p class="truncate text-sm font-medium">{entry.theme.name}</p>
										{#if sessionCount(entry.theme.id) > 0}
											<p class="text-xs text-muted-foreground">
												{sessionCount(entry.theme.id)}
												{sessionCount(entry.theme.id) === 1 ? 'session' : 'sessions'}
											</p>
										{/if}
									</div>
									<div class="flex shrink-0 items-center gap-1">
										{#if entry.theme.status === 'idea'}
											<Button
												type="button"
												size="sm"
												variant="outline"
												disabled={loading}
												onclick={() => setStatus(entry.theme.id, 'shortlist')}
											>
												Shortlist
											</Button>
										{/if}
										{#if entry.theme.status === 'shortlist'}
											<Button
												type="button"
												size="sm"
												variant="outline"
												disabled={loading}
												onclick={() => setStatus(entry.theme.id, 'selected')}
											>
												<CheckIcon class="h-4 w-4" />
												Select
											</Button>
										{/if}
										<Button
											type="button"
											size="icon-sm"
											variant="ghost"
											title="Edit theme"
											onclick={() => openEdit(entry)}
										>
											<PencilIcon class="h-4 w-4" />
										</Button>
									</div>
								</div>
							{/each}
						</div>
					{:else}
						<p class="rounded-md border bg-background px-3 py-4 text-sm text-muted-foreground">
							No {group.title.toLowerCase()} themes.
						</p>
					{/if}
				</section>
			{/each}
		</Card.Content>
	</Card.Root>
</div>

<Dialog.Root bind:open={editDialogOpen}>
	<Dialog.Content class="sm:max-w-2xl">
		<Dialog.Header>
			<Dialog.Title>Edit Theme</Dialog.Title>
			<Dialog.Description>
				Update the library entry. Session title and summary copy stay separate.
			</Dialog.Description>
		</Dialog.Header>
		{#if editTheme}
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
								toast.success('Theme updated.');
								editDialogOpen = false;
							}
							if (result.data?.error) toast.error(String(result.data.error));
						}
					};
				}}
				class="space-y-4"
			>
				<input type="hidden" name="id" value={editTheme.theme.id} />
				<div class="grid gap-4 sm:grid-cols-2">
					<div class="space-y-2">
						<Label for="edit-name">Name</Label>
						<Input id="edit-name" name="name" value={editTheme.theme.name} required />
					</div>
					<div class="space-y-2">
						<Label for="edit-status">Status</Label>
						<NativeSelect id="edit-status" name="status" value={editTheme.theme.status}>
							{#each themeStatuses as status (status)}
								<NativeSelectOption value={status}>{status}</NativeSelectOption>
							{/each}
						</NativeSelect>
					</div>
					<div class="space-y-2 sm:col-span-2">
						<Label for="edit-description">Description</Label>
						<Textarea
							id="edit-description"
							name="description"
							rows={5}
							value={editTheme.theme.description ?? ''}
						/>
					</div>
					<div class="space-y-2 sm:col-span-2">
						<Label for="edit-examples">Examples</Label>
						<Textarea
							id="edit-examples"
							name="exampleText"
							rows={3}
							value={editTheme.theme.exampleText ?? ''}
						/>
					</div>
				</div>
				<div class="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
					<span class="font-mono">{editTheme.theme.slug}</span>
					{#if editTheme.submitter}
						<span>Submitted by {editTheme.submitter.displayName}</span>
					{/if}
					{#if editTheme.theme.selectedAt}
						<span>Selected {editTheme.theme.selectedAt.slice(0, 10)}</span>
					{/if}
				</div>
				<Dialog.Footer>
					<Button
						type="button"
						variant="ghost"
						onclick={() => {
							editDialogOpen = false;
						}}
					>
						Cancel
					</Button>
					<Button type="submit" disabled={loading}>
						{loading ? 'Saving...' : 'Save Theme'}
					</Button>
				</Dialog.Footer>
			</form>
		{/if}
	</Dialog.Content>
</Dialog.Root>
