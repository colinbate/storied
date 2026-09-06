<script lang="ts">
	import { resolve } from '$app/paths';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { NativeSelect, NativeSelectOption } from '$lib/components/ui/native-select/index.js';
	import AuthorCard from '$lib/components/author-card.svelte';
	import LibraryNav from '$lib/components/library-nav.svelte';
	import BookOpenIcon from '@lucide/svelte/icons/book-open';
	import LibraryIcon from '@lucide/svelte/icons/library';
	import SearchIcon from '@lucide/svelte/icons/search';
	import UserIcon from '@lucide/svelte/icons/user';
	import ClassificationBadges from '$lib/components/classification-badges.svelte';
	import CalendarIcon from '@lucide/svelte/icons/calendar';
	import { formatDate } from '$lib/date-format';

	type Classification = {
		slug: string;
		name: string;
		description?: string | null;
		icon?: string | null;
	};

	type Book = {
		id: string;
		slug: string;
		title: string;
		subtitle: string | null;
		authorText: string | null;
		coverUrl: string | null;
		firstPublishYear: number | null;
		editionLabel: string | null;
		language: string | null;
		pageCount: number | null;
		audiobookMinutes: number | null;
		description: string | null;
		classifications?: Classification[];
		readingStatus?: string | null;
		isRecommended?: boolean;
		sessionLinks?: Array<{
			role: string;
			sessionId: string;
			slug: string;
			title: string;
			startsAt: string | null;
			timezone: string;
			status: string;
			themeName: string | null;
			themeKey: string | null;
		}>;
		accessCount?: number;
		accessFormats?: string[];
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
		classifications?: Classification[];
	};

	type Author = {
		id: string;
		slug: string;
		name: string;
		bio: string | null;
		photoUrl: string | null;
	};

	type Section = 'books' | 'series' | 'authors';
	type Shelf = 'all' | 'saved' | 'reading' | 'completed' | 'unfinished' | 'next' | 'discussed';
	type SessionOption = {
		id: string;
		slug: string;
		title: string;
		startsAt: string | null;
		timezone: string;
		status: string;
	};

	let {
		books,
		series,
		authors,
		title = 'Library',
		description = 'Books, series, and authors gathered by the club.',
		sections = ['books', 'series', 'authors'],
		organized = false,
		sessionOptions = [],
		themeOptions = [],
		nextSession = null
	}: {
		books: Book[];
		series: Series[];
		authors: Author[];
		title?: string;
		description?: string;
		sections?: Section[];
		organized?: boolean;
		sessionOptions?: SessionOption[];
		themeOptions?: Array<{ key: string; name: string }>;
		nextSession?: Omit<SessionOption, 'status'> | null;
	} = $props();

	let filter = $state('');
	let shelf = $state<Shelf>('all');
	let sessionFilter = $state('');
	let themeFilter = $state('');

	function isOnShelf(book: Book, target: Shelf) {
		if (target === 'all') return true;
		if (target === 'saved') return book.readingStatus === 'want_to_read';
		if (target === 'reading') return book.readingStatus === 'reading';
		if (target === 'completed') return book.readingStatus === 'read';
		if (target === 'unfinished') return book.readingStatus === 'did_not_finish';
		if (target === 'next') {
			return !!nextSession && book.sessionLinks?.some((link) => link.sessionId === nextSession.id);
		}
		return (
			book.sessionLinks?.some(
				(link) => link.status === 'past' && ['featured', 'discussed'].includes(link.role)
			) ?? false
		);
	}

	const shelfOptions = $derived([
		{ value: 'all' as const, label: 'Everything', count: books.length },
		{
			value: 'saved' as const,
			label: 'Saved',
			count: books.filter((book) => isOnShelf(book, 'saved')).length
		},
		{
			value: 'reading' as const,
			label: 'Reading',
			count: books.filter((book) => isOnShelf(book, 'reading')).length
		},
		{
			value: 'completed' as const,
			label: 'Completed',
			count: books.filter((book) => isOnShelf(book, 'completed')).length
		},
		{
			value: 'unfinished' as const,
			label: 'Unfinished',
			count: books.filter((book) => isOnShelf(book, 'unfinished')).length
		},
		{
			value: 'next' as const,
			label: 'Next meeting',
			count: books.filter((book) => isOnShelf(book, 'next')).length
		},
		{
			value: 'discussed' as const,
			label: 'Previously discussed',
			count: books.filter((book) => isOnShelf(book, 'discussed')).length
		}
	]);

	const visibleBooks = $derived.by(() => {
		if (!sections.includes('books')) return [];
		const q = filter.trim().toLowerCase();
		return books.filter((book) => {
			if (organized && !isOnShelf(book, shelf)) return false;
			if (sessionFilter && !book.sessionLinks?.some((link) => link.sessionId === sessionFilter)) {
				return false;
			}
			if (themeFilter && !book.sessionLinks?.some((link) => link.themeKey === themeFilter)) {
				return false;
			}
			if (!q) return true;
			return [
				book.title,
				book.subtitle,
				book.authorText,
				book.firstPublishYear ? String(book.firstPublishYear) : null,
				book.editionLabel,
				book.language,
				...(book.sessionLinks?.flatMap((link) => [link.title, link.themeName]) ?? [])
			]
				.filter(Boolean)
				.some((value) => value?.toLowerCase().includes(q));
		});
	});

	const visibleSeries = $derived.by(() => {
		if (
			!sections.includes('series') ||
			(organized && (shelf !== 'all' || sessionFilter || themeFilter))
		)
			return [];
		const q = filter.trim().toLowerCase();
		if (!q) return series;
		return series.filter((item) =>
			[item.title, item.authorText]
				.filter(Boolean)
				.some((value) => value?.toLowerCase().includes(q))
		);
	});

	const visibleAuthors = $derived.by(() => {
		if (
			!sections.includes('authors') ||
			(organized && (shelf !== 'all' || sessionFilter || themeFilter))
		)
			return [];
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

	function readingStatusLabel(status?: string | null) {
		return {
			want_to_read: 'Saved',
			reading: 'Reading',
			read: 'Completed',
			did_not_finish: 'Unfinished'
		}[status ?? ''];
	}

	function audiobookLength(minutes: number) {
		const hours = Math.floor(minutes / 60);
		const remainder = minutes % 60;
		return hours ? `${hours}h${remainder ? ` ${remainder}m` : ''}` : `${remainder}m`;
	}

	function formatLabel(format: string) {
		return format === 'ebook' ? 'Ebook' : format.charAt(0).toUpperCase() + format.slice(1);
	}
</script>

<div class="space-y-8">
	<LibraryNav />

	<div class="space-y-4">
		<div>
			<h1 class="text-2xl font-bold">{title}</h1>
			<p class="text-muted-foreground">{description}</p>
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

		{#if organized}
			<div class="space-y-3 rounded-lg border bg-card p-3">
				<div class="flex flex-wrap gap-2" aria-label="Library shelves">
					{#each shelfOptions as option (option.value)}
						<Button
							variant={shelf === option.value ? 'default' : 'outline'}
							size="sm"
							onclick={() => (shelf = option.value)}
							aria-pressed={shelf === option.value}
						>
							{option.label}
							<span class="opacity-70">{option.count}</span>
						</Button>
					{/each}
				</div>
				<div class="grid gap-3 sm:grid-cols-2">
					<NativeSelect bind:value={sessionFilter} class="w-full" aria-label="Filter by session">
						<NativeSelectOption value="">All sessions</NativeSelectOption>
						{#each sessionOptions as session (session.id)}
							<NativeSelectOption value={session.id}>
								{session.title} · {formatDate(session.startsAt, {
									time: 'never',
									timeZone: session.timezone
								})}
							</NativeSelectOption>
						{/each}
					</NativeSelect>
					<NativeSelect bind:value={themeFilter} class="w-full" aria-label="Filter by theme">
						<NativeSelectOption value="">All themes</NativeSelectOption>
						{#each themeOptions as theme (theme.key)}
							<NativeSelectOption value={theme.key}>{theme.name}</NativeSelectOption>
						{/each}
					</NativeSelect>
				</div>
				{#if nextSession}
					<p class="flex items-center gap-2 text-sm text-muted-foreground">
						<CalendarIcon class="h-4 w-4" />
						Next meeting: {nextSession.title}, {formatDate(nextSession.startsAt, {
							time: 'never',
							timeZone: nextSession.timezone
						})}
					</p>
				{/if}
			</div>
		{/if}
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
				<p>No library subjects match these filters.</p>
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
								<div class="min-w-0 flex-1 space-y-2">
									<div>
										<div class="flex items-start gap-2">
											<h3 class="line-clamp-2 min-w-0 flex-1 font-semibold">{book.title}</h3>
											<ClassificationBadges classifications={book.classifications} compact />
										</div>
										{#if book.subtitle}
											<p class="line-clamp-1 text-sm text-muted-foreground">{book.subtitle}</p>
										{/if}
										{#if book.authorText}
											<p class="line-clamp-1 text-sm text-muted-foreground">by {book.authorText}</p>
										{/if}
									</div>
									<div class="flex flex-wrap gap-1.5">
										{#if readingStatusLabel(book.readingStatus)}
											<Badge>{readingStatusLabel(book.readingStatus)}</Badge>
										{/if}
										{#if book.firstPublishYear}<Badge variant="outline"
												>{book.firstPublishYear}</Badge
											>{/if}
										{#if book.pageCount}<Badge variant="outline">{book.pageCount} pages</Badge>{/if}
										{#if book.audiobookMinutes}<Badge variant="outline"
												>Audio {audiobookLength(book.audiobookMinutes)}</Badge
											>{/if}
										{#if book.language}<Badge variant="outline">{book.language}</Badge>{/if}
										{#if book.accessCount}
											<Badge variant="secondary">
												Available: {(book.accessFormats ?? []).map(formatLabel).join(', ')}
											</Badge>
										{/if}
									</div>
									{#if organized && book.sessionLinks?.length}
										<p class="line-clamp-1 text-xs text-muted-foreground">
											{book.sessionLinks.length === 1
												? book.sessionLinks[0].title
												: `${book.sessionLinks.length} linked meetings`}
										</p>
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
								<div class="min-w-0 flex-1 space-y-2">
									<div>
										<div class="flex items-start gap-2">
											<h3 class="line-clamp-2 min-w-0 flex-1 font-semibold">{item.title}</h3>
											<ClassificationBadges classifications={item.classifications} compact />
										</div>
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
