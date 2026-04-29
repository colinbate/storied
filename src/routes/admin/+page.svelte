<script lang="ts">
	import { enhance } from '$app/forms';
	import * as Card from '$lib/components/ui/card/index.js';
	import UsersIcon from '@lucide/svelte/icons/users';
	import MessageSquareIcon from '@lucide/svelte/icons/message-square';
	import MessagesSquareIcon from '@lucide/svelte/icons/messages-square';
	import FolderIcon from '@lucide/svelte/icons/folder';
	import SearchIcon from '@lucide/svelte/icons/search';
	import RocketIcon from '@lucide/svelte/icons/rocket';
	import { Button } from '$lib/components/ui/button/index.js';
	import { toast } from 'svelte-sonner';
	import type { SubmitFunction } from '@sveltejs/kit';

	let { data, form } = $props();
	let deployingStaticSite = $state(false);

	const statCards = $derived([
		{ label: 'Members', value: data.stats.users, icon: UsersIcon },
		{ label: 'Threads', value: data.stats.threads, icon: MessageSquareIcon },
		{ label: 'Posts', value: data.stats.posts, icon: MessagesSquareIcon },
		{ label: 'Categories', value: data.stats.categories, icon: FolderIcon }
	]);

	const deployStaticSiteEnhance: SubmitFunction = () => {
		deployingStaticSite = true;

		return async ({ result, update }) => {
			deployingStaticSite = false;
			await update();

			if (result.type === 'success') {
				if (result.data?.staticSiteDeployQueued) {
					const buildUuid = result.data.staticSiteDeployBuildUuid;
					const message = result.data.staticSiteDeployAlreadyExists
						? 'Static site build is already queued.'
						: 'Static site build queued.';

					toast.success(buildUuid ? `${message} Build ${buildUuid}.` : message);
				}
			} else if (result.type === 'failure') {
				toast.error(
					String(result.data?.staticSiteDeployError ?? 'Static site deploy could not be triggered.')
				);
			}
		};
	};
</script>

<svelte:head>
	<title>Admin Dashboard — The Archive</title>
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

	{#if data.permissions.has('static-site:deploy')}
		<Card.Root>
			<Card.Header>
				<Card.Title class="text-base">Static site</Card.Title>
				<Card.Description>Trigger a Cloudflare build for the documentation site.</Card.Description>
			</Card.Header>
			<Card.Content class="space-y-3">
				<form method="POST" action="?/deployStaticSite" use:enhance={deployStaticSiteEnhance}>
					<Button type="submit" variant="outline" disabled={deployingStaticSite}>
						<RocketIcon class="h-4 w-4" />
						{deployingStaticSite ? 'Deploying…' : 'Deploy Static Site'}
					</Button>
				</form>
				{#if form?.staticSiteDeployError}
					<p class="text-sm text-destructive">{form.staticSiteDeployError}</p>
				{:else if form?.staticSiteDeployQueued}
					<p class="text-sm text-muted-foreground">
						{form.staticSiteDeployAlreadyExists
							? 'A static site build was already queued.'
							: 'Static site build queued.'}
						{#if form.staticSiteDeployBuildUuid}
							Build {form.staticSiteDeployBuildUuid}.
						{/if}
					</p>
				{/if}
			</Card.Content>
		</Card.Root>
	{/if}
</div>
