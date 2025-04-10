/**
 * @typedef {import('$lib/types').EncryptedStorage} EncryptedStorage
 */
import { browser } from '$app/environment';
import { AESGCMEncryptedStorage, LocalStorageEngine } from '$lib/utils/encrypted-storage';

/**
 * Reactive singleton instance of EncryptedLocalStorage
 * Starts undefined and updates when initialized
 */
export let encryptedLocalStorage = $state({
	/** @type {EncryptedStorage | null} */
	current: null,

	/**
	 * @param {string} passkey
	 */
	async init(passkey) {
		if (!browser)
			throw new Error('SSR safety: EncryptedLocalStorage cannot only be used in the browser.');

		this.current = await AESGCMEncryptedStorage.make(new LocalStorageEngine(), passkey);
	}
});
