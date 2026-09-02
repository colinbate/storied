<script lang="ts">
	import { resolve } from '$app/paths';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';

	let {
		section,
		sectionHref,
		title
	}: {
		section: string;
		sectionHref: '/books' | '/series' | '/authors';
		title: string;
	} = $props();
</script>

<nav aria-label="Breadcrumb" class="flex min-w-0 items-center gap-1 text-sm text-muted-foreground">
	<a href={resolve('/library')} class="shrink-0 transition-colors hover:text-foreground">Library</a>
	<ChevronRightIcon class="h-3.5 w-3.5 shrink-0" />
	<a href={resolve(sectionHref)} class="shrink-0 transition-colors hover:text-foreground">
		{section}
	</a>
	<ChevronRightIcon class="h-3.5 w-3.5 shrink-0" />
	<span aria-current="page" class="truncate text-foreground">{title}</span>
</nav>
