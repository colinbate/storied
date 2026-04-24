<script lang="ts">
	import GenreTypeaheadMultiPicker from '$lib/components/genre-typeahead-multi-picker.svelte';
	import type { GenreItem } from '$lib/profile-genres';
	import type { ClassValue } from 'svelte/elements';

	type Props = {
		genres: GenreItem[];
		selectedGenres?: GenreItem[];
		name?: string;
		class?: ClassValue;
		placeholder?: string;
	};

	let {
		genres,
		selectedGenres = [],
		name,
		class: className,
		placeholder = 'Add genres...'
	}: Props = $props();
</script>

<GenreTypeaheadMultiPicker
	{genres}
	bind:selectedGenres
	class={className}
	{placeholder}
	allowCustom={false}
/>
{#if name}
	<input type="hidden" {name} value={selectedGenres.map((g) => g.id).join(',')} />
{/if}
