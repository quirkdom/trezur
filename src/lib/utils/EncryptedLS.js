import BS from './BS.js';

export default class EncryptedLocalStorage {
	constructor(passkey) {
		this.passkey = passkey;
		this.cryptoKey = null;
	}

	async #getDerivedSalt(passcode) {
		const baseKey = await crypto.subtle.importKey(
			'raw',
			new TextEncoder().encode(passcode),
			'PBKDF2',
			false,
			['deriveBits']
		);

		const saltBits = await crypto.subtle.deriveBits(
			{
				name: 'PBKDF2',
				salt: new TextEncoder().encode(BS()),
				iterations: 1,
				hash: 'SHA-256'
			},
			baseKey,
			256 // 32 bytes
		);

		return new Uint8Array(saltBits);
	}

	async #getCryptoKey() {
		if (this.cryptoKey) return this.cryptoKey;

		const salt = await this.#getDerivedSalt(this.passkey);

		const keyMaterial = await crypto.subtle.importKey(
			'raw',
			new TextEncoder().encode(this.passkey),
			'PBKDF2',
			false,
			['deriveKey']
		);

		this.cryptoKey = await crypto.subtle.deriveKey(
			{
				name: 'PBKDF2',
				salt,
				iterations: 100000,
				hash: 'SHA-256'
			},
			keyMaterial,
			{ name: 'AES-GCM', length: 256 },
			true,
			['encrypt', 'decrypt']
		);

		return this.cryptoKey;
	}

	async set(key, value) {
		const cryptoKey = await this.#getCryptoKey();
		const iv = crypto.getRandomValues(new Uint8Array(12));
		const encodedValue = new TextEncoder().encode(JSON.stringify(value));

		const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cryptoKey, encodedValue);

		const storageValue = {
			iv: Array.from(iv),
			data: Array.from(new Uint8Array(encrypted))
		};

		localStorage.setItem('T_ES_' + key, JSON.stringify(storageValue));
	}

	async get(key) {
		const stored = localStorage.getItem('T_ES_' + key);
		if (!stored) return null;

		const { iv, data } = JSON.parse(stored);
		const cryptoKey = await this.#getCryptoKey();

		try {
			const decrypted = await crypto.subtle.decrypt(
				{ name: 'AES-GCM', iv: new Uint8Array(iv) },
				cryptoKey,
				new Uint8Array(data)
			);

			return JSON.parse(new TextDecoder().decode(decrypted));
		} catch (error) {
			console.error('Decryption failed:', error);
			return null;
		}
	}

	remove(key) {
		localStorage.removeItem('T_ES_' + key);
	}

	purge() {
		Object.keys(localStorage).forEach((key) => {
			if (key.startsWith('T_ES_')) {
				localStorage.removeItem(key);
			}
		});
	}
}
