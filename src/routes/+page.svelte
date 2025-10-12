<script>
	import { browser, dev } from '$app/environment';
	import NavActions from '$lib/components/nav/NavActions.svelte';
	import AddTokenForm from '$lib/components/tokens/AddTokenForm.svelte';
	import TokenList from '$lib/components/tokens/TokenList.svelte';
	import SearchBar from '$lib/components/ui/SearchBar.svelte';
	import LoadingSpinner from '$lib/components/ui/LoadingSpinner.svelte';
	import { useConditionsContext } from '$lib/state/conditions.svelte.js';
	import { useSettingsContext } from '$lib/state/settings.svelte';
	import { encryptedLocalStorage } from '$lib/state/storage.svelte';
	import { tokenize, useTokensContext } from '$lib/state/tokens.svelte';
	import { ArrowRightLeft, Cog, PlusIcon, Settings, Shield, WifiOff } from 'lucide-svelte';
	import { assets } from '$app/paths';

	const { data } = $props();

	const settingsContext = useSettingsContext();
	const conditionsContext = useConditionsContext();
	const tokensContext = useTokensContext();

	const conditions = $derived(conditionsContext.getConditions());
	let isAppleDevice = $derived(conditions.isAppleDevice);

	let initialTokenLoadDone = $state(true);
	// $inspect('initialTokenLoadDone', initialTokenLoadDone, 'at', Date.now());

	$effect(() => {
		if (browser) {
			const newStorage = encryptedLocalStorage.current;
			const currentTokensCtx = tokensContext.current;

			/**
			 * @todo TODO: Explore how to move this to Promises + {#await}-ed blocks (ala Suspense).
			 */
			(async function () {
				if (newStorage) {
					if (!currentTokensCtx || newStorage !== currentTokensCtx.storage) {
						initialTokenLoadDone = false; // New storage, reset loading state.

						if (dev) {
							if (!currentTokensCtx) console.log('Tokens context initializing with new storage.');
							else if (newStorage !== currentTokensCtx.storage)
								console.log('Storage instance changed, re-initializing tokens context.');
						}

						await tokensContext.iMake(newStorage); /*
							aside: normally this needs to be untracked. But svelte effects don't track
							anything after an await keyword.

							refer: https://svelte.dev/docs/svelte/$effect#Understanding-dependencies
							refer: https://github.com/sveltejs/svelte/issues/9520#issuecomment-1817092724
						*/

						initialTokenLoadDone = true; // Loading finished for this storage.
					} else {
						initialTokenLoadDone = true; // Storage already processed.
					}
				} else {
					// No storage yet.
					if (conditions.clientId /* aside: no untrack needed here either */)
						initialTokenLoadDone = false; // We have a client ID, so we are waiting for storage.
					else initialTokenLoadDone = true; // No client ID, nothing to load.
				}
			})();
		}
	});

	let tokens = $derived(tokensContext.current?.getTokens() || data.tokens);
	let isLoading = $derived(browser && !initialTokenLoadDone && conditions.clientId);

	// $inspect(tokensContext, tokens);

	let showAddTokenForm = $state(false);
	let searchQuery = $state('');

	function openAddTokenForm() {
		showAddTokenForm = true;
	}

	/**
	 * @param {import('$lib/types').Tokenable} tokenable
	 */
	function handleAddToken(tokenable) {
		tokensContext.current?.addTokens(tokenize(tokenable));
	}

	/** @type {import('./$types').Snapshot<string>} */
	export const snapshot = {
		capture: () => searchQuery,
		restore: (value) => (searchQuery = value)
	};
</script>

<svelte:head>
	<title>Trezur · Codes</title>
	<meta name="description" content="Trezur app" />
</svelte:head>

