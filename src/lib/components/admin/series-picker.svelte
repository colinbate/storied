<script lang="ts">
	import * as Popover from '$lib/components/ui/popover';
	import * as Command from '$lib/components/ui/command';
	import { Button } from '$lib/components/ui/button';
	import ChevronsUpDown from '@lucide/svelte/icons/chevrons-up-down';
	import Check from '@lucide/svelte/icons/check';
	import type { ClassValue } from 'svelte/elements';

	type SeriesItem = {
		id: string;
		title: string;
		authorText?: string | null;
	};

	type Props = {
		series: SeriesItem[];
		selectedId?: string | undefined | null;
		name?: string;
		class?: ClassValue;
		placeholder?: string;
	};

	let {
		series,
		selectedId = $bindable(),
		name,
		class: className,
		placeholder = 'Select series...'
	}: Props = $props();
	let open = $state(false);

	const selected = $derived(series.find((s) => s.id === selectedId));
</script>

<Popover.Root bind:open>
	<Popover.Trigger>
		{#snippet child({ props })}
			<Button {...props} variant="outline" class={['justify-between', className]}>
				<span class={!selectedId ? 'text-muted-foreground' : ''}>
					{#if selected}
						{selected.title}{#if selected.authorText}
							<span class="text-muted-foreground"> — {selected.authorText}</span>
						{/if}
					{:else}
						{placeholder}
					{/if}
				</span>
				<ChevronsUpDown class="ml-2 shrink-0 opacity-50" />
			</Button>
		{/snippet}
	</Popover.Trigger>
	<Popover.Content class="w-120 p-0">
		<Command.Root>
			<Command.Input autofocus placeholder="Search series..." class="h-9" />
			<Command.Empty>No series found.</Command.Empty>
			<Command.Group>
				<div style="max-height: 320px; overflow-y: auto;">
					{#each series as s (s.id)}
						<Command.Item
							value={`${s.title} ${s.authorText ?? ''}`}
							onSelect={() => {
								selectedId = s.id;
								open = false;
							}}
						>
							<div class="min-w-0 flex-1 truncate">
								<span class="font-medium">{s.title}</span>
								{#if s.authorText}
									<span class="text-muted-foreground"> — {s.authorText}</span>
								{/if}
							</div>
							<Check class={['ml-auto', selectedId !== s.id && 'text-transparent']} />
						</Command.Item>
					{/each}
				</div>
			</Command.Group>
		</Command.Root>
	</Popover.Content>
</Popover.Root>
{#if name}
	<input type="hidden" {name} value={selectedId ?? ''} />
{/if}
