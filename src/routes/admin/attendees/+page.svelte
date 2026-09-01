<script lang="ts">
	import { enhance } from '$app/forms';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { NativeSelect, NativeSelectOption } from '$lib/components/ui/native-select/index.js';
	import EllipsisIcon from '@lucide/svelte/icons/ellipsis';
	import SearchIcon from '@lucide/svelte/icons/search';
	import { toast } from 'svelte-sonner';
	import { pageTitle } from '$shared/brand';
	import type { SubmitFunction } from '@sveltejs/kit';

	let { data } = $props();
	type ManageAction = 'edit' | 'merge' | 'delete';
	let manageActionOpen = $state(false);
	let manageAction = $state<{ kind: ManageAction; attendeeId: string } | null>(null);
	let query = $state('');
	const selectedGuest = $derived(
		manageAction
			? (data.guests.find((row) => row.attendee.id === manageAction?.attendeeId) ?? null)
			: null
	);
	const filteredGuests = $derived.by(() => {
		const normalized = query.trim().toLowerCase();
		if (!normalized) return data.guests;
		return data.guests.filter(
			(row) =>
				row.attendee.name.toLowerCase().includes(normalized) ||
				row.attendee.email?.toLowerCase().includes(normalized)
		);
	});
	const memberCount = $derived(data.identities.length - data.guests.length);

	function openManageAction(kind: ManageAction, attendeeId: string) {
		manageAction = { kind, attendeeId };
		manageActionOpen = true;
	}

	const enhanceManage: SubmitFunction = () => {
		const kind = manageAction?.kind;
		return async ({ result, update }) => {
			await update({ reset: result.type === 'success' });
			if (result.type === 'success') {
				toast.success(
					kind === 'merge'
						? 'Attendee histories merged.'
						: kind === 'delete'
							? 'Unused guest deleted.'
							: 'Guest details updated.'
				);
				manageActionOpen = false;
			} else if (result.type === 'failure' && result.data?.error) {
				toast.error(String(result.data.error));
			}
		};
	};
</script>

<svelte:head><title>{pageTitle('Attendees — Admin')}</title></svelte:head>

