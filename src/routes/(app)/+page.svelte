<script>
	import { browser } from '$app/environment';
	import NavActions from '$lib/components/nav/NavActions.svelte';
	import AddTokenForm from '$lib/components/tokens/AddTokenForm.svelte';
	import TokenList from '$lib/components/tokens/TokenList.svelte';
	import LoadingSpinner from '$lib/components/ui/LoadingSpinner.svelte';
	import SearchBar from '$lib/components/ui/SearchBar.svelte';

	import { asset, resolve } from '$app/paths';
	import { exportTokensDownload } from '$lib/components/tokens/ExportTokens.svelte';
	import { useConditionsContext } from '$lib/state/conditions.svelte';
	import { useSettingsContext } from '$lib/state/settings.svelte';
	import { getLocalVault, initStorage } from '$lib/state/storage.svelte';
	import { keyManager } from '$lib/state/key-manager.svelte';
	import { tokenize, tokensContext } from '$lib/state/tokens.svelte';
	import { devconsole } from '$lib/utils';
	import { ArrowRightLeft, Cog, PlusIcon, Settings, Shield, WifiOff } from '@lucide/svelte';

	const settingsContext = useSettingsContext();
	const conditionsContext = useConditionsContext();

	const conditions = $derived(conditionsContext.getConditions());
	let isAppleDevice = $derived(conditions.isAppleDevice);

	// $inspect('tokensContext.current', tokensContext.current); // for debugging

	let isLoading = $derived(browser && tokensContext.current?.storage !== getLocalVault());

	$effect(() => {
		if (keyManager.needsMigration && tokensContext.current) {
			alert(
				'This app has been updated to a newer version. Your tokens need to be migrated to more secure encryption. Click OK to automatically download a backup and proceed with the migration.'
			);

			handleMigration();
		}
	});

	let tokens = $derived(tokensContext.current?.getTokens() || []);

	let showAddTokenForm = $state(false);
	let searchQuery = $state('');

	function openAddTokenForm() {
		showAddTokenForm = true;
	}

	/**
	 * @param {import('$lib/types').Tokenable} tokenable
	 */
	function handleAddToken(tokenable) {
		if (!tokensContext.current) {
			devconsole.warn(
				'[Codes > Add Token] App without valid Tokens context. Attempts to add token will fail; skipping.'
			);
			return;
		}

		tokensContext.current.addTokens(tokenize(tokenable));
	}

	async function handleMigration() {
		const tokens = tokensContext.current?.getTokens() || [];
		const filename = `trezur_backup_${new Date().toISOString().split('T')[0]}.json`;
		exportTokensDownload(tokens, filename);

		if (conditions.clientId) await initStorage(conditions.clientId);
	}

	/** @type {import('./$types').Snapshot<string>} */
	export const snapshot = {
		capture: () => searchQuery,
		restore: (value) => (searchQuery = value)
	};
</script>

<svelte:head>
	<title>Trezur · Codes</title>
	<meta name="description" content="Trezur app" />
</svelte:head>

<header class="mb-6 flex items-center justify-between">
	<img src={asset('/trezur_logo.svg')} alt="Trezur Logo" class="h-6 w-auto" />

	{#if !isLoading}
		<NavActions
			sortButton={tokens.length > 0 && {
				sortOrder: settingsContext.getSettings().sortOrder,
				onSortChange: (/** @type {'asc' | 'desc' | 'none'} */ newOrder) =>
					settingsContext.updateSetting('sortOrder', newOrder)
			}}
			addButton={openAddTokenForm}
		/>
	{/if}
</header>

<main class:cursor-wait={isLoading}>
	{#if tokens.length > 0}
		<div class="space-y-4">
			<SearchBar bind:searchQuery {isAppleDevice} />
			<TokenList {tokens} {searchQuery} />
		</div>
	{:else}
		<div class="mt-12 flex flex-col items-center justify-center gap-8 text-center sm:mt-18">
			<h2 class="px-4 text-2xl font-semibold">
				Trezur is a web-app to generate <abbr title="Time-based One-Time Password">TOTP</abbr> and
				<abbr title="HMAC-based One-Time Password">HOTP</abbr>
				<sup class="align-super text-tiny text-zinc-500">(soon)</sup>
				codes for <abbr title="Two-Factor Authentication">2FA</abbr>.
			</h2>

			<div class="space-y-4 px-4 text-left text-sm">
				<div class="flex items-start gap-4">
					<div class="pt-1 text-[#EB3912]"><WifiOff /></div>
					<div>
						<h3 class="font-bold">Offline-First Privacy</h3>
						<p>
							Trezur keeps your data on your device, not on our servers. Enjoy seamless offline access after your first
							visit. <span class="text-[#EB3912]"><em>We don't collect any user data.</em></span>
						</p>
					</div>
				</div>
				<div class="flex items-start gap-4">
					<div class="pt-1 text-[#EB3912]"><Shield /></div>
					<div>
						<h3 class="font-bold">Encrypted & Protected</h3>
						<p>
							Your tokens are stored encrypted in your browser. Optionally, you can add a passcode for an extra layer of
							protection.
						</p>
					</div>
				</div>
				<div class="flex items-start gap-4">
					<div class="pt-1 text-[#EB3912]"><ArrowRightLeft /></div>
					<div>
						<h3 class="font-bold">Total Control</h3>
						<p>
							Effortlessly import and export your tokens. Set up automatic backups and multi-device sync with your
							preferred cloud service.
						</p>
					</div>
				</div>
			</div>

			<LoadingSpinner {isLoading} delay={300} {isAppleDevice}>
				<p>Loading tokens...</p>
			</LoadingSpinner>

			{#if !isLoading}
				{@render AddOrImportTokensPrompt()}
			{/if}
		</div>
	{/if}
</main>

<AddTokenForm bind:open={showAddTokenForm} onAddToken={handleAddToken} />

{#snippet AddOrImportTokensPrompt()}
	<div class="space-y-4 px-4">
		<button
			class="transition-colors duration-300 hover:text-[#EB3912]"
			onclick={openAddTokenForm}
			aria-label="Add token"
		>
			<PlusIcon class="h-20 w-20 opacity-70" />
		</button>
		<p>
			Get started by adding your first security token using the
			<button
				class="inline-flex items-center align-middle text-[#EB3912]"
				onclick={openAddTokenForm}
				aria-label="Add token"
			>
				<PlusIcon class="inline-block h-[1em] w-[1em]" />
			</button> button.
		</p>
		<p>
			Or import tokens from another app in the <a href={resolve('/settings')}>Settings </a>
			<a
				href={resolve('/settings')}
				class="inline-flex items-center align-middle transition duration-800 ease-in-out hover:rotate-90 hover:text-[#EB3912]"
				aria-label="Settings page"
			>
				{#if isAppleDevice}
					<Cog class="inline-block h-[1em] w-[1em]" />
				{:else}
					<Settings class="inline-block h-[1em] w-[1em]" />
				{/if}
			</a> page.
		</p>
	</div>
{/snippet}
