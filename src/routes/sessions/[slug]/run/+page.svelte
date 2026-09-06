<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { toast } from 'svelte-sonner';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { NativeSelect, NativeSelectOption } from '$lib/components/ui/native-select/index.js';
	import ConfirmButton from '$lib/components/confirm-button.svelte';
	import AgendaEditor from '$lib/components/agenda-editor.svelte';
	import SessionThemePicker from '$lib/components/admin/session-theme-picker.svelte';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import CheckIcon from '@lucide/svelte/icons/check';
	import CircleIcon from '@lucide/svelte/icons/circle';
	import PlayIcon from '@lucide/svelte/icons/play';
	import SquareIcon from '@lucide/svelte/icons/square';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import EyeOffIcon from '@lucide/svelte/icons/eye-off';
	import NotebookPenIcon from '@lucide/svelte/icons/notebook-pen';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import UserXIcon from '@lucide/svelte/icons/user-x';
	import RotateCcwIcon from '@lucide/svelte/icons/rotate-ccw';
	import SkipForwardIcon from '@lucide/svelte/icons/skip-forward';
	import { pageTitle } from '$shared/brand';
	import { formatDate } from '$lib/date-format';

	let { data, form } = $props();
	const timeZone = $derived(data.session.timezone ?? data.user?.timezone);
	const live = $derived(data.phase === 'run');
	const ended = $derived(Boolean(data.session.liveEndedAt));

	/** Optimistic overlays; cleared when the server state arrives. */
	let attendanceOverride = $state<Record<string, 'present' | 'absent' | null>>({});
	let agendaOverride = $state<Record<string, 'ready' | 'completed' | 'skipped'>>({});
	let addOpen = $state(false);
	let editAgendaOpen = $state(false);
	let noteBody = $state('');
	let addingNote = $state(false);
	let nextThemeId = $state('');
	let loadedNextThemeFor = $state('');

	// Track the next session's saved theme until the facilitator picks or creates another.
	$effect(() => {
		const key = `${data.nextSession?.id ?? ''}:${data.nextSession?.themeId ?? ''}`;
		if (loadedNextThemeFor === key) return;
		loadedNextThemeFor = key;
		nextThemeId = data.nextSession?.themeId ?? '';
	});

	const roster = $derived(
		data.roster.map((row) => ({
			...row,
			attendance:
				row.attendeeId in attendanceOverride ? attendanceOverride[row.attendeeId] : row.attendance
		}))
	);
	const groups = $derived(
		[
			{ title: 'Expected', rows: roster.filter((row) => row.rsvp === 'attending') },
			{ title: 'Maybe', rows: roster.filter((row) => row.rsvp === 'maybe') },
			{ title: 'Waitlist', rows: roster.filter((row) => row.rsvp === 'waitlisted') },
			{ title: 'Added during the meeting', rows: roster.filter((row) => row.rsvp === null) }
		].filter((group) => group.rows.length > 0)
	);
	const presentCount = $derived(roster.filter((row) => row.attendance === 'present').length);
	const unrecordedExpected = $derived(
		roster.filter((row) => row.rsvp === 'attending' && !row.attendance).length
	);

	const agenda = $derived(
		data.agenda
			.filter((item) => item.status !== 'pending')
			.map((item) => ({ ...item, status: agendaOverride[item.id] ?? item.status }))
	);
	const pendingSuggestions = $derived(
		data.agenda.filter((item) => item.status === 'pending').length
	);
	const agendaDone = $derived(agenda.filter((item) => item.status !== 'ready').length);

	function timeOnly(iso: string) {
		return new Intl.DateTimeFormat('en-US', {
			hour: 'numeric',
			minute: '2-digit',
			timeZone
		}).format(new Date(iso));
	}

	const attendanceEnhance: (
		attendeeId: string,
		next: 'present' | 'absent' | null
	) => SubmitFunction = (attendeeId, next) => () => {
		attendanceOverride = { ...attendanceOverride, [attendeeId]: next };
		return async ({ result, update }) => {
			await update({ reset: false });
			const rest = { ...attendanceOverride };
			delete rest[attendeeId];
			attendanceOverride = rest;
			if (result.type === 'failure' && result.data?.error) toast.error(String(result.data.error));
		};
	};

	const agendaEnhance: (
		itemId: string,
		next: 'ready' | 'completed' | 'skipped'
	) => SubmitFunction = (itemId, next) => () => {
		agendaOverride = { ...agendaOverride, [itemId]: next };
		return async ({ result, update }) => {
			await update({ reset: false });
			const rest = { ...agendaOverride };
			delete rest[itemId];
			agendaOverride = rest;
			if (result.type === 'failure' && result.data?.error) toast.error(String(result.data.error));
		};
	};

	const feedback: (message?: string) => SubmitFunction = (message) => () => {
		return async ({ result, update }) => {
			await update({ reset: result.type === 'success' });
			if (result.type === 'success') {
				if (message) toast.success(message);
				addOpen = false;
			} else if (result.type === 'failure' && result.data?.error) {
				toast.error(String(result.data.error));
			}
		};
	};

	const noteEnhance: SubmitFunction = () => {
		addingNote = true;
		return async ({ result, update }) => {
			addingNote = false;
			await update({ reset: false });
			if (result.type === 'success') noteBody = '';
			else if (result.type === 'failure' && result.data?.error)
				toast.error(String(result.data.error));
		};
	};

	const endEnhance: SubmitFunction = () => {
		return async ({ result, update }) => {
			await update({ reset: false });
			if (result.type === 'success') {
				const marked = Number(result.data?.markedAbsent ?? 0);
				toast.success(marked > 0 ? `Session ended. ${marked} marked absent.` : 'Session ended.');
			}
		};
	};
