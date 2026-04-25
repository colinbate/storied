<script lang="ts">
	import { resolve } from '$app/paths';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import BookOpenIcon from '@lucide/svelte/icons/book-open';
	import CalendarIcon from '@lucide/svelte/icons/calendar';
	import MessageSquareIcon from '@lucide/svelte/icons/message-square';
	import SearchIcon from '@lucide/svelte/icons/search';
	import UserIcon from '@lucide/svelte/icons/user';
	import LibraryIcon from '@lucide/svelte/icons/library';
	import { formatDate } from '$lib/date-format';

	let { data } = $props();

	const total = $derived(data.threads.length + data.sessions.length + data.subjects.length);

	function summaryText(text?: string | null, maxLength = 220) {
		if (!text) return null;
		const normalized = text.replace(/\s+/g, ' ').trim();
		if (normalized.length <= maxLength) return normalized;
		return `${normalized.slice(0, maxLength).trimEnd()}...`;
	}

	function subjectHref(result: (typeof data.subjects)[number]) {
		if (result.type === 'book') return '/books/[slug]';
		if (result.type === 'series') return '/series/[slug]';
		return '/authors/[slug]';
	}

	function subjectLabel(type: string) {
		if (type === 'book') return 'Book';
		if (type === 'series') return 'Series';
		return 'Author';
	}

	function SubjectIcon(type: string) {
		if (type === 'book') return BookOpenIcon;
		if (type === 'series') return LibraryIcon;
		return UserIcon;
	}
</script>

<svelte:head>
	<title>Search — Storied</title>
</svelte:head>

<div class="space-y-8">
	<div class="space-y-4">
		<div>
			<h1 class="text-2xl font-bold">Search</h1>
			<p class="text-muted-foreground">Find discussions, sessions, books, series, and authors.</p>
		</div>

		<form method="GET" action={resolve('/search')} class="flex gap-2">
			<div class="relative flex-1">
				<SearchIcon
					class="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground"
				/>
				<Input
					type="search"
					name="q"
					value={data.q}
					placeholder="Search the club..."
					class="pl-9"
				/>
			</div>
			<Button type="submit">Search</Button>
		</form>

		{#if data.q}
			<p class="text-sm text-muted-foreground">
				{total}
				{total === 1 ? 'result' : 'results'} for “{data.q}”
			</p>
		{/if}
	</div>

	{#if data.q && total === 0}
		<Card.Root>
			<Card.Content class="py-12 text-center text-muted-foreground">
				<SearchIcon class="mx-auto mb-3 h-8 w-8 opacity-50" />
				<p>No results found.</p>
			</Card.Content>
		</Card.Root>
	{/if}

	{#if data.threads.length > 0}
		<section class="space-y-3">
			<h2 class="text-lg font-semibold">Threads</h2>
			<div class="space-y-3">
				{#each data.threads as { thread, author, category } (thread.id)}
					<a href={resolve('/thread/[slug]', { slug: thread.slug })} class="block">
						<Card.Root class="transition-colors hover:border-primary/40">
							<Card.Content class="space-y-2">
								<div class="flex flex-wrap items-center gap-2">
									<Badge variant="outline" class="gap-1">
										<MessageSquareIcon class="h-3 w-3" />
										Thread
									</Badge>
									<Badge variant="secondary">{category.name}</Badge>
								</div>
								<div>
									<h3 class="text-base font-semibold">{thread.title}</h3>
									<p class="text-sm text-muted-foreground">
										{author.displayName} · {thread.replyCount}
										{thread.replyCount === 1 ? 'reply' : 'replies'}
									</p>
								</div>
								{#if summaryText(thread.bodySource)}
									<p class="line-clamp-2 text-sm leading-6 text-muted-foreground">
										{summaryText(thread.bodySource)}
									</p>
								{/if}
							</Card.Content>
						</Card.Root>
					</a>
				{/each}
			</div>
		</section>
	{/if}

	{#if data.sessions.length > 0}
		<section class="space-y-3">
			<h2 class="text-lg font-semibold">Sessions</h2>
			<div class="grid gap-3 sm:grid-cols-2">
				{#each data.sessions as session (session.id)}
					<a href={resolve('/sessions/[slug]', { slug: session.slug })} class="block">
						<Card.Root class="h-full transition-colors hover:border-primary/40">
							<Card.Content class="space-y-2">
								<div class="flex flex-wrap items-center gap-2">
									<Badge variant="outline" class="gap-1">
										<CalendarIcon class="h-3 w-3" />
										Session
									</Badge>
									<Badge variant="secondary">{session.status}</Badge>
								</div>
								<div>
									<h3 class="text-base font-semibold">{session.title}</h3>
									{#if session.themeTitle ?? session.theme}
										<p class="text-sm text-muted-foreground">
											{session.themeTitle ?? session.theme}
										</p>
									{/if}
								</div>
								{#if session.startsAt}
									<p class="text-sm text-muted-foreground">
										{formatDate(session.startsAt, { time: 'always' })}
									</p>
								{/if}
								{#if summaryText(session.themeSummary)}
									<p class="line-clamp-2 text-sm leading-6 text-muted-foreground">
										{summaryText(session.themeSummary)}
									</p>
								{/if}
							</Card.Content>
						</Card.Root>
					</a>
				{/each}
			</div>
		</section>
	{/if}

	{#if data.subjects.length > 0}
		<section class="space-y-3">
			<h2 class="text-lg font-semibold">Subjects</h2>
			<div class="grid gap-3 sm:grid-cols-2">
				{#each data.subjects as result (`${result.type}:${result.subject.id}`)}
					{@const Icon = SubjectIcon(result.type)}
					<a href={resolve(subjectHref(result), { slug: result.subject.slug })} class="block">
						<Card.Root class="h-full transition-colors hover:border-primary/40">
							<Card.Content class="space-y-3">
								<div class="flex flex-wrap items-center gap-2">
									<Badge variant="outline" class="gap-1">
										<Icon class="h-3 w-3" />
										{subjectLabel(result.type)}
									</Badge>
								</div>
								<div>
									<h3 class="text-base font-semibold">
										{result.type === 'author' ? result.subject.name : result.subject.title}
									</h3>
									{#if result.type !== 'author' && result.subject.authorText}
										<p class="text-sm text-muted-foreground">{result.subject.authorText}</p>
									{/if}
								</div>
								{#if summaryText(result.type === 'author' ? result.subject.bio : result.subject.description)}
									<p class="line-clamp-3 text-sm leading-6 text-muted-foreground">
										{summaryText(
											result.type === 'author' ? result.subject.bio : result.subject.description
										)}
									</p>
								{/if}
							</Card.Content>
						</Card.Root>
					</a>
				{/each}
			</div>
		</section>
	{/if}
</div>
