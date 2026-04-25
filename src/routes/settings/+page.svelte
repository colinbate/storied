<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import * as Avatar from '$lib/components/ui/avatar/index.js';
	import BookPicker from '$lib/components/admin/book-picker.svelte';
	import ProfileGenrePicker from '$lib/components/profile-genre-picker.svelte';
	import SeriesPicker from '$lib/components/admin/series-picker.svelte';
	import ConfirmButton from '$lib/components/confirm-button.svelte';
	import UploadIcon from '@lucide/svelte/icons/upload';
	import EyeIcon from '@lucide/svelte/icons/eye';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import StarIcon from '@lucide/svelte/icons/star';
	import XIcon from '@lucide/svelte/icons/x';
	import { toast } from 'svelte-sonner';
	import { NativeSelect, NativeSelectOption } from '$lib/components/ui/native-select/index.js';
	import { formatDate } from '$lib/date-format';
	import { onMount } from 'svelte';

	let { data, form } = $props();
	let loading = $state(false);
	let avatarLoading = $state(false);
	let avatarPreview: string | null = $state(null);

	let timezoneSaving = $state(false);
	let prefsSaving = $state(false);
	let dyslexicSaving = $state(false);
	let featureSaving = $state(false);
	let featureKind = $state<'book' | 'series' | 'url'>('book');
	let featureBookId = $state<string | undefined>(undefined);
	let featureSeriesId = $state<string | undefined>(undefined);
	let featureUrl = $state<string | undefined>(undefined);
	let profileGenres = $derived([...(data.profileGenres ?? [])]);

	let dyslexicFont = $derived(!!data.user.dyslexicFont);

	// Derive the initial notification mode from stored prefs.
	function initialMode(prefs: {
		emailEnabled: boolean;
		digestHourLocal: number | null;
	}): 'off' | 'immediate' | 'daily_digest' {
		if (!prefs.emailEnabled) return 'off';
		if (prefs.digestHourLocal !== null && prefs.digestHourLocal !== undefined)
			return 'daily_digest';
		return 'immediate';
	}

	// Seed local state from the initially-loaded data. The $effect below
	// re-syncs whenever `data` changes (e.g. after a successful form action
	// returns a new server snapshot), so the "captures initial value" warnings
	// are intentional.

	let selectedTimezone = $derived(data.user.timezone);
	let notificationMode = $derived(initialMode(data.preferences));
	let digestHour = $derived(data.preferences.digestHourLocal ?? 8);

	let detectedTimezone = $state<string>('');
	let allTimezones = $state<string[]>([]);
	const featuredCount = $derived(data.featuredSubjects.length);
	const availableBooks = $derived(
		data.allBooks
			.filter((book) => !book.deletedAt)
			.filter(
				(book) =>
					!data.featuredSubjects.some((item) => item.kind === 'book' && item.book.id === book.id)
			)
			.map((book) => ({ id: book.id, title: book.title, authorText: book.authorText }))
	);
	const availableSeries = $derived(
		data.allSeries
			.filter((entry) => !entry.deletedAt)
			.filter(
				(entry) =>
					!data.featuredSubjects.some(
						(item) => item.kind === 'series' && item.series.id === entry.id
					)
			)
			.map((entry) => ({ id: entry.id, title: entry.title, authorText: entry.authorText }))
	);

	onMount(() => {
		try {
			detectedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? '';
		} catch {
			detectedTimezone = '';
		}
		let zones: string[] = [];
		try {
			if (typeof Intl.supportedValuesOf === 'function') {
				zones = Intl.supportedValuesOf('timeZone') as string[];
			}
		} catch {
			zones = [];
		}
		if (zones.length === 0) {
			// Fallback minimal list if the runtime lacks supportedValuesOf.
			zones = [
				...new Set([
					data.user.timezone || 'UTC',
					detectedTimezone || 'UTC',
					'UTC',
					'Atlantic/Bermuda',
					'America/Chicago',
					'America/Denver',
					'America/Halifax',
					'America/Los_Angeles',
					'America/New_York',
					'Europe/London',
					'Europe/Berlin'
				])
			];
		}
		allTimezones = zones;
	});

	// Format a given hour (0-23) in the user's stored timezone for the dropdown label.
	// The stored digest hour is already in the user's local timezone, so the
	// label just needs to render that hour as a clock time. We use 12-hour
	// formatting for friendliness; no timezone math required.
	function formatHour(hour: number): string {
		const suffix = hour < 12 ? 'AM' : 'PM';
		const h12 = hour % 12 === 0 ? 12 : hour % 12;
		return `${h12}:00 ${suffix}`;
	}

	function useDetectedTimezone() {
		if (detectedTimezone) selectedTimezone = detectedTimezone;
	}

	function handleFileChange(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (file) {
			const url = URL.createObjectURL(file);
			avatarPreview = url;
		} else {
			avatarPreview = null;
		}
	}
