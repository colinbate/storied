<script lang="ts">
	import { resolve } from '$app/paths';
	import * as Avatar from '$lib/components/ui/avatar/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { formatDate } from '$lib/date-format';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import InboxIcon from '@lucide/svelte/icons/inbox';
	import MessageSquareIcon from '@lucide/svelte/icons/message-square';
	import VolumeXIcon from '@lucide/svelte/icons/volume-x';

	let { data } = $props();
</script>

<svelte:head>
	<title>Messages — The Archive</title>
</svelte:head>

<div class="space-y-6">
	<a
		href={resolve('/')}
		class="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
	>
		<ArrowLeftIcon class="h-4 w-4" />
		Back to Discussions
	</a>

	<div class="flex flex-wrap items-start justify-between gap-3">
		<div>
			<h1 class="text-2xl font-bold">Messages</h1>
			<p class="text-muted-foreground">Private conversations with other club members.</p>
		</div>
		<Button href={resolve('/members')} variant="outline">
			<MessageSquareIcon class="h-4 w-4" />
			Start from Members
		</Button>
	</div>

	{#if data.conversations.length > 0}
		<div class="space-y-3">
			{#each data.conversations as conversation (conversation.conversationId)}
				<a
					href={resolve('/messages/[conversationId]', {
						conversationId: conversation.conversationId
					})}
					class="block rounded-lg border bg-card p-4 text-card-foreground shadow-xs transition-colors hover:bg-muted/50"
				>
					<div class="flex gap-3">
						<Avatar.Root class="h-11 w-11 shrink-0">
							{#if conversation.otherAvatarUrl}
								<Avatar.Image
									src={conversation.otherAvatarUrl}
									alt={conversation.otherDisplayName}
								/>
							{/if}
							<Avatar.Fallback>
								{conversation.otherDisplayName.charAt(0).toUpperCase()}
							</Avatar.Fallback>
						</Avatar.Root>

						<div class="min-w-0 flex-1 space-y-1">
							<div class="flex flex-wrap items-center gap-2">
								<h2 class="truncate text-sm font-semibold">{conversation.otherDisplayName}</h2>
								{#if conversation.unread}
									<Badge>
										{conversation.unreadCount}
										unread
									</Badge>
								{/if}
								{#if conversation.muted}
									<Badge variant="secondary" class="gap-1">
										<VolumeXIcon class="h-3 w-3" />
										Muted
									</Badge>
								{/if}
							</div>
							<p class="line-clamp-2 text-sm text-muted-foreground">
								{conversation.lastMessageBodySource ?? 'No messages yet.'}
							</p>
						</div>

						{#if conversation.lastMessageAt}
							<span class="shrink-0 text-xs text-muted-foreground">
								{formatDate(conversation.lastMessageAt, {
									timeZone: data.user?.timezone,
									dateStyle: 'medium',
									timeStyle: 'short'
								})}
							</span>
						{/if}
					</div>
				</a>
			{/each}
		</div>
	{:else}
		<Card.Root>
			<Card.Content class="py-10 text-center text-muted-foreground">
				<InboxIcon class="mx-auto mb-3 h-8 w-8" />
				<p>No messages yet.</p>
			</Card.Content>
		</Card.Root>
	{/if}
	<Card.Root>
		<Card.Header>
			<Card.Title>Privacy Info</Card.Title>
			<Card.Description>
				Private messages are visible only to the conversation participants. App administrators do
				not have access to them, but the site owner can access them in the database if needed for
				moderation or safety reasons. They are not end-to-end encrypted.
			</Card.Description>
		</Card.Header>
	</Card.Root>
</div>
