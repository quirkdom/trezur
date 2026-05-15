<script>
	import { LoaderCircle, ChevronDown } from '@lucide/svelte';
	import { slide } from 'svelte/transition';
	import { cubicInOut } from 'svelte/easing';
	import Switch from '../ui/Switch.svelte';
	import RecoveryKit from './RecoveryKit.svelte';
	import RecoveryScannerDialog from './RecoveryScannerDialog.svelte';
	import { backupService } from '$lib/sync/backup.svelte';
	import { driveClient } from '$lib/sync/gdrive';
	import { useConditionsContext } from '$lib/state/conditions.svelte';
	import { useSettingsContext } from '$lib/state/settings.svelte';
	import { rotateMSK } from '$lib/state/storage.svelte';

	/**
	 * @type {{ onRequestPasscode: () => Promise<void> }}
	 */
	let { onRequestPasscode } = $props();

	const settingsContext = useSettingsContext();
	let settings = $derived(settingsContext.getSettings());
	const conditionsContext = useConditionsContext();
	let conditions = $derived(conditionsContext.getConditions());
	let nonAppleSwitchTheme = $derived(conditions.isAppleDevice ? '' : 'data-[state=on]:bg-[#EB3912]');

	/** @type {'gdrive' | 'icloud' | null} */
	let connectingProvider = $state(null);
	let showRecoveryKit = $state(false);
	let isInitialBackup = $state(true);
	/** @type {string[]} */
	let recoveryWords = $state([]);
	let showRecoveryScanner = $state(false);

	/** @type {string | null} */
	let onboardingError = $state(null);

	/** @type {((value?: any) => void) | null} */
	let cloudSyncFlowResolve = null;
	/** @type {((reason?: any) => void) | null} */
	let cloudSyncFlowReject = null;

	let isBackupEnabled = $derived(conditions.isUserPasscodeSet && backupService.autoSyncEnabled);

	let backupStatus = $derived.by(() => {
		if (connectingProvider) return null;

		if (onboardingError) {
			return { state: 'error', color: 'bg-red-500', message: 'Setup Failed', details: onboardingError };
		}

		if (backupService.lastError) {
			const errLower = backupService.lastError.toLowerCase();
			if (/(token|auth|refresh|sign in|unauthorized|forbidden|credentials)/.test(errLower)) {
				return { state: 'error', color: 'bg-red-500', message: 'Signed Out', details: backupService.lastError };
			}
			return { state: 'warning', color: 'bg-yellow-500', message: 'Sync Error', details: backupService.lastError };
		}

		const lastSync = settings.lastSyncTime || 0;
		if (lastSync && Date.now() - lastSync > 60 * 60 * 1000) {
			return {
				state: 'warning',
				color: 'bg-yellow-500',
				message: 'Sync Overdue',
				details: 'Sync is overdue. Please check your connection or sync manually.'
			};
		}

		return { state: 'ok', color: 'bg-green-500', message: 'Active' };
	});

	let showBackupDetails = $derived(
		!!(backupStatus && (backupStatus.state === 'error' || backupStatus.state === 'warning'))
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

	function handleCloudSyncCancel() {
		if (cloudSyncFlowReject) {
			cloudSyncFlowReject(new Error('cancelled'));
		}
	}

	/**
	 * @param {'gdrive' | 'icloud'} provider
	 */
	async function attemptToConnectCloud(provider) {
		if (connectingProvider) return;
		connectingProvider = provider;
		onboardingError = null;

		try {
			if (!conditions.isUserPasscodeSet) {
				await onRequestPasscode();
			}

			if (provider === 'gdrive') {
				await driveClient.signIn();
			}

			const backupExists = await backupService.checkCloudBackupExists();
			if (backupExists) {
				showRecoveryScanner = true;
				const words = await /** @type {Promise<string[]>} */ (
					new Promise((resolve, reject) => {
						cloudSyncFlowResolve = resolve;
						cloudSyncFlowReject = reject;
					})
				);

				const isValid = await backupService.verifyCloudBackupMnemonic(words);
				if (isValid) {
					await backupService.adoptCloudBackup(words);
				} else {
					throw new Error('Incorrect recovery phrase. Backup could not be linked.');
				}
			} else {
				await rotateMSK();

				await showDeviceRecoveryKit(true);

				await new Promise((resolve, reject) => {
					cloudSyncFlowResolve = resolve;
					cloudSyncFlowReject = reject;
				});

				await backupService.enable();
			}
		} catch (/** @type {any} */ e) {
			if (e.message !== 'cancelled') {
				onboardingError = e.message || String(e);
			}

			if (provider === 'gdrive') {
				driveClient.signOut();
			}
			backupService.disable();
		} finally {
			connectingProvider = null;
			cloudSyncFlowResolve = null;
			cloudSyncFlowReject = null;
		}
	}

	/** @param {string[]} words */
	function handleRecoveryScannerComplete(words) {
		if (cloudSyncFlowResolve) {
			cloudSyncFlowResolve(words);
			cloudSyncFlowResolve = null;
			cloudSyncFlowReject = null;
		}
	}

	function handleRecoveryKitConfirm() {
		if (cloudSyncFlowResolve) {
			cloudSyncFlowResolve();
			cloudSyncFlowResolve = null;
			cloudSyncFlowReject = null;
		}
	}

	async function showDeviceRecoveryKit(isInitial = false) {
		try {
			recoveryWords = await backupService.getMnemonic();
			isInitialBackup = isInitial;
			showRecoveryKit = true;
		} catch (e) {
			alert('Failed to show recovery kit: ' + e);
		}
	}
</script>

<div class="divide-y divide-gray-800 rounded-lg bg-zinc-900">
	<div class="flex items-center justify-between p-4">
		<span>Google Drive Backup</span>
		{#if connectingProvider === 'gdrive'}
			<div class="flex h-6 w-10 items-center justify-center">
				<LoaderCircle size={20} class="animate-spin text-zinc-400" />
			</div>
		{:else}
			<Switch
				checked={isBackupEnabled}
				onCheckedChange={async (toBeChecked) => {
					if (toBeChecked) {
						await attemptToConnectCloud('gdrive');
					} else {
						await backupService.disable();
						driveClient.signOut();
					}
				}}
				class={nonAppleSwitchTheme}
			/>
		{/if}
	</div>
	{#if isBackupEnabled || onboardingError}
		<div class="flex flex-col gap-4 p-4">
			{#if isBackupEnabled}
				<button
					class="flex w-full items-center justify-between text-left"
					onclick={() => (showBackupDetails = !showBackupDetails)}
				>
					<div class="flex items-center gap-3">
						{#if backupService.isSyncing}
							<LoaderCircle size={14} class="animate-spin text-zinc-400" />
						{:else if backupStatus}
							<div
								class="h-2.5 w-2.5 rounded-full {backupStatus.color} shadow-[0_0_8px] shadow-{backupStatus.color}/50"
							></div>
						{/if}
						<div class="flex flex-col">
							{#if backupService.isSyncing}
								<span class="text-sm text-zinc-300">Syncing...</span>
							{:else}
								<span class="text-sm text-zinc-300">
									Last synced
									<abbr title={settings.lastSyncTime ? new Date(settings.lastSyncTime).toLocaleString() : ''}>
										{getRelativeSyncTime(settings.lastSyncTime || 0)}
									</abbr>
								</span>
							{/if}
						</div>
					</div>
					<div class="transition-transform duration-200" class:rotate-180={showBackupDetails}>
						<ChevronDown size={16} />
					</div>
				</button>
			{/if}

			{#if showBackupDetails}
				<div transition:slide={{ duration: 200, easing: cubicInOut }} class="space-y-4">
					{#if backupStatus?.state === 'error'}
						<div class="px-2 text-xs text-red-400">
							{backupStatus.details || 'Sync is disabled. Please reconnect to enable cloud backup.'}
						</div>
					{:else if backupStatus?.state === 'warning'}
						<div class="px-2 text-xs break-all text-yellow-500">
							{backupStatus.details || backupStatus.message}
						</div>
					{/if}
					<div class="flex gap-2">
						{#if backupStatus?.state === 'error'}
							<button
								class="flex-1 rounded-lg bg-zinc-800 px-4 py-2 text-sm text-red-500 transition-colors hover:bg-zinc-700"
								onclick={() => attemptToConnectCloud('gdrive')}
							>
								Reconnect
							</button>
							<button
								class="flex-1 rounded-lg bg-zinc-800 px-4 py-2 text-sm text-zinc-400 transition-colors hover:bg-zinc-700"
								onclick={() => {
									onboardingError = null;
									backupService.clearError();
								}}
							>
								Dismiss
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
								onclick={() => showDeviceRecoveryKit()}
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

<RecoveryKit
	bind:open={showRecoveryKit}
	words={recoveryWords}
	mode={isInitialBackup ? 'save' : 'share'}
	onSaveConfirm={handleRecoveryKitConfirm}
	onCancel={handleCloudSyncCancel}
/>

<RecoveryScannerDialog
	bind:open={showRecoveryScanner}
	onCompletePhrase={handleRecoveryScannerComplete}
	onCancel={handleCloudSyncCancel}
/>

<!-- For testing/debugging -->
<!-- <button class="mt-3 w-full rounded-lg bg-zinc-900 p-4 text-blue-500" onclick={() => showDeviceRecoveryKit(true)}>
	[DEBUG] Show Recovery Kit
</button> <br />
<button class="mt-1 w-full rounded-lg bg-zinc-900 p-4 text-blue-500" onclick={() => (showRecoveryScanner = true)}>
	[DEBUG] Show Recovery Scanner
</button> -->
