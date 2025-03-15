<script>
	import NavActions from '$lib/components/nav/NavActions.svelte';
	import Switch from '$lib/components/ui/Switch.svelte';
	import { dev, version } from '$app/environment';
	import { useSettingsContext } from '$lib/state/settings.svelte';
	import { useConditionsContext } from '$lib/state/conditions.svelte';
	import { useTokensContext } from '$lib/state/tokens.svelte';
	import { goto, invalidate } from '$app/navigation';
	import { nanoid } from 'nanoid/non-secure';

	const settingsContext = useSettingsContext();
	let settings = $derived(settingsContext.getSettings());

	const conditionsContext = useConditionsContext();
	let conditions = $derived(conditionsContext.getConditions());
	let nonAppleSwitchTheme = $derived.by(() =>
		conditions.isAppleDevice ? '' : 'data-[state=on]:bg-[#EB3912]'
	);

	const tokensContext = useTokensContext();

	function purgeAll() {
		settingsContext.resetSettings();
		conditionsContext.resetConditions();
		tokensContext?.current?.clearTokens();

		invalidate('app:conditions').then(() => goto('/'));
	}

	async function loadSampleData() {
		if (dev) {
			const response = await fetch('/temp/Chronos_20-02-2025.json?url');
			const { tokens: chronosTokens } = await response.json();

			const tokensToLoad = chronosTokens.map(
				(/** @type {import('$lib/types').Tokenable} */ token) => ({
					id: nanoid(10),
					...token
				})
			);

			tokensContext?.current?.addTokens(...tokensToLoad);
		}

		goto('/');
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
					<span>iCloud Backup <sup class="text-xs text-zinc-500">Coming Soon</sup></span>
					<Switch disabled checked={settings.iCloudBackupEnabled} class={nonAppleSwitchTheme} />
				</div>
				<div class="flex items-center justify-between p-4">
					<span>Last Synced</span>
					<span class="text-zinc-500">Never</span>
				</div>
			</div>
			<div class="mb-4 divide-y divide-gray-800 rounded-lg bg-zinc-900">
				<div class="flex items-center justify-between p-4">
					<span>Google Drive Backup <sup class="text-xs text-zinc-500">Coming Soon</sup></span>
					<Switch disabled checked={settings.gDriveBackupEnabled} class={nonAppleSwitchTheme} />
				</div>
				<div class="flex items-center justify-between p-4">
					<span>Last Synced</span>
					<span class="text-zinc-500">Never</span>
				</div>
			</div>

			<div class="mt-4 space-y-2">
				<button class="w-full rounded-lg bg-zinc-900 p-4 text-left text-blue-500"> Import </button>
				<button class="w-full rounded-lg bg-zinc-900 p-4 text-left text-blue-500"> Export </button>
			</div>
		</section>

		<section>
			<h2 class="mb-4 text-sm text-zinc-500 uppercase">Preferences</h2>
			<div class="divide-y divide-gray-800 rounded-lg bg-zinc-900">
				<div class="flex hidden items-center justify-between p-4">
					<span>Use biometrics to unlock</span>
					<Switch
						disabled={conditions.isAppLocked}
						checked={settings.useBiometricUnlock}
						onCheckedChange={(/** @type {boolean} */ checked) => {
							settingsContext.updateSetting('useBiometricUnlock', checked);
						}}
						class={nonAppleSwitchTheme}
					/>
				</div>
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

		<div class="space-y-2">
			<button
				class="hidden w-full rounded-lg bg-zinc-900 p-4 text-blue-500"
				onclick={() => (conditions.isAppLocked = !conditions.isAppLocked)}
			>
				{conditions.isAppLocked ? 'Unlock' : 'Lock'}
			</button>
			<button class="w-full rounded-lg bg-zinc-900 p-4 text-red-500" onclick={purgeAll}>
				Delete all data
			</button>
			{#if dev}
				<button class="w-full rounded-lg bg-zinc-900 p-4 text-red-500" ondblclick={loadSampleData}>
					[DEV] Load Sample Data
				</button>
			{/if}
		</div>

		<p class="text-center text-sm text-zinc-500">Trezur app v{version} {dev ? '[DEV]' : ''}</p>
	</div>
</main>
