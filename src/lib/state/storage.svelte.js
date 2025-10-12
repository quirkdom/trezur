/**
 * @typedef {import('$lib/types').EncryptedStorage} EncryptedStorage
 */
import { browser } from '$app/environment';
import { AESGCMEncryptedStorage, LocalStorageEngine } from '$lib/utils/encrypted-storage';

/**
 * Reactive singleton instance of EncryptedLocalStorage.
 * Starts undefined and updates when initialized.
 */
export let encryptedLocalStorage = $state({
	/** @type {EncryptedStorage | null} */
	current: null,

	/**
	 * @param {string} passkey
	 */
	async init(passkey) {
		if (!browser)
			throw new Error('SSR safety: EncryptedLocalStorage can only be used in the browser.');

		// artificial delay to simulate loading (for testing)
		// await new Promise((resolve) => setTimeout(resolve, 2000));

		this.current = await AESGCMEncryptedStorage.make(new LocalStorageEngine(), passkey);
	}
});
