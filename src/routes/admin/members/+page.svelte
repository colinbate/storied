<script lang="ts">
	import { enhance } from '$app/forms';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import { toast } from 'svelte-sonner';

	let { data, form } = $props();
	let loading = $state(false);
	let showAddForm = $state(false);

	$effect(() => {
		if (form?.memberAdded) {
			toast.success(`Member ${form.addedEmail} added!`);
			showAddForm = false;
		}
	});

	function roleBadgeVariant(role: string): 'default' | 'secondary' | 'outline' {
		if (role === 'admin') return 'default';
		if (role === 'moderator') return 'secondary';
		return 'outline';
	}
</script>

<svelte:head>
	<title>Members — Admin — Storied</title>
</svelte:head>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<h1 class="text-2xl font-bold">Members</h1>
		<Button
			onclick={() => {
				showAddForm = !showAddForm;
			}}
			size="sm"
		>
			<PlusIcon class="h-4 w-4" />
			Add Member
		</Button>
	</div>

	{#if showAddForm}
		<Card.Root>
			<Card.Header>
				<Card.Title class="text-base">Add a New Member</Card.Title>
				<Card.Description>
					Add a member by email. They'll be able to sign in using a magic link.
				</Card.Description>
			</Card.Header>
			<Card.Content>
				<form
					method="POST"
					action="?/addMember"
					use:enhance={() => {
						loading = true;
						return async ({ update }) => {
							loading = false;
							await update();
						};
					}}
					class="flex items-end gap-3"
				>
					<div class="flex-1 space-y-2">
						<Label for="email">Email Address</Label>
						<Input id="email" name="email" type="email" placeholder="person@example.com" required />
					</div>
					<Button type="submit" disabled={loading}>
						{loading ? 'Adding…' : 'Add'}
					</Button>
				</form>
				{#if form?.error}
					<p class="mt-2 text-sm text-destructive">{form.error}</p>
				{/if}
			</Card.Content>
		</Card.Root>
	{/if}

	<Card.Root>
		<Card.Content class="p-0">
			<div class="divide-y">
				{#each data.members as member (member.id)}
					<div class="flex items-center justify-between px-4 py-3">
						<div>
							<div class="flex items-center gap-2">
								<span class="font-medium">{member.displayName}</span>
								<Badge variant={roleBadgeVariant(member.role)}>{member.role}</Badge>
								{#if member.status !== 'active'}
									<Badge variant="outline" class="text-muted-foreground">{member.status}</Badge>
								{/if}
							</div>
							<p class="text-sm text-muted-foreground">{member.email}</p>
						</div>
						<span class="text-xs text-muted-foreground">
							Joined {new Date(member.createdAt).toLocaleDateString()}
						</span>
					</div>
				{:else}
					<div class="py-12 text-center text-muted-foreground">
						<p>No members yet.</p>
					</div>
				{/each}
			</div>
		</Card.Content>
	</Card.Root>
</div>
