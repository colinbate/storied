<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { pageTitle } from '$shared/brand';

	let { data, form } = $props();
	const response = $derived(page.url.searchParams.get('response') ?? '');
	const isDecline = $derived(
		['declined', 'decline', 'not_attending', 'not-attending', 'no'].includes(response.toLowerCase())
	);
</script>

<svelte:head
	><title>{pageTitle(data.session ? `RSVP — ${data.session.title}` : 'RSVP')}</title></svelte:head
>

<div class="mx-auto max-w-lg py-12">
	<Card.Root>
		<Card.Header>
			<Card.Title>{data.session ? `RSVP for ${data.session.title}` : 'RSVP'}</Card.Title>
			{#if data.session?.locationName}<Card.Description
					>{data.session.locationName}</Card.Description
				>{/if}
		</Card.Header>
		<Card.Content>
			{#if data.error}
				<p class="rounded-md border border-destructive/50 p-4 text-sm text-destructive">
					{data.error}
				</p>
			{:else}
				{#if form?.error}<p
						class="mb-4 rounded-md border border-destructive/50 p-3 text-sm text-destructive"
					>
						{form.error}
					</p>{/if}
				<form method="POST" use:enhance class="space-y-4">
					<div class="space-y-2">
						<Label for="name">Name</Label><Input
							id="name"
							name="name"
							autocomplete="name"
							value={form?.name ?? ''}
							required
						/>
					</div>
					<div class="space-y-2">
						<Label for="email">Email</Label><Input
							id="email"
							name="email"
							type="email"
							autocomplete="email"
							value={form?.email ?? ''}
							required
						/>
					</div>
					<input type="hidden" name="response" value={response} />
					<div class="absolute -left-[9999px]" aria-hidden="true">
						<Label for="phone">Phone</Label><Input
							id="phone"
							name="phone"
							tabindex={-1}
							autocomplete="off"
						/>
					</div>
					<Button type="submit" class="w-full">{isDecline ? 'Decline' : 'Register'}</Button>
				</form>
				<p class="mt-4 text-xs text-muted-foreground">
					Your name and email are used only for session coordination.
				</p>
			{/if}
		</Card.Content>
	</Card.Root>
</div>
