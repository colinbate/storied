<script lang="ts">
	import { enhance } from '$app/forms';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import AlertTriangleIcon from '@lucide/svelte/icons/alert-triangle';
	import EyeIcon from '@lucide/svelte/icons/eye';
	import EyeOffIcon from '@lucide/svelte/icons/eye-off';
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';
	import { toast } from 'svelte-sonner';

	type Source = {
		id: string;
		sourceType: string;
		sourceUrl: string;
		sourceKey: string | null;
		fetchStatus: string;
	};

	let { sources, subjectLabel }: { sources: Source[]; subjectLabel: string } = $props();
	let loadingId = $state<string | null>(null);
	let showIgnored = $state(false);
	const ignoredCount = $derived(
		sources.filter((source) => source.fetchStatus === 'ignored').length
	);
	const visibleSources = $derived(
		showIgnored ? sources : sources.filter((source) => source.fetchStatus !== 'ignored')
	);

	function statusVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
		if (status === 'resolved') return 'default';
		if (status === 'pending') return 'secondary';
		if (status === 'failed') return 'destructive';
		return 'outline';
	}
</script>

{#if sources.length > 0}
	<Card.Root>
		<Card.Header>
			<div class="flex flex-wrap items-start justify-between gap-3">
				<div class="space-y-1.5">
					<div class="flex items-center gap-2">
						<AlertTriangleIcon class="h-5 w-5 text-amber-500" />
						<Card.Title class="text-base">Unmatched Sources</Card.Title>
					</div>
					<Card.Description>
						{#if visibleSources.length > 0}
							These {subjectLabel} sources haven't been matched to a canonical {subjectLabel} yet.
						{:else}
							No unmatched {subjectLabel} sources need attention.
						{/if}
					</Card.Description>
				</div>
				{#if ignoredCount > 0}
					<Button type="button" variant="ghost" onclick={() => (showIgnored = !showIgnored)}>
						{#if showIgnored}
							<EyeOffIcon class="h-4 w-4" />
							Hide ignored
						{:else}
							<EyeIcon class="h-4 w-4" />
							Show ignored ({ignoredCount})
						{/if}
					</Button>
				{/if}
			</div>
		</Card.Header>

		{#if visibleSources.length > 0}
			<Card.Content class="p-0">
				<div class="divide-y">
					{#each visibleSources as source (source.id)}
						<div
							class="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
						>
							<div class="min-w-0 flex-1">
								<div class="flex items-center gap-2">
									<Badge variant={statusVariant(source.fetchStatus)}>{source.fetchStatus}</Badge>
									<Badge variant="outline">{source.sourceType}</Badge>
								</div>
								<p class="mt-1 truncate text-sm text-muted-foreground">{source.sourceUrl}</p>
								{#if source.sourceKey}
									<p class="font-mono text-xs text-muted-foreground/60">Key: {source.sourceKey}</p>
								{/if}
							</div>
							<div class="flex shrink-0 items-center gap-2">
								<form
									method="POST"
									action="?/retrySource"
									use:enhance={() => {
										loadingId = source.id;
										return async ({ result, update }) => {
											loadingId = null;
											if (result.type === 'success') toast.success('Source queued for retry.');
											if (result.type === 'failure') {
												toast.error(String(result.data?.error ?? 'Something went wrong.'));
											}
											await update();
										};
									}}
								>
									<input type="hidden" name="sourceId" value={source.id} />
									<Button type="submit" variant="outline" disabled={loadingId === source.id}>
										<RefreshCwIcon class="h-4 w-4" />
										Retry
									</Button>
								</form>
								{#if source.fetchStatus !== 'ignored'}
									<form
										method="POST"
										action="?/ignoreSource"
										use:enhance={() => {
											loadingId = source.id;
											return async ({ result, update }) => {
												loadingId = null;
												if (result.type === 'success') toast.success('Source hidden as ignored.');
												if (result.type === 'failure') {
													toast.error(String(result.data?.error ?? 'Something went wrong.'));
												}
												await update();
											};
										}}
									>
										<input type="hidden" name="sourceId" value={source.id} />
										<Button type="submit" variant="ghost" disabled={loadingId === source.id}>
											<EyeOffIcon class="h-4 w-4" />
											Ignore
										</Button>
									</form>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			</Card.Content>
		{/if}
	</Card.Root>
{/if}
