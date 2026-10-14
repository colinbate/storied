<script lang="ts">
	import * as Popover from '$lib/components/ui/popover';
	import * as Command from '$lib/components/ui/command';
	import { Button } from '$lib/components/ui/button';
	import ChevronsUpDown from '@lucide/svelte/icons/chevrons-up-down';
	import LibraryBigIcon from '@lucide/svelte/icons/library-big';
	import type { ClassValue } from 'svelte/elements';
	import { createPickerSearchIndex, searchPickerItems } from '$lib/picker-search';

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
	let query = $state('');

	const searchIndex = $derived(createPickerSearchIndex(series));
	const results = $derived(searchPickerItems(searchIndex, query));
	const selected = $derived(series.find((s) => s.id === selectedId));
</script>

{#if name}
	<input type="hidden" {name} value={selectedId ?? ''} />
{/if}

<Popover.Root
	bind:open
	onOpenChange={(isOpen) => {
		if (!isOpen) query = '';
	}}
>
	<Popover.Trigger>
		{#snippet child({ props })}
			<Button
				{...props}
				variant="outline"
				class={['h-auto min-h-10 w-full justify-between px-3 py-2 text-left', className]}
			>
				<span class="flex min-w-0 items-center gap-3 text-left">
					<LibraryBigIcon class="h-4 w-4 text-muted-foreground" />
					<span class={['min-w-0 flex-1', !selectedId && 'text-muted-foreground']}>
						{#if selected}
							<span class="block truncate font-medium">{selected.title}</span>
							{#if selected.authorText}
								<span class="block truncate text-xs text-muted-foreground"
									>{selected.authorText}</span
								>
							{/if}
						{:else}
							<span class="block">{placeholder}</span>
						{/if}
					</span>
				</span>
				<ChevronsUpDown class="ml-2 shrink-0 opacity-50" />
			</Button>
		{/snippet}
	</Popover.Trigger>
	<Popover.Content class="w-[min(36rem,calc(100vw-2rem))] p-0">
		<Command.Root shouldFilter={false} label="Series picker">
			<Command.Input
				autofocus
				placeholder="Search series or authors..."
				class="h-10"
				bind:value={query}
			/>
			<Command.List class="max-h-80" aria-label="Series results">
				{#if results.total === 0}
					<Command.Empty forceMount>No series found.</Command.Empty>
				{/if}
				<Command.Group>
					{#each results.items as s (s.id)}
						<Command.Item
							value={s.id}
							onSelect={() => {
								selectedId = s.id;
								query = '';
								open = false;
							}}
							class="items-start px-3 py-2"
						>
							<span
								class="mt-0.5 flex h-8 w-6 shrink-0 items-center justify-center rounded bg-muted"
							>
								<LibraryBigIcon class="h-4 w-4 text-muted-foreground" />
							</span>
							<div class="min-w-0 flex-1">
								<span class="block truncate font-medium">{s.title}</span>
								{#if s.authorText}
									<span class="block truncate text-xs text-muted-foreground">{s.authorText}</span>
								{/if}
							</div>
						</Command.Item>
					{/each}
				</Command.Group>
			</Command.List>
			{#if results.total > results.items.length}
				<p class="px-3 py-2 text-xs text-muted-foreground" role="status">
					Showing {results.items.length} of {results.total} results. Type more to narrow your search.
				</p>
			{/if}
		</Command.Root>
	</Popover.Content>
</Popover.Root>
