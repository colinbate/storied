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
	import { NativeSelect, NativeSelectOption } from '$lib/components/ui/native-select/index.js';
	import SessionThemePicker from '$lib/components/admin/session-theme-picker.svelte';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import UsersIcon from '@lucide/svelte/icons/users';
	import { toast } from 'svelte-sonner';
	import { formatDate } from '$lib/date-format';
	import { supportedTimeZones } from '$lib/timezone-options';
	import { SESSION_STATUS_LABELS } from '$shared/session-lifecycle';

	let { data, form } = $props();
	const timeZone = $derived(data.user?.timezone);
	let loading = $state(false);
	let showCreateForm = $state(false);
	let createStatus = $state('current');
	let createThemeId = $state('');
	let createTitleInput = $state<HTMLInputElement | null>(null);
	const allTimezones = $derived(supportedTimeZones('Atlantic/Bermuda', data.user?.timezone));

	const availableThemes = $derived(
		data.themes
			.filter((theme) => theme.status !== 'archived')
			.map((theme) => ({ id: theme.id, name: theme.name, status: theme.status }))
	);
	const createThemeRequired = $derived(createStatus === 'current' || createStatus === 'past');

	async function toggleCreateForm() {
		showCreateForm = !showCreateForm;
		if (showCreateForm) {
			await tick();
			createTitleInput?.focus();
		}
	}
</script>

<svelte:head>
	<title>{pageTitle('Sessions — Admin')}</title>
