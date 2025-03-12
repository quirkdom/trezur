<script>
	import '../app.css';
	import FooterNav from '$lib/components/nav/FooterNav.svelte';
	import { createSettingsContext } from '$lib/state/settings.svelte';
	import { createConditionsContext } from '$lib/state/conditions.svelte';
	import { browser } from '$app/environment';
	import { encryptedLocalStorage } from '$lib/state/storage.svelte';
	import { createTokensContext } from '$lib/state/tokens.svelte';

	const { children, data } = $props();

	createSettingsContext(data.settings);
	createTokensContext();

	const conditionsContext = createConditionsContext(data.conditions);
	const conditions = $derived(conditionsContext.getConditions());

	$effect(() => {
		if (browser && conditions.clientId && !encryptedLocalStorage.current) {
			encryptedLocalStorage.init(conditions.clientId); // async function; not awaited
		}
	});

	// $inspect('encryptedLocalStorage', encryptedLocalStorage);
</script>

<div class="min-h-screen bg-black p-4 text-white">
	<div class="mx-auto max-w-md">
		{@render children()}

		<footer>
			<FooterNav isLocked={conditions.isAppLocked} />
		</footer>
	</div>
</div>
