<script lang="ts">
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { PROFILE_GENRE_LIMIT, serializeProfileGenres } from '$lib/profile-genres';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import XIcon from '@lucide/svelte/icons/x';
	import type { ClassValue } from 'svelte/elements';

	type GenreItem = { id: number; name: string };

	type Props = {
		genres: GenreItem[];
		selectedGenres?: string[];
		name?: string;
		class?: ClassValue;
		placeholder?: string;
	};

	let {
		genres,
		selectedGenres = $bindable([]),
		name,
		class: className,
		placeholder = 'Choose genres...'
	}: Props = $props();

	let query = $state('');
	let highlightedIndex = $state(0);
	let inputRef = $state<HTMLInputElement | null>(null);

	const selectedLower = $derived(new Set(selectedGenres.map((genre) => genre.toLowerCase())));
	const canAddMore = $derived(selectedGenres.length < PROFILE_GENRE_LIMIT);
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

	function normalizeGenreName(value: string) {
		return value.trim().replace(/\s+/g, ' ');
	}

	function addGenre(value: string) {
		const normalized = normalizeGenreName(value);
		if (!normalized || !canAddMore || selectedLower.has(normalized.toLowerCase())) return;
		selectedGenres = [...selectedGenres, normalized];
		query = '';
		highlightedIndex = 0;
	}

	function removeGenre(value: string) {
		selectedGenres = selectedGenres.filter((genre) => genre.toLowerCase() !== value.toLowerCase());
	}

	function addCurrentValue() {
		if (!canAddMore) return;
		if (dropdownOpen && suggestions[highlightedIndex]) {
			addGenre(suggestions[highlightedIndex].name);
			return;
		}
		addGenre(query);
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
		{#each selectedGenres as genre (genre)}
			<Badge variant="secondary" class="gap-1.5 px-2.5 py-1">
				{genre}
				<button
					type="button"
					class="rounded hover:bg-muted-foreground/20"
					onclick={() => removeGenre(genre)}
					aria-label="Remove {genre}"
				>
					<XIcon class="h-3 w-3" />
				</button>
			</Badge>
		{/each}
	</div>

	{#if canAddMore}
		<div class="relative">
			<div class="flex gap-2">
				<Input
					bind:ref={inputRef}
					bind:value={query}
					{placeholder}
					maxlength={50}
					autocomplete="off"
					aria-expanded={dropdownOpen}
					aria-autocomplete="list"
					aria-controls="profile-genre-suggestions"
					onkeydown={handleKeydown}
				/>
				<Button type="button" class="h-10" disabled={!query.trim()} onclick={addCurrentValue}>
					<PlusIcon class="h-4 w-4" />
					Add
				</Button>
			</div>

			{#if dropdownOpen}
				<div
					id="profile-genre-suggestions"
					class="absolute top-full right-0 left-0 z-20 mt-2 overflow-hidden rounded-md border bg-popover shadow-md"
				>
					<div class="max-h-64 overflow-y-auto p-1">
						{#each suggestions as genre, index (genre.id)}
							<button
								type="button"
								class={[
									'flex w-full items-center rounded-sm px-3 py-2 text-left text-sm',
									index === highlightedIndex ? 'bg-muted text-foreground' : 'hover:bg-muted'
								]}
								onmouseenter={() => (highlightedIndex = index)}
								onclick={() => addGenre(genre.name)}
							>
								<span class="truncate font-medium">{genre.name}</span>
							</button>
						{/each}
					</div>
				</div>
			{/if}
		</div>
	{/if}
</div>

{#if name}
	<input type="hidden" {name} value={serializeProfileGenres(selectedGenres) ?? ''} />
{/if}
