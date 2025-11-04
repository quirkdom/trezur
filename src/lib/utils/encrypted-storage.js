/**
 * @typedef {import('$lib/types').AsyncStorageEngine} AsyncStorageEngine
 * @typedef {import('$lib/types').EncryptedStorage} EncryptedStorage
 */
import { browser } from '$app/environment';
import { cip, ds, generateKDFParams } from './salada';

const ANTI_CTOR_TOKEN = Symbol('AntiConstructorToken');
const METADATA_KEY = 'T_ES_meta';
const SENTINEL_KEY = '__passcode_sentinel__';
const DEFAULT_ITERATIONS = 400000;

/**
 * @implements {EncryptedStorage}
 */
export class AESGCMEncryptedStorage {
	static #CRYPTO_KEY_TYPE = 'AES-GCM';

	/** @type {AsyncStorageEngine} */
	storageEngine;
	/** @type {CryptoKey | undefined}*/
	#cryptoKey;
	/** @type {boolean} */
	needsMigration = false;

	/**
	 * @param {AsyncStorageEngine} engine
	 * @param {symbol} [initToken]
	 */
	constructor(engine, initToken) {
		if (initToken !== ANTI_CTOR_TOKEN)
			throw new Error('Cannot construct EncryptedStorage directly; await EncryptedStorage.make() instead.');

		this.storageEngine = engine;
	}

	/**
	 * @param {AsyncStorageEngine} engine
	 * @param {string} passkey
	 */
	static async make(engine, passkey) {
		const instance = new AESGCMEncryptedStorage(engine, ANTI_CTOR_TOKEN);
		instance.#cryptoKey = await instance.#makeCryptoKey(passkey);
		return instance;
	}

	/**
	 * @param {string} algorithm
	 * @param {Uint8Array<ArrayBuffer>} saltBytes
	 * @param {boolean} [isLegacy=false]
	 */
	#makeMetadata(algorithm, saltBytes, isLegacy = false) {
		const kdfProps = generateKDFParams(algorithm, saltBytes);

