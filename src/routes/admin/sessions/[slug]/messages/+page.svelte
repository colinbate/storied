<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { toast } from 'svelte-sonner';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import ConfirmButton from '$lib/components/confirm-button.svelte';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import SendIcon from '@lucide/svelte/icons/send';
	import RotateCcwIcon from '@lucide/svelte/icons/rotate-ccw';
	import UsersIcon from '@lucide/svelte/icons/users';
	import { pageTitle } from '$shared/brand';
	import { formatDate } from '$lib/date-format';
	import {
		formatSessionWhen,
		parseSessionMessageAudiences,
		SESSION_MESSAGE_AUDIENCE_LABELS,
		type SessionMessageAudience
	} from '$shared/session-messages';

	let { data, form } = $props();
	const timeZone = $derived(data.user?.timezone);

	let sending = $state(false);
	let subject = $state('');
	let body = $state('');
	let selected = $state<SessionMessageAudience[]>([]);
	let expandedAudience = $state<SessionMessageAudience | null>(null);
	let loadedTemplateKey = $state('');
	let composerForm = $state<HTMLFormElement | null>(null);

	const templateKey = $derived(
		`${data.session.id}:${data.template.kind}:${data.template.draft.subject}:${data.template.draft.body}`
	);

	$effect(() => {
		if (loadedTemplateKey === templateKey) return;
		loadedTemplateKey = templateKey;
		subject = data.template.draft.subject;
		body = data.template.draft.body;
		selected = [...data.template.audiences];
	});

	/** Deduplicated recipients for the current selection, in audience priority order. */
	const recipients = $derived.by(() => {
		const list: {
			attendeeId: string;
			name: string;
			email: string;
			audience: SessionMessageAudience;
		}[] = [];
		for (const audience of data.audiences) {
			if (!selected.includes(audience.key)) continue;
			for (const recipient of audience.recipients) {
				if (list.some((entry) => entry.attendeeId === recipient.attendeeId)) continue;
				list.push({
					attendeeId: recipient.attendeeId,
					name: recipient.name,
					email: recipient.email,
					audience: audience.key
				});
			}
		}
		return list;
	});

	const kindLabels: Record<string, string> = {
		custom: 'Message',
		update: 'Details update',
		cancellation: 'Cancellation'
	};

	function toggleAudience(audience: SessionMessageAudience, checked: boolean) {
		selected = checked
			? [...selected.filter((key) => key !== audience), audience]
			: selected.filter((key) => key !== audience);
	}

	const sendEnhance: SubmitFunction = () => {
		sending = true;
		return async ({ result, update }) => {
			sending = false;
			await update({ reset: false });
			if (result.type === 'success' && result.data?.sent) {
				const failed = Number(result.data.failedCount ?? 0);
				toast[failed > 0 ? 'warning' : 'success'](
					failed > 0
						? `Sent to ${result.data.sentCount} of ${result.data.recipientCount}. ${failed} failed; retry below.`
						: `Message sent to ${result.data.sentCount} ${result.data.sentCount === 1 ? 'person' : 'people'}.`
				);
				subject = '';
				body = '';
			} else if (result.type === 'failure' && result.data?.error) {
				toast.error(String(result.data.error));
			}
		};
	};

	const retryEnhance: SubmitFunction = () => {
		return async ({ result, update }) => {
			await update({ reset: false });
			if (result.type === 'success' && result.data?.retryComplete) {
				const stillFailed = Number(result.data.failedCount ?? 0);
				toast[stillFailed > 0 ? 'warning' : 'success'](
					stillFailed > 0
						? `${result.data.retried} delivered. ${stillFailed} still failing.`
						: 'All deliveries sent.'
				);
			} else if (result.type === 'failure' && result.data?.error) {
				toast.error(String(result.data.error));
			}
		};
	};
</script>

<svelte:head><title>{pageTitle(`${data.session.title} — Message Attendees`)}</title></svelte:head>

