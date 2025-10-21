<script>
	import { encryptedLocalStorage } from '$lib/state/storage.svelte';
	import { AESGCMEncryptedStorage, LocalStorageEngine } from '$lib/utils/encrypted-storage';

	let { open = $bindable(false), mode = 'verify', onSuccess } = $props();

	let passcode = $state('');
	let confirmPasscode = $state('');
	let error = $state('');
	let processing = $state(false);

	async function handleSubmit() {
		error = '';
		processing = true;

		try {
			if (mode === 'verify') {
				const tempStorage = await AESGCMEncryptedStorage.make(new LocalStorageEngine(), passcode);
				const isValid = await tempStorage.verifySentinel();

				if (isValid) {
					onSuccess?.(passcode);
					open = false;
					passcode = '';
					error = '';
				} else {
					error = 'Incorrect passcode';
					passcode = '';
				}
			} else if (mode === 'create' || mode === 'change') {
				if (!passcode) {
					error = 'Passcode cannot be empty';
				} else if (passcode.length < 4) {
					error = 'Passcode must be at least 4 characters';
				} else if (passcode !== confirmPasscode) {
					error = 'Passcodes do not match';
				} else {
					onSuccess?.(passcode);
					open = false;
					passcode = '';
					confirmPasscode = '';
				}
			}
		} catch (/** @type {any} */ e) {
			error = e.message || 'An error occurred';
		} finally {
			processing = false;
		}
	}

	function handleCancel() {
		open = false;
		passcode = '';
		confirmPasscode = '';
		error = '';
	}

	$effect(() => {
		if (open) {
			passcode = '';
			confirmPasscode = '';
			error = '';
		}
	});
</script>

{#if open}
	<div
		class="bg-opacity-75 fixed inset-0 z-50 flex items-center justify-center bg-black"
		onclick={mode === 'verify' ? undefined : handleCancel}
		role="button"
		tabindex="-1"
	>
		<div
			class="w-full max-w-md rounded-lg bg-zinc-900 p-6 shadow-xl"
			onclick={(e) => e.stopPropagation()}
			role="dialog"
			aria-modal="true"
		>
			<h2 class="mb-4 text-xl font-bold">
				{mode === 'verify' ? 'Enter Passcode' : mode === 'create' ? 'Create Passcode' : 'Change Passcode'}
			</h2>

			<form
				onsubmit={(e) => {
					e.preventDefault();
					handleSubmit();
				}}
				class="space-y-4"
			>
				<div>
					<label for="passcode" class="mb-1 block text-sm">Passcode</label>
					<input
						type="password"
						id="passcode"
						class="w-full rounded bg-zinc-800 p-3 text-white"
						bind:value={passcode}
						autocomplete="off"
						disabled={processing}
						autofocus
					/>
				</div>

				{#if mode === 'create' || mode === 'change'}
					<div>
						<label for="confirmPasscode" class="mb-1 block text-sm">Confirm Passcode</label>
						<input
							type="password"
							id="confirmPasscode"
							class="w-full rounded bg-zinc-800 p-3 text-white"
							bind:value={confirmPasscode}
							autocomplete="off"
							disabled={processing}
						/>
					</div>
				{/if}

				{#if error}
					<div class="text-sm text-red-400">{error}</div>
				{/if}

				<div class="flex gap-4">
					{#if mode !== 'verify'}
						<button
							type="button"
							class="w-full rounded-lg bg-zinc-800 py-3 font-medium transition-colors hover:bg-zinc-700"
							onclick={handleCancel}
							disabled={processing}
						>
							Cancel
						</button>
					{/if}
					<button
						type="submit"
						class="w-full rounded-lg bg-blue-600 py-3 font-medium transition-colors hover:bg-blue-700"
						disabled={processing}
					>
						{processing ? 'Processing...' : mode === 'verify' ? 'Unlock' : 'Set Passcode'}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}
