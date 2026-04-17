<script lang="ts">
	import * as Popover from '$lib/components/ui/popover';
	import * as Command from '$lib/components/ui/command';
	import { Button } from '$lib/components/ui/button';
	import ChevronsUpDown from '@lucide/svelte/icons/chevrons-up-down';
	import Check from '@lucide/svelte/icons/check';
	import type { ClassValue } from 'svelte/elements';

	type Props = {
		genres: { id: number; name: string }[];
		selectedId?: number | undefined | null;
		name?: string;
		class?: ClassValue;
		placeholder?: string;
	};

	let {
		genres,
		selectedId = $bindable(),
		name,
		class: className,
		placeholder = 'Select genre...'
	}: Props = $props();
	let open = $state(false);
</script>

<Popover.Root bind:open>
	<Popover.Trigger>
		{#snippet child({ props })}
			<Button {...props} variant="outline" class={['justify-between', className]}>
				<span class={!selectedId ? 'text-muted-foreground' : ''}>
					{genres.find((e) => e.id === selectedId)?.name || placeholder}
				</span>
				<ChevronsUpDown class="ml-2 shrink-0 opacity-50" />
			</Button>
		{/snippet}
	</Popover.Trigger>
	<Popover.Content class="w-100 p-0">
		<Command.Root>
			<Command.Input autofocus placeholder="Search genres..." class="h-9" />
			<Command.Empty>No genres found.</Command.Empty>
			<Command.Group>
				<Command.Item
					value="(none)"
					onSelect={() => {
						selectedId = undefined;
						open = false;
					}}
					class="font-normal italic"
				>
					None
					{#if selectedId == null}
						<Check class="ml-auto" />
					{/if}
				</Command.Item>
				<div style="max-height: 320px; overflow-y: auto;">
					{#each genres as g (g.id)}
						<Command.Item
							value={g.name}
							onSelect={() => {
								selectedId = g.id;
								open = false;
							}}
						>
							{g.name}
							<Check class={['ml-auto', selectedId !== g.id && 'text-transparent']} />
						</Command.Item>
					{/each}
				</div>
			</Command.Group>
		</Command.Root>
	</Popover.Content>
</Popover.Root>
{#if name}
	<input type="hidden" {name} value={selectedId} />
{/if}
