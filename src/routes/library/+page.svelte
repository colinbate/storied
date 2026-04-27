<script lang="ts">
	import LibraryList from '$lib/components/library-list.svelte';

	let { data } = $props();
</script>

<svelte:head>
	<title>Library — The Archive</title>
</svelte:head>

<LibraryList books={data.books} series={data.series} authors={data.authors} />
