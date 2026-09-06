<script lang="ts">
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { Button, buttonVariants } from '$lib/components/ui/button';
	import * as Avatar from '$lib/components/ui/avatar/index.js';
	import * as Popover from '$lib/components/ui/popover';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import UsersIcon from '@lucide/svelte/icons/users';
	import { resolve } from '$app/paths';
	import { RSVP_STATUS_LABELS } from '$lib/rsvp-status';
	import { toast } from 'svelte-sonner';
	import type { SessionCalendarLink } from '$shared/session-calendar-links';

	export type SessionParticipantSummary = {
		id: string;
		displayName: string;
		avatarUrl: string | null;
		attendanceStatus: string;
	};

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
		calendarLinks = [],
		participants = []
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
		/** Members who have replied yes or maybe; shown behind a disclosure when provided. */
		participants?: SessionParticipantSummary[];
	} = $props();
	let saving = $state(false);
	const participantStack = $derived(participants.slice(0, 4).toReversed());
	const participantSummary = $derived.by(() => {
		const counts = { attended: 0, attending: 0, maybe: 0 };
		for (const participant of participants) {
			if (participant.attendanceStatus in counts) {
				counts[participant.attendanceStatus as keyof typeof counts] += 1;
			}
		}
		const parts = [];
		if (counts.attended) parts.push(`${counts.attended} attended`);
		if (counts.attending) parts.push(`${counts.attending} attending`);
		if (counts.maybe) parts.push(`${counts.maybe} maybe`);
		return parts.join(' · ');
	});
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

<div
	class="flex flex-col gap-3 rounded-lg border px-3 py-3 text-sm sm:flex-row sm:items-start sm:justify-between"
	aria-live="polite"
>
	{#if sessionStatus === 'cancelled'}
		<p class="font-medium">This session has been cancelled.</p>
	{:else}
		<div class="min-w-0 flex-1 space-y-2">
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
							rel={link.kind === 'ical' || link.kind === 'outlook-mobile'
								? undefined
								: 'noreferrer'}
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
		</div>
		{#if participants.length > 0}
			<div class="sm:shrink-0 sm:pt-0.5">
				<Popover.Root>
					<Popover.Trigger
						class={buttonVariants({
							variant: 'ghost',
							size: 'sm',
							class: '-ml-2 h-auto gap-2 px-2 py-1 font-normal text-muted-foreground'
						})}
					>
						<Avatar.Group data-size="sm" class="shrink-0">
							{#each participantStack as participant (participant.id)}
								<Avatar.Root class="h-6 w-6">
									{#if participant.avatarUrl}
										<Avatar.Image src={participant.avatarUrl} alt={participant.displayName} />
									{/if}
									<Avatar.Fallback class="text-[10px]">
										{participant.displayName.charAt(0).toUpperCase()}
									</Avatar.Fallback>
								</Avatar.Root>
							{/each}
						</Avatar.Group>
						<span>{participantSummary}</span>
						<UsersIcon class="h-3.5 w-3.5" />
					</Popover.Trigger>
					<Popover.Content align="start" class="w-64 space-y-2">
						<p class="text-sm font-medium">Participants</p>
						<ul class="max-h-72 space-y-1.5 overflow-y-auto text-sm">
							{#each participants as participant (participant.id)}
								<li class="flex items-center gap-2">
									<Avatar.Root class="h-6 w-6 shrink-0">
										{#if participant.avatarUrl}
											<Avatar.Image src={participant.avatarUrl} alt={participant.displayName} />
										{/if}
										<Avatar.Fallback class="text-[10px]">
											{participant.displayName.charAt(0).toUpperCase()}
										</Avatar.Fallback>
									</Avatar.Root>
									<a
										href={resolve('/members/[id]', { id: participant.id })}
										class="min-w-0 flex-1 truncate hover:underline"
									>
										{participant.displayName}
									</a>
									{#if participant.attendanceStatus !== 'attending'}
										<Badge variant="outline" class="px-1.5 py-0 text-[10px]">
											{participant.attendanceStatus}
										</Badge>
									{/if}
								</li>
							{/each}
						</ul>
					</Popover.Content>
				</Popover.Root>
			</div>
		{/if}
	{/if}
</div>