<header class="mb-6 flex items-center justify-between">
	<img src={`${assets}/trezur_logo.svg`} alt="Trezur Logo" class="h-6 w-auto" />

	{#if !isLoading}
		<NavActions
			sortButton={tokens.length > 0 && {
				sortOrder: settingsContext.getSettings().sortOrder,
				onSortChange: (/** @type {'asc' | 'desc' | 'none'} */ newOrder) =>
					settingsContext.updateSetting('sortOrder', newOrder)
			}}
			addButton={openAddTokenForm}
		/>
	{/if}
</header>

<main class:cursor-wait={isLoading}>
	{#if tokens.length > 0}
		<div class="space-y-4">
			<SearchBar bind:searchQuery {isAppleDevice} />
			<TokenList {tokens} {searchQuery} />
		</div>
	{:else}
		<div class="mt-12 flex h-auto flex-col items-center justify-center gap-8 text-center sm:mt-18">
			<h2 class="px-4 text-2xl font-semibold">
				Trezur is a web-app to generate <abbr title="Time-based One-Time Password">TOTP</abbr> and
				<abbr title="HMAC-based One-Time Password">HOTP</abbr>
				codes for <abbr title="Two-Factor Authentication">2FA</abbr>.
			</h2>

			<div class="space-y-4 px-4 text-left text-sm">
				<div class="flex items-start gap-4">
					<div class="pt-1 text-[#EB3912]"><WifiOff /></div>
					<div>
						<h3 class="font-bold">Offline-First Privacy</h3>
						<p>
							Trezur keeps your data on your device, not on our servers. Enjoy seamless offline
							access after your first visit. <span class="text-[#EB3912]"
								><em>We don't collect any user data.</em></span
							>
						</p>
					</div>
				</div>
				<div class="flex items-start gap-4">
					<div class="pt-1 text-[#EB3912]"><Shield /></div>
					<div>
						<h3 class="font-bold">Encrypted & Protected</h3>
						<p>
							Your tokens are stored encrypted in your browser. Optionally, you can add a passcode
							for an extra layer of protection.
						</p>
					</div>
				</div>
				<div class="flex items-start gap-4">
					<div class="pt-1 text-[#EB3912]"><ArrowRightLeft /></div>
					<div>
						<h3 class="font-bold">Total Control</h3>
						<p>
							Effortlessly import and export your tokens. Set up automatic backups and multi-device
							sync with your preferred cloud service. <sub class="text-xs text-zinc-500"
								>Coming Soon</sub
							>
						</p>
					</div>
				</div>
			</div>

			<LoadingSpinner {isLoading} delay={300} {isAppleDevice}>
				<p>Loading tokens...</p>
			</LoadingSpinner>

			{#if !isLoading}
				{@render AddOrImportTokensPrompt()}
			{/if}
		</div>
	{/if}
</main>

<AddTokenForm bind:open={showAddTokenForm} onAddToken={handleAddToken} />

{#snippet AddOrImportTokensPrompt()}
	<div class="space-y-4 px-4">
		<button
			class="transition-colors duration-300 hover:text-[#EB3912]"
			onclick={openAddTokenForm}
			aria-label="Add token"
		>
			<PlusIcon class="h-20 w-20 opacity-70" />
		</button>
		<p>
			Get started by adding your first security token using the
			<button
				class="inline-flex items-center align-middle text-[#EB3912]"
				onclick={openAddTokenForm}
				aria-label="Add token"
			>
				<PlusIcon class="inline-block h-[1em] w-[1em]" />
			</button> button.
		</p>
		<p>
			Or import tokens from another app in the <a href="/settings">Settings </a>
			<a
				href="/settings"
				class="inline-flex items-center align-middle transition duration-800 ease-in-out hover:rotate-90 hover:text-[#EB3912]"
				aria-label="Settings page"
			>
				{#if isAppleDevice}
					<Cog class="inline-block h-[1em] w-[1em]" />
				{:else}
					<Settings class="inline-block h-[1em] w-[1em]" />
				{/if}
			</a> page.
		</p>
	</div>
{/snippet}
