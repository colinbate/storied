<script lang="ts">
	import { resolve } from '$app/paths';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';
	import { NativeSelect, NativeSelectOption } from '$lib/components/ui/native-select';
	import { MEETING_FORMATS, type SessionLogistics } from '$shared/session-logistics';
	import type { venues as venueTable } from '$lib/server/db/schema';
	type Venue = typeof venueTable.$inferSelect;
	let {
		venues = [],
		initial = {},
		id = 'logistics',
		library = true
	}: {
		venues?: Venue[];
		initial?: SessionLogistics;
		id?: string;
		library?: boolean;
	} = $props();
	let venueId = $derived(initial.venueId ?? '');
	let locationName = $derived(initial.locationName ?? '');
	let meetingFormat = $derived(initial.meetingFormat ?? '');
	let locationAddress = $derived(initial.locationAddress ?? '');
	let joiningUrl = $derived(initial.joiningUrl ?? '');
	let accessibilityNotes = $derived(initial.accessibilityNotes ?? '');
	const availableVenues = $derived(
		venues.filter((venue) => !venue.archivedAt || venue.id === initial.venueId)
	);
	function selectVenue(event: Event) {
		venueId = (event.currentTarget as HTMLSelectElement).value;
		const venue = venues.find((venue) => venue.id === venueId);
		locationName = venue?.name ?? '';
		meetingFormat = venue?.meetingFormat ?? '';
		locationAddress = venue?.address ?? '';
		joiningUrl = venue?.joiningUrl ?? '';
		accessibilityNotes = venue?.accessibilityNotes ?? '';
	}
</script>

<fieldset class="space-y-4 rounded-lg border p-4">
	<legend class="px-1 text-sm font-medium">{library ? 'Meeting location' : 'Venue details'}</legend>
	{#if library}
		<input type="hidden" name="logisticsVenueId" value={venueId} />
		<div class="space-y-2">
			<Label for={`${id}-venue`}>Saved venue</Label>
			<NativeSelect id={`${id}-venue`} name="venueId" bind:value={venueId} onchange={selectVenue}>
				<NativeSelectOption value="">Enter a location</NativeSelectOption>
				{#each availableVenues as venue (venue.id)}
					<NativeSelectOption value={venue.id}
						>{venue.name}{venue.archivedAt ? ' (archived)' : ''}</NativeSelectOption
					>
				{/each}
			</NativeSelect>
			<p class="text-xs text-muted-foreground">
				Choose a saved venue or enter a location below. <a
					class="underline"
					href={resolve('/admin/venues')}>Manage venues</a
				>
			</p>
		</div>
	{/if}
	<div class="space-y-2">
		<Label for={`${id}-name`}>{library ? 'Public location name' : 'Venue name'}</Label>
		<Input
			id={`${id}-name`}
			name="locationName"
			bind:value={locationName}
			maxlength={200}
			required={!library}
		/>
	</div>
	<div class="space-y-2">
		<Label for={`${id}-format`}>Meeting format</Label>
		<NativeSelect
			id={`${id}-format`}
			name="meetingFormat"
			bind:value={meetingFormat}
			required={!library}
		>
			{#if library}<NativeSelectOption value="">Unspecified</NativeSelectOption>{/if}
			{#each Object.entries(MEETING_FORMATS) as [value, label] (value)}
				<NativeSelectOption {value}>{label}</NativeSelectOption>
			{/each}
		</NativeSelect>
	</div>
	<p class="text-xs text-muted-foreground">
		The details below are visible to members and confirmed RSVP guests.
	</p>
	<div class="space-y-2">
		<Label for={`${id}-address`}>Full address (optional)</Label>
		<Textarea
			id={`${id}-address`}
			name="locationAddress"
			bind:value={locationAddress}
			maxlength={2000}
			rows={3}
		/>
	</div>
	<div class="space-y-2">
		<Label for={`${id}-joining`}>Video call link (optional)</Label>
		<Input
			id={`${id}-joining`}
			name="joiningUrl"
			type="url"
			bind:value={joiningUrl}
			maxlength={4000}
			placeholder="https://"
		/>
	</div>
	<div class="space-y-2">
		<Label for={`${id}-accessibility`}>Accessibility information (optional)</Label>
		<Textarea
			id={`${id}-accessibility`}
			name="accessibilityNotes"
			bind:value={accessibilityNotes}
			maxlength={4000}
			rows={3}
		/>
	</div>
	{#if library}<p class="text-xs text-muted-foreground">
			Selecting a venue copies its details into this session. Changes to the venue library apply
			when you select it for another session.
		</p>{/if}
</fieldset>
