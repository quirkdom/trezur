/**
 * @module LocalKVVault
 * @typedef {import("$lib/types").KVStorage} KVStorage
 */

import { cip, pic } from '$lib/utils/salada';

const T_ES_ = 'T_ES_';
const BAK_LOCALVAULT = 'BAK_LOCALVAULT';

/**
 * Pack and encrypt a value into a wrapped ciphertext structure.
 *
 * @param {any} value The JSON-serializable structure to encrypt.
 * @param {CryptoKey} cryptoKey Key to encrypt with.
 * @returns {Promise<{ iv: number[], data: number[] }>}
 */
async function pack(value, cryptoKey) {
	const jsonStr = JSON.stringify(value);
	const encoded = new TextEncoder().encode(jsonStr);
	const iv = crypto.getRandomValues(new Uint8Array(12));

	const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cryptoKey, encoded);

	return {
		iv: Array.from(iv),
		data: Array.from(new Uint8Array(ciphertext))
	};
}

/**
 * Decrypt and unpack a wrapped ciphertext structure back to its original value.
 *
 * @param {{ iv: number[], data: number[] }} wrapped The wrapped ciphertext structure.
 * @param {CryptoKey} cryptoKey Key to decrypt with.
 * @returns {Promise<any>}
 */
async function unpack(wrapped, cryptoKey) {
	const { iv, data } = wrapped;
	const decrypted = await crypto.subtle.decrypt(
		{ name: 'AES-GCM', iv: new Uint8Array(iv) },
		cryptoKey,
		new Uint8Array(data)
	);
	const jsonStr = new TextDecoder().decode(decrypted);
	return JSON.parse(jsonStr);
}

/**
 * Local-storage based persistent, encrypted Key-Value vault.
 * Uses AES-256-GCM encryption mode.
 *
 * @implements {KVStorage}
 */
export class LocalKVVault {
	/** @type {CryptoKey} */
	#cryptoKey;

	/** @type {CryptoKey | null} */
	#nextCryptoKey = null;

	/**
	 * @param {CryptoKey} cryptoKey Must be a 256-bit (32 bytes) key for AES-256-GCM.
	 */
	constructor(cryptoKey) {
		this.#cryptoKey = cryptoKey;
	}

	/**
	 * @param {string} key
	 */
	async get(key, next = false) {
		let cryptoKey = this.#cryptoKey;

		if (next) {
			if (!this.#nextCryptoKey) throw new Error('[LocalKVVault] Cannot get; no next CryptoKey in vault');
			cryptoKey = this.#nextCryptoKey;
		}

		const stored = localStorage.getItem(cip(T_ES_ + key));
		if (!stored) return null;

		return await unpack(JSON.parse(stored), cryptoKey);
	}

	/**
	 * @param {string} key
	 * @param {any} value
	 */
	async set(key, value, next = false) {
		let cryptoKey = this.#cryptoKey;

		if (next) {
			if (!this.#nextCryptoKey) throw new Error('[LocalKVVault] Cannot set; no next CryptoKey in vault');
			cryptoKey = this.#nextCryptoKey;
		}

		const wrapped = await pack(value, cryptoKey);
		localStorage.setItem(cip(T_ES_ + key), JSON.stringify(wrapped));
	}

	/**
	 * @param {string} key
	 */
	async delete(key) {
		localStorage.removeItem(cip(T_ES_ + key));
	}

	static #keys() {
		return Object.keys(localStorage)
			.map((key) => pic(key))
			.filter((key) => key.startsWith(T_ES_))
			.map((key) => key.slice(T_ES_.length));
	}

	/**
	 * Static method to wipe all vault entries directly from persistent storage without requiring an instance.
	 */
	static clear() {
		this.#keys().forEach((key) => localStorage.removeItem(cip(T_ES_ + key)));
		localStorage.removeItem(cip(BAK_LOCALVAULT));
	}

	/**
	 * Returns all active keys in this vault (excluding backup keys).
	 * @returns {string[]}
	 */
	keys() {
		return LocalKVVault.#keys();
	}

	/**
	 * Clear all entries from this vault. Purges all items stored in this vault, from persistent storage.
	 *
	 * @alias purge
	 */
	async clear() {
		LocalKVVault.clear();
	}

	/**
	 * Consolidates all active vault entries, encrypts them under the current key,
	 * and writes them to the persistent BAK_LOCALVAULT journal.
	 *
	 * @returns {Promise<Record<string, any>>} Returns the consolidated backup data.
	 */
	async #backupVault() {
		const vaultKeys = this.keys();
		const backupData = await Promise.all(vaultKeys.map(async (key) => [key, await this.get(key)]))
			.then((entries) => entries.filter(([, val]) => val !== null))
			.then((valid) => Object.fromEntries(valid));

		const wrapped = await pack(backupData, this.#cryptoKey);
		localStorage.setItem(cip(BAK_LOCALVAULT), JSON.stringify(wrapped));

		return backupData;
	}

	/**
	 * Reads the consolidated journal from BAK_LOCALVAULT, decrypts it using the current key,
	 * restores the primary entries to active storage, and cleans up the journal.
	 */
	async #restoreVault() {
		const stored = localStorage.getItem(cip(BAK_LOCALVAULT));
		if (!stored) return;

		const backupData = await unpack(JSON.parse(stored), this.#cryptoKey);
		if (backupData) {
			for (const [key, value] of Object.entries(backupData)) await this.set(key, value);
		}

		localStorage.removeItem(cip(BAK_LOCALVAULT));
	}

	/**
	 * Prepare vault re-key transaction to a new CryptoKey.
	 * Bundles and encrypts all active keys under the old key into BAK_LOCALVAULT,
	 * then overwrites primary keys with values encrypted under the new key.
	 *
	 * @param {CryptoKey} newCryptoKey
	 */
	async prepareRekeyTxn(newCryptoKey) {
		this.#nextCryptoKey = newCryptoKey;

		// 1. Consolidate and write the backup under the current cryptoKey to BAK_LOCALVAULT
		const backupData = await this.#backupVault();

		// 2. Overwrite all primary keys with the new cryptoKey using set(..., true)
		for (const [key, value] of Object.entries(backupData)) {
			await this.set(key, value, true);
		}
	}

	/**
	 * Commit vault re-key transaction by applying the new CryptoKey and deleting the consolidated backup.
	 */
	async commitRekeyTxn() {
		if (this.#nextCryptoKey) {
			this.#cryptoKey = this.#nextCryptoKey;
			this.#nextCryptoKey = null;
		}
		localStorage.removeItem(cip(BAK_LOCALVAULT));
	}

	/**
	 * Roll back migration by restoring all primary keys from the consolidated backup and deleting it.
	 */
	async rollbackRekeyTxn() {
		this.#nextCryptoKey = null;
		await this.#restoreVault();
	}
}
