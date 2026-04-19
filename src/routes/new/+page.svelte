<script lang="ts">
	import { enhance } from '$app/forms';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import { resolve } from '$app/paths';
	import { NativeSelectOption, NativeSelect } from '$lib/components/ui/native-select/index.js';

	let { data, form } = $props();
	let loading = $state(false);
</script>

<svelte:head>
	<title>New Thread — Storied</title>
</svelte:head>

<div class="mx-auto w-full max-w-3xl space-y-6">
	<div>
		<a
			href={resolve('/')}
			class="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
		>
			<ArrowLeftIcon class="h-4 w-4" />
			Back to Discussions
		</a>
		<h1 class="text-2xl font-bold">Start a New Thread</h1>
	</div>

	<Card.Root>
		<Card.Content class="pt-6">
			<form
				method="POST"
				use:enhance={() => {
					loading = true;
					return async ({ update }) => {
						loading = false;
						await update();
					};
				}}
				class="space-y-4"
			>
				<div class="space-y-2">
					<Label for="categoryId">Category</Label>
					<NativeSelect id="categoryId" name="categoryId" required>
						<NativeSelectOption value="">Select a category…</NativeSelectOption>
						{#each data.categories as category (category.id)}
							<NativeSelectOption
								value={category.id}
								selected={form?.categoryId === category.id ||
									data.preselectedCategory === category.slug}
							>
								{category.name}
							</NativeSelectOption>
						{/each}
					</NativeSelect>
				</div>

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
					/>
				</div>

				<div class="space-y-2">
					<Label for="body">Body</Label>
					<Textarea
						id="body"
						name="body"
						placeholder="Write your post… (Markdown supported)"
						rows={8}
						required
						value={form?.body ?? ''}
					/>
					<p class="text-xs text-muted-foreground">
						Supports Markdown: **bold**, *italic*, [links](url), lists, and more.
					</p>
				</div>

				{#if form?.error}
					<p class="text-sm text-destructive">{form.error}</p>
				{/if}

				<div class="flex justify-end gap-3">
					<Button variant="outline" href="/">Cancel</Button>
					<Button type="submit" disabled={loading}>
						{loading ? 'Creating…' : 'Create Thread'}
					</Button>
				</div>
			</form>
		</Card.Content>
	</Card.Root>
</div>
