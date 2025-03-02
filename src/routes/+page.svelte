<script>
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
	<SearchBar bind:searchQuery />
	<TokenList {tokens} {searchQuery} />
</main>
