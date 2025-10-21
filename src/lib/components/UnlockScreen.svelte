<script>
	import PasscodeDialog from './PasscodeDialog.svelte';
	import { useConditionsContext } from '$lib/state/conditions.svelte';
	import { setSessionPasscode } from '$lib/state/passcode.svelte';
	import { encryptedLocalStorage } from '$lib/state/storage.svelte';

	const conditionsContext = useConditionsContext();
	const conditions = $derived(conditionsContext.getConditions());

	let showPasscodeDialog = $state(true);

	/**
	 * @param {string} passcode
	 */
	async function handleUnlock(passcode) {
		setSessionPasscode(passcode);
		await encryptedLocalStorage.init(passcode);
		conditionsContext.updateCondition('isAppLocked', false);
	}

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

<div class="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black p-4">
	<div class="mb-8 text-center">
		<h1 class="mb-2 text-3xl font-bold">Trezur</h1>
		<p class="text-zinc-400">Enter your passcode to unlock</p>
	</div>

	<PasscodeDialog bind:open={showPasscodeDialog} mode="verify" onSuccess={handleUnlock} />

	<button class="mt-4 text-sm text-zinc-500 hover:text-zinc-300" onclick={handleForgotPasscode}>
		Forgot passcode?
	</button>
</div>
