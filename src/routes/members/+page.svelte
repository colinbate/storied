<script lang="ts">
	import { resolve } from '$app/paths';
	import * as Avatar from '$lib/components/ui/avatar/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import * as Card from '$lib/components/ui/card/index.js';

	let { data } = $props();
</script>

<svelte:head>
	<title>Members — Storied</title>
</svelte:head>

<div class="space-y-8">
	<div>
		<h1 class="text-2xl font-bold">Members</h1>
		<p class="text-muted-foreground">
			Curated club profiles, recommendations, and shared reading taste.
		</p>
	</div>

	{#if data.members.length > 0}
		<div class="grid gap-3 sm:grid-cols-2">
			{#each data.members as member (member.id)}
				<a href={resolve('/members/[id]', { id: member.id })} class="block">
					<Card.Root class="h-full transition-colors hover:border-primary/40">
						<Card.Content class="flex items-start gap-4 py-5">
							<Avatar.Root class="h-14 w-14 shrink-0">
								{#if member.avatarUrl}
									<Avatar.Image src={member.avatarUrl} alt={member.displayName} />
								{/if}
								<Avatar.Fallback>{member.displayName.charAt(0).toUpperCase()}</Avatar.Fallback>
							</Avatar.Root>
							<div class="min-w-0 flex-1 space-y-2">
								<div>
									<h2 class="truncate text-lg font-semibold">{member.displayName}</h2>
									{#if member.profile?.headline}
										<p class="line-clamp-2 text-sm text-muted-foreground">
											{member.profile.headline}
										</p>
									{/if}
								</div>
								<div class="flex flex-wrap gap-2">
									{#each member.profileGenres as genre (genre)}
										<Badge variant="secondary">{genre}</Badge>
									{/each}
									{#if member.stats.featured > 0}
										<Badge variant="outline">{member.stats.featured} featured</Badge>
									{/if}
									{#if member.stats.recommendations > 0}
										<Badge variant="outline">{member.stats.recommendations} recs</Badge>
									{/if}
								</div>
							</div>
						</Card.Content>
					</Card.Root>
				</a>
			{/each}
		</div>
	{:else}
		<p class="rounded-lg border bg-card px-4 py-6 text-sm text-muted-foreground">
			No public member profiles yet.
		</p>
	{/if}
</div>
