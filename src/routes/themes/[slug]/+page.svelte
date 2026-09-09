<script lang="ts">
	import { resolve } from '$app/paths';
	import { pageTitle } from '$shared/brand';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import BookCard from '$lib/components/BookCard.svelte';
	import SessionNav from '$lib/components/session-nav.svelte';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import { formatDate } from '$lib/date-format';

	let { data } = $props();
	const timeZone = $derived(data.user?.timezone);
</script>

<svelte:head>
	<title>{pageTitle(data.theme.name)}</title>
</svelte:head>

<div class="space-y-8">
	<SessionNav />

	<div class="space-y-4">
		<div class="flex flex-wrap items-center gap-2">
			<Button variant="ghost" size="icon-sm" href={resolve('/themes')}>
				<ArrowLeftIcon class="h-4 w-4" />
			</Button>
			<Badge variant="secondary">{data.theme.status}</Badge>
			{#if data.permissions.has('sessions:edit')}
				<Button
					variant="outline"
					size="sm"
					href={resolve('/admin/themes/[slug]', { slug: data.theme.slug })}
					class="ml-auto"
				>
					<PencilIcon class="h-4 w-4" />
					Edit Theme
				</Button>
			{/if}
		</div>
		<div class="max-w-3xl space-y-2">
			<h1 class="text-3xl font-bold tracking-tight">{data.theme.name}</h1>
			{#if data.theme.description}
				<p class="text-lg leading-7 text-muted-foreground">{data.theme.description}</p>
			{/if}
		</div>
	</div>

	{#if data.theme.guideHtml}
		<section class="prose max-w-3xl wrap-anywhere dark:prose-invert">
			<!-- eslint-disable-next-line svelte/no-at-html-tags -->
			{@html data.theme.guideHtml}
		</section>
	{/if}

	{#if data.theme.exampleText}
		<Card.Root class="max-w-3xl">
			<Card.Header>
				<Card.Title class="text-base">Suggested Examples</Card.Title>
			</Card.Header>
			<Card.Content>
				<p class="text-sm whitespace-pre-line text-muted-foreground">{data.theme.exampleText}</p>
			</Card.Content>
		</Card.Root>
	{/if}

	{#if data.books.length > 0}
		<section class="space-y-3">
			<h2 class="text-lg font-semibold">Books for this Theme</h2>
			<div class="grid gap-3 sm:grid-cols-2">
				{#each data.books as book (book.id)}
					<BookCard {book} compact />
				{/each}
			</div>
		</section>
	{/if}

	{#if data.sessions.length > 0}
		<section class="space-y-3">
			<h2 class="text-lg font-semibold">Sessions</h2>
			<div class="grid gap-3 sm:grid-cols-2">
				{#each data.sessions as session (session.id)}
					<a href={resolve('/sessions/[slug]', { slug: session.slug })}>
						<Card.Root class="h-full transition-colors hover:border-primary/40">
							<Card.Header>
								<Card.Title class="text-base">{session.title}</Card.Title>
								{#if session.startsAt}
									<Card.Description>
										{formatDate(session.startsAt, {
											time: 'always',
											timeZone: session.timezone ?? timeZone
										})}
									</Card.Description>
								{/if}
							</Card.Header>
						</Card.Root>
					</a>
				{/each}
			</div>
		</section>
	{/if}
</div>
