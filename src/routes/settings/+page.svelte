<script>
	import { dev, version } from '$app/environment';
	import { resolve } from '$app/paths';
	import { updated } from '$app/state';
	import NavActions from '$lib/components/nav/NavActions.svelte';
	import PasscodeDialog from '$lib/components/passcode/PasscodeDialog.svelte';
	import BackupSettingsSection from '$lib/components/sync/BackupSettingsSection.svelte';
	import ExportTokensDialog from '$lib/components/tokens/ExportTokens.svelte';
	import ImportTokensDialog from '$lib/components/tokens/ImportTokens.svelte';
	import Switch from '$lib/components/ui/Switch.svelte';
	import { useConditionsContext } from '$lib/state/conditions.svelte';
	import { keyManager } from '$lib/state/key-manager.svelte';
	import { useSettingsContext } from '$lib/state/settings.svelte';
	import { isStorageAvailable, purgeStorage } from '$lib/state/storage.svelte';
	import { tokensContext } from '$lib/state/tokens.svelte';
	import { backupService } from '$lib/sync/backup.svelte';
	import { devconsole } from '$lib/utils';

	const settingsContext = useSettingsContext();
	let settings = $derived(settingsContext.getSettings());

	const conditionsContext = useConditionsContext();
	let conditions = $derived(conditionsContext.getConditions());
	let nonAppleSwitchTheme = $derived(conditions.isAppleDevice ? '' : 'data-[state=on]:bg-[#EB3912]');

	let tokens = $derived(tokensContext.current?.getTokens() || []);

	let isBackupEnabled = $derived(conditions.isUserPasscodeSet && backupService.autoSyncEnabled);

	let showImportDialog = $state(false);
	let showExportDialog = $state(false);
	let showPasscodeDialog = $state(false);
	/** @type {'verify' | 'create' | 'change'} */
	let passcodeDialogMode = $state('create');
	/** @type {((value?: any) => void) | null} */
	let cloudSyncFlowResolve = null;
	/** @type {((reason?: any) => void) | null} */
	let cloudSyncFlowReject = null;

	function handleCloudSyncCancel() {
		if (cloudSyncFlowReject) {
			cloudSyncFlowReject(new Error('cancelled'));
		}
	}

	async function onRequestPasscode() {
		passcodeDialogMode = 'create';
		showPasscodeDialog = true;

		return new Promise((resolve, reject) => {
			cloudSyncFlowResolve = resolve;
			cloudSyncFlowReject = reject;
		});
	}

	/**
	 * @param {string} passcode
	 */
	async function handleSetPasscode(passcode) {
		try {
			if (!conditions.clientId) throw new Error('No device key present. Cannot set passcode. Please contact support.');

			if (keyManager.hasWrappedKey && conditions.isUserPasscodeSet)
				throw new Error('An existing passcode was found. Perhaps you want to change your passcode instead?');

			await keyManager.changePasscode(passcode);

			conditionsContext.updateCondition('isUserPasscodeSet', true);

			if (cloudSyncFlowResolve) {
				cloudSyncFlowResolve();
				cloudSyncFlowResolve = null;
				cloudSyncFlowReject = null;
			}
		} catch (err) {
			devconsole.error('[Passcode] Set failed:', err);
			alert('Failed to set passcode. Your data is unchanged — please try again.');
			if (cloudSyncFlowReject) {
				cloudSyncFlowReject(err);
			}
		}
	}

	/**
	 * @param {string} newPasscode
	 */
	async function handleChangePasscode(newPasscode) {
		try {
			if (!isStorageAvailable()) throw new Error('App must be unlocked to change passcode.');

			await keyManager.changePasscode(newPasscode);
		} catch (err) {
			devconsole.error('[Passcode] Change failed:', err);
			alert('Failed to change passcode. Your data is unchanged — please try again.');
		}
	}

	async function handleRemovePasscode() {
		if (
			prompt(
				'Remove passcode? Your tokens will be secured with a device-specific key instead. Type "YES" to confirm.',
				'NO'
			) !== 'YES'
		)
			return;

		try {
			if (!conditions.clientId)
				throw new Error('No device key present. Cannot remove passcode. Please contact support.');

			if (!isStorageAvailable()) throw new Error('App must be unlocked to remove passcode.');

			await keyManager.changePasscode(conditions.clientId);

			conditionsContext.updateCondition('isUserPasscodeSet', false);
		} catch (err) {
			devconsole.error('[Passcode] Remove failed:', err);
			alert('Failed to remove passcode. Your data is unchanged — please try again.');
		}
	}

	async function purgeAll() {
		if (
			prompt(
				'Are you sure? This will delete all data and reset the app. All tokens will be lost! Please type "YES" to confirm this action.',
				'NO'
			) !== 'YES'
		)
			return;

		purgeStorage();

		settingsContext.resetSettings();
		conditionsContext.resetConditions();

		// Full page reload — the layout's cold-start init path handles
		// generating a new clientId and re-initializing ELS from scratch.
		window.location.href = resolve('/');
	}

	/**
	 * @todo Do a dedupe check while adding new tokens
	 * @param { import('$lib/types').Token[] } tokens Set of newly discovered tokens awaiting import
	 */
	function handleImport(tokens) {
		if (tokens?.length) {
			if (!tokensContext.current) {
				devconsole.warn('App without valid Tokens context. Attempts to import tokens will fail.');
				return;
			}

			tokensContext.current.addTokens(...tokens);
			alert(`Successfully imported ${tokens.length} token${tokens.length !== 1 ? 's' : ''}.`);
		}
	}
