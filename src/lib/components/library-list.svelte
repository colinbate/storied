<script lang="ts">
	import { resolve } from '$app/paths';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import AuthorCard from '$lib/components/author-card.svelte';
	import BookOpenIcon from '@lucide/svelte/icons/book-open';
	import LibraryIcon from '@lucide/svelte/icons/library';
	import SearchIcon from '@lucide/svelte/icons/search';
	import UserIcon from '@lucide/svelte/icons/user';

	type Book = {
		id: string;
		slug: string;
		title: string;
		subtitle: string | null;
		authorText: string | null;
		coverUrl: string | null;
		firstPublishYear: number | null;
		description: string | null;
	};

	type Series = {
		id: string;
		slug: string;
		title: string;
		authorText: string | null;
		coverUrl: string | null;
		bookCount: number | null;
		isComplete: boolean;
		description: string | null;
	};

	type Author = {
		id: string;
		slug: string;
		name: string;
		bio: string | null;
		photoUrl: string | null;
	};

	type Section = 'books' | 'series' | 'authors';

	let {
		books,
		series,
		authors,
		title = 'Library',
		description = 'Books, series, and authors gathered by the club.',
		sections = ['books', 'series', 'authors']
	}: {
		books: Book[];
		series: Series[];
		authors: Author[];
		title?: string;
		description?: string;
		sections?: Section[];
	} = $props();

	let filter = $state('');

	const visibleBooks = $derived.by(() => {
		if (!sections.includes('books')) return [];
		const q = filter.trim().toLowerCase();
		if (!q) return books;
		return books.filter((book) =>
			[
				book.title,
				book.subtitle,
				book.authorText,
				book.firstPublishYear ? String(book.firstPublishYear) : null
			]
				.filter(Boolean)
				.some((value) => value?.toLowerCase().includes(q))
		);
	});

	const visibleSeries = $derived.by(() => {
		if (!sections.includes('series')) return [];
		const q = filter.trim().toLowerCase();
		if (!q) return series;
		return series.filter((item) =>
			[item.title, item.authorText]
				.filter(Boolean)
				.some((value) => value?.toLowerCase().includes(q))
		);
	});

	const visibleAuthors = $derived.by(() => {
		if (!sections.includes('authors')) return [];
		const q = filter.trim().toLowerCase();
		if (!q) return authors;
		return authors.filter((author) => author.name.toLowerCase().includes(q));
	});

	const totalCount = $derived(books.length + series.length + authors.length);
	const visibleCount = $derived(visibleBooks.length + visibleSeries.length + visibleAuthors.length);

	function summaryText(text?: string | null, maxLength = 160) {
		if (!text) return null;
		const normalized = text.replace(/\s+/g, ' ').trim();
		if (normalized.length <= maxLength) return normalized;
		return `${normalized.slice(0, maxLength).trimEnd()}...`;
	}
</script>

