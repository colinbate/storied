<script lang="ts">
	import { enhance } from '$app/forms';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Tabs from '$lib/components/ui/tabs/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import MailIcon from '@lucide/svelte/icons/mail';
	import Clock3Icon from '@lucide/svelte/icons/clock-3';
	import CalendarIcon from '@lucide/svelte/icons/calendar';
	import MessageSquareIcon from '@lucide/svelte/icons/message-square';
	import LibraryIcon from '@lucide/svelte/icons/library';
	import LightbulbIcon from '@lucide/svelte/icons/lightbulb';
	import BellIcon from '@lucide/svelte/icons/bell';
	import ExternalLinkIcon from '@lucide/svelte/icons/external-link';
	import {
		APP_NAME,
		ORGANIZATION_NAME,
		PUBLIC_ABOUT_URL,
		PUBLIC_CONDUCT_URL,
		PUBLIC_ORIGIN,
		pageTitle
	} from '$shared/brand';

	let { form, data } = $props();
	let loading = $state(false);
	let verifying = $state(false);
	let browserTimezone = $state('');
	let mode = $state<'signin' | 'join'>('signin');
	let loadedMode = $state('');
	const successEmail = $derived(form?.email ?? data.startedEmail ?? '');
	const showJoinTab = $derived(data.canSignup);

	$effect(() => {
		if (loadedMode === data.mode) return;
		loadedMode = data.mode;
		mode = data.mode;
	});

	if (typeof window !== 'undefined') {
		try {
			browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? '';
		} catch {
			browserTimezone = '';
		}
	}

	const highlights = [
		{ icon: CalendarIcon, text: 'See the next meeting, RSVP, and share what you are reading.' },
		{
			icon: MessageSquareIcon,
			text: 'Follow the discussion for each session and start your own threads.'
		},
		{ icon: LightbulbIcon, text: 'Suggest themes for future months and see what is in the pool.' },
		{
			icon: LibraryIcon,
			text: 'Browse every book the club has mentioned, with genres and content notes.'
		},
		{
			icon: BellIcon,
			text: 'Email when you want it: immediate, a daily digest, or nothing at all.'
		}
	];

	const submitEnhance = () => {
		loading = true;
		return async ({ update }: { update: () => Promise<void> }) => {
			loading = false;
			await update();
		};
	};
</script>

<svelte:head>
	<title>{pageTitle(mode === 'join' ? 'Join' : 'Sign In')}</title>
</svelte:head>

<div
	class="mx-auto grid w-full max-w-5xl flex-1 items-start gap-10 py-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:pt-12"
