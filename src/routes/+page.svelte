<script>
	import { browser } from '$app/environment';
	import NavActions from '$lib/components/nav/NavActions.svelte';
	import AddTokenForm from '$lib/components/tokens/AddTokenForm.svelte';
	import TokenList from '$lib/components/tokens/TokenList.svelte';
	import SearchBar from '$lib/components/ui/SearchBar.svelte';
	import { useConditionsContext } from '$lib/state/conditions.svelte.js';
	import { useSettingsContext } from '$lib/state/settings.svelte';
	import { encryptedLocalStorage } from '$lib/state/storage.svelte';
	import { tokenize, useTokensContext } from '$lib/state/tokens.svelte';
	import { ArrowRightLeft, Cog, PlusIcon, Settings, Shield, WifiOff } from 'lucide-svelte';
	import { untrack } from 'svelte';
	import { assets } from '$app/paths';

	const { data } = $props();

	const settingsContext = useSettingsContext();
	const conditionsContext = useConditionsContext();
	const tokensContext = useTokensContext();

	let isAppleDevice = $derived(conditionsContext.getConditions().isAppleDevice);

	$effect(() => {
		/*
		TODO: This is hacky (see buglist); This runs on every navigation, which shouldn't be necessary because
		  encryptedLocalStorage.current has not changed and merge into current tokens context isn't necessary.
		*/
		if (browser && encryptedLocalStorage.current) {
			const storage = encryptedLocalStorage.current;
			untrack(() => tokensContext.makeMerge(storage));
		}
	});

	let tokens = $derived.by(() => tokensContext.current?.getTokens() || data.tokens);

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
	<NavActions
		sortButton={{
			sortOrder: settingsContext.getSettings().sortOrder,
			onSortChange: (/** @type {'asc' | 'desc' | 'none'} */ newOrder) =>
				settingsContext.updateSetting('sortOrder', newOrder)
		}}
		addButton={openAddTokenForm}
	/>
</header>

<main>
	{#if tokens.length > 0}
		<div class="space-y-4">
			<SearchBar bind:searchQuery {isAppleDevice} />
			<TokenList {tokens} {searchQuery} />
		</div>
	{:else}
		<div class="flex h-auto flex-col items-center justify-center py-10 text-center">
			<div class="mx-auto max-w-md space-y-6 text-gray-400">
				<h2 class="px-4 text-2xl font-semibold text-white">
					Trezur is a fast, simple, light-weight web-app to generate TOTP and HOTP tokens.
				</h2>

				<div class="space-y-4 px-4 text-left text-sm">
					<div class="flex items-start gap-4">
						<div class="pt-1 text-[#EB3912]"><WifiOff /></div>
						<div>
							<h3 class="font-bold text-white">Offline-first</h3>
							<p>
								All data is stored on your device, and none in our servers. You can even use it
								offline after first load.
							</p>
						</div>
					</div>
					<div class="flex items-start gap-4">
						<div class="pt-1 text-[#EB3912]"><Shield /></div>
						<div>
							<h3 class="font-bold text-white">Secure</h3>
							<p>
								Tokens are stored encrypted in browser storage. You can additionally protect with
								passcodes.
							</p>
						</div>
					</div>
					<div class="flex items-start gap-4">
						<div class="pt-1 text-[#EB3912]"><ArrowRightLeft /></div>
						<div>
							<h3 class="font-bold text-white">Import & Export</h3>
							<p>
								Import from anywhere and export easily. Also auto-backup and multi-device sync
								with a provider of your choice.
							</p>
						</div>
					</div>
				</div>

				<div class="pt-6">
					<p class="mx-auto mb-2 max-w-xs text-md">
						Get started by adding your first security token using the
						<button
							class="inline-flex items-center align-middle text-[#EB3912]"
							onclick={openAddTokenForm}
						>
							<PlusIcon class="inline-block h-[1em] w-[1em]" />
						</button> button.
					</p>
					<p class="mx-auto max-w-xs text-md">
						Or import tokens from another app in the <a href="/settings">Settings </a>
						<a
							href="/settings"
							class="inline-flex items-center align-middle transition duration-800 ease-in-out hover:rotate-90 hover:text-[#EB3912]"
						>
							{#if isAppleDevice}
								<Cog class="inline-block h-[1em] w-[1em]" />
							{:else}
								<Settings class="inline-block h-[1em] w-[1em]" />
							{/if}
						</a> page.
					</p>
				</div>
			</div>
		</div>
	{/if}
</main>

<AddTokenForm bind:open={showAddTokenForm} onAddToken={handleAddToken} />
