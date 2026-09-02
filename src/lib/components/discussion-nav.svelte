<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';

	type Category = {
		id: string;
		slug: string;
		name: string;
		size?: number;
	};

	let { categories, activeCategorySlug }: { categories: Category[]; activeCategorySlug?: string } =
		$props();
</script>

<nav aria-label="Discussions" class="overflow-x-auto border-b">
	<div class="flex w-max min-w-full gap-1">
		<a
			href={resolve('/discussions')}
			aria-current={page.url.pathname === '/discussions' ? 'page' : undefined}
			class="inline-flex h-10 shrink-0 items-center border-b-2 border-transparent px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground aria-[current=page]:border-primary aria-[current=page]:text-foreground"
		>
			Overview
		</a>
		{#each categories as category (category.id)}
			<a
				href={resolve('/category/[slug]', { slug: category.slug })}
				aria-current={activeCategorySlug === category.slug ? 'page' : undefined}
				class="inline-flex h-10 shrink-0 items-center gap-1.5 border-b-2 border-transparent px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground aria-[current=page]:border-primary aria-[current=page]:text-foreground"
			>
				{category.name}
				{#if category.size !== undefined}
					<span class="text-xs text-muted-foreground">{category.size}</span>
				{/if}
			</a>
		{/each}
	</div>
</nav>
