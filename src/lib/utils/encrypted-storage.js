/**
 * @typedef {import('$lib/types').AsyncStorageEngine} AsyncStorageEngine
 * @typedef {import('$lib/types').EncryptedStorage} EncryptedStorage
 */
import { browser } from '$app/environment';
import { ds, cip } from './salada';

const ANTI_CTOR_TOKEN = Symbol('AntiConstructorToken');

/**
 * @implements {EncryptedStorage}
 */
export class AESGCMEncryptedStorage {
	/** @type {AsyncStorageEngine} */
	storageEngine;
	/** @type {CryptoKey | undefined}*/
	#cryptoKey;

	/**
	 * @param {AsyncStorageEngine} engine
	 * @param {symbol} [initToken]
	 */
	constructor(engine, initToken) {
		if (initToken !== ANTI_CTOR_TOKEN)
			throw new Error(
				'Cannot construct EncryptedStorage directly; await EncryptedStorage.make() instead.'
			);

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
	 * @param {string} passkey
	 */
	async #makeCryptoKey(passkey) {
		const salt = await ds(passkey);

		const keyMaterial = await crypto.subtle.importKey(
			'raw',
			new TextEncoder().encode(passkey),
			'PBKDF2',
			false,
			['deriveKey']
		);

		return crypto.subtle.deriveKey(
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
	}

	/**
	 * @param {string} key
	 * @param {any} value
	 */
	async set(key, value) {
		if (!this.#cryptoKey)
			throw new Error('Encryption not available. Did you await EncryptedLocalStorage.make()?');

		const iv = crypto.getRandomValues(new Uint8Array(12));
		const encodedValue = new TextEncoder().encode(JSON.stringify(value));

		const encrypted = await crypto.subtle.encrypt(
			{ name: 'AES-GCM', iv },
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

		if (!this.#cryptoKey)
			throw new Error('Encryption not available. Did you await EncryptedLocalStorage.make()?');

		const { iv, data } = JSON.parse(stored);
		try {
			const decrypted = await crypto.subtle.decrypt(
				{ name: 'AES-GCM', iv: new Uint8Array(iv) },
				this.#cryptoKey,
				new Uint8Array(data)
			);

			return JSON.parse(new TextDecoder().decode(decrypted));
		} catch (error) {
			console.error('Decryption failed:', error);
			return null;
		}
	}

	/**
	 * @param {string} key
	 */
	async delete(key) {
		await this.storageEngine.removeItem(cip('T_ES_' + key));
	}

	async purge() {
		const keys = await this.storageEngine.keys();
		keys.forEach((key) => {
			if (key.startsWith(cip('T_ES_'))) {
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
