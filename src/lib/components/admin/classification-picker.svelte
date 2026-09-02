<script lang="ts">
	import ClassificationBadges from '$lib/components/classification-badges.svelte';

	type Classification = {
		id: number;
		slug: string;
		name: string;
		description: string | null;
		icon: string;
	};

	let {
		classifications,
		selectedIds = []
	}: { classifications: Classification[]; selectedIds?: number[] } = $props();
</script>

<fieldset class="space-y-3">
	<div class="grid gap-2 sm:grid-cols-2">
		{#each classifications as classification (classification.id)}
			<label
				class="flex items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50"
			>
				<input
					type="checkbox"
					name="classificationIds"
					value={classification.id}
					checked={selectedIds.includes(classification.id)}
					class="mt-0.5 rounded border-input"
				/>
				<span class="min-w-0 space-y-1">
					<ClassificationBadges classifications={[classification]} />
					{#if classification.description}
						<span class="block text-xs leading-relaxed text-muted-foreground">
							{classification.description}
						</span>
					{/if}
				</span>
			</label>
		{/each}
	</div>
</fieldset>
