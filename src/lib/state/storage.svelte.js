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
	value: null,
	get current() {
		return this.value;
	},
	set current(value) {
		this.value = value;
	},
	async init(/** @type {string} */ passkey) {
		if (!browser)
			throw new Error('SSR safety: EncryptedLocalStorage cannot only be used in the browser.');

		this.current = await AESGCMEncryptedStorage.make(new LocalStorageEngine(), passkey);
	}
});

/**
 * Initialize or retrieve the encrypted storage instance
 * @param {string} [passkey] - The passkey for encryption
 * @returns {undefined | EncryptedStorage | Promise<EncryptedStorage>} The encrypted storage instance
 */
// export function getEncryptedLocalStorage(passkey) {
// 	if (!browser)
// 		throw new Error('SSR safety: EncryptedLocalStorage cannot only be used in the browser.');

// 	if (!passkey) return encryptedLocalStorage; // Return current instance if no passkey

// 	// Initialize with given passkey
// 	// encryptedLocalStorage = await AESGCMEncryptedStorage.make(new LocalStorageEngine(), passkey);
// 	// return encryptedLocalStorage;

// 	return AESGCMEncryptedStorage.make(new LocalStorageEngine(), passkey).then((storage) => {
// 		return (encryptedLocalStorage = storage);
// 	});
// }
