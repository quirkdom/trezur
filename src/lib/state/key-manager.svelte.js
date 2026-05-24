import { devconsole } from '$lib/utils';
import { deriveLWK, generateMSK, importPayloadKey, unwrapMSK, wrapMSK } from '$lib/utils/crypto-keys';
import { pic, getLegacySalt, generateKDFMetadata } from '$lib/utils/salada';

const T_KM_KDF_META = 'T_KM_KDF_META';
const T_KM_WRAPPED_MSK = 'T_KM_WRAPPED_MSK';

/**
 * Attempts to upgrade the key manager namespace from the old T_ES_ to the new T_KM_ namespace
 * @returns Wrapped MSK read from the new namespace
 *
 * @todo remove this once we are confident that all users have migrated and no old namespace keys remain in the wild
 */
function tryUpgradeKeymanNamespace() {
	const oldWrapped = localStorage.getItem('T_ES_WRAPPED_MSK');
	const oldBak = localStorage.getItem('T_ES_WRAPPED_MSK_BAK');
	const oldMeta = localStorage.getItem('T_ES_KDF_META');

	if (oldWrapped || oldBak) {
		devconsole.log('[KeyManager] Upgrading KeyManager keys from `T_ES_` to `T_KM_` namespace...');

		if (oldMeta) {
			localStorage.setItem(T_KM_KDF_META, oldMeta);
		}

		if (oldWrapped) {
			localStorage.setItem(T_KM_WRAPPED_MSK, oldWrapped);
		} else if (oldBak) {
			devconsole.log('[KeyManager] Primary T_ES_WRAPPED_MSK missing during upgrade, recovering from legacy backup');
			localStorage.setItem(T_KM_WRAPPED_MSK, oldBak);
		}

		// Clean up all old keys
		localStorage.removeItem('T_ES_WRAPPED_MSK');
		localStorage.removeItem('T_ES_KDF_META');
		localStorage.removeItem('T_ES_WRAPPED_MSK_BAK');
	}

	return localStorage.getItem(T_KM_WRAPPED_MSK);
}

/**
 * Attempts to restore from KeyManager backup. This is done in two scenarios:
 * - if primary wrapped MSK is missing but a backup exists, which indicates an interrupted transaction during a passkey change or MSK replacement.
 * - or, to initiate a rollback from a failed transaction during MSK replacement.
 * @returns Wrapped MSK read from storage, after restoration from backup
 */
function tryRestoreFromKeymanBackup() {
	const keymanBackup = localStorage.getItem('BAK_KEYMAN');

	if (keymanBackup) {
		devconsole.log('[KeyManager] Restoring from KeyManager backup `BAK_KEYMAN`');

		const backup = JSON.parse(keymanBackup);

		for (const [k, v] of Object.entries(backup)) {
			if (v !== null) localStorage.setItem('T_KM_' + k, JSON.stringify(v));
			else localStorage.removeItem('T_KM_' + k);
		}

		localStorage.removeItem('BAK_KEYMAN');
	}

	return localStorage.getItem(T_KM_WRAPPED_MSK);
}

class KeyManager {
	/** @type {CryptoKey | null} */
	#cryptoKey = null;

	/** @type {string | null} */
	#passcode = null;

	/** @type {CryptoKey | null} */
	#backupCryptoKey = null;

	/** @type {string | null} */
	#backupPasscode = null;

	#needsKDFMigration = $state(false);

	get needsMigration() {
		return this.#needsKDFMigration;
	}

	async getMnemonicWords() {
		if (!this.#passcode || !this.#cryptoKey) throw new Error('App must be unlocked');
		const storedWrapped = localStorage.getItem(T_KM_WRAPPED_MSK);
		const metadataStr = localStorage.getItem(T_KM_KDF_META);
		if (!storedWrapped || !metadataStr) throw new Error('Missing MSK data');

		const metadata = JSON.parse(metadataStr);
		const lwk = await deriveLWK(this.#passcode, metadata);
		const msk = await unwrapMSK(JSON.parse(storedWrapped), lwk);

		const { mskToMnemonic } = await import('$lib/utils/bip39.js');
		return mskToMnemonic(msk).split(' ');
	}

	get hasWrappedKey() {
		return !!localStorage.getItem(T_KM_WRAPPED_MSK) || !!localStorage.getItem('BAK_KEYMAN');
	}

	get hasBackup() {
		return !!localStorage.getItem('BAK_KEYMAN');
	}

	#reset(shouldPurge = false) {
		this.#cryptoKey = null;
		this.#passcode = null;

		if (shouldPurge) {
			localStorage.removeItem(T_KM_KDF_META);
			localStorage.removeItem(T_KM_WRAPPED_MSK);
			localStorage.removeItem('BAK_KEYMAN');
		}
	}

	purge() {
		this.#reset(true);
	}

	lock() {
		this.#reset();
	}

	/**
	 * @param {string} passkey
	 */
	async #legacyUnlockAndFlagForKDFMigration(passkey) {
		const metadataStr = localStorage.getItem(T_KM_KDF_META);
		let metadata;

		if (metadataStr) {
			metadata = JSON.parse(metadataStr);
		} else {
			const oldSalt = await getLegacySalt(passkey);
			metadata = generateKDFMetadata(oldSalt, true);
			localStorage.setItem(T_KM_KDF_META, JSON.stringify(metadata));
		}

		this.#needsKDFMigration = true;

		const lwk = await deriveLWK(passkey, metadata);
		this.#cryptoKey = lwk;
		this.#passcode = passkey;
		return this.#cryptoKey;
	}

