<script>
	import '../app.css';
	import { browser } from '$app/environment';
	import FooterNav from '$lib/components/nav/FooterNav.svelte';
	import { createSettingsContext } from '$lib/state/settings.svelte';
	import { createConditionsContext } from '$lib/state/conditions.svelte';
	import { isStorageAvailable, initStorage, clearStorage } from '$lib/state/storage.svelte';
	import UnlockScreen from '$lib/components/passcode/UnlockScreen.svelte';
	import { devconsole } from '$lib/utils';
	import { backupService } from '$lib/sync/backup.svelte';

	const { children, data } = $props();

	devconsole.log('+layout.js load data', data);

	const settingsContext = createSettingsContext(data.settings);

	/**
	 * @todo Why is backup service inited proactively? No need to init if no cloud service actually connected
	 */
	backupService.init(settingsContext);

	const conditionsContext = createConditionsContext(data.conditions);
	const conditions = $derived(conditionsContext.getConditions());

	$inspect('conditions.isAppLocked', conditions.isAppLocked); // for debugging
	$inspect('conditions.isUserPasscodeSet', conditions.isUserPasscodeSet); // for debugging
	$inspect('conditions.clientId', conditions.clientId); // for debugging

	/** @type {{ openPasscodeDialog: () => void } | null} */
	let unlockScreenRef = $state(null);

	// Cold start: no passcode, have clientId, no vault yet
	if (browser) {
		const { isUserPasscodeSet, clientId } = conditions;
		if (!isUserPasscodeSet && clientId && !isStorageAvailable()) {
			initStorage(clientId);
		}
	}

	// Auto-lock: passcode set but no crypto key present
	$effect(() => {
		const { isUserPasscodeSet, isAppLocked } = conditions;
		if (isUserPasscodeSet && !isStorageAvailable() && !isAppLocked) {
			clearStorage();
			conditionsContext.updateCondition('isAppLocked', true);
		}
	});

	/**
	 * @todo Look into this after you figure out why backup service is being inited proactively?
	 */
	$effect(() => {
		if (isStorageAvailable()) {
			backupService.loadFromStorage();
		}
	});

	async function handleToggleLock() {
		const { isAppLocked, isUserPasscodeSet, clientId } = conditions;

		if (isAppLocked) {
			if (!isUserPasscodeSet && clientId) {
				const ok = await initStorage(clientId);
				if (ok) conditionsContext.updateCondition('isAppLocked', false);
			} else {
				unlockScreenRef?.openPasscodeDialog();
			}
		} else {
			clearStorage();
			conditionsContext.updateCondition('isAppLocked', true);
		}
	}
</script>

<div class="min-h-screen bg-black p-4 text-white">
	<div class="mx-auto max-w-md">
		{#if conditions.isAppLocked}
			<UnlockScreen bind:this={unlockScreenRef} />
		{:else}
			{@render children()}
		{/if}

		<footer class="mt-24">
			<FooterNav onToggleLock={handleToggleLock} />
		</footer>
	</div>
</div>
