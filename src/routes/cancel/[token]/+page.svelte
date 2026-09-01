<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { pageTitle } from '$shared/brand';
	let { data, form } = $props();
	const cancelled = $derived(form?.cancelled || data.participant.attendanceStatus === 'cancelled');
</script>

<svelte:head><title>{pageTitle('Cancel registration')}</title></svelte:head>
<div class="mx-auto max-w-lg py-12">
	<Card.Root
		><Card.Header
			><Card.Title>{cancelled ? 'Registration cancelled' : 'Cancel registration'}</Card.Title
			><Card.Description>{data.session.title}</Card.Description></Card.Header
		><Card.Content
			>{#if cancelled}<p>Your registration has been cancelled.</p>{:else}<p class="mb-5">
					Registered as <strong>{data.attendee.name}</strong>. Are you sure you cannot attend?
				</p>
				<form method="POST" use:enhance>
					<Button type="submit" variant="destructive">Cancel my registration</Button>
				</form>{/if}</Card.Content
		></Card.Root
	>
</div>