<div class="space-y-8">
	<div class="space-y-4">
		<div class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
			<div>
				<h1 class="text-2xl font-bold">{title}</h1>
				<p class="text-muted-foreground">{description}</p>
			</div>
			{#if sections.length > 1}
				<div class="flex flex-wrap gap-2">
					<Button href={resolve('/books')} variant="outline" size="sm">
						<BookOpenIcon class="h-4 w-4" />
						Books
					</Button>
					<Button href={resolve('/series')} variant="outline" size="sm">
						<LibraryIcon class="h-4 w-4" />
						Series
					</Button>
					<Button href={resolve('/authors')} variant="outline" size="sm">
						<UserIcon class="h-4 w-4" />
						Authors
					</Button>
				</div>
			{/if}
		</div>

		<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
			<div class="flex flex-wrap gap-2">
				{#if sections.includes('books')}
					<Badge variant="secondary">{books.length} {books.length === 1 ? 'book' : 'books'}</Badge>
				{/if}
				{#if sections.includes('series')}
					<Badge variant="secondary">
						{series.length}
						{series.length === 1 ? 'series' : 'series'}
					</Badge>
				{/if}
				{#if sections.includes('authors')}
					<Badge variant="secondary">
						{authors.length}
						{authors.length === 1 ? 'author' : 'authors'}
					</Badge>
				{/if}
			</div>
			<div class="relative sm:w-72">
				<SearchIcon
					class="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground"
				/>
				<Input type="search" placeholder="Filter library..." class="pl-9" bind:value={filter} />
			</div>
		</div>
	</div>

	{#if totalCount === 0}
		<Card.Root>
			<Card.Content class="py-12 text-center text-muted-foreground">
				<LibraryIcon class="mx-auto mb-3 h-8 w-8 opacity-50" />
				<p>The library is waiting for its first subjects.</p>
			</Card.Content>
		</Card.Root>
	{:else if visibleCount === 0}
		<Card.Root>
			<Card.Content class="py-12 text-center text-muted-foreground">
				<SearchIcon class="mx-auto mb-3 h-8 w-8 opacity-50" />
				<p>No library subjects match your filter.</p>
			</Card.Content>
		</Card.Root>
	{/if}

	{#if visibleBooks.length > 0}
		<section class="space-y-3">
			<div class="flex items-center gap-2">
				<BookOpenIcon class="h-5 w-5 text-primary" />
				<h2 class="text-lg font-semibold">Books</h2>
			</div>
			<div class="grid gap-3 sm:grid-cols-2">
				{#each visibleBooks as book (book.id)}
					<a href={resolve('/books/[slug]', { slug: book.slug })} class="block">
						<Card.Root class="h-full transition-colors hover:border-primary/40">
							<Card.Content class="flex gap-4">
								{#if book.coverUrl}
									<img
										src={book.coverUrl}
										alt="Cover of {book.title}"
										class="h-28 w-18 shrink-0 rounded object-cover"
									/>
								{:else}
									<div class="flex h-28 w-18 shrink-0 items-center justify-center rounded bg-muted">
										<BookOpenIcon class="h-6 w-6 text-muted-foreground" />
									</div>
								{/if}
								<div class="min-w-0 space-y-2">
									<div>
										<h3 class="line-clamp-2 font-semibold">{book.title}</h3>
										{#if book.subtitle}
											<p class="line-clamp-1 text-sm text-muted-foreground">{book.subtitle}</p>
										{/if}
										{#if book.authorText}
											<p class="line-clamp-1 text-sm text-muted-foreground">by {book.authorText}</p>
										{/if}
									</div>
									{#if book.firstPublishYear}
										<Badge variant="outline">{book.firstPublishYear}</Badge>
									{/if}
									{#if summaryText(book.description)}
										<p class="line-clamp-2 text-sm leading-6 text-muted-foreground">
											{summaryText(book.description)}
										</p>
									{/if}
								</div>
							</Card.Content>
						</Card.Root>
					</a>
				{/each}
			</div>
		</section>
	{/if}

	{#if visibleSeries.length > 0}
		<section class="space-y-3">
			<div class="flex items-center gap-2">
				<LibraryIcon class="h-5 w-5 text-primary" />
				<h2 class="text-lg font-semibold">Series</h2>
			</div>
			<div class="grid gap-3 sm:grid-cols-2">
				{#each visibleSeries as item (item.id)}
					<a href={resolve('/series/[slug]', { slug: item.slug })} class="block">
						<Card.Root class="h-full transition-colors hover:border-primary/40">
							<Card.Content class="flex gap-4">
								{#if item.coverUrl}
									<img
										src={item.coverUrl}
										alt="Cover of {item.title}"
										class="h-28 w-18 shrink-0 rounded object-cover"
									/>
								{:else}
									<div class="flex h-28 w-18 shrink-0 items-center justify-center rounded bg-muted">
										<LibraryIcon class="h-6 w-6 text-muted-foreground" />
									</div>
								{/if}
								<div class="min-w-0 space-y-2">
									<div>
										<h3 class="line-clamp-2 font-semibold">{item.title}</h3>
										{#if item.authorText}
											<p class="line-clamp-1 text-sm text-muted-foreground">by {item.authorText}</p>
										{/if}
									</div>
									<div class="flex flex-wrap gap-2">
										{#if item.bookCount}
											<Badge variant="outline">
												{item.bookCount}
												{item.bookCount === 1 ? 'book' : 'books'}
											</Badge>
										{/if}
										<Badge variant={item.isComplete ? 'secondary' : 'outline'}>
											{item.isComplete ? 'Complete' : 'Ongoing'}
										</Badge>
									</div>
									{#if summaryText(item.description)}
										<p class="line-clamp-2 text-sm leading-6 text-muted-foreground">
											{summaryText(item.description)}
										</p>
									{/if}
								</div>
							</Card.Content>
						</Card.Root>
					</a>
				{/each}
			</div>
		</section>
	{/if}

	{#if visibleAuthors.length > 0}
		<section class="space-y-3">
			<div class="flex items-center gap-2">
				<UserIcon class="h-5 w-5 text-primary" />
				<h2 class="text-lg font-semibold">Authors</h2>
			</div>
			<div class="grid gap-3 sm:grid-cols-2">
				{#each visibleAuthors as author (author.id)}
					<AuthorCard {author} compact />
				{/each}
			</div>
		</section>
	{/if}
</div>
