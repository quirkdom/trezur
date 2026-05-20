<script>
	import { dev, version } from '$app/environment';
	import { goto } from '$app/navigation';
	import { asset, resolve } from '$app/paths';
	import { useConditionsContext } from '$lib/state/conditions.svelte';
	import { initStorage, purgeStorage } from '$lib/state/storage.svelte';
	import { Lock } from '@lucide/svelte';
	import PasscodeDialog from './PasscodeDialog.svelte';

	const conditionsContext = useConditionsContext();
	const conditions = $derived(conditionsContext.getConditions());

	let showPasscodeDialog = $state(conditionsContext.getConditions().isUserPasscodeSet);

	/**
	 * Called by the layout (via bind:this) when FooterNav long-press
	 * requests a passcode prompt.
	 */
	export function openPasscodeDialog() {
		showPasscodeDialog = true;
	}

	/**
	 * @param {string} passcode
	 */
	async function handleUnlock(passcode) {
		const ok = await initStorage(passcode);
		if (ok) {
			conditionsContext.updateCondition('isAppLocked', false);
		}
	}

	async function handleForgotPasscode() {
		if (
			prompt(
				`If you forgot your passcode, the only option is to delete all data and start afresh.

 All tokens will be lost. This action cannot be undone.

 Are you sure you want to proceed? Please type "YES" to confirm this action.`,
				'NO'
			) !== 'YES'
		)
			return;

		const { clientId } = conditions;

		purgeStorage();

		conditionsContext.updateConditions({
			isAppLocked: false,
			isUserPasscodeSet: false
		});

		// Re-init with existing clientId
		if (clientId) {
			await initStorage(clientId);
		}

		await goto(resolve('/'));
	}
</script>

<main class="mt-72 flex flex-col items-center justify-center gap-6 text-center">
	<img src={asset('/trezur_logo.svg')} alt="Trezur Logo" class="h-6 w-auto" />

	<p>
		Your tokens are locked {conditions.isUserPasscodeSet ? 'with a passcode.' : 'away.'}
		Unlock by pressing and holding the Codes
		<Lock class="inline-block h-[1em] w-[1em] transition-colors duration-300 hover:text-[#EB3912]" />
		button at the bottom of the screen.
	</p>

	<p class="text-sm text-zinc-500">
		Trezur v{version}
		{dev ? '[DEV]' : ''} <br />
	</p>
</main>

<PasscodeDialog bind:open={showPasscodeDialog} mode="verify" onSuccess={handleUnlock} onForgot={handleForgotPasscode} />
