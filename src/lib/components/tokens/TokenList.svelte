<script>
	import { useSettingsContext } from '../../state/settings.svelte';
	import TokenCard from './TokenCard.svelte';

	const { tokens = [], searchQuery = '' } = $props();

	const settings = $derived(useSettingsContext().getSettings());

	const filteredTokens = $derived.by(() => {
		let filtered = tokens.filter(
			(/** @type {import('$lib/types').Token} */ token) =>
				token.issuer.toLowerCase().includes(searchQuery.toLowerCase()) ||
				token.account.toLowerCase().includes(searchQuery.toLowerCase())
		);

		if (!settings.sortOrder || settings.sortOrder === 'none') return filtered;

		return filtered.toSorted((a, b) =>
			settings.sortOrder === 'asc'
				? a.issuer.localeCompare(b.issuer)
				: b.issuer.localeCompare(a.issuer)
		);
	});
</script>

<div class="space-y-4">
	{#each filteredTokens as token (token)}
		<TokenCard {...token} showNextCode={settings.showNextCode} />
	{/each}
</div>
