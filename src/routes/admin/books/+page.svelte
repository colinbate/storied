<script lang="ts">
	import { enhance } from '$app/forms';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';
	import EyeOffIcon from '@lucide/svelte/icons/eye-off';
	import BookOpenIcon from '@lucide/svelte/icons/book-open';
	import AlertTriangleIcon from '@lucide/svelte/icons/alert-triangle';
	import { toast } from 'svelte-sonner';

	let { data } = $props();
	let loadingId = $state<string | null>(null);

	function statusVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
		if (status === 'resolved') return 'default';
		if (status === 'pending') return 'secondary';
		if (status === 'failed') return 'destructive';
		return 'outline';
	}
</script>

<svelte:head>
	<title>Books — Admin — Storied</title>
</svelte:head>

<div class="space-y-6">
	<h1 class="text-2xl font-bold">Books</h1>

	{#if data.unresolvedSources.length > 0}
		<Card.Root>
			<Card.Header>
				<div class="flex items-center gap-2">
					<AlertTriangleIcon class="h-5 w-5 text-amber-500" />
					<Card.Title class="text-base">Unmatched Sources</Card.Title>
				</div>
				<Card.Description>
					These book sources haven't been matched to a canonical book yet.
				</Card.Description>
			</Card.Header>
			<Card.Content class="p-0">
				<div class="divide-y">
					{#each data.unresolvedSources as source (source.id)}
						<div class="flex items-center justify-between gap-4 px-4 py-3">
							<div class="min-w-0 flex-1">
								<div class="flex items-center gap-2">
									<Badge variant={statusVariant(source.fetchStatus)}>
										{source.fetchStatus}
									</Badge>
									<Badge variant="outline">{source.sourceType}</Badge>
								</div>
								<p class="mt-1 truncate text-sm text-muted-foreground">
									{source.sourceUrl}
								</p>
								{#if source.sourceKey}
									<p class="font-mono text-xs text-muted-foreground/60">
										Key: {source.sourceKey}
									</p>
								{/if}
							</div>
							<div class="flex shrink-0 items-center gap-1">
								<form
									method="POST"
									action="?/retrySource"
									use:enhance={() => {
										loadingId = source.id;
										return async ({ result, update }) => {
											loadingId = null;
											if (result.type === 'success') {
												toast.success('Source queued for retry.');
											} else if (result.type === 'failure') {
												toast.error(String(result.data?.error ?? 'Something went wrong.'));
											}
											await update();
										};
									}}
								>
									<input type="hidden" name="sourceId" value={source.id} />
									<Button
										type="submit"
										variant="outline"
										size="sm"
										disabled={loadingId === source.id}
									>
										<RefreshCwIcon class="h-4 w-4" />
										Retry
									</Button>
								</form>
								<form
									method="POST"
									action="?/ignoreSource"
									use:enhance={() => {
										loadingId = source.id;
										return async ({ result, update }) => {
											loadingId = null;
											if (result.type === 'success') {
												toast.success('Source marked as ignored.');
											} else if (result.type === 'failure') {
												toast.error(String(result.data?.error ?? 'Something went wrong.'));
											}
											await update();
										};
									}}
								>
									<input type="hidden" name="sourceId" value={source.id} />
									<Button
										type="submit"
										variant="ghost"
										size="sm"
										disabled={loadingId === source.id}
									>
										<EyeOffIcon class="h-4 w-4" />
										Ignore
									</Button>
								</form>
							</div>
						</div>
					{/each}
				</div>
			</Card.Content>
		</Card.Root>
	{/if}

	<Card.Root>
		<Card.Header>
			<div class="flex items-center gap-2">
				<BookOpenIcon class="h-5 w-5 text-primary" />
				<Card.Title class="text-base">All Books ({data.books.length})</Card.Title>
			</div>
		</Card.Header>
		<Card.Content class="p-0">
			<div class="divide-y">
				{#each data.books as book (book.id)}
					<div class="flex items-center gap-4 px-4 py-3">
						{#if book.coverUrl}
							<img
								src={book.coverUrl}
								alt="Cover of {book.title}"
								class="h-12 w-8 shrink-0 rounded object-cover"
							/>
						{:else}
							<div class="flex h-12 w-8 shrink-0 items-center justify-center rounded bg-muted">
								<BookOpenIcon class="h-4 w-4 text-muted-foreground" />
							</div>
						{/if}
						<div class="min-w-0 flex-1">
							<p class="leading-tight font-medium">{book.title}</p>
							{#if book.authorText}
								<p class="text-sm text-muted-foreground">{book.authorText}</p>
							{/if}
						</div>
						<div class="flex shrink-0 flex-col items-end gap-0.5">
							{#if book.isbn13}
								<span class="font-mono text-xs text-muted-foreground">
									{book.isbn13}
								</span>
							{/if}
							<span class="font-mono text-xs text-muted-foreground/60">
								{book.slug}
							</span>
						</div>
					</div>
				{:else}
					<div class="py-12 text-center text-muted-foreground">
						<p>No books yet.</p>
					</div>
				{/each}
			</div>
		</Card.Content>
	</Card.Root>
</div>
