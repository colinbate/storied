<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { NativeSelect, NativeSelectOption } from '$lib/components/ui/native-select/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import DownloadIcon from '@lucide/svelte/icons/download';
	import EllipsisIcon from '@lucide/svelte/icons/ellipsis';
	import UsersRoundIcon from '@lucide/svelte/icons/users-round';
	import MailIcon from '@lucide/svelte/icons/mail';
	import { toast } from 'svelte-sonner';
	import { pageTitle } from '$shared/brand';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { formatDate } from '$lib/date-format';

	let { data } = $props();
	const timeZone = $derived(data.user?.timezone);
	const statusOptions = [
		'attending',
		'attended',
		'waitlisted',
		'maybe',
		'declined',
		'cancelled',
		'no_show'
	] as const;
	const confirmationStatuses = new Set(['attending', 'waitlisted', 'attended']);
	type RecordAction = 'note' | 'reconcile' | 'delete';
	let recordActionOpen = $state(false);
	let recordAction = $state<{ kind: RecordAction; participantId: string } | null>(null);
	let selectedRecord = $derived(
		recordAction
			? (data.participants.find((row) => row.participant.id === recordAction?.participantId) ??
					null)
			: null
	);
	const participantGroups = $derived(
		statusOptions
			.map((status) => ({
				status,
				rows: data.participants.filter((row) => row.participant.attendanceStatus === status)
			}))
			.filter((group) => group.rows.length > 0)
	);
	const enhanceAction: SubmitFunction =
		() =>
		async ({ result, update }) => {
			await update({ reset: result.type === 'success' });
			if (result.type === 'success') toast.success('Attendee record saved.');
			else if (result.type === 'failure' && result.data?.error)
				toast.error(String(result.data.error));
		};
	const enhanceResend: SubmitFunction =
		() =>
		async ({ result, update }) => {
			await update({ reset: false });
			if (result.type === 'success') toast.success('Confirmation email sent.');
			else if (result.type === 'failure' && result.data?.error)
				toast.error(String(result.data.error));
		};
	const enhanceRecordAction: SubmitFunction = () => {
		const kind = recordAction?.kind;
		return async ({ result, update }) => {
			await update({ reset: result.type === 'success' });
			if (result.type === 'success') {
				toast.success(kind === 'delete' ? 'Session record deleted.' : 'Attendee record saved.');
				recordActionOpen = false;
			} else if (result.type === 'failure' && result.data?.error) {
				toast.error(String(result.data.error));
			}
		};
	};
	function label(status: string) {
		return status.replace('_', ' ');
	}
	function confirmationLabel(status: string) {
		return status === 'waitlisted' ? 'Resend waitlist confirmation' : 'Resend RSVP confirmation';
	}
	function recordedLabel(source: string | null) {
		return source === 'member' || source === 'public_form' ? 'RSVP received' : 'Record created';
	}
	function openRecordAction(kind: RecordAction, participantId: string) {
		recordAction = { kind, participantId };
		recordActionOpen = true;
	}
	function submitForm(id: string) {
		(document.getElementById(id) as HTMLFormElement | null)?.requestSubmit();
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
		<div class="flex flex-wrap gap-2">
			<Button
				variant="outline"
				href={resolve('/admin/sessions/[slug]/messages', { slug: data.session.slug })}
			>
				<MailIcon class="h-4 w-4" /> Message attendees
			</Button>
			<Button variant="outline" href={resolve('/admin/attendees')}>
				<UsersRoundIcon class="h-4 w-4" /> Manage attendees
			</Button>
			<Button
				variant="outline"
				href={resolve('/admin/sessions/[slug]/attendees/export.csv', { slug: data.session.slug })}
				><DownloadIcon class="h-4 w-4" /> Export CSV</Button
			>
		</div>
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
				<form
					method="POST"
					action="?/add"
					use:enhance={enhanceAction}
					class="space-y-3"
					autocomplete="off"
				>
					<div class="space-y-1">
						<Label for="new-name">Name</Label><Input
							id="new-name"
							name="guestName"
							autocomplete="off"
							required
						/>
					</div>
					<div class="space-y-1">
						<Label for="new-email">Email (optional)</Label><Input
							id="new-email"
							name="email"
							type="email"
							autocomplete="off"
						/>
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

	<div class="space-y-4">
		<div>
			<h2 class="text-base font-semibold">Session records ({data.participants.length})</h2>
			<p class="text-sm text-muted-foreground">
				Records are separated by status. Contact information is visible only to administrators.
			</p>
		</div>
		{#if data.participants.length === 0}
			<Card.Root>
				<Card.Content class="p-6 text-sm text-muted-foreground">
					No RSVPs or attendance records yet.
				</Card.Content>
			</Card.Root>
		{:else}
			{#each participantGroups as group (group.status)}
				<Card.Root>
					<Card.Header>
						<Card.Title class="text-base capitalize">
							{label(group.status)} ({group.rows.length})
						</Card.Title>
					</Card.Header>
					<Card.Content class="p-0">
						<div class="divide-y">
							{#each group.rows as row (row.participant.id)}<div class="p-4">
									<div class="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
										<div class="min-w-48 flex-1">
											<div class="flex flex-wrap items-center gap-2">
												<p class="font-medium">{row.participant.nameSnapshot}</p>
												<Badge variant="outline">{row.user ? 'member' : 'guest'}</Badge><Badge
													variant="secondary">{row.participant.rsvpSource ?? 'unknown'}</Badge
												>
											</div>
											<p class="text-sm text-muted-foreground">
												{row.participant.emailSnapshot ?? 'No email address'}
											</p>
											<p class="text-xs text-muted-foreground">
												{recordedLabel(row.participant.rsvpSource)}
												{formatDate(row.participant.createdAt, {
													dateStyle: 'medium',
													time: 'always',
													timeZone
												})}
											</p>
											{#if data.reminderDeliveries[row.attendee.id]}
												{@const reminder = data.reminderDeliveries[row.attendee.id]}
												<p class="text-xs text-muted-foreground">
													{#if reminder.status === 'sent'}
														Reminder sent {formatDate(reminder.sentAt ?? reminder.attemptedAt, {
															dateStyle: 'medium',
															time: 'never',
															timeZone
														})}
													{:else if reminder.status === 'failed'}
														<span class="text-destructive">
															Reminder failed: {reminder.failureReason ?? 'unknown error'}
														</span>
													{:else}
														Reminder in progress
													{/if}
												</p>
											{/if}
										</div>
										<div class="flex items-center gap-2">
											<form
												method="POST"
												action="?/update"
												use:enhance={enhanceAction}
												class="flex items-center gap-2"
											>
												<input type="hidden" name="participantId" value={row.participant.id} />
												<input type="hidden" name="note" value={row.participant.note ?? ''} />
												<Label for={`status-${row.participant.id}`} class="sr-only">Status</Label
												><NativeSelect
													id={`status-${row.participant.id}`}
													name="status"
													aria-label={`Status for ${row.participant.nameSnapshot}`}
													value={row.participant.attendanceStatus}
													>{#each statusOptions as status (status)}<NativeSelectOption
															value={status}>{label(status)}</NativeSelectOption
														>{/each}</NativeSelect
												>
												<Button type="submit" class="h-10">Update status</Button>
											</form>
											<DropdownMenu.Root>
												<DropdownMenu.Trigger>
													{#snippet child({ props })}
														<Button
															variant="ghost"
															size="icon"
															class="size-10"
															aria-label={`Actions for ${row.participant.nameSnapshot}`}
															{...props}
														>
															<EllipsisIcon class="size-4" />
														</Button>
													{/snippet}
												</DropdownMenu.Trigger>
												<DropdownMenu.Content align="end" class="w-56">
													<DropdownMenu.Item
														onSelect={() => openRecordAction('note', row.participant.id)}
													>
														{row.participant.note ? 'Edit note' : 'Add note'}
													</DropdownMenu.Item>
													{#if row.attendee.email && confirmationStatuses.has(row.participant.attendanceStatus)}<DropdownMenu.Item
															onSelect={() => submitForm(`resend-${row.participant.id}`)}
														>
															{confirmationLabel(row.participant.attendanceStatus)}
														</DropdownMenu.Item>{/if}
													{#if !row.user}<DropdownMenu.Item
															onSelect={() => openRecordAction('reconcile', row.participant.id)}
														>
															Reconcile with member
														</DropdownMenu.Item>{/if}
													<DropdownMenu.Separator />
													<DropdownMenu.Item
														class="text-destructive focus:text-destructive"
														onSelect={() => openRecordAction('delete', row.participant.id)}
													>
														Delete session record
													</DropdownMenu.Item>
												</DropdownMenu.Content>
											</DropdownMenu.Root>
											{#if row.attendee.email && confirmationStatuses.has(row.participant.attendanceStatus)}<form
													id={`resend-${row.participant.id}`}
													method="POST"
													action="?/resend"
													use:enhance={enhanceResend}
													class="hidden"
												>
													<input type="hidden" name="participantId" value={row.participant.id} />
												</form>{/if}
										</div>
									</div>
								</div>{/each}
						</div>
					</Card.Content>
				</Card.Root>
			{/each}
		{/if}
	</div>
</div>

<Dialog.Root bind:open={recordActionOpen}>
	<Dialog.Content>
		{#if selectedRecord && recordAction?.kind === 'note'}
			<Dialog.Header>
				<Dialog.Title>{selectedRecord.participant.note ? 'Edit note' : 'Add note'}</Dialog.Title>
				<Dialog.Description>
					Add an internal note for {selectedRecord.participant.nameSnapshot}. Notes are visible only
					to administrators.
				</Dialog.Description>
			</Dialog.Header>
			<form method="POST" action="?/update" use:enhance={enhanceRecordAction} class="space-y-4">
				<input type="hidden" name="participantId" value={selectedRecord.participant.id} />
				<input type="hidden" name="status" value={selectedRecord.participant.attendanceStatus} />
				<div class="space-y-2">
					<Label for="record-note">Internal note</Label>
					<Input id="record-note" name="note" value={selectedRecord.participant.note ?? ''} />
				</div>
				<Dialog.Footer>
					<Button type="button" variant="ghost" onclick={() => (recordActionOpen = false)}>
						Cancel
					</Button>
					<Button type="submit">Save note</Button>
				</Dialog.Footer>
			</form>
		{:else if selectedRecord && recordAction?.kind === 'reconcile' && !selectedRecord.user}
			<Dialog.Header>
				<Dialog.Title>Reconcile with member</Dialog.Title>
				<Dialog.Description>
					Link {selectedRecord.participant.nameSnapshot} to an existing member and merge their attendance
					history.
				</Dialog.Description>
			</Dialog.Header>
			<form method="POST" action="?/reconcile" use:enhance={enhanceRecordAction} class="space-y-4">
				<input type="hidden" name="attendeeId" value={selectedRecord.attendee.id} />
				<div class="space-y-2">
					<Label for="reconcile-member">Member</Label>
					<NativeSelect id="reconcile-member" name="userId" class="w-full" required>
						<NativeSelectOption value="">Choose a member</NativeSelectOption>
						{#each data.users as user (user.id)}
							<NativeSelectOption value={user.id}
								>{user.displayName} — {user.email}</NativeSelectOption
							>
						{/each}
					</NativeSelect>
				</div>
				<Dialog.Footer>
					<Button type="button" variant="ghost" onclick={() => (recordActionOpen = false)}>
						Cancel
					</Button>
					<Button type="submit">Link and merge history</Button>
				</Dialog.Footer>
			</form>
		{:else if selectedRecord && recordAction?.kind === 'delete'}
			<Dialog.Header>
				<Dialog.Title>Delete session record?</Dialog.Title>
				<Dialog.Description>
					Remove {selectedRecord.participant.nameSnapshot} from {data.session.title}. This deletes
					only this session record; their previous-guest identity and other history are kept.
				</Dialog.Description>
			</Dialog.Header>
			<form method="POST" action="?/delete" use:enhance={enhanceRecordAction}>
				<input type="hidden" name="participantId" value={selectedRecord.participant.id} />
				<Dialog.Footer>
					<Button type="button" variant="ghost" onclick={() => (recordActionOpen = false)}>
						Cancel
					</Button>
					<Button type="submit" variant="destructive">Delete record</Button>
				</Dialog.Footer>
			</form>
		{/if}
	</Dialog.Content>
</Dialog.Root>
