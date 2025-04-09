<script>
	import NavActions from '$lib/components/nav/NavActions.svelte';
	import Switch from '$lib/components/ui/Switch.svelte';
	import ImportTokensDialog from '$lib/components/tokens/ImportTokens.svelte';
	import ExportTokensDialog from '$lib/components/tokens/ExportTokens.svelte';
	import { dev, version } from '$app/environment';
	import { useSettingsContext } from '$lib/state/settings.svelte';
	import { useConditionsContext } from '$lib/state/conditions.svelte';
	import { useTokensContext } from '$lib/state/tokens.svelte';
	import { goto, invalidate } from '$app/navigation';
	import { updated } from '$app/state';

	const settingsContext = useSettingsContext();
	let settings = $derived(settingsContext.getSettings());

	const conditionsContext = useConditionsContext();
	let conditions = $derived(conditionsContext.getConditions());
	let nonAppleSwitchTheme = $derived.by(() =>
		conditions.isAppleDevice ? '' : 'data-[state=on]:bg-[#EB3912]'
	);

	const tokensContext = useTokensContext();
	let tokens = $derived(tokensContext.current?.getTokens() || []);

	let showImportDialog = $state(false);
	let showExportDialog = $state(false);

	function purgeAll() {
		if (
			prompt(
				'Are you sure? This will delete all data and reset the app. All security tokens will be lost! Please type "YES" to confirm this action.',
				'NO'
			) !== 'YES'
		)
			return;

		settingsContext.resetSettings();
		conditionsContext.resetConditions();
		tokensContext.current?.clearTokens();

		invalidate('app:conditions').then(() => goto('/'));
	}

	/**
	 * @todo Do a dedupe check while adding new tokens
	 * @param { import('$lib/types').Token[] } tokens Set of newly discovered tokens awaiting import
	 */
	function handleImport(tokens) {
		if (tokens?.length) {
			tokensContext.current?.addTokens(...tokens);
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
		<section>
			<h2 class="mb-4 text-sm text-zinc-500 uppercase">Backup</h2>
			<div class="mb-4 divide-y divide-gray-800 rounded-lg bg-zinc-900">
				<div class="flex items-center justify-between p-4">
					<span>iCloud Backup <sup class="text-xs text-zinc-500">&nbsp; Coming Soon</sup></span>
					<Switch disabled checked={settings.iCloudBackupEnabled} class={nonAppleSwitchTheme} />
				</div>
				<div class="flex items-center justify-between p-4">
					<span>Last Synced</span>
					<span class="text-zinc-500">Never</span>
				</div>
			</div>
			<div class="mb-4 divide-y divide-gray-800 rounded-lg bg-zinc-900">
				<div class="flex items-center justify-between p-4">
					<span
						>Google Drive Backup <sup class="text-xs text-zinc-500">&nbsp; Coming Soon</sup></span
					>
					<Switch disabled checked={settings.gDriveBackupEnabled} class={nonAppleSwitchTheme} />
				</div>
				<div class="flex items-center justify-between p-4">
					<span>Last Synced</span>
					<span class="text-zinc-500">Never</span>
				</div>
			</div>

			<div class="mt-4 flex gap-4">
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
			<h2 class="mb-4 text-sm text-zinc-500 uppercase">Preferences</h2>
			<div class="divide-y divide-gray-800 rounded-lg bg-zinc-900">
				<!-- <div class="flex items-center justify-between p-4">
					<span>Use biometrics to unlock</span>
					<Switch
						disabled={conditions.isAppLocked}
						checked={settings.useBiometricUnlock}
						onCheckedChange={(/** @type {boolean} */ checked) => {
							settingsContext.updateSetting('useBiometricUnlock', checked);
						}}
						class={nonAppleSwitchTheme}
					/>
				</div> -->
				<div class="flex items-center justify-between p-4">
					<span>Show next token</span>
					<Switch
						disabled={conditions.isAppLocked}
						checked={settings.showNextCode}
						onCheckedChange={(/** @type {boolean} */ checked) => {
							settingsContext.updateSetting('showNextCode', checked);
						}}
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
						<button
							class="rounded-lg bg-zinc-900 text-left text-blue-500"
							onclick={() => location.reload()}
						>
							Update now
						</button>
					</div>
				</div>
			</section>
		{/if}

		<p class="space-y-2 text-center text-sm text-zinc-500">
			Trezur v{version}
			{dev ? '[DEV]' : ''} <br />
			Made with ❤️ and ✨ at <a href="https://www.quirkdom.com" target="_blank">Quirkdom</a>
		</p>
	</div>
</main>

<ImportTokensDialog bind:open={showImportDialog} {handleImport} />

<ExportTokensDialog bind:open={showExportDialog} {tokens} />
