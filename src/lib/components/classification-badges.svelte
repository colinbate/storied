<script lang="ts">
	import { Badge } from '$lib/components/ui/badge/index.js';
	import BotIcon from '@lucide/svelte/icons/bot';
	import FlameIcon from '@lucide/svelte/icons/flame';
	import TagIcon from '@lucide/svelte/icons/tag';

	type Classification = {
		slug: string;
		name: string;
		description?: string | null;
		icon?: string | null;
	};

	let {
		classifications,
		compact = false
	}: { classifications?: Classification[] | null; compact?: boolean } = $props();

	const iconComponents = {
		bot: BotIcon,
		flame: FlameIcon,
		tag: TagIcon
	};

	function badgeClass(slug: string) {
		if (slug === 'ai-assisted') return 'border-violet-500/40 text-violet-600 dark:text-violet-300';
		if (slug === 'spicy') return 'border-orange-500/40 text-orange-600 dark:text-orange-300';
		return '';
	}
</script>

{#if classifications?.length}
	<span
		class={[
			'inline-flex flex-wrap items-center gap-1.5',
			compact && 'ml-auto shrink-0 justify-end'
		]}
	>
		{#each classifications as classification (classification.slug)}
			{@const Icon = iconComponents[classification.icon as keyof typeof iconComponents] ?? TagIcon}
			{#if compact}
				<span
					class={[
						'inline-flex h-5 w-5 items-center justify-center rounded-full border bg-background',
						badgeClass(classification.slug)
					]}
					title={classification.description ?? classification.name}
					aria-label={classification.name}
				>
					<Icon class="h-3 w-3" />
				</span>
			{:else}
				<Badge
					variant="outline"
					class={['gap-1', badgeClass(classification.slug)]}
					title={classification.description ?? undefined}
				>
					<Icon class="h-3 w-3" />
					{classification.name}
				</Badge>
			{/if}
		{/each}
	</span>
{/if}
