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
	let updatingUserId = $state<string | null>(null);

	const roleOptions = [
		{ value: 'member', label: 'Member' },
		{ value: 'moderator', label: 'Moderator' },
		{ value: 'admin', label: 'Admin' }
	];

	function roleBadgeVariant(role: string): 'default' | 'secondary' | 'outline' {
		if (role === 'admin') return 'default';
		if (role === 'moderator') return 'secondary';
		return 'outline';
	}

	const selectClasses =
		'dark:bg-input/30 border-input focus-visible:border-ring focus-visible:ring-ring/50 disabled:bg-input/50 dark:disabled:bg-input/80 rounded-lg border bg-transparent pl-2.5 pr-10 py-1 text-base transition-colors focus-visible:ring-3 md:text-sm text-foreground placeholder:text-muted-foreground min-w-0 outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50';
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
						return async ({ result, update }) => {
							loading = false;
							await update();
							if (result.type === 'success' && result.data?.memberAdded) {
								toast.success(`Member ${result.data.addedEmail} added!`);
								showAddForm = false;
							}
						};
					}}
					class="flex flex-wrap items-end gap-3"
				>
					<div class="flex-1 space-y-2" style="min-width: 16rem;">
						<Label for="email">Email Address</Label>
						<Input id="email" name="email" type="email" placeholder="frodo@example.com" required />
					</div>
					<div class="flex-1 space-y-2" style="min-width: 16rem;">
						<Label for="displayName">Display Name</Label>
						<Input id="displayName" name="displayName" type="text" placeholder="Frodo Baggins" />
					</div>
					<div class="space-y-2">
						<Label for="role">Role</Label>
						<select id="role" name="role" class={selectClasses} disabled={loading}>
							{#each roleOptions as opt (opt.value)}
								<option value={opt.value} selected={opt.value === 'member'}>{opt.label}</option>
							{/each}
						</select>
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
					<div class="flex items-center justify-between gap-4 px-4 py-3">
						<div class="min-w-0 flex-1">
							<div class="flex items-center gap-2">
								<span class="truncate font-medium">{member.displayName}</span>
								<Badge variant={roleBadgeVariant(member.role)}>{member.role}</Badge>
								{#if member.status !== 'active'}
									<Badge variant="outline" class="text-muted-foreground">{member.status}</Badge>
								{/if}
							</div>
							<p class="truncate text-sm text-muted-foreground">{member.email}</p>
						</div>
						<div class="flex items-center gap-3">
							<form
								method="POST"
								action="?/updateRole"
								use:enhance={() => {
									updatingUserId = member.id;
									const orole = member.role;
									return async ({ result, update }) => {
										await update();
										updatingUserId = null;
										if (result.type === 'success' && result.data?.roleUpdated) {
											toast.success(`Role updated to ${result.data.updatedRole}.`);
										} else if (result.type === 'failure' && result.data?.error) {
											toast.error(String(result.data.error));
											member.role = orole;
										}
									};
								}}
							>
								<input type="hidden" name="userId" value={member.id} />
								<select
									name="role"
									class={selectClasses}
									value={member.role}
									disabled={updatingUserId === member.id}
									onchange={(e) => {
										(e.currentTarget.form as HTMLFormElement | null)?.requestSubmit();
									}}
									aria-label="Role for {member.displayName}"
								>
									{#each roleOptions as opt (opt.value)}
										<option value={opt.value} selected={opt.value === member.role}
											>{opt.label}</option
										>
									{/each}
								</select>
							</form>
							<span class="text-xs whitespace-nowrap text-muted-foreground">
								Joined {new Date(member.createdAt).toLocaleDateString()}
							</span>
						</div>
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
