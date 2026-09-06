<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { toast } from 'svelte-sonner';
	import MarkdownHint from '$lib/components/markdown-hint.svelte';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import PlayIcon from '@lucide/svelte/icons/play';
	import { pageTitle } from '$shared/brand';
	import { formatDate } from '$lib/date-format';

	let { data } = $props();
	const timeZone = $derived(data.session.timezone ?? data.user?.timezone);
	let saving = $state(false);

	const paceLabels: Record<string, string> = {
		too_slow: 'Too slow',
		about_right: 'About right',
		too_fast: 'Too fast'
	};
	const averageRating = $derived.by(() => {
		const ratings = data.feedback
			.map((row) => row.feedback.overallRating)
			.filter((value): value is number => typeof value === 'number');
		return ratings.length ? (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1) : null;
	});

	function timeOnly(iso: string) {
		return new Intl.DateTimeFormat('en-US', {
			hour: 'numeric',
			minute: '2-digit',
			timeZone
		}).format(new Date(iso));
	}

	const saveEnhance: SubmitFunction = () => {
		saving = true;
		return async ({ result, update }) => {
			saving = false;
			await update({ reset: false });
			if (result.type === 'success') toast.success('Recap saved.');
			else if (result.type === 'failure' && result.data?.error)
				toast.error(String(result.data.error));
		};
	};
</script>

<svelte:head><title>{pageTitle(`Recap · ${data.session.title}`)}</title></svelte:head>

