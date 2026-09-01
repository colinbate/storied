<script lang="ts">
	import { page } from '$app/state';
	import * as Card from '$lib/components/ui/card/index.js';
	import { pageTitle } from '$shared/brand';
	const status = $derived(page.url.searchParams.get('status') ?? 'registered');
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
			><Card.Title>{heading}</Card.Title><Card.Description
				>{status === 'waitlisted'
					? "We'll email you if a spot opens."
					: status === 'declined'
						? 'We have recorded that you cannot attend.'
						: 'Check your email for confirmation and cancellation details.'}</Card.Description
			></Card.Header
		></Card.Root
	>
</div>
