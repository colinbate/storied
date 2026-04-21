<script lang="ts">
	import * as Card from '$lib/components/ui/card/index.js';
	import LibraryBigIcon from '@lucide/svelte/icons/library-big';
	import ExternalLinkIcon from '@lucide/svelte/icons/external-link';
	import CheckCircle2Icon from '@lucide/svelte/icons/check-circle-2';
	import CircleDashedIcon from '@lucide/svelte/icons/circle-dashed';
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
	}

	let { series, compact = false }: { series: SeriesData; compact?: boolean } = $props();
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
	<Card.Root class="overflow-hidden">
		<a href={resolve(`/series/${series.slug}`)} class="flex gap-4 p-4" data-series-id={series.id}>
			{#if series.coverUrl}
				<img
					src={series.coverUrl}
					alt={series.title}
					class="h-24 w-16 shrink-0 rounded object-cover shadow-sm"
				/>
			{:else}
				<div class="flex h-24 w-16 shrink-0 items-center justify-center rounded bg-muted">
					<LibraryBigIcon class="h-6 w-6 text-muted-foreground" />
				</div>
			{/if}

			<div class="min-w-0 flex-1">
				<h3 class="leading-tight font-medium">{series.title}</h3>

				{#if series.authorText}
					<p class="mt-1 text-sm text-muted-foreground">{series.authorText}</p>
				{/if}

				<div class="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
					{#if series.bookCount != null}
						<span>{series.bookCount} {series.bookCount === 1 ? 'book' : 'books'}</span>
					{/if}

					{#if series.isComplete != null}
						<span class="inline-flex items-center gap-1">
							{#if series.isComplete}
								<CheckCircle2Icon class="h-3.5 w-3.5" />
								Complete
							{:else}
								<CircleDashedIcon class="h-3.5 w-3.5" />
								Ongoing
							{/if}
						</span>
					{/if}

					{#if series.goodreadsUrl}
						<span class="inline-flex items-center gap-1">
							<ExternalLinkIcon class="h-3 w-3" />
							Goodreads
						</span>
					{/if}
				</div>
			</div>
		</a>
	</Card.Root>
{/if}
