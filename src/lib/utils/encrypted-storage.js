/**
 * @typedef {import('$lib/types').AsyncStorageEngine} AsyncStorageEngine
 * @typedef {import('$lib/types').EncryptedStorage} EncryptedStorage
 */
import { browser } from '$app/environment';

import { cip, pic } from './salada';

const T_ES_ = 'T_ES_';
const T_ES_KDF_META = 'T_ES__kdf_meta__';
const T_ES_WRAPPED_MSK = 'T_ES__wrapped_msk__';
const AES_GCM = 'AES-GCM';

/**
 * @implements {EncryptedStorage}
 */
export class AESGCMEncryptedStorage {
	/** @type {AsyncStorageEngine} */
	storageEngine;
	/** @type {CryptoKey} */
	#cryptoKey;

	/**
	 * @param {AsyncStorageEngine} engine
	 * @param {CryptoKey} cryptoKey
	 */
	constructor(engine, cryptoKey) {
		this.storageEngine = engine;
		this.#cryptoKey = cryptoKey;
	}

	/**
	 * @param {string} key
	 * @param {any} value
	 */
	async set(key, value) {
		const iv = crypto.getRandomValues(new Uint8Array(12));
		const encodedValue = new TextEncoder().encode(JSON.stringify(value));

		const encrypted = await crypto.subtle.encrypt({ name: AES_GCM, iv }, this.#cryptoKey, encodedValue);

		const storageValue = {
			iv: Array.from(iv),
			data: Array.from(new Uint8Array(encrypted))
		};

		await this.storageEngine.setItem(cip(T_ES_ + key), JSON.stringify(storageValue));
	}

	/**
	 * @param {string} key
	 */
	async get(key) {
		const stored = await this.storageEngine.getItem(cip(T_ES_ + key));
		if (!stored) return null;

		const { iv, data } = JSON.parse(stored);
		try {
			const decrypted = await crypto.subtle.decrypt(
				{ name: AES_GCM, iv: new Uint8Array(iv) },
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
		await this.storageEngine.removeItem(cip(T_ES_ + key));
	}

	async #keys() {
		return (await this.storageEngine.keys())
			.map((key) => pic(key))
			.filter((key) => key.startsWith(T_ES_))
			.map((key) => key.slice(T_ES_.length));
	}

	async purge() {
		await Promise.allSettled((await this.#keys()).map((key) => this.delete(key)));
		await this.storageEngine.removeItem(T_ES_WRAPPED_MSK);
		await this.storageEngine.removeItem(T_ES_KDF_META);
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
