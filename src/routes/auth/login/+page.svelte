<script lang="ts">
	import { enhance } from '$app/forms';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import MailIcon from '@lucide/svelte/icons/mail';
	import Clock3Icon from '@lucide/svelte/icons/clock-3';
	import { APP_NAME, APP_SUBTITLE, pageTitle } from '$shared/brand';

	let { form, data } = $props();
	let loading = $state(false);
	let verifying = $state(false);
	let browserTimezone = $state('');
	const successEmail = $derived(form?.email ?? data.startedEmail ?? '');

	if (typeof window !== 'undefined') {
		try {
			browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? '';
		} catch {
			browserTimezone = '';
		}
	}
</script>

<svelte:head>
	<title>{pageTitle('Sign In')}</title>
</svelte:head>

<div class="flex min-h-0 flex-1 flex-col items-center justify-center p-4">
	{#if data.error && data.error !== 'pending_approval'}
		<div class="mb-4 w-full max-w-md rounded border border-destructive p-3">
			<strong>Error:</strong>
			{#if data.error?.includes('token')}
				Missing or invalid magic link token.
			{:else if data.error === 'no_signup'}
				Sign up is currently disabled. If you have an account, please make sure you entered the
				email address you are registered with.
			{:else if data.error === 'pending_approval'}
				Your sign up is waiting for an administrator to approve it.
			{:else if data.error === 'suspended'}
				This account is not currently allowed to sign in.
			{:else}
				Unknown error.
			{/if}
		</div>
	{/if}
	<Card.Root class="w-full max-w-md">
		<Card.Header class="text-center">
			<Card.Title class="text-2xl">Welcome to {APP_NAME}</Card.Title>
			<Card.Description>
				Sign in to {APP_SUBTITLE}.
				<span class="block text-muted-foreground">
					By using this system, you agree that we may send you email related to the society and its
					discussions.
				</span>
				{#if data.signupMode === 'moderated'}
					<span class="block text-muted-foreground">
						New member sign ups are reviewed before access is granted.
					</span>
				{:else if !data.canSignup && !data.invite}
					<span class="block text-destructive">
						At the moment, we are not accepting new member sign ups.
					</span>
				{:else if data.invite}
					<span class="block text-muted-foreground">
						Use the email address your invitation was sent to.
					</span>
				{/if}
			</Card.Description>
		</Card.Header>
		<Card.Content>
			{#if data.error === 'pending_approval'}
				<div class="space-y-5">
					<div class="rounded-lg border border-primary/20 bg-primary/5 p-5 text-center">
						<div
							class="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10"
						>
							<Clock3Icon class="h-6 w-6 text-primary" />
						</div>
						<p class="font-medium">Approval pending</p>
						<p class="mt-2 text-sm text-muted-foreground">
							Your email has been confirmed and your membership request is waiting for an
							administrator to approve it.
						</p>
						<p class="mt-3 text-sm text-muted-foreground">
							We’ll email you as soon as your account is active.
						</p>
					</div>
					<div class="text-center text-sm text-muted-foreground">
						You can close this page for now. When you come back, just sign in with the same email.
					</div>
				</div>
			{:else if form?.success || data.startedEmail}
				<div class="space-y-5">
					<div class="space-y-3 text-center">
						<div
							class="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10"
						>
							<MailIcon class="h-6 w-6 text-primary" />
						</div>
						<div>
							<p class="font-medium">Check your inbox</p>
							<p class="mt-1 text-sm text-muted-foreground">
								We sent a sign-in link to <strong>{successEmail}</strong>
							</p>
						</div>
						<p class="text-xs text-muted-foreground">
							Click the link in the email, or enter the 6-digit code below. The link and code expire
							in 15 minutes.
						</p>
					</div>
					<form
						method="POST"
						action="?/code"
						use:enhance={() => {
							verifying = true;
							return async ({ update }) => {
								verifying = false;
								await update();
							};
						}}
						class="space-y-4"
					>
						<input type="hidden" name="email" value={successEmail} />
						<div class="space-y-2">
							<Label for="code">Sign-in code</Label>
							<Input
								id="code"
								name="code"
								type="text"
								inputmode="numeric"
								maxlength={7}
								autocomplete="one-time-code"
								placeholder="123 456"
								required
								autofocus
								class="text-center text-lg tracking-[0.4em]"
							/>
						</div>
						{#if form?.codeError}
							<p class="text-sm text-destructive">{form.codeError}</p>
						{/if}
						<Button type="submit" class="w-full" disabled={verifying}>
							{#if verifying}
								Verifying…
							{:else}
								Continue
							{/if}
						</Button>
					</form>
				</div>
			{:else}
				<form
					method="POST"
					action="?/login"
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
					<input type="hidden" name="invite" value={data.invite} />
					<div class="absolute top-auto -left-2500 h-px w-px overflow-hidden" aria-hidden="true">
						<Label for="phone">Phone</Label>
						<Input id="phone" name="phone" type="text" autocomplete="off" />
					</div>
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
							autofocus
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
