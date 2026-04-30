/**
 * @typedef {import('$lib/types').EncryptedStorage} EncryptedStorage
 */
import { browser } from '$app/environment';
import { devconsole } from '$lib/utils';
import { AESGCMEncryptedStorage, LocalStorageEngine } from '$lib/utils/encrypted-storage';
import {
	deriveLWK,
	generateKDFMetadata,
	getLegacySalt,
	importPayloadKey,
	unwrapMSK,
	wrapMSK,
	generateMSK
} from '$lib/utils/crypto-keys';
import { pic } from '$lib/utils/salada';

const T_ES_ = 'T_ES_';
const T_ES_KDF_META = 'T_ES__kdf_meta__';
const T_ES_WRAPPED_MSK = 'T_ES__wrapped_msk__';

/**
 * Reactive singleton class for managing encrypted local storage.
 * Provides methods to initialize, test, and reset the storage instance.
 */
class EncryptedLocalStorage {
	/** @type {EncryptedStorage | null} */
	#current = $state(null);

	/**
	 * @todo Remove this once we have migrated all users to KDF metadata v1
	 */
	#needsMigration = $state(false);

	get current() {
		return this.#current;
	}

	get needsMigration() {
		return this.#needsMigration;
	}

	/**
	 * Get or create metadata with KDF parameters and random salt
	 * @param {string} passkey
	 *
	 * @todo Once majority of users have migrated, remove the legacy salt derivations
	 */
	async #getOrCreateKDFMetadata(passkey) {
		const stored = localStorage.getItem(T_ES_KDF_META);
		if (stored) {
			const metadata = JSON.parse(stored);
			if (metadata.v < 1) {
				// Force upgrade: create new metadata with random salt for migration
				const saltBytes = crypto.getRandomValues(new Uint8Array(32));
				const newMetadata = generateKDFMetadata(saltBytes);
				localStorage.setItem(T_ES_KDF_META, JSON.stringify(newMetadata));
				this.#needsMigration = false;
				return newMetadata;
			} else {
				this.#needsMigration = false;
				return metadata;
			}
		}

		const hasData = Object.keys(localStorage).some((key) => pic(key).startsWith(T_ES_));
		if (hasData) {
			// Use old salt derived from passkey
			const oldSalt = await getLegacySalt(passkey);
			const metadata = generateKDFMetadata(oldSalt, true);
			localStorage.setItem(T_ES_KDF_META, JSON.stringify(metadata));
			this.#needsMigration = true;
			return metadata;
		} else {
			// Create new random salt
			const saltBytes = crypto.getRandomValues(new Uint8Array(32));
			const metadata = generateKDFMetadata(saltBytes);
			localStorage.setItem(T_ES_KDF_META, JSON.stringify(metadata));
			return metadata;
		}
	}

	/**
	 * @param {string} passkey
	 * @param {object} [options]
	 * @param {Uint8Array} [options.importedMsk]
	 * @param {string} [options.oldPasskey]
	 * @returns {Promise<EncryptedStorage>}
	 */
	async init(passkey, options = {}) {
		if (!browser) throw new Error('SSR safety: Encrypted Local Storage can only be used in the browser.');

		// artificial delay to simulate loading (for testing)
		// await new Promise((resolve) => setTimeout(resolve, 2000));

		devconsole.log('[Storage] Initializing encrypted local storage with passkey:', passkey);

		const metadata = await this.#getOrCreateKDFMetadata(passkey);
		const lwk = await deriveLWK(passkey, metadata);

		if (this.#needsMigration) {
			const engine = new LocalStorageEngine();
			return (this.#current = new AESGCMEncryptedStorage(engine, lwk));
		}

		let msk;
		if (options.importedMsk) {
			msk = options.importedMsk;
			const wrapped = await wrapMSK(msk, lwk);
			localStorage.setItem(T_ES_WRAPPED_MSK, JSON.stringify(wrapped));
		} else if (options.oldPasskey) {
			const oldMetadata = await this.#getOrCreateKDFMetadata(options.oldPasskey);
			const oldLwk = await deriveLWK(options.oldPasskey, oldMetadata);

			const storedWrapped = localStorage.getItem(T_ES_WRAPPED_MSK);
			if (!storedWrapped) throw new Error('Cannot re-wrap missing MSK');

			msk = await unwrapMSK(JSON.parse(storedWrapped), oldLwk);
			const wrapped = await wrapMSK(msk, lwk);
			localStorage.setItem(T_ES_WRAPPED_MSK, JSON.stringify(wrapped));
		} else {
			const storedWrapped = localStorage.getItem(T_ES_WRAPPED_MSK);
			if (storedWrapped) {
				msk = await unwrapMSK(JSON.parse(storedWrapped), lwk);
			} else {
				msk = generateMSK();
				const wrapped = await wrapMSK(msk, lwk);
				localStorage.setItem(T_ES_WRAPPED_MSK, JSON.stringify(wrapped));
			}
		}

		const payloadKey = await importPayloadKey(msk);
		const engine = new LocalStorageEngine();
		return (this.#current = new AESGCMEncryptedStorage(engine, payloadKey));
	}

	/**
	 * @param {string} passkey
	 * @returns {Promise<boolean>}
	 */
	async test(passkey) {
		if (!browser) {
			devconsole.warn('SSR safety: Encrypted Local Storage can only be used in the browser.');
			return false;
		}

		try {
			const storedMeta = localStorage.getItem(T_ES_KDF_META);
			if (!storedMeta) return false;
			const metadata = JSON.parse(storedMeta);
			const lwk = await deriveLWK(passkey, metadata);

			const storedWrapped = localStorage.getItem(T_ES_WRAPPED_MSK);
			if (storedWrapped) {
				await unwrapMSK(JSON.parse(storedWrapped), lwk);
				return true;
			}
			return true;
		} catch (err) {
			devconsole.error(`Error testing encrypted local storage with passkey candidate '${passkey}':`, err);
			return false;
		}
	}

	async reset(purge = false) {
		if (!browser) throw new Error('SSR safety: Encrypted Local Storage can only be used in the browser.');
		if (!this.#current) return;

		devconsole.log('[Storage] Resetting encrypted local storage');

		if (purge) await this.#current.purge();
		this.#current = null;
	}
}

/**
 * Reactive singleton instance of EncryptedLocalStorage.
 */
export let encryptedLocalStorage = new EncryptedLocalStorage();
