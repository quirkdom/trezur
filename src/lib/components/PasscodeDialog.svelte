<script>
	import { encryptedLocalStorage } from '$lib/state/storage.svelte';
	import Drawer from '$lib/components/ui/Drawer.svelte';

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
				const isValid = await encryptedLocalStorage.test(passcode);

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

<Drawer
	bind:open
	title={mode === 'verify' ? 'Enter Passcode' : mode === 'create' ? 'Create Passcode' : 'Change Passcode'}
	onClose={handleCancel}
	class="mx-auto max-w-lg"
>
	<form
		onsubmit={(e) => {
			e.preventDefault();
			handleSubmit();
		}}
		class="space-y-4"
	>
		<div>
		<label for="passcode" class="mb-1 block text-sm text-gray-400">Passcode</label>
		<!-- svelte-ignore a11y_autofocus : This is ok because this dialog is the only element to be interacted with.
		See https://github.com/sveltejs/svelte/issues/6629#issuecomment-2905635643 -->
		<input
		type="password"
		id="passcode"
		class="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white placeholder-zinc-500 focus:border-[#EB3912] focus:outline-none"
		bind:value={passcode}
		autocomplete="off"
		disabled={processing}
		autofocus
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
					class="flex-1 rounded-lg bg-zinc-800 py-3 text-white transition-colors hover:bg-zinc-700"
					onclick={handleCancel}
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