>
	<section class="space-y-6">
		<div class="space-y-3">
			<p class="text-sm font-medium tracking-wide text-primary uppercase">{ORGANIZATION_NAME}</p>
			<h1 class="text-3xl font-bold tracking-tight sm:text-4xl">{APP_NAME}</h1>
			<p class="max-w-xl text-lg text-muted-foreground">
				The member space for a monthly book club with no assigned reading. Each month has a theme,
				you read whatever fits, and we compare notes in person and in here.
			</p>
		</div>
		<ul class="space-y-3">
			{#each highlights as highlight (highlight.text)}
				{@const Icon = highlight.icon}
				<li class="flex items-center gap-3 text-sm">
					<span
						class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"
					>
						<Icon class="h-3.5 w-3.5" />
					</span>
					<span>{highlight.text}</span>
				</li>
			{/each}
		</ul>
		<!-- eslint-disable svelte/no-navigation-without-resolve -- public site links -->
		<div class="flex flex-wrap gap-4 text-sm">
			<a
				class="inline-flex items-center gap-1 text-primary hover:underline"
				href={PUBLIC_ABOUT_URL}
				target="_blank"
				rel="noreferrer"
			>
				How the Society works <ExternalLinkIcon class="h-3.5 w-3.5" />
			</a>
			<a
				class="inline-flex items-center gap-1 text-primary hover:underline"
				href={PUBLIC_CONDUCT_URL}
				target="_blank"
				rel="noreferrer"
			>
				Code of Conduct <ExternalLinkIcon class="h-3.5 w-3.5" />
			</a>
			<a
				class="inline-flex items-center gap-1 text-primary hover:underline"
				href={PUBLIC_ORIGIN}
				target="_blank"
				rel="noreferrer"
			>
				Public site <ExternalLinkIcon class="h-3.5 w-3.5" />
			</a>
		</div>
		<!-- eslint-enable svelte/no-navigation-without-resolve -->
	</section>

	<div class="space-y-4">
		{#if data.error && data.error !== 'pending_approval'}
			<div class="rounded border border-destructive p-3 text-sm">
				<strong>Error:</strong>
				{#if data.error?.includes('token')}
					Missing or invalid magic link token.
				{:else if data.error === 'no_signup'}
					Sign up is currently disabled. If you have an account, please make sure you entered the
					email address you are registered with.
				{:else if data.error === 'suspended'}
					This account is not currently allowed to sign in.
				{:else}
					Unknown error.
				{/if}
			</div>
		{/if}

		<Card.Root class="w-full">
			{#if data.error === 'pending_approval'}
				<Card.Header class="text-center">
					<Card.Title class="text-2xl">Approval pending</Card.Title>
				</Card.Header>
				<Card.Content class="space-y-5">
					<div class="rounded-lg border border-primary/20 bg-primary/5 p-5 text-center">
						<div
							class="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10"
						>
							<Clock3Icon class="h-6 w-6 text-primary" />
						</div>
						<p class="text-sm text-muted-foreground">
							Your email has been confirmed and your membership request is waiting for the host to
							approve it. We will email you as soon as your account is active.
						</p>
					</div>
					<p class="text-center text-sm text-muted-foreground">
						You can close this page for now. When you come back, sign in with the same email.
					</p>
				</Card.Content>
			{:else if form?.success || data.startedEmail}
				<Card.Header class="text-center">
					<Card.Title class="text-2xl">Check your inbox</Card.Title>
					<Card.Description>
						We sent a sign-in link to <strong>{successEmail}</strong>
					</Card.Description>
				</Card.Header>
				<Card.Content class="space-y-5">
					<div class="space-y-3 text-center">
						<div
							class="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10"
						>
							<MailIcon class="h-6 w-6 text-primary" />
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
							{verifying ? 'Verifying…' : 'Continue'}
						</Button>
					</form>
				</Card.Content>
			{:else}
				<Card.Header>
					<Tabs.Root bind:value={mode}>
						<Tabs.List class="w-full">
							<Tabs.Trigger value="signin" class="flex-1">Sign in</Tabs.Trigger>
							{#if showJoinTab}
								<Tabs.Trigger value="join" class="flex-1">
									{data.invite ? 'Accept invitation' : 'Join'}
								</Tabs.Trigger>
							{/if}
						</Tabs.List>
					</Tabs.Root>
				</Card.Header>
				<Card.Content>
					{#if mode === 'join' && showJoinTab}
						<form method="POST" action="?/login" use:enhance={submitEnhance} class="space-y-4">
							<div class="space-y-1">
								<h2 class="text-lg font-semibold">
									{data.invite ? 'Accept your invitation' : `Join ${APP_NAME}`}
								</h2>
								<p class="text-sm text-muted-foreground">
									{#if data.invite}
										Use the email address your invitation was sent to.
									{:else if data.signupMode === 'moderated'}
										The host reviews new sign ups before access is granted, usually within a day or
										two. Joining is free and optional; you are welcome at meetings either way.
									{:else}
										Joining is free and optional; you are welcome at meetings either way.
									{/if}
								</p>
							</div>
							<input type="hidden" name="browserTimezone" bind:value={browserTimezone} />
							<input type="hidden" name="invite" value={data.invite} />
							<div
								class="absolute top-auto -left-2500 h-px w-px overflow-hidden"
								aria-hidden="true"
							>
								<Label for="phone-join">Phone</Label>
								<Input id="phone-join" name="phone" type="text" autocomplete="off" />
							</div>
							<div class="space-y-2">
								<Label for="displayName">Your name</Label>
								<Input
									id="displayName"
									name="displayName"
									placeholder="How other members will see you"
									required
									maxlength={50}
									autocomplete="name"
								/>
							</div>
							<div class="space-y-2">
								<Label for="join-email">Email address</Label>
								<Input
									id="join-email"
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
								{loading ? 'Sending…' : 'Request access'}
							</Button>
							<div class="space-y-1 text-xs text-muted-foreground">
								<p>
									You will get a sign-in link by email. No password to remember. This is not the
									RSVP for a meeting; you can RSVP from inside once you are in.
								</p>
								<p>
									By joining you agree that we may email you about the society and its discussions.
									New accounts appear in the member list by default; you can change that in
									Settings.
								</p>
							</div>
						</form>
					{:else}
						<form method="POST" action="?/login" use:enhance={submitEnhance} class="space-y-4">
							<div class="space-y-1">
								<h2 class="text-lg font-semibold">Welcome back</h2>
								<p class="text-sm text-muted-foreground">
									Enter the email address on your account and we will send you a sign-in link.
								</p>
							</div>
							<input type="hidden" name="browserTimezone" bind:value={browserTimezone} />
							<input type="hidden" name="invite" value={data.invite} />
							<div
								class="absolute top-auto -left-2500 h-px w-px overflow-hidden"
								aria-hidden="true"
							>
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
								{loading ? 'Sending…' : 'Send Magic Link'}
							</Button>
							<p class="text-xs text-muted-foreground">
								{#if showJoinTab}
									New here? Use the Join tab to request access.
								{:else}
									We are not accepting new members at the moment. If you have an account, use the
									email address you registered with.
								{/if}
							</p>
						</form>
					{/if}
				</Card.Content>
			{/if}
		</Card.Root>
	</div>
</div>
