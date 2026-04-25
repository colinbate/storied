<script lang="ts">
	import { onMount } from 'svelte';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import CheckIcon from '@lucide/svelte/icons/check';

	let { data } = $props();
	let formEl: HTMLFormElement | undefined = $state();

	onMount(() => {
		// Auto-submit so the browser performs the POST without user interaction
		// on modern (JS-enabled) clients. The <noscript> fallback below covers
		// everyone else.
		formEl?.requestSubmit();
	});
</script>

<svelte:head>
	<title>Signing in… — The Archive</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="flex min-h-0 flex-1 flex-col items-center justify-center p-4">
	<Card.Root class="w-full max-w-md">
		<Card.Header class="text-center">
			<div
				class="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10"
			>
				<CheckIcon class="h-6 w-6 text-primary" />
			</div>
			<Card.Title class="text-2xl">Token verified</Card.Title>
			<Card.Description>Finishing sign-in…</Card.Description>
		</Card.Header>
		<Card.Content>
			<form bind:this={formEl} method="POST" class="space-y-3">
				<input type="hidden" name="token" value={data.token} />
				<Button type="submit" class="w-full">Continue to app</Button>
			</form>
		</Card.Content>
	</Card.Root>
</div>
