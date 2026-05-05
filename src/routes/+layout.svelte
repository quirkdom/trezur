<script>
	import '../app.css';
	import FooterNav from '$lib/components/nav/FooterNav.svelte';
	import { createSettingsContext } from '$lib/state/settings.svelte';
	import { createConditionsContext } from '$lib/state/conditions.svelte';
	import { browser } from '$app/environment';
	import { encryptedLocalStorage } from '$lib/state/storage.svelte';
	import { initStorageAndTokens } from '$lib/state/init';
	import { sessionPasscode } from '$lib/state/passcode.svelte';
	import UnlockScreen from '$lib/components/passcode/UnlockScreen.svelte';
	import { devconsole } from '$lib/utils';
	import { backupService } from '$lib/sync/backup.svelte';

	const { children, data } = $props();

	devconsole.log('+layout.js load data', data);

	const settingsContext = createSettingsContext(data.settings);
	backupService.init(settingsContext);

	const conditionsContext = createConditionsContext(data.conditions);
	const conditions = $derived(conditionsContext.getConditions());

	$inspect('conditions.isAppLocked', conditions.isAppLocked); // for debugging
	$inspect('conditions.isUserPasscodeSet', conditions.isUserPasscodeSet); // for debugging
	$inspect('conditions.clientId', conditions.clientId); // for debugging
	$inspect('sessionPasscode.passcode', sessionPasscode.passcode); // for debugging
	$inspect('encryptedLocalStorage.current', encryptedLocalStorage.current); // for debugging

	if (browser) {
		// One-shot ELS init on cold start (no passcode case).
		// Passcode case is handled by UnlockScreen.handleUnlock().
		// Post-reset re-init is handled explicitly by each reset call site.
		if (!conditions.isUserPasscodeSet && conditions.clientId && !encryptedLocalStorage.current) {
			initStorageAndTokens(conditions.clientId);
		}

		$effect(() => {
			if (encryptedLocalStorage.current) {
				backupService.loadFromStorage();
			}
		});

		/**
		 * Lock the app if passcode is set and no session passcode is available
		 * @todo TODO: See if this can be simplified.
		 */
		$effect(() => {
			$inspect.trace('[Layout] lock app effect'); // for debugging

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
