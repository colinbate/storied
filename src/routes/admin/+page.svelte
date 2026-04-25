<script lang="ts">
	import * as Card from '$lib/components/ui/card/index.js';
	import UsersIcon from '@lucide/svelte/icons/users';
	import MessageSquareIcon from '@lucide/svelte/icons/message-square';
	import MessagesSquareIcon from '@lucide/svelte/icons/messages-square';
	import FolderIcon from '@lucide/svelte/icons/folder';
	import SearchIcon from '@lucide/svelte/icons/search';
	import { Button } from '$lib/components/ui/button/index.js';

	let { data } = $props();

	const statCards = $derived([
		{ label: 'Members', value: data.stats.users, icon: UsersIcon },
		{ label: 'Threads', value: data.stats.threads, icon: MessageSquareIcon },
		{ label: 'Posts', value: data.stats.posts, icon: MessagesSquareIcon },
		{ label: 'Categories', value: data.stats.categories, icon: FolderIcon }
	]);
</script>

<svelte:head>
	<title>Admin Dashboard — Storied</title>
</svelte:head>

<div class="space-y-6">
	<h1 class="text-2xl font-bold">Admin Dashboard</h1>

	<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
		{#each statCards as stat (stat.label)}
			<Card.Root>
				<Card.Content class="flex items-center gap-3">
					<div class="rounded-lg bg-primary/10 p-2">
						<stat.icon class="h-5 w-5 text-primary" />
					</div>
					<div>
						<p class="text-2xl font-bold">{stat.value}</p>
						<p class="text-sm text-muted-foreground">{stat.label}</p>
					</div>
				</Card.Content>
			</Card.Root>
		{/each}
	</div>

	{#if data.permissions.has('search:rebuild')}
		<Card.Root>
			<Card.Header>
				<Card.Title class="text-base">Search index</Card.Title>
				<Card.Description>Queue a full rebuild of the derived FTS indexes.</Card.Description>
			</Card.Header>
			<Card.Content>
				<form method="POST" action="?/rebuildSearch">
					<Button type="submit" variant="outline">
						<SearchIcon class="h-4 w-4" />
						Rebuild Search
					</Button>
				</form>
			</Card.Content>
		</Card.Root>
	{/if}
</div>
