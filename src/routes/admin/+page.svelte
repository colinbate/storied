<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { pageTitle } from '$shared/brand';
	import { SESSION_STATUS_LABELS } from '$shared/session-lifecycle';
	import { formatDate } from '$lib/date-format';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import ArrowRightIcon from '@lucide/svelte/icons/arrow-right';
	import CircleAlertIcon from '@lucide/svelte/icons/circle-alert';
	import CircleCheckIcon from '@lucide/svelte/icons/circle-check';
	import ClipboardListIcon from '@lucide/svelte/icons/clipboard-list';
	import FolderIcon from '@lucide/svelte/icons/folder';
	import MessageSquareIcon from '@lucide/svelte/icons/message-square';
	import MessagesSquareIcon from '@lucide/svelte/icons/messages-square';
	import RocketIcon from '@lucide/svelte/icons/rocket';
	import SearchIcon from '@lucide/svelte/icons/search';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
	import UserCheckIcon from '@lucide/svelte/icons/user-check';
	import UsersIcon from '@lucide/svelte/icons/users';
	import { toast } from 'svelte-sonner';
	import type { SubmitFunction } from '@sveltejs/kit';

	let { data, form } = $props();
	let rebuildingSearch = $state(false);
	let deployingStaticSite = $state(false);
	const timeZone = $derived(data.user?.timezone);

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

	const rebuildSearchEnhance: SubmitFunction = () => {
		rebuildingSearch = true;

		return async ({ result, update }) => {
			rebuildingSearch = false;
			await update();

			if (result.type === 'success' && result.data?.searchRebuildQueued) {
				toast.success('Search rebuild queued.');
			} else if (result.type === 'success') {
				toast.error('Search rebuild could not be queued.');
			}
		};
	};
</script>

<svelte:head>
	<title>{pageTitle('Admin Dashboard')}</title>
</svelte:head>

