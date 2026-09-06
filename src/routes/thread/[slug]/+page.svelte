<script lang="ts">
	import { pageTitle } from '$shared/brand';
	import { resolve } from '$app/paths';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import DiscussionNav from '$lib/components/discussion-nav.svelte';
	import DiscussionThread from '$lib/components/discussion-thread.svelte';
	import SessionNav from '$lib/components/session-nav.svelte';

	let { data, form } = $props();
</script>

<svelte:head>
	<title>{pageTitle(data.thread.title)}</title>
</svelte:head>

<div class="space-y-6">
	{#if data.session}
		<SessionNav />
		<a
			href={resolve('/sessions/[slug]', { slug: data.session.slug })}
			class="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
		>
			<ArrowLeftIcon class="h-4 w-4" />
			Back to {data.session.title}
		</a>
	{:else}
		<DiscussionNav categories={data.discussionCategories} activeCategorySlug={data.category.slug} />
		<a
			href={resolve('/category/[slug]', { slug: data.category.slug })}
			class="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
		>
			<ArrowLeftIcon class="h-4 w-4" />
			Back to {data.category.name}
		</a>
	{/if}

	<DiscussionThread view={data} viewer={data.user} {form} />
</div>
