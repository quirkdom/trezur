<script>
	/**
	 * @typedef {Object} ImportSource
	 * @property {string} id
	 * @property {string} name
	 * @property {string} fileType
	 *
	 * @typedef {import('$lib/types').Token} Token
	 * @typedef {import('$lib/types').Tokenable} Tokenable
	 */
	import Modal from '../ui/Modal.svelte';
	import { tokenize } from '$lib/state/tokens.svelte';
	import { onDestroy, tick } from 'svelte';
	import { ScanQrCodeIcon } from '@lucide/svelte';
	import { base64ToUint8Array, parseGoogleAuthenticatorPayload } from '$lib/utils/google-auth-parser.js';

	let { open = $bindable(false), handleImport } = $props();

	/** @type {ImportSource[]} */
	const importSources = [
		{ id: 'lastpass', name: 'LastPass', fileType: 'json' },
		{ id: 'raivo', name: 'Raivo OTP', fileType: 'json' },
		{ id: 'twofas', name: '2FAS', fileType: 'json' },
		{ id: 'ente', name: 'Ente', fileType: 'txt' },
		{ id: 'aegis', name: 'Aegis', fileType: 'json' },
		{ id: 'chronos', name: 'Chronos', fileType: 'json' },
		{ id: 'trezur', name: 'Trezur', fileType: 'json' },
		{ id: 'google-authenticator', name: 'Google Authenticator', fileType: 'qr' }
	];

	/** @type {ImportSource | null} */
	let selectedSource = $state(null);
	/** @type {HTMLInputElement | null} */
	let fileInput = $state(null);
	let errorMessage = $state('');

	let showCameraFeed = $state(false);
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
		errorMessage = '';
		await tick(); // wait for video element to be ready

		if (!videoElement) return;

		try {
			if (!qrModule) qrModule = await import('qr/dom.js');
			frontCamera = await qrModule.frontalCamera(videoElement);
			startScanning();
		} catch (err) {
			console.error('Error accessing camera:', err);
			showCameraFeed = false;
			errorMessage = 'Error: Failed to access camera. Did you give permission?';
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
				processQrData(qrData);
			}
		});

		/**
		 * @param {string} qrData
		 */
		function processQrData(qrData) {
			if (!selectedSource) return;

			try {
				const tokens = parseQrContent(qrData, selectedSource);

				if (tokens && tokens.length > 0) {
					handleImport(tokens);
					close();
				} else {
					stopCamera();
					errorMessage = `Failed to parse tokens from ${selectedSource.name} QR code.`;
					isProcessing = false;
				}
			} catch (error) {
				console.error('QR parsing error:', error);
				stopCamera();
				errorMessage = error instanceof Error ? error.message : 'Error parsing QR code';
				isProcessing = false;
			}
		}
	}

	function stopCamera() {
		showCameraFeed = false;

		if (cancelScan) {
			cancelScan();
			cancelScan = undefined;
		}

		qrCanvas?.clear();
		qrCanvas = undefined;

		frontCamera?.stop();
		frontCamera = undefined;
	}

	/**
	 * @param {ImportSource | null} source
	 */
	async function selectSource(source) {
		selectedSource = source;
		if (source?.id === 'google-authenticator') {
			await startCamera();
		} else {
			await tick();
			fileInput?.click();
		}
	}

	function resetSelection() {
		stopCamera();
		selectedSource = null;
		errorMessage = '';
	}

	/**
	 * @param {File} file
	 * @returns {Promise<string>}
	 */
	function readFileAsText(file) {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => {
				if (typeof reader.result === 'string') {
					resolve(reader.result);
				} else {
					reject(new Error('File content is not a string'));
				}
			};
			reader.onerror = () => reject(new Error('Failed to read file'));
			reader.readAsText(file);
		});
	}

	/**
	 * @param {Event} event
	 */
	async function handleFileSelected(event) {
		const target = /** @type {HTMLInputElement} */ (event.target);
		const file = target?.files?.[0];
		if (!file || !selectedSource) return;

		errorMessage = '';

		try {
			const fileContent = await readFileAsText(file);
			const tokens = parseFileContent(fileContent, selectedSource);

			if (tokens && tokens.length > 0) {
				handleImport(tokens);
				close();
			} else {
				errorMessage = 'Failed to parse tokens from the file. Please check the file format.';
			}
		} catch (error) {
			console.error('Import error:', error);
			errorMessage = `Error importing file: ${error instanceof Error ? error.message : 'Unknown error'}`;
		} finally {
			if (fileInput) fileInput.value = '';
		}
	}

	/**
	 * @param {string} content
	 * @param {ImportSource} source
	 * @returns {Token[] | null}
	 */
	function parseFileContent(content, source) {
		try {
			switch (source.id) {
				case 'trezur':
					return parseTrezurFormat(content);
				case 'lastpass':
					return parseLastPassFormat(content);
				case 'raivo':
					return parseRaivoFormat(content);
				case 'twofas':
					return parseTwoFASFormat(content);
				case 'ente':
					return parseEnteFormat(content);
				case 'aegis':
					return parseAegisFormat(content);
				case 'chronos':
					return parseChronosFormat(content);
				default:
					return null;
			}
		} catch (error) {
			console.error(`Error parsing ${source.name} format:`, error);
			return null;
		}
	}

	/**
	 * @param {string} content
	 * @param {ImportSource} source
	 * @returns {Token[] | null}
	 */
	function parseQrContent(content, source) {
		try {
			switch (source.id) {
				case 'google-authenticator':
					return parseGoogleAuthFormat(content);
				default:
					return null;
			}
		} catch (error) {
			console.error(`Error parsing QR code from ${source.name}:`, error);
			return null;
		}
	}

	/**
	 * @param {string} content
	 * @returns {Token[]}
	 */
	function parseTrezurFormat(content) {
		const data = JSON.parse(content);
		if (!data.tokens || !Array.isArray(data.tokens)) {
			throw new Error('Invalid Trezur format');
		}

		return data.tokens.map((/** @type {any} */ token) =>
			tokenize({
				account: token.account || '',
				issuer: token.issuer || '',
				secret: token.secret,
				type: token.type === 'HOTP' ? 'HOTP' : 'TOTP',
				algorithm: token.algorithm || 'SHA1',
				digits: token.digits || 6,
				period: token.period || 30,
				counter: token.counter || 0
			})
		);
	}

	/**
	 * @param {string} content
	 * @returns {Token[]}
	 */
	function parseChronosFormat(content) {
		const data = JSON.parse(content);
		if (!data.tokens || !Array.isArray(data.tokens)) {
			throw new Error('Invalid Chronos format');
		}

		return data.tokens.map((/** @type {any} */ token) =>
			tokenize({
				account: token.account,
				issuer: token.issuer || '',
				secret: token.secret,
				type: token.type === 'HOTP' ? 'HOTP' : 'TOTP',
				algorithm: token.algorithm || 'SHA1',
				digits: token.digits || 6,
				period: token.period || 30,
				counter: token.counter || 0
			})
		);
	}

	/**
	 * @param {string} content
	 * @returns {Token[]}
	 */
	function parseTwoFASFormat(content) {
		const data = JSON.parse(content);
		if (!data.services || typeof data.services !== 'object') {
			throw new Error('Invalid 2FAS format');
		}

		const tokens = [];
		for (const key in data.services) {
			const service = data.services[key];
			if (!service.otp || !service.secret) continue;

			const otp = service.otp;
			tokens.push(
				tokenize({
					account: otp.account || '',
					issuer: otp.issuer || '',
					secret: service.secret,
					type: (otp.tokenType || '').toUpperCase() === 'HOTP' ? 'HOTP' : 'TOTP',
					algorithm: (otp.algorithm || '').toUpperCase() || 'SHA1',
					digits: otp.digits || 6,
					period: otp.period || 30,
					counter: otp.counter || 0
				})
			);
		}

		return tokens;
	}

	/**
	 * @param {string} content
	 * @returns {Token[]}
	 */
	function parseEnteFormat(content) {
		const lines = content.split('\n').filter((line) => line.trim().length > 0);

		// @ts-ignore TS cannot detect that filter(Boolean) filters out nulls
		return lines
			.map((line) => {
				try {
					const url = new URL(line);
					if (url.protocol !== 'otpauth:') throw new Error('Not an otpauth URL');

					const params = new URLSearchParams(url.search);
					const type = url.hostname.toUpperCase();
					const pathParts = url.pathname.substring(1).split(':');

					let issuer = '';
					let account = pathParts[0];

					if (pathParts.length > 1) {
						issuer = pathParts[0];
						account = pathParts[1];
					}

					// Override with issuer param if present
					issuer = params.get('issuer') || issuer;

					return tokenize({
						account: account,
						issuer: issuer,
						secret: params.get('secret') || '',
						type: type === 'HOTP' ? 'HOTP' : 'TOTP',
						algorithm: (params.get('algorithm') || 'SHA1').toUpperCase(),
						digits: parseInt(params.get('digits') || '6'),
						period: parseInt(params.get('period') || '30'),
						counter: parseInt(params.get('counter') || '0')
					});
				} catch (e) {
					console.error('Failed to parse otpauth URL:', e);
					return null;
				}
			})
			.filter(Boolean);
	}

	/**
	 * @param {string} content
	 * @returns {Token[]}
	 */
	function parseRaivoFormat(content) {
		const data = JSON.parse(content);
		const tokens = [];

		for (const key in data) {
			const entry = data[key];
			tokens.push(
				tokenize({
					account: entry.account || '',
					issuer: entry.issuer || '',
					secret: entry.secret,
					type: (entry.kind || '').toUpperCase() === 'HOTP' ? 'HOTP' : 'TOTP',
					algorithm: (entry.algorithm || '').toUpperCase(),
					digits: parseInt(entry.digits || '6'),
					period: parseInt(entry.timer || '30'),
					counter: parseInt(entry.counter || '0')
				})
			);
		}

		return tokens;
	}

	/**
	 * @param {string} content
	 * @returns {Token[]}
	 */
	function parseLastPassFormat(content) {
		const data = JSON.parse(content);
		if (!data.accounts || !Array.isArray(data.accounts)) {
			throw new Error('Invalid LastPass format');
		}

		return data.accounts.map((/** @type {any} */ account) =>
			tokenize({
				account: account.userName || '',
				issuer: account.issuerName || '',
				secret: account.secret,
				type: 'TOTP', // LastPass only supports TOTP
				algorithm: (account.algorithm || 'SHA1').toUpperCase(),
				digits: account.digits || 6,
				period: account.timeStep || 30,
				counter: 0
			})
		);
	}

	/**
	 * @param {string} content
	 * @returns {Token[]}
	 */
	function parseAegisFormat(content) {
		const data = JSON.parse(content);
		if (!data.db || !data.db.entries || !Array.isArray(data.db.entries)) {
			throw new Error('Invalid Aegis format');
		}

		return data.db.entries.map((/** @type {any} */ entry) => {
			/** @type {Tokenable} */
			const tokenData = {
				account: entry.name || '',
				issuer: entry.issuer || '',
				secret: entry.info.secret,
				type: (entry.type || '').toUpperCase() === 'HOTP' ? 'HOTP' : 'TOTP',
				algorithm: (entry.info.algo || 'SHA1').toUpperCase(),
				digits: entry.info.digits || 6,
				period: 30,
				counter: 0
			};

			if (tokenData.type === 'TOTP' && entry.info.period) {
				tokenData.period = entry.info.period;
			} else if (tokenData.type === 'HOTP' && entry.info.counter !== undefined) {
				tokenData.counter = entry.info.counter;
			}

			return tokenize(tokenData);
		});
	}

	/**
	 * @param {string} content
	 * @returns {Token[] | null}
	 */
	function parseGoogleAuthFormat(content) {
		if (!content.startsWith('otpauth-migration://')) {
			throw new Error('Invalid QR code. Please scan a Google Authenticator export QR code.');
		}

		let data;
		const dataIndex = content.indexOf('?data=');
		const ampIndex = content.indexOf('&data=');
		if (dataIndex !== -1) {
			data = content.substring(dataIndex + 6);
		} else if (ampIndex !== -1) {
			data = content.substring(ampIndex + 6);
		} else {
			data = content;
		}

		if (!data) {
			throw new Error('Invalid Google Authenticator QR code (no data payload).');
		}

		const decodedData = decodeURIComponent(data);
		const buffer = base64ToUint8Array(decodedData);
		const parsedTokenables = parseGoogleAuthenticatorPayload(buffer);

		return parsedTokenables && parsedTokenables.length > 0 ? parsedTokenables.map((t) => tokenize(t)) : null;
	}

	function close() {
		stopCamera();
		open = false;
	}

	onDestroy(() => stopCamera());
