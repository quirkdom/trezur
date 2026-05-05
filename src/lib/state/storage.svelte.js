/**
 * @typedef {import('$lib/types').EncryptedStorage} EncryptedStorage
 */
import { browser } from '$app/environment';
import { devconsole } from '$lib/utils';
import { deriveLWK, generateMSK, importPayloadKey, unwrapMSK, wrapMSK } from '$lib/utils/crypto-keys';
import { AESGCMEncryptedStorage, LocalStorageEngine } from '$lib/utils/encrypted-storage';
import { generateKDFMetadata, getLegacySalt, pic } from '$lib/utils/salada';

const T_ES_ = 'T_ES_';
const T_ES_KDF_META = 'T_ES__kdf_meta__';
const T_ES_WRAPPED_MSK = 'T_ES__wrapped_msk__';
const T_ES_WRAPPED_MSK_BAK = 'T_ES__wrapped_msk_bak__';

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
	async getOrCreateKDFMetadata(passkey) {
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
	 * Initialize encrypted storage with the given passkey.
	 *
	 * Handles two flows:
	 * - Legacy migration (v0 KDF): uses LWK directly as the payload key (temporary, for re-encryption)
	 * - Standard v1: unwraps (or generates) an MSK, derives the payload key from it
	 *
	 * Passkey re-wrapping (passcode set/change/remove) is handled separately by {@link rewrapMSK}.
	 *
	 * @param {string} passkey
	 * @returns {Promise<EncryptedStorage|undefined>}
	 */
	async init(passkey) {
		if (!browser) throw new Error('SSR safety: Encrypted Local Storage can only be used in the browser.');

		// Recover from an interrupted rewrapMSK: if the backup exists but the primary is missing,
		// restore from backup. Either way, clean up the backup key.
		const mskBackup = localStorage.getItem(T_ES_WRAPPED_MSK_BAK);
		if (mskBackup) {
			if (!localStorage.getItem(T_ES_WRAPPED_MSK)) {
				localStorage.setItem(T_ES_WRAPPED_MSK, mskBackup);
				devconsole.warn('[Storage] Recovered wrapped MSK from interrupted passcode migration backup.');
			}
			localStorage.removeItem(T_ES_WRAPPED_MSK_BAK);
		}

		// artificial delay to simulate loading (for testing)
		// await new Promise((resolve) => setTimeout(resolve, 2000));

		devconsole.log('[Storage] Initializing encrypted local storage with passcode:', passkey);

		const metadata = await this.getOrCreateKDFMetadata(passkey);
		const lwk = await deriveLWK(passkey, metadata);

		if (this.#needsMigration) {
			const engine = new LocalStorageEngine();
			return (this.#current = new AESGCMEncryptedStorage(engine, lwk));
		}

		const storedWrapped = localStorage.getItem(T_ES_WRAPPED_MSK);
		const msk = storedWrapped ? await unwrapMSK(JSON.parse(storedWrapped), lwk) : generateMSK();

		if (!storedWrapped) {
			const wrapped = await wrapMSK(msk, lwk);
			localStorage.setItem(T_ES_WRAPPED_MSK, JSON.stringify(wrapped));
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
export const encryptedLocalStorage = new EncryptedLocalStorage();
