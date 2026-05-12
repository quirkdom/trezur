<script>
	import MnemonicGrid from './MnemonicGrid.svelte';
	import Drawer from '../ui/Drawer.svelte';
	import { Check, ClipboardList, ScanQrCodeIcon } from '@lucide/svelte';

	/**
	 * @type {{ words: string[], onSaveConfirm?: () => void, open: boolean, mode?: 'save' | 'share', onCancel?: () => void }}
	 */
	let { words, onSaveConfirm, open = $bindable(false), mode = 'save', onCancel = undefined } = $props();

	let showQr = $derived(mode === 'share');

	const qrSvg = $derived(showQr && import('qr').then(({ encodeQR }) => encodeQR(words.join(' '), 'svg')));

	function handleSaveConfirm() {
		if (onSaveConfirm) onSaveConfirm();
		open = false;
	}

	function handleClose() {
		onCancel?.();
		open = false;
	}
</script>

<Drawer bind:open title="Recovery Kit" onClose={handleClose} class="mx-auto max-w-lg">
	<div class="flex flex-col items-center gap-4">
		{#if mode === 'save'}
			<p class="text-center text-sm text-zinc-400">
				Write down these 24 words and keep them in a safe place. <br />
				You will need them to recover your tokens if you lose access to this device.
			</p>
			<MnemonicGrid {words} />
			<button
				onclick={handleSaveConfirm}
				class="flex w-full items-center justify-center gap-2 rounded-lg bg-[#EB3912] px-6 py-3 font-medium text-white transition-colors duration-200 hover:bg-[#D83511]"
			>
				<Check size={20} />
				I have saved these words
			</button>
		{:else if showQr}
			<div class="flex flex-col items-center gap-4">
				{#await qrSvg then qrSvg}
					{#if qrSvg}
						<div class="container rounded-lg bg-white p-4 ring-4 ring-white/10">
							<!-- eslint-disable-next-line svelte/no-at-html-tags : Safe as it comes from internal qr lib -->
							{@html qrSvg}
						</div>
						<p class="text-center text-sm text-zinc-400">
							This QR code can be used to link another device. <br />
							Keep it private - it grants full access to your tokens.
						</p>
					{:else}
						<p class="text-zinc-400">Unable to generate QR code.</p>
					{/if}
				{:catch error}
					<div class="rounded-lg bg-red-900/30 p-3 text-red-400">
						Error generating QR code: {error instanceof Error ? error.message : error}
					</div>
				{/await}
			</div>
			<button
				class="flex w-full items-center justify-center gap-2 rounded-lg bg-zinc-800 py-4 text-white transition-colors hover:bg-zinc-700"
				onclick={() => (showQr = false)}
			>
				<ClipboardList size={20} />
				<span>Show recovery words instead</span>
			</button>
		{:else}
			<MnemonicGrid {words} />
			<p class="text-center text-sm text-zinc-400">
				These 24 words can be used to link another device. <br />
				Keep these words private - they grant full access to your tokens.
			</p>
			<button
				class="flex w-full items-center justify-center gap-2 rounded-lg bg-zinc-800 py-4 text-white transition-colors hover:bg-zinc-700"
				onclick={() => (showQr = true)}
			>
				<ScanQrCodeIcon size={20} />
				<span>Show QR code instead</span>
			</button>
		{/if}
	</div>
</Drawer>