<div class="space-y-6">
	<div>
		<h1 class="text-2xl font-bold">Attendees</h1>
		<p class="mt-1 text-sm text-muted-foreground">
			Clean up previous guests and connect duplicate identities without losing session history.
		</p>
	</div>

	<Card.Root size="sm">
		<Card.Content class="grid grid-cols-3 gap-3">
			<div class="text-center">
				<p class="text-2xl font-bold">{data.guests.length}</p>
				<p class="text-xs text-muted-foreground">Previous guests</p>
			</div>
			<div class="text-center">
				<p class="text-2xl font-bold">{memberCount}</p>
				<p class="text-xs text-muted-foreground">Linked members</p>
			</div>
			<div class="text-center">
				<p class="text-2xl font-bold">{data.totalParticipationCount}</p>
				<p class="text-xs text-muted-foreground">Session records</p>
			</div>
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header class="gap-4 sm:flex-row sm:items-end sm:justify-between">
			<div>
				<Card.Title class="text-base">Previous guests</Card.Title>
				<Card.Description>
					Editing updates their name and email across existing session records. Merging moves all
					history to the identity you keep.
				</Card.Description>
			</div>
			<div class="relative w-full sm:w-64">
				<SearchIcon class="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
				<Label for="guest-search" class="sr-only">Search previous guests</Label>
				<Input id="guest-search" bind:value={query} class="pl-9" placeholder="Search guests…" />
			</div>
		</Card.Header>
		<Card.Content class="p-0">
			{#if data.guests.length === 0}
				<p class="p-6 text-sm text-muted-foreground">There are no previous guests to manage.</p>
			{:else if filteredGuests.length === 0}
				<p class="p-6 text-sm text-muted-foreground">No previous guests match that search.</p>
			{:else}
				<div class="divide-y">
					{#each filteredGuests as row (row.attendee.id)}
						<div class="flex items-center gap-3 px-4 py-3">
							<div class="min-w-0 flex-1">
								<div class="flex flex-wrap items-center gap-2">
									<p class="truncate font-medium">{row.attendee.name}</p>
									<Badge variant="outline">previous guest</Badge>
								</div>
								<p class="truncate text-sm text-muted-foreground">
									{row.attendee.email ?? 'No email address'}
									<span aria-hidden="true"> · </span>{row.participationCount}
									{row.participationCount === 1 ? 'session record' : 'session records'}
								</p>
							</div>
							<DropdownMenu.Root>
								<DropdownMenu.Trigger>
									{#snippet child({ props })}
										<Button
											variant="ghost"
											size="icon"
											aria-label={`Actions for ${row.attendee.name}`}
											{...props}
										>
											<EllipsisIcon class="size-4" />
										</Button>
									{/snippet}
								</DropdownMenu.Trigger>
								<DropdownMenu.Content align="end" class="w-52">
									<DropdownMenu.Item onSelect={() => openManageAction('edit', row.attendee.id)}>
										Edit name or email
									</DropdownMenu.Item>
									<DropdownMenu.Item onSelect={() => openManageAction('merge', row.attendee.id)}>
										Merge into another attendee
									</DropdownMenu.Item>
									{#if row.participationCount === 0}
										<DropdownMenu.Separator />
										<DropdownMenu.Item
											class="text-destructive focus:text-destructive"
											onSelect={() => openManageAction('delete', row.attendee.id)}
										>
											Delete unused guest
										</DropdownMenu.Item>
									{/if}
								</DropdownMenu.Content>
							</DropdownMenu.Root>
						</div>
					{/each}
				</div>
			{/if}
		</Card.Content>
	</Card.Root>
</div>

<Dialog.Root bind:open={manageActionOpen}>
	<Dialog.Content class="sm:max-w-lg">
		{#if selectedGuest && manageAction?.kind === 'edit'}
			<Dialog.Header>
				<Dialog.Title>Edit previous guest</Dialog.Title>
				<Dialog.Description>
					Correct this identity across all of their session records.
				</Dialog.Description>
			</Dialog.Header>
			<form method="POST" action="?/update" use:enhance={enhanceManage} class="space-y-4">
				<input type="hidden" name="attendeeId" value={selectedGuest.attendee.id} />
				<div class="space-y-2">
					<Label for="guest-name">Name</Label>
					<Input id="guest-name" name="name" value={selectedGuest.attendee.name} required />
				</div>
				<div class="space-y-2">
					<Label for="guest-email">Email (optional)</Label>
					<Input
						id="guest-email"
						name="email"
						type="email"
						value={selectedGuest.attendee.email ?? ''}
					/>
				</div>
				<Dialog.Footer>
					<Button type="button" variant="ghost" onclick={() => (manageActionOpen = false)}>
						Cancel
					</Button>
					<Button type="submit">Save changes</Button>
				</Dialog.Footer>
			</form>
		{:else if selectedGuest && manageAction?.kind === 'merge'}
			<Dialog.Header>
				<Dialog.Title>Merge attendee identity</Dialog.Title>
				<Dialog.Description>
					Move all {selectedGuest.participationCount} session {selectedGuest.participationCount ===
					1
						? 'record'
						: 'records'} for {selectedGuest.attendee.name} to the attendee you keep. The old guest identity
					will then be deleted.
				</Dialog.Description>
			</Dialog.Header>
			<form method="POST" action="?/merge" use:enhance={enhanceManage} class="space-y-4">
				<input type="hidden" name="sourceAttendeeId" value={selectedGuest.attendee.id} />
				<div class="space-y-2">
					<Label for="merge-target">Keep this attendee</Label>
					<NativeSelect id="merge-target" name="targetAttendeeId" class="w-full" required>
						<NativeSelectOption value="">Choose an attendee</NativeSelectOption>
						{#each data.identities.filter((row) => row.attendee.id !== selectedGuest?.attendee.id) as target (target.attendee.id)}
							<NativeSelectOption value={target.attendee.id}>
								{target.attendee.name}{target.attendee.email ? ` — ${target.attendee.email}` : ''} — {target.user
									? 'member'
									: 'previous guest'}
							</NativeSelectOption>
						{/each}
					</NativeSelect>
				</div>
				<p class="text-sm text-muted-foreground">
					If both identities appear in the same session, their records will be combined into one.
				</p>
				<Dialog.Footer>
					<Button type="button" variant="ghost" onclick={() => (manageActionOpen = false)}>
						Cancel
					</Button>
					<Button type="submit">Merge identities</Button>
				</Dialog.Footer>
			</form>
		{:else if selectedGuest && manageAction?.kind === 'delete'}
			<Dialog.Header>
				<Dialog.Title>Delete unused guest?</Dialog.Title>
				<Dialog.Description>
					{selectedGuest.attendee.name} has no session records. This removes the identity from the previous-guest
					list.
				</Dialog.Description>
			</Dialog.Header>
			<form method="POST" action="?/delete" use:enhance={enhanceManage}>
				<input type="hidden" name="attendeeId" value={selectedGuest.attendee.id} />
				<Dialog.Footer>
					<Button type="button" variant="ghost" onclick={() => (manageActionOpen = false)}>
						Cancel
					</Button>
					<Button type="submit" variant="destructive">Delete guest</Button>
				</Dialog.Footer>
			</form>
		{/if}
	</Dialog.Content>
</Dialog.Root>
