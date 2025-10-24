<script>
	import '../app.css';
	import FooterNav from '$lib/components/nav/FooterNav.svelte';
	import { createSettingsContext } from '$lib/state/settings.svelte';
	import { createConditionsContext } from '$lib/state/conditions.svelte';
	import { browser } from '$app/environment';
	import { encryptedLocalStorage } from '$lib/state/storage.svelte';
	import { createTokensContext } from '$lib/state/tokens.svelte';
	import { untrack } from 'svelte';
	import { sessionPasscode } from '$lib/state/passcode.svelte';
	import UnlockScreen from '$lib/components/UnlockScreen.svelte';
	import { devconsole } from '$lib/utils';

	const { children, data } = $props();

	createSettingsContext(data.settings);
	createTokensContext();

	const conditionsContext = createConditionsContext(data.conditions);
	const conditions = $derived(conditionsContext.getConditions());

	$inspect('conditions.isAppLocked', conditions.isAppLocked); // for debugging
	$inspect('conditions.isUserPasscodeSet', conditions.isUserPasscodeSet); // for debugging
	$inspect('sessionPasscode.passcode', sessionPasscode.passcode); // for debugging

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
		$inspect.trace('encryptedLocalStorage init effect'); // for debugging

		if (browser) {
			const passkey = conditions.isUserPasscodeSet ? sessionPasscode.passcode : conditions.clientId;

			if (passkey) {
				devconsole.log('[Layout] Initializing encrypted local storage with passkey:', passkey);
				encryptedLocalStorage.init(passkey); // async method; not awaited

				return () => {
					// this is returned immediately; doesn't await initialization of encryptedLocalStorage
					devconsole.log('[Layout] Uninitializing encrypted local storage');
					encryptedLocalStorage.current = null;
				};
			}
		}
	});

	/**
	 * Lock the app if passcode is set and no session passcode is available
	 * @todo TODO: See if this can be simplified.
	 */
	$effect(() => {
		if (browser && conditions.isUserPasscodeSet && !sessionPasscode.passcode && !conditions.isAppLocked) {
			conditionsContext.updateCondition('isAppLocked', true);
		}
	});
</script>

<div class="min-h-screen bg-black p-4 text-white">
	<div class="mx-auto max-w-md">
		{#if conditions.isAppLocked}
			<UnlockScreen />
		{:else}
			{@render children()}
		{/if}

		<footer class="mt-24">
			<FooterNav toggleAppLockAction={(willLockApp) => willLockApp && sessionPasscode.clear()} />
		</footer>
	</div>
</div>
