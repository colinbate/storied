<script lang="ts">
	import * as Popover from '$lib/components/ui/popover';
	import * as Command from '$lib/components/ui/command';
	import { Button } from '$lib/components/ui/button';
	import * as Avatar from '$lib/components/ui/avatar/index.js';
	import ChevronsUpDown from '@lucide/svelte/icons/chevrons-up-down';
	import type { ClassValue } from 'svelte/elements';

	type MemberItem = {
		id: string;
		displayName: string;
		email?: string | null;
		avatarUrl?: string | null;
	};

	type Props = {
		members: MemberItem[];
		selectedId?: string | undefined | null;
		name?: string;
		class?: ClassValue;
		placeholder?: string;
	};

	let {
		members,
		selectedId = $bindable(),
		name,
		class: className,
		placeholder = 'Select member...'
	}: Props = $props();

	let open = $state(false);
	const selected = $derived(members.find((member) => member.id === selectedId));
</script>

<Popover.Root bind:open>
	<Popover.Trigger>
		{#snippet child({ props })}
			<Button
				{...props}
				variant="outline"
				class={['h-auto min-h-11 w-full justify-between px-3 py-2 text-left', className]}
			>
				<span class="flex min-w-0 items-center gap-3">
					<Avatar.Root class="h-8 w-8 shrink-0">
						{#if selected?.avatarUrl}
							<Avatar.Image src={selected.avatarUrl} alt={selected.displayName} />
						{/if}
						<Avatar.Fallback class="text-xs">
							{selected?.displayName?.charAt(0).toUpperCase() ?? '?'}
						</Avatar.Fallback>
					</Avatar.Root>
					<span class={['min-w-0 flex-1', !selectedId && 'text-muted-foreground']}>
						{#if selected}
							<span class="block truncate font-medium">{selected.displayName}</span>
							{#if selected.email}
								<span class="block truncate text-xs text-muted-foreground">{selected.email}</span>
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
	<Popover.Content class="w-[min(32rem,calc(100vw-2rem))] p-0">
		<Command.Root>
			<Command.Input autofocus placeholder="Search members..." class="h-10" />
			<Command.Empty>No members found.</Command.Empty>
			<Command.Group>
				<div style="max-height: 320px; overflow-y: auto;">
					{#each members as member (member.id)}
						<Command.Item
							value={`${member.displayName} ${member.email ?? ''}`}
							onSelect={() => {
								selectedId = member.id;
								open = false;
							}}
							class="px-3 py-2"
						>
							<Avatar.Root class="h-8 w-8 shrink-0">
								{#if member.avatarUrl}
									<Avatar.Image src={member.avatarUrl} alt={member.displayName} />
								{/if}
								<Avatar.Fallback class="text-xs">
									{member.displayName.charAt(0).toUpperCase()}
								</Avatar.Fallback>
							</Avatar.Root>
							<div class="min-w-0 flex-1">
								<span class="block truncate font-medium">{member.displayName}</span>
								{#if member.email}
									<span class="block truncate text-xs text-muted-foreground">{member.email}</span>
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
