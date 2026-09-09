<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';

	const links = [
		{ label: 'Sessions', href: '/sessions' as const },
		{ label: 'Themes', href: '/themes' as const }
	];

	function isActive(href: (typeof links)[number]['href']) {
		if (href === '/themes') return page.url.pathname.startsWith('/themes');
		return page.url.pathname.startsWith('/sessions') || page.url.pathname.startsWith('/thread/');
	}
</script>

<nav aria-label="Sessions" class="overflow-x-auto border-b">
	<div class="flex w-max min-w-full gap-1">
		{#each links as link (link.href)}
			<a
				href={resolve(link.href)}
				aria-current={isActive(link.href) ? 'page' : undefined}
				class="inline-flex h-10 shrink-0 items-center border-b-2 border-transparent px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground aria-[current=page]:border-primary aria-[current=page]:text-foreground"
			>
				{link.label}
			</a>
		{/each}
	</div>
</nav>
