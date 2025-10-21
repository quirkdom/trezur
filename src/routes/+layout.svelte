<script>
	import '../app.css';
	import FooterNav from '$lib/components/nav/FooterNav.svelte';
	import { createSettingsContext } from '$lib/state/settings.svelte';
	import { createConditionsContext } from '$lib/state/conditions.svelte';
	import { browser } from '$app/environment';
	import { encryptedLocalStorage } from '$lib/state/storage.svelte';
	import { createTokensContext, useTokensContext } from '$lib/state/tokens.svelte';
	import { untrack } from 'svelte';
	import { getSessionPasscode } from '$lib/state/passcode.svelte';
	import UnlockScreen from '$lib/components/UnlockScreen.svelte';

	const { children, data } = $props();

	createSettingsContext(data.settings);
	const tokensContext = createTokensContext();

	const conditionsContext = createConditionsContext(data.conditions);
	const conditions = $derived(conditionsContext.getConditions());

	/**
	 * Updates conditions context with conditions derived from load-time data.
	 * We have to untrack this to avoid infinite loop with the next effect.
	 */
	$effect(() => {
		if (browser && data.conditions) untrack(() => conditionsContext.updateConditions(data.conditions));
	});

	/**
	 * Initializes encrypted local storage.
	 * - If passcode is set: uses passcode from session (requires unlock)
	 * - Otherwise: uses clientId
	 */
	$effect(() => {
		if (browser) {
			const passkey = conditions.isUserPasscodeSet ? getSessionPasscode() : conditions.clientId;

			if (passkey) {
				encryptedLocalStorage.init(passkey);
			}
		}
	});

	/**
	 * Lock the app if passcode is set and no session passcode is available
	 */
	$effect(() => {
		if (browser && conditions.isUserPasscodeSet && !getSessionPasscode() && !conditions.isAppLocked) {
			conditionsContext.updateCondition('isAppLocked', true);
		}
	});
</script>

{#if conditions.isAppLocked && conditions.isUserPasscodeSet}
	<UnlockScreen />
{:else}
	<div class="min-h-screen bg-black p-4 text-white">
		<div class="mx-auto max-w-md">
			{@render children()}

			<footer class="mt-24">
				<FooterNav isLocked={conditions.isAppLocked} isAppleDevice={conditions.isAppleDevice} />
			</footer>
		</div>
	</div>
{/if}
