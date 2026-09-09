<script lang="ts">
	import { pageTitle } from '$shared/brand';
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { tick } from 'svelte';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import LightbulbIcon from '@lucide/svelte/icons/lightbulb';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import { toast } from 'svelte-sonner';
	import SessionNav from '$lib/components/session-nav.svelte';
	import { NativeSelect, NativeSelectOption } from '$lib/components/ui/native-select/index.js';
	import type { PageData } from './$types';

	type Theme = PageData['themes'][number];

	let { data, form } = $props();
	let saving = $state(false);
	let showCreateForm = $state(false);
	let createNameInput = $state<HTMLInputElement | null>(null);
	let themes = $derived(data.themes);
	let ideaSort = $state<'name' | 'added'>('name');
	let selectedSort = $state<'name' | 'used'>('name');

	const statusGroups = $derived([
		{ status: 'shortlist', title: 'Shortlist' },
		{ status: 'idea', title: 'Ideas' },
		{ status: 'selected', title: 'Selected' }
	] as const);

	function sessionsForTheme(themeId: string) {
		return data.sessions.filter((session) => session.themeId === themeId);
	}

	function isTheme(value: unknown): value is Theme {
		return (
			typeof value === 'object' &&
			value !== null &&
			'id' in value &&
			typeof value.id === 'string' &&
			'name' in value &&
			typeof value.name === 'string' &&
			'createdAt' in value &&
			typeof value.createdAt === 'string'
		);
	}

	function latestSessionDate(themeId: string) {
		return sessionsForTheme(themeId).reduce(
			(latest, session) =>
				session.startsAt && session.startsAt > latest ? session.startsAt : latest,
			''
		);
	}

	function themesFor(status: (typeof statusGroups)[number]['status']) {
		return themes
			.filter((theme) => theme.status === status)
			.sort((a, b) => {
				if (status === 'idea' && ideaSort === 'added') {
					return b.createdAt.localeCompare(a.createdAt) || a.name.localeCompare(b.name);
				}
				if (status === 'selected' && selectedSort === 'used') {
					const aDate = latestSessionDate(a.id) || a.selectedAt || '';
					const bDate = latestSessionDate(b.id) || b.selectedAt || '';
					return bDate.localeCompare(aDate) || a.name.localeCompare(b.name);
				}
				return a.name.localeCompare(b.name);
			});
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
	<title>{pageTitle('Themes')}</title>
</svelte:head>

<div class="space-y-6">
	<SessionNav />

	<div class="flex items-start justify-between gap-4">
		<div>
			<h1 class="text-2xl font-bold">Themes</h1>
			<p class="text-muted-foreground">Ideas, shortlists, and past prompts for future sessions.</p>
		</div>
		<Button onclick={toggleCreateForm} size="sm">
			<PlusIcon class="h-4 w-4" />
			Add Theme
		</Button>
	</div>

	{#if form?.error}
		<div class="rounded border border-destructive p-3 text-destructive">
			{form.error}
		</div>
	{/if}

	{#if showCreateForm}
		<Card.Root>
			<Card.Header>
				<Card.Title class="text-base">Suggest a Theme</Card.Title>
				<Card.Description>
					Add the framing and examples that would help the club understand the idea.
				</Card.Description>
			</Card.Header>
			<Card.Content>
				<form
					method="POST"
					action="?/create"
					use:enhance={() => {
						saving = true;
						return async ({ result, update }) => {
							saving = false;
							await update({ invalidateAll: false });
							if (result.type === 'success') {
								const createdTheme = result.data?.theme;
								if (result.data?.created && isTheme(createdTheme)) {
									themes = [...themes, createdTheme];
									toast.success('Theme added.');
									showCreateForm = false;
								}
								if (result.data?.error) toast.error(String(result.data.error));
							}
						};
					}}
					class="space-y-4"
				>
					<div class="grid gap-4 sm:grid-cols-2">
						<div class="space-y-2 sm:col-span-2">
							<Label for="theme-name">Name</Label>
							<Input
								id="theme-name"
								name="name"
								placeholder="e.g. Haunted Futures"
								bind:ref={createNameInput}
								required
							/>
						</div>
						<div class="space-y-2 sm:col-span-2">
							<Label for="theme-description">Description</Label>
							<Textarea
								id="theme-description"
								name="description"
								rows={4}
								placeholder="What should this theme mean for the club?"
							/>
						</div>
						<div class="space-y-2 sm:col-span-2">
							<Label for="theme-examples">Examples</Label>
							<Textarea
								id="theme-examples"
								name="exampleText"
								rows={2}
								placeholder="Optional books, authors, or references that fit."
							/>
						</div>
					</div>
					<div class="flex items-center gap-2">
						<Button type="submit" disabled={saving}>
							{saving ? 'Adding...' : 'Add Theme'}
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

	{#each statusGroups as group (group.status)}
		{@const groupThemes = themesFor(group.status)}
		<section class="space-y-3">
			<div class="flex items-center justify-between gap-3">
				<h2 class="text-lg font-semibold">{group.title}</h2>
				{#if group.status === 'idea'}
					<NativeSelect bind:value={ideaSort} class="w-auto" aria-label="Sort ideas">
						<NativeSelectOption value="name">Name</NativeSelectOption>
						<NativeSelectOption value="added">Date added</NativeSelectOption>
					</NativeSelect>
				{:else if group.status === 'selected'}
					<NativeSelect bind:value={selectedSort} class="w-auto" aria-label="Sort selected themes">
						<NativeSelectOption value="name">Name</NativeSelectOption>
						<NativeSelectOption value="used">Date used</NativeSelectOption>
					</NativeSelect>
				{/if}
			</div>
			{#if groupThemes.length > 0}
				<div class="grid gap-3 sm:grid-cols-2">
					{#each groupThemes as theme (theme.id)}
						{@const linkedSessions = sessionsForTheme(theme.id)}
						<Card.Root class="h-full">
							<Card.Header>
								<div class="flex items-start justify-between gap-3">
									<div class="min-w-0">
										<Card.Title class="text-base">{theme.name}</Card.Title>
									</div>

									{#if linkedSessions.length > 0}
										<div class="flex flex-wrap gap-2">
											{#each linkedSessions as session (session.id)}
												<a href={resolve('/sessions/[slug]', { slug: session.slug })}>
													<Badge variant="outline">{session.title}</Badge>
												</a>
											{/each}
										</div>
									{/if}
								</div>
							</Card.Header>
							{#if theme.description || theme.exampleText}
								<Card.Content class="space-y-3 text-sm">
									{#if theme.description}
										<p class="whitespace-pre-line text-muted-foreground">{theme.description}</p>
									{/if}
									{#if theme.exampleText}
										<p class="whitespace-pre-line text-muted-foreground">
											<span class="font-medium text-foreground">Examples:</span>
											{theme.exampleText}
										</p>
									{/if}
								</Card.Content>
							{/if}
						</Card.Root>
					{/each}
				</div>
			{:else}
				<div
					class="flex items-center gap-2 rounded-lg border bg-card px-4 py-6 text-sm text-muted-foreground"
				>
					<LightbulbIcon class="h-4 w-4" />
					No {group.title.toLowerCase()} yet.
				</div>
			{/if}
		</section>
	{/each}
</div>
