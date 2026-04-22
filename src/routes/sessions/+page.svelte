<script lang="ts">
	import { resolve } from '$app/paths';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import CalendarIcon from '@lucide/svelte/icons/calendar';
	import MapPinIcon from '@lucide/svelte/icons/map-pin';
	import { formatDate } from '$lib/date-format';

	let { data } = $props();
	const timeZone = $derived(data.user?.timezone);

	const groups = $derived([
		{ title: 'Current', sessions: data.currentSessions },
		{ title: 'Past', sessions: data.pastSessions }
	]);
</script>

<svelte:head>
	<title>Sessions — Storied</title>
</svelte:head>

<div class="space-y-8">
	<div>
		<h1 class="text-2xl font-bold">Sessions</h1>
		<p class="text-muted-foreground">Reading sessions, themes, and meeting threads.</p>
	</div>

	{#each groups as group (group.title)}
		<section class="space-y-3">
			<h2 class="text-lg font-semibold">{group.title}</h2>
			{#if group.sessions.length > 0}
				<div class="grid gap-3 sm:grid-cols-2">
					{#each group.sessions as session (session.id)}
						<a href={resolve('/sessions/[slug]', { slug: session.slug })} class="block">
							<Card.Root class="h-full transition-colors hover:border-primary/40">
								<Card.Header>
									<div class="flex items-start justify-between gap-3">
										<div class="min-w-0">
											<Card.Title class="text-base">{session.title}</Card.Title>
											{#if session.themeTitle ?? session.theme}
												<Card.Description>{session.themeTitle ?? session.theme}</Card.Description>
											{/if}
										</div>
										<Badge variant={session.status === 'current' ? 'default' : 'secondary'}>
											{session.status}
										</Badge>
									</div>
								</Card.Header>
								<Card.Content class="space-y-2 text-sm text-muted-foreground">
									<div class="flex items-center gap-2">
										<CalendarIcon class="h-4 w-4" />
										<span>{formatDate(session.startsAt, { time: 'always', timeZone })}</span>
									</div>
									{#if session.locationName}
										<div class="flex items-center gap-2">
											<MapPinIcon class="h-4 w-4" />
											<span>{session.locationName}</span>
										</div>
									{/if}
									{#if session.themeSummary}
										<p class="line-clamp-2">{session.themeSummary}</p>
									{/if}
								</Card.Content>
							</Card.Root>
						</a>
					{/each}
				</div>
			{:else}
				<p class="rounded-lg border bg-card px-4 py-6 text-sm text-muted-foreground">
					No {group.title.toLowerCase()} sessions.
				</p>
			{/if}
		</section>
	{/each}
</div>
