<script lang="ts">
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import * as Popover from '$lib/components/ui/popover';
	import { createCustomGenre, normalizeGenreName, type GenreItem } from '$lib/profile-genres';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import XIcon from '@lucide/svelte/icons/x';
	import type { ClassValue } from 'svelte/elements';

	type Props = {
		genres: GenreItem[];
		selectedGenres?: GenreItem[];
		class?: ClassValue;
		placeholder?: string;
		maxSelected?: number;
		allowCustom?: boolean;
	};

	let {
		genres,
		selectedGenres = $bindable([]),
		class: className,
		placeholder = 'Choose genres...',
		maxSelected = Infinity,
		allowCustom = true
	}: Props = $props();

	let query = $state('');
	let highlightedIndex = $state(0);
	let anchorElement = $state<HTMLElement | null>(null);

	const selectedLower = $derived(new Set(selectedGenres.map((genre) => genre.name.toLowerCase())));
	const canAddMore = $derived(selectedGenres.length < maxSelected);
	const normalizedQuery = $derived(query.trim().toLowerCase());
	const suggestions = $derived.by(() => {
		if (normalizedQuery.length < 2) return [];
		return genres
			.filter((genre) => !selectedLower.has(genre.name.toLowerCase()))
			.filter((genre) => genre.name.toLowerCase().includes(normalizedQuery))
			.slice(0, 8);
	});
	const dropdownOpen = $derived(
		canAddMore && normalizedQuery.length >= 2 && suggestions.length > 0
	);
	const canSubmitCurrentValue = $derived(
		query.trim().length > 0 && (allowCustom || suggestions.length > 0)
	);

	function addGenre(genre: GenreItem) {
		const normalized = normalizeGenreName(genre.name);
		if (!normalized || !canAddMore || selectedLower.has(normalized.toLowerCase())) return;
		selectedGenres = [...selectedGenres, { ...genre, name: normalized }];
		query = '';
		highlightedIndex = 0;
	}

	function removeGenre(genreToRemove: GenreItem) {
		selectedGenres = selectedGenres.filter((genre) => genre.id !== genreToRemove.id);
	}

	function addCurrentValue() {
		if (!canAddMore) return;
		if (dropdownOpen && suggestions[highlightedIndex]) {
			addGenre(suggestions[highlightedIndex]);
			return;
		}
		if (!allowCustom) return;
		const normalized = normalizeGenreName(query);
		if (!normalized) return;
		addGenre(createCustomGenre(normalized));
	}

	function handleKeydown(event: KeyboardEvent) {
		if (!canAddMore) return;

		if (event.key === 'ArrowDown' && dropdownOpen) {
			event.preventDefault();
			highlightedIndex = Math.min(highlightedIndex + 1, suggestions.length - 1);
			return;
		}

		if (event.key === 'ArrowUp' && dropdownOpen) {
			event.preventDefault();
			highlightedIndex = Math.max(highlightedIndex - 1, 0);
			return;
		}

		if (event.key === 'Enter') {
			event.preventDefault();
			addCurrentValue();
			return;
		}

		if (event.key === 'Escape') {
			query = '';
		}
	}
</script>

<div class={['space-y-3', className]}>
	<div class="flex flex-wrap gap-2">
		{#each selectedGenres as genre (genre.id)}
			<Badge variant="secondary" class="gap-1.5 px-2.5 py-1">
				{genre.name}
				<button
					type="button"
					class="rounded hover:bg-muted-foreground/20"
					onclick={() => removeGenre(genre)}
					aria-label="Remove {genre.name}"
				>
					<XIcon class="h-3 w-3" />
				</button>
			</Badge>
		{/each}
	</div>

	{#if canAddMore}
		<div bind:this={anchorElement}>
			<div class="flex gap-2">
				<Input
					bind:value={query}
					{placeholder}
					maxlength={50}
					autocomplete="off"
					aria-expanded={dropdownOpen}
					aria-autocomplete="list"
					aria-controls="genre-suggestions"
					onkeydown={handleKeydown}
				/>
				<Button
					type="button"
					class="h-10"
					disabled={!canSubmitCurrentValue}
					onclick={addCurrentValue}
				>
					<PlusIcon class="h-4 w-4" />
					Add
				</Button>
			</div>
		</div>
	{/if}
</div>

<Popover.Root open={dropdownOpen}>
	<Popover.Content
		customAnchor={anchorElement}
		side="bottom"
		align="start"
		sideOffset={8}
		trapFocus={false}
		onOpenAutoFocus={(event) => event.preventDefault()}
		onCloseAutoFocus={(event) => event.preventDefault()}
		class="z-50 overflow-hidden p-0"
		style="width: min(var(--bits-floating-anchor-width), calc(100vw - 2rem));"
	>
		<div id="genre-suggestions" class="max-h-64 overflow-y-auto p-1">
			{#each suggestions as genre, index (genre.id)}
				<button
					type="button"
					class={[
						'flex w-full items-center rounded-sm px-3 py-2 text-left text-sm',
						index === highlightedIndex ? 'bg-muted text-foreground' : 'hover:bg-muted'
					]}
					onmouseenter={() => (highlightedIndex = index)}
					onclick={() => addGenre(genre)}
				>
					<span class="truncate font-medium">{genre.name}</span>
				</button>
			{/each}
		</div>
	</Popover.Content>
</Popover.Root>
