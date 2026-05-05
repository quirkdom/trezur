import { migrateMSK } from '$lib/state/migration.svelte.js';
import { sessionPasscode } from '$lib/state/passcode.svelte.js';
import { encryptedLocalStorage } from '$lib/state/storage.svelte.js';
import { getMaxTimestamp, mergeTokens, tokensContext } from '$lib/state/tokens.svelte.js';
import { driveClient } from '$lib/sync/drive.svelte.js';
import { assembleCloudFile, parseCloudFile } from '$lib/sync/fileformat.js';
import { devconsole } from '$lib/utils';
import { mnemonicToMSK, mskToMnemonic } from '$lib/utils/bip39.js';
import { exportUnwrappedMSK } from '$lib/utils/crypto-keys.js';

const T_BACKUP_ENABLED = 'T_backup_enabled';
const T_LAST_ERROR = 'T_last_error';
const BACKUP_FILENAME = 'tokens.trzr';
const SYNC_INTERVAL = 60 * 60 * 1000; // 1 hour

class BackupService {
	/** @type {boolean} */
	isSyncing = $state(false);
	/** @type {number} */
	lastSync = $state(0);
	/** @type {string | null} */
	lastError = $state(null);
	/** @type {boolean} */
	autoSyncEnabled = $state(false);
	/** @type {any} */
	settingsContext = null;

	/**
	 * @param {any} settingsContext
	 */
	init(settingsContext) {
		this.settingsContext = settingsContext;
	}

	async loadFromStorage() {
		if (!encryptedLocalStorage.current) return;

		const enabled = await encryptedLocalStorage.current.get(T_BACKUP_ENABLED);
		if (enabled) {
			this.autoSyncEnabled = true;
			this.startAutoSync();
		}

		const lastError = await encryptedLocalStorage.current.get(T_LAST_ERROR);
		if (lastError) {
			this.lastError = lastError;
		}

		if (this.settingsContext) {
			const settings = this.settingsContext.getSettings();
			if (settings.lastSyncTime) {
				this.lastSync = settings.lastSyncTime;
			}
		}
	}

	async enable() {
		if (!encryptedLocalStorage.current) throw new Error('Storage not ready');
		if (!sessionPasscode.passcode) throw new Error('App passcode not set');

		await encryptedLocalStorage.current.set(T_BACKUP_ENABLED, true);
		this.autoSyncEnabled = true;
		this.startAutoSync();

		await this.sync();
	}

	async disable() {
		if (!encryptedLocalStorage.current) return;

		await encryptedLocalStorage.current.delete(T_BACKUP_ENABLED);
		this.autoSyncEnabled = false;
		this.stopAutoSync();
	}

	async _getMSK() {
		if (!sessionPasscode.passcode) throw new Error('Passcode required to unlock MSK');
		const metadata = await encryptedLocalStorage.getOrCreateKDFMetadata(sessionPasscode.passcode);
		const storedWrapped = localStorage.getItem('T_ES__wrapped_msk__');
		if (!storedWrapped) throw new Error('No wrapped MSK found');
		return exportUnwrappedMSK(sessionPasscode.passcode, metadata, JSON.parse(storedWrapped));
	}

	/**
	 * @param {string} jsonStr
	 * @param {Uint8Array} msk
	 */
	async _encryptPayload(jsonStr, msk) {
		const iv = crypto.getRandomValues(new Uint8Array(12));
		const key = await crypto.subtle.importKey('raw', msk, { name: 'AES-GCM' }, false, ['encrypt']);
		const encoded = new TextEncoder().encode(jsonStr);
		const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
		return { ciphertext: new Uint8Array(ciphertext), iv };
	}

	/**
	 * @param {Uint8Array} ciphertext
	 * @param {Uint8Array} iv
	 * @param {Uint8Array} msk
	 */
	async _decryptPayload(ciphertext, iv, msk) {
		const key = await crypto.subtle.importKey('raw', msk, { name: 'AES-GCM' }, false, ['decrypt']);
		const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
		return new TextDecoder().decode(decrypted);
	}

