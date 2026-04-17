<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
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
							<Label for="create-theme">Theme</Label>
							<Input id="create-theme" name="theme" placeholder="e.g. Science Fiction" />
						</div>
						<div class="space-y-2">
							<Label for="create-startsAt">Starts At</Label>
							<Input id="create-startsAt" name="startsAt" type="date" />
						</div>
						<div class="space-y-2">
							<Label for="create-astroPath">Astro Path</Label>
							<Input id="create-astroPath" name="astroPath" placeholder="/sessions/jan-2025" />
						</div>
						<div class="space-y-2 sm:col-span-2">
							<Label for="create-externalUrl">External URL</Label>
							<Input
								id="create-externalUrl"
								name="externalUrl"
								type="url"
								placeholder="https://..."
							/>
						</div>
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
									<Label for="edit-theme-{session.id}">Theme</Label>
									<Input id="edit-theme-{session.id}" name="theme" value={session.theme ?? ''} />
								</div>
								<div class="space-y-1">
									<Label for="edit-startsAt-{session.id}">Starts At</Label>
									<Input
										id="edit-startsAt-{session.id}"
										name="startsAt"
										type="date"
										value={session.startsAt ?? ''}
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
								<div class="space-y-1 sm:col-span-2">
									<Label for="edit-externalUrl-{session.id}">External URL</Label>
									<Input
										id="edit-externalUrl-{session.id}"
										name="externalUrl"
										type="url"
										value={session.externalUrl ?? ''}
									/>
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
									<span class="font-medium">{session.title}</span>
									{#if session.theme}
										<Badge variant="secondary">{session.theme}</Badge>
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
