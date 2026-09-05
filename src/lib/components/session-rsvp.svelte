<script lang="ts">
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { Button } from '$lib/components/ui/button';
	import { RSVP_STATUS_LABELS } from '$lib/rsvp-status';
	import { toast } from 'svelte-sonner';
	import type { SessionCalendarLink } from '$shared/session-calendar-links';

	let {
		action,
		sessionSlug,
		sessionStatus,
		status,
		canRsvp,
		canDecline,
		capacity,
		attendingCount,
		waitlistEnabled,
		calendarLinks = []
	}: {
		action: string;
		sessionSlug: string;
		sessionStatus: string;
		status: string | null;
		canRsvp: boolean;
		canDecline: boolean;
		capacity: number;
		attendingCount: number;
		waitlistEnabled: boolean;
		calendarLinks?: SessionCalendarLink[];
	} = $props();
	let saving = $state(false);
	const full = $derived(attendingCount >= capacity);
	const registered = $derived(status === 'attending' || status === 'waitlisted');
	const submit: SubmitFunction = () => {
		saving = true;
		return async ({ result, update }) => {
			try {
				await update();
				if (result.type === 'success') {
					if (result.data?.confirmationEmailFailed)
						toast.warning(
							'Your RSVP is saved, but the confirmation email could not be sent. Contact the organizer if you need a copy.'
						);
					else
						toast.success(
							result.data?.status === 'waitlisted'
								? 'You are on the waitlist. We will email you if a place opens.'
								: 'RSVP saved.'
						);
				} else if (result.type === 'failure')
					toast.error(String(result.data?.error ?? 'Could not save your RSVP.'));
			} finally {
				saving = false;
			}
		};
	};
</script>

<div class="space-y-2 rounded-lg border px-3 py-3 text-sm" aria-live="polite">
	{#if sessionStatus === 'cancelled'}
		<p class="font-medium">This session has been cancelled.</p>
	{:else}
		<p class="font-medium">
			{status ? (RSVP_STATUS_LABELS[status] ?? status) : 'You have not replied yet'}
		</p>
		{#if status === 'waitlisted'}
			<p class="text-muted-foreground">
				Your place is not confirmed. We will email you if a spot opens.
			</p>
		{/if}
		{#if registered && calendarLinks.length > 0}
			<div class="flex flex-wrap items-baseline gap-x-2 gap-y-1">
				<span class="text-muted-foreground">Add to</span>
				<!-- eslint-disable svelte/no-navigation-without-resolve -- provider and download URLs are generated from session data -->
				{#each calendarLinks as link (link.kind)}
					<a
						href={link.href}
						target={link.kind === 'ical' || link.kind === 'outlook-mobile' ? undefined : '_blank'}
						rel={link.kind === 'ical' || link.kind === 'outlook-mobile' ? undefined : 'noreferrer'}
						download={link.kind === 'ical'}
						class="font-medium text-primary underline underline-offset-4"
					>
						{link.label}
					</a>
				{/each}
				<!-- eslint-enable svelte/no-navigation-without-resolve -->
			</div>
		{/if}
		{#if canRsvp || (canDecline && registered)}
			{#if canRsvp}<p class="text-muted-foreground">
					{Math.max(0, capacity - attendingCount)} of {capacity} places available.{full &&
					waitlistEnabled
						? ' New RSVPs join the waitlist.'
						: ''}
				</p>{:else}<p class="text-muted-foreground">
					New RSVPs are paused. You can still cancel your place.
				</p>{/if}
			<form method="POST" {action} use:enhance={submit} class="flex flex-wrap gap-2">
				<input type="hidden" name="sessionSlug" value={sessionSlug} />
				{#if canRsvp}<Button
						type="submit"
						name="status"
						value="registered"
						variant={status === 'attending' ? 'default' : 'outline'}
						disabled={saving || registered || (full && !waitlistEnabled)}
					>
						{status === 'attending'
							? 'Confirmed'
							: status === 'waitlisted'
								? 'On the waitlist'
								: full && waitlistEnabled
									? 'Join waitlist'
									: 'I will attend'}
					</Button>{/if}
				<Button
					type="submit"
					name="status"
					value="declined"
					variant={status === 'declined' ? 'default' : 'outline'}
					disabled={saving || status === 'declined'}
				>
					{status === 'waitlisted' ? 'Leave waitlist' : 'I cannot attend'}
				</Button>
			</form>
		{:else}
			<p class="text-muted-foreground">RSVPs are closed.</p>
		{/if}
	{/if}
</div>
