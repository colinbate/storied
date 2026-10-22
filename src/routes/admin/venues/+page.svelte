<script lang="ts">
	import { enhance } from '$app/forms';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import SessionLogisticsEditor from '$lib/components/admin/session-logistics-editor.svelte';
	import { pageTitle } from '$shared/brand';
	let { data, form } = $props();
	let showCreateForm = $state(false);
	let creating = $state(false);
	function focusVenueName(formElement: HTMLFormElement) {
		formElement.querySelector<HTMLInputElement>('input[name="locationName"]')?.focus();
	}
</script>

<svelte:head><title>{pageTitle('Venues')}</title></svelte:head>
<div class="space-y-6">
	<div class="flex items-center justify-between gap-4">
		<div>
			<h1 class="text-2xl font-bold">Venues</h1>
			<p class="text-sm text-muted-foreground">
				Save locations and video calls to reuse when creating sessions.
			</p>
		</div>
		<Button
			size="sm"
			onclick={() => (showCreateForm = !showCreateForm)}
			aria-expanded={showCreateForm}
			aria-controls="create-venue"
			disabled={creating}
		>
			<PlusIcon class="h-4 w-4" />
			Add Venue
		</Button>
	</div>
	{#if form?.error}<p role="alert" class="rounded border border-destructive p-3 text-destructive">
			{form.error}
		</p>{/if}
	{#if form?.saved}<p role="status" class="text-sm">Venue saved.</p>{/if}
	{#if showCreateForm}
		<Card.Root id="create-venue">
			<Card.Header>
				<Card.Title class="text-base">Add a Venue</Card.Title>
			</Card.Header>
			<Card.Content>
				<form
					{@attach focusVenueName}
					method="POST"
					action="?/save"
					use:enhance={() => {
						creating = true;
						return async ({ result, update }) => {
							try {
								await update({ reset: result.type === 'success' });
								if (result.type === 'success' && result.data?.saved) showCreateForm = false;
							} finally {
								creating = false;
							}
						};
					}}
					class="space-y-4"
				>
					<SessionLogisticsEditor
						library={false}
						initial={{ meetingFormat: 'in_person' }}
						id="new-venue"
					/>
					<div class="flex gap-2">
						<Button type="submit" disabled={creating}>
							{creating ? 'Saving…' : 'Save Venue'}
						</Button>
						<Button
							type="button"
							variant="ghost"
							onclick={() => (showCreateForm = false)}
							disabled={creating}>Cancel</Button
						>
					</div>
				</form>
			</Card.Content>
		</Card.Root>
	{/if}
	{#each data.venues as venue (venue.id)}
		<details class="rounded-lg border p-4">
			<summary class="cursor-pointer font-medium"
				>{venue.name}{venue.archivedAt ? ' (archived)' : ''}</summary
			>
			<form
				id={`venue-edit-${venue.id}`}
				method="POST"
				action="?/save"
				use:enhance={() =>
					async ({ update, result }) => {
						await update({ reset: result.type === 'success' });
					}}
				class="mt-4 space-y-4"
			>
				<input type="hidden" name="id" value={venue.id} />
				<input type="hidden" name="expectedUpdatedAt" value={venue.updatedAt} />
				<SessionLogisticsEditor
					library={false}
					id={venue.id}
					initial={{
						locationName: venue.name,
						meetingFormat: venue.meetingFormat,
						locationAddress: venue.address,
						joiningUrl: venue.joiningUrl,
						accessibilityNotes: venue.accessibilityNotes
					}}
				/>
			</form>
			<div class="mt-4 flex items-center justify-between gap-4">
				<Button type="submit" form={`venue-edit-${venue.id}`}>Save changes</Button>
				<form method="POST" action="?/archive" use:enhance>
					<input type="hidden" name="id" value={venue.id} />
					{#if venue.archivedAt}<input type="hidden" name="restore" value="yes" />{/if}
					<Button type="submit" variant="outline"
						>{venue.archivedAt ? 'Restore venue' : 'Archive venue'}</Button
					>
				</form>
			</div>
		</details>
	{/each}
</div>
