<script lang="ts">
	import * as Card from '$lib/components/ui/card/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import * as Avatar from '$lib/components/ui/avatar/index.js';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import MessageSquareIcon from '@lucide/svelte/icons/message-square';
	import PinIcon from '@lucide/svelte/icons/pin';
	import LockIcon from '@lucide/svelte/icons/lock';
	import CalendarIcon from '@lucide/svelte/icons/calendar';
	import MapPinIcon from '@lucide/svelte/icons/map-pin';
	import { resolve } from '$app/paths';
	import { formatDate } from '$lib/date-format';
	import { APP_NAME, APP_SUBTITLE, pageTitle } from '$shared/brand';

	let { data } = $props();
	const timeZone = $derived(data.user?.timezone);
</script>

<svelte:head>
	<title>{pageTitle()}</title>
</svelte:head>

<div class="space-y-8">
	<!-- Header section -->
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-2xl font-bold">{APP_NAME}</h1>
			<p class="text-muted-foreground">{APP_SUBTITLE}</p>
		</div>
		<Button href="/new">
			<PlusIcon class="h-4 w-4" />
			New Thread
		</Button>
	</div>

	{#if data.currentSession}
		<section>
			<a href={resolve('/sessions/[slug]', { slug: data.currentSession.slug })} class="block">
				<Card.Root class="border-primary/40 bg-primary/5 transition-colors hover:border-primary">
					<Card.Content class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
						<div class="min-w-0">
							<div class="mb-2 flex flex-wrap items-center gap-2">
								<Badge variant={data.currentSession.status === 'current' ? 'default' : 'secondary'}>
									{data.currentSession.status === 'current' ? 'Current session' : 'Next session'}
								</Badge>
							</div>
							<h2 class="text-xl font-semibold">{data.currentSession.title}</h2>
							{#if data.currentSession.themeTitle ?? data.currentSession.theme}
								<p class="mt-1 text-muted-foreground">
									{data.currentSession.themeTitle ?? data.currentSession.theme}
								</p>
							{/if}
							<div class="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
								{#if data.currentSession.startsAt}
									<span class="inline-flex items-center gap-1">
										<CalendarIcon class="h-4 w-4" />
										{formatDate(data.currentSession.startsAt, {
											time: 'always',
											timeZone,
											dateStyle: 'medium'
										})}
									</span>
								{/if}
								{#if data.currentSession.locationName}
									<span class="inline-flex items-center gap-1">
										<MapPinIcon class="h-4 w-4" />
										{data.currentSession.locationName}
									</span>
								{/if}
							</div>
						</div>
						<span
							class="inline-flex h-9 items-center justify-center rounded-md border bg-background px-4 text-sm font-medium"
						>
							View Session
						</span>
					</Card.Content>
				</Card.Root>
			</a>
		</section>
	{/if}

	{#if data.featuredDiscussion}
		<section>
			<Card.Root class="border-primary/30">
				<Card.Header class="space-y-2">
					<div class="flex items-center gap-2 text-sm font-medium text-primary">
						<MessageSquareIcon class="h-4 w-4" />
						Main discussion
					</div>
					<Card.Title class="text-xl">{data.featuredDiscussion.thread.title}</Card.Title>
					<Card.Description>
						Started by {data.featuredDiscussion.author.displayName}
					</Card.Description>
				</Card.Header>
				<Card.Content class="space-y-4">
					<p class="line-clamp-3 text-sm leading-6 text-muted-foreground">
						{data.featuredDiscussion.thread.bodySource}
					</p>
					<div class="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
						<span>
							{data.featuredDiscussion.thread.replyCount}
							{data.featuredDiscussion.thread.replyCount === 1 ? 'reply' : 'replies'}
						</span>
						<span>·</span>
						<span
							>{formatDate(
								data.featuredDiscussion.thread.lastPostAt ??
									data.featuredDiscussion.thread.createdAt,
								{ time: 'never', timeZone }
							)}</span
						>
					</div>
					<Button
						variant="outline"
						href={resolve('/thread/[slug]', { slug: data.featuredDiscussion.thread.slug })}
					>
						Open Discussion
					</Button>
				</Card.Content>
			</Card.Root>
		</section>
	{/if}

	<!-- Recent Threads -->
	<section>
		<h2 class="mb-3 text-lg font-semibold">Recent Activity</h2>
		{#if data.recentThreads.length === 0}
			<Card.Root>
				<Card.Content class="py-12 text-center text-muted-foreground">
					<MessageSquareIcon class="mx-auto mb-3 h-8 w-8 opacity-50" />
					<p>No threads yet. Be the first to start a discussion!</p>
				</Card.Content>
			</Card.Root>
		{:else}
			<div class="space-y-3">
				{#each data.recentThreads as { thread, author } (thread.id)}
					<a href={resolve(`/thread/${thread.slug}`)} class="block">
						<Card.Root class="transition-colors hover:border-primary/30">
							<Card.Content class="flex items-center gap-3">
								<Avatar.Root class="h-8 w-8 shrink-0">
									{#if author.avatarUrl}
										<Avatar.Image src={author.avatarUrl} alt={author.displayName} />
									{/if}
									<Avatar.Fallback class="text-xs"
										>{author.displayName.charAt(0).toUpperCase()}</Avatar.Fallback
									>
								</Avatar.Root>
								<div class="min-w-0 flex-1">
									<div class="flex items-center gap-2">
										<h3 class="truncate text-base font-medium">{thread.title}</h3>
										{#if thread.isPinned}
											<PinIcon class="h-3.5 w-3.5 shrink-0 text-primary" />
										{/if}
										{#if thread.isLocked}
											<LockIcon class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
										{/if}
									</div>
									<div class="mt-0.5 flex items-center gap-2 text-sm text-muted-foreground">
										<span>{author.displayName}</span>
										<span>·</span>
										<span>{formatDate(thread.lastPostAt, { time: 'never', timeZone })}</span>
										{#if thread.replyCount > 0}
											<span>·</span>
											<Badge variant="secondary" class="px-1.5 py-0 text-xs"
												>{thread.replyCount}
												{thread.replyCount === 1 ? 'reply' : 'replies'}</Badge
											>
										{/if}
									</div>
								</div>
							</Card.Content>
						</Card.Root>
					</a>
				{/each}
			</div>
		{/if}
	</section>

	<Separator />

	{#if data.pastSessions.length > 0}
		<section class="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
			<span>Recent sessions:</span>
			{#each data.pastSessions as session (session.id)}
				<a href={resolve('/sessions/[slug]', { slug: session.slug })} class="hover:text-foreground">
					{session.title}
				</a>
			{/each}
			<a href={resolve('/sessions')} class="font-medium text-foreground hover:underline"
				>All sessions</a
			>
		</section>
	{/if}

	<section class="space-y-2">
		<h2 class="text-sm font-semibold tracking-[0.14em] text-muted-foreground uppercase">
			Categories
		</h2>
		<div class="flex flex-wrap gap-x-4 gap-y-2 text-sm">
			{#each data.categories as category (category.id)}
				<a
					href={resolve(`/category/${category.slug}`)}
					class="inline-flex items-center gap-2 text-muted-foreground transition-colors hover:text-foreground"
				>
					<span>{category.name}</span>
					<span class="text-xs">{category.size}</span>
				</a>
			{/each}
		</div>
	</section>
</div>
