<script lang="ts">
	import { enhance } from '$app/forms';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import MailIcon from '@lucide/svelte/icons/mail';

	let { form, data } = $props();
	let loading = $state(false);
	let browserTimezone = $state('');

	if (typeof window !== 'undefined') {
		try {
			browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? '';
		} catch {
			browserTimezone = '';
		}
	}
</script>

<svelte:head>
	<title>Sign In — Storied</title>
</svelte:head>

<div class="flex min-h-0 flex-1 flex-col items-center justify-center p-4">
	{#if data.error}
		<div class="mb-4 w-full max-w-md rounded border border-destructive p-3">
			<strong>Error:</strong>
			{#if data.error?.includes('token')}
				Missing or invalid magic link token.
			{:else if data.error === 'no_signup'}
				Sign up is currently disabled. If you have an account, please make sure you entered the
				email address you are registered with.
			{:else}
				Unknown error.
			{/if}
		</div>
	{/if}
	<Card.Root class="w-full max-w-md">
		<Card.Header class="text-center">
			<Card.Title class="text-2xl">Welcome</Card.Title>
			<Card.Description>
				Sign in to Bermuda Triangle Society Discussions.
				{#if !data.canSignup}
					<span class="block text-destructive">
						At the moment, we are not accepting new member sign ups.
					</span>
				{/if}
			</Card.Description>
		</Card.Header>
		<Card.Content>
			{#if form?.success}
				<div class="space-y-4 text-center">
					<div
						class="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10"
					>
						<MailIcon class="h-6 w-6 text-primary" />
					</div>
					<div>
						<p class="font-medium">Check your inbox</p>
						<p class="mt-1 text-sm text-muted-foreground">
							We sent a sign-in link to <strong>{form.email}</strong>
						</p>
					</div>
					<p class="text-xs text-muted-foreground">
						The link expires in 15 minutes. Check your spam folder if you don't see it.
					</p>
				</div>
			{:else}
				<form
					method="POST"
					use:enhance={() => {
						loading = true;
						return async ({ update }) => {
							loading = false;
							await update();
						};
					}}
					class="space-y-4"
				>
					<input type="hidden" name="browserTimezone" bind:value={browserTimezone} />
					<div class="space-y-2">
						<Label for="email">Email address</Label>
						<Input
							id="email"
							name="email"
							type="email"
							placeholder="you@example.com"
							required
							value={form?.email ?? ''}
							autocomplete="email"
						/>
					</div>
					{#if form?.error}
						<p class="text-sm text-destructive">{form.error}</p>
					{/if}
					<Button type="submit" class="w-full" disabled={loading}>
						{#if loading}
							Sending…
						{:else}
							Send Magic Link
						{/if}
					</Button>
				</form>
			{/if}
		</Card.Content>
	</Card.Root>
</div>
