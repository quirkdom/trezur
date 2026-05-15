import { keyManager } from '$lib/state/key-manager.svelte';
import { adoptMSK, createCloudVault, getLocalVault, isStorageAvailable } from '$lib/state/storage.svelte';
import { getMaxTimestamp, mergeTokens, tokensContext } from '$lib/state/tokens.svelte';
import { driveClient } from '$lib/sync/gdrive';
import { devconsole } from '$lib/utils';
import { mnemonicToMSK } from '$lib/utils/bip39';
import { CloudFileVault } from '$lib/utils/cloud-file-vault';
import { importPayloadKey } from '$lib/utils/crypto-keys';

const T_BACKUP_ENABLED = 'T_backup_enabled';
const T_LAST_ERROR = 'T_last_error';
const BACKUP_FILENAME = 'tokens.trzr';
const BACKUP_FILE_TYPE = 'TOKN';
const SYNC_INTERVAL = 60 * 60 * 1000; // 1 hour

class BackupService {
	/** @type {boolean} */
	isSyncing = $state(false);
	/** @type {string | null} */
	lastError = $state(null);
	/** @type {boolean} */
	autoSyncEnabled = $state(false);
	/** @type {any} */
	settingsContext = null;
	/** @type {number} */
	lastSyncedAt = $derived(this.settingsContext?.getSettings().lastSyncTime || 0);

	/**
	 * @param {any} settingsContext
	 */
	init(settingsContext) {
		this.settingsContext = settingsContext;
	}

	async loadFromStorage() {
		const localVault = getLocalVault();
		if (!localVault) return;

		const enabled = await localVault.get(T_BACKUP_ENABLED);
		if (enabled) {
			this.autoSyncEnabled = true;
			this.startAutoSync();
		}

		const lastError = await localVault.get(T_LAST_ERROR);
		if (lastError) {
			this.lastError = lastError;
		}
	}

	async enable() {
		const localVault = getLocalVault();
		if (!localVault) throw new Error('Storage not ready');
		if (!isStorageAvailable()) throw new Error('App passcode not set or locked');

		await localVault.set(T_BACKUP_ENABLED, true);
		this.autoSyncEnabled = true;
		this.startAutoSync();

		await this.sync();
	}

	async disable() {
		const localVault = getLocalVault();
		if (!localVault) return;

		await localVault.delete(T_BACKUP_ENABLED);
		this.autoSyncEnabled = false;
		this.stopAutoSync();
	}

	/**
	 * @param {any} e
	 */
	async setError(e) {
		this.lastError = e instanceof Error ? e.message : String(e);
		const localVault = getLocalVault();
		if (localVault) {
			await localVault.set(T_LAST_ERROR, this.lastError);
		}
	}

	async clearError() {
		this.lastError = null;
		const localVault = getLocalVault();
		if (localVault) {
			await localVault.delete(T_LAST_ERROR);
		}
	}

