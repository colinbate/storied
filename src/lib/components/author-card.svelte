<script lang="ts">
	import { resolve } from '$app/paths';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import ExternalLinkIcon from '@lucide/svelte/icons/external-link';
	import PenLineIcon from '@lucide/svelte/icons/pen-line';
	import UserIcon from '@lucide/svelte/icons/user';

	interface AuthorData {
		id: string;
		slug: string;
		name: string;
		bio?: string | null;
		photoUrl?: string | null;
		goodreadsUrl?: string | null;
	}

	let { author, compact = false }: { author: AuthorData; compact?: boolean } = $props();

	function summaryText(text?: string | null, maxLength = 180) {
		if (!text) return null;
		const normalized = text.replace(/\s+/g, ' ').trim();
		if (normalized.length <= maxLength) return normalized;
		return `${normalized.slice(0, maxLength).trimEnd()}...`;
	}
</script>

{#if compact}
	<a
		href={resolve(`/authors/${author.slug}`)}
		class="flex items-start gap-3 rounded-lg p-2 transition-colors hover:bg-muted"
		data-author-id={author.id}
	>
		{#if author.photoUrl}
			<img
				src={author.photoUrl}
				alt={author.name}
				class="h-16 w-16 shrink-0 rounded object-cover shadow-sm"
			/>
		{:else}
			<div class="flex h-16 w-16 shrink-0 items-center justify-center rounded bg-muted">
				<UserIcon class="h-5 w-5 text-muted-foreground" />
			</div>
		{/if}
		<div class="min-w-0 flex-1">
			<p class="text-sm leading-tight font-medium">{author.name}</p>
			{#if summaryText(author.bio, 90)}
				<p class="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
					{summaryText(author.bio, 90)}
				</p>
			{/if}
		</div>
	</a>
{:else}
	<Card.Root
		class="group overflow-hidden border-border/70 transition-colors hover:border-primary/40"
	>
		<a
			href={resolve(`/authors/${author.slug}`)}
			class="flex gap-4 p-4 sm:gap-5 sm:p-5"
			data-author-id={author.id}
		>
			{#if author.photoUrl}
				<img
					src={author.photoUrl}
					alt={author.name}
					class="h-32 w-32 shrink-0 rounded-md object-cover shadow-md sm:h-36 sm:w-36"
				/>
			{:else}
				<div
					class="flex h-32 w-32 shrink-0 items-center justify-center rounded-md bg-muted shadow-sm sm:h-36 sm:w-36"
				>
					<UserIcon class="h-7 w-7 text-muted-foreground" />
				</div>
			{/if}
			<div class="min-w-0 flex-1 space-y-3">
				<div class="flex flex-wrap items-center gap-2">
					<Badge variant="outline" class="gap-1">
						<PenLineIcon class="h-3 w-3" />
						Author
					</Badge>
					{#if author.goodreadsUrl}
						<span class="inline-flex items-center gap-1 text-xs text-muted-foreground">
							<ExternalLinkIcon class="h-3 w-3" />
							Goodreads
						</span>
					{/if}
				</div>

				<h3 class="text-lg leading-tight font-semibold">{author.name}</h3>

				{#if summaryText(author.bio)}
					<p class="line-clamp-4 text-sm leading-6 text-muted-foreground">
						{summaryText(author.bio)}
					</p>
				{/if}
			</div>
		</a>
	</Card.Root>
{/if}
