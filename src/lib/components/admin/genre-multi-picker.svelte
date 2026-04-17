<script lang="ts">
	import * as Popover from '$lib/components/ui/popover';
	import * as Command from '$lib/components/ui/command';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import ChevronsUpDown from '@lucide/svelte/icons/chevrons-up-down';
	import Check from '@lucide/svelte/icons/check';
	import XIcon from '@lucide/svelte/icons/x';
	import type { ClassValue } from 'svelte/elements';

	type GenreItem = { id: number; name: string };

	type Props = {
		genres: GenreItem[];
		selectedIds?: number[];
		name?: string;
		class?: ClassValue;
		placeholder?: string;
	};

	let {
		genres,
		selectedIds = $bindable([]),
		name,
		class: className,
		placeholder = 'Add genres...'
	}: Props = $props();
	let open = $state(false);

	const selectedSet = $derived(new Set(selectedIds));
	const selected = $derived(genres.filter((g) => selectedSet.has(g.id)));

	function toggle(id: number) {
		if (selectedSet.has(id)) {
			selectedIds = selectedIds.filter((x) => x !== id);
		} else {
			selectedIds = [...selectedIds, id];
		}
	}

	function remove(id: number) {
		selectedIds = selectedIds.filter((x) => x !== id);
	}
</script>

<div class={['flex flex-col gap-2', className]}>
	{#if selected.length > 0}
		<div class="flex flex-wrap gap-1">
			{#each selected as g (g.id)}
				<Badge variant="secondary" class="gap-1">
					{g.name}
					<button
						type="button"
						class="ml-1 rounded hover:bg-muted-foreground/20"
						onclick={() => remove(g.id)}
						aria-label="Remove {g.name}"
					>
						<XIcon class="size-3" />
					</button>
				</Badge>
			{/each}
		</div>
	{/if}
	<Popover.Root bind:open>
		<Popover.Trigger>
			{#snippet child({ props })}
				<Button {...props} variant="outline" class="justify-between">
					<span class="text-muted-foreground">{placeholder}</span>
					<ChevronsUpDown class="ml-2 shrink-0 opacity-50" />
				</Button>
			{/snippet}
		</Popover.Trigger>
		<Popover.Content class="w-100 p-0">
			<Command.Root>
				<Command.Input autofocus placeholder="Search genres..." class="h-9" />
				<Command.Empty>No genres found.</Command.Empty>
				<Command.Group>
					<div style="max-height: 320px; overflow-y: auto;">
						{#each genres as g (g.id)}
							<Command.Item value={g.name} onSelect={() => toggle(g.id)}>
								{g.name}
								<Check
									class={['ml-auto', !selectedSet.has(g.id) && 'text-transparent']}
								/>
							</Command.Item>
						{/each}
					</div>
				</Command.Group>
			</Command.Root>
		</Popover.Content>
	</Popover.Root>
</div>
{#if name}
	<input type="hidden" {name} value={selectedIds.join(',')} />
{/if}
