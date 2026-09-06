<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { toast } from 'svelte-sonner';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button, buttonVariants } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import * as Avatar from '$lib/components/ui/avatar/index.js';
	import CalendarIcon from '@lucide/svelte/icons/calendar';
	import MessageSquareIcon from '@lucide/svelte/icons/message-square';
	import LibraryIcon from '@lucide/svelte/icons/library';
	import LightbulbIcon from '@lucide/svelte/icons/lightbulb';
	import UsersIcon from '@lucide/svelte/icons/users';
	import BellIcon from '@lucide/svelte/icons/bell';
	import SearchIcon from '@lucide/svelte/icons/search';
	import MailIcon from '@lucide/svelte/icons/mail';
	import ExternalLinkIcon from '@lucide/svelte/icons/external-link';
	import ArrowRightIcon from '@lucide/svelte/icons/arrow-right';
	import {
		APP_NAME,
		ORGANIZATION_NAME,
		PUBLIC_ABOUT_URL,
		PUBLIC_CONDUCT_URL,
		pageTitle
	} from '$shared/brand';
	import { formatDate } from '$lib/date-format';
	import { RSVP_STATUS_LABELS } from '$lib/rsvp-status';

	let { data, form } = $props();
	const timeZone = $derived(data.user?.timezone);
	let openingConversation = $state(false);

	const messageHostEnhance: SubmitFunction = () => {
		openingConversation = true;
		return async ({ result, update }) => {
			openingConversation = false;
			if (result.type === 'failure' && result.data?.error) {
				toast.error(String(result.data.error));
			}
			await update();
		};
	};

	const features = [
		{
			icon: CalendarIcon,
			title: 'Sessions',
			href: '/sessions' as const,
			body: 'Every monthly meeting has a page: when and where, the theme, RSVP, who is coming, what people are reading, and the discussion thread for that meeting.'
		},
		{
			icon: MessageSquareIcon,
			title: 'Discussions',
			href: '/discussions' as const,
			body: 'Threads by category for recommendations, book talk, and announcements. Reply to a specific post, paste a Goodreads or Hardcover link and the book is attached automatically.'
		},
		{
			icon: LightbulbIcon,
			title: 'Themes',
			href: '/themes' as const,
			body: 'Suggest theme ideas for future months and see what is in the pool. Themes are chosen together at the end of each meeting.'
		},
		{
			icon: LibraryIcon,
			title: 'Library',
			href: '/library' as const,
			body: 'Every book, series, and author mentioned in the club, with genres, content notes such as spicy or AI-assisted, and the sessions they came up in.'
		},
		{
			icon: UsersIcon,
			title: 'Members',
			href: '/members' as const,
			body: 'Profiles with favourite genres and featured books. Send a private message from any profile.'
		},
		{
			icon: BellIcon,
			title: 'Notifications',
			href: '/settings' as const,
			body: 'Choose immediate emails, a daily digest, or quiet. Follow individual threads or whole categories from the bell menu on each page.'
		}
	];
</script>

<svelte:head>
	<title>{pageTitle('Welcome')}</title>
</svelte:head>

