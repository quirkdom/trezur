<script>
	/**
	 * @typedef {Object} ImportSource
	 * @property {string} id
	 * @property {string} name
	 * @property {string} fileType
	 */
	import Modal from '../ui/Modal.svelte';
	import { tokenize } from '$lib/state/tokens.svelte';

	let { open = $bindable(false), handleImport } = $props();

	/** @type {ImportSource[]} */
	const importSources = [
		{ id: 'lastpass', name: 'LastPass', fileType: 'json' },
		{ id: 'raivo', name: 'Raivo OTP', fileType: 'json' },
		{ id: 'twofas', name: '2FAS', fileType: 'json' },
		{ id: 'ente', name: 'Ente', fileType: 'txt' },
		{ id: 'aegis', name: 'Aegis', fileType: 'json' },
		{ id: 'chronos', name: 'Chronos', fileType: 'json' },
		{ id: 'trezur', name: 'Trezur', fileType: 'json' }
		// { id: 'google-authenticator', name: 'Google Authenticator', fileType: 'qr' } // TODO: this requires a QR code scanner
	];

	/** @type {ImportSource | null} */
	let selectedSource = $state(null);
	/** @type {HTMLInputElement | null} */
	let fileInput = $state(null);
	let errorMessage = $state('');

	/**
	 * @param {ImportSource | null} source
	 */
	function selectSource(source) {
		selectedSource = source;
		setTimeout(() => {
			fileInput?.click();
		}, 100);
	}

	function resetSelection() {
		selectedSource = null;
		errorMessage = '';
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
	 * @param {string} content
	 * @param {ImportSource} source
	 * @returns {import('$lib/types').Token[] | null}
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
	 * @returns {import('$lib/types').Token[]}
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
	 * @returns {import('$lib/types').Token[]}
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
	 * @returns {import('$lib/types').Token[]}
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
	 * @returns {import('$lib/types').Token[]}
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
	 * @returns {import('$lib/types').Token[]}
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
	 * @returns {import('$lib/types').Token[]}
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
	 * @returns {import('$lib/types').Token[]}
	 */
	function parseAegisFormat(content) {
		const data = JSON.parse(content);
		if (!data.db || !data.db.entries || !Array.isArray(data.db.entries)) {
			throw new Error('Invalid Aegis format');
		}

		return data.db.entries.map((/** @type {any} */ entry) => {
			/** @type {import('$lib/types').Tokenable} */
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

	function close() {
		open = false;
	}
</script>

<Modal bind:open title="Import Tokens">
	{#if errorMessage}
		<div class="mb-4 rounded-lg bg-red-900/30 p-3 text-red-400">
			{errorMessage}
		</div>
	{/if}

	{#if selectedSource}
		<div class="mb-4">
			<p>Selected source: <strong>{selectedSource.name}</strong></p>
			<p class="mt-1 text-sm text-zinc-400">
				Please select a {selectedSource.fileType.toUpperCase()} file to import tokens from {selectedSource.name}
			</p>
		</div>
		<input
			type="file"
			accept={`.${selectedSource.fileType}`}
			bind:this={fileInput}
			onchange={handleFileSelected}
			class="hidden"
		/>
		<div class="flex gap-2">
			<button class="flex-1 rounded-lg bg-zinc-800 py-3 hover:bg-zinc-700" onclick={resetSelection}>
				Back
			</button>
			<button
				class="flex-1 rounded-lg bg-[#EB3912] py-3 transition-colors hover:bg-[#D83511]"
				onclick={() => fileInput?.click()}
			>
				Select File
			</button>
		</div>
	{:else}
		<p class="mb-4">Select a service to import tokens from:</p>
		<div class="mb-4 grid grid-cols-2 gap-2">
			{#each importSources as source}
				<button
					class="rounded-lg bg-zinc-800 p-4 text-left transition-colors hover:bg-zinc-700"
					onclick={() => selectSource(source)}
				>
					{source.name}
				</button>
			{/each}
		</div>
		<button
			class="w-full rounded-lg bg-zinc-800 py-3 transition-colors hover:bg-zinc-700"
			onclick={close}
		>
			Cancel
		</button>
	{/if}
</Modal>