<div class="space-y-6">
	<div class="flex flex-wrap items-center gap-3">
		<Button
			variant="ghost"
			size="icon-sm"
			href={resolve('/admin/sessions/[slug]', { slug: data.session.slug })}
		>
			<ArrowLeftIcon class="h-4 w-4" />
		</Button>
		<div class="min-w-0 flex-1">
			<h1 class="text-2xl font-bold">Message Attendees</h1>
			<p class="text-sm text-muted-foreground">
				{data.session.title} · {formatSessionWhen(data.session)}
			</p>
		</div>
		<Button
			variant="outline"
			href={resolve('/admin/sessions/[slug]/attendees', { slug: data.session.slug })}
		>
			<UsersIcon class="h-4 w-4" /> Manage Attendees
		</Button>
	</div>

	{#if form?.error}
		<div class="rounded border border-destructive p-3 text-sm text-destructive">{form.error}</div>
	{/if}

	<div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
		<Card.Root>
			<Card.Header>
				<Card.Title class="text-base">
					{data.template.kind === 'cancellation'
						? 'Cancellation notice'
						: data.template.kind === 'update'
							? 'Details update'
							: 'New message'}
				</Card.Title>
				<Card.Description>
					Each recipient gets a personal email with your message, the session details, and a link to
					the session page. Markdown is supported.
				</Card.Description>
			</Card.Header>
			<Card.Content>
				<form
					method="POST"
					action="?/send"
					use:enhance={sendEnhance}
					class="space-y-5"
					bind:this={composerForm}
				>
					<input type="hidden" name="kind" value={data.template.kind} />

					<fieldset class="space-y-3">
						<legend class="text-sm font-medium">Send to</legend>
						{#each data.audiences as audience (audience.key)}
							{@const meta = SESSION_MESSAGE_AUDIENCE_LABELS[audience.key]}
							<div class="rounded-lg border px-3 py-2">
								<label class="flex items-start gap-3 text-sm">
									<input
										type="checkbox"
										name="audiences"
										value={audience.key}
										class="mt-1 rounded border-input"
										checked={selected.includes(audience.key)}
										disabled={audience.recipients.length === 0}
										onchange={(event) => toggleAudience(audience.key, event.currentTarget.checked)}
									/>
									<span class="min-w-0 flex-1">
										<span class="flex flex-wrap items-center gap-2">
											<span class="font-medium">{meta.label}</span>
											<Badge variant="secondary" class="px-1.5 py-0 text-xs">
												{audience.recipients.length}
											</Badge>
										</span>
										<span class="block text-muted-foreground">{meta.description}</span>
									</span>
									{#if audience.recipients.length > 0}
										<button
											type="button"
											class="shrink-0 text-xs text-muted-foreground hover:text-foreground"
											onclick={() =>
												(expandedAudience =
													expandedAudience === audience.key ? null : audience.key)}
										>
											{expandedAudience === audience.key ? 'Hide' : 'Who?'}
										</button>
									{/if}
								</label>
								{#if expandedAudience === audience.key}
									<ul
										class="mt-2 grid gap-1 border-t pt-2 text-xs text-muted-foreground sm:grid-cols-2"
									>
										{#each audience.recipients as recipient (recipient.attendeeId)}
											<li class="truncate">
												<span class="text-foreground">{recipient.name}</span>
												{#if !recipient.isMember}<span> (guest)</span>{/if}
												· {recipient.email}
											</li>
										{/each}
									</ul>
								{/if}
							</div>
						{/each}
					</fieldset>

					<div class="space-y-2">
						<Label for="subject">Subject</Label>
						<Input id="subject" name="subject" bind:value={subject} required maxlength={200} />
					</div>

					<div class="space-y-2">
						<Label for="body">Message</Label>
						<Textarea id="body" name="body" rows={10} bind:value={body} required />
						<p class="text-xs text-muted-foreground">
							Start with the news itself. The greeting, session details, and link are added
							automatically.
						</p>
					</div>

					<div class="flex flex-wrap items-center justify-between gap-3">
						<p class="text-sm text-muted-foreground">
							{recipients.length}
							{recipients.length === 1 ? 'recipient' : 'recipients'}
							{#if recipients.length > 0}
								· {recipients
									.slice(0, 3)
									.map((recipient) => recipient.name)
									.join(', ')}{recipients.length > 3 ? ` +${recipients.length - 3}` : ''}
							{/if}
						</p>
						<ConfirmButton
							confirmText={`Send this email to ${recipients.length} ${recipients.length === 1 ? 'person' : 'people'}?`}
							onconfirm={() => composerForm?.requestSubmit()}
							disabled={sending || recipients.length === 0 || !subject.trim() || !body.trim()}
						>
							<SendIcon class="h-4 w-4" />
							{sending ? 'Sending…' : 'Send Message'}
						</ConfirmButton>
					</div>
				</form>
			</Card.Content>
		</Card.Root>

		<Card.Root class="lg:sticky lg:top-24">
			<Card.Header>
				<Card.Title class="text-base">Preview</Card.Title>
				<Card.Description>How the plain-text version reads.</Card.Description>
			</Card.Header>
			<Card.Content>
				<div class="space-y-3 rounded-lg border bg-muted/40 p-3 text-sm">
					<p class="font-medium">{subject || 'Subject'}</p>
					<p>Hi {recipients[0]?.name ?? 'there'},</p>
					<p class="whitespace-pre-wrap">{body || 'Your message appears here.'}</p>
					<div class="rounded-md border bg-background p-3 text-xs">
						<p class="font-medium">{data.session.title}</p>
						<p>When: {formatSessionWhen(data.session)}</p>
						{#if data.session.locationName}<p>Location: {data.session.locationName}</p>{/if}
						<p class="text-primary">View session details</p>
					</div>
					<p class="text-xs text-muted-foreground">
						You are receiving this because {SESSION_MESSAGE_AUDIENCE_LABELS[
							recipients[0]?.audience ?? 'attending'
						].reason}.
					</p>
				</div>
			</Card.Content>
		</Card.Root>
	</div>

	<section class="space-y-3">
		<h2 class="text-base font-semibold">Sent messages ({data.messages.length})</h2>
		{#if data.messages.length === 0}
			<Card.Root>
				<Card.Content class="p-6 text-sm text-muted-foreground">
					No messages have been sent for this session.
				</Card.Content>
			</Card.Root>
		{:else}
			{#each data.messages as message (message.id)}
				{@const failed = message.deliveries.filter((delivery) => delivery.status !== 'sent')}
				<Card.Root>
					<Card.Header>
						<div class="flex flex-wrap items-start justify-between gap-3">
							<div class="min-w-0 space-y-1">
								<Card.Title class="text-base">{message.subject}</Card.Title>
								<Card.Description>
									{kindLabels[message.kind] ?? message.kind} · {parseSessionMessageAudiences(
										message.audiences
									)
										.map((audience) => SESSION_MESSAGE_AUDIENCE_LABELS[audience].label)
										.join(', ')} · {message.sender?.displayName ?? 'Unknown sender'} · {formatDate(
										message.createdAt,
										{ dateStyle: 'medium', time: 'always', timeZone }
									)}
								</Card.Description>
							</div>
							<div class="flex flex-wrap items-center gap-2">
								<Badge variant="secondary">{message.sentCount} sent</Badge>
								{#if message.failedCount > 0}
									<Badge variant="destructive">{message.failedCount} failed</Badge>
									<form method="POST" action="?/retry" use:enhance={retryEnhance}>
										<input type="hidden" name="messageId" value={message.id} />
										<Button type="submit" size="sm" variant="outline">
											<RotateCcwIcon class="h-3.5 w-3.5" /> Retry failed
										</Button>
									</form>
								{/if}
							</div>
						</div>
					</Card.Header>
					<Card.Content class="space-y-3">
						<p class="line-clamp-3 text-sm whitespace-pre-wrap text-muted-foreground">
							{message.bodySource}
						</p>
						{#if failed.length > 0}
							<ul class="space-y-1 text-xs">
								{#each failed as delivery (delivery.id)}
									<li>
										<span class="font-medium">{delivery.recipientName}</span>
										<span class="text-muted-foreground">
											· {delivery.recipientEmail} · {delivery.failureReason ?? 'Not sent'}
										</span>
									</li>
								{/each}
							</ul>
						{/if}
					</Card.Content>
				</Card.Root>
			{/each}
		{/if}
	</section>
</div>