<div class="mx-auto w-full max-w-4xl space-y-10">
	<section class="space-y-3">
		<Badge variant="secondary">{data.isFirstVisit ? 'Welcome' : 'Help'}</Badge>
		<h1 class="text-3xl font-bold tracking-tight">
			{data.isFirstVisit ? `Welcome to ${APP_NAME}` : `Finding your way around ${APP_NAME}`}
		</h1>
		<p class="max-w-2xl text-lg text-muted-foreground">
			This is the {ORGANIZATION_NAME}'s member space. There is no assigned reading: each month has a
			theme, you read anything that fits, and we compare notes. Here is how to get the most out of
			it.
		</p>
		{#if data.next}
			<!-- eslint-disable svelte/no-navigation-without-resolve -- validated same-origin path from the sign-in redirect -->
			<a class={buttonVariants({ variant: 'outline' })} href={data.next}>
				Continue to where you were headed
				<ArrowRightIcon class="h-4 w-4" />
			</a>
			<!-- eslint-enable svelte/no-navigation-without-resolve -->
		{/if}
	</section>

	<section class="grid gap-4 md:grid-cols-2">
		<Card.Root class="border-primary/40 bg-primary/5">
			<Card.Header>
				<Card.Title class="flex items-center gap-2 text-base">
					<CalendarIcon class="h-4 w-4" /> Start with the next meeting
				</Card.Title>
			</Card.Header>
			<Card.Content class="space-y-3">
				{#if data.nextSession}
					<div>
						<a
							href={resolve('/sessions/[slug]', { slug: data.nextSession.slug })}
							class="text-lg font-semibold hover:underline"
						>
							{data.nextSession.title}
						</a>
						{#if data.nextSession.themeTitle ?? data.nextSession.theme}
							<p class="text-muted-foreground">
								Theme: {data.nextSession.themeTitle ?? data.nextSession.theme}
							</p>
						{/if}
						{#if data.nextSession.startsAt}
							<p class="text-sm text-muted-foreground">
								{formatDate(data.nextSession.startsAt, {
									time: 'always',
									timeZone: data.nextSession.timezone ?? timeZone,
									dateStyle: 'full'
								})}{data.nextSession.locationName ? ` · ${data.nextSession.locationName}` : ''}
							</p>
						{/if}
					</div>
					<ol class="list-decimal space-y-1 pl-5 text-sm">
						<li>
							RSVP on the session page so the host knows numbers.
							{#if data.nextSessionRsvpStatus}
								<span class="text-muted-foreground">
									You are marked as {RSVP_STATUS_LABELS[data.nextSessionRsvpStatus] ??
										data.nextSessionRsvpStatus}.
								</span>
							{/if}
						</li>
						<li>
							Pick any book that fits the theme. Audiobooks count. The starter list is a good place
							to look.
						</li>
						<li>
							Add your reading choice on the session page so others can see what is being read.
						</li>
						<li>
							Drop questions or notes in the session discussion{#if data.discussionReplyCount}
								&nbsp;({data.discussionReplyCount}
								{data.discussionReplyCount === 1 ? 'reply' : 'replies'} so far){/if}.
						</li>
					</ol>
					<Button href={resolve('/sessions/[slug]', { slug: data.nextSession.slug })}>
						Open the session
						<ArrowRightIcon class="h-4 w-4" />
					</Button>
				{:else}
					<p class="text-sm text-muted-foreground">
						The next meeting has not been published yet. Sessions appear here as soon as the host
						schedules one.
					</p>
					<Button variant="outline" href={resolve('/sessions')}>Browse past sessions</Button>
				{/if}
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title class="flex items-center gap-2 text-base">
					<MailIcon class="h-4 w-4" /> Questions? Ask the host
				</Card.Title>
			</Card.Header>
			<Card.Content class="space-y-3 text-sm">
				{#if data.host}
					<div class="flex items-center gap-3">
						<Avatar.Root class="h-10 w-10">
							{#if data.host.avatarUrl}
								<Avatar.Image src={data.host.avatarUrl} alt={data.host.displayName} />
							{/if}
							<Avatar.Fallback>{data.host.displayName.charAt(0).toUpperCase()}</Avatar.Fallback>
						</Avatar.Root>
						<div>
							<p class="font-medium">{data.host.displayName}</p>
							<p class="text-muted-foreground">Runs the club and {APP_NAME}</p>
						</div>
					</div>
					<p class="text-muted-foreground">
						Looking for reading ideas? Ask in the session discussion so everyone benefits. Cannot
						make a meeting? Update your RSVP on the session page. For anything else, and especially
						if a post or a member's behaviour bothered you, message the host. Private messages go
						only to the host.
					</p>
					<form method="POST" action="?/messageHost" use:enhance={messageHostEnhance}>
						<Button type="submit" variant="outline" disabled={openingConversation}>
							<MailIcon class="h-4 w-4" />
							{openingConversation ? 'Opening…' : 'Message the host'}
						</Button>
					</form>
				{:else}
					<p class="text-muted-foreground">
						You are the host here. Members will see a button to message you in this spot.
					</p>
				{/if}
				{#if form?.error}
					<p class="text-destructive">{form.error}</p>
				{/if}
			</Card.Content>
		</Card.Root>
	</section>

	<section class="space-y-4">
		<div>
			<h2 class="text-xl font-semibold">What is here</h2>
			<p class="text-sm text-muted-foreground">
				The same sections as the navigation bar, with what each one is for.
			</p>
		</div>
		<div class="grid gap-4 sm:grid-cols-2">
			{#each features as feature (feature.href)}
				{@const Icon = feature.icon}
				<a href={resolve(feature.href)} class="block">
					<Card.Root class="h-full transition-colors hover:border-primary/40">
						<Card.Header>
							<Card.Title class="flex items-center gap-2 text-base">
								<Icon class="h-4 w-4 text-primary" />
								{feature.title}
							</Card.Title>
							<Card.Description>{feature.body}</Card.Description>
						</Card.Header>
					</Card.Root>
				</a>
			{/each}
		</div>
	</section>

	<section class="grid gap-4 md:grid-cols-2">
		<Card.Root>
			<Card.Header>
				<Card.Title class="text-base">A few habits that keep it friendly</Card.Title>
			</Card.Header>
			<Card.Content>
				<ul class="list-disc space-y-1.5 pl-5 text-sm">
					<li>Warn before spoilers, and keep pitches spoiler-light.</li>
					<li>Did not finish the book? Come anyway. Listening counts.</li>
					<li>Not every book is for every reader. Disagree with the book, not the person.</li>
					<li>
						Posts are visible to all approved members, so write as you would speak at a meeting.
					</li>
				</ul>
				<!-- eslint-disable svelte/no-navigation-without-resolve -- public site links -->
				<div class="mt-4 flex flex-wrap gap-3 text-sm">
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
						href={PUBLIC_ABOUT_URL}
						target="_blank"
						rel="noreferrer"
					>
						How meetings work <ExternalLinkIcon class="h-3.5 w-3.5" />
					</a>
				</div>
				<!-- eslint-enable svelte/no-navigation-without-resolve -->
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title class="text-base">Small things worth knowing</Card.Title>
			</Card.Header>
			<Card.Content>
				<ul class="list-disc space-y-1.5 pl-5 text-sm">
					<li>
						<SearchIcon class="mr-1 inline h-3.5 w-3.5" /> Search covers threads, sessions, and the library.
					</li>
					<li>You can edit your own posts for 24 hours after posting.</li>
					<li>Your profile is listed to other members by default. Change that under Settings.</li>
					<li>
						Reading choices are separate from RSVPs, so you can share a book even if you cannot
						attend.
					</li>
					<li>This page is always available from your avatar menu under Help and Tour.</li>
				</ul>
			</Card.Content>
		</Card.Root>
	</section>

	<div class="flex flex-wrap gap-3">
		<Button href={resolve('/')}>
			Go to Home
			<ArrowRightIcon class="h-4 w-4" />
		</Button>
		<Button variant="outline" href={resolve('/settings')}>Review notification settings</Button>
	</div>
</div>
