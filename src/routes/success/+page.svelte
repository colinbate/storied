<script lang="ts">
	import { page } from '$app/state';
	import * as Card from '$lib/components/ui/card/index.js';
	import { pageTitle } from '$shared/brand';
	const status = $derived(page.url.searchParams.get('status') ?? 'registered');
	const emailFailed = $derived(page.url.searchParams.get('email') === 'failed');
	const heading = $derived(
		status === 'waitlisted'
			? "You're on the waitlist"
			: status === 'declined'
				? 'Response saved'
				: "You're registered"
	);
</script>

<svelte:head><title>{pageTitle('RSVP received')}</title></svelte:head>
<div class="mx-auto max-w-lg py-12">
	<Card.Root
		><Card.Header
			><Card.Title>{heading}</Card.Title>
			{#if emailFailed}<p class="text-sm">
					Your RSVP is saved, but the confirmation email could not be sent. Contact the organizer
					for a copy.
				</p>{/if}<Card.Description
				>{status === 'waitlisted'
					? "We'll email you if a spot opens."
					: status === 'declined'
						? 'We have recorded that you cannot attend.'
						: emailFailed
							? 'Your place is confirmed.'
							: 'Check your email for confirmation and cancellation details.'}</Card.Description
			></Card.Header
		></Card.Root
	>
</div>
