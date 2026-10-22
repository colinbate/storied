<script lang="ts">
	import { MEETING_FORMATS, mapsUrl, type SessionLogistics } from '$shared/session-logistics';
	let { session }: { session: SessionLogistics } = $props();
</script>

{#if session.meetingFormat || session.locationAddress || session.joiningUrl || session.accessibilityNotes}
	<!-- eslint-disable svelte/no-navigation-without-resolve -- Google Maps and validated external video call URLs -->
	<div class="space-y-2 text-sm">
		{#if session.meetingFormat}<p class="text-muted-foreground">
				{MEETING_FORMATS[session.meetingFormat]}
			</p>{/if}
		{#if session.locationAddress}
			<p class="whitespace-pre-line">{session.locationAddress}</p>
			<p>
				<a
					class="text-primary underline"
					href={mapsUrl(session.locationAddress)}
					target="_blank"
					rel="noreferrer">View on Google Maps</a
				>
			</p>
		{/if}
		{#if session.joiningUrl}<p>
				<a class="text-primary underline" href={session.joiningUrl} target="_blank" rel="noreferrer"
					>Join video call</a
				>
			</p>{/if}
		{#if session.accessibilityNotes}<p class="whitespace-pre-line">
				<span class="font-medium">Accessibility:</span>
				{session.accessibilityNotes}
			</p>{/if}
	</div>
	<!-- eslint-enable svelte/no-navigation-without-resolve -->
{/if}
