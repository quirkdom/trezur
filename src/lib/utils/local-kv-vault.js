/**
 * @module LocalKVVault
 * @typedef {import("$lib/types").KVStorage} KVStorage
 */

import { cip, pic } from '$lib/utils/salada.js';

const T_ES_ = 'T_ES_';

/**
 * Local-storage based persistent, encrypted Key-Value vault.
 * Uses AES-256-GCM encryption mode.
 *
 * @implements {KVStorage}
 */
export class LocalKVVault {
	/** @type {CryptoKey} */
	#cryptoKey;

	/**
	 * @param {CryptoKey} cryptoKey Must be a 256-bit (32 bytes) key for AES-256-GCM.
	 */
	constructor(cryptoKey) {
		this.#cryptoKey = cryptoKey;
	}

	/**
	 * @param {string} key
	 */
	async get(key) {
		const stored = localStorage.getItem(cip(T_ES_ + key));
		if (!stored) return null;

		try {
			const { iv, data } = JSON.parse(stored);
			const decrypted = await crypto.subtle.decrypt(
				{ name: 'AES-GCM', iv: new Uint8Array(iv) },
				this.#cryptoKey,
				new Uint8Array(data)
			);
			const jsonStr = new TextDecoder().decode(decrypted);
			return JSON.parse(jsonStr);
		} catch (err) {
			console.error(`[LocalKVVault] Failed to decrypt key ${key}:`, err);
			return null;
		}
	}

	/**
	 * @param {string} key
	 * @param {any} value
	 */
	async set(key, value) {
		const jsonStr = JSON.stringify(value);
		const encoded = new TextEncoder().encode(jsonStr);
		const iv = crypto.getRandomValues(new Uint8Array(12));

		const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, this.#cryptoKey, encoded);

		const wrapped = {
			iv: Array.from(iv),
			data: Array.from(new Uint8Array(ciphertext))
		};
		localStorage.setItem(cip(T_ES_ + key), JSON.stringify(wrapped));
	}

	/**
	 * @param {string} key
	 */
	async delete(key) {
		localStorage.removeItem(cip(T_ES_ + key));
	}

	/**
	 * Clear all entries from this vault. Purges all items stored in this vault, from persistent storage.
	 *
	 * @alias purge
	 */
	async clear() {
		for (const key of Object.keys(localStorage)) {
			if (key && pic(key).startsWith(T_ES_)) {
				localStorage.removeItem(key);
			}
		}
	}
}
