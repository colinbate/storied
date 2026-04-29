<script lang="ts">
	import * as Avatar from '$lib/components/ui/avatar/index.js';
	import { cn } from '$lib/utils';

	type Participant = {
		id: string;
		displayName: string;
		avatarUrl: string | null;
	};

	let {
		participants,
		class: className
	}: {
		participants: Participant[];
		class?: string;
	} = $props();

	const labelParticipants = $derived(participants.slice(0, 2));
	const stackParticipants = $derived(participants.slice(0, 4).toReversed());
	const remainingCount = $derived(Math.max(participants.length - stackParticipants.length, 0));
	const label = $derived(
		participants.length <= 2
			? labelParticipants.map((participant) => participant.displayName).join(', ')
			: `${labelParticipants.map((participant) => participant.displayName).join(', ')} + ${participants.length - 2}`
	);
</script>

<div
	class={cn('hidden min-w-0 items-center gap-2 text-muted-foreground md:inline-flex', className)}
	title={participants.map((participant) => participant.displayName).join(', ')}
	aria-label={`${label} replied`}
>
	<Avatar.Group data-size="sm" class="shrink-0">
		{#if remainingCount > 0}
			<Avatar.GroupCount class="h-6 w-6 text-[10px]">+{remainingCount}</Avatar.GroupCount>
		{/if}
		{#each stackParticipants as participant (participant.id)}
			<Avatar.Root class="h-6 w-6">
				{#if participant.avatarUrl}
					<Avatar.Image src={participant.avatarUrl} alt={participant.displayName} />
				{/if}
				<Avatar.Fallback class="text-[10px]">
					{participant.displayName.charAt(0).toUpperCase()}
				</Avatar.Fallback>
			</Avatar.Root>
		{/each}
	</Avatar.Group>
	<span class="truncate">{label}</span>
</div>
