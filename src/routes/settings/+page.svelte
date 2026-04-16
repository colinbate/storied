<script lang="ts">
	import { enhance } from '$app/forms';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import { toast } from 'svelte-sonner';

	let { data, form } = $props();
	let loading = $state(false);

	$effect(() => {
		if (form?.success) {
			toast.success('Profile updated!');
		}
	});
</script>

<svelte:head>
	<title>Settings — Storied</title>
</svelte:head>

<div class="max-w-2xl space-y-6">
	<div>
		<h1 class="text-2xl font-bold">Settings</h1>
		<p class="text-muted-foreground">Manage your account and preferences</p>
	</div>

	<Card.Root>
		<Card.Header>
			<Card.Title>Profile</Card.Title>
			<Card.Description>Update your display name and profile information.</Card.Description>
		</Card.Header>
		<Card.Content>
			<form
				method="POST"
				action="?/updateProfile"
				use:enhance={() => {
					loading = true;
					return async ({ update }) => {
						loading = false;
						await update();
					};
				}}
				class="space-y-4"
			>
				<div class="space-y-2">
					<Label for="email">Email</Label>
					<Input id="email" value={data.user.email} disabled />
					<p class="text-xs text-muted-foreground">Your email cannot be changed.</p>
				</div>
				<div class="space-y-2">
					<Label for="displayName">Display Name</Label>
					<Input
						id="displayName"
						name="displayName"
						value={data.user.displayName}
						required
						minlength={2}
						maxlength={50}
					/>
				</div>
				{#if form?.error}
					<p class="text-sm text-destructive">{form.error}</p>
				{/if}
				<Button type="submit" disabled={loading}>
					{loading ? 'Saving…' : 'Save Changes'}
				</Button>
			</form>
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title>Account</Card.Title>
			<Card.Description>Manage your account.</Card.Description>
		</Card.Header>
		<Card.Content>
			<p class="mb-3 text-sm text-muted-foreground">
				Member since {new Date(data.user.createdAt).toLocaleDateString()}
			</p>
			<Separator class="my-4" />
			<form method="POST" action="/auth/logout">
				<Button variant="outline" type="submit">Sign Out</Button>
			</form>
		</Card.Content>
	</Card.Root>
</div>
