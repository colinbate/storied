<script lang="ts">
	import './layout.css';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { ModeWatcher, toggleMode } from 'mode-watcher';
	import { Toaster } from '$lib/components/ui/sonner/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Avatar from '$lib/components/ui/avatar/index.js';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import SunIcon from '@lucide/svelte/icons/sun';
	import MoonIcon from '@lucide/svelte/icons/moon';
	import LogOutIcon from '@lucide/svelte/icons/log-out';
	import SettingsIcon from '@lucide/svelte/icons/settings';
	import ShieldIcon from '@lucide/svelte/icons/shield';
	import CalendarIcon from '@lucide/svelte/icons/calendar';
	import HouseIcon from '@lucide/svelte/icons/house';
	import LibraryIcon from '@lucide/svelte/icons/library';
	import MailIcon from '@lucide/svelte/icons/mail';
	import MenuIcon from '@lucide/svelte/icons/menu';
	import MessageSquareIcon from '@lucide/svelte/icons/message-square';
	import SearchIcon from '@lucide/svelte/icons/search';
	import UsersIcon from '@lucide/svelte/icons/users';
	import UserIcon from '@lucide/svelte/icons/user';
	import CircleHelpIcon from '@lucide/svelte/icons/circle-help';
	import MessageCircleIcon from '@lucide/svelte/icons/message-circle';
	import MemberName from '$lib/components/member-name.svelte';
	import { resolve } from '$app/paths';
	import { APP_NAME, APP_SUBTITLE, PRODUCT_NAME, PRODUCT_URL } from '$shared/brand';

	let { children, data } = $props();
	const user = $derived(data.user);

	const primaryLinks = [
		{ label: 'Home', href: '/' as const, icon: HouseIcon },
		{ kind: 'static' as const, label: 'Sessions', href: '/sessions' as const, icon: CalendarIcon },
		{
			kind: 'static' as const,
			label: 'Discussions',
			href: '/discussions' as const,
			icon: MessageSquareIcon
		},
		{ kind: 'static' as const, label: 'Library', href: '/library' as const, icon: LibraryIcon },
		{ kind: 'static' as const, label: 'Members', href: '/members' as const, icon: UsersIcon }
	];

	function isPrimaryLinkActive(href: (typeof primaryLinks)[number]['href']) {
		const pathname = page.url.pathname;
		const isThread = pathname.startsWith('/thread/');
		const isSessionThread = isThread && 'session' in page.data && Boolean(page.data.session);

		switch (href) {
			case '/':
				return pathname === '/';
			case '/sessions':
				return pathname.startsWith('/sessions') || pathname === '/themes' || isSessionThread;
			case '/discussions':
				return (
					pathname.startsWith('/discussions') ||
					pathname.startsWith('/category/') ||
					pathname === '/new' ||
					(isThread && !isSessionThread)
				);
			case '/library':
				return ['/library', '/books', '/series', '/authors'].some(
					(prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
				);
			case '/members':
				return pathname === '/members' || pathname.startsWith('/members/');
		}
	}

	function inlineSpoilerFromTarget(target: EventTarget | null) {
		return target instanceof Element ? target.closest<HTMLElement>('.spoiler-inline') : null;
	}

	function setInlineSpoilerRevealed(spoiler: HTMLElement, revealed: boolean) {
		spoiler.dataset.revealed = String(revealed);
		spoiler.setAttribute('aria-expanded', String(revealed));
		spoiler.setAttribute(
			'aria-label',
			revealed ? 'Spoiler revealed, select to conceal' : 'Spoiler, select to reveal'
		);
	}

	function handleSpoilerClick(event: MouseEvent) {
		const spoiler = inlineSpoilerFromTarget(event.target);
		if (!spoiler) return;

		const revealed = spoiler.dataset.revealed === 'true';
		if (revealed && event.target instanceof Element && event.target.closest('a')) return;

		event.preventDefault();
		setInlineSpoilerRevealed(spoiler, !revealed);
	}

	function handleSpoilerKeydown(event: KeyboardEvent) {
		if (event.key !== 'Enter' && event.key !== ' ') return;
		const spoiler = inlineSpoilerFromTarget(event.target);
		if (!spoiler) return;
		if (
			spoiler.dataset.revealed === 'true' &&
			event.target instanceof Element &&
			event.target.closest('a')
		) {
			return;
		}

		event.preventDefault();
		setInlineSpoilerRevealed(spoiler, spoiler.dataset.revealed !== 'true');
	}
</script>

<ModeWatcher />
<Toaster richColors />
<svelte:window onclick={handleSpoilerClick} onkeydown={handleSpoilerKeydown} />

<div data-dyslexic={data.dyslexicFont} class="flex min-h-screen flex-col">
	<header class="sticky top-0 z-50 border-b bg-card/80 backdrop-blur-sm">
		<div class="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
			<a
				href={resolve('/')}
				class="flex min-w-0 items-center gap-2 font-semibold text-foreground transition-colors hover:text-primary"
			>
				<img src="/favicon.svg" class="size-5" alt="logo of two message bubbles containing books" />
				<span class="shrink-0">{APP_NAME}</span>
				<span class="hidden truncate text-sm font-normal text-muted-foreground md:inline"
					>{APP_SUBTITLE}</span
				>
			</a>

			<div class="flex items-center gap-2">
				{#if user}
					<form action={resolve('/search')} method="GET" class="relative hidden md:block">
						<SearchIcon
							class="absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
						/>
						<input
							type="search"
							name="q"
							aria-label="Search"
							placeholder="Search"
							class="h-9 w-36 rounded-md border border-input bg-background px-3 py-1 pl-8 text-sm shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 lg:w-48"
						/>
					</form>
					<DropdownMenu.Root>
						<DropdownMenu.Trigger>
							{#snippet child({ props })}
								<Button variant="ghost" size="icon" class="h-9 w-9 md:hidden" {...props}>
									<MenuIcon class="h-4 w-4" />
									<span class="sr-only">Open navigation</span>
								</Button>
							{/snippet}
						</DropdownMenu.Trigger>
						<DropdownMenu.Content align="end" class="w-56 md:hidden">
							<DropdownMenu.Label>Navigate</DropdownMenu.Label>
							<DropdownMenu.Separator />
							{#each primaryLinks as link (link.href)}
								{@const Icon = link.icon}
								<DropdownMenu.Item onSelect={() => goto(resolve(link.href))}>
									<Icon class="h-4 w-4" />
									{link.label}
								</DropdownMenu.Item>
							{/each}
						</DropdownMenu.Content>
					</DropdownMenu.Root>
				{/if}

				{#if user}
					<Button
						href={resolve('/messages')}
						variant="ghost"
						size="icon"
						class="relative h-9 w-9"
						aria-label={data.unreadMessageConversationCount > 0
							? `${data.unreadMessageConversationCount} unread message conversation${data.unreadMessageConversationCount === 1 ? '' : 's'}`
							: 'Messages'}
					>
						<MailIcon class="h-4 w-4" />
						{#if data.unreadMessageConversationCount > 0}
							<span
								class="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] leading-none font-semibold text-primary-foreground"
							>
								{data.unreadMessageConversationCount > 9
									? '9+'
									: data.unreadMessageConversationCount}
							</span>
						{/if}
					</Button>
				{/if}

				<Button onclick={toggleMode} variant="ghost" size="icon" class="h-9 w-9">
					<SunIcon class="h-4 w-4 scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />
					<MoonIcon
						class="absolute h-4 w-4 scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0"
					/>
					<span class="sr-only">Toggle theme</span>
				</Button>

				{#if user}
					<DropdownMenu.Root>
						<DropdownMenu.Trigger>
							{#snippet child({ props })}
								<Button variant="ghost" size="sm" class="gap-2" {...props}>
									<Avatar.Root class="h-6 w-6">
										{#if user.avatarUrl}
											<Avatar.Image src={user.avatarUrl} alt={user.displayName} />
										{/if}
										<Avatar.Fallback class="text-xs"
											>{user.displayName.charAt(0).toUpperCase()}</Avatar.Fallback
										>
									</Avatar.Root>
									<MemberName
										class="hidden sm:inline-flex"
										userId={user.id}
										name={user.displayName}
									/>
								</Button>
							{/snippet}
						</DropdownMenu.Trigger>
						<DropdownMenu.Content align="end" class="w-48">
							<DropdownMenu.Label>
								<div class="flex flex-col">
									<MemberName userId={user.id} name={user.displayName} />
									<span class="text-xs font-normal text-muted-foreground">{user.email}</span>
								</div>
							</DropdownMenu.Label>
							<DropdownMenu.Separator />
							<DropdownMenu.Item onSelect={() => goto(resolve('/members/[id]', { id: user.id }))}>
								<UserIcon class="h-4 w-4" />
								Profile
							</DropdownMenu.Item>
							<DropdownMenu.Item onSelect={() => goto(resolve('/settings'))}>
								<SettingsIcon class="h-4 w-4" />
								Settings
							</DropdownMenu.Item>
							{#if data.permissions.has('admin:view')}
								<DropdownMenu.Item onSelect={() => goto(resolve('/admin'))}>
									<ShieldIcon class="h-4 w-4" />
									Admin
								</DropdownMenu.Item>
							{/if}
							<DropdownMenu.Separator />
							<DropdownMenu.Item onSelect={() => goto(resolve('/welcome'))}>
								<CircleHelpIcon class="h-4 w-4" />
								Help and Tour
							</DropdownMenu.Item>
							<DropdownMenu.Item
								onclick={() => {
									const form = document.getElementById('message-host-form') as HTMLFormElement;
									form?.requestSubmit();
								}}
							>
								<MessageCircleIcon class="h-4 w-4" />
								Message the Host
							</DropdownMenu.Item>
							<DropdownMenu.Separator />
							<DropdownMenu.Item
								onclick={() => {
									const form = document.getElementById('logout-form') as HTMLFormElement;
									form?.submit();
								}}
							>
								<LogOutIcon class="h-4 w-4" />
								Sign Out
							</DropdownMenu.Item>
						</DropdownMenu.Content>
					</DropdownMenu.Root>
					<form
						id="logout-form"
						method="POST"
						action={resolve('/auth/logout')}
						class="hidden"
					></form>
					<form
						id="message-host-form"
						method="POST"
						action="{resolve('/welcome')}?/messageHost"
						class="hidden"
					></form>
				{:else}
					<Button href="/auth/login" variant="default" size="sm">Sign In</Button>
				{/if}
			</div>
		</div>
		{#if user}
			<nav class="hidden border-t md:block">
				<div class="mx-auto max-w-6xl overflow-x-auto px-4">
					<div class="flex h-11 w-max items-center gap-1">
						{#each primaryLinks as link (link.href)}
							{@const Icon = link.icon}
							<a
								href={resolve(link.href)}
								aria-current={isPrimaryLinkActive(link.href) ? 'page' : undefined}
								class="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground aria-[current=page]:bg-muted aria-[current=page]:text-foreground"
							>
								<Icon class="h-4 w-4" />
								{link.label}
							</a>
						{/each}
					</div>
				</div>
			</nav>
		{/if}
	</header>

	<main class="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col px-4 py-6">
		{@render children()}
	</main>

	<footer class="border-t py-6 text-center text-sm text-muted-foreground">
		<div class="mx-auto max-w-5xl px-4">
			<p>
				{APP_NAME} &mdash; Powered by
				{#if PRODUCT_URL}
					<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- external product URL -->
					<a class="text-primary hover:underline" href={PRODUCT_URL}>{PRODUCT_NAME}</a>
				{:else}
					{PRODUCT_NAME}
				{/if}
			</p>
		</div>
	</footer>
</div>
