<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { NativeSelect, NativeSelectOption } from '$lib/components/ui/native-select/index.js';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import XIcon from '@lucide/svelte/icons/x';
	import CheckIcon from '@lucide/svelte/icons/check';
	import ExternalLinkIcon from '@lucide/svelte/icons/external-link';
	import { toast } from 'svelte-sonner';

	let { data } = $props();
	let loading = $state(false);
	let showCreateForm = $state(false);
	let editingId = $state<string | null>(null);
</script>

<svelte:head>
	<title>Sessions — Admin — Storied</title>
</svelte:head>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<h1 class="text-2xl font-bold">Sessions</h1>
		<Button
			onclick={() => {
				showCreateForm = !showCreateForm;
			}}
			size="sm"
		>
			<PlusIcon class="h-4 w-4" />
			New Session
		</Button>
	</div>

	{#if showCreateForm}
		<Card.Root>
			<Card.Header>
				<Card.Title class="text-base">Create a New Session</Card.Title>
				<Card.Description>
					Sessions represent reading periods or book club meetings.
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
									toast.success('Session created!');
									showCreateForm = false;
								}
								if (result.data?.error) {
									toast.error(String(result.data.error));
								}
							}
						};
					}}
					class="space-y-4"
				>
					<div class="grid gap-4 sm:grid-cols-2">
						<div class="space-y-2">
							<Label for="create-title">Title</Label>
							<Input id="create-title" name="title" placeholder="e.g. January 2025" required />
						</div>
						<div class="space-y-2">
							<Label for="create-slug">Slug</Label>
							<Input id="create-slug" name="slug" placeholder="auto-generated if blank" />
						</div>
						<div class="space-y-2">
							<Label for="create-status">Status</Label>
							<NativeSelect id="create-status" name="status" value="draft">
								<NativeSelectOption value="draft">draft</NativeSelectOption>
								<NativeSelectOption value="current">current</NativeSelectOption>
								<NativeSelectOption value="past">past</NativeSelectOption>
							</NativeSelect>
						</div>
						<div class="space-y-2">
							<Label for="create-startsAt">Starts At</Label>
							<Input id="create-startsAt" name="startsAt" type="datetime-local" />
						</div>
						<div class="space-y-2">
							<Label for="create-durationMinutes">Duration Minutes</Label>
							<Input id="create-durationMinutes" name="durationMinutes" type="number" min="0" />
						</div>
						<div class="space-y-2">
							<Label for="create-locationName">Location</Label>
							<Input id="create-locationName" name="locationName" />
						</div>
						<div class="space-y-2">
							<Label for="create-themeTitle">Theme Title</Label>
							<Input id="create-themeTitle" name="themeTitle" placeholder="e.g. Haunted Futures" />
						</div>
						<div class="space-y-2 sm:col-span-2">
							<Label for="create-themeSummary">Theme Summary</Label>
							<Textarea id="create-themeSummary" name="themeSummary" rows={2} />
						</div>
						<div class="space-y-2 sm:col-span-2">
							<Label for="create-bodySource">Body</Label>
							<Textarea id="create-bodySource" name="bodySource" rows={6} />
						</div>
						<div class="space-y-2">
							<Label for="create-rsvpSlug">RSVP Slug</Label>
							<Input id="create-rsvpSlug" name="rsvpSlug" />
						</div>
						<div class="space-y-2">
							<Label for="create-astroPath">Astro Path</Label>
							<Input id="create-astroPath" name="astroPath" placeholder="/sessions/jan-2025" />
						</div>
						<div class="space-y-2">
							<Label for="create-externalUrl">External URL</Label>
							<Input
								id="create-externalUrl"
								name="externalUrl"
								type="url"
								placeholder="https://..."
							/>
						</div>
						<label class="flex items-center gap-2 pt-8 text-sm">
							<input name="isPublic" type="checkbox" class="rounded border-input" />
							Public
						</label>
					</div>
					<div class="flex items-center gap-2">
						<Button type="submit" disabled={loading}>
							{loading ? 'Creating…' : 'Create Session'}
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
		<Card.Content class="p-0">
			<div class="divide-y">
				{#each data.sessions as session (session.id)}
					{#if editingId === session.id}
						<form
							method="POST"
							action="?/update"
							use:enhance={() => {
								loading = true;
								return async ({ result, update }) => {
									loading = false;
									await update();
									if (result.type === 'success') {
										if (result.data?.updated) {
											toast.success('Session updated!');
											editingId = null;
										}
										if (result.data?.error) {
											toast.error(String(result.data.error));
										}
									}
								};
							}}
							class="space-y-3 px-4 py-3"
						>
							<input type="hidden" name="id" value={session.id} />
							<div class="grid gap-3 sm:grid-cols-2">
								<div class="space-y-1">
									<Label for="edit-title-{session.id}">Title</Label>
									<Input id="edit-title-{session.id}" name="title" value={session.title} required />
								</div>
								<div class="space-y-1">
									<Label for="edit-slug-{session.id}">Slug</Label>
									<Input id="edit-slug-{session.id}" name="slug" value={session.slug} required />
								</div>
								<div class="space-y-1">
									<Label for="edit-status-{session.id}">Status</Label>
									<NativeSelect id="edit-status-{session.id}" name="status" value={session.status}>
										<NativeSelectOption value="draft">draft</NativeSelectOption>
										<NativeSelectOption value="current">current</NativeSelectOption>
										<NativeSelectOption value="past">past</NativeSelectOption>
									</NativeSelect>
								</div>
								<div class="space-y-1">
									<Label for="edit-startsAt-{session.id}">Starts At</Label>
									<Input
										id="edit-startsAt-{session.id}"
										name="startsAt"
										type="datetime-local"
										value={session.startsAt ?? ''}
									/>
								</div>
								<div class="space-y-1">
									<Label for="edit-durationMinutes-{session.id}">Duration Minutes</Label>
									<Input
										id="edit-durationMinutes-{session.id}"
										name="durationMinutes"
										type="number"
										min="0"
										value={session.durationMinutes ?? ''}
									/>
								</div>
								<div class="space-y-1">
									<Label for="edit-locationName-{session.id}">Location</Label>
									<Input
										id="edit-locationName-{session.id}"
										name="locationName"
										value={session.locationName ?? ''}
									/>
								</div>
								<div class="space-y-1">
									<Label for="edit-themeTitle-{session.id}">Theme Title</Label>
									<Input
										id="edit-themeTitle-{session.id}"
										name="themeTitle"
										value={session.themeTitle ?? session.theme ?? ''}
									/>
								</div>
								<div class="space-y-1 sm:col-span-2">
									<Label for="edit-themeSummary-{session.id}">Theme Summary</Label>
									<Textarea
										id="edit-themeSummary-{session.id}"
										name="themeSummary"
										rows={2}
										value={session.themeSummary ?? ''}
									/>
								</div>
								<div class="space-y-1 sm:col-span-2">
									<Label for="edit-bodySource-{session.id}">Body</Label>
									<Textarea
										id="edit-bodySource-{session.id}"
										name="bodySource"
										rows={6}
										value={session.bodySource ?? ''}
									/>
								</div>
								<div class="space-y-1">
									<Label for="edit-rsvpSlug-{session.id}">RSVP Slug</Label>
									<Input
										id="edit-rsvpSlug-{session.id}"
										name="rsvpSlug"
										value={session.rsvpSlug ?? ''}
									/>
								</div>
								<div class="space-y-1">
									<Label for="edit-astroPath-{session.id}">Astro Path</Label>
									<Input
										id="edit-astroPath-{session.id}"
										name="astroPath"
										value={session.astroPath ?? ''}
									/>
								</div>
								<div class="space-y-1">
									<Label for="edit-externalUrl-{session.id}">External URL</Label>
									<Input
										id="edit-externalUrl-{session.id}"
										name="externalUrl"
										type="url"
										value={session.externalUrl ?? ''}
									/>
								</div>
								<label class="flex items-center gap-2 pt-7 text-sm">
									<input
										name="isPublic"
										type="checkbox"
										checked={session.isPublic}
										class="rounded border-input"
									/>
									Public
								</label>
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
									<span class="font-medium">{session.title}</span>
									<Badge variant={session.status === 'current' ? 'default' : 'secondary'}
										>{session.status}</Badge
									>
									{#if session.isPublic}
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
										<span>Starts {new Date(session.startsAt).toLocaleDateString()}</span>
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
									href={resolve('/admin/sessions/[slug]', { slug: session.slug })}
									title="Details"
								>
									<ExternalLinkIcon class="h-4 w-4" />
								</Button>
								<Button
									variant="ghost"
									size="icon-sm"
									onclick={() => {
										editingId = session.id;
									}}
									title="Edit"
								>
									<PencilIcon class="h-4 w-4" />
								</Button>
							</div>
						</div>
					{/if}
				{:else}
					<div class="py-12 text-center text-muted-foreground">
						<p>No sessions yet. Create one to get started.</p>
					</div>
				{/each}
			</div>
		</Card.Content>
	</Card.Root>
</div>
