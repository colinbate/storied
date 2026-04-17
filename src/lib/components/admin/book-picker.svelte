<script lang="ts">
	import * as Popover from '$lib/components/ui/popover';
	import * as Command from '$lib/components/ui/command';
	import { Button } from '$lib/components/ui/button';
	import ChevronsUpDown from '@lucide/svelte/icons/chevrons-up-down';
	import Check from '@lucide/svelte/icons/check';
	import type { ClassValue } from 'svelte/elements';

	type BookItem = {
		id: string;
		title: string;
		authorText?: string | null;
	};

	type Props = {
		books: BookItem[];
		selectedId?: string | undefined | null;
		name?: string;
		class?: ClassValue;
		placeholder?: string;
	};

	let {
		books,
		selectedId = $bindable(),
		name,
		class: className,
		placeholder = 'Select book...'
	}: Props = $props();
	let open = $state(false);

	const selected = $derived(books.find((b) => b.id === selectedId));
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
			<Command.Input autofocus placeholder="Search books..." class="h-9" />
			<Command.Empty>No books found.</Command.Empty>
			<Command.Group>
				<div style="max-height: 320px; overflow-y: auto;">
					{#each books as b (b.id)}
						<Command.Item
							value={`${b.title} ${b.authorText ?? ''}`}
							onSelect={() => {
								selectedId = b.id;
								open = false;
							}}
						>
							<div class="min-w-0 flex-1 truncate">
								<span class="font-medium">{b.title}</span>
								{#if b.authorText}
									<span class="text-muted-foreground"> — {b.authorText}</span>
								{/if}
							</div>
							<Check class={['ml-auto', selectedId !== b.id && 'text-transparent']} />
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
