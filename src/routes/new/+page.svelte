<script lang="ts">
	import { pageTitle } from '$shared/brand';
	import { enhance } from '$app/forms';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import PostComposer from '$lib/components/post-composer.svelte';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import { resolve } from '$app/paths';
	import { NativeSelectOption, NativeSelect } from '$lib/components/ui/native-select/index.js';
	import DiscussionNav from '$lib/components/discussion-nav.svelte';
	import SessionNav from '$lib/components/session-nav.svelte';
	import CalendarIcon from '@lucide/svelte/icons/calendar';

	let { data, form } = $props();
	let loading = $state(false);
	let imageFiles = $state<FileList | undefined>();
	let categoryId = $derived(
		form?.categoryId ??
			data.categories.find((category) => category.slug === data.preselectedCategory)?.id ??
			''
	);
	let audienceGroupId = $derived(
		form && 'audienceGroupId' in form ? String(form.audienceGroupId ?? '') : ''
	);

	const showAnnouncementBroadcast = $derived(categoryId === data.announcementCategoryId);
	const backHref = $derived(
		data.linkedSession
			? resolve('/sessions/[slug]', { slug: data.linkedSession.slug })
			: resolve('/discussions')
	);
</script>

<svelte:head>
	<title>{pageTitle('New Thread')}</title>
</svelte:head>

<div class="mx-auto w-full max-w-3xl space-y-6">
	{#if data.linkedSession}
		<SessionNav />
	{:else}
		<DiscussionNav categories={data.discussionCategories} />
	{/if}

	<div>
		<a
			href={data.linkedSession
				? resolve('/sessions/[slug]', { slug: data.linkedSession.slug })
				: resolve('/discussions')}
			class="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
		>
			<ArrowLeftIcon class="h-4 w-4" />
			Back to {data.linkedSession ? data.linkedSession.title : 'Discussions'}
		</a>
		<h1 class="text-2xl font-bold">Start a New Thread</h1>
	</div>

	{#if data.linkedSession}
		<Card.Root class="border-primary/30 bg-primary/10">
			<Card.Content class="flex items-start gap-3 text-sm">
				<CalendarIcon class="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
				<p>
					This thread will be linked to <span class="font-medium">{data.linkedSession.title}</span>
					as a related conversation and listed on the session page.
				</p>
			</Card.Content>
		</Card.Root>
	{/if}

	<Card.Root>
		<Card.Content>
			<form
				method="POST"
				enctype="multipart/form-data"
				use:enhance={() => {
					loading = true;
					return async ({ update }) => {
						loading = false;
						await update();
					};
				}}
				class="space-y-4"
			>
				{#if data.linkedSession}
					<input type="hidden" name="sessionId" value={data.linkedSession.id} />
				{/if}
				<div class="space-y-2">
					<Label for="categoryId">Category</Label>
					<NativeSelect id="categoryId" name="categoryId" bind:value={categoryId} required>
						<NativeSelectOption value="">Select a category…</NativeSelectOption>
						{#each data.categories as category (category.id)}
							<NativeSelectOption value={category.id} selected={categoryId === category.id}>
								{category.name}
							</NativeSelectOption>
						{/each}
					</NativeSelect>
				</div>

				{#if data.audienceGroups.length > 0}
					<div class="space-y-2">
						<Label for="audienceGroupId">Audience</Label>
						<NativeSelect id="audienceGroupId" name="audienceGroupId" bind:value={audienceGroupId}>
							<NativeSelectOption value="">All members</NativeSelectOption>
							{#each data.audienceGroups as group (group.id)}
								<NativeSelectOption value={group.id} selected={audienceGroupId === group.id}
									>{group.name}</NativeSelectOption
								>
							{/each}
						</NativeSelect>
						<p class="text-xs text-muted-foreground">
							Group threads are visible only to that group's members and site moderators.
						</p>
					</div>
				{/if}

				<div class="space-y-2">
					<Label for="title">Title</Label>
					<Input
						id="title"
						name="title"
						placeholder="What do you want to discuss?"
						required
						minlength={3}
						maxlength={200}
						value={form?.title ?? ''}
						autofocus
					/>
				</div>

				<div class="space-y-2">
					<Label for="body">Body</Label>
					<PostComposer
						id="new-thread-body"
						placeholder="Write your post… (Markdown supported)"
						rows={8}
						required
						value={form?.body ?? ''}
						bind:files={imageFiles}
					/>
					<p class="text-xs text-muted-foreground">
						Hardcover and Goodreads book, series, and author URLs are linked to the thread after
						posting.
					</p>
					<label class="flex items-center gap-2 text-sm text-muted-foreground">
						<input
							type="checkbox"
							name="containsSpoilers"
							class="rounded border-input"
							checked={form?.containsSpoilers ?? false}
						/>
						This entire post contains spoilers
					</label>
				</div>

				{#if showAnnouncementBroadcast}
					<label class="flex items-start gap-3 rounded-md border p-3 text-sm">
						<input
							type="checkbox"
							name="notifyAllMembersByEmail"
							class="mt-0.5 rounded border-input"
						/>
						<span>
							<span class="block font-medium">Notify all active members by email</span>
							<span class="block text-muted-foreground">
								This sends the announcement immediately even if someone is not subscribed to the
								category.
							</span>
						</span>
					</label>
				{/if}

				{#if form?.error}
					<p class="text-sm text-destructive">{form.error}</p>
				{/if}

				<div class="flex justify-end gap-3">
					<Button variant="outline" href={backHref}>Cancel</Button>
					<Button type="submit" disabled={loading}>
						{loading ? 'Creating…' : 'Create Thread'}
					</Button>
				</div>
			</form>
		</Card.Content>
	</Card.Root>
</div>
