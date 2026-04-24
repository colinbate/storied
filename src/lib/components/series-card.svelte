<script lang="ts">
	import * as Card from '$lib/components/ui/card/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import LibraryBigIcon from '@lucide/svelte/icons/library-big';
	import ExternalLinkIcon from '@lucide/svelte/icons/external-link';
	import CheckCircle2Icon from '@lucide/svelte/icons/check-circle-2';
	import CircleDashedIcon from '@lucide/svelte/icons/circle-dashed';
	import Layers3Icon from '@lucide/svelte/icons/layers-3';
	import { resolve } from '$app/paths';

	interface SeriesData {
		id: string;
		slug: string;
		title: string;
		authorText?: string | null;
		coverUrl?: string | null;
		goodreadsUrl?: string | null;
		isComplete?: boolean | null;
		bookCount?: number | null;
		description?: string | null;
	}

	let { series, compact = false }: { series: SeriesData; compact?: boolean } = $props();

	function summaryText(text?: string | null, maxLength = 180) {
		if (!text) return null;
		const normalized = text.replace(/\s+/g, ' ').trim();
		if (normalized.length <= maxLength) return normalized;
		return `${normalized.slice(0, maxLength).trimEnd()}...`;
	}
</script>

{#if compact}
	<a
		href={resolve(`/series/${series.slug}`)}
		class="flex items-start gap-3 rounded-lg p-2 transition-colors hover:bg-muted"
		data-series-id={series.id}
	>
		{#if series.coverUrl}
			<img
				src={series.coverUrl}
				alt={series.title}
				class="h-16 w-11 shrink-0 rounded object-cover shadow-sm"
			/>
		{:else}
			<div class="flex h-16 w-11 shrink-0 items-center justify-center rounded bg-muted">
				<LibraryBigIcon class="h-5 w-5 text-muted-foreground" />
			</div>
		{/if}

		<div class="min-w-0 flex-1">
			<p class="text-sm leading-tight font-medium">{series.title}</p>

			{#if series.authorText}
				<p class="mt-0.5 text-xs text-muted-foreground">{series.authorText}</p>
			{/if}

			<div class="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
				{#if series.bookCount != null}
					<span>{series.bookCount} {series.bookCount === 1 ? 'book' : 'books'}</span>
				{/if}

				{#if series.isComplete != null}
					<span class="inline-flex items-center gap-1">
						{#if series.isComplete}
							<CheckCircle2Icon class="h-3 w-3" />
							Complete
						{:else}
							<CircleDashedIcon class="h-3 w-3" />
							Ongoing
						{/if}
					</span>
				{/if}
			</div>
		</div>
	</a>
{:else}
	<Card.Root
		class="group overflow-hidden border-border/70 transition-colors hover:border-primary/40"
	>
		<a
			href={resolve(`/series/${series.slug}`)}
			class="flex gap-4 p-4 sm:gap-5 sm:p-5"
			data-series-id={series.id}
		>
			{#if series.coverUrl}
				<img
					src={series.coverUrl}
					alt={series.title}
					class="h-32 w-22 shrink-0 rounded-md object-cover shadow-md sm:h-36 sm:w-24"
				/>
			{:else}
				<div
					class="flex h-32 w-22 shrink-0 items-center justify-center rounded-md bg-muted shadow-sm sm:h-36 sm:w-24"
				>
					<LibraryBigIcon class="h-7 w-7 text-muted-foreground" />
				</div>
			{/if}

			<div class="min-w-0 flex-1 space-y-3">
				<div class="flex flex-wrap items-center gap-2">
					<Badge variant="outline" class="gap-1">
						<Layers3Icon class="h-3 w-3" />
						Series
					</Badge>
					{#if series.bookCount != null}
						<Badge variant="secondary">
							{series.bookCount}
							{series.bookCount === 1 ? 'book' : 'books'}
						</Badge>
					{/if}
					{#if series.isComplete != null}
						<Badge variant="secondary" class="gap-1">
							{#if series.isComplete}
								<CheckCircle2Icon class="h-3 w-3" />
								Complete
							{:else}
								<CircleDashedIcon class="h-3 w-3" />
								Ongoing
							{/if}
						</Badge>
					{/if}
					{#if series.goodreadsUrl}
						<span class="inline-flex items-center gap-1 text-xs text-muted-foreground">
							<ExternalLinkIcon class="h-3 w-3" />
							Goodreads
						</span>
					{/if}
				</div>

				<div class="space-y-1">
					<h3 class="text-lg leading-tight font-semibold">{series.title}</h3>
					{#if series.authorText}
						<p class="text-sm font-medium text-muted-foreground">{series.authorText}</p>
					{/if}
				</div>

				{#if summaryText(series.description)}
					<p class="line-clamp-4 text-sm leading-6 text-muted-foreground">
						{summaryText(series.description)}
					</p>
				{/if}
			</div>
		</a>
	</Card.Root>
{/if}