	async sync() {
		if (this.isSyncing) return;
		if (!tokensContext.current) return;
		if (!sessionPasscode.passcode) {
			devconsole.warn('[Backup] Cannot sync: App is locked (no session passcode)');
			return;
		}

		this.isSyncing = true;
		devconsole.log('[Backup] Starting sync...');

		try {
			const msk = await this._getMSK();
			/** @type {Record<string, import('$lib/types').Token>} */
			let cloudTokens = {};
			let cloudTombstones = {};

			// Attempt to fetch cloud payload
			try {
				const buffer = await driveClient.download(BACKUP_FILENAME, 'arraybuffer');
				const parsed = parseCloudFile(new Uint8Array(buffer));
				const decryptedJson = await this._decryptPayload(parsed.payloadCiphertext, parsed.payloadIV, msk);
				const cloudPayload = JSON.parse(decryptedJson);

				// Normalize cloud tokens to Token objects (handle legacy wrapper if present)
				const rawCloudTokens = cloudPayload.tokens || {};
				for (const [id, val] of Object.entries(rawCloudTokens)) {
					if (val.data) {
						cloudTokens[id] = { ...val.data, updatedAt: val.updatedAt };
					} else {
						cloudTokens[id] = val;
					}
				}
				cloudTombstones = cloudPayload.tombstones || {};
			} catch (err) {
				if (err.message !== 'File not found') throw err;
				// New backup, continue with empty cloud state
			}

			// Local state
			const localTokensList = tokensContext.current.getTokens();
			const localTombstones = tokensContext.current.getTombstones();

			/** @type {Record<string, import('$lib/types').Token>} */
			let mergedTokens = {};
			for (const t of localTokensList) {
				mergedTokens[t.id] = t;
			}
			let mergedTombstones = { ...localTombstones };

			// 1. Merge tombstones
			for (const [id, ts] of Object.entries(cloudTombstones)) {
				if (!mergedTombstones[id] || mergedTombstones[id] < ts) {
					mergedTombstones[id] = ts;
				}
			}

			// 2. Merge tokens
			for (const [id, cloudToken] of Object.entries(cloudTokens)) {
				const tombTs = mergedTombstones[id] || 0;

				if (!mergedTokens[id]) {
					// Cloud-only token: add if it's fresher than any tombstone
					if (getMaxTimestamp(cloudToken) > tombTs) {
						mergedTokens[id] = cloudToken;
					}
				} else {
					// Field Resolution: Incoming (Cloud) wins on tie
					mergedTokens[id] = mergeTokens(mergedTokens[id], cloudToken);
				}
			}

			// 3. Apply tombstones again to filter deleted items
			for (const [id, ts] of Object.entries(mergedTombstones)) {
				if (mergedTokens[id]) {
					// If tombstone is fresher or equal to max local change, delete.
					if (ts >= getMaxTimestamp(mergedTokens[id])) {
						delete mergedTokens[id];
					}
				}
			}

			// Save to local context
			const newLocalTokens = Object.values(mergedTokens);
			await tokensContext.current.setTokensAndTombstones(newLocalTokens, mergedTombstones);

			// Prepare payload
			const finalPayload = {
				version: 5,
				lastSyncTs: Date.now(),
				tokens: mergedTokens,
				tombstones: mergedTombstones
			};

			// Encrypt and upload
			const { ciphertext, iv } = await this._encryptPayload(JSON.stringify(finalPayload), msk);
			const cloudFileBytes = await assembleCloudFile('TOKN', ciphertext, iv, msk);
			await driveClient.upload(BACKUP_FILENAME, new Blob([cloudFileBytes], { type: 'application/octet-stream' }));

			this.lastSync = Date.now();
			if (this.settingsContext) this.settingsContext.updateSetting('lastSyncTime', this.lastSync);
			this.lastError = null;
			await encryptedLocalStorage.current?.delete(T_LAST_ERROR);
			devconsole.log('[Backup] Sync completed');
		} catch (e) {
			this.lastError = e instanceof Error ? e.message : String(e);
			await encryptedLocalStorage.current?.set(T_LAST_ERROR, this.lastError);
			devconsole.error('[Backup] Sync failed', e);
		} finally {
			this.isSyncing = false;
		}
	}

	async checkCloudBackupExists() {
		try {
			const file = await driveClient.findFile(BACKUP_FILENAME);
			return !!file;
		} catch (e) {
			return false;
		}
	}

	async getMnemonic() {
		const msk = await this._getMSK();
		return mskToMnemonic(msk).split(' ');
	}

	/**
	 * Called during onboarding if cloud backup exists to test user's 24-word phrase
	 * @param {string[]} words
	 */
	async verifyCloudBackupMnemonic(words) {
		try {
			const candidateMsk = mnemonicToMSK(words.join(' '));
			const buffer = await driveClient.download(BACKUP_FILENAME, 'arraybuffer');
			const parsed = parseCloudFile(new Uint8Array(buffer));

			// We can attempt to decrypt payload. If it succeeds, the phrase is valid.
			await this._decryptPayload(parsed.payloadCiphertext, parsed.payloadIV, candidateMsk);
			return true;
		} catch (e) {
			devconsole.warn('[Backup] Mnemonic verification failed', e);
			return false;
		}
	}

	/**
	 * Called during onboarding after validating words
	 * @param {string[]} words
	 */
	async adoptCloudBackup(words) {
		const newMsk = mnemonicToMSK(words.join(' '));
		await migrateMSK(newMsk, sessionPasscode.passcode);
		await this.enable(); // starts auto sync + initial sync
	}

	/** @type {any} */
	#intervalId;

	startAutoSync() {
		if (this.#intervalId) clearInterval(this.#intervalId);
		const check = () => {
			if (!this.autoSyncEnabled) return;
			if (Date.now() - this.lastSync > SYNC_INTERVAL) this.sync();
		};
		this.#intervalId = setInterval(check, 60000);
		document.addEventListener('visibilitychange', () => {
			if (!document.hidden) check();
		});
		check();
	}

	stopAutoSync() {
		if (this.#intervalId) clearInterval(this.#intervalId);
	}
}

export const backupService = new BackupService();
