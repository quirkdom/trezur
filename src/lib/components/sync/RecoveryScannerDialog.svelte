<script>
	import { ScanQrCodeIcon, ArrowRight } from '@lucide/svelte';
	import Drawer from '../ui/Drawer.svelte';
	import { onDestroy, tick } from 'svelte';

	/**
	 * @type {{ open: boolean, onWordsComplete: (words: string[]) => void }}
	 */
	let { open = $bindable(false), onWordsComplete } = $props();

	let showCameraFeed = $state(false);
	let manualMode = $state(false);
	let manualWords = $state('');
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
		manualMode = false;
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
			errorText = 'Failed to access camera';
		}
	}

	function startScanning() {
		if (!frontCamera || !qrModule || !overlayCanvas) return;

		if (!qrCanvas)
			qrCanvas = new qrModule.QRCanvas(
				{ overlay: overlayCanvas },
				{
					cropToSquare: true,
					overlaySideColor: '#4f46e5' // indigo
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
					onWordsComplete(words);
					close();
				} else {
					errorText = 'QR code does not contain a valid 24-word recovery phrase';
					isProcessing = false;
				}
			}
		});
	}

	function stopScanning() {
		if (!cancelScan) return;
		cancelScan();
		cancelScan = undefined;
	}

	function handleManualSubmit() {
		const words = manualWords.trim().split(/\s+/);
		if (words.length !== 24) {
			errorText = `Please enter exactly 24 words. You entered ${words.length}.`;
			return;
		}
		onWordsComplete(words);
		close();
	}

	function close() {
		showCameraFeed = false;
		stopScanning();
		qrCanvas?.clear();
		qrCanvas = undefined;
		frontCamera?.stop();
		frontCamera = undefined;
		manualWords = '';
		errorText = '';
		open = false;
	}

	onDestroy(() => close());

	$effect(() => {
		if (!open) {
			close();
		}
	});
</script>

<Drawer bind:open title="Recover Backup" onClose={close} class="mx-auto max-w-lg">
	<div class="space-y-6">
		<p class="text-sm text-zinc-400">
			A cloud backup was found. Please scan the QR code from your original device's Recovery Kit, or enter your 24 words
			manually.
		</p>

		{#if !manualMode}
			{#if showCameraFeed}
				<div class="relative mb-6 overflow-hidden rounded-lg bg-black">
					<video bind:this={videoElement} autoplay muted playsinline class="h-64 w-full object-cover"></video>
					<canvas bind:this={overlayCanvas} class="pointer-events-none absolute top-0 left-0 h-full w-full opacity-70"
					></canvas>
				</div>
			{:else}
				<button
					class="mb-6 flex w-full items-center justify-center gap-2 rounded-lg bg-zinc-800 py-4 text-white transition-colors hover:bg-zinc-700"
					onclick={startCamera}
				>
					<ScanQrCodeIcon size={20} />
					<span>Scan QR Code</span>
				</button>
			{/if}

			<div class="text-center">
				<button
					class="text-sm text-indigo-400 underline-offset-4 hover:text-indigo-300 hover:underline"
					onclick={() => {
						showCameraFeed = false;
						stopScanning();
						frontCamera?.stop();
						frontCamera = undefined;
						manualMode = true;
						errorText = '';
					}}
				>
					Enter words manually instead
				</button>
			</div>
		{:else}
			<div class="space-y-4">
				<label for="manualWords" class="mb-1 block text-sm text-gray-400">Recovery Phrase</label>
				<textarea
					id="manualWords"
					bind:value={manualWords}
					rows="4"
					class="w-full rounded-lg border border-zinc-700 bg-zinc-800 p-3 text-white placeholder-zinc-500 focus:border-indigo-500 focus:outline-none"
					placeholder="Enter 24 words separated by spaces..."
				></textarea>

				<div class="mt-4 flex items-center justify-between">
					<button
						class="text-sm text-zinc-400 underline-offset-4 hover:text-white hover:underline"
						onclick={() => {
							manualMode = false;
							errorText = '';
							startCamera();
						}}
					>
						Back to QR Scan
					</button>
					<button
						class="flex items-center gap-2 rounded-lg bg-indigo-500 px-6 py-2 font-medium text-white transition-colors hover:bg-indigo-400"
						onclick={handleManualSubmit}
					>
						Verify
						<ArrowRight size={16} />
					</button>
				</div>
			</div>
		{/if}

		{#if errorText}
			<p class="text-sm text-red-400">{errorText}</p>
		{/if}
	</div>
</Drawer>
