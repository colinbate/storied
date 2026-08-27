<script lang="ts">
	import { enhance } from '$app/forms';
	import { pageTitle } from '$shared/brand';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { toast } from 'svelte-sonner';
	import type { SubmitFunction } from '@sveltejs/kit';

	let { data, form } = $props();
	let creating = $state(false);
	let savingGroupId = $state<string | null>(null);

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

	{#each data.groups as group (group.id)}
		<Card.Root class={group.archivedAt ? 'opacity-75' : undefined}>
			<Card.Header>
				<div class="flex items-center justify-between gap-3">
					<div>
						<Card.Title class="text-base">{group.name}</Card.Title>
						<Card.Description>{group.memberIds.length} members</Card.Description>
					</div>
					{#if group.archivedAt}<Badge variant="outline">Archived</Badge>{/if}
				</div>
			</Card.Header>
			<Card.Content class="space-y-5">
				<form
					method="POST"
					action="?/update"
					class="space-y-3"
					use:enhance={formEnhance(group.id, 'Group details saved.')}
				>
					<input type="hidden" name="groupId" value={group.id} />
					<div class="grid gap-3 sm:grid-cols-2">
						<div class="space-y-2">
							<Label for="group-name-{group.id}">Name</Label>
							<Input
								id="group-name-{group.id}"
								name="name"
								value={group.name}
								minlength={2}
								maxlength={80}
								required
							/>
						</div>
						<div class="space-y-2">
							<Label for="group-description-{group.id}">Description</Label>
							<Textarea
								id="group-description-{group.id}"
								name="description"
								rows={2}
								maxlength={500}
								value={group.description ?? ''}
							/>
						</div>
					</div>
					<Button type="submit" size="sm" variant="outline" disabled={savingGroupId === group.id}
						>Save details</Button
					>
				</form>

				<form
					method="POST"
					action="?/setMembers"
					class="space-y-3"
					use:enhance={formEnhance(group.id, 'Group members saved.')}
				>
					<input type="hidden" name="groupId" value={group.id} />
					<p class="text-sm font-medium">Members</p>
					<div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
						{#each data.members as member (member.id)}
							<label class="flex items-start gap-2 rounded-md border p-2 text-sm">
								<input
									type="checkbox"
									name="memberIds"
									value={member.id}
									checked={group.memberIds.includes(member.id)}
									class="mt-1 rounded border-input"
								/>
								<span class="min-w-0"
									><span class="block truncate font-medium">{member.displayName}</span><span
										class="block truncate text-xs text-muted-foreground">{member.email}</span
									></span
								>
							</label>
						{/each}
					</div>
					<Button type="submit" size="sm" disabled={savingGroupId === group.id}>Save members</Button
					>
				</form>

				<form
					method="POST"
					action="?/setArchived"
					use:enhance={formEnhance(
						group.id,
						group.archivedAt ? 'Group restored.' : 'Group archived.'
					)}
				>
					<input type="hidden" name="groupId" value={group.id} />
					<input type="hidden" name="archived" value={group.archivedAt ? 'false' : 'true'} />
					<Button type="submit" size="sm" variant="secondary" disabled={savingGroupId === group.id}
						>{group.archivedAt ? 'Restore group' : 'Archive group'}</Button
					>
				</form>
			</Card.Content>
		</Card.Root>
	{/each}
</div>
