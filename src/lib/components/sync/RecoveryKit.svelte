<script>
	import MnemonicGrid from './MnemonicGrid.svelte';
	import Drawer from '../ui/Drawer.svelte';
	import Check from '@lucide/svelte/icons/check';

	/**
	 * @type {{ words: string[], onConfirm?: () => void, open: boolean, isInitialBackup?: boolean }}
	 */
	let { words, onConfirm, open = $bindable(false), isInitialBackup = true } = $props();

	let showQr = $state(false);

	const qrSvg = $derived(showQr && import('qr').then(({ encodeQR }) => encodeQR(words.join(' '), 'svg')));

	function handleConfirm() {
		if (onConfirm) onConfirm();
		open = false;
	}
</script>

<Drawer bind:open title="Recovery Kit" class="mx-auto max-w-2xl">
	<div class="mx-auto flex w-full flex-col items-center space-y-6">
		<div class="space-y-2 text-center">
			{#if isInitialBackup}
				<h2 class="text-xl font-semibold text-white">Your Recovery Kit</h2>
				<p class="mx-auto max-w-md text-sm text-zinc-400">
					Write down these 24 words and keep them in a safe place. You will need them to recover your tokens if you lose
					access to this device.
				</p>
			{:else}
				<p class="mx-auto max-w-md text-sm text-zinc-400">
					These 24 words can be used to link another device. Do not share them with anyone else.
				</p>
			{/if}
		</div>

		<MnemonicGrid {words} />

		{#if showQr}
			<div class="animate-in fade-in slide-in-from-bottom-4 flex flex-col items-center space-y-4 duration-300">
				{#await qrSvg}
					<div class="h-48 w-48 animate-pulse rounded-lg bg-zinc-800"></div>
				{:then qrSvg}
					{#if qrSvg}
						<div class="rounded-xl bg-white p-4 shadow-lg ring-4 ring-white/10">
							<!-- eslint-disable-next-line svelte/no-at-html-tags : Safe as it comes from internal qr lib -->
							{@html qrSvg}
						</div>
						<p class="text-xs text-zinc-500">Scan this code with another device to sync.</p>
					{/if}
				{:catch error}
					<div class="rounded-lg bg-red-900/30 p-3 text-red-400">
						Error generating QR code: {error instanceof Error ? error.message : error}
					</div>
				{/await}
			</div>
		{:else}
			<button
				onclick={() => (showQr = true)}
				class="text-sm text-indigo-400 underline-offset-4 transition-colors hover:text-indigo-300 hover:underline"
			>
				Show QR Code instead
			</button>
		{/if}

		<div class="w-full border-t border-white/10 pt-4">
			<button
				onclick={handleConfirm}
				class="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-500 px-6 py-3 font-medium text-white shadow-[0_0_20px_-5px_rgba(99,102,241,0.4)] transition-all duration-200 hover:bg-indigo-400 hover:shadow-[0_0_25px_-5px_rgba(99,102,241,0.6)]"
			>
				{#if isInitialBackup}
					<Check size={18} />
					I have saved these words
				{:else}
					Close
				{/if}
			</button>
		</div>
	</div>
</Drawer>