<div class="space-y-6">
	<div class="flex flex-wrap items-center gap-3">
		<Button
			variant="ghost"
			size="icon-sm"
			href={resolve('/sessions/[slug]', { slug: data.session.slug })}
		>
			<ArrowLeftIcon class="h-4 w-4" />
		</Button>
		<div class="min-w-0 flex-1">
			<h1 class="text-2xl font-bold">Recap</h1>
			<p class="text-sm text-muted-foreground">
				{data.session.title} · {formatDate(data.session.startsAt, { time: 'never', timeZone })}
			</p>
		</div>
		<Button variant="outline" href={resolve('/sessions/[slug]/run', { slug: data.session.slug })}>
			<PlayIcon class="h-4 w-4" /> Attendance and notes
		</Button>
	</div>

	<div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
		<form method="POST" action="?/save" use:enhance={saveEnhance} class="space-y-6">
			<Card.Root>
				<Card.Header>
					<Card.Title class="text-base">Facilitator notes</Card.Title>
					<Card.Description>
						Private to facilitators. What worked, what did not, follow-ups, and context for next
						time.
					</Card.Description>
				</Card.Header>
				<Card.Content>
					<Label for="facilitatorRecap" class="sr-only">Facilitator notes</Label>
					<Textarea
						id="facilitatorRecap"
						name="facilitatorRecap"
						rows={6}
						value={data.session.facilitatorRecap ?? ''}
					/>
				</Card.Content>
			</Card.Root>

			<Card.Root>
				<Card.Header>
					<Card.Title class="text-base">Member recap</Card.Title>
					<Card.Description>
						Shown on the session page to signed-in members once saved. Markdown supported. Attribute
						comments to people only when you mean to.
					</Card.Description>
				</Card.Header>
				<Card.Content>
					<Label for="memberRecap" class="sr-only">Member recap</Label>
					<Textarea
						id="memberRecap"
						name="memberRecap"
						rows={10}
						value={data.session.memberRecap ?? ''}
					/>
					<div class="mt-2"><MarkdownHint /></div>
				</Card.Content>
			</Card.Root>

			<Card.Root>
				<Card.Header>
					<Card.Title class="text-base">Public recap</Card.Title>
					<Card.Description>
						Optional. Safe for the public website; it goes out through the public sessions API only
						when filled in. Written separately from the member recap on purpose.
					</Card.Description>
				</Card.Header>
				<Card.Content>
					<Label for="publicRecap" class="sr-only">Public recap</Label>
					<Textarea
						id="publicRecap"
						name="publicRecap"
						rows={6}
						value={data.session.publicRecap ?? ''}
					/>
					<div class="mt-2"><MarkdownHint /></div>
				</Card.Content>
			</Card.Root>

			<div class="flex flex-wrap items-center justify-between gap-3">
				<label class="flex items-center gap-2 text-sm">
					<input
						type="checkbox"
						name="feedbackEnabled"
						class="rounded border-input"
						checked={data.session.feedbackEnabled}
					/>
					Let members send private feedback for this session
				</label>
				<Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save recap'}</Button>
			</div>
		</form>

		<aside class="space-y-4">
			<Card.Root>
				<Card.Header>
					<Card.Title class="text-base">Who came</Card.Title>
					<Card.Description>
						{data.present.length} present{data.absent.length
							? ` · ${data.absent.length} absent`
							: ''}
					</Card.Description>
				</Card.Header>
				<Card.Content class="text-sm">
					{#if data.present.length > 0}
						<p>{data.present.join(', ')}</p>
					{:else}
						<p class="text-muted-foreground">No attendance recorded yet.</p>
					{/if}
					{#if data.absent.length > 0}
						<p class="mt-2 text-muted-foreground">Absent: {data.absent.join(', ')}</p>
					{/if}
				</Card.Content>
			</Card.Root>

			<Card.Root>
				<Card.Header>
					<Card.Title class="text-base">Quick notes</Card.Title>
					<Card.Description>Source material from the meeting.</Card.Description>
				</Card.Header>
				<Card.Content class="text-sm">
					{#if data.notes.length > 0}
						<ul class="space-y-1.5">
							{#each data.notes as { note } (note.id)}
								<li class="flex gap-2">
									<span class="w-16 shrink-0 text-xs text-muted-foreground tabular-nums"
										>{timeOnly(note.createdAt)}</span
									>
									<span>{note.body}</span>
								</li>
							{/each}
						</ul>
					{:else}
						<p class="text-muted-foreground">No quick notes were taken.</p>
					{/if}
				</Card.Content>
			</Card.Root>

			{#if data.nextSession}
				<Card.Root>
					<Card.Header>
						<Card.Title class="text-base">Next session</Card.Title>
					</Card.Header>
					<Card.Content class="text-sm">
						<a
							href={resolve('/sessions/[slug]', { slug: data.nextSession.slug })}
							class="font-medium hover:underline"
						>
							{data.nextSession.title}
						</a>
						{#if data.nextSession.themeTitle}<p class="text-muted-foreground">
								Theme: {data.nextSession.themeTitle}
							</p>{/if}
						{#if data.session.nextThemeNote}<p class="text-muted-foreground">
								Handoff note: {data.session.nextThemeNote}
							</p>{/if}
					</Card.Content>
				</Card.Root>
			{:else if data.session.nextThemeNote}
				<Card.Root>
					<Card.Header>
						<Card.Title class="text-base">Next theme idea</Card.Title>
					</Card.Header>
					<Card.Content class="text-sm">{data.session.nextThemeNote}</Card.Content>
				</Card.Root>
			{/if}

			<Card.Root>
				<Card.Header>
					<div class="flex items-center justify-between gap-2">
						<Card.Title class="text-base">Member feedback</Card.Title>
						{#if averageRating}<Badge variant="secondary">{averageRating} / 5</Badge>{/if}
					</div>
					<Card.Description>Private to facilitators. Not anonymous.</Card.Description>
				</Card.Header>
				<Card.Content class="space-y-3 text-sm">
					{#if data.feedback.length === 0}
						<p class="text-muted-foreground">No feedback has been submitted for this session.</p>
					{:else}
						{#each data.feedback as row (row.feedback.id)}
							<div class="space-y-1 border-b pb-3 last:border-0 last:pb-0">
								<div class="flex flex-wrap items-center gap-2">
									<span class="font-medium">{row.member.displayName}</span>
									{#if row.feedback.overallRating}<Badge variant="outline"
											>{row.feedback.overallRating} / 5</Badge
										>{/if}
									{#if row.feedback.pace}<Badge variant="outline"
											>{paceLabels[row.feedback.pace]}</Badge
										>{/if}
								</div>
								{#if row.feedback.comments}<p>{row.feedback.comments}</p>{/if}
								{#if row.feedback.futureDiscussion}
									<p class="text-muted-foreground">Next time: {row.feedback.futureDiscussion}</p>
								{/if}
							</div>
						{/each}
					{/if}
				</Card.Content>
			</Card.Root>
		</aside>
	</div>
</div>
