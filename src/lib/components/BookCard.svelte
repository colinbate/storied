<script lang="ts">
	import * as Card from '$lib/components/ui/card/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import BookOpenIcon from '@lucide/svelte/icons/book-open';
	import ExternalLinkIcon from '@lucide/svelte/icons/external-link';
	import SparklesIcon from '@lucide/svelte/icons/sparkles';
	import { resolve } from '$app/paths';

	interface BookData {
		id: string;
		slug: string;
		title: string;
		subtitle?: string | null;
		authorText?: string | null;
		coverUrl?: string | null;
		goodreadsUrl?: string | null;
		firstPublishYear?: number | null;
		description?: string | null;
	}

	let { book, compact = false }: { book: BookData; compact?: boolean } = $props();

	function summaryText(text?: string | null, maxLength = 180) {
		if (!text) return null;
		const normalized = text.replace(/\s+/g, ' ').trim();
		if (normalized.length <= maxLength) return normalized;
		return `${normalized.slice(0, maxLength).trimEnd()}...`;
	}
</script>

{#if compact}
	<a
		href={resolve(`/books/${book.slug}`)}
		class="flex items-start gap-3 rounded-lg p-2 transition-colors hover:bg-muted"
		data-book-id={book.id}
	>
		{#if book.coverUrl}
			<img
				src={book.coverUrl}
				alt={book.title}
				class="h-16 w-11 shrink-0 rounded object-cover shadow-sm"
			/>
		{:else}
			<div class="flex h-16 w-11 shrink-0 items-center justify-center rounded bg-muted">
				<BookOpenIcon class="h-5 w-5 text-muted-foreground" />
			</div>
		{/if}
		<div class="min-w-0 flex-1">
			<p class="text-sm leading-tight font-medium">{book.title}</p>
			{#if book.authorText}
				<p class="mt-0.5 text-xs text-muted-foreground">{book.authorText}</p>
			{/if}
		</div>
	</a>
{:else}
	<Card.Root
		class="group overflow-hidden border-border/70 transition-colors hover:border-primary/40"
	>
		<a
			href={resolve(`/books/${book.slug}`)}
			class="flex gap-4 p-4 sm:gap-5 sm:p-5"
			data-book-id={book.id}
		>
			{#if book.coverUrl}
				<img
					src={book.coverUrl}
					alt={book.title}
					class="h-32 w-22 shrink-0 rounded-md object-cover shadow-md sm:h-36 sm:w-24"
				/>
			{:else}
				<div
					class="flex h-32 w-22 shrink-0 items-center justify-center rounded-md bg-muted shadow-sm sm:h-36 sm:w-24"
				>
					<BookOpenIcon class="h-7 w-7 text-muted-foreground" />
				</div>
			{/if}
			<div class="min-w-0 flex-1 space-y-3">
				<div class="flex flex-wrap items-center gap-2">
					<Badge variant="outline" class="gap-1">
						<SparklesIcon class="h-3 w-3" />
						Book
					</Badge>
					{#if book.firstPublishYear}
						<Badge variant="secondary">{book.firstPublishYear}</Badge>
					{/if}
					{#if book.goodreadsUrl}
						<span class="inline-flex items-center gap-1 text-xs text-muted-foreground">
							<ExternalLinkIcon class="h-3 w-3" />
							Goodreads
						</span>
					{/if}
				</div>

				<div class="space-y-1">
					<h3 class="text-lg leading-tight font-semibold">{book.title}</h3>
					{#if book.subtitle}
						<p class="text-sm text-muted-foreground">{book.subtitle}</p>
					{/if}
					{#if book.authorText}
						<p class="text-sm font-medium text-muted-foreground">{book.authorText}</p>
					{/if}
				</div>

				{#if summaryText(book.description)}
					<p class="line-clamp-4 text-sm leading-6 text-muted-foreground">
						{summaryText(book.description)}
					</p>
				{/if}
			</div>
		</a>
	</Card.Root>
{/if}
