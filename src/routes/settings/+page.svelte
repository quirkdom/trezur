<script>
	import { dev, version } from '$app/environment';
	import { resolve } from '$app/paths';
	import { updated } from '$app/state';
	import NavActions from '$lib/components/nav/NavActions.svelte';
	import PasscodeDialog from '$lib/components/passcode/PasscodeDialog.svelte';
	import RecoveryKit from '$lib/components/sync/RecoveryKit.svelte';
	import RecoveryScannerDialog from '$lib/components/sync/RecoveryScannerDialog.svelte';
	import ExportTokensDialog from '$lib/components/tokens/ExportTokens.svelte';
	import ImportTokensDialog from '$lib/components/tokens/ImportTokens.svelte';
	import Switch from '$lib/components/ui/Switch.svelte';
	import { useConditionsContext } from '$lib/state/conditions.svelte';
	import { keyManager } from '$lib/state/key-manager.svelte';
	import { useSettingsContext } from '$lib/state/settings.svelte';
	import { getLocalVault, isStorageAvailable, purgeStorage } from '$lib/state/storage.svelte';
	import { tokensContext } from '$lib/state/tokens.svelte';
	import { backupService } from '$lib/sync/backup.svelte';
	import { devconsole } from '$lib/utils';

	import { driveClient } from '$lib/sync/drive.svelte';
	import { ChevronDown } from '@lucide/svelte';
	import { cubicInOut } from 'svelte/easing';
	import { slide } from 'svelte/transition';

	const settingsContext = useSettingsContext();
	let settings = $derived(settingsContext.getSettings());

	const conditionsContext = useConditionsContext();
	let conditions = $derived(conditionsContext.getConditions());
	let nonAppleSwitchTheme = $derived(conditions.isAppleDevice ? '' : 'data-[state=on]:bg-[#EB3912]');

	let tokens = $derived(tokensContext.current?.getTokens() || []);

	let showImportDialog = $state(false);
	let showExportDialog = $state(false);
	let showPasscodeDialog = $state(false);
	/** @type {'verify' | 'create' | 'change'} */ let passcodeDialogMode = $state('create');

	let whileAttemptingToConnectGDrive = $state(false);
	let showRecoveryKit = $state(false);
	let isInitialBackup = $state(true);
	/** @type {string[]} */
	let recoveryWords = $state([]);
	let showRecoveryScanner = $state(false);

	let isBackupEnabled = $derived(conditions.isUserPasscodeSet && backupService.autoSyncEnabled);

	let backupStatus = $derived.by(() => {
		if (whileAttemptingToConnectGDrive) return null;

		if (backupService.lastError) {
			// Check for critical auth errors
			if (/(token|auth|refresh|sign in)/.test(backupService.lastError.toLowerCase()))
				return { state: 'error', color: 'bg-red-500', message: 'Signed Out' };

			return { state: 'warning', color: 'bg-yellow-500', message: 'Sync Error' };
		}

		const lastSync = settings.lastSyncTime || 0;
		// If never synced or synced more than 1 hour ago
		if (!lastSync || Date.now() - lastSync > 60 * 60 * 1000) {
			return { state: 'warning', color: 'bg-yellow-500', message: 'Sync Overdue' };
		}

		return { state: 'ok', color: 'bg-green-500', message: 'Active' };
	});

	let isBackupDetailsOpen = $derived(
		backupStatus && (backupStatus.state === 'error' || backupStatus.message.toLowerCase().includes('error'))
	);

	/**
	 * @param {number} timestamp
	 */
	function getRelativeSyncTime(timestamp) {
		if (!timestamp) return 'Never synced';

		const diff = Date.now() - timestamp;
		const seconds = Math.floor(diff / 1000);
		const minutes = Math.floor(seconds / 60);
		const hours = Math.floor(minutes / 60);

		if (hours >= 2) return 'a long time ago.';
		if (hours >= 1) return 'an hour ago.';
		if (minutes >= 2) return 'a few minutes ago.';
		return 'a few seconds ago.';
	}

	async function attemptToConnectGDrive() {
		whileAttemptingToConnectGDrive = true;
		if (!conditions.isUserPasscodeSet) {
			alert('Please set an App Passcode first in the Security section.');
			passcodeDialogMode = 'create';
			showPasscodeDialog = true;
			isBackupEnabled = false;
			whileAttemptingToConnectGDrive = false;
			return;
		}

		try {
			await driveClient.signIn();

			const backupExists = await backupService.checkCloudBackupExists();
			if (backupExists) {
				showRecoveryScanner = true;
			} else {
				recoveryWords = await backupService.getMnemonic();
				isInitialBackup = true;
				showRecoveryKit = true;
			}
		} catch (e) {
			alert('Failed to enable backup: ' + e);
			driveClient.signOut();
			backupService.disable();
			whileAttemptingToConnectGDrive = false;
		}
	}

	/** @param {string[]} words */
	async function handleRecoveryScannerComplete(words) {
		try {
			const isValid = await backupService.verifyCloudBackupMnemonic(words);
			if (isValid) {
				await backupService.adoptCloudBackup(words);
				alert('Cloud backup linked successfully!');
			} else {
				alert('Incorrect recovery phrase. Backup could not be linked.');
				driveClient.signOut();
				backupService.disable();
			}
		} catch (e) {
			alert('Error verifying phrase: ' + e);
			driveClient.signOut();
			backupService.disable();
		}
		whileAttemptingToConnectGDrive = false;
	}

	async function handleRecoveryKitConfirm() {
		try {
			if (isInitialBackup) {
				await backupService.enable();
				alert('Backup enabled and initial sync completed!');
			}
		} catch (e) {
			alert('Failed to enable backup: ' + e);
			driveClient.signOut();
			backupService.disable();
		}
		whileAttemptingToConnectGDrive = false;
	}

	async function showDeviceRecoveryKit() {
		try {
			recoveryWords = await backupService.getMnemonic();
			isInitialBackup = false;
			showRecoveryKit = true;
		} catch (e) {
			alert('Failed to show recovery kit: ' + e);
		}
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

			const tokenCount = tokensContext.current?.getTokens().length || 0;
			alert(
				'Passcode set successfully!' +
					(tokenCount > 0 ? ` ${tokenCount} token${tokenCount > 1 ? 's' : ''} secured.` : '')
			);
		} catch (err) {
			devconsole.error('[Passcode] Set failed:', err);
			alert('Failed to set passcode. Your data is unchanged — please try again.');
		}
	}

	/**
	 * @param {string} newPasscode
	 */
	async function handleChangePasscode(newPasscode) {
		try {
			if (!isStorageAvailable()) throw new Error('App must be unlocked to change passcode.');

			await keyManager.changePasscode(newPasscode);

			const tokenCount = tokensContext.current?.getTokens().length || 0;
			alert(
				'Passcode changed successfully!' +
					(tokenCount > 0 ? ` ${tokenCount} token${tokenCount > 1 ? 's' : ''} secured.` : '')
			);
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

			const tokenCount = tokensContext.current?.getTokens().length || 0;
			alert(
				'Passcode removed successfully!' +
					(tokenCount > 0 ? ` ${tokenCount} token${tokenCount > 1 ? 's' : ''} secured with a device-specific key.` : '')
			);
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

			<!-- <div class="divide-y divide-gray-800 rounded-lg bg-zinc-900">
				<div class="flex items-center justify-between p-4">
					<span>iCloud Backup <sup class="text-xs text-zinc-500">&nbsp; Coming Soon</sup></span>
					<Switch disabled checked={false} class={nonAppleSwitchTheme} />
				</div>
				<div class="flex items-center justify-between p-4">
					<span>Last Synced</span>
					<span class="text-zinc-500">Never</span>
				</div>
			</div> -->

			<div class="divide-y divide-gray-800 rounded-lg bg-zinc-900">
				<div class="flex items-center justify-between p-4">
					<span>Google Drive Backup</span>
					{#key whileAttemptingToConnectGDrive}
						<!-- We have to do this to ensure the switch is re-rendered to the correct state even when the async connection process doesn't necessarily complete -->
						<Switch
							checked={isBackupEnabled}
							onCheckedChange={async (toBeChecked) => {
								if (toBeChecked) {
									// Turning ON
									await attemptToConnectGDrive();
								} else {
									// Turning OFF
									await backupService.disable();
									driveClient.signOut();
								}
							}}
						/>
					{/key}
				</div>
				{#if isBackupEnabled}
					<div class="flex flex-col gap-4 p-4">
						<button
							class="flex w-full items-center justify-between text-left"
							onclick={() => (isBackupDetailsOpen = !isBackupDetailsOpen)}
						>
							<div class="flex items-center gap-3">
								{#if backupStatus}
									<div
										class="h-2.5 w-2.5 rounded-full {backupStatus.color} shadow-[0_0_8px] shadow-{backupStatus.color}/50"
									></div>
								{/if}
								<div class="flex flex-col">
									<span class="text-sm text-zinc-300">
										Last synced
										<abbr title={settings.lastSyncTime ? new Date(settings.lastSyncTime).toLocaleString() : ''}>
											{getRelativeSyncTime(settings.lastSyncTime || 0)}
										</abbr>
									</span>
								</div>
							</div>
							<div class="transition-transform duration-200" class:rotate-180={isBackupDetailsOpen}>
								<ChevronDown size={16} />
							</div>
						</button>

						{#if isBackupDetailsOpen}
							<div transition:slide={{ duration: 200, easing: cubicInOut }} class="space-y-4">
								{#if backupStatus?.state === 'error'}
									<div class="px-2 text-xs text-red-400">Could not sign in to Google Drive. Please reconnect.</div>
								{:else if backupStatus?.state === 'warning' && backupService.lastError}
									<div class="px-2 text-xs break-all text-yellow-500">
										Error: {backupService.lastError}
									</div>
								{/if}

								<div class="flex gap-2">
									{#if backupStatus?.state === 'error'}
										<button
											class="flex-1 rounded-lg bg-zinc-800 px-4 py-2 text-sm text-red-500 transition-colors hover:bg-zinc-700"
											onclick={attemptToConnectGDrive}
										>
											Reconnect
										</button>
									{:else}
										<button
											class="flex-1 rounded-lg bg-zinc-800 px-4 py-2 text-sm text-blue-500 transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
											disabled={backupService.isSyncing}
											onclick={() => backupService.sync()}
										>
											{backupService.isSyncing ? 'Syncing...' : 'Sync Now'}
										</button>
										<button
											class="flex-1 rounded-lg bg-zinc-800 px-4 py-2 text-sm text-blue-500 transition-colors hover:bg-zinc-700"
											onclick={showDeviceRecoveryKit}
										>
											Link Devices
										</button>
									{/if}
								</div>
							</div>
						{/if}
					</div>
				{/if}
			</div>

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
								class="rounded-lg bg-zinc-800 px-4 py-2 text-sm text-red-500 transition-colors hover:bg-zinc-700"
								onclick={handleRemovePasscode}
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
			<button
				class="hidden w-full rounded-lg bg-zinc-900 p-4 text-blue-500"
				onclick={() => (conditions.isAppLocked = !conditions.isAppLocked)}
			>
				{conditions.isAppLocked ? 'Unlock' : 'Lock'}
			</button>
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
/>

<RecoveryKit bind:open={showRecoveryKit} words={recoveryWords} {isInitialBackup} onConfirm={handleRecoveryKitConfirm} />

<RecoveryScannerDialog bind:open={showRecoveryScanner} onWordsComplete={handleRecoveryScannerComplete} />
