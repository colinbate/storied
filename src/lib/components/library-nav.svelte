<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';

	const links = [
		{ label: 'Overview', href: '/library' as const },
		{ label: 'Books', href: '/books' as const },
		{ label: 'Series', href: '/series' as const },
		{ label: 'Authors', href: '/authors' as const }
	];

	function isActive(href: (typeof links)[number]['href']) {
		if (href === '/library') return page.url.pathname === href;
		return page.url.pathname === href || page.url.pathname.startsWith(`${href}/`);
	}
</script>

<nav aria-label="Library" class="overflow-x-auto border-b">
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