	async sync() {
		if (this.isSyncing) return;
		if (!tokensContext.current) return;
		if (!isStorageAvailable()) {
			devconsole.warn('[Backup] Cannot sync: App is locked');
			return;
		}

		this.isSyncing = true;
		devconsole.log('[Backup] Starting sync...');

		try {
			const vault = createCloudVault();
			/** @type {Record<string, import('$lib/types').Token>} */
			let cloudTokens = {};
			let cloudTombstones = {};

			// Attempt to fetch cloud payload
			try {
				const buffer = await driveClient.download(BACKUP_FILENAME, 'arraybuffer');
				const arrayBuffer = typeof buffer === 'string' ? new TextEncoder().encode(buffer).buffer : buffer;
				const cloudPayload = await vault.unpack(new Uint8Array(arrayBuffer));

				// Normalize cloud tokens to Token objects (handle legacy wrapper if present)
				const rawCloudTokens = /** @type {any} */ (cloudPayload).tokens || {};
				for (const [id, val] of Object.entries(rawCloudTokens)) {
					if (val.data) {
						cloudTokens[id] = { ...val.data, updatedAt: val.updatedAt };
					} else {
						cloudTokens[id] = val;
					}
				}
				cloudTombstones = /** @type {any} */ (cloudPayload).tombstones || {};
			} catch (/** @type {any} */ err) {
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
			await tokensContext.current.setTokensAndTombstones(newLocalTokens, mergedTombstones, { skipSyncNotify: true });

			// Prepare payload
			const finalPayload = {
				version: 5,
				lastSyncTs: Date.now(),
				tokens: mergedTokens,
				tombstones: mergedTombstones
			};

			// Encrypt and upload
			const cloudFileBytes = await vault.pack(finalPayload, BACKUP_FILE_TYPE);
			await driveClient.upload(
				BACKUP_FILENAME,
				new Blob([/** @type {ArrayBuffer} */ (cloudFileBytes.buffer)], { type: 'application/octet-stream' })
			);

			this.settingsContext?.updateSetting('lastSyncTime', Date.now());

			await this.clearError();
			devconsole.log('[Backup] Sync completed');
		} catch (e) {
			await this.setError(e);
			devconsole.error('[Backup] Sync failed', e);
		} finally {
			this.isSyncing = false;
		}
	}

	async checkCloudBackupExists() {
		try {
			const file = await driveClient.findFile(BACKUP_FILENAME);
			return !!file;
		} catch {
			return false;
		}
	}

	async getMnemonic() {
		return await keyManager.getMnemonicWords();
	}

	/**
	 * Called during onboarding if cloud backup exists to test user's 24-word phrase
	 * @param {string[]} words
	 */
	async verifyCloudBackupMnemonic(words) {
		try {
			const candidateMsk = mnemonicToMSK(words.join(' '));
			const tempKey = await importPayloadKey(candidateMsk);
			const vault = new CloudFileVault(tempKey);

			const buffer = await driveClient.download(BACKUP_FILENAME, 'arraybuffer');
			const arrayBuffer = typeof buffer === 'string' ? new TextEncoder().encode(buffer).buffer : buffer;

			// We can attempt to decrypt payload. If it succeeds, the phrase is valid.
			await vault.unpack(new Uint8Array(arrayBuffer));
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
		await tokensContext.purgeTokens();

		await adoptMSK(newMsk);

		await this.enable();
	}

	/** @type {any} */
	#userActionTimeout;
	/** @type {number} */
	#batchEndTime = 0;

	startAutoSync() {
		if (this.#userActionTimeout) clearTimeout(this.#userActionTimeout);

		// 10-second delayed sync on app load (with 1-hour guard)
		setTimeout(() => {
			if (this.autoSyncEnabled && Date.now() - this.lastSyncedAt > SYNC_INTERVAL) {
				this.sync();
			}
		}, 10000);

		// Visibility change trigger (with 1-hour guard)
		document.addEventListener('visibilitychange', () => {
			if (!document.hidden && this.autoSyncEnabled && Date.now() - this.lastSyncedAt > SYNC_INTERVAL) {
				this.sync();
			}
		});
	}

	stopAutoSync() {
		if (this.#userActionTimeout) clearTimeout(this.#userActionTimeout);
	}

	/**
	 * Schedule a sync after user modifies tokens (30-second batch window).
	 * No 1-hour guard - user actions should sync ASAP.
	 * First edit starts a 30s window; subsequent edits within the window are batched.
	 */
	scheduleSyncOnUserAction() {
		if (!this.autoSyncEnabled) return;
		if (Date.now() < this.#batchEndTime) return;

		this.#batchEndTime = Date.now() + 30000;
		clearTimeout(this.#userActionTimeout);
		this.#userActionTimeout = setTimeout(() => {
			this.sync();
		}, 30000);
	}
}

export const backupService = new BackupService();