	/**
	 * @param {string} passkey
	 */
	async #initializeNew(passkey) {
		const salt = crypto.getRandomValues(new Uint8Array(16));
		const metadata = generateKDFMetadata(salt);

		const lwk = await deriveLWK(passkey, metadata);
		const msk = generateMSK();
		const wrapped = await wrapMSK(msk, lwk);

		localStorage.setItem(T_KM_KDF_META, JSON.stringify(metadata));
		localStorage.setItem(T_KM_WRAPPED_MSK, JSON.stringify(wrapped));
		this.#needsKDFMigration = false;

		this.#cryptoKey = await importPayloadKey(msk);
		this.#passcode = passkey;
		return this.#cryptoKey;
	}

	/**
	 * @param {string | null} storedWrappedMSK
	 * @param {{ v: number } & { [key: string]: unknown } | null} storedMetadata
	 */
	#checkIfNeedsKDFMigration(storedWrappedMSK, storedMetadata) {
		if (this.#needsKDFMigration) return false; // already flagged for migration

		return (
			!storedWrappedMSK &&
			(!storedMetadata || storedMetadata.v < 1) &&
			Object.keys(localStorage).some((key) => pic(key).startsWith('T_ES_'))
		);
	}

	/**
	 * @param {string} passkey
	 * @returns
	 */
	async unlock(passkey) {
		try {
			let storedWrappedMSK = localStorage.getItem(T_KM_WRAPPED_MSK);

			if (!storedWrappedMSK) {
				// Seamless auto-upgrade fallback from T_ES_ to T_KM_ key manager keys
				storedWrappedMSK = tryUpgradeKeymanNamespace();
			}

			if (!storedWrappedMSK) {
				// Secondary defensive fallback: if primary is missing but transaction backup exists, restore it.
				storedWrappedMSK = tryRestoreFromKeymanBackup();
			}

			const storedMetadata = JSON.parse(localStorage.getItem(T_KM_KDF_META) || 'null');

			// Standard unlock flow for modern v1 state
			if (storedWrappedMSK && storedMetadata?.v >= 1) {
				const lwk = await deriveLWK(passkey, storedMetadata);
				const msk = await unwrapMSK(JSON.parse(storedWrappedMSK), lwk);
				this.#needsKDFMigration = false;
				this.#cryptoKey = await importPayloadKey(msk);
				this.#passcode = passkey;
				return this.#cryptoKey;
			}

			// Check if legacy v0 state that requires migration
			if (this.#checkIfNeedsKDFMigration(storedWrappedMSK, storedMetadata))
				return await this.#legacyUnlockAndFlagForKDFMigration(passkey); // return await is necessary here to catch errors from #handleLegacyUnlock within this try-catch

			// Must be fresh install or needs migration, so initialize new state
			return await this.#initializeNew(passkey); // return await is necessary here to catch errors from #initializeNew within this try-catch
		} catch (err) {
			devconsole.error('[KeyManager] Failed to unlock:', err);
			return null;
		}
	}

	/**
	 * @param {string} passkey
	 */
	async testPasskey(passkey) {
		let storedWrappedMSK = localStorage.getItem(T_KM_WRAPPED_MSK);

		if (!storedWrappedMSK) {
			// Seamless auto-upgrade fallback from T_ES_ to T_KM_ key manager keys
			storedWrappedMSK = tryUpgradeKeymanNamespace();
		}

		if (!storedWrappedMSK) {
			// Secondary defensive fallback: if primary is missing but transaction backup exists, restore it.
			storedWrappedMSK = tryRestoreFromKeymanBackup();
		}

		const storedMetadata = JSON.parse(localStorage.getItem(T_KM_KDF_META) || 'null');

		if (storedWrappedMSK && storedMetadata?.v >= 1) {
			try {
				const lwk = await deriveLWK(passkey, storedMetadata);
				await unwrapMSK(JSON.parse(storedWrappedMSK), lwk);
				return true;
			} catch {
				return false;
			}
		}

		// Can't test since required information isn't present
		return false;
	}

	/**
	 * @param {string} newPasskey
	 */
	async changePasskey(newPasskey) {
		if (!this.#passcode || !this.#cryptoKey) throw new Error('App must be unlocked to change passcode');

		const storedWrapped = localStorage.getItem(T_KM_WRAPPED_MSK);
		const metadataStr = localStorage.getItem(T_KM_KDF_META);
		if (!storedWrapped || !metadataStr) throw new Error('Missing MSK data');

		// Extract current MSK
		const metadata = JSON.parse(metadataStr);
		const lwk = await deriveLWK(this.#passcode, metadata);
		const msk = await unwrapMSK(JSON.parse(storedWrapped), lwk);

		// Backup current wrapped MSK and KDF meta into BAK_KEYMAN
		const backup = {
			WRAPPED_MSK: JSON.parse(storedWrapped),
			KDF_META: metadata
		};
		localStorage.setItem('BAK_KEYMAN', JSON.stringify(backup));

		// Re-wrap with new passcode
		const newSalt = crypto.getRandomValues(new Uint8Array(16));
		const newMetadata = generateKDFMetadata(newSalt);
		const newLwk = await deriveLWK(newPasskey, newMetadata);
		const newWrapped = await wrapMSK(msk, newLwk);

		localStorage.setItem(T_KM_KDF_META, JSON.stringify(newMetadata));
		localStorage.setItem(T_KM_WRAPPED_MSK, JSON.stringify(newWrapped));
		localStorage.removeItem('BAK_KEYMAN');

		this.#passcode = newPasskey;
	}

	/**
	 * Prepare MSK adoption by backing up current keys to BAK_KEYMAN.
	 *
	 * @param {Uint8Array} newMSK The new MSK.
	 * @returns {Promise<CryptoKey>}
	 */
	async prepareAdoptMSKTxn(newMSK) {
		if (!this.#passcode) throw new Error('App must be unlocked to adopt MSK');

		let metadataStr = localStorage.getItem(T_KM_KDF_META);
		let metadata;
		if (metadataStr) {
			metadata = JSON.parse(metadataStr);
			if (metadata.v === 0) {
				const salt = crypto.getRandomValues(new Uint8Array(16));
				metadata = generateKDFMetadata(salt);
			}
		} else {
			const salt = crypto.getRandomValues(new Uint8Array(16));
			metadata = generateKDFMetadata(salt);
		}

		const lwk = await deriveLWK(this.#passcode, metadata);
		const wrapped = await wrapMSK(newMSK, lwk);

		// 1. Write consolidated backup to localStorage (unencrypted)
		const oldWrappedMSK = localStorage.getItem(T_KM_WRAPPED_MSK);
		const oldKDFMeta = localStorage.getItem(T_KM_KDF_META);
		const backup = {
			WRAPPED_MSK: oldWrappedMSK ? JSON.parse(oldWrappedMSK) : null,
			KDF_META: oldKDFMeta ? JSON.parse(oldKDFMeta) : null
		};
		localStorage.setItem('BAK_KEYMAN', JSON.stringify(backup));

		// 2. Write new key material to active locations
		localStorage.setItem(T_KM_KDF_META, JSON.stringify(metadata));
		localStorage.setItem(T_KM_WRAPPED_MSK, JSON.stringify(wrapped));

		// 3. Save old in-memory state for rollback
		this.#backupCryptoKey = this.#cryptoKey;
		this.#backupPasscode = this.#passcode;

		// 4. Update in-memory to new key
		const tempCryptoKey = await importPayloadKey(newMSK);
		this.#cryptoKey = tempCryptoKey;

		return tempCryptoKey;
	}

	/**
	 * Commit MSK adoption by removing backup.
	 */
	async commitAdoptMSKTxn() {
		localStorage.removeItem('BAK_KEYMAN');
		this.#backupCryptoKey = null;
		this.#backupPasscode = null;
	}

	/**
	 * Roll back MSK adoption by restoring from BAK_KEYMAN and resetting in-memory states.
	 */
	async rollbackAdoptMSKTxn() {
		tryRestoreFromKeymanBackup();

		if (this.#backupCryptoKey) {
			this.#cryptoKey = this.#backupCryptoKey;
			this.#backupCryptoKey = null;
		}
		if (this.#backupPasscode) {
			this.#passcode = this.#backupPasscode;
			this.#backupPasscode = null;
		}
	}
}

export const keyManager = new KeyManager();
