<script lang="ts">
	import * as Command from '$lib/components/ui/command';
	import * as Popover from '$lib/components/ui/popover';
	import { Button } from '$lib/components/ui/button/index.js';
	import CheckIcon from '@lucide/svelte/icons/check';
	import ChevronsUpDownIcon from '@lucide/svelte/icons/chevrons-up-down';

	type AuthorOption = {
		id: string;
		name: string;
	};

	let {
		authors,
		selectedId = $bindable<string | undefined>(),
		name = 'authorId',
		placeholder = 'Search authors...'
	}: {
		authors: AuthorOption[];
		selectedId?: string;
		name?: string;
		placeholder?: string;
	} = $props();

	let open = $state(false);
	const selected = $derived(authors.find((author) => author.id === selectedId));
</script>

<input type="hidden" {name} value={selectedId ?? ''} />

<Popover.Root bind:open>
	<Popover.Trigger>
		{#snippet child({ props })}
			<Button variant="outline" class="w-full justify-between" {...props}>
				<span class="truncate">{selected?.name ?? 'Select author...'}</span>
				<ChevronsUpDownIcon class="ml-2 h-4 w-4 shrink-0 opacity-50" />
			</Button>
		{/snippet}
	</Popover.Trigger>
	<Popover.Content class="w-80 p-0" align="start">
		<Command.Root>
			<Command.Input autofocus {placeholder} class="h-10" />
			<Command.List>
				<Command.Empty>No author found.</Command.Empty>
				<Command.Group>
					{#each authors as author (author.id)}
						<Command.Item
							value={author.name}
							onSelect={() => {
								selectedId = author.id;
								open = false;
							}}
						>
							<div class="min-w-0 flex-1">
								<span class="block truncate">{author.name}</span>
							</div>
							{#if selectedId === author.id}
								<CheckIcon class="h-4 w-4" />
							{/if}
						</Command.Item>
					{/each}
				</Command.Group>
			</Command.List>
		</Command.Root>
	</Popover.Content>
</Popover.Root>