		return {
			v: isLegacy ? 0 : 1,
			...kdfProps,
			...(isLegacy ? { iterations: 10000 } : {})
		};
	}

	/**
	 * Get or create metadata with KDF parameters and random salt
	 * @param {string} passkey
	 * @returns {Promise<{metadata: {v: number, kdf: string, iterations: number, salt: string}, isNew: boolean}>}
	 */
	async #getOrCreateMetadata(passkey) {
		const stored = await this.storageEngine.getItem(METADATA_KEY);
		if (stored) {
			const metadata = JSON.parse(stored);
			if (metadata.v < 1) {
				// Force upgrade: create new metadata with random salt for migration
				const saltBytes = crypto.getRandomValues(new Uint8Array(32));
				const newMetadata = {
					v: 1,
					kdf: 'PBKDF2-SHA256',
					iterations: DEFAULT_ITERATIONS,
					salt: btoa(String.fromCharCode(...saltBytes))
				};
				await this.storageEngine.setItem(METADATA_KEY, JSON.stringify(newMetadata));
				return { metadata: newMetadata, isNew: true };
			} else {
				return { metadata, isNew: false };
			}
		}

		const hasData = (await this.storageEngine.keys()).some((k) => k.startsWith(cip('T_ES_')));
		if (hasData) {
			// Use old salt derived from passkey
			const oldSalt = await ds(passkey);
			const metadata = {
				v: 0, // legacy
				kdf: 'PBKDF2-SHA256',
				iterations: 100000,
				salt: btoa(String.fromCharCode(...oldSalt))
			};
			await this.storageEngine.setItem(METADATA_KEY, JSON.stringify(metadata));
			this.needsMigration = true;
			return { metadata, isNew: true };
		} else {
			// Create new random salt
			const saltBytes = crypto.getRandomValues(new Uint8Array(32));
			const metadata = {
				v: 1,
				kdf: 'PBKDF2-SHA256',
				iterations: DEFAULT_ITERATIONS,
				salt: btoa(String.fromCharCode(...saltBytes))
			};
			await this.storageEngine.setItem(METADATA_KEY, JSON.stringify(metadata));
			return { metadata, isNew: true };
		}
	}

	/**
	 * @param {string} passkey
	 */
	async #makeCryptoKey(passkey) {
		const { metadata } = await this.#getOrCreateMetadata(passkey);
		const saltBytes = Uint8Array.from(atob(metadata.salt), (c) => c.charCodeAt(0));

		const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(passkey), 'PBKDF2', false, [
			'deriveKey'
		]);

		return crypto.subtle.deriveKey(
			{
				name: 'PBKDF2',
				salt: saltBytes,
				iterations: metadata.iterations,
				hash: 'SHA-256'
			},
			keyMaterial,
			{ name: AESGCMEncryptedStorage.#CRYPTO_KEY_TYPE, length: 256 },
			false,
			['encrypt', 'decrypt']
		);
	}

	/**
	 * @param {string} key
	 * @param {any} value
	 */
	async set(key, value) {
		if (!this.#cryptoKey) throw new Error('Encryption not available. Did you await EncryptedStorage.make()?');

		const iv = crypto.getRandomValues(new Uint8Array(12));
		const encodedValue = new TextEncoder().encode(JSON.stringify(value));

		const encrypted = await crypto.subtle.encrypt(
			{ name: AESGCMEncryptedStorage.#CRYPTO_KEY_TYPE, iv },
			this.#cryptoKey,
			encodedValue
		);

		const storageValue = {
			iv: Array.from(iv),
			data: Array.from(new Uint8Array(encrypted))
		};

		await this.storageEngine.setItem(cip('T_ES_' + key), JSON.stringify(storageValue));
	}

	/**
	 * @param {string} key
	 * @returns {Promise<any>}
	 */
	async get(key) {
		const stored = await this.storageEngine.getItem(cip('T_ES_' + key));
		if (!stored) return null;

		if (!this.#cryptoKey) throw new Error('Encryption not available. Did you await EncryptedStorage.make()?');

		const { iv, data } = JSON.parse(stored);
		try {
			const decrypted = await crypto.subtle.decrypt(
				{ name: AESGCMEncryptedStorage.#CRYPTO_KEY_TYPE, iv: new Uint8Array(iv) },
				this.#cryptoKey,
				new Uint8Array(data)
			);

			return JSON.parse(new TextDecoder().decode(decrypted));
		} catch {
			return null;
		}
	}

	/**
	 * @param {string} key
	 */
	async delete(key) {
		await this.storageEngine.removeItem(cip('T_ES_' + key));
	}

	/**
	 * Set the sentinel value to verify passcode on unlock
	 */
	async setSentinel() {
		await this.set(SENTINEL_KEY, { v: 1, ok: true });
	}

	/**
	 * Verify if the current key can decrypt the sentinel
	 * @returns {Promise<boolean>}
	 */
	async verifySentinel() {
		const sentinel = await this.get(SENTINEL_KEY);
		return sentinel?.v === 1 && sentinel?.ok === true;
	}

	async purge() {
		const keys = await this.storageEngine.keys();
		keys.forEach((key) => {
			if (key.startsWith(cip('T_ES_')) || key === METADATA_KEY) {
				this.storageEngine.removeItem(key);
			}
		});
	}
}

/**
 * A localStorage proxy that implements the AsyncStorageEngine interface.
 * Makes the synchronous localStorage API compatible with the async interface.
 * @implements {AsyncStorageEngine}
 */
export class LocalStorageEngine {
	constructor() {
		if (!browser) {
			throw new Error('LocalStorageEngine can only be used in browser environments');
		}
	}

	/**
	 * @param {string} key
	 * @returns {Promise<string | null>}
	 */
	async getItem(key) {
		return localStorage.getItem(key);
	}

	/**
	 * @param {string} key
	 * @param {string} value
	 * @returns {Promise<void>}
	 */
	async setItem(key, value) {
		localStorage.setItem(key, value);
	}

	/**
	 * @param {string} key
	 * @returns {Promise<void>}
	 */
	async removeItem(key) {
		localStorage.removeItem(key);
	}

	/**
	 * @returns {Promise<string[]>}
	 */
	async keys() {
		return Object.keys(localStorage);
	}

	/**
	 * @returns {Promise<void>}
	 */
	async clear() {
		localStorage.clear();
	}
}
