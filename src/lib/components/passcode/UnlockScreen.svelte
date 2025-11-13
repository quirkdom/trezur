<script>
	import { dev, version } from '$app/environment';
	import { goto } from '$app/navigation';
	import { asset, resolve } from '$app/paths';
	import { useConditionsContext } from '$lib/state/conditions.svelte';
	import { sessionPasscode } from '$lib/state/passcode.svelte';
	import { encryptedLocalStorage } from '$lib/state/storage.svelte';
	import { useTokensContext } from '$lib/state/tokens.svelte';
	import { Lock } from '@lucide/svelte';
	import PasscodeDialog from './PasscodeDialog.svelte';

	const conditionsContext = useConditionsContext();
	const conditions = $derived(conditionsContext.getConditions());
	const tokensContext = useTokensContext();

	let showPasscodeDialog = $derived(conditions.isUserPasscodeSet || false);

	/**
	 * @param {string} passcode
	 */
	async function handleUnlock(passcode) {
		sessionPasscode.passcode = passcode;
		await encryptedLocalStorage.init(passcode);
		conditionsContext.updateCondition('isAppLocked', false);
	}

	async function handleForgotPasscode() {
		if (
			prompt(
				`If you forgot your passcode, the only option is to delete all data and start afresh.

All tokens will be lost. This action cannot be undone!

Are you sure you want to proceed? Please type "YES" to confirm this action.`,
				'NO'
			) !== 'YES'
		)
			return;

		await tokensContext.resetTokens();
		await encryptedLocalStorage.reset(true);

		sessionPasscode.clear();
		conditionsContext.updateCondition('isUserPasscodeSet', false);

		await goto(resolve('/'), { invalidate: ['app://layout-load'] }); // Invalidation and page reload of '/' should setup new storage and tokens context
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
