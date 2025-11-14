/**
 * @typedef {import('$lib/types').EncryptedStorage} EncryptedStorage
 */
import { browser } from '$app/environment';
import { devconsole } from '$lib/utils';
import { AESGCMEncryptedStorage, LocalStorageEngine } from '$lib/utils/encrypted-storage';

/**
 * Reactive singleton class for managing encrypted local storage.
 * Provides methods to initialize, test, and reset the storage instance.
 */
class EncryptedLocalStorage {
	/** @type {EncryptedStorage | null} */
	#current = $state(null);

	get current() {
		return this.#current;
	}

	/**
	 * @param {string} passkey
	 * @returns {Promise<EncryptedStorage>}
	 */
	async init(passkey) {
		if (!browser) throw new Error('SSR safety: Encrypted Local Storage can only be used in the browser.');

		// artificial delay to simulate loading (for testing)
		// await new Promise((resolve) => setTimeout(resolve, 2000));

		devconsole.log('[Storage] Initializing encrypted local storage with passkey:', passkey);

		return (this.#current = await AESGCMEncryptedStorage.make(new LocalStorageEngine(), passkey));
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
			const tempStorage = await AESGCMEncryptedStorage.make(new LocalStorageEngine(), passkey);
			return await tempStorage.verifySentinel();
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
