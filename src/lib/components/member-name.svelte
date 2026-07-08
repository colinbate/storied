<script lang="ts">
	import { page } from '$app/state';
	import TriangleIcon from '@lucide/svelte/icons/triangle';

	let {
		userId,
		name,
		class: className
	}: { userId: string; name: string; class?: string } = $props();

	const recognized = $derived((page.data.achievementUserIds ?? []).includes(userId));
</script>

<span class={['inline-flex min-w-0 items-baseline gap-1', className]}>
	<span class="min-w-0">{name}</span>
	{#if recognized}
		<span
			class="inline-flex shrink-0 text-primary"
			title="Recognized by the Archive · Access I"
			aria-label="Recognized by the Archive, access level one"
		>
			<TriangleIcon class="size-2.5 fill-current stroke-[1.5]" />
		</span>
	{/if}
</span>
