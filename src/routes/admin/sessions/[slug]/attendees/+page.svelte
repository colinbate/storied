<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { NativeSelect, NativeSelectOption } from '$lib/components/ui/native-select/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import DownloadIcon from '@lucide/svelte/icons/download';
	import { toast } from 'svelte-sonner';
	import { pageTitle } from '$shared/brand';
	import type { SubmitFunction } from '@sveltejs/kit';

	let { data } = $props();
	const statusOptions = [
		'attending',
		'waitlisted',
		'maybe',
		'declined',
		'cancelled',
		'attended',
		'no_show'
	] as const;
	const enhanceAction: SubmitFunction =
		() =>
		async ({ result, update }) => {
			await update({ reset: result.type === 'success' });
			if (result.type === 'success') toast.success('Attendee record saved.');
			else if (result.type === 'failure' && result.data?.error)
				toast.error(String(result.data.error));
		};
	function label(status: string) {
		return status.replace('_', ' ');
	}
</script>

<svelte:head><title>{pageTitle(`${data.session.title} — Attendees`)}</title></svelte:head>

<div class="space-y-6">
	<div class="flex flex-wrap items-center gap-3">
		<Button
			variant="ghost"
			size="icon-sm"
			href={resolve('/admin/sessions/[slug]', { slug: data.session.slug })}
			><ArrowLeftIcon class="h-4 w-4" /></Button
		>
		<div class="min-w-0 flex-1">
			<h1 class="text-2xl font-bold">Attendees</h1>
			<p class="text-sm text-muted-foreground">{data.session.title}</p>
		</div>
		<Button
			variant="outline"
			href={resolve('/admin/sessions/[slug]/attendees/export.csv', { slug: data.session.slug })}
			><DownloadIcon class="h-4 w-4" /> Export CSV</Button
		>
	</div>

	<Card.Root size="sm">
		<Card.Content class="grid grid-cols-2 gap-x-3 gap-y-3 sm:grid-cols-4 md:grid-cols-7">
			{#each statusOptions as status (status)}
				<div class="text-center">
					<p class="text-2xl font-bold">{data.counts[status]}</p>
					<p class="text-xs text-muted-foreground capitalize">{label(status)}</p>
				</div>
			{/each}
		</Card.Content>
	</Card.Root>

	<div class="grid gap-4 lg:grid-cols-2">
		<Card.Root
			><Card.Header
				><Card.Title class="text-base">Add someone already known</Card.Title></Card.Header
			><Card.Content>
				<form method="POST" action="?/add" use:enhance={enhanceAction} class="space-y-3">
					<div class="space-y-1">
						<Label for="identity">Member or previous guest</Label><NativeSelect
							id="identity"
							name="identity"
							required
							><NativeSelectOption value="">Choose a person</NativeSelectOption
							>{#each data.addableUsers as user (user.id)}<NativeSelectOption
									value={`user:${user.id}`}>{user.displayName} — member</NativeSelectOption
								>{/each}{#each data.availableIdentities.filter((item) => !item.userId) as attendee (attendee.id)}<NativeSelectOption
									value={`attendee:${attendee.id}`}
									>{attendee.name}{attendee.email ? ` — ${attendee.email}` : ''}</NativeSelectOption
								>{/each}</NativeSelect
						>
					</div>
					<div class="space-y-1">
						<Label for="existing-status">Status</Label><NativeSelect
							id="existing-status"
							name="status"
							value={data.session.status === 'past' ? 'attended' : 'attending'}
							>{#each statusOptions as status (status)}<NativeSelectOption value={status}
									>{label(status)}</NativeSelectOption
								>{/each}</NativeSelect
						>
					</div>
					<div class="space-y-1">
						<Label for="existing-note">Note</Label><Input id="existing-note" name="note" />
					</div>
					<Button type="submit">Add attendee</Button>
				</form>
			</Card.Content></Card.Root
		>

		<Card.Root
			><Card.Header
				><Card.Title class="text-base">Add a new guest or walk-in</Card.Title></Card.Header
			><Card.Content>
				<form method="POST" action="?/add" use:enhance={enhanceAction} class="space-y-3">
					<div class="space-y-1">
						<Label for="new-name">Name</Label><Input id="new-name" name="name" required />
					</div>
					<div class="space-y-1">
						<Label for="new-email">Email (optional)</Label><Input id="new-email" name="email" type="email" />
					</div>
					<div class="space-y-1">
						<Label for="new-status">Status</Label><NativeSelect
							id="new-status"
							name="status"
							value={data.session.status === 'past' ? 'attended' : 'attending'}
							>{#each statusOptions as status (status)}<NativeSelectOption value={status}
									>{label(status)}</NativeSelectOption
								>{/each}</NativeSelect
						>
					</div>
					<div class="space-y-1">
						<Label for="new-note">Note</Label><Input
							id="new-note"
							name="note"
							placeholder="Walk-in, added by admin…"
						/>
					</div>
					<Button type="submit">Record attendee</Button>
				</form>
			</Card.Content></Card.Root
		>
	</div>

	<Card.Root
		><Card.Header
			><Card.Title class="text-base">Session records ({data.participants.length})</Card.Title
			><Card.Description>Contact information is visible only to administrators.</Card.Description
			></Card.Header
		><Card.Content class="p-0">
			{#if data.participants.length === 0}<p class="p-6 text-sm text-muted-foreground">
					No RSVPs or attendance records yet.
				</p>{:else}<div class="divide-y">
					{#each data.participants as row (row.participant.id)}<div class="space-y-3 p-4">
							<div class="flex flex-wrap items-start gap-3">
								<div class="min-w-48 flex-1">
									<div class="flex items-center gap-2">
										<p class="font-medium">{row.participant.nameSnapshot}</p>
										<Badge variant="outline">{row.user ? 'member' : 'guest'}</Badge><Badge
											variant="secondary">{row.participant.rsvpSource ?? 'unknown'}</Badge
										>
									</div>
									<p class="text-sm text-muted-foreground">
										{row.participant.emailSnapshot ?? 'No email address'}
									</p>
								</div>
								<form
									method="POST"
									action="?/update"
									use:enhance={enhanceAction}
									class="flex flex-1 flex-wrap items-end gap-2"
								>
									<input type="hidden" name="participantId" value={row.participant.id} />
									<div class="space-y-1">
										<Label for={`status-${row.participant.id}`} class="text-xs">Status</Label
										><NativeSelect
											id={`status-${row.participant.id}`}
											name="status"
											value={row.participant.attendanceStatus}
											>{#each statusOptions as status (status)}<NativeSelectOption value={status}
													>{label(status)}</NativeSelectOption
												>{/each}</NativeSelect
										>
									</div>
									<div class="min-w-40 flex-1 space-y-1">
										<Label for={`note-${row.participant.id}`} class="text-xs">Note</Label><Input
											id={`note-${row.participant.id}`}
											name="note"
											value={row.participant.note ?? ''}
										/>
									</div>
									<Button type="submit" size="sm" variant="outline">Save</Button>
								</form>
								{#if row.participant.emailSnapshot}<form
										method="POST"
										action="?/resend"
										use:enhance={enhanceAction}
									>
										<input type="hidden" name="participantId" value={row.participant.id} /><Button
											type="submit"
											size="sm"
											variant="ghost">Resend email</Button
										>
									</form>{/if}
							</div>
							{#if !row.user}<form
									method="POST"
									action="?/reconcile"
									use:enhance={enhanceAction}
									class="flex flex-wrap items-end gap-2 rounded-md bg-muted/50 p-3"
								>
									<input type="hidden" name="attendeeId" value={row.attendee.id} />
									<div class="min-w-64 flex-1 space-y-1">
										<Label for={`member-${row.attendee.id}`} class="text-xs"
											>Reconcile with member</Label
										><NativeSelect id={`member-${row.attendee.id}`} name="userId" required
											><NativeSelectOption value="">Choose a member</NativeSelectOption
											>{#each data.users as user (user.id)}<NativeSelectOption value={user.id}
													>{user.displayName} — {user.email}</NativeSelectOption
												>{/each}</NativeSelect
										>
									</div>
									<Button type="submit" size="sm" variant="outline">Link and merge history</Button>
								</form>{/if}
						</div>{/each}
				</div>{/if}
		</Card.Content></Card.Root
	>
</div>