</script>

<svelte:head>
	<title>Trezur · Settings</title>
	<meta name="description" content="Trezur app" />
</svelte:head>

<header class="mb-6 flex items-center gap-4">
	<NavActions backButtonTo="/" />
	<h1 class="text-2xl font-medium">Settings</h1>
</header>

<main>
	<div class="space-y-6">
		<section class="space-y-4">
			<h2 class="text-sm text-zinc-500 uppercase">Backup</h2>

			<BackupSettingsSection {onRequestPasscode} />

			<div class="flex gap-4">
				<button
					class="flex-1 rounded-lg bg-zinc-900 p-4 text-blue-500 transition-colors hover:bg-zinc-700"
					onclick={() => (showImportDialog = true)}
				>
					Import
				</button>
				<button
					class="flex-1 rounded-lg bg-zinc-900 p-4 text-blue-500 transition-colors hover:bg-zinc-700"
					onclick={() => (showExportDialog = true)}
				>
					Export
				</button>
			</div>
		</section>

		<section>
			<h2 class="mb-4 text-sm text-zinc-500 uppercase">Security</h2>
			<div class="divide-y divide-gray-800 rounded-lg bg-zinc-900">
				<div class="flex items-center justify-between p-4">
					<div>
						<div>Use passcode</div>
						<div class="text-sm text-zinc-500">
							{conditions.isUserPasscodeSet ? 'Passcode is set' : 'No passcode set'}
						</div>
					</div>
					<div class="flex flex-wrap justify-end gap-2">
						{#if conditions.isUserPasscodeSet}
							<button
								class="rounded-lg bg-zinc-800 px-4 py-2 text-sm text-blue-500 transition-colors hover:bg-zinc-700"
								onclick={() => {
									passcodeDialogMode = 'change';
									showPasscodeDialog = true;
								}}
							>
								Change
							</button>
							<button
								class="rounded-lg bg-zinc-800 px-4 py-2 text-sm text-red-500 transition-colors enabled:hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
								onclick={handleRemovePasscode}
								disabled={isBackupEnabled}
								// TODO: Find a better way to show this explanation. This is not visible on mobile.
								title="Passcode cannot be removed while backup is enabled. Please disable backup first."
							>
								Remove
							</button>
						{:else}
							<button
								class="rounded-lg bg-zinc-800 px-4 py-2 text-sm text-blue-500 transition-colors hover:bg-zinc-700"
								onclick={() => {
									passcodeDialogMode = 'create';
									showPasscodeDialog = true;
								}}
							>
								Set Passcode
							</button>
						{/if}
					</div>
				</div>
				<div class="flex items-center justify-between p-4">
					<span>Use biometrics to unlock <sup class="text-xs text-zinc-500">&nbsp; Coming Soon</sup></span>
					<Switch
						disabled
						checked={settings.useBiometricUnlock}
						onCheckedChange={(/** @type {boolean} */ checked) =>
							settingsContext.updateSetting('useBiometricUnlock', checked)}
						class={nonAppleSwitchTheme}
					/>
				</div>
			</div>
		</section>

		<section>
			<h2 class="mb-4 text-sm text-zinc-500 uppercase">Preferences</h2>
			<div class="divide-y divide-gray-800 rounded-lg bg-zinc-900">
				<div class="flex items-center justify-between p-4">
					<span>Show next token</span>
					<Switch
						disabled={conditions.isAppLocked}
						checked={settings.showNextCode}
						onCheckedChange={(/** @type {boolean} */ checked) => settingsContext.updateSetting('showNextCode', checked)}
						class={nonAppleSwitchTheme}
					/>
				</div>
			</div>
		</section>

		<section class="space-y-2">
			<!-- <button
				class="hidden w-full rounded-lg bg-zinc-900 p-4 text-blue-500"
				onclick={() => (conditions.isAppLocked = !conditions.isAppLocked)}
			>
				{conditions.isAppLocked ? 'Unlock' : 'Lock'}
			</button> -->
			<button
				class="w-full rounded-lg bg-zinc-900 p-4 text-red-500 transition-colors hover:bg-zinc-700"
				onclick={purgeAll}
			>
				Delete all app data
			</button>
		</section>

		{#if updated.current}
			<section>
				<div class="rounded-lg bg-zinc-900 p-4">
					<div class="flex items-center justify-between">
						<span>New version available!</span>
						<button class="rounded-lg bg-zinc-900 text-left text-blue-500" onclick={() => location.reload()}>
							Update now
						</button>
					</div>
				</div>
			</section>
		{/if}

		<p class="space-y-2 text-center text-sm text-zinc-500">
			Trezur v{version}
			{dev ? '[DEV]' : ''} <br />
			Favicon: Key by Bucky Clarke from
			<a href="https://thenounproject.com/browse/icons/term/key/" target="_blank" title="Key Icons">Noun Project</a>
			(CC BY 3.0). Color modified to orange. <br />
			Made with ❤️ and ✨ at <a href="https://www.quirkdom.com" target="_blank">Quirkdom</a>
		</p>
	</div>
</main>

<ImportTokensDialog bind:open={showImportDialog} {handleImport} />

<ExportTokensDialog bind:open={showExportDialog} {tokens} />

<PasscodeDialog
	bind:open={showPasscodeDialog}
	mode={passcodeDialogMode}
	onSuccess={passcodeDialogMode === 'create' ? handleSetPasscode : handleChangePasscode}
	onCancel={handleCloudSyncCancel}
/>
