<script lang="ts">
	import { resolve } from '$app/paths';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import BookCard from '$lib/components/BookCard.svelte';
	import SeriesCard from '$lib/components/series-card.svelte';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import CalendarIcon from '@lucide/svelte/icons/calendar';
	import ClockIcon from '@lucide/svelte/icons/clock';
	import MapPinIcon from '@lucide/svelte/icons/map-pin';
	import MessageSquareIcon from '@lucide/svelte/icons/message-square';

	let { data } = $props();

	function formatDate(value: string | null) {
		if (!value) return 'Date to be announced';
		return new Date(value).toLocaleString([], {
			weekday: 'short',
			month: 'long',
			day: 'numeric',
			year: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		});
	}

	function subjectCount(items: unknown[]) {
		return items.length === 1 ? '1 title' : `${items.length} titles`;
	}

	const subjectGroups = $derived([
		{ title: 'Starter Books', items: data.starterSubjects },
		{ title: 'Featured', items: data.featuredSubjects },
		{ title: 'Discussed', items: data.discussedSubjects },
		{ title: 'Off-Theme Mentions', items: data.offThemeSubjects }
	]);
</script>

<svelte:head>
	<title>{data.session.title} — Storied</title>
</svelte:head>

<div class="space-y-8">
	<a
		href={resolve('/sessions')}
		class="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
	>
		<ArrowLeftIcon class="h-4 w-4" />
		Back to Sessions
	</a>

	<section class="space-y-4">
		<div class="flex flex-wrap items-center gap-2">
			<Badge variant={data.session.status === 'current' ? 'default' : 'secondary'}>
				{data.session.status}
			</Badge>
			{#if data.session.isPublic}
				<Badge variant="outline">public</Badge>
			{/if}
		</div>
		<div>
			<h1 class="text-3xl font-bold tracking-tight">{data.session.title}</h1>
			{#if data.session.themeTitle ?? data.session.theme}
				<p class="mt-2 text-xl text-muted-foreground">
					{data.session.themeTitle ?? data.session.theme}
				</p>
			{/if}
		</div>
		<div class="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
			<span class="inline-flex items-center gap-2">
				<CalendarIcon class="h-4 w-4" />
				{formatDate(data.session.startsAt)}
			</span>
			{#if data.session.durationMinutes}
				<span class="inline-flex items-center gap-2">
					<ClockIcon class="h-4 w-4" />
					{data.session.durationMinutes} min
				</span>
			{/if}
			{#if data.session.locationName}
				<span class="inline-flex items-center gap-2">
					<MapPinIcon class="h-4 w-4" />
					{data.session.locationName}
				</span>
			{/if}
		</div>
		{#if data.session.themeSummary}
			<p class="max-w-3xl text-base leading-7">{data.session.themeSummary}</p>
		{/if}
	</section>

	{#if data.session.bodyHtml}
		<section class="prose max-w-none wrap-anywhere dark:prose-invert">
			<!-- eslint-disable-next-line svelte/no-at-html-tags -->
			{@html data.session.bodyHtml}
		</section>
	{/if}

	{#if data.primaryThread}
		<Card.Root>
			<Card.Content class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<div class="min-w-0">
					<div class="flex items-center gap-2 font-medium">
						<MessageSquareIcon class="h-4 w-4 text-primary" />
						<span>Main discussion thread</span>
					</div>
					<p class="mt-1 truncate text-sm text-muted-foreground">
						{data.primaryThread.thread.title} by {data.primaryThread.author.displayName}
					</p>
				</div>
				<Button href={resolve('/thread/[slug]', { slug: data.primaryThread.thread.slug })}>
					Open Thread
				</Button>
			</Card.Content>
		</Card.Root>
	{/if}

	<section class="grid gap-4 lg:grid-cols-2">
		{#each subjectGroups as group (group.title)}
			<Card.Root>
				<Card.Header>
					<Card.Title class="text-base">{group.title}</Card.Title>
					<Card.Description>{subjectCount(group.items)}</Card.Description>
				</Card.Header>
				<Card.Content>
					{#if group.items.length > 0}
						<div class="space-y-2">
							{#each group.items as item (item.link.subjectType + item.link.subjectId)}
								{#if item.kind === 'book'}
									<BookCard book={item.book} compact />
								{:else}
									<SeriesCard series={item.series} compact />
								{/if}
								{#if item.link.note}
									<p class="-mt-1 px-2 pb-2 text-xs text-muted-foreground">{item.link.note}</p>
								{/if}
							{/each}
						</div>
					{:else}
						<p class="text-sm text-muted-foreground">Nothing linked yet.</p>
					{/if}
				</Card.Content>
			</Card.Root>
		{/each}
	</section>

	{#if data.relatedThreads.length > 0}
		<section class="space-y-3">
			<h2 class="text-lg font-semibold">Related Threads</h2>
			<div class="grid gap-3 sm:grid-cols-2">
				{#each data.relatedThreads as { thread, author } (thread.id)}
					<a href={resolve('/thread/[slug]', { slug: thread.slug })} class="block">
						<Card.Root class="transition-colors hover:border-primary/40">
							<Card.Content class="py-4">
								<h3 class="font-medium">{thread.title}</h3>
								<p class="mt-1 text-sm text-muted-foreground">
									{author.displayName} · {thread.replyCount}
									{thread.replyCount === 1 ? 'reply' : 'replies'}
								</p>
							</Card.Content>
						</Card.Root>
					</a>
				{/each}
			</div>
		</section>
	{/if}
</div>
