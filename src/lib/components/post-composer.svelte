<script lang="ts">
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import {
		POST_IMAGE_ACCEPT,
		POST_IMAGE_MAX_FILES,
		POST_IMAGE_MAX_SIZE_LABEL,
		validatePostImageFile
	} from '$lib/post-images';
	import ImagePlusIcon from '@lucide/svelte/icons/image-plus';
	import UploadIcon from '@lucide/svelte/icons/upload';
	import XIcon from '@lucide/svelte/icons/x';
	import { cn } from '$lib/utils.js';

	let {
		id,
		name = 'body',
		placeholder,
		rows = 4,
		required = false,
		disabled = false,
		value = $bindable(''),
		files = $bindable<FileList | undefined>(),
		ref = $bindable<HTMLTextAreaElement | null>(null)
	}: {
		id: string;
		name?: string;
		placeholder: string;
		rows?: number;
		required?: boolean;
		disabled?: boolean;
		value?: string;
		files?: FileList;
		ref?: HTMLTextAreaElement | null;
	} = $props();

	let dragDepth = $state(0);
	let imageError = $state<string | null>(null);
	let previewUrl = $state<string | null>(null);
	const selectedFile = $derived(files?.[0] ?? null);
	const isDragging = $derived(dragDepth > 0);

	$effect(() => {
		if (!selectedFile) {
			previewUrl = null;
			return;
		}

		const url = URL.createObjectURL(selectedFile);
		previewUrl = url;
		return () => URL.revokeObjectURL(url);
	});

	function hasFiles(event: DragEvent) {
		return event.dataTransfer?.types.includes('Files') ?? false;
	}

	function setFiles(nextFiles: FileList | undefined) {
		const selected = Array.from(nextFiles ?? []);
		if (selected.length > POST_IMAGE_MAX_FILES) {
			imageError = `Only ${POST_IMAGE_MAX_FILES} image can be attached.`;
			return;
		}

		const file = selected[0];
		const error = file ? validatePostImageFile(file) : null;
		if (error) {
			imageError = error;
			files = undefined;
			return;
		}

		imageError = null;
		files = nextFiles;
	}

	function handleDragEnter(event: DragEvent) {
		if (!hasFiles(event) || disabled) return;
		event.preventDefault();
		dragDepth += 1;
	}

	function handleDragOver(event: DragEvent) {
		if (!hasFiles(event) || disabled) return;
		event.preventDefault();
		if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
	}

	function handleDragLeave(event: DragEvent) {
		if (!hasFiles(event) || disabled) return;
		event.preventDefault();
		dragDepth = Math.max(0, dragDepth - 1);
	}

	function handleDrop(event: DragEvent) {
		if (!hasFiles(event) || disabled) return;
		event.preventDefault();
		dragDepth = 0;
		setFiles(event.dataTransfer?.files);
	}

	function removeImage() {
		files = undefined;
		imageError = null;
	}
</script>

<div
	class={cn(
		'relative rounded-xl border-2 border-transparent transition-colors',
		isDragging && 'border-primary bg-primary/5'
	)}
	ondragenter={handleDragEnter}
	ondragover={handleDragOver}
	ondragleave={handleDragLeave}
	ondrop={handleDrop}
	role="group"
	aria-label="Post text and image attachment"
>
	<Textarea bind:ref {name} {placeholder} {rows} {required} {disabled} bind:value />

	<div class="mt-2 flex flex-wrap items-center gap-2">
		<label
			for="{id}-image"
			class="inline-flex h-7 cursor-pointer items-center gap-1 rounded-lg px-2.5 text-[0.8rem] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
			class:pointer-events-none={disabled}
			class:opacity-50={disabled}
		>
			<ImagePlusIcon class="h-3.5 w-3.5" />
			{selectedFile ? 'Replace image' : 'Add image'}
		</label>
		<input
			id="{id}-image"
			class="sr-only"
			type="file"
			name="image"
			accept={POST_IMAGE_ACCEPT}
			{disabled}
			bind:files
			onchange={(event) => setFiles(event.currentTarget.files ?? undefined)}
		/>
		<span class="text-xs text-muted-foreground">
			One image, up to {POST_IMAGE_MAX_SIZE_LABEL}. You can also drag it onto this box.
		</span>
	</div>

	{#if selectedFile && previewUrl}
		<div class="mt-3 flex items-start gap-3 rounded-lg border bg-muted/30 p-2">
			<img
				src={previewUrl}
				alt="Selected attachment preview"
				class="h-20 w-20 rounded-md object-cover"
			/>
			<div class="min-w-0 flex-1">
				<p class="truncate text-sm font-medium">{selectedFile.name}</p>
				<p class="text-xs text-muted-foreground">
					{Math.max(1, Math.round(selectedFile.size / 1024))} KB
				</p>
			</div>
			<button
				type="button"
				class="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
				onclick={removeImage}
				aria-label="Remove attached image"
			>
				<XIcon class="h-4 w-4" />
			</button>
		</div>
	{/if}

	{#if imageError}
		<p class="mt-2 text-sm text-destructive" role="alert">{imageError}</p>
	{/if}

	{#if isDragging}
		<div
			class="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-background/90 text-primary"
			aria-hidden="true"
		>
			<div class="flex flex-col items-center gap-2 font-medium">
				<UploadIcon class="h-7 w-7" />
				<span>Drop image to add it to this post</span>
			</div>
		</div>
	{/if}
</div>
