<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { toast } from 'svelte-sonner';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import SessionNav from '$lib/components/session-nav.svelte';
	import { pageTitle } from '$shared/brand';
	import { formatDate } from '$lib/date-format';

	let { data, form } = $props();
	const timeZone = $derived(data.user?.timezone);
	let saving = $state(false);
	let saved = $state(false);
	let rating = $state<number | null>(null);
	let pace = $state<string | null>(null);
	let loadedFor = $state('');

	$effect(() => {
		if (loadedFor === data.session.slug) return;
		loadedFor = data.session.slug;
		rating = data.feedback?.overallRating ?? null;
		pace = data.feedback?.pace ?? null;
	});

	const paces = [
		{ value: 'too_slow', label: 'Too slow' },
		{ value: 'about_right', label: 'About right' },
		{ value: 'too_fast', label: 'Too fast' }
	];

	const submit: SubmitFunction = () => {
		saving = true;
		return async ({ result, update }) => {
			saving = false;
			await update({ reset: false });
			if (result.type === 'success') {
				saved = true;
				toast.success('Thanks. Your feedback is saved.');
			} else if (result.type === 'failure' && result.data?.error) {
				toast.error(String(result.data.error));
			}
		};
	};
</script>

<svelte:head><title>{pageTitle(`Feedback · ${data.session.title}`)}</title></svelte:head>

<div class="mx-auto w-full max-w-2xl space-y-6">
	<SessionNav />
	<a
		href={resolve('/sessions/[slug]', { slug: data.session.slug })}
		class="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
	>
		<ArrowLeftIcon class="h-4 w-4" />
		Back to {data.session.title}
	</a>

	<div>
		<h1 class="text-2xl font-bold">How was this session?</h1>
		<p class="text-sm text-muted-foreground">
			{data.session.title}{data.session.startsAt
				? ` · ${formatDate(data.session.startsAt, { time: 'never', timeZone: data.session.timezone ?? timeZone })}`
				: ''}. Your answers go to the host only and are attached to your name. Every question is
			optional.
		</p>
	</div>

	{#if !data.open}
		<Card.Root>
			<Card.Content class="p-6 text-sm text-muted-foreground">
				Feedback is not open for this session.
			</Card.Content>
		</Card.Root>
	{:else}
		<Card.Root>
			<Card.Content>
				<form method="POST" action="?/submit" use:enhance={submit} class="space-y-6">
					<fieldset class="space-y-2">
						<legend class="text-sm font-medium">Overall</legend>
						<div class="flex gap-2">
							{#each [1, 2, 3, 4, 5] as value (value)}
								<label
									class={[
										'flex h-12 flex-1 cursor-pointer items-center justify-center rounded-lg border text-lg font-semibold transition-colors',
										rating === value
											? 'border-primary bg-primary text-primary-foreground'
											: 'hover:bg-muted'
									]}
								>
									<input
										type="radio"
										name="overallRating"
										{value}
										class="sr-only"
										checked={rating === value}
										onchange={() => (rating = value)}
									/>
									{value}
								</label>
							{/each}
						</div>
						<p class="flex justify-between text-xs text-muted-foreground">
							<span>Not for me</span><span>Loved it</span>
						</p>
					</fieldset>

					<fieldset class="space-y-2">
						<legend class="text-sm font-medium">How did the pace feel?</legend>
						<div class="grid gap-2 sm:grid-cols-3">
							{#each paces as option (option.value)}
								<label
									class={[
										'flex h-11 cursor-pointer items-center justify-center rounded-lg border text-sm font-medium transition-colors',
										pace === option.value
											? 'border-primary bg-primary text-primary-foreground'
											: 'hover:bg-muted'
									]}
								>
									<input
										type="radio"
										name="pace"
										value={option.value}
										class="sr-only"
										checked={pace === option.value}
										onchange={() => (pace = option.value)}
									/>
									{option.label}
								</label>
							{/each}
						</div>
					</fieldset>

					<div class="space-y-1">
						<Label for="comments">Anything you would like us to change?</Label>
						<Textarea
							id="comments"
							name="comments"
							rows={3}
							value={data.feedback?.comments ?? ''}
						/>
					</div>
					<div class="space-y-1">
						<Label for="futureDiscussion">Anything you would like discussed next time?</Label>
						<Textarea
							id="futureDiscussion"
							name="futureDiscussion"
							rows={3}
							value={data.feedback?.futureDiscussion ?? ''}
						/>
					</div>

					{#if form?.error}<p class="text-sm text-destructive">{form.error}</p>{/if}

					<div class="flex flex-wrap items-center justify-between gap-3">
						<p class="text-xs text-muted-foreground">
							{#if data.feedback}
								Last saved {formatDate(data.feedback.updatedAt, { time: 'always', timeZone })}. You
								can update it any time.
							{:else if saved}
								Saved.
							{/if}
						</p>
						<Button type="submit" disabled={saving}>
							{saving ? 'Saving…' : data.feedback ? 'Update feedback' : 'Send feedback'}
						</Button>
					</div>
				</form>
			</Card.Content>
		</Card.Root>
	{/if}
</div>
