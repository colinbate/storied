<script lang="ts">
	import LibraryList from '$lib/components/library-list.svelte';

	let { data } = $props();
</script>

<svelte:head>
	<title>Series — The Archive</title>
</svelte:head>

<LibraryList
	books={data.books}
	series={data.series}
	authors={data.authors}
	title="Series"
	description="All series gathered by the club."
	sections={['series']}
/>
