/**
 * @typedef {import('$lib/types').AsyncStorageEngine} AsyncStorageEngine
 * @typedef {import('$lib/types').EncryptedStorage} EncryptedStorage
 */
import { browser } from '$app/environment';
import { cip, ds, generateKDFParams, pic } from './salada';

const ANTI_CTOR_TOKEN = Symbol('AntiConstructorToken');
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
	/** @type {Uint8Array | undefined} */
	#msk;
	/** @type {CryptoKey | undefined}*/
	#cryptoKey;

	get msk() {
		return this.#msk;
	}
	/**
	 * @type {boolean}
	 * @todo Remove this once we have migrated all users
	 */
	needsMigration = false;

	someId = -1; // for debugging. TODO: remove this before production

	/**
	 * @param {AsyncStorageEngine} engine
	 * @param {symbol} [initToken]
	 */
	constructor(engine, initToken) {
		if (initToken !== ANTI_CTOR_TOKEN)
			throw new Error('Cannot construct EncryptedStorage directly; await EncryptedStorage.make() instead.');

		this.storageEngine = engine;
		this.someId = Math.random();
	}

	/**
	 * @param {AsyncStorageEngine} engine
	 * @param {string} passkey
	 * @param {object} [options]
	 * @param {Uint8Array} [options.existingMsk]
	 * @param {Uint8Array} [options.importedMsk]
	 */
	static async make(engine, passkey, options = {}) {
		const instance = new AESGCMEncryptedStorage(engine, ANTI_CTOR_TOKEN);

		const lwk = await instance.#makeLwk(passkey);

		if (instance.needsMigration) {
			instance.#cryptoKey = lwk;
			return instance;
		}

		let currentMsk;

		if (options.importedMsk) {
			currentMsk = options.importedMsk;
			await instance.#wrapAndSaveMsk(lwk, currentMsk);
		} else if (options.existingMsk) {
			currentMsk = options.existingMsk;
			await instance.#wrapAndSaveMsk(lwk, currentMsk);
		} else {
			const storedWrapped = await engine.getItem(T_ES_WRAPPED_MSK);
			if (storedWrapped) {
				const { iv, data } = JSON.parse(storedWrapped);
				const decrypted = await crypto.subtle.decrypt(
					{ name: AES_GCM, iv: new Uint8Array(iv) },
					lwk,
					new Uint8Array(data)
				);
				currentMsk = new Uint8Array(decrypted);
			} else {
				currentMsk = crypto.getRandomValues(new Uint8Array(32));
				await instance.#wrapAndSaveMsk(lwk, currentMsk);
			}
		}

		instance.#msk = currentMsk;
		instance.#cryptoKey = await crypto.subtle.importKey('raw', /** @type {any} */ (currentMsk), { name: AES_GCM }, false, ['encrypt', 'decrypt']);

		return instance;
	}

	/**
	 * @param {CryptoKey} lwk
	 * @param {Uint8Array} msk
	 */
	async #wrapAndSaveMsk(lwk, msk) {
		const iv = crypto.getRandomValues(new Uint8Array(12));
		const encryptedMsk = await crypto.subtle.encrypt({ name: AES_GCM, iv }, lwk, /** @type {any} */ (msk));
		await this.storageEngine.setItem(
			T_ES_WRAPPED_MSK,
			JSON.stringify({
				iv: Array.from(iv),
				data: Array.from(new Uint8Array(encryptedMsk))
			})
		);
	}

	/**
	 * @param {string} passkey
	 */
	async #makeLwk(passkey) {
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
