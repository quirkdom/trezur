/**
 * @typedef {import('$lib/types').AsyncStorageEngine} AsyncStorageEngine
 * @typedef {import('$lib/types').EncryptedStorage} EncryptedStorage
 */
import { browser } from '$app/environment';
import { cip, ds, generateKDFParams, pic } from './salada';

const ANTI_CTOR_TOKEN = Symbol('AntiConstructorToken');
const T_ES_ = 'T_ES_';
const T_ES_KDF_META = 'T_ES__kdf_meta__';
const T_ES_SENTINEL = '_sentinel__';
const AES_GCM = 'AES-GCM';

/**
 * @implements {EncryptedStorage}
 */
export class AESGCMEncryptedStorage {
	/** @type {AsyncStorageEngine} */
	storageEngine;
	/** @type {CryptoKey | undefined}*/
	#cryptoKey;
	/**
	 * @type {boolean}
	 * @todo Remove this once we have migrated all users
	 */
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
	 * @param {string} kdfAlgorithm
	 * @param {Uint8Array<ArrayBuffer>} saltBytes
	 * @param {boolean} [isLegacy=false]
	 *
	 * @todo Remove isLegacy opt and simpilfy, after all users have migrated
	 */
	#makeKDFMetadata(kdfAlgorithm, saltBytes, isLegacy = false) {
		const kdfProps = generateKDFParams(kdfAlgorithm, saltBytes);

		return {
			v: isLegacy ? 0 : 1,
			...kdfProps,
			...(isLegacy ? { iterations: 100000 } : {})
		};
	}

	/**
	 * Get or create metadata with KDF parameters and random salt
	 * @param {string} passkey
	 *
	 * @todo Once majority of users have migrated, remove the legacy salt derivation
	 */
	async #getOrCreateKDFMetadata(passkey) {
		const stored = await this.storageEngine.getItem(T_ES_KDF_META);
		if (stored) {
			const metadata = JSON.parse(stored);
			if (metadata.v < 1) {
				// Force upgrade: create new metadata with random salt for migration
				const saltBytes = crypto.getRandomValues(new Uint8Array(32));
				const newMetadata = this.#makeKDFMetadata('PBKDF2-SHA256', saltBytes);
				await this.storageEngine.setItem(T_ES_KDF_META, JSON.stringify(newMetadata));
				return newMetadata;
			} else {
				return metadata;
			}
		}

		const hasData = (await this.storageEngine.keys()).some((key) => pic(key).startsWith(T_ES_));
		if (hasData) {
			// Use old salt derived from passkey
			const oldSalt = await ds(passkey);
			const metadata = this.#makeKDFMetadata('PBKDF2-SHA256', oldSalt, true);
			await this.storageEngine.setItem(T_ES_KDF_META, JSON.stringify(metadata));
			this.needsMigration = true;
			return metadata;
		} else {
			// Create new random salt
			const saltBytes = crypto.getRandomValues(new Uint8Array(32));
			const metadata = this.#makeKDFMetadata('PBKDF2-SHA256', saltBytes);
			await this.storageEngine.setItem(T_ES_KDF_META, JSON.stringify(metadata));
			return metadata;
		}
	}

	/**
	 * @param {string} passkey
	 */
	async #makeCryptoKey(passkey) {
		const metadata = await this.#getOrCreateKDFMetadata(passkey);
		const saltBytes = Uint8Array.from(atob(metadata.salt), (c) => c.charCodeAt(0));

		const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(passkey), metadata.name, false, [
			'deriveKey'
		]);

		return crypto.subtle.deriveKey(
			{
				name: metadata.name,
				salt: saltBytes,
				iterations: metadata.iterations,
				hash: metadata.hash
			},
			keyMaterial,
			{ name: AES_GCM, length: 256 },
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

		if (!this.#cryptoKey) throw new Error('Encryption not available. Did you await EncryptedStorage.make()?');

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

	/**
	 * Set the sentinel value to verify passcode on unlock
	 */
	async setSentinel() {
		await this.set(T_ES_SENTINEL, { v: 1, ok: 'ok' });
	}

	/**
	 * Verify if the current key can decrypt the sentinel
	 * @returns {Promise<boolean>}
	 */
	async verifySentinel() {
		const sentinel = await this.get(T_ES_SENTINEL);
		return sentinel?.v === 1 && sentinel?.ok === 'ok';
	}

	async purge() {
		const keys = await this.storageEngine.keys();
		for (const key of keys) {
			if (key.startsWith(T_ES_) || pic(key).startsWith(T_ES_)) await this.storageEngine.removeItem(key);
		}
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
