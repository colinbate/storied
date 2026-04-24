<script lang="ts">
	import GenreTypeaheadMultiPicker from '$lib/components/genre-typeahead-multi-picker.svelte';
	import {
		createCustomGenre,
		PROFILE_GENRE_LIMIT,
		serializeProfileGenres,
		type GenreItem
	} from '$lib/profile-genres';
	import type { ClassValue } from 'svelte/elements';

	type Props = {
		genres: GenreItem[];
		selectedGenres?: string[];
		name?: string;
		class?: ClassValue;
		placeholder?: string;
	};

	let {
		genres,
		selectedGenres = [],
		name,
		class: className,
		placeholder = 'Choose genres...'
	}: Props = $props();

	const genreMap = $derived(new Map(genres.map((g) => [g.name, g.id])));
	let selectedGenreItems = $derived(
		selectedGenres.map((s) => ({ name: s, id: genreMap.get(s) ?? createCustomGenre(s).id }))
	);
</script>

<GenreTypeaheadMultiPicker
	{genres}
	bind:selectedGenres={selectedGenreItems}
	class={className}
	{placeholder}
	maxSelected={PROFILE_GENRE_LIMIT}
	allowCustom={true}
/>

{#if name}
	<input type="hidden" {name} value={serializeProfileGenres(selectedGenreItems) ?? ''} />
{/if}
