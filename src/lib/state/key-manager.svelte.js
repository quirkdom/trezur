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

	#needsMigration = false;

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
	 * @returns
	 */
	async unlock(passkey) {
		try {
			// Check for backup MSK and restore if primary is missing
			const primaryWrapped = localStorage.getItem(T_ES_WRAPPED_MSK);
			const backupWrapped = localStorage.getItem(T_ES_WRAPPED_MSK_BAK);

			if (!primaryWrapped && backupWrapped) {
				localStorage.setItem(T_ES_WRAPPED_MSK, backupWrapped);
			}

			const storedWrapped = localStorage.getItem(T_ES_WRAPPED_MSK);
			let metadataStr = localStorage.getItem(T_ES_KDF_META);

			let msk;
			if (storedWrapped && metadataStr) {
				const metadata = JSON.parse(metadataStr);
				if (metadata.v < 1) {
					// Force upgrade: create new metadata with random salt for migration
					const salt = crypto.getRandomValues(new Uint8Array(16));
					const newMetadata = {
						v: 1,
						name: 'PBKDF2',
						salt: btoa(String.fromCharCode(...salt)),
						iterations: 600000,
						hash: 'SHA-256'
					};

					const lwkOld = await deriveLWK(passkey, metadata);
					msk = await unwrapMSK(JSON.parse(storedWrapped), lwkOld);

					const lwkNew = await deriveLWK(passkey, newMetadata);
					const wrapped = await wrapMSK(msk, lwkNew);

					localStorage.setItem(T_ES_KDF_META, JSON.stringify(newMetadata));
					localStorage.setItem(T_ES_WRAPPED_MSK, JSON.stringify(wrapped));
					this.#needsMigration = false;
				} else {
					const lwk = await deriveLWK(passkey, metadata);
					msk = await unwrapMSK(JSON.parse(storedWrapped), lwk);
					this.#needsMigration = false;
				}
			} else {
				const hasData = Object.keys(localStorage).some((key) => pic(key).startsWith('T_ES_'));
				if (hasData) {
					// Legacy v0 detected
					const oldSalt = await getLegacySalt(passkey);
					const metadata = generateKDFMetadata(oldSalt, true);
					localStorage.setItem(T_ES_KDF_META, JSON.stringify(metadata));
					this.#needsMigration = true;

					const lwk = await deriveLWK(passkey, metadata);
					this.#cryptoKey = lwk;
					this.#passcode = passkey;
					return this.#cryptoKey;
				} else {
					// Initialize new
					const salt = crypto.getRandomValues(new Uint8Array(16));
					const metadata = {
						v: 1,
						name: 'PBKDF2',
						salt: btoa(String.fromCharCode(...salt)),
						iterations: 600000,
						hash: 'SHA-256'
					};
					const lwk = await deriveLWK(passkey, metadata);
					msk = generateMSK();
					const wrapped = await wrapMSK(msk, lwk);

					localStorage.setItem(T_ES_KDF_META, JSON.stringify(metadata));
					localStorage.setItem(T_ES_WRAPPED_MSK, JSON.stringify(wrapped));
					this.#needsMigration = false;
				}
			}

			this.#cryptoKey = await importPayloadKey(msk);
			this.#passcode = passkey;
			return this.#cryptoKey;
		} catch (err) {
			console.error('[KeyManager] Failed to unlock:', err);
			return null;
		}
	}

	/**
	 * @param {string} passkey
	 */
	async testPasskey(passkey) {
		const storedWrapped = localStorage.getItem(T_ES_WRAPPED_MSK);
		const metadataStr = localStorage.getItem(T_ES_KDF_META);
		if (!storedWrapped || !metadataStr) return false;

		try {
			const metadata = JSON.parse(metadataStr);
			const lwk = await deriveLWK(passkey, metadata);
			await unwrapMSK(JSON.parse(storedWrapped), lwk);
			return true;
		} catch {
			return false;
		}
	}

	/**
	 * @param {string} newPass
	 */
	async changePasscode(newPass) {
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
		const newMetadata = {
			v: 1,
			name: 'PBKDF2',
			salt: btoa(String.fromCharCode(...newSalt)),
			iterations: 600000,
			hash: 'SHA-256'
		};
		const newLwk = await deriveLWK(newPass, newMetadata);
		const newWrapped = await wrapMSK(msk, newLwk);

		localStorage.setItem(T_ES_KDF_META, JSON.stringify(newMetadata));
		localStorage.setItem(T_ES_WRAPPED_MSK, JSON.stringify(newWrapped));
		localStorage.removeItem(T_ES_WRAPPED_MSK_BAK);

		this.#passcode = newPass;
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
		} else {
			const salt = crypto.getRandomValues(new Uint8Array(16));
			metadata = {
				v: 1,
				name: 'PBKDF2',
				salt: btoa(String.fromCharCode(...salt)),
				iterations: 600000,
				hash: 'SHA-256'
			};
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
