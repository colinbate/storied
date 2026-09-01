<script lang="ts">
	import { enhance } from '$app/forms';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { pageTitle } from '$shared/brand';
	import { toast } from 'svelte-sonner';
	import type { SubmitFunction } from '@sveltejs/kit';
	let { data, form } = $props();
	let importing = $state(false);
	const importEnhance: SubmitFunction = () => {
		importing = true;
		return async ({ result, update }) => {
			importing = false;
			await update();
			if (result.type === 'success') toast.success('Legacy RSVP import finished.');
			else if (result.type === 'failure')
				toast.error(String(result.data?.error ?? 'Import failed.'));
		};
	};
</script>

<svelte:head><title>{pageTitle('Import legacy RSVPs')}</title></svelte:head>
<div class="space-y-6">
	<div>
		<h1 class="text-2xl font-bold">Import legacy RSVPs</h1>
		<p class="text-sm text-muted-foreground">
			Preview and idempotently import registrations from the bound RSVP database.
		</p>
	</div>
	{#if !data.preview.configured}<Card.Root
			><Card.Content class="p-5 text-sm text-destructive"
				>The RSVP_DB binding is not configured in this environment.</Card.Content
			></Card.Root
		>{:else}
		<div class="grid gap-4 sm:grid-cols-3">
			<Card.Root
				><Card.Content class="p-5"
					><p class="text-2xl font-bold">{data.preview.registrations}</p>
					<p class="text-sm text-muted-foreground">Legacy registrations</p></Card.Content
				></Card.Root
			><Card.Root
				><Card.Content class="p-5"
					><p class="text-2xl font-bold">{data.preview.matched}</p>
					<p class="text-sm text-muted-foreground">Matched to sessions</p></Card.Content
				></Card.Root
			><Card.Root
				><Card.Content class="p-5"
					><p class="text-2xl font-bold">{data.preview.unmatchedSlugs.length}</p>
					<p class="text-sm text-muted-foreground">Unmatched event slugs</p></Card.Content
				></Card.Root
			>
		</div>
		{#if data.preview.unmatchedSlugs.length}<Card.Root
				><Card.Header><Card.Title class="text-base">Unmatched events</Card.Title></Card.Header
				><Card.Content class="flex flex-wrap gap-2"
					>{#each data.preview.unmatchedSlugs as slug (slug)}<Badge variant="outline">{slug}</Badge
						>{/each}</Card.Content
				></Card.Root
			>{/if}
		{#if data.preview.memberConflicts.length}<Card.Root
				><Card.Header
					><Card.Title class="text-base">Member identity conflicts</Card.Title></Card.Header
				><Card.Content
					><ul class="list-disc space-y-1 pl-5 text-sm">
						{#each data.preview.memberConflicts as conflict (conflict)}<li>{conflict}</li>{/each}
					</ul></Card.Content
				></Card.Root
			>{/if}
		<Card.Root
			><Card.Header
				><Card.Title class="text-base">Run import</Card.Title><Card.Description
					>Safe to rerun: legacy IDs are stored and existing records are updated rather than
					duplicated.</Card.Description
				></Card.Header
			><Card.Content
				><form method="POST" action="?/import" use:enhance={importEnhance}>
					<Button type="submit" disabled={importing}
						>{importing ? 'Importing…' : 'Import RSVP data'}</Button
					>
				</form></Card.Content
			></Card.Root
		>
	{/if}
	{#if form?.summary}<Card.Root
			><Card.Header><Card.Title class="text-base">Last import result</Card.Title></Card.Header
			><Card.Content class="space-y-2 text-sm"
				><p>
					{form.summary.imported} created, {form.summary.updated} updated, {form.summary.skipped} skipped.
				</p>
				{#if form.summary.errors.length}<ul class="list-disc pl-5 text-destructive">
						{#each form.summary.errors as item (item)}<li>{item}</li>{/each}
					</ul>{/if}</Card.Content
			></Card.Root
		>{/if}
</div>
