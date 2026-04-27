<script lang="ts">
	import { resolve } from '$app/paths';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { buttonVariants } from '$lib/components/ui/button/index.js';
	import BookOpenIcon from '@lucide/svelte/icons/book-open';
	import ExternalLinkIcon from '@lucide/svelte/icons/external-link';
	import GlobeIcon from '@lucide/svelte/icons/globe';
	import LibraryIcon from '@lucide/svelte/icons/library';
	import UserIcon from '@lucide/svelte/icons/user';

	let { data } = $props();
</script>

<svelte:head>
	<title>{data.author.name} — The Archive</title>
</svelte:head>

<div class="space-y-8">
	<section class="flex flex-col gap-6 sm:flex-row">
		{#if data.author.photoUrl}
			<img
				src={data.author.photoUrl}
				alt={data.author.name}
				class="h-40 w-40 rounded object-cover"
			/>
		{:else}
			<div class="flex h-40 w-40 shrink-0 items-center justify-center rounded bg-muted">
				<UserIcon class="h-12 w-12 text-muted-foreground" />
			</div>
		{/if}

		<div class="min-w-0 flex-1 space-y-4">
			<div>
				<Badge variant="outline" class="mb-3 gap-1">
					<UserIcon class="h-3 w-3" />
					Author
				</Badge>
				<h1 class="text-2xl font-bold">{data.author.name}</h1>
			</div>

			<div class="flex flex-wrap gap-2">
				{#if data.author.websiteUrl}
					<a href={data.author.websiteUrl} class={buttonVariants({ variant: 'outline', size: 'sm' })}>
						<GlobeIcon class="h-4 w-4" />
						Website
					</a>
				{/if}
				{#if data.author.goodreadsUrl}
					<a
						href={data.author.goodreadsUrl}
						class={buttonVariants({ variant: 'outline', size: 'sm' })}
					>
						<ExternalLinkIcon class="h-4 w-4" />
						Goodreads
					</a>
				{/if}
			</div>
		</div>
	</section>

	{#if data.author.bio}
		<section class="space-y-3">
			<h2 class="text-lg font-semibold">About</h2>
			<Card.Root>
				<Card.Content>
					<p class="text-sm leading-7 text-muted-foreground">{data.author.bio}</p>
				</Card.Content>
			</Card.Root>
		</section>
	{/if}

	{#if data.relatedBooks.length > 0}
		<section class="space-y-3">
			<div class="flex items-center gap-2">
				<BookOpenIcon class="h-5 w-5 text-primary" />
				<h2 class="text-lg font-semibold">Books</h2>
			</div>
			<div class="grid gap-3 sm:grid-cols-2">
				{#each data.relatedBooks as book (book.id)}
					<a href={resolve('/books/[slug]', { slug: book.slug })} class="block">
						<Card.Root class="h-full transition-colors hover:border-primary/40">
							<Card.Content class="flex gap-4">
								{#if book.coverUrl}
									<img
										src={book.coverUrl}
										alt="Cover of {book.title}"
										class="h-24 w-16 shrink-0 rounded object-cover"
									/>
								{:else}
									<div class="flex h-24 w-16 shrink-0 items-center justify-center rounded bg-muted">
										<BookOpenIcon class="h-5 w-5 text-muted-foreground" />
									</div>
								{/if}
								<div class="min-w-0">
									<h3 class="line-clamp-2 font-semibold">{book.title}</h3>
									{#if book.subtitle}
										<p class="line-clamp-1 text-sm text-muted-foreground">{book.subtitle}</p>
									{/if}
									{#if book.firstPublishYear}
										<p class="mt-2 text-sm text-muted-foreground">{book.firstPublishYear}</p>
									{/if}
								</div>
							</Card.Content>
						</Card.Root>
					</a>
				{/each}
			</div>
		</section>
	{/if}

	{#if data.relatedSeries.length > 0}
		<section class="space-y-3">
			<div class="flex items-center gap-2">
				<LibraryIcon class="h-5 w-5 text-primary" />
				<h2 class="text-lg font-semibold">Series</h2>
			</div>
			<div class="grid gap-3 sm:grid-cols-2">
				{#each data.relatedSeries as item (item.id)}
					<a href={resolve('/series/[slug]', { slug: item.slug })} class="block">
						<Card.Root class="h-full transition-colors hover:border-primary/40">
							<Card.Content class="flex gap-4">
								{#if item.coverUrl}
									<img
										src={item.coverUrl}
										alt="Cover of {item.title}"
										class="h-24 w-16 shrink-0 rounded object-cover"
									/>
								{:else}
									<div class="flex h-24 w-16 shrink-0 items-center justify-center rounded bg-muted">
										<LibraryIcon class="h-5 w-5 text-muted-foreground" />
									</div>
								{/if}
								<div class="min-w-0 space-y-2">
									<h3 class="line-clamp-2 font-semibold">{item.title}</h3>
									<div class="flex flex-wrap gap-2">
										{#if item.bookCount}
											<Badge variant="outline">
												{item.bookCount} {item.bookCount === 1 ? 'book' : 'books'}
											</Badge>
										{/if}
										<Badge variant={item.isComplete ? 'secondary' : 'outline'}>
											{item.isComplete ? 'Complete' : 'Ongoing'}
										</Badge>
									</div>
								</div>
							</Card.Content>
						</Card.Root>
					</a>
				{/each}
			</div>
		</section>
	{/if}
</div>
