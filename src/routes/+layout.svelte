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
	import UnlockScreen from '$lib/components/passcode/UnlockScreen.svelte';
	import { devconsole } from '$lib/utils';

	const { children, data } = $props();

	devconsole.log('+layout.js load data', data);

	createSettingsContext(data.settings);
	createTokensContext();

	const conditionsContext = createConditionsContext(data.conditions);
	const conditions = $derived(conditionsContext.getConditions());

	$inspect('conditions.isAppLocked', conditions.isAppLocked); // for debugging
	$inspect('conditions.isUserPasscodeSet', conditions.isUserPasscodeSet); // for debugging
	$inspect('conditions.clientId', conditions.clientId); // for debugging
	$inspect('sessionPasscode.passcode', sessionPasscode.passcode); // for debugging
	$inspect('encryptedLocalStorage.current', encryptedLocalStorage.current); // for debugging

	if (browser) {
		$effect(() => {
			$inspect.trace('Layout update conditions effect'); // for debugging

			if (data.conditions) untrack(() => conditionsContext.updateConditions(data.conditions));
		});

		$effect(() => {
			$inspect.trace('Layout ELS init effect'); // for debugging

			if (!conditions.isUserPasscodeSet && conditions.clientId && !encryptedLocalStorage.current)
				encryptedLocalStorage.init(conditions.clientId);
		});

		/**
		 * Lock the app if passcode is set and no session passcode is available
		 * @todo TODO: See if this can be simplified.
		 */
		$effect(() => {
			$inspect.trace('Layout lock app effect'); // for debugging

			if (conditions.isUserPasscodeSet && !sessionPasscode.passcode && !conditions.isAppLocked)
				conditionsContext.updateCondition('isAppLocked', true);
		});
	}
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
