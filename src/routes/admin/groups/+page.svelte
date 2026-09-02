<script lang="ts">
	import { enhance } from '$app/forms';
	import { pageTitle } from '$shared/brand';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import UsersIcon from '@lucide/svelte/icons/users';
	import { toast } from 'svelte-sonner';
	import type { SubmitFunction } from '@sveltejs/kit';

	let { data, form } = $props();
	let creating = $state(false);
	let savingGroupId = $state<string | null>(null);
	let editDialogOpen = $state(false);
	let editGroupId = $state<string | null>(null);
	const editGroup = $derived(data.groups.find((group) => group.id === editGroupId) ?? null);

	function openGroupEditor(groupId: string) {
		editGroupId = groupId;
		editDialogOpen = true;
	}

	function formEnhance(groupId: string, successMessage: string): SubmitFunction {
		return () => {
			savingGroupId = groupId;
			return async ({ result, update }) => {
				await update({ reset: false });
				savingGroupId = null;
				if (result.type === 'success') toast.success(successMessage);
				if (result.type === 'failure' && result.data?.error) toast.error(String(result.data.error));
			};
		};
	}

	function saveGroupEnhance(groupId: string): SubmitFunction {
		return () => {
			savingGroupId = groupId;
			return async ({ result, update }) => {
				await update({ reset: false });
				savingGroupId = null;
				if (result.type === 'success') {
					toast.success('Group saved.');
					editDialogOpen = false;
				}
				if (result.type === 'failure' && result.data?.error) {
					toast.error(String(result.data.error));
				}
			};
		};
	}
</script>

<svelte:head>
	<title>{pageTitle('Groups — Admin')}</title>
</svelte:head>

<div class="space-y-6">
	<div>
		<h1 class="text-2xl font-bold">Groups</h1>
		<p class="text-sm text-muted-foreground">
			Create audiences for member-only threads. Archived groups retain their history but cannot be
			selected for new threads.
		</p>
	</div>

	<Card.Root>
		<Card.Header>
			<Card.Title class="text-base">Create a group</Card.Title>
		</Card.Header>
		<Card.Content>
			<form
				method="POST"
				action="?/create"
				class="space-y-4"
				use:enhance={() => {
					creating = true;
					return async ({ result, update }) => {
						await update();
						creating = false;
						if (result.type === 'success') toast.success('Group created.');
						if (result.type === 'failure' && result.data?.error)
							toast.error(String(result.data.error));
					};
				}}
			>
				<div class="grid gap-4 sm:grid-cols-2">
					<div class="space-y-2">
						<Label for="new-group-name">Name</Label>
						<Input id="new-group-name" name="name" minlength={2} maxlength={80} required />
					</div>
					<div class="space-y-2">
						<Label for="new-group-description">Description</Label>
						<Input id="new-group-description" name="description" maxlength={500} />
					</div>
				</div>
				<Button type="submit" disabled={creating}>{creating ? 'Creating…' : 'Create group'}</Button>
			</form>
			{#if form?.error}<p class="mt-3 text-sm text-destructive">{form.error}</p>{/if}
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title class="text-base">Existing groups</Card.Title>
			<Card.Description>
				Open a group to change its details, membership, or archive status.
			</Card.Description>
		</Card.Header>
		<Card.Content class="p-0">
			{#if data.groups.length}
				<div class="divide-y">
					{#each data.groups as group (group.id)}
						<div
							class={[
								'flex items-center justify-between gap-4 px-4 py-3 sm:px-6',
								group.archivedAt && 'opacity-70'
							]}
						>
							<div class="min-w-0">
								<div class="flex flex-wrap items-center gap-2">
									<p class="truncate font-medium">{group.name}</p>
									{#if group.archivedAt}<Badge variant="outline">Archived</Badge>{/if}
								</div>
								<p class="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
									<UsersIcon class="h-3.5 w-3.5" />
									{group.memberIds.length}
									{group.memberIds.length === 1 ? 'member' : 'members'}
								</p>
							</div>
							<Button type="button" variant="outline" onclick={() => openGroupEditor(group.id)}>
								<PencilIcon class="h-4 w-4" />
								Edit
							</Button>
						</div>
					{/each}
				</div>
			{:else}
				<p class="px-6 py-8 text-center text-sm text-muted-foreground">No groups yet.</p>
			{/if}
		</Card.Content>
	</Card.Root>
</div>

<Dialog.Root bind:open={editDialogOpen}>
	<Dialog.Content class="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
		<Dialog.Header>
			<Dialog.Title>Edit group</Dialog.Title>
			<Dialog.Description>
				Update the group and its members together, then save once.
			</Dialog.Description>
		</Dialog.Header>
		{#if editGroup}
			<form
				id="edit-group-form"
				method="POST"
				action="?/save"
				use:enhance={saveGroupEnhance(editGroup.id)}
				class="space-y-5"
			>
				<input type="hidden" name="groupId" value={editGroup.id} />
				<div class="grid gap-4 sm:grid-cols-2">
					<div class="space-y-2">
						<Label for="edit-group-name">Name</Label>
						<Input
							id="edit-group-name"
							name="name"
							value={editGroup.name}
							minlength={2}
							maxlength={80}
							required
						/>
					</div>
					<div class="space-y-2">
						<Label for="edit-group-description">Description</Label>
						<Textarea
							id="edit-group-description"
							name="description"
							rows={2}
							maxlength={500}
							value={editGroup.description ?? ''}
						/>
					</div>
				</div>

				<fieldset class="space-y-3">
					<legend class="text-sm font-medium">Members</legend>
					<div class="grid max-h-72 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
						{#each data.members as member (member.id)}
							<label
								class="flex items-start gap-3 rounded-lg border p-3 text-sm transition-colors hover:bg-muted/50"
							>
								<input
									type="checkbox"
									name="memberIds"
									value={member.id}
									checked={editGroup.memberIds.includes(member.id)}
									class="mt-0.5 rounded border-input"
								/>
								<span class="min-w-0">
									<span class="block truncate font-medium">{member.displayName}</span>
									<span class="block truncate text-xs text-muted-foreground">{member.email}</span>
								</span>
							</label>
						{/each}
					</div>
				</fieldset>
			</form>

			<Dialog.Footer class="gap-2 sm:justify-between">
				<form
					method="POST"
					action="?/setArchived"
					use:enhance={formEnhance(
						editGroup.id,
						editGroup.archivedAt ? 'Group restored.' : 'Group archived.'
					)}
				>
					<input type="hidden" name="groupId" value={editGroup.id} />
					<input type="hidden" name="archived" value={editGroup.archivedAt ? 'false' : 'true'} />
					<Button type="submit" variant="secondary" disabled={savingGroupId === editGroup.id}>
						{editGroup.archivedAt ? 'Restore group' : 'Archive group'}
					</Button>
				</form>
				<div class="flex items-center gap-2">
					<Button type="button" variant="ghost" onclick={() => (editDialogOpen = false)}>
						Cancel
					</Button>
					<Button type="submit" form="edit-group-form" disabled={savingGroupId === editGroup.id}>
						{savingGroupId === editGroup.id ? 'Saving…' : 'Save group'}
					</Button>
				</div>
			</Dialog.Footer>
		{/if}
	</Dialog.Content>
</Dialog.Root>
