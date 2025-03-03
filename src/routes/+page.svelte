<script>
	import { PlusIcon, Settings } from 'lucide-svelte';
	import TokenList from '$lib/components/tokens/TokenList.svelte';
	import SearchBar from '$lib/components/tokens/SearchBar.svelte';
	import NavActions from '$lib/components/nav/NavActions.svelte';

	const { data } = $props();

	let searchQuery = $state('');
	let tokens = $derived(data.tokens);
</script>

<svelte:head>
	<title>Trezur</title>
	<meta name="description" content="Trezur app" />
</svelte:head>

<header class="mb-6 flex items-center justify-between">
	<h1 class="text-2xl font-medium">Trezur</h1>
	<NavActions sortButton newTokenButton />
</header>

<main>
	{#if tokens.length > 0}
		<SearchBar bind:searchQuery />
		<TokenList {tokens} {searchQuery} />
	{:else}
		<div class="flex h-[60vh] flex-col items-center justify-center text-center">
			<div class="space-y-4 text-gray-400">
				<button class="mx-auto transition-colors duration-300 hover:text-[#EB3912]">
					<PlusIcon class="h-20 w-20 opacity-70" />
					<!-- TODO: Wire in same button action as navaction new token button action -->
				</button>
				<h2 class="text-xl font-medium">A bit empty here, isn't it?</h2>
				<p class="text-md mx-auto mb-2 max-w-xs">
					Get started by adding your first security token using the
					<button class="inline-flex items-center align-middle text-[#EB3912]">
						<PlusIcon class="inline-block h-[1em] w-[1em]" />
						<!-- TODO: Wire in same button action as navaction new token button action -->
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