</svelte:head>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<h1 class="text-2xl font-bold">Sessions</h1>
		<div class="flex flex-wrap gap-2">
			<Button variant="outline" size="sm" href={resolve('/admin/default-agenda')}
				>Default Agenda</Button
			>
			<Button onclick={toggleCreateForm} size="sm">
				<PlusIcon class="h-4 w-4" />
				New Session
			</Button>
		</div>
	</div>

	{#if form?.error}
		<div class="rounded border border-destructive p-3 text-destructive">
			{form.error}
		</div>
	{/if}

	{#if showCreateForm}
		<Card.Root>
			<Card.Header>
				<Card.Title class="text-base">Create a New Session</Card.Title>
				<Card.Description>
					Create the next current session in one step, or save a private draft with just a title.
					Upcoming sessions need a date. Add the theme when you are ready.
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
							await update({ reset: result.type === 'success' });
							if (result.type === 'failure' && result.data?.error)
								toast.error(String(result.data.error));
						};
					}}
					class="space-y-4"
				>
					<div class="grid gap-4 sm:grid-cols-2">
						<div class="space-y-2">
							<Label for="create-title">Title</Label>
							<Input
								id="create-title"
								name="title"
								placeholder="e.g. October 2026"
								bind:ref={createTitleInput}
								required
							/>
						</div>
						<div class="space-y-2">
							<Label for="create-slug">Slug</Label>
							<Input id="create-slug" name="slug" placeholder="auto-generated if blank" />
						</div>
						<div class="space-y-2">
							<Label for="create-status">Status</Label>
							<NativeSelect id="create-status" name="status" bind:value={createStatus}>
								<NativeSelectOption value="current">Current: feature on Home</NativeSelectOption>
								<NativeSelectOption value="draft">Draft: private preparation</NativeSelectOption>
								<NativeSelectOption value="scheduled">Upcoming: publish ahead</NativeSelectOption>
								<NativeSelectOption value="past">Past: record a previous session</NativeSelectOption
								>
							</NativeSelect>
						</div>
						<div class="space-y-2">
							<Label for="create-startsAt">Starts At</Label>
							<Input
								id="create-startsAt"
								name="startsAt"
								type="datetime-local"
								required={createStatus !== 'draft'}
							/>
						</div>
						<div class="space-y-2">
							<Label for="create-timezone">Timezone</Label>
							<NativeSelect id="create-timezone" name="timezone" value="Atlantic/Bermuda">
								{#each allTimezones as tz (tz)}
									<NativeSelectOption value={tz}>{tz}</NativeSelectOption>
								{/each}
							</NativeSelect>
						</div>
						<div class="space-y-2">
							<Label for="create-durationMinutes">Duration Minutes</Label>
							<Input id="create-durationMinutes" name="durationMinutes" type="number" min="0" />
						</div>
						<div class="space-y-2">
							<Label for="create-locationName">Location</Label>
							<Input id="create-locationName" name="locationName" />
						</div>
						<div class="sm:col-span-2">
							<SessionThemePicker
								id="create-themeId"
								themes={availableThemes}
								bind:selectedId={createThemeId}
								label={createThemeRequired ? 'Theme' : 'Theme (can be decided later)'}
								required={createThemeRequired}
							/>
							{#if data.nextThemeNote}
								<p class="mt-2 text-xs text-muted-foreground">
									Handoff from <span class="font-medium">{data.nextThemeNote.title}</span>: next
									theme idea was “{data.nextThemeNote.nextThemeNote}”. Pick or create that theme
									above if it still stands.
								</p>
							{/if}
						</div>
						<div class="space-y-2 sm:col-span-2">
							<Label for="create-themeSummary">Theme Summary</Label>
							<Textarea id="create-themeSummary" name="themeSummary" rows={2} />
						</div>
						<div class="space-y-2 sm:col-span-2">
							<Label for="create-bodySource">Session description</Label>
							<Textarea id="create-bodySource" name="bodySource" rows={6} />
						</div>
						<div class="space-y-2">
							<Label for="create-rsvpSlug">RSVP Slug</Label>
							<Input id="create-rsvpSlug" name="rsvpSlug" />
						</div>
						<div class="space-y-2">
							<Label for="create-rsvpCapacity">RSVP Capacity</Label>
							<Input
								id="create-rsvpCapacity"
								name="rsvpCapacity"
								type="number"
								min="1"
								value="12"
							/>
						</div>
						<label class="flex items-center gap-2 text-sm"
							><input
								name="rsvpEnabled"
								type="checkbox"
								class="rounded border-input"
								checked
							/>Accept RSVPs once published, until the session starts</label
						>
						<label class="flex items-center gap-2 text-sm">
							<input
								name="rsvpWaitlistEnabled"
								type="checkbox"
								class="rounded border-input"
								checked
							/>
							Enable RSVP waitlist
						</label>
						<div class="space-y-2">
							<Label for="create-astroPath">Astro Path</Label>
							<Input id="create-astroPath" name="astroPath" placeholder="/sessions/jan-2025" />
						</div>
						<label class="flex items-center gap-2 text-sm">
							<input name="isPublic" type="checkbox" class="rounded border-input" checked />
							Show on the public site when published
						</label>
					</div>
					<div class="flex items-center gap-2">
						<Button type="submit" disabled={loading}>
							{loading
								? 'Creating…'
								: createStatus === 'draft'
									? 'Save Draft'
									: createStatus === 'current'
										? 'Create Current Session'
										: 'Create Session'}
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

	<Card.Root class="py-1">
		<Card.Content class="p-0">
			<div class="divide-y">
				{#each data.sessions as session (session.id)}
					<div class="flex items-center justify-between px-4 py-3">
						<div class="min-w-0 flex-1">
							<div class="flex items-center gap-2">
								<span class="font-medium">{session.title}</span>
								<Badge variant={session.status === 'current' ? 'default' : 'secondary'}
									>{SESSION_STATUS_LABELS[session.status]}</Badge
								>
								{#if session.isPublic && session.status !== 'draft'}
									<Badge variant="outline">public</Badge>
								{/if}
								{#if session.themeTitle ?? session.theme}
									<Badge variant="secondary">{session.themeTitle ?? session.theme}</Badge>
								{/if}
							</div>
							<div
								class="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-muted-foreground"
							>
								{#if session.startsAt}
									<span
										>Starts {formatDate(session.startsAt, {
											time: 'never',
											timeZone: session.timezone ?? timeZone
										})}</span
									>
								{/if}
								{#if session.astroPath}
									<span class="font-mono text-xs">{session.astroPath}</span>
								{/if}
								<span class="font-mono text-xs text-muted-foreground/60">{session.slug}</span>
							</div>
						</div>
						<div class="flex items-center gap-1">
							<Button
								variant="ghost"
								size="icon-sm"
								href={resolve('/admin/sessions/[slug]/attendees', { slug: session.slug })}
								title="Manage attendees"
								aria-label={`Manage attendees for ${session.title}`}
							>
								<UsersIcon class="h-4 w-4" />
							</Button>
							<Button
								variant="ghost"
								size="icon-sm"
								href={resolve('/admin/sessions/[slug]', { slug: session.slug })}
								title="Edit"
								aria-label={`Edit ${session.title}`}
							>
								<PencilIcon class="h-4 w-4" />
							</Button>
						</div>
					</div>
				{:else}
					<div class="py-12 text-center text-muted-foreground">
						<p>No sessions yet. Create one to get started.</p>
					</div>
				{/each}
			</div>
		</Card.Content>
	</Card.Root>
</div>
