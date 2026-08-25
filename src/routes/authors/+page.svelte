<script lang="ts">
	import { pageTitle } from '$shared/brand';
	import LibraryList from '$lib/components/library-list.svelte';

	let { data } = $props();
</script>

<svelte:head>
	<title>{pageTitle('Authors')}</title>
</svelte:head>

<LibraryList
	books={data.books}
	series={data.series}
	authors={data.authors}
	title="Authors"
	description="Writers gathered by the club."
	sections={['authors']}
/>
