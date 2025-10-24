<script>
	import PasscodeDialog from './PasscodeDialog.svelte';
	import { useConditionsContext } from '$lib/state/conditions.svelte';
	import { sessionPasscode } from '$lib/state/passcode.svelte';
	import { asset } from '$app/paths';
	import { Lock } from '@lucide/svelte';
	import { dev, version } from '$app/environment';

	const conditionsContext = useConditionsContext();
	const conditions = $derived(conditionsContext.getConditions());

	let showPasscodeDialog = $derived(conditions.isUserPasscodeSet || false);

	/**
	 * @param {string} passcode
	 */
	async function handleUnlock(passcode) {
		sessionPasscode.passcode = passcode;
		// await encryptedLocalStorage.init(passcode);
		conditionsContext.updateCondition('isAppLocked', false);
	}

	// TODO - fix this
	function handleForgotPasscode() {
		const confirmed = confirm(
			'If you forgot your passcode, the only option is to delete all app data and start fresh. This will permanently delete all your tokens.\n\nDo you want to proceed?'
		);

		if (!confirmed) return;

		const doubleConfirm = prompt(
			'This action cannot be undone. All your tokens will be lost!\n\nType "DELETE" to confirm:',
			''
		);

		if (doubleConfirm === 'DELETE') {
			conditionsContext.resetConditions();
			window.location.reload();
		}
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

<PasscodeDialog bind:open={showPasscodeDialog} mode="verify" onSuccess={handleUnlock} />
