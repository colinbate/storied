<script lang="ts">
	import { resolve } from '$app/paths';
	import * as Avatar from '$lib/components/ui/avatar/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import BookCard from '$lib/components/BookCard.svelte';
	import SeriesCard from '$lib/components/series-card.svelte';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import ExternalLinkIcon from '@lucide/svelte/icons/external-link';
	import StarIcon from '@lucide/svelte/icons/star';

	let { data } = $props();

	function subjectCount(items: unknown[]) {
		return items.length === 1 ? '1 item' : `${items.length} items`;
	}
</script>

<svelte:head>
	<title>{data.member.displayName} — Storied</title>
</svelte:head>

<div class="space-y-8">
	<a
		href={resolve('/')}
		class="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
	>
		<ArrowLeftIcon class="h-4 w-4" />
		Back to Discussions
	</a>

	<section class="flex flex-col gap-5 sm:flex-row sm:items-start">
		<Avatar.Root class="h-24 w-24 shrink-0">
			{#if data.member.avatarUrl}
				<Avatar.Image src={data.member.avatarUrl} alt={data.member.displayName} />
			{/if}
			<Avatar.Fallback class="text-3xl">
				{data.member.displayName.charAt(0).toUpperCase()}
			</Avatar.Fallback>
		</Avatar.Root>
		<div class="min-w-0 flex-1 space-y-3">
			<div>
				<h1 class="text-3xl font-bold tracking-tight">{data.member.displayName}</h1>
				{#if data.profile?.headline}
					<p class="mt-1 text-xl text-muted-foreground">{data.profile.headline}</p>
				{/if}
			</div>
			<div class="flex flex-wrap gap-2">
				{#each data.profileGenres as genre (genre)}
					<Badge variant="secondary">{genre}</Badge>
				{/each}
				{#if data.profile?.websiteUrl}
					<a
						href={data.profile.websiteUrl}
						target="_blank"
						rel="noopener noreferrer external"
						class="inline-flex items-center gap-1 text-sm text-primary hover:underline"
					>
						<ExternalLinkIcon class="h-3.5 w-3.5" />
						Website
					</a>
				{/if}
			</div>
			{#if data.profile?.bio}
				<p class="max-w-3xl leading-7 whitespace-pre-wrap">{data.profile.bio}</p>
			{/if}
			{#if data.isOwnProfile}
				<Button href={resolve('/settings')} variant="outline" size="sm">Edit Profile</Button>
			{/if}
		</div>
	</section>

	<Card.Root>
		<Card.Header>
			<div class="flex items-center gap-2">
				<StarIcon class="h-4 w-4 text-primary" />
				<Card.Title class="text-base">Featured</Card.Title>
			</div>
			<Card.Description>{subjectCount(data.featuredSubjects)}</Card.Description>
		</Card.Header>
		<Card.Content>
			{#if data.featuredSubjects.length > 0}
				<div class="grid gap-3 sm:grid-cols-2">
					{#each data.featuredSubjects as item (item.relation.subjectType + item.relation.subjectId)}
						<div class="space-y-2">
							{#if item.kind === 'book'}
								<a
									href={resolve('/books/[slug]', { slug: item.book.slug })}
									class="flex items-start gap-4 rounded-lg border p-4 transition-colors hover:border-primary/40"
								>
									{#if item.book.coverUrl}
										<img
											src={item.book.coverUrl}
											alt={item.book.title}
											class="h-24 w-16 shrink-0 rounded object-cover shadow-sm"
										/>
									{:else}
										<div
											class="flex h-24 w-16 shrink-0 items-center justify-center rounded bg-muted"
										>
											<StarIcon class="h-5 w-5 text-muted-foreground" />
										</div>
									{/if}
									<div class="min-w-0 flex-1">
										<h3 class="leading-tight font-medium">{item.book.title}</h3>
										{#if item.book.authorText}
											<p class="mt-1 text-sm text-muted-foreground">{item.book.authorText}</p>
										{/if}
									</div>
								</a>
							{:else}
								<a
									href={resolve('/series/[slug]', { slug: item.series.slug })}
									class="flex items-start gap-4 rounded-lg border p-4 transition-colors hover:border-primary/40"
								>
									{#if item.series.coverUrl}
										<img
											src={item.series.coverUrl}
											alt={item.series.title}
											class="h-24 w-16 shrink-0 rounded object-cover shadow-sm"
										/>
									{:else}
										<div
											class="flex h-24 w-16 shrink-0 items-center justify-center rounded bg-muted"
										>
											<StarIcon class="h-5 w-5 text-muted-foreground" />
										</div>
									{/if}
									<div class="min-w-0 flex-1">
										<h3 class="leading-tight font-medium">{item.series.title}</h3>
										{#if item.series.authorText}
											<p class="mt-1 text-sm text-muted-foreground">{item.series.authorText}</p>
										{/if}
									</div>
								</a>
							{/if}
							{#if item.relation.note}
								<details class="px-2 text-xs text-muted-foreground">
									<summary>{item.relation.containsSpoilers ? 'Spoiler note' : 'Note'}</summary>
									<p class="mt-1 whitespace-pre-wrap">{item.relation.note}</p>
								</details>
							{/if}
						</div>
					{/each}
				</div>
			{:else}
				<p class="text-sm text-muted-foreground">Nothing featured yet.</p>
			{/if}
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title class="text-base">Recommendations</Card.Title>
			<Card.Description>{subjectCount(data.recommendations)}</Card.Description>
		</Card.Header>
		<Card.Content>
			{#if data.recommendations.length > 0}
				<div class="grid gap-2 sm:grid-cols-2">
					{#each data.recommendations as item (item.relation.subjectType + item.relation.subjectId)}
						<div class="space-y-2">
							{#if item.kind === 'book'}
								<BookCard book={item.book} compact />
							{:else}
								<SeriesCard series={item.series} compact />
							{/if}
						</div>
					{/each}
				</div>
			{:else}
				<p class="text-sm text-muted-foreground">No recommendations listed.</p>
			{/if}
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title class="text-base">Read</Card.Title>
			<Card.Description>{subjectCount(data.readSubjects)}</Card.Description>
		</Card.Header>
		<Card.Content>
			{#if data.readSubjects.length > 0}
				<div class="space-y-2">
					{#each data.readSubjects as item (item.relation.subjectType + item.relation.subjectId)}
						<div class="space-y-2">
							{#if item.kind === 'book'}
								<BookCard book={item.book} compact />
							{:else}
								<SeriesCard series={item.series} compact />
							{/if}
						</div>
					{/each}
				</div>
			{:else}
				<p class="text-sm text-muted-foreground">No read list shared.</p>
			{/if}
		</Card.Content>
	</Card.Root>
</div>