<div class="space-y-8">
	<div>
		<h1 class="text-2xl font-bold">Admin Dashboard</h1>
		<p class="mt-1 text-sm text-muted-foreground">
			Upcoming work, member requests, and delivery issues that need attention.
		</p>
	</div>

	{#if data.canManageSessions || data.canManageMembers}
		<section class="space-y-3" aria-labelledby="attention-heading">
			<h2 id="attention-heading" class="text-base font-semibold">Needs attention</h2>
			<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
				{#if data.canManageSessions}
					<a href={resolve('/admin/sessions')} class="block">
						<Card.Root class="h-full transition-colors hover:border-primary/40">
							<Card.Content class="flex items-start gap-3 py-4">
								<div class="rounded-lg bg-primary/10 p-2">
									<ClipboardListIcon class="h-5 w-5 text-primary" />
								</div>
								<div class="min-w-0 flex-1">
									<p class="text-2xl font-bold">{data.sessionAttentionCount}</p>
									<p class="font-medium">Sessions need preparation</p>
									<p class="text-sm text-muted-foreground">Review the next meetings below.</p>
								</div>
							</Card.Content>
						</Card.Root>
					</a>
				{/if}

				{#if data.canManageMembers}
					<a href={resolve('/admin/members')} class="block">
						<Card.Root class="h-full transition-colors hover:border-primary/40">
							<Card.Content class="flex items-start gap-3 py-4">
								<div class="rounded-lg bg-primary/10 p-2">
									<UserCheckIcon class="h-5 w-5 text-primary" />
								</div>
								<div class="min-w-0 flex-1">
									<p class="text-2xl font-bold">{data.pendingMemberCount}</p>
									<p class="font-medium">Pending member requests</p>
									<p class="text-sm text-muted-foreground">
										{data.pendingMemberCount === 0
											? 'No approvals waiting.'
											: 'Review access requests.'}
									</p>
								</div>
							</Card.Content>
						</Card.Root>
					</a>
				{/if}

				{#if data.canManageSessions}
					<Card.Root class="h-full">
						<Card.Content class="flex items-start gap-3 py-4">
							<div class="rounded-lg bg-destructive/10 p-2">
								{#if data.failedNoticeCount > 0}
									<TriangleAlertIcon class="h-5 w-5 text-destructive" />
								{:else}
									<CircleCheckIcon class="h-5 w-5 text-primary" />
								{/if}
							</div>
							<div class="min-w-0 flex-1">
								<p class="text-2xl font-bold">{data.failedNoticeCount}</p>
								<p class="font-medium">Failed attendee notices</p>
								<p class="text-sm text-muted-foreground">
									{data.failedNoticeCount === 0
										? 'Recent sends are clear.'
										: 'Review the affected sessions below.'}
								</p>
							</div>
						</Card.Content>
					</Card.Root>
				{/if}
			</div>
		</section>
	{/if}

	{#if data.canManageSessions}
		<section class="space-y-3" aria-labelledby="session-work-heading">
			<div class="flex flex-wrap items-center justify-between gap-3">
				<div>
					<h2 id="session-work-heading" class="text-base font-semibold">Session preparation</h2>
					<p class="text-sm text-muted-foreground">Current, upcoming, and draft sessions.</p>
				</div>
				<Button size="sm" variant="outline" href={resolve('/admin/sessions')}>
					All Sessions <ArrowRightIcon class="h-4 w-4" />
				</Button>
			</div>

			{#if data.sessionWork.length > 0}
				<div class="grid gap-3 lg:grid-cols-2">
					{#each data.sessionWork as session (session.id)}
						<Card.Root>
							<Card.Header class="gap-3">
								<div class="flex flex-wrap items-start justify-between gap-3">
									<div class="min-w-0 space-y-1">
										<div class="flex flex-wrap items-center gap-2">
											<Card.Title class="text-base">{session.title}</Card.Title>
											<Badge variant={session.status === 'current' ? 'default' : 'secondary'}>
												{SESSION_STATUS_LABELS[session.status]}
											</Badge>
										</div>
										<Card.Description>
											{#if session.startsAt}
												{formatDate(session.startsAt, {
													time: 'always',
													timeZone: session.timezone ?? timeZone,
													dateStyle: 'medium'
												})}
											{:else}
												Date to be decided
											{/if}
											{#if session.theme}
												· {session.theme}{/if}
										</Card.Description>
									</div>
									<Button
										size="sm"
										href={resolve('/admin/sessions/[slug]', { slug: session.slug })}
									>
										Prepare <ArrowRightIcon class="h-4 w-4" />
									</Button>
								</div>
							</Card.Header>
							<Card.Content class="space-y-3">
								<div class="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
									<div class="rounded-md bg-muted/50 p-2">
										<p class="font-semibold">{session.attendingCount} / {session.rsvpCapacity}</p>
										<p class="text-xs text-muted-foreground">Attending</p>
									</div>
									<div class="rounded-md bg-muted/50 p-2">
										<p class="font-semibold">{session.waitlistCount}</p>
										<p class="text-xs text-muted-foreground">Waitlisted</p>
									</div>
									<div class="rounded-md bg-muted/50 p-2">
										<p class="font-semibold">{session.readingCount}</p>
										<p class="text-xs text-muted-foreground">Reading choices</p>
									</div>
									<div class="rounded-md bg-muted/50 p-2">
										<p class="font-semibold">{session.agendaCount}</p>
										<p class="text-xs text-muted-foreground">Agenda items</p>
									</div>
								</div>
								{#if session.preparationIssues.length > 0}
									<div class="flex flex-wrap items-center gap-2 text-xs">
										<CircleAlertIcon class="h-4 w-4 text-muted-foreground" />
										{#each session.preparationIssues as issue (issue)}
											<Badge variant="outline">{issue}</Badge>
										{/each}
									</div>
								{:else}
									<p class="flex items-center gap-2 text-sm text-muted-foreground">
										<CircleCheckIcon class="h-4 w-4 text-primary" /> Preparation looks complete.
									</p>
								{/if}
							</Card.Content>
						</Card.Root>
					{/each}
				</div>
			{:else}
				<Card.Root>
					<Card.Content class="py-8 text-center text-sm text-muted-foreground">
						No current, upcoming, or draft sessions.
					</Card.Content>
				</Card.Root>
			{/if}
		</section>

		{#if data.failedNotices.length > 0}
			<section class="space-y-3" aria-labelledby="failed-notices-heading">
				<h2 id="failed-notices-heading" class="text-base font-semibold">Delivery problems</h2>
				<Card.Root class="border-destructive/30">
					<Card.Content class="divide-y p-0">
						{#each data.failedNotices as notice (notice.sessionId)}
							<!-- eslint-disable svelte/no-navigation-without-resolve -- both conditional routes are resolved -->
							<a
								href={notice.messageFailureCount > 0
									? resolve('/admin/sessions/[slug]/messages', { slug: notice.slug })
									: resolve('/admin/sessions/[slug]', { slug: notice.slug })}
								class="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/50"
							>
								<span class="flex min-w-0 items-center gap-2">
									<TriangleAlertIcon class="h-4 w-4 shrink-0 text-destructive" />
									<span class="truncate font-medium">{notice.title}</span>
								</span>
								<span class="shrink-0 text-right text-sm text-muted-foreground">
									{notice.count} failed
									<span class="block text-xs">
										{#if notice.messageFailureCount > 0}
											{notice.messageFailureCount}
											{notice.messageFailureCount === 1 ? 'message' : 'messages'}
										{/if}
										{#if notice.messageFailureCount > 0 && notice.reminderFailureCount > 0}
											·
										{/if}
										{#if notice.reminderFailureCount > 0}
											{notice.reminderFailureCount}
											{notice.reminderFailureCount === 1 ? 'reminder' : 'reminders'}
										{/if}
									</span>
								</span>
							</a>
							<!-- eslint-enable svelte/no-navigation-without-resolve -->
						{/each}
					</Card.Content>
				</Card.Root>
			</section>
		{/if}
	{/if}

	<section class="space-y-3" aria-labelledby="community-heading">
		<h2 id="community-heading" class="text-base font-semibold">Community snapshot</h2>
		<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
			{#each statCards as stat (stat.label)}
				<Card.Root>
					<Card.Content class="flex items-center gap-3 py-4">
						<div class="rounded-lg bg-primary/10 p-2">
							<stat.icon class="h-5 w-5 text-primary" />
						</div>
						<div>
							<p class="text-xl font-bold">{stat.value}</p>
							<p class="text-sm text-muted-foreground">{stat.label}</p>
						</div>
					</Card.Content>
				</Card.Root>
			{/each}
		</div>
	</section>

	{#if data.permissions.has('search:rebuild') || data.permissions.has('static-site:deploy')}
		<details class="rounded-lg border bg-card text-card-foreground shadow-sm">
			<summary class="cursor-pointer px-6 py-4 font-medium">Maintenance tools</summary>
			<div class="grid gap-4 border-t p-6 md:grid-cols-2">
				{#if data.permissions.has('search:rebuild')}
					<div class="space-y-3">
						<div>
							<p class="font-medium">Search index</p>
							<p class="text-sm text-muted-foreground">
								Queue a full rebuild of the search indexes.
							</p>
						</div>
						<form method="POST" action="?/rebuildSearch" use:enhance={rebuildSearchEnhance}>
							<Button type="submit" variant="outline" disabled={rebuildingSearch}>
								<SearchIcon class="h-4 w-4" />
								{rebuildingSearch ? 'Queuing…' : 'Rebuild Search'}
							</Button>
						</form>
					</div>
				{/if}

				{#if data.permissions.has('static-site:deploy')}
					<div class="space-y-3">
						<div>
							<p class="font-medium">Static site</p>
							<p class="text-sm text-muted-foreground">
								Trigger a Cloudflare build for the supporting site.
							</p>
						</div>
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
					</div>
				{/if}
			</div>
		</details>
	{/if}
</div>