</script>

<Modal bind:open title="Import Tokens">
	{#if errorMessage && selectedSource?.id !== 'google-authenticator'}
		<div class="mb-4 rounded-lg bg-red-900/30 p-3 text-red-400">
			{errorMessage}
		</div>
	{/if}

	{#if selectedSource}
		<div class="mb-4">
			<p>Selected source: <strong>{selectedSource.name}</strong></p>
			{#if selectedSource.id === 'google-authenticator'}
				<p class="mt-1 text-sm text-zinc-400">Please scan the export QR code from your Google Authenticator app</p>
			{:else}
				<p class="mt-1 text-sm text-zinc-400">
					Please select a {selectedSource.fileType.toUpperCase()} file to import tokens from {selectedSource.name}
				</p>
			{/if}
		</div>

		{#if selectedSource.id === 'google-authenticator'}
			{#if errorMessage}
				<div class="mb-6 rounded-lg bg-red-900/30 p-4 text-center text-sm text-red-400">
					{errorMessage}
				</div>
				<button
					class="mb-6 flex w-full items-center justify-center gap-2 rounded-lg bg-zinc-800 py-4 text-white transition-colors hover:bg-zinc-700"
					onclick={startCamera}
				>
					<ScanQrCodeIcon size={20} />
					<span>Start QR Scanner</span>
				</button>
			{:else if showCameraFeed}
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
					<span>Start QR Scanner</span>
				</button>
			{/if}
		{:else}
			<input
				type="file"
				accept={`.${selectedSource.fileType}`}
				bind:this={fileInput}
				onchange={handleFileSelected}
				class="hidden"
			/>
		{/if}

		<div class="flex gap-2">
			<button class="flex-1 rounded-lg bg-zinc-800 py-3 hover:bg-zinc-700" onclick={resetSelection}> Back </button>
			{#if selectedSource.id !== 'google-authenticator'}
				<button
					class="flex-1 rounded-lg bg-[#EB3912] py-3 transition-colors hover:bg-[#D83511]"
					onclick={() => fileInput?.click()}
				>
					Select File
				</button>
			{/if}
		</div>
	{:else}
		<p class="mb-4">Select a service to import tokens from:</p>
		<div class="mb-4 grid grid-cols-2 gap-2">
			{#each importSources as source (source.id)}
				<button
					class="rounded-lg bg-zinc-800 p-4 text-left transition-colors hover:bg-zinc-700"
					onclick={() => selectSource(source)}
				>
					{source.name}
				</button>
			{/each}
		</div>
		<button class="w-full rounded-lg bg-zinc-800 py-3 transition-colors hover:bg-zinc-700" onclick={close}>
			Cancel
		</button>
	{/if}
</Modal>