</script>

<svelte:head><title>{pageTitle(`Run · ${data.session.title}`)}</title></svelte:head>

<div class="mx-auto w-full max-w-2xl space-y-8 pb-24">
	<!-- Header: always visible context -->
	<header class="space-y-3">
		<a
			href={resolve('/sessions/[slug]', { slug: data.session.slug })}
			class="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
		>
			<ArrowLeftIcon class="h-4 w-4" />
			Session page
		</a>
		<div class="flex flex-wrap items-start justify-between gap-3">
			<div class="min-w-0">
				<h1 class="text-2xl font-bold tracking-tight">{data.session.title}</h1>
				<p class="text-sm text-muted-foreground">
					{formatDate(data.session.startsAt, {
						time: 'always',
						timeZone,
						dateStyle: 'medium'
					})}{data.session.locationName ? ` · ${data.session.locationName}` : ''}
				</p>
				{#if data.session.themeTitle ?? data.session.theme}
					<p class="text-sm text-muted-foreground">
						Theme: {data.session.themeTitle ?? data.session.theme}
					</p>
				{/if}
			</div>
			<Badge variant={live ? 'default' : 'secondary'} class="mt-1">
				{live ? 'Live' : ended ? 'Ended' : data.phase === 'recap' ? 'Ready for recap' : 'Preparing'}
			</Badge>
		</div>
		{#if !live}
			<form
				method="POST"
				action="?/startLive"
				use:enhance={feedback(ended ? 'Session resumed.' : 'Session started.')}
			>
				<Button type="submit" size="lg" class="h-12 w-full text-base sm:w-auto">
					<PlayIcon class="h-5 w-5" />
					{ended ? 'Resume session' : 'Start session'}
				</Button>
			</form>
		{:else if data.session.liveStartedAt}
			<p class="text-sm text-muted-foreground">Started {timeOnly(data.session.liveStartedAt)}</p>
		{/if}
		{#if form?.error}<p class="text-sm text-destructive">{form.error}</p>{/if}
	</header>

	<!-- Attendance -->
	<section class="space-y-3" aria-labelledby="attendance-heading">
		<div class="flex items-baseline justify-between">
			<h2
				id="attendance-heading"
				class="text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase"
			>
				Attendance
			</h2>
			<span class="text-sm text-muted-foreground">{presentCount} present</span>
		</div>
		{#if roster.length === 0}
			<p class="text-sm text-muted-foreground">No RSVPs yet. Add people as they arrive.</p>
		{/if}
		{#each groups as group (group.title)}
			<div class="space-y-1">
				<p class="px-1 text-xs text-muted-foreground">{group.title}</p>
				<ul class="space-y-1">
					{#each group.rows as row (row.attendeeId)}
						<li class="flex items-stretch gap-1">
							<form
								method="POST"
								action="?/attendance"
								use:enhance={attendanceEnhance(
									row.attendeeId,
									row.attendance === 'present' ? null : 'present'
								)}
								class="min-w-0 flex-1"
							>
								<input type="hidden" name="attendeeId" value={row.attendeeId} />
								<input
									type="hidden"
									name="outcome"
									value={row.attendance === 'present' ? 'clear' : 'present'}
								/>
								<button
									type="submit"
									class={[
										'flex h-12 w-full items-center gap-3 rounded-lg border px-3 text-left transition-colors',
										row.attendance === 'present' && 'border-primary bg-primary/10',
										row.attendance === 'absent' && 'border-dashed text-muted-foreground',
										!row.attendance && 'hover:bg-muted'
									]}
									aria-pressed={row.attendance === 'present'}
									aria-label={`${row.name}: ${row.attendance === 'present' ? 'present' : row.attendance === 'absent' ? 'absent' : 'not recorded'}`}
								>
									{#if row.attendance === 'present'}
										<CheckIcon class="h-5 w-5 shrink-0 text-primary" />
									{:else if row.attendance === 'absent'}
										<UserXIcon class="h-5 w-5 shrink-0" />
									{:else}
										<CircleIcon class="h-5 w-5 shrink-0 text-muted-foreground" />
									{/if}
									<span
										class={[
											'min-w-0 flex-1 truncate font-medium',
											row.attendance === 'absent' && 'line-through'
										]}
									>
										{row.name}
									</span>
									{#if !row.isMember}<span class="text-xs text-muted-foreground">guest</span>{/if}
								</button>
							</form>
							{#if row.attendance !== 'absent'}
								<form
									method="POST"
									action="?/attendance"
									use:enhance={attendanceEnhance(row.attendeeId, 'absent')}
								>
									<input type="hidden" name="attendeeId" value={row.attendeeId} />
									<input type="hidden" name="outcome" value="absent" />
									<Button
										type="submit"
										variant="ghost"
										class="h-12 w-12 text-muted-foreground"
										aria-label={`Mark ${row.name} absent`}
									>
										<UserXIcon class="h-4 w-4" />
									</Button>
								</form>
							{/if}
						</li>
					{/each}
				</ul>
			</div>
		{/each}

		{#if addOpen}
			<form
				method="POST"
				action="?/addAttendee"
				use:enhance={feedback('Marked present.')}
				class="space-y-3 rounded-lg border p-3"
			>
				<div class="space-y-1">
					<Label for="add-identity">Someone already known</Label>
					<NativeSelect id="add-identity" name="identity" class="w-full">
						<NativeSelectOption value="">Choose a person</NativeSelectOption>
						{#each data.addable as person (person.id)}
							<NativeSelectOption value={`attendee:${person.id}`}>
								{person.name}{person.userId ? '' : ' (guest)'}
							</NativeSelectOption>
						{/each}
					</NativeSelect>
				</div>
				<div class="space-y-1">
					<Label for="add-guest">Or a new guest</Label>
					<Input id="add-guest" name="guestName" placeholder="Name" autocomplete="off" />
				</div>
				<div class="flex justify-end gap-2">
					<Button type="button" variant="ghost" onclick={() => (addOpen = false)}>Cancel</Button>
					<Button type="submit">Mark present</Button>
				</div>
			</form>
		{:else}
			<Button variant="outline" class="h-11 w-full sm:w-auto" onclick={() => (addOpen = true)}>
				<PlusIcon class="h-4 w-4" /> Add attendee
			</Button>
		{/if}
	</section>

	<!-- Agenda -->
	<section class="space-y-3" aria-labelledby="agenda-heading">
		<div class="flex items-baseline justify-between">
			<h2
				id="agenda-heading"
				class="text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase"
			>
				Agenda
			</h2>
			<span class="text-sm text-muted-foreground">{agendaDone} of {agenda.length}</span>
		</div>
		{#if agenda.length === 0 && !editAgendaOpen}
			<p class="text-sm text-muted-foreground">No agenda has been added for this session.</p>
		{/if}
		<ul class="space-y-1">
			{#each agenda as item (item.id)}
				<li class="flex items-stretch gap-1">
					<form
						method="POST"
						action="?/agendaStatus"
						use:enhance={agendaEnhance(item.id, item.status === 'ready' ? 'completed' : 'ready')}
						class="min-w-0 flex-1"
					>
						<input type="hidden" name="itemId" value={item.id} />
						<input
							type="hidden"
							name="status"
							value={item.status === 'ready' ? 'completed' : 'ready'}
						/>
						<button
							type="submit"
							class={[
								'flex min-h-12 w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors',
								item.status === 'completed' && 'border-primary bg-primary/10',
								item.status === 'skipped' && 'border-dashed text-muted-foreground',
								item.status === 'ready' && 'hover:bg-muted'
							]}
							aria-pressed={item.status === 'completed'}
							aria-label={`${item.title}: ${item.status}`}
						>
							{#if item.status === 'completed'}
								<CheckIcon class="h-5 w-5 shrink-0 text-primary" />
							{:else if item.status === 'skipped'}
								<SkipForwardIcon class="h-5 w-5 shrink-0" />
							{:else}
								<CircleIcon class="h-5 w-5 shrink-0 text-muted-foreground" />
							{/if}
							<span class="min-w-0 flex-1">
								<span
									class={[
										'block font-medium',
										item.status !== 'ready' && 'line-through decoration-muted-foreground/60'
									]}
								>
									{item.title}
								</span>
								{#if item.description}
									<span class="block text-sm text-muted-foreground">{item.description}</span>
								{/if}
								{#if item.visibility === 'facilitator'}
									<span class="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground">
										<EyeOffIcon class="h-3 w-3" /> Facilitator only
									</span>
								{/if}
							</span>
						</button>
					</form>
					{#if item.status === 'ready'}
						<form
							method="POST"
							action="?/agendaStatus"
							use:enhance={agendaEnhance(item.id, 'skipped')}
						>
							<input type="hidden" name="itemId" value={item.id} />
							<input type="hidden" name="status" value="skipped" />
							<Button
								type="submit"
								variant="ghost"
								class="h-12 w-12 text-muted-foreground"
								aria-label={`Skip ${item.title}`}
							>
								<SkipForwardIcon class="h-4 w-4" />
							</Button>
						</form>
					{:else}
						<form
							method="POST"
							action="?/agendaStatus"
							use:enhance={agendaEnhance(item.id, 'ready')}
						>
							<input type="hidden" name="itemId" value={item.id} />
							<input type="hidden" name="status" value="ready" />
							<Button
								type="submit"
								variant="ghost"
								class="h-12 w-12 text-muted-foreground"
								aria-label={`Reopen ${item.title}`}
							>
								<RotateCcwIcon class="h-4 w-4" />
							</Button>
						</form>
					{/if}
				</li>
			{/each}
		</ul>
		<div class="flex flex-wrap items-center gap-2">
			<Button variant="outline" size="sm" onclick={() => (editAgendaOpen = !editAgendaOpen)}>
				{editAgendaOpen ? 'Done editing' : 'Edit agenda'}
			</Button>
			{#if pendingSuggestions > 0}
				<Badge variant="secondary"
					>{pendingSuggestions} suggestion{pendingSuggestions === 1 ? '' : 's'} to review</Badge
				>
			{/if}
		</div>
		{#if editAgendaOpen}
			<Card.Root>
				<Card.Content class="pt-4">
					<AgendaEditor items={data.agenda} />
				</Card.Content>
			</Card.Root>
		{/if}
	</section>

	<!-- Quick notes -->
	<section class="space-y-3" aria-labelledby="notes-heading">
		<h2
			id="notes-heading"
			class="text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase"
		>
			Quick notes
		</h2>
		<form method="POST" action="?/addNote" use:enhance={noteEnhance} class="flex gap-2">
			<Input
				name="body"
				bind:value={noteBody}
				placeholder="Alice recommended Ancillary Justice"
				class="h-12 flex-1"
				autocomplete="off"
				required
			/>
			<Button type="submit" class="h-12" disabled={addingNote || !noteBody.trim()}>Add</Button>
		</form>
		{#if data.notes.length > 0}
			<ul class="space-y-1 text-sm">
				{#each data.notes as { note } (note.id)}
					<li class="flex items-start gap-3 rounded-md px-1 py-1">
						<span class="w-16 shrink-0 pt-0.5 text-xs text-muted-foreground tabular-nums"
							>{timeOnly(note.createdAt)}</span
						>
						<span class="min-w-0 flex-1">{note.body}</span>
						<ConfirmButton
							confirmText="Delete this note?"
							formAction="?/deleteNote"
							formData={{ noteId: note.id }}
							enhance={feedback()}
							variant="ghost"
							size="icon-sm"
							class="text-muted-foreground"
							title="Delete note"
						>
							<Trash2Icon class="h-3.5 w-3.5" />
						</ConfirmButton>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<!-- Next session handoff -->
	<section class="space-y-3" aria-labelledby="next-heading">
		<h2
			id="next-heading"
			class="text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase"
		>
			Next session
		</h2>
		<form
			method="POST"
			action="?/nextTheme"
			use:enhance={feedback('Handoff saved.')}
			class="space-y-3 rounded-lg border p-3"
		>
			{#if data.nextSession}
				<input type="hidden" name="nextSessionId" value={data.nextSession.id} />
				<div class="flex flex-wrap items-baseline justify-between gap-2">
					<div>
						<a
							href={resolve('/sessions/[slug]', { slug: data.nextSession.slug })}
							class="font-medium hover:underline"
						>
							{data.nextSession.title}
						</a>
						<p class="text-sm text-muted-foreground">
							{data.nextSession.startsAt
								? formatDate(data.nextSession.startsAt, {
										time: 'always',
										timeZone: data.nextSession.timezone ?? timeZone,
										dateStyle: 'medium'
									})
								: 'Date to be set'}
							{#if data.nextSession.status === 'draft'}
								· draft{/if}
						</p>
					</div>
					{#if data.permissions.has('sessions:edit')}
						<a
							href={resolve('/admin/sessions/[slug]', { slug: data.nextSession.slug })}
							class="text-sm text-primary hover:underline">Edit session</a
						>
					{/if}
				</div>
				{#if data.permissions.has('sessions:edit')}
					<SessionThemePicker
						id="next-theme"
						themes={data.themes}
						bind:selectedId={nextThemeId}
						label="Theme"
						required={false}
					/>
				{:else if data.nextSession.themeTitle}
					<p class="text-sm">Theme: {data.nextSession.themeTitle}</p>
				{/if}
			{:else}
				<p class="text-sm text-muted-foreground">No next session has been scheduled.</p>
			{/if}
			<div class="space-y-1">
				<Label for="next-note"
					>{data.nextSession ? 'Notes for the handoff' : 'Next theme idea'}</Label
				>
				<Input
					id="next-note"
					name="nextThemeNote"
					value={data.session.nextThemeNote ?? ''}
					placeholder="Afrofuturism"
					class="h-11"
				/>
			</div>
			<div class="flex flex-wrap justify-end gap-2">
				{#if !data.nextSession && data.permissions.has('sessions:edit')}
					<Button variant="outline" href={resolve('/admin/sessions')}>Create next session</Button>
				{/if}
				<Button type="submit">Save</Button>
			</div>
		</form>
	</section>

	<!-- End -->
	<section class="space-y-3 border-t pt-6">
		{#if live}
			<form method="POST" action="?/endLive" use:enhance={endEnhance} class="space-y-3">
				{#if unrecordedExpected > 0}
					<label class="flex items-start gap-2 text-sm">
						<input type="checkbox" name="markRemainingAbsent" class="mt-1 rounded border-input" />
						<span>
							Mark the {unrecordedExpected} expected {unrecordedExpected === 1
								? 'person'
								: 'people'} still unrecorded as absent.
						</span>
					</label>
				{/if}
				<Button
					type="submit"
					variant="destructive"
					size="lg"
					class="h-12 w-full text-base sm:w-auto"
				>
					<SquareIcon class="h-4 w-4" /> End session
				</Button>
			</form>
		{:else if ended}
			<div class="flex flex-wrap items-center gap-3">
				<p class="text-sm text-muted-foreground">
					Ended {data.session.liveEndedAt ? timeOnly(data.session.liveEndedAt) : ''}. Attendance and
					notes can still be corrected here.
				</p>
				<Button href={resolve('/sessions/[slug]/recap', { slug: data.session.slug })}>
					<NotebookPenIcon class="h-4 w-4" /> Write the recap
				</Button>
			</div>
		{/if}
	</section>
</div>
