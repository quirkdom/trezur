import { devconsole } from '$lib/utils';
import { deriveLWK, generateMSK, importPayloadKey, unwrapMSK, wrapMSK } from '$lib/utils/crypto-keys';
import { pic, getLegacySalt, generateKDFMetadata } from '$lib/utils/salada';

const T_ES_KDF_META = 'T_ES_KDF_META';
const T_ES_WRAPPED_MSK = 'T_ES_WRAPPED_MSK';
const T_ES_WRAPPED_MSK_BAK = 'T_ES_WRAPPED_MSK_BAK';

class KeyManager {
	/** @type {CryptoKey | null} */
	#cryptoKey = $state(null);

	/** @type {string | null} */
	#passcode = null;

	#needsMigration = $state(false);

	get needsMigration() {
		return this.#needsMigration;
	}

	async getMnemonicWords() {
		if (!this.#passcode || !this.#cryptoKey) throw new Error('App must be unlocked');
		const storedWrapped = localStorage.getItem(T_ES_WRAPPED_MSK);
		const metadataStr = localStorage.getItem(T_ES_KDF_META);
		if (!storedWrapped || !metadataStr) throw new Error('Missing MSK data');

		const metadata = JSON.parse(metadataStr);
		const lwk = await deriveLWK(this.#passcode, metadata);
		const msk = await unwrapMSK(JSON.parse(storedWrapped), lwk);

		const { mskToMnemonic } = await import('$lib/utils/bip39.js');
		return mskToMnemonic(msk).split(' ');
	}

	get hasWrappedKey() {
		return !!localStorage.getItem(T_ES_WRAPPED_MSK) || !!localStorage.getItem(T_ES_WRAPPED_MSK_BAK);
	}

	#reset(shouldPurge = false) {
		this.#cryptoKey = null;
		this.#passcode = null;

		if (shouldPurge) {
			localStorage.removeItem(T_ES_KDF_META);
			localStorage.removeItem(T_ES_WRAPPED_MSK);
			localStorage.removeItem(T_ES_WRAPPED_MSK_BAK);
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
	async #legacyUnlockAndFlagForMigration(passkey) {
		const metadataStr = localStorage.getItem(T_ES_KDF_META);
		let metadata;

		if (metadataStr) {
			metadata = JSON.parse(metadataStr);
		} else {
			const oldSalt = await getLegacySalt(passkey);
			metadata = generateKDFMetadata(oldSalt, true);
			localStorage.setItem(T_ES_KDF_META, JSON.stringify(metadata));
		}

		this.#needsMigration = true;

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

		localStorage.setItem(T_ES_KDF_META, JSON.stringify(metadata));
		localStorage.setItem(T_ES_WRAPPED_MSK, JSON.stringify(wrapped));
		this.#needsMigration = false;

		this.#cryptoKey = await importPayloadKey(msk);
		this.#passcode = passkey;
		return this.#cryptoKey;
	}

	/**
	 * @param {string | null} storedWrappedMSK
	 * @param {{ v: number } & { [key: string]: unknown } | null} storedMetadata
	 */
	#checkIfNeedsMigration(storedWrappedMSK, storedMetadata) {
		if (this.#needsMigration) return false; // already flagged for migration

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
			let storedWrappedMSK = localStorage.getItem(T_ES_WRAPPED_MSK);

			if (!storedWrappedMSK) {
				// Check for backup MSK and restore if primary is missing
				const backupWrappedMSK = localStorage.getItem(T_ES_WRAPPED_MSK_BAK);

				if (backupWrappedMSK) {
					devconsole.log('[KeyManager] Primary wrapped MSK missing but backup found — restoring from backup');
					localStorage.setItem(T_ES_WRAPPED_MSK, backupWrappedMSK);
					storedWrappedMSK = backupWrappedMSK;
				}
			}

			const storedMetadata = JSON.parse(localStorage.getItem(T_ES_KDF_META) || 'null');

			// Standard unlock flow for modern v1 state
			if (storedWrappedMSK && storedMetadata?.v >= 1) {
				const lwk = await deriveLWK(passkey, storedMetadata);
				const msk = await unwrapMSK(JSON.parse(storedWrappedMSK), lwk);
				this.#needsMigration = false;
				this.#cryptoKey = await importPayloadKey(msk);
				this.#passcode = passkey;
				return this.#cryptoKey;
			}

			// Check if legacy v0 state that requires migration
			if (this.#checkIfNeedsMigration(storedWrappedMSK, storedMetadata)) {
				return await this.#legacyUnlockAndFlagForMigration(passkey); // return await is necessary here to catch errors from #handleLegacyUnlock within this try-catch
			}

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
		const storedWrappedMSK = localStorage.getItem(T_ES_WRAPPED_MSK);
		const storedMetadata = JSON.parse(localStorage.getItem(T_ES_KDF_META) || 'null');

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

		const storedWrapped = localStorage.getItem(T_ES_WRAPPED_MSK);
		const metadataStr = localStorage.getItem(T_ES_KDF_META);
		if (!storedWrapped || !metadataStr) throw new Error('Missing MSK data');

		// Extract current MSK
		const metadata = JSON.parse(metadataStr);
		const lwk = await deriveLWK(this.#passcode, metadata);
		const msk = await unwrapMSK(JSON.parse(storedWrapped), lwk);

		// Backup current wrapped MSK
		localStorage.setItem(T_ES_WRAPPED_MSK_BAK, storedWrapped);

		// Re-wrap with new passcode
		const newSalt = crypto.getRandomValues(new Uint8Array(16));
		const newMetadata = generateKDFMetadata(newSalt);
		const newLwk = await deriveLWK(newPasskey, newMetadata);
		const newWrapped = await wrapMSK(msk, newLwk);

		localStorage.setItem(T_ES_KDF_META, JSON.stringify(newMetadata));
		localStorage.setItem(T_ES_WRAPPED_MSK, JSON.stringify(newWrapped));
		localStorage.removeItem(T_ES_WRAPPED_MSK_BAK);

		this.#passcode = newPasskey;
	}

	/**
	 * @param {Uint8Array} newMSK
	 * @param {string} passkey
	 */
	async replaceMSK(newMSK, passkey) {
		let metadataStr = localStorage.getItem(T_ES_KDF_META);
		let metadata;
		if (metadataStr) {
			metadata = JSON.parse(metadataStr);
			// Upgrade metadata to v1 if it was legacy v0
			if (metadata.v === 0) {
				const salt = crypto.getRandomValues(new Uint8Array(16));
				metadata = generateKDFMetadata(salt);
			}
		} else {
			const salt = crypto.getRandomValues(new Uint8Array(16));
			metadata = generateKDFMetadata(salt);
		}

		const lwk = await deriveLWK(passkey, metadata);
		const wrapped = await wrapMSK(newMSK, lwk);

		localStorage.setItem(T_ES_WRAPPED_MSK_BAK, localStorage.getItem(T_ES_WRAPPED_MSK) || '');
		localStorage.setItem(T_ES_KDF_META, JSON.stringify(metadata));
		localStorage.setItem(T_ES_WRAPPED_MSK, JSON.stringify(wrapped));
		localStorage.removeItem(T_ES_WRAPPED_MSK_BAK);

		this.#cryptoKey = await importPayloadKey(newMSK);
		this.#passcode = passkey;
	}

	/**
	 * @param {Uint8Array} newMSK
	 */
	async adoptMSK(newMSK) {
		if (!this.#passcode) throw new Error('App must be unlocked to adopt MSK');
		await this.replaceMSK(newMSK, this.#passcode);
		return this.#cryptoKey;
	}
}

export const keyManager = new KeyManager();
