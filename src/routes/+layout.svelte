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
	import LightbulbIcon from '@lucide/svelte/icons/lightbulb';
	import LibraryIcon from '@lucide/svelte/icons/library';
	import MenuIcon from '@lucide/svelte/icons/menu';
	import MessageSquareIcon from '@lucide/svelte/icons/message-square';
	import SearchIcon from '@lucide/svelte/icons/search';
	import UsersIcon from '@lucide/svelte/icons/users';
	import UserIcon from '@lucide/svelte/icons/user';
	import { resolve } from '$app/paths';
	import { APP_NAME, APP_SUBTITLE, PRODUCT_NAME } from '$shared/brand';

	let { children, data } = $props();
	const user = $derived(data.user);

	const secondaryLinks = $derived([
		{ kind: 'static' as const, label: 'Sessions', href: '/sessions' as const, icon: CalendarIcon },
		{ kind: 'static' as const, label: 'Themes', href: '/themes' as const, icon: LightbulbIcon },
		{ kind: 'static' as const, label: 'Library', href: '/library' as const, icon: LibraryIcon },
		{ kind: 'static' as const, label: 'Members', href: '/members' as const, icon: UsersIcon },
		...data.navCategories.map((category) => ({
			kind: 'category' as const,
			label: category.name,
			slug: category.slug,
			icon: MessageSquareIcon
		}))
	]);
</script>

<ModeWatcher />
<Toaster richColors />

<div data-dyslexic={data.dyslexicFont} class="flex min-h-screen flex-col">
	<header class="sticky top-0 z-50 border-b bg-card/80 backdrop-blur-sm">
		<div class="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
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
							{#each secondaryLinks as link (link.kind === 'category' ? `category-${link.slug}` : link.href)}
								{@const Icon = link.icon}
								{#if link.kind === 'category'}
									<DropdownMenu.Item
										onSelect={() => goto(resolve('/category/[slug]', { slug: link.slug }))}
									>
										<Icon class="h-4 w-4" />
										{link.label}
									</DropdownMenu.Item>
								{:else}
									<DropdownMenu.Item onSelect={() => goto(resolve(link.href))}>
										<Icon class="h-4 w-4" />
										{link.label}
									</DropdownMenu.Item>
								{/if}
							{/each}
						</DropdownMenu.Content>
					</DropdownMenu.Root>
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
									<span class="hidden sm:inline">{user.displayName}</span>
								</Button>
							{/snippet}
						</DropdownMenu.Trigger>
						<DropdownMenu.Content align="end" class="w-48">
							<DropdownMenu.Label>
								<div class="flex flex-col">
									<span>{user.displayName}</span>
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
				{:else}
					<Button href="/auth/login" variant="default" size="sm">Sign In</Button>
				{/if}
			</div>
		</div>
		{#if user}
			<nav class="hidden border-t md:block">
				<div class="mx-auto max-w-5xl overflow-x-auto px-4">
					<div class="flex h-11 w-max items-center gap-1">
						{#each secondaryLinks as link (link.kind === 'category' ? `category-${link.slug}` : link.href)}
							{@const Icon = link.icon}
							{#if link.kind === 'category'}
								<a
									href={resolve('/category/[slug]', { slug: link.slug })}
									aria-current={page.url.pathname === `/category/${link.slug}` ? 'page' : undefined}
									class="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground aria-[current=page]:bg-muted aria-[current=page]:text-foreground"
								>
									<Icon class="h-4 w-4" />
									{link.label}
								</a>
							{:else}
								<a
									href={resolve(link.href)}
									aria-current={page.url.pathname === link.href ? 'page' : undefined}
									class="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground aria-[current=page]:bg-muted aria-[current=page]:text-foreground"
								>
									<Icon class="h-4 w-4" />
									{link.label}
								</a>
							{/if}
						{/each}
					</div>
				</div>
			</nav>
		{/if}
	</header>

	<main class="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col px-4 py-6">
		{@render children()}
	</main>

	<footer class="border-t py-6 text-center text-sm text-muted-foreground">
		<div class="mx-auto max-w-5xl px-4">
			<p>{APP_NAME} &mdash; Powered by {PRODUCT_NAME}</p>
		</div>
	</footer>
</div>
