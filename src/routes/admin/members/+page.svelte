<script lang="ts">
	import { enhance } from '$app/forms';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import SendIcon from '@lucide/svelte/icons/send';
	import CheckIcon from '@lucide/svelte/icons/check';
	import XIcon from '@lucide/svelte/icons/x';
	import { toast } from 'svelte-sonner';
	import { NativeSelectOption, NativeSelect } from '$lib/components/ui/native-select/index.js';
	import { formatDate } from '$lib/date-format';
	import * as Avatar from '$lib/components/ui/avatar/index.js';

	let { data, form } = $props();
	const timeZone = $derived(data.user?.timezone);
	let loading = $state(false);
	let showAddForm = $state(false);
	let showInviteForm = $state(false);
	let creatingInvite = $state(false);
	let updatingUserId = $state<string | null>(null);
	let updatingStatusUserId = $state<string | null>(null);
	let moderatingUserId = $state<string | null>(null);
	const pendingMembers = $derived(data.members.filter((member) => member.status === 'pending'));
	const openInvites = $derived(data.invites.filter((invite) => !invite.claimedAt));

	const roleOptions = [
		{ value: 'member', label: 'Member' },
		{ value: 'moderator', label: 'Moderator' },
		{ value: 'admin', label: 'Admin' }
	];
	const statusOptions = [
		{ value: 'active', label: 'Active' },
		{ value: 'pending', label: 'Pending' },
		{ value: 'suspended', label: 'Suspended' }
	];

	function getInitial(name: string) {
		return name.charAt(0).toUpperCase();
	}

	function roleBadgeVariant(role: string): 'default' | 'secondary' | 'outline' {
		if (role === 'admin') return 'default';
		if (role === 'moderator') return 'secondary';
		return 'outline';
	}
</script>

<svelte:head>
	<title>Members — Admin — The Archive</title>
