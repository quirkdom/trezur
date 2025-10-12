<script>
	import '../app.css';
	import FooterNav from '$lib/components/nav/FooterNav.svelte';
	import { createSettingsContext } from '$lib/state/settings.svelte';
	import { createConditionsContext } from '$lib/state/conditions.svelte';
	import { browser } from '$app/environment';
	import { encryptedLocalStorage } from '$lib/state/storage.svelte';
	import { createTokensContext } from '$lib/state/tokens.svelte';
	import { untrack } from 'svelte';

	const { children, data } = $props();

	createSettingsContext(data.settings);
	createTokensContext();

	const conditionsContext = createConditionsContext(data.conditions);
	const conditions = $derived(conditionsContext.getConditions());

	/**
	 * Updates conditions context with conditions derived from load-time data.
	 * We have to untrack this to avoid infinite loop with the next effect.
	 */
	$effect(() => {
		if (browser && data.conditions)
			untrack(() => conditionsContext.updateConditions(data.conditions));
	});

	/**
	 * Initializes encrypted local storage with the client ID from conditions context.
	 * This will first run when client ID has been updated in conditions context (in the previous effect).
	 */
	$effect(() => {
		if (browser && conditions.clientId) encryptedLocalStorage.init(conditions.clientId); // async function; not awaited
	});
</script>

<div class="min-h-screen bg-black p-4 text-white">
	<div class="mx-auto max-w-md">
		{@render children()}

		<footer class="mt-24">
			<FooterNav isLocked={conditions.isAppLocked} isAppleDevice={conditions.isAppleDevice} />
		</footer>
	</div>
</div>
