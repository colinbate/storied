<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import * as Avatar from '$lib/components/ui/avatar/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { formatDate } from '$lib/date-format';
	import { cn } from '$lib/utils.js';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import ArchiveIcon from '@lucide/svelte/icons/archive';
	import LoaderCircleIcon from '@lucide/svelte/icons/loader-circle';
	import SendIcon from '@lucide/svelte/icons/send';
	import Volume2Icon from '@lucide/svelte/icons/volume-2';
	import VolumeXIcon from '@lucide/svelte/icons/volume-x';
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';

	let { data, form } = $props();
	let body = $state('');
	let sending = $state(false);

	const currentUserId = $derived(data.user?.id ?? null);
	const isMuted = $derived(Boolean(data.membership.mutedAt));

	onMount(() => {
		void invalidate('app:message-unread-count');
	});
</script>

<svelte:head>
	<title>Messages with {data.otherMember.displayName} — The Archive</title>
</svelte:head>

<div class="space-y-6">
	<a
		href={resolve('/messages')}
		class="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
	>
		<ArrowLeftIcon class="h-4 w-4" />
		Back to Messages
	</a>

	<div class="flex flex-wrap items-start justify-between gap-3">
		<div class="flex min-w-0 items-center gap-3">
			<Avatar.Root class="h-12 w-12 shrink-0">
				{#if data.otherMember.avatarUrl}
					<Avatar.Image src={data.otherMember.avatarUrl} alt={data.otherMember.displayName} />
				{/if}
				<Avatar.Fallback>{data.otherMember.displayName.charAt(0).toUpperCase()}</Avatar.Fallback>
			</Avatar.Root>
			<div class="min-w-0">
				<h1 class="truncate text-2xl font-bold">{data.otherMember.displayName}</h1>
				<a
					href={resolve('/members/[id]', { id: data.otherMember.id })}
					class="text-sm text-muted-foreground hover:text-foreground"
				>
					View profile
				</a>
			</div>
		</div>

		<div class="flex gap-2">
			<form method="POST" action="?/mute" use:enhance>
				<input type="hidden" name="muted" value={isMuted ? 'false' : 'true'} />
				<Button type="submit" variant="outline" size="sm">
					{#if isMuted}
						<Volume2Icon class="h-4 w-4" />
						Unmute
					{:else}
						<VolumeXIcon class="h-4 w-4" />
						Mute
					{/if}
				</Button>
			</form>
			<form method="POST" action="?/archive" use:enhance>
				<Button type="submit" variant="outline" size="sm">
					<ArchiveIcon class="h-4 w-4" />
					Archive
				</Button>
			</form>
		</div>
	</div>

	<div class="space-y-3">
		{#if data.messages.length > 0}
			{#each data.messages as entry (entry.message.id)}
				{@const isOwn = entry.message.authorUserId === currentUserId}
				<div class={cn('flex gap-3', isOwn && 'flex-row-reverse')}>
					<Avatar.Root class="mt-1 h-8 w-8 shrink-0">
						{#if entry.author.avatarUrl}
							<Avatar.Image src={entry.author.avatarUrl} alt={entry.author.displayName} />
						{/if}
						<Avatar.Fallback class="text-xs">
							{entry.author.displayName.charAt(0).toUpperCase()}
						</Avatar.Fallback>
					</Avatar.Root>

					<div class={cn('max-w-[min(42rem,calc(100%-3rem))] space-y-1', isOwn && 'text-right')}>
						<div class="flex flex-wrap items-baseline gap-2 text-xs text-muted-foreground">
							<span class="font-medium text-foreground">{entry.author.displayName}</span>
							<span>
								{formatDate(entry.message.createdAt, {
									timeZone: data.user?.timezone,
									time: 'always'
								})}
							</span>
						</div>
						<div
							class={cn(
								'prose max-w-none rounded-lg border px-4 py-3 text-left wrap-anywhere shadow-xs dark:prose-invert',
								isOwn ? 'border-primary/30 bg-primary/10' : 'bg-card'
							)}
						>
							<!-- eslint-disable-next-line svelte/no-at-html-tags -->
							{@html entry.message.bodyHtml}
						</div>
					</div>
				</div>
			{/each}
		{:else}
			<Card.Root>
				<Card.Content class="py-10 text-center text-muted-foreground">
					<p>No messages yet.</p>
				</Card.Content>
			</Card.Root>
		{/if}
	</div>

	<Card.Root>
		<Card.Header>
			<Card.Title class="text-base">Send a Message</Card.Title>
			<Card.Description>Markdown is supported.</Card.Description>
		</Card.Header>
		<Card.Content>
			<form
				method="POST"
				action="?/send"
				use:enhance={() => {
					sending = true;
					return async ({ result, update }) => {
						sending = false;
						await update();
						if (result.type === 'success') {
							body = '';
							toast.success('Message sent.');
						} else if (result.type === 'failure' && result.data?.error) {
							toast.error(String(result.data.error));
						}
					};
				}}
				class="space-y-3"
			>
				<Textarea
					name="body"
					placeholder="Write a private message..."
					rows={4}
					bind:value={body}
					required
				/>
				{#if form?.error}
					<p class="text-sm text-destructive">{form.error}</p>
				{/if}
				<div class="flex justify-end">
					<Button type="submit" disabled={sending || !body.trim()}>
						{#if sending}
							<LoaderCircleIcon class="h-4 w-4 animate-spin" />
							Sending
						{:else}
							<SendIcon class="h-4 w-4" />
							Send
						{/if}
					</Button>
				</div>
			</form>
		</Card.Content>
	</Card.Root>
</div>
