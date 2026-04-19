<script lang="ts">
	import { enhance } from '$app/forms';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import * as Avatar from '$lib/components/ui/avatar/index.js';
	import UploadIcon from '@lucide/svelte/icons/upload';
	import { toast } from 'svelte-sonner';
	import { NativeSelect, NativeSelectOption } from '$lib/components/ui/native-select/index.js';

	let { data, form } = $props();
	let loading = $state(false);
	let avatarLoading = $state(false);
	let avatarPreview: string | null = $state(null);

	let timezoneSaving = $state(false);
	let prefsSaving = $state(false);

	// Derive the initial notification mode from stored prefs.
	function initialMode(prefs: {
		emailEnabled: number;
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
	// svelte-ignore state_referenced_locally
	let selectedTimezone = $state<string>(data.user.timezone);
	// svelte-ignore state_referenced_locally
	let notificationMode = $state<'off' | 'immediate' | 'daily_digest'>(
		initialMode(data.preferences)
	);
	// svelte-ignore state_referenced_locally
	let digestHour = $state<number>(data.preferences.digestHourLocal ?? 8);
	// svelte-ignore state_referenced_locally
	let autoSubscribe = $state<boolean>(!!data.preferences.autoSubscribeOwn);

	$effect(() => {
		// Keep local state in sync with freshly-loaded server data after an
		// action completes.
		selectedTimezone = data.user.timezone;
		notificationMode = initialMode(data.preferences);
		digestHour = data.preferences.digestHourLocal ?? 8;
		autoSubscribe = !!data.preferences.autoSubscribeOwn;
	});

	let detectedTimezone = $state<string>('');
	let allTimezones = $state<string[]>([]);

	$effect(() => {
		try {
			detectedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? '';
		} catch {
			detectedTimezone = '';
		}
		let zones: string[] = [];
		try {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const anyIntl = Intl as any;
			if (typeof anyIntl.supportedValuesOf === 'function') {
				zones = anyIntl.supportedValuesOf('timeZone') as string[];
			}
		} catch {
			zones = [];
		}
		if (zones.length === 0) {
			// Fallback minimal list if the runtime lacks supportedValuesOf.
			zones = [
				data.user.timezone,
				'UTC',
				'Atlantic/Bermuda',
				'America/New_York',
				'America/Halifax',
				'America/Los_Angeles',
				'Europe/London',
				'Europe/Berlin'
			].filter((v, i, a) => v && a.indexOf(v) === i);
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
	<title>Settings — Storied</title>
</svelte:head>

<div class="max-w-2xl space-y-6">
	<div>
		<h1 class="text-2xl font-bold">Settings</h1>
		<p class="text-muted-foreground">Manage your account and preferences</p>
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
						await update();
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
					<input type="checkbox" name="autoSubscribe" bind:checked={autoSubscribe} />
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
			<Card.Title>Account</Card.Title>
		</Card.Header>
		<Card.Content>
			<p class="mb-3 text-sm text-muted-foreground">
				Member since {new Date(data.user.createdAt).toLocaleDateString()}
			</p>
			<Separator class="my-4" />
			<form method="POST" action="/auth/logout">
				<Button variant="outline" type="submit">Sign Out</Button>
			</form>
		</Card.Content>
	</Card.Root>
</div>
