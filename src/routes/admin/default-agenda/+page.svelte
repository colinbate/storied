<script lang="ts">
	import { resolve } from '$app/paths';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import AgendaEditor from '$lib/components/agenda-editor.svelte';
	import { pageTitle } from '$shared/brand';

	let { data, form } = $props();
</script>

<svelte:head><title>{pageTitle('Default Agenda')}</title></svelte:head>

<div class="mx-auto w-full max-w-3xl space-y-6">
	<div class="flex items-center gap-2">
		<Button variant="ghost" size="icon-sm" href={resolve('/admin/sessions')}>
			<ArrowLeftIcon class="h-4 w-4" />
		</Button>
		<div>
			<h1 class="text-2xl font-bold">Default Agenda</h1>
			<p class="text-sm text-muted-foreground">
				Copied into every new session as its starting agenda. Changing it here does not touch
				sessions that already exist.
			</p>
		</div>
	</div>

	{#if form?.error}
		<div class="rounded border border-destructive p-3 text-sm text-destructive">{form.error}</div>
	{/if}

	<Card.Root>
		<Card.Header>
			<Card.Title class="text-base">Items</Card.Title>
			<Card.Description>
				Drag to reorder, or use the arrows. Facilitator-only items never appear to members.
			</Card.Description>
		</Card.Header>
		<Card.Content>
			<AgendaEditor
				items={data.items}
				emptyText="No default agenda yet. New sessions start empty."
			/>
		</Card.Content>
	</Card.Root>
</div>