</script>

<svelte:head>
	<title>Settings — The Archive</title>
</svelte:head>

<div class="max-w-2xl space-y-6">
	<div class="flex flex-wrap items-start justify-between gap-3">
		<div>
			<h1 class="text-2xl font-bold">Settings</h1>
			<p class="text-muted-foreground">Manage your account and preferences</p>
		</div>
		<Button href={resolve('/members/[id]', { id: data.user.id })} variant="outline">
			<EyeIcon class="h-4 w-4" />
			View Profile
		</Button>
	</div>

	<Card.Root>
		<Card.Header>
			<Card.Title>Profile</Card.Title>
			<Card.Description>Update your display name and profile information.</Card.Description>
		</Card.Header>
		<Card.Content>
			<form
				method="POST"
				action="?/updateProfile"
				use:enhance={() => {
					loading = true;
					return async ({ result, update }) => {
						loading = false;
						await update({ reset: false });
						if (result.type === 'success') {
							toast.success('Profile updated!');
						}
					};
				}}
				class="space-y-4"
			>
				<div class="space-y-2">
					<Label for="email">Email</Label>
					<Input id="email" value={data.user.email} disabled />
					<p class="text-xs text-muted-foreground">Your email cannot be changed.</p>
				</div>
				<div class="space-y-2">
					<Label for="displayName">Display Name</Label>
					<Input
						id="displayName"
						name="displayName"
						value={data.user.displayName}
						required
						minlength={2}
						maxlength={50}
					/>
				</div>
				<div class="space-y-2">
					<Label for="headline">Headline</Label>
					<Input
						id="headline"
						name="headline"
						value={data.profile?.headline ?? ''}
						maxlength={120}
					/>
				</div>
				<div class="space-y-2">
					<Label for="bio">Bio</Label>
					<Textarea id="bio" name="bio" rows={4} value={data.profile?.bio ?? ''} />
				</div>

				<div class="space-y-2">
					<Label for="favoriteGenresText">Favorite Genres ({profileGenres.length}/5)</Label>
					<ProfileGenrePicker
						genres={data.allGenres}
						selectedGenres={profileGenres}
						name="favoriteGenresText"
					/>
				</div>

				<div class="space-y-2">
					<Label for="websiteUrl">Website</Label>
					<Input
						id="websiteUrl"
						name="websiteUrl"
						type="url"
						value={data.profile?.websiteUrl ?? ''}
					/>
				</div>
				<div class="grid gap-3 sm:grid-cols-3">
					<label class="flex items-center gap-2 text-sm">
						<input
							name="showProfile"
							type="checkbox"
							checked={data.profile?.showProfile ?? true}
							class="rounded border-input"
						/>
						Show profile
					</label>
					<label class="flex items-center gap-2 text-sm">
						<input
							name="showRecommendations"
							type="checkbox"
							checked={data.profile?.showRecommendations ?? true}
							class="rounded border-input"
						/>
						Show recommendations
					</label>
					<label class="flex items-center gap-2 text-sm">
						<input
							name="showReadBooks"
							type="checkbox"
							checked={data.profile?.showReadBooks ?? true}
							class="rounded border-input"
						/>
						Show read books
					</label>
				</div>
				{#if form?.error}
					<p class="text-sm text-destructive">{form.error}</p>
				{/if}
				<Button type="submit" disabled={loading}>
					{loading ? 'Saving…' : 'Save Changes'}
				</Button>
			</form>
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title>Featured On Profile</Card.Title>
			<Card.Description>
				Pick up to 5 books or series to lead your profile. These show in the larger featured
				section.
			</Card.Description>
		</Card.Header>
		<Card.Content class="space-y-4">
			<form
				method="POST"
				action="?/addFeaturedSubject"
				use:enhance={() => {
					featureSaving = true;
					return async ({ result, update }) => {
						featureSaving = false;
						await update();
						if (result.type === 'success') {
							if (result.data?.featureAdded) {
								toast.success('Featured subject updated.');
							} else if (result.data?.featureQueued) {
								toast.success('URL queued for processing. Give it a minute to show up.');
							}
							featureBookId = undefined;
							featureSeriesId = undefined;
							featureUrl = undefined;
						} else if (result.type === 'failure' && result.data?.featureError) {
							toast.error(String(result.data.featureError));
						}
					};
				}}
				class="space-y-3"
			>
				<div class="flex flex-col gap-2">
					<div class="space-y-1">
						<div class="flex items-center gap-2">
							<Button
								type="button"
								size="sm"
								variant={featureKind === 'book' ? 'default' : 'outline'}
								onclick={() => (featureKind = 'book')}
							>
								Book
							</Button>
							<Button
								type="button"
								size="sm"
								variant={featureKind === 'series' ? 'default' : 'outline'}
								onclick={() => (featureKind = 'series')}
							>
								Series
							</Button>
							<Button
								type="button"
								size="sm"
								variant={featureKind === 'url' ? 'default' : 'outline'}
								onclick={() => (featureKind = 'url')}
							>
								URL
							</Button>
							{#if featureKind === 'url'}
								<p class="mb-1 hidden text-sm text-muted-foreground md:block">
									Paste a Goodreads book or series URL to import.
								</p>
							{/if}
						</div>
					</div>
					<input type="hidden" name="kind" value={featureKind} />
					<div class="flex items-end gap-2">
						<div class="flex-1">
							{#if featureKind === 'book'}
								<BookPicker
									books={availableBooks}
									bind:selectedId={featureBookId}
									name="subjectId"
									placeholder="Search books to feature..."
								/>
							{:else if featureKind === 'series'}
								<SeriesPicker
									series={availableSeries}
									bind:selectedId={featureSeriesId}
									name="subjectId"
									placeholder="Search series to feature..."
								/>
							{:else}
								<p class="mb-1 text-sm text-muted-foreground md:hidden">
									Paste a Goodreads book or series URL to import.
								</p>
								<Input
									id="featured-url"
									name="url"
									type="url"
									bind:value={featureUrl}
									placeholder="https://www.goodreads.com/book/show/..."
									class="flex-1"
								/>
							{/if}
						</div>
						<Button
							class="h-10"
							type="submit"
							disabled={featureSaving ||
								featuredCount >= 5 ||
								(featureKind === 'book'
									? !featureBookId
									: featureKind === 'series'
										? !featureSeriesId
										: !featureUrl?.startsWith('https://www.goodreads.com/'))}
						>
							<PlusIcon class="h-4 w-4" />
							Add
						</Button>
					</div>
				</div>
				<div class="flex items-center justify-between text-xs text-muted-foreground">
					<span>{featuredCount}/5 featured</span>
					{#if featuredCount >= 5}
						<span>Remove one to add another.</span>
					{/if}
				</div>
				{#if form?.featureError}
					<p class="text-sm text-destructive">{form.featureError}</p>
				{/if}
			</form>

			{#if data.featuredSubjects.length > 0}
				<div class="space-y-3">
					{#each data.featuredSubjects as item (item.relation.subjectType + item.relation.subjectId)}
						<div class="rounded-lg border p-3">
							<div class="mb-3 flex items-center justify-between gap-3">
								<div class="flex items-center gap-2 text-sm">
									<StarIcon class="h-4 w-4 text-primary" />
									<span class="font-medium">Featured</span>
								</div>
								<ConfirmButton
									confirmText="Remove this featured subject?"
									formAction="?/removeFeaturedSubject"
									formData={{ kind: item.relation.subjectType, subjectId: item.relation.subjectId }}
									variant="ghost"
									size="icon-sm"
								>
									<XIcon class="h-4 w-4" />
								</ConfirmButton>
							</div>
							{#if item.kind === 'book'}
								<a
									href={resolve('/books/[slug]', { slug: item.book.slug })}
									class="flex items-start gap-4 rounded-md p-2 transition-colors hover:bg-muted"
								>
									{#if item.book.coverUrl}
										<img
											src={item.book.coverUrl}
											alt={item.book.title}
											class="h-20 w-14 shrink-0 rounded object-cover shadow-sm"
										/>
									{:else}
										<div
											class="flex h-20 w-14 shrink-0 items-center justify-center rounded bg-muted"
										>
											<StarIcon class="h-5 w-5 text-muted-foreground" />
										</div>
									{/if}
									<div class="min-w-0 flex-1">
										<h3 class="font-medium">{item.book.title}</h3>
										{#if item.book.authorText}
											<p class="mt-1 text-sm text-muted-foreground">{item.book.authorText}</p>
										{/if}
									</div>
								</a>
							{:else}
								<a
									href={resolve('/series/[slug]', { slug: item.series.slug })}
									class="flex items-start gap-4 rounded-md p-2 transition-colors hover:bg-muted"
								>
									{#if item.series.coverUrl}
										<img
											src={item.series.coverUrl}
											alt={item.series.title}
											class="h-20 w-14 shrink-0 rounded object-cover shadow-sm"
										/>
									{:else}
										<div
											class="flex h-20 w-14 shrink-0 items-center justify-center rounded bg-muted"
										>
											<StarIcon class="h-5 w-5 text-muted-foreground" />
										</div>
									{/if}
									<div class="min-w-0 flex-1">
										<h3 class="font-medium">{item.series.title}</h3>
										{#if item.series.authorText}
											<p class="mt-1 text-sm text-muted-foreground">{item.series.authorText}</p>
										{/if}
									</div>
								</a>
							{/if}
						</div>
					{/each}
				</div>
			{:else}
				<p class="text-sm text-muted-foreground">No featured subjects yet.</p>
			{/if}
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title>Avatar</Card.Title>
			<Card.Description>Upload a profile picture. PNG, JPG, or WEBP, max 1MB.</Card.Description>
		</Card.Header>
		<Card.Content>
			<form
				method="POST"
				action="?/uploadAvatar"
				enctype="multipart/form-data"
				use:enhance={() => {
					avatarLoading = true;
					return async ({ result, update }) => {
						avatarLoading = false;
						await update();
						if (result.type === 'success') {
							toast.success('Avatar updated!');
							avatarPreview = null;
						}
					};
				}}
				class="space-y-4"
			>
				<div class="flex items-center gap-4">
					<Avatar.Root class="h-16 w-16" size="lg">
						{#if avatarPreview}
							<Avatar.Image src={avatarPreview} alt="Preview" />
						{:else if data.user.avatarUrl}
							<Avatar.Image src={data.user.avatarUrl} alt={data.user.displayName} />
						{/if}
						<Avatar.Fallback class="text-lg"
							>{data.user.displayName.charAt(0).toUpperCase()}</Avatar.Fallback
						>
					</Avatar.Root>
					<div class="flex-1 space-y-2">
						<Label for="avatar">Image file</Label>
						<Input
							id="avatar"
							name="avatar"
							type="file"
							accept="image/png,image/jpeg,image/webp"
							onchange={handleFileChange}
						/>
					</div>
				</div>
				{#if form?.avatarError}
					<p class="text-sm text-destructive">{form.avatarError}</p>
				{/if}
				<Button type="submit" disabled={avatarLoading}>
					<UploadIcon />
					{avatarLoading ? 'Uploading…' : 'Upload Avatar'}
				</Button>
			</form>
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title>Timezone</Card.Title>
			<Card.Description>
				We use this to schedule your digest email and to show times in the forum.
			</Card.Description>
		</Card.Header>
		<Card.Content>
			<form
				method="POST"
				action="?/updateTimezone"
				use:enhance={() => {
					timezoneSaving = true;
					return async ({ result, update }) => {
						timezoneSaving = false;
						await update();
						if (result.type === 'success') toast.success('Timezone updated.');
					};
				}}
				class="space-y-4"
			>
				<div class="space-y-2">
					<Label for="timezone">Timezone</Label>
					<NativeSelect id="timezone" name="timezone" bind:value={selectedTimezone}>
						{#each allTimezones as tz (tz)}
							<NativeSelectOption value={tz}>{tz}</NativeSelectOption>
						{/each}
					</NativeSelect>
					{#if detectedTimezone && detectedTimezone !== selectedTimezone}
						<p class="text-xs text-muted-foreground">
							Detected: <strong>{detectedTimezone}</strong>
							<button
								type="button"
								class="ml-1 text-primary hover:underline"
								onclick={useDetectedTimezone}
							>
								Use detected
							</button>
						</p>
					{/if}
				</div>
				{#if form?.timezoneError}
					<p class="text-sm text-destructive">{form.timezoneError}</p>
				{/if}
				<Button type="submit" disabled={timezoneSaving}>
					{timezoneSaving ? 'Saving…' : 'Save Timezone'}
				</Button>
			</form>
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title>Notifications</Card.Title>
			<Card.Description>
				Choose how you receive email notifications from the forum.
			</Card.Description>
		</Card.Header>
		<Card.Content>
			<form
				method="POST"
				action="?/updatePreferences"
				use:enhance={() => {
					prefsSaving = true;
					return async ({ result, update }) => {
						prefsSaving = false;
						await update();
						if (result.type === 'success') toast.success('Preferences updated.');
					};
				}}
				class="space-y-4"
			>
				<fieldset class="space-y-2">
					<legend class="text-sm font-medium">Email me</legend>
					<label class="flex items-start gap-3">
						<input
							type="radio"
							name="mode"
							value="off"
							checked={notificationMode === 'off'}
							onchange={() => (notificationMode = 'off')}
							class="mt-1"
						/>
						<span>
							<span class="block font-medium">Off</span>
							<span class="block text-xs text-muted-foreground"> No emails from the forum. </span>
						</span>
					</label>
					<label class="flex items-start gap-3">
						<input
							type="radio"
							name="mode"
							value="immediate"
							checked={notificationMode === 'immediate'}
							onchange={() => (notificationMode = 'immediate')}
							class="mt-1"
						/>
						<span>
							<span class="block font-medium">Immediately</span>
							<span class="block text-xs text-muted-foreground">
								A message arrives as soon as someone replies in a thread you're watching.
							</span>
						</span>
					</label>
					<label class="flex items-start gap-3">
						<input
							type="radio"
							name="mode"
							value="daily_digest"
							checked={notificationMode === 'daily_digest'}
							onchange={() => (notificationMode = 'daily_digest')}
							class="mt-1"
						/>
						<span>
							<span class="block font-medium">Once a day (digest)</span>
							<span class="block text-xs text-muted-foreground">
								One roll-up message at a time you choose, in your local timezone.
							</span>
						</span>
					</label>
				</fieldset>

				{#if notificationMode === 'daily_digest'}
					<div class="space-y-2">
						<Label for="digestHour">Digest time ({data.user.timezone})</Label>
						<NativeSelect id="digestHour" name="digestHour" bind:value={digestHour}>
							{#each Array.from({ length: 24 }, (_, i) => i) as h (h)}
								<NativeSelectOption value={h}>{formatHour(h)}</NativeSelectOption>
							{/each}
						</NativeSelect>
					</div>
				{/if}

				<label class="flex items-center gap-2 text-sm">
					<input type="checkbox" name="autoSubscribe" checked={data.preferences.autoSubscribeOwn} />
					Automatically watch threads I create or reply to
				</label>

				{#if form?.prefsError}
					<p class="text-sm text-destructive">{form.prefsError}</p>
				{/if}

				<Button type="submit" disabled={prefsSaving}>
					{prefsSaving ? 'Saving…' : 'Save Preferences'}
				</Button>
			</form>
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title>Accessibility</Card.Title>
			<Card.Description>
				Swap all site text to the <a
					href="https://opendyslexic.org/"
					target="_blank"
					rel="noopener noreferrer"
					class="underline hover:text-foreground">OpenDyslexic</a
				> font.
			</Card.Description>
		</Card.Header>
		<Card.Content>
			<form
				method="POST"
				action="?/updateDyslexicFont"
				use:enhance={() => {
					dyslexicSaving = true;
					return async ({ result, update }) => {
						dyslexicSaving = false;
						await update();
						if (result.type === 'success') toast.success('Preference updated.');
					};
				}}
				class="space-y-4"
			>
				<label class="flex items-center gap-2 text-sm">
					<input type="checkbox" name="dyslexicFont" checked={dyslexicFont} />
					Use OpenDyslexic font across the site
				</label>
				<Button type="submit" disabled={dyslexicSaving}>
					{dyslexicSaving ? 'Saving…' : 'Save'}
				</Button>
			</form>
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title>Account</Card.Title>
		</Card.Header>
		<Card.Content>
			<p class="mb-3 text-sm text-muted-foreground">
				Member since {formatDate(data.user.createdAt, {
					time: 'never',
					timeZone: data.user.timezone
				})}
			</p>
			<Separator class="my-4" />
			<form method="POST" action="/auth/logout">
				<Button variant="outline" type="submit">Sign Out</Button>
			</form>
		</Card.Content>
	</Card.Root>
</div>
