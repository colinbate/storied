<script lang="ts">
	import * as Popover from '$lib/components/ui/popover';
	import * as Command from '$lib/components/ui/command';
	import { Button } from '$lib/components/ui/button';
	import ChevronsUpDown from '@lucide/svelte/icons/chevrons-up-down';
	import BookOpenIcon from '@lucide/svelte/icons/book-open';
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
			<Button
				{...props}
				variant="outline"
				class={['h-auto w-full justify-between px-3 py-2 text-left', className]}
			>
				<span class="flex min-w-0 items-center gap-3 text-left">
					<BookOpenIcon class="h-4 w-4 text-muted-foreground" />
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
		<Command.Root>
			<Command.Input autofocus placeholder="Search books or authors..." class="h-10" />
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
							class="items-start px-3 py-2"
						>
							<span
								class="mt-0.5 flex h-8 w-6 shrink-0 items-center justify-center rounded bg-muted"
							>
								<BookOpenIcon class="h-4 w-4 text-muted-foreground" />
							</span>
							<div class="min-w-0 flex-1">
								<span class="block truncate font-medium">{b.title}</span>
								{#if b.authorText}
									<span class="block truncate text-xs text-muted-foreground">{b.authorText}</span>
								{/if}
							</div>
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
