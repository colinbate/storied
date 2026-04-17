<script lang="ts">
	import * as Card from '$lib/components/ui/card/index.js';
	import BookOpenIcon from '@lucide/svelte/icons/book-open';
	import ExternalLinkIcon from '@lucide/svelte/icons/external-link';
	import { resolve } from '$app/paths';

	interface BookData {
		id: string;
		slug: string;
		title: string;
		authorText?: string | null;
		coverUrl?: string | null;
		goodreadsUrl?: string | null;
	}

	let { book, compact = false }: { book: BookData; compact?: boolean } = $props();
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
	<Card.Root class="overflow-hidden">
		<a href={resolve(`/books/${book.slug}`)} class="flex gap-4 p-4" data-book-id={book.id}>
			{#if book.coverUrl}
				<img
					src={book.coverUrl}
					alt={book.title}
					class="h-24 w-16 shrink-0 rounded object-cover shadow-sm"
				/>
			{:else}
				<div class="flex h-24 w-16 shrink-0 items-center justify-center rounded bg-muted">
					<BookOpenIcon class="h-6 w-6 text-muted-foreground" />
				</div>
			{/if}
			<div class="min-w-0 flex-1">
				<h3 class="leading-tight font-medium">{book.title}</h3>
				{#if book.authorText}
					<p class="mt-1 text-sm text-muted-foreground">{book.authorText}</p>
				{/if}
				{#if book.goodreadsUrl}
					<span class="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground">
						<ExternalLinkIcon class="h-3 w-3" />
						Goodreads
					</span>
				{/if}
			</div>
		</a>
	</Card.Root>
{/if}
