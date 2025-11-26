<script>
	import NavActions from '$lib/components/nav/NavActions.svelte';
	import Switch from '$lib/components/ui/Switch.svelte';
	import ImportTokensDialog from '$lib/components/tokens/ImportTokens.svelte';
	import ExportTokensDialog from '$lib/components/tokens/ExportTokens.svelte';
	import PasscodeDialog from '$lib/components/passcode/PasscodeDialog.svelte';
	import { dev, version } from '$app/environment';
	import { useSettingsContext } from '$lib/state/settings.svelte';
	import { useConditionsContext } from '$lib/state/conditions.svelte';
	import { tokensContext } from '$lib/state/tokens.svelte';
	import { devconsole } from '$lib/utils';
	import { updated } from '$app/state';
	import { sessionPasscode } from '$lib/state/passcode.svelte';
	import { encryptedLocalStorage } from '$lib/state/storage.svelte';
	import { resolve } from '$app/paths';

	import { driveClient } from '$lib/utils/drive.svelte';
	import { backupService } from '$lib/state/backup.svelte';

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

	let showBackupPasscodeDialog = $state(false);
	let isRestoring = $state(false);
	let whileAttemptingToConnectGDrive = $state(false);
	let isBackupEnabled = $derived(conditions.isUserPasscodeSet && backupService.autoSyncEnabled);

	$inspect('isBackupEnabled', isBackupEnabled); // for debugging
	$inspect('driveClient.isSignedIn', driveClient.isSignedIn); // for debugging
	$inspect('backupService.autoSyncEnabled', backupService.autoSyncEnabled); // for debugging

	async function attemptToConnectGDrive() {
		whileAttemptingToConnectGDrive = true;
		// Turning ON
		if (!conditions.isUserPasscodeSet) {
			alert('Please set an App Passcode first in the Security section.');

			passcodeDialogMode = 'create';
			showPasscodeDialog = true;

			isBackupEnabled = false;
			return;
		}

		alert(
			'Your App Passcode will be used to encrypt the backup. If you have a previous backup, ensure your current passcode matches the one used previously.'
		);

		try {
			await driveClient.signIn();
			await backupService.enable();
			alert('Backup enabled and initial sync completed!');
		} catch (e) {
			alert('Failed to enable backup: ' + e);
			driveClient.signOut();
			backupService.disable();
		}

		whileAttemptingToConnectGDrive = false;
	}

	/**
	 * @param {string} passcode
	 */
	async function handleBackupPasscode(passcode) {
		if (isRestoring) {
			try {
				await backupService.restore(passcode);
				alert('Restore completed successfully!');
			} catch (e) {
				alert('Restore failed: ' + e);
			}
		}
		isRestoring = false;
	}

	/**
	 * @param {string} passcode
	 */
	async function handleSetPasscode(passcode) {
		try {
			if (!conditions.clientId) throw new Error('No device key present. Cannot set passcode. Please contact support.');

			if (sessionPasscode.passcode)
				throw new Error('An existing passcode was found. Perhaps you want to change your passcode instead?');

			await encryptedLocalStorage.rewrapMSK(passcode, conditions.clientId);

			// Commit session state only after successful re-wrap
			sessionPasscode.passcode = passcode;
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
			if (!sessionPasscode.passcode)
				throw new Error('No prior passcode available to change. Perhaps you want to set a new passcode instead?');

			await encryptedLocalStorage.rewrapMSK(newPasscode, sessionPasscode.passcode);

			// Commit session state only after successful re-wrap
			sessionPasscode.passcode = newPasscode;

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
				'Remove passcode? Your tokens will be encrypted with a device-specific key instead. Type "YES" to confirm.',
				'NO'
			) !== 'YES'
		)
			return;

		try {
			if (!conditions.clientId)
				throw new Error('No device key present. Cannot remove passcode. Please contact support.');

			if (!sessionPasscode.passcode)
				throw new Error('Existing passcode not found. Perhaps you want to set a passcode instead?');

			await encryptedLocalStorage.rewrapMSK(conditions.clientId, sessionPasscode.passcode);

			// Commit session state only after successful re-wrap
			conditionsContext.updateCondition('isUserPasscodeSet', false);
			sessionPasscode.clear();

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

		// Reset all user state
		settingsContext.resetSettings();
		await tokensContext.resetTokens();
		await encryptedLocalStorage.reset(true);
		sessionPasscode.clear();
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
				<div class="flex flex-col gap-4 p-4">
					<div class="flex items-center justify-between">
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

					{#if driveClient.isSignedIn}
						<div class="flex items-center justify-between">
							<span class="text-sm text-zinc-400">Status</span>
							<span class="text-sm text-green-500">Active</span>
						</div>
						<div class="flex items-center justify-between">
							<span class="text-sm text-zinc-400">Last Synced</span>
							<span class="text-sm text-zinc-300">
								{settings.lastSyncTime ? new Date(settings.lastSyncTime).toLocaleString() : 'Never'}
							</span>
						</div>
						<div class="flex gap-2">
							<button
								class="flex-1 rounded-lg bg-zinc-800 px-4 py-2 text-sm text-blue-500 transition-colors hover:bg-zinc-700 disabled:opacity-50"
								disabled={backupService.isSyncing}
								onclick={() => backupService.sync()}
							>
								{backupService.isSyncing ? 'Syncing...' : 'Sync Now'}
							</button>
							<button
								class="flex-1 rounded-lg bg-zinc-800 px-4 py-2 text-sm text-blue-500 transition-colors hover:bg-zinc-700"
								onclick={() => {
									passcodeDialogMode = 'verify';
									showBackupPasscodeDialog = true;
									isRestoring = true;
								}}
							>
								Restore
							</button>
						</div>
					{/if}
				</div>
			</div>

			<div class="flex gap-4">
				<button
					class="w-full rounded-lg bg-zinc-900 p-4 text-center text-blue-500 transition-colors hover:bg-zinc-700"
					onclick={() => (showImportDialog = true)}
				>
					Import
				</button>
				<button
					class="w-full rounded-lg bg-zinc-900 p-4 text-center text-blue-500 transition-colors hover:bg-zinc-700"
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
					<div class="flex gap-2">
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

<PasscodeDialog bind:open={showBackupPasscodeDialog} mode={passcodeDialogMode} onSuccess={handleBackupPasscode} />
