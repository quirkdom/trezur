<script>
	import { PlusIcon, Settings } from 'lucide-svelte';
	import TokenList from '$lib/components/tokens/TokenList.svelte';
	import SearchBar from '$lib/components/ui/SearchBar.svelte';
	import NavActions from '$lib/components/nav/NavActions.svelte';
	import AddTokenForm from '$lib/components/tokens/AddTokenForm.svelte';
	import { useSettingsContext } from '$lib/state/settings.svelte';
	import { createTokensContext } from '$lib/state/tokens.svelte';
	import { encryptedLocalStorage } from '$lib/state/storage.svelte';
	import { browser } from '$app/environment';

	const { data } = $props();
	const settingsContext = useSettingsContext();

	let tokensContext = $derived.by(() => {
		if (browser && encryptedLocalStorage.current) {
			let ctx = createTokensContext(encryptedLocalStorage.current);
			// ctx.init(); // async function; not awaited
			return ctx;
		}
	});

	// let tokens = $derived(tokensContext?.getTokens() || data.tokens);
	let tokens = $derived(data.tokens);

	// $inspect(tokensContext, tokens);
	// $inspect('Tokens', tokens);

	let isAddTokenFormOpen = $state(false);
	let searchQuery = $state('');

	function openAddTokenForm() {
		isAddTokenFormOpen = true;
	}

	/**
	 * @param {import('$lib/types').Tokenable} tokenable
	 */
	function handleAddToken(tokenable) {
		console.log('Add token', tokenable);
		// Implement token addition logic here
	}
</script>

<svelte:head>
	<title>Trezur</title>
	<meta name="description" content="Trezur app" />
</svelte:head>

<AddTokenForm bind:open={isAddTokenFormOpen} onAddToken={handleAddToken} />

<header class="mb-6 flex items-center justify-between">
	<h1 class="text-2xl font-medium">Trezur</h1>
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
		<SearchBar bind:searchQuery />
		<TokenList {tokens} {searchQuery} />
	{:else}
		<div class="flex h-[60vh] flex-col items-center justify-center text-center">
			<div class="space-y-4 text-gray-400">
				<button
					class="mx-auto transition-colors duration-300 hover:text-[#EB3912]"
					onclick={openAddTokenForm}
				>
					<PlusIcon class="h-20 w-20 opacity-70" />
				</button>
				<h2 class="text-xl font-medium">A bit empty here, isn't it?</h2>
				<p class="text-md mx-auto mb-2 max-w-xs">
					Get started by adding your first security token using the
					<button
						class="inline-flex items-center align-middle text-[#EB3912]"
						onclick={openAddTokenForm}
					>
						<PlusIcon class="inline-block h-[1em] w-[1em]" />
					</button> button.
				</p>
				<p class="text-md mx-auto max-w-xs">
					Or import tokens from another app at the Settings
					<a
						href="/settings"
						class="inline-flex items-center align-middle transition duration-800 ease-in-out hover:rotate-90 hover:text-[#EB3912]"
					>
						<Settings class="inline-block h-[1em] w-[1em]" />
					</a> page.
				</p>
			</div>
		</div>
	{/if}
</main>
