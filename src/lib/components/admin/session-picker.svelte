<script lang="ts">
	import * as Popover from '$lib/components/ui/popover';
	import * as Command from '$lib/components/ui/command';
	import { Button } from '$lib/components/ui/button';
	import ChevronsUpDown from '@lucide/svelte/icons/chevrons-up-down';
	import Check from '@lucide/svelte/icons/check';
	import type { ClassValue } from 'svelte/elements';

	type SessionItem = {
		id: string;
		title: string;
		theme?: string | null;
	};

	type Props = {
		sessions: SessionItem[];
		selectedId?: string | undefined | null;
		name?: string;
		class?: ClassValue;
		placeholder?: string;
	};

	let {
		sessions,
		selectedId = $bindable(),
		name,
		class: className,
		placeholder = 'Select session...'
	}: Props = $props();
	let open = $state(false);

	const selected = $derived(sessions.find((s) => s.id === selectedId));
</script>

<Popover.Root bind:open>
	<Popover.Trigger>
		{#snippet child({ props })}
			<Button {...props} variant="outline" class={['justify-between', className]}>
				<span class={!selectedId ? 'text-muted-foreground' : ''}>
					{#if selected}
						{selected.title}{#if selected.theme}
							<span class="text-muted-foreground"> — {selected.theme}</span>
						{/if}
					{:else}
						{placeholder}
					{/if}
				</span>
				<ChevronsUpDown class="ml-2 shrink-0 opacity-50" />
			</Button>
		{/snippet}
	</Popover.Trigger>
	<Popover.Content class="w-100 p-0">
		<Command.Root>
			<Command.Input autofocus placeholder="Search sessions..." class="h-9" />
			<Command.Empty>No sessions found.</Command.Empty>
			<Command.Group>
				<div style="max-height: 320px; overflow-y: auto;">
					{#each sessions as s (s.id)}
						<Command.Item
							value={`${s.title} ${s.theme ?? ''}`}
							onSelect={() => {
								selectedId = s.id;
								open = false;
							}}
						>
							<div class="min-w-0 flex-1 truncate">
								<span class="font-medium">{s.title}</span>
								{#if s.theme}
									<span class="text-muted-foreground"> — {s.theme}</span>
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
