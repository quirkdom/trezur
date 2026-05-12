<script>
	import { ScanQrCodeIcon, ArrowRight } from '@lucide/svelte';
	import Drawer from '../ui/Drawer.svelte';
	import { onDestroy, tick } from 'svelte';

	/**
	 * @type {{ open: boolean, onCompletePhrase: (words: string[]) => void, onCancel?: () => void }}
	 */
	let { open = $bindable(false), onCompletePhrase, onCancel = undefined } = $props();

	let showCameraFeed = $state(false);
	let showManualEntry = $state(false);
	let recoveryPhraseText = $state('');
	let errorText = $state('');

	/** @type {import('qr/dom.js')} */
	let qrModule;
	/** @type {any} */
	let frontCamera;
	/** @type {import('qr/dom.js').QRCanvas | undefined} */
	let qrCanvas;
	/** @type {HTMLCanvasElement | undefined} */
	let overlayCanvas = $state();
	/** @type {HTMLVideoElement | undefined} */
	let videoElement = $state();
	/** @type {Function | undefined} */
	let cancelScan;

	async function startCamera() {
		showCameraFeed = true;
		showManualEntry = false;
		errorText = '';
		await tick(); // wait for video element to be ready

		if (!videoElement) return;

		try {
			if (!qrModule) qrModule = await import('qr/dom.js');
			frontCamera = await qrModule.frontalCamera(videoElement);
			startScanning();
		} catch (err) {
			console.error('Error accessing camera:', err);
			showCameraFeed = false;
			errorText = 'Error: Failed to access camera. Did you give permission?';
		}
	}

	function startScanning() {
		if (!frontCamera || !qrModule || !overlayCanvas) return;

		if (!qrCanvas)
			qrCanvas = new qrModule.QRCanvas(
				{ overlay: overlayCanvas },
				{
					cropToSquare: true,
					overlaySideColor: '#9D260C' // darker version of #EB3912
				}
			);

		let isProcessing = false;
		cancelScan = qrModule.frameLoop(() => {
			if (isProcessing) return;
			if (!videoElement || videoElement.paused || videoElement.ended || videoElement.readyState < 2) return;

			const qrData = frontCamera.readFrame(qrCanvas, true);
			if (qrData) {
				isProcessing = true;
				const words = qrData.trim().split(/\s+/);
				if (words.length === 24) {
					onCompletePhrase(words);
					close();
				} else {
					errorText = 'QR code does not contain a valid 24-word recovery phrase';
					isProcessing = false;
				}
			}
		});
	}

	function resetCamera() {
		showCameraFeed = false;

		cancelScan?.();
		cancelScan = undefined;

		qrCanvas?.clear();
		qrCanvas = undefined;

		frontCamera?.stop();
		frontCamera = undefined;
	}

	function handleManualPhraseSubmit() {
		const words = recoveryPhraseText.trim().split(/\s+/);
		if (words.length !== 24) {
			errorText = `Please enter exactly 24 words. You have entered ${words.length}.`;
			return;
		}
		onCompletePhrase(words);
		close();
	}

	function handleClose() {
		onCancel?.();
		close();
	}

	function close() {
		resetCamera();
		recoveryPhraseText = '';
		errorText = '';
		open = false;
	}

	onDestroy(() => resetCamera());
</script>

<Drawer bind:open title="Recover Backup" onClose={handleClose} class="mx-auto max-w-lg">
	<div class="space-y-6">
		{#if !showManualEntry}
			<!-- QR Scanner Mode -->
			<p class="text-center text-sm text-zinc-400">
				A cloud backup was found. Please scan the QR code from a connected device's Recovery Kit.
			</p>

			{#if showCameraFeed}
				<div class="relative mb-6 overflow-hidden rounded-lg bg-black">
					<video bind:this={videoElement} autoplay muted playsinline class="h-64 w-full object-cover"></video>
					<canvas bind:this={overlayCanvas} class="pointer-events-none absolute top-0 left-0 h-full w-full opacity-70"
					></canvas>
				</div>
				<p class="text-center text-sm text-zinc-400">
					You can find the recovery QR code from a connected device, in Settings → Backup → expand sync status → "Link
					Devices".
				</p>
			{:else if errorText}
				<div class="rounded-lg bg-red-900/30 p-4 text-center text-sm text-red-400">
					{errorText}
				</div>
			{:else}
				<button
					class="flex w-full items-center justify-center gap-2 rounded-lg bg-zinc-800 py-4 text-white transition-colors hover:bg-zinc-700"
					onclick={startCamera}
				>
					<ScanQrCodeIcon size={20} />
					<span>Scan QR Code</span>
				</button>
			{/if}

			<button
				class="flex w-full items-center justify-center gap-2 rounded-lg bg-zinc-800 py-4 text-white transition-colors hover:bg-zinc-700"
				onclick={() => {
					resetCamera();
					showManualEntry = true;
					errorText = '';
				}}
			>
				<span>Enter recovery words instead</span>
			</button>
		{:else}
			<!-- Manual Entry Mode -->
			<p class="text-center text-sm text-zinc-400">
				A cloud backup was found. Please enter your previously saved recovery phrase.
			</p>

			<label for="manualWords" class="mb-1 block text-sm text-zinc-400">Recovery Phrase</label>
			<textarea
				id="manualWords"
				bind:value={recoveryPhraseText}
				rows="4"
				class="w-full rounded-lg border border-zinc-700 bg-zinc-800 p-3 text-white placeholder-zinc-500 focus:border-[#EB3912] focus:outline-none"
				placeholder="Enter your 24 word recovery phrase, separated by spaces..."
			></textarea>

			{#if errorText}
				<div class="rounded-lg bg-red-900/30 p-4 text-center text-sm text-red-400">
					{errorText}
				</div>
			{:else}
				<p class="text-center text-sm text-zinc-400">
					You can also find the recovery phrase from a connected device, in Settings → Backup → expand sync status →
					"Link Devices".
				</p>
			{/if}

			<div class="mt-4 flex gap-4">
				<button
					class="flex-1 rounded-lg bg-zinc-800 py-3 text-white transition-colors hover:bg-zinc-700"
					onclick={() => {
						showManualEntry = false;
						errorText = '';
					}}
				>
					Back
				</button>
				<button
					class="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#EB3912] py-3 font-medium text-white transition-colors hover:bg-[#D83511]"
					onclick={handleManualPhraseSubmit}
				>
					Verify
					<ArrowRight size={16} />
				</button>
			</div>
		{/if}
	</div>
</Drawer>
