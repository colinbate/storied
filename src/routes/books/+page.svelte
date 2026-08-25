<script lang="ts">
	import { pageTitle } from '$shared/brand';
	import LibraryList from '$lib/components/library-list.svelte';

	let { data } = $props();
</script>

<svelte:head>
	<title>{pageTitle('Books')}</title>
</svelte:head>

<LibraryList
	books={data.books}
	series={data.series}
	authors={data.authors}
	title="Books"
	description="Every book gathered by the club."
	sections={['books']}
/>