</svelte:head>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<h1 class="text-2xl font-bold">Members</h1>
		<div class="flex gap-2">
			<Button
				onclick={() => {
					showInviteForm = !showInviteForm;
				}}
				size="sm"
				variant="outline"
			>
				<SendIcon class="h-4 w-4" />
				Invite
			</Button>
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
	</div>

	{#if showInviteForm}
		<Card.Root>
			<Card.Header>
				<Card.Title class="text-base">Send an Invitation</Card.Title>
				<Card.Description>
					Invite someone by email. Their first sign-in will create an active account.
				</Card.Description>
			</Card.Header>
			<Card.Content>
				<form
					method="POST"
					action="?/createInvite"
					use:enhance={() => {
						creatingInvite = true;
						return async ({ result, update }) => {
							creatingInvite = false;
							await update();
							if (result.type === 'success' && result.data?.inviteCreated) {
								const email = result.data.invitedEmail;
								toast.success(email ? `Invitation sent to ${email}.` : 'Invitation created.');
								showInviteForm = false;
							} else if (result.type === 'failure' && result.data?.error) {
								toast.error(String(result.data.error));
							}
						};
					}}
					class="flex flex-wrap items-end gap-3"
				>
					<div class="flex-1 space-y-2" style="min-width: 16rem;">
						<Label for="inviteEmail">Email Address</Label>
						<Input
							id="inviteEmail"
							name="email"
							type="email"
							placeholder="samwise@example.com"
							required
						/>
					</div>
					<div class="space-y-2">
						<Label for="expiresInDays">Expires</Label>
						<NativeSelect id="expiresInDays" name="expiresInDays" disabled={creatingInvite}>
							<NativeSelectOption value="7">7 days</NativeSelectOption>
							<NativeSelectOption value="30" selected>30 days</NativeSelectOption>
							<NativeSelectOption value="90">90 days</NativeSelectOption>
						</NativeSelect>
					</div>
					<Button type="submit" disabled={creatingInvite}>
						{creatingInvite ? 'Sending…' : 'Send Invite'}
					</Button>
				</form>
				{#if form?.inviteCreated && form.inviteUrl}
					<div class="mt-3 rounded border bg-muted/40 p-3 text-sm">
						<p class="font-medium">Invitation link</p>
						<p class="mt-1 break-all text-muted-foreground">{form.inviteUrl}</p>
					</div>
				{/if}
				{#if form?.error}
					<p class="mt-2 text-sm text-destructive">{form.error}</p>
				{/if}
			</Card.Content>
		</Card.Root>
	{/if}

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
						<NativeSelect id="role" name="role" disabled={loading}>
							{#each roleOptions as opt (opt.value)}
								<NativeSelectOption value={opt.value} selected={opt.value === 'member'}
									>{opt.label}</NativeSelectOption
								>
							{/each}
						</NativeSelect>
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

	{#if pendingMembers.length > 0}
		<Card.Root class="pb-1">
			<Card.Header>
				<Card.Title class="text-base">Pending Sign Ups</Card.Title>
				<Card.Description>Review new members before they can access the forum.</Card.Description>
			</Card.Header>
			<Card.Content class="p-0">
				<div class="divide-y">
					{#each pendingMembers as member (member.id)}
						<div class="flex items-center justify-between gap-4 px-4 py-3">
							<div class="min-w-0 flex-1">
								<div class="flex items-center gap-2">
									<span class="truncate font-medium">{member.displayName}</span>
									<Badge variant="outline">pending</Badge>
								</div>
								<p class="truncate text-sm text-muted-foreground">{member.email}</p>
							</div>
							<div class="flex items-center gap-2">
								<span class="hidden text-xs whitespace-nowrap text-muted-foreground sm:inline">
									Requested {formatDate(member.createdAt, { time: 'never', timeZone })}
								</span>
								<form
									method="POST"
									action="?/approveSignup"
									use:enhance={() => {
										moderatingUserId = member.id;
										return async ({ result, update }) => {
											await update();
											moderatingUserId = null;
											if (result.type === 'success' && result.data?.signupApproved) {
												toast.success(
													result.data.approvalEmailSent
														? `${member.email} approved and notified.`
														: `${member.email} approved.`
												);
											} else if (result.type === 'failure' && result.data?.error) {
												toast.error(String(result.data.error));
											}
										};
									}}
								>
									<input type="hidden" name="userId" value={member.id} />
									<Button type="submit" size="sm" disabled={moderatingUserId === member.id}>
										<CheckIcon class="h-4 w-4" />
										Approve
									</Button>
								</form>
								<form
									method="POST"
									action="?/rejectSignup"
									use:enhance={() => {
										moderatingUserId = member.id;
										return async ({ result, update }) => {
											await update();
											moderatingUserId = null;
											if (result.type === 'success' && result.data?.signupRejected) {
												toast.success(`${member.email} rejected.`);
											} else if (result.type === 'failure' && result.data?.error) {
												toast.error(String(result.data.error));
											}
										};
									}}
								>
									<input type="hidden" name="userId" value={member.id} />
									<Button
										type="submit"
										size="sm"
										variant="outline"
										disabled={moderatingUserId === member.id}
									>
										<XIcon class="h-4 w-4" />
										Reject
									</Button>
								</form>
							</div>
						</div>
					{/each}
				</div>
			</Card.Content>
		</Card.Root>
	{/if}

	{#if openInvites.length > 0}
		<Card.Root class="pb-1">
			<Card.Header>
				<Card.Title class="text-base">Open Invitations</Card.Title>
			</Card.Header>
			<Card.Content class="p-0">
				<div class="divide-y">
					{#each openInvites as invite (invite.id)}
						<div class="flex items-center justify-between gap-4 px-4 py-3">
							<div class="min-w-0 flex-1">
								<p class="truncate font-medium">{invite.email ?? 'Reusable invitation'}</p>
								<p class="text-sm text-muted-foreground">
									Created {formatDate(invite.createdAt, { time: 'never', timeZone })}
								</p>
							</div>
							<span class="text-xs whitespace-nowrap text-muted-foreground">
								{#if invite.expiresAt}
									Expires {formatDate(invite.expiresAt, { time: 'never', timeZone })}
								{:else}
									No expiry
								{/if}
							</span>
						</div>
					{/each}
				</div>
			</Card.Content>
		</Card.Root>
	{/if}

	<Card.Root class="py-1">
		<Card.Content class="p-0">
			<div class="divide-y">
				{#each data.members as member (member.id)}
					<div class="flex items-center justify-between gap-4 px-4 py-3">
						<Avatar.Root class="h-8 w-8 shrink-0">
							{#if member.avatarUrl}
								<Avatar.Image src={member.avatarUrl} alt={member.displayName} />
							{/if}
							<Avatar.Fallback class="text-xs">{getInitial(member.displayName)}</Avatar.Fallback>
						</Avatar.Root>
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
										await update({ reset: false });
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
								<NativeSelect
									name="role"
									value={member.role}
									disabled={updatingUserId === member.id}
									onchange={(e) => {
										(e.currentTarget.form as HTMLFormElement | null)?.requestSubmit();
									}}
									aria-label="Role for {member.displayName}"
								>
									{#each roleOptions as opt (opt.value)}
										<NativeSelectOption value={opt.value} selected={opt.value === member.role}
											>{opt.label}</NativeSelectOption
										>
									{/each}
								</NativeSelect>
							</form>
							<form
								method="POST"
								action="?/updateStatus"
								use:enhance={() => {
									updatingStatusUserId = member.id;
									const originalStatus = member.status;
									return async ({ result, update }) => {
										await update({ reset: false });
										updatingStatusUserId = null;
										if (result.type === 'success' && result.data?.statusUpdated) {
											toast.success(
												result.data.approvalEmailSent
													? `Status updated to ${result.data.updatedStatus}; approval email sent.`
													: `Status updated to ${result.data.updatedStatus}.`
											);
										} else if (result.type === 'failure' && result.data?.error) {
											toast.error(String(result.data.error));
											member.status = originalStatus;
										}
									};
								}}
							>
								<input type="hidden" name="userId" value={member.id} />
								<NativeSelect
									name="status"
									value={member.status}
									disabled={updatingStatusUserId === member.id}
									onchange={(e) => {
										(e.currentTarget.form as HTMLFormElement | null)?.requestSubmit();
									}}
									aria-label="Status for {member.displayName}"
								>
									{#each statusOptions as opt (opt.value)}
										<NativeSelectOption value={opt.value} selected={opt.value === member.status}
											>{opt.label}</NativeSelectOption
										>
									{/each}
								</NativeSelect>
							</form>
							<span class="text-xs whitespace-nowrap text-muted-foreground">
								Joined {formatDate(member.createdAt, { time: 'never', timeZone })}
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
