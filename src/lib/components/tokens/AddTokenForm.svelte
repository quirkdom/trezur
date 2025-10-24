<script>
	import { Eye, EyeOff, ScanQrCodeIcon } from '@lucide/svelte';
	import Drawer from '../ui/Drawer.svelte';
	import { onDestroy, tick } from 'svelte';
	import { TOTP, URI } from 'otpauth';

	/**
	 * @type {{ onAddToken: (tokenable: import('$lib/types').Tokenable) => void, open: boolean }}
	 */
	let { onAddToken, open = $bindable(false) } = $props();

	let showCameraFeed = $state(false);
	let revealSecret = $state(false);
	let issuer = $state('');
	let account = $state('');
	let secret = $state('');

	/**
	 * @type {import('qr/dom.js')}
	 */
	let qrModule;

	/** @type {any} */
	let frontCamera; // TODO: Replace with proper type, once this can become available from 'qr/dom.js'
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
		await tick(); // wait for video elemnent to be ready

		if (!videoElement) return;

		try {
			if (!qrModule) qrModule = await import('qr/dom.js');

			frontCamera = await qrModule.frontalCamera(videoElement);
			startScanning();
		} catch (err) {
			console.error('Error accessing camera:', err);
			showCameraFeed = false;
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
			); // Internally initializes a (possibly hidden) canvas.

		let isProcessing = false; // mutex
		cancelScan = qrModule.frameLoop(() => {
			// Skip frame if we're currently processing a QR code
			if (isProcessing) return;

			// Skip frames until video is actually playing
			if (!videoElement || videoElement.paused || videoElement.ended || videoElement.readyState < 2)
				return;

			// TODO: Investiagate errors when full resolution is used
			const qrData = frontCamera.readFrame(qrCanvas, true);

			if (qrData) {
				isProcessing = true;
				processQrData(qrData);
			}
		});

		/**
		 * Process the QR data without restarting the scan loop
		 * @param {string} qrData
		 */
		function processQrData(qrData) {
			try {
				// Parse the otpauth URI
				const parsedOTP = URI.parse(qrData);

				if (parsedOTP && parsedOTP instanceof TOTP) {
					// Fill form fields with parsed data
					issuer = parsedOTP.issuer;
					account = parsedOTP.label;
					secret = parsedOTP.secret.base32;

					// If we have all necessary data, auto-submit and close
					if (account && secret) {
						onAddToken?.({ issuer, account, secret, type: 'TOTP' });
						close(); // internally calls stopScanning()
					} else {
						// If missing data, keep form open but close camera
						showCameraFeed = false;
						stopScanning();
					}

					return;
				}

				// If we're here, continue scanning
				isProcessing = false;
			} catch (error) {
				console.error('Error parsing QR code:', error);
				// Resume scanning after error
				isProcessing = false;
			}
		}
	}

	function stopScanning() {
		if (!cancelScan) return;

		cancelScan();
		cancelScan = undefined;
	}

	/**
	 * @param {SubmitEvent} event
	 */
	function handleSubmit(event) {
		event.preventDefault();
		onAddToken?.({ issuer, account, secret, type: 'TOTP' });
		close();
	}

	function close() {
		// camera cleanup
		showCameraFeed = false;
		stopScanning();

		qrCanvas?.clear();
		qrCanvas = undefined;

		frontCamera?.stop();
		frontCamera = undefined;

		// form cleanup
		issuer = '';
		account = '';
		secret = '';

		open = false; // This will update the parent's binding
	}

	onDestroy(() => close());
</script>

<Drawer bind:open title="Add Token" onClose={close} class="mx-auto max-w-lg">
	{#if showCameraFeed}
		<div class="relative mb-6 overflow-hidden rounded-lg bg-black">
			<video bind:this={videoElement} autoplay muted playsinline class="h-64 w-full object-cover"
			></video>
			<canvas
				bind:this={overlayCanvas}
				class="pointer-events-none absolute top-0 left-0 h-full w-full opacity-70"
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

	<!-- Form -->
	<form onsubmit={handleSubmit} class="space-y-4">
		<div>
			<label for="issuer" class="mb-1 block text-sm text-gray-400">Issuer (Optional)</label>
			<input
				id="issuer"
				type="text"
				placeholder="Service name"
				bind:value={issuer}
				class="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white placeholder-zinc-500 focus:border-[#EB3912] focus:outline-none"
			/>
		</div>

		<div>
			<label for="account" class="mb-1 block text-sm text-gray-400">Account</label>
			<input
				id="account"
				type="text"
				required
				placeholder="username@example.com"
				bind:value={account}
				class="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white placeholder-zinc-500 focus:border-[#EB3912] focus:outline-none"
			/>
		</div>

		<div>
			<label for="secret" class="mb-1 block text-sm text-gray-400">Secret</label>
			<div class="relative">
				<input
					id="secret"
					type={revealSecret ? 'text' : 'password'}
					pattern={'([A-Z2-7=]{8})+'}
					required
					placeholder="Enter token secret"
					title="A valid Base32 encoded secret"
					bind:value={secret}
					class="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white placeholder-zinc-500 focus:border-[#EB3912] focus:outline-none"
				/>
				<button
					type="button"
					class="absolute top-1/2 right-2 -translate-y-1/2 text-gray-400 hover:text-white"
					onclick={() => (revealSecret = !revealSecret)}
				>
					{#if revealSecret}
						<EyeOff size={20} />
					{:else}
						<Eye size={20} />
					{/if}
				</button>
			</div>
		</div>

		<div class="mt-6 flex gap-4">
			<button
				type="button"
				class="flex-1 rounded-lg bg-zinc-800 py-3 text-white transition-colors hover:bg-zinc-700"
				onclick={close}
			>
				Cancel
			</button>
			<button
				type="submit"
				class="flex-1 rounded-lg bg-[#EB3912] py-3 text-white transition-colors hover:bg-[#D83511]"
			>
				Add
			</button>
		</div>
	</form>
</Drawer>
