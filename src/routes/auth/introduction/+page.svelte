<script lang="ts">
	import { enhance } from '$app/forms';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { pageTitle } from '$shared/brand';

	let { data, form } = $props();
	let submitting = $state(false);
</script>

<svelte:head>
	<title>{pageTitle('Introduce yourself')}</title>
</svelte:head>

<div class="mx-auto w-full max-w-lg px-4 py-12">
	<Card.Root>
		<Card.Header>
			<Card.Title class="text-2xl">Say hello to the archivist</Card.Title>
			<Card.Description
				>Your email, {data.email}, is confirmed. Introduce yourself to complete your membership
				request.</Card.Description
			>
		</Card.Header>
		<Card.Content>
			<form
				method="POST"
				class="space-y-5"
				use:enhance={() => {
					submitting = true;
					return async ({ update }) => {
						submitting = false;
						await update({ reset: false });
					};
				}}
			>
				<div class="space-y-2">
					<Label for="displayName">Your name</Label>
					<Input
						id="displayName"
						name="displayName"
						autocomplete="name"
						required
						maxlength={50}
						value={form?.displayName ?? data.displayName}
					/>
				</div>
				<div class="space-y-2">
					<Label for="introduction">A short introduction</Label>
					<p id="introduction-help" class="text-sm text-muted-foreground">
						If the archivist might not recognize your name, tell us a little about who you are and
						your interest in the book club. You could mention what you enjoy reading or how you
						heard about us.
					</p>
					<Textarea
						id="introduction"
						name="introduction"
						rows={6}
						required
						maxlength={2000}
						aria-describedby="introduction-help introduction-privacy"
						value={form?.introduction ?? ''}
					/>
					<p id="introduction-privacy" class="text-xs text-muted-foreground">
						Only the people reviewing membership requests can see this message. Up to 2,000
						characters.
					</p>
				</div>
				{#if form?.error}<p role="alert" class="text-sm text-destructive">{form.error}</p>{/if}
				<Button type="submit" class="w-full" disabled={submitting}
					>{submitting ? 'Submitting…' : 'Send membership request'}</Button
				>
			</form>
		</Card.Content>
	</Card.Root>
</div>
