<script>
	import { keyManager } from '$lib/state/key-manager.svelte';
	import Drawer from '$lib/components/ui/Drawer.svelte';

	/** @type {{open: boolean, mode: 'verify' | 'create' | 'change', title?: string, description?: string, onSuccess: (passcode: string) => void, onForgot?: () => void, onCancel?: () => void}} */
	let {
		open = $bindable(false),
		mode = 'verify',
		title = '',
		description = '',
		onSuccess,
		onForgot = undefined,
		onCancel = undefined
	} = $props();

	let passcode = $state('');
	let confirmPasscode = $state('');
	let errorText = $state('');
	let processing = $state(false);

	function resetAllState() {
		passcode = '';
		confirmPasscode = '';
		errorText = '';
		processing = false;
	}

	async function handleSubmit() {
		errorText = ''; // resetting this lets us automatically re-run attached action on the passcode input
		processing = true;

		try {
			if (mode === 'verify') {
				const isValid = await keyManager.testPasskey(passcode);

				if (isValid) {
					onSuccess(passcode);
					handleClose(false);
				} else {
					errorText = 'Incorrect passcode';
					passcode = '';
				}
			} else if (mode === 'create' || mode === 'change') {
				if (!passcode) errorText = 'Passcode cannot be empty';
				else if (passcode.length < 4) errorText = 'Passcode must be at least 4 characters';
				else if (passcode !== confirmPasscode) errorText = 'Passcodes do not match';
				else {
					onSuccess(passcode);
					handleClose(false);
				}
			}
		} catch (/** @type {any} */ err) {
			errorText = err.message || 'An error occurred';
		} finally {
			processing = false;
		}
	}

	function handleForgotPasscode() {
		handleClose(true);
		onForgot?.();
	}

	/**
	 * @param {boolean} [wasCancelled]
	 */
	function handleClose(wasCancelled = true) {
		if (wasCancelled) onCancel?.();
		open = false;
		resetAllState();
	}
</script>

<Drawer
	bind:open
	title={title || (mode === 'verify' ? 'Enter Passcode' : mode === 'create' ? 'Create Passcode' : 'Change Passcode')}
	onClose={() => handleClose(true)}
	class="mx-auto max-w-lg"
>
	{#if description}
		<p class="mb-4 text-sm text-zinc-400">{description}</p>
	{/if}
	<form onsubmit={handleSubmit} class="space-y-4">
		<div>
			<label for="passcode" class="mb-1 block text-sm text-gray-400">Passcode</label>
			<!-- This is ok because this dialog is the only element to be interacted with.
				See https://github.com/sveltejs/svelte/issues/6629#issuecomment-2905635643 -->
			<!-- svelte-ignore a11y_autofocus -->
			<input
				type="password"
				id="passcode"
				class="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white placeholder-zinc-500 focus:border-[#EB3912] focus:outline-none"
				bind:value={passcode}
				autocomplete={mode === 'verify' ? 'current-password' : 'new-password'}
				disabled={processing}
				aria-label="Enter passcode to unlock"
				autofocus
				{@attach (element) => {
					if (errorText) element.focus();
				}}
			/>
		</div>

		{#if mode === 'create' || mode === 'change'}
			<div>
				<label for="confirmPasscode" class="mb-1 block text-sm text-gray-400">Confirm Passcode</label>
				<input
					type="password"
					id="confirmPasscode"
					class="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white placeholder-zinc-500 focus:border-[#EB3912] focus:outline-none"
					bind:value={confirmPasscode}
					autocomplete="new-password"
					disabled={processing}
					aria-label="Confirm passcode to unlock"
				/>
			</div>
		{/if}

		{#if errorText}
			<div class="flex justify-between text-sm text-red-400">
				{errorText}

				{#if mode === 'verify' && onForgot}
					<button type="button" class="text-sm text-zinc-400 underline" onclick={handleForgotPasscode}>
						Forgot passcode?
					</button>
				{/if}
			</div>
		{/if}

		<div class="flex gap-4">
			{#if mode !== 'verify'}
				<button
					type="button"
					class="flex-1 rounded-lg bg-zinc-800 py-3 text-white transition-colors hover:bg-zinc-700"
					onclick={() => handleClose(true)}
					disabled={processing}
				>
					Cancel
				</button>
			{/if}
			<button
				type="submit"
				class="flex-1 rounded-lg bg-[#EB3912] py-3 text-white transition-colors hover:bg-[#D83511]"
				disabled={processing}
			>
				{processing ? 'Processing...' : mode === 'verify' ? 'Unlock' : 'Set Passcode'}
			</button>
		</div>
	</form>
</Drawer>
