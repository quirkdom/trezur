import { keyManager } from '$lib/state/key-manager.svelte';
import { adoptMSK, createCloudVault, getLocalVault, isStorageAvailable } from '$lib/state/storage.svelte';
import { getMaxTimestamp, mergeTokens, tokensContext } from '$lib/state/tokens.svelte';
import { driveClient } from '$lib/sync/gdrive';
import { devconsole } from '$lib/utils';
import { mnemonicToMSK } from '$lib/utils/bip39';
import { CloudFileVault } from '$lib/utils/cloud-file-vault';
import { importPayloadKey } from '$lib/utils/crypto-keys';

const T_BACKUP_STATE = 'T_backup_state';
const BACKUP_FILENAME = 'tokens.trzr';
const BACKUP_FILE_TYPE = 'TOKN';
const SYNC_INTERVAL = 3_600_000; // 1 hour — between auto syncs
const UNLOCK_DELAY = 10_000; // 10 seconds — initial delay on unlock
const USER_ACTION_DELAY = 30_000; // 30 seconds — batch window for user actions

class BackupService {
	/** @type {boolean} */
	isSyncing = $state(false);
	/** @type {string | null} */
	lastError = $state(null);
	/** @type {boolean} */
	autoSyncEnabled = $state(false);
	/** @type {number} */
	lastSyncTime = $state(0);

	/** @type {ReturnType<typeof setTimeout> | null} */
	#syncTimer = null;
	/** @type {number} */
	#batchEndTime = 0;
	/** @type {(() => void) | null} */
	#visibilityHandler = null;

	/**
	 * Initialize backup service: restore state from vault, start auto sync if enabled.
	 * Called deterministically after storage init (initStorage / adoptMSK).
	 */
	async init() {
		const vault = getLocalVault();
		if (!vault) return;

		const saved = await vault.get(T_BACKUP_STATE);
		if (saved) {
			this.autoSyncEnabled = saved.autoSyncEnabled ?? false;
			this.lastError = saved.lastError ?? null;
			this.lastSyncTime = saved.lastSyncTime ?? 0;
		}

		if (this.autoSyncEnabled) {
			this.#startAutoSync();
		}
	}

	/**
	 * Start auto-sync: delayed initial sync on unlock + visibility handler.
	 */
	#startAutoSync() {
		this.#clearTimer();

		// 10-second delayed sync on app unlock
		this.#scheduleTimer(UNLOCK_DELAY);

		// Visibility change trigger: if no timer pending and sync is overdue, run auto sync.
		// This handles the case where the tab was hidden and JS was paused — the timer
		// couldn't fire, so we catch up on visibility restore.
		this.#visibilityHandler = () => {
			if (document.hidden) return;
			if (this.#syncTimer) return;
			if (Date.now() - this.lastSyncTime < SYNC_INTERVAL) return;
			this.#runAutoSync();
		};
		document.addEventListener('visibilitychange', this.#visibilityHandler);
	}

	/**
	 * Schedule a timer for the next sync. Clears any pending timer first.
	 * @param {number} delay
	 */
	#scheduleTimer(delay) {
		this.#clearTimer();
		this.#syncTimer = setTimeout(() => this.#onTimerFire(), delay);
	}

	#clearTimer() {
		if (this.#syncTimer !== null) {
			clearTimeout(this.#syncTimer);
			this.#syncTimer = null;
		}
	}

	#onTimerFire() {
		this.#syncTimer = null;
		this.#runAutoSync();
	}

	/**
	 * Run sync then schedule the next auto-sync. Used by timer and visibility handler.
	 */
	async #runAutoSync() {
		try {
			await this.sync();
		} catch (e) {
			devconsole.error('[Backup] Auto sync failed', e);
		}
		this.#scheduleNextAutoSync();
	}

	/**
	 * Schedule the next auto sync at SYNC_INTERVAL from now, if auto-sync is enabled.
	 */
	#scheduleNextAutoSync() {
		if (!this.autoSyncEnabled) return;
		this.#scheduleTimer(SYNC_INTERVAL);
	}

	#removeVisibilityHandler() {
		if (this.#visibilityHandler) {
			document.removeEventListener('visibilitychange', this.#visibilityHandler);
			this.#visibilityHandler = null;
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
				new Blob([/** @type {BlobPart} */ (cloudFileBytes)], { type: 'application/octet-stream' })
			);

			this.lastSyncTime = Date.now();
			await this.#persistState();

			await this.#clearError();
			devconsole.log('[Backup] Sync completed');
		} catch (e) {
			await this.#setError(e);
			devconsole.error('[Backup] Sync failed', e);
		} finally {
			this.isSyncing = false;
		}
	}

	/**
	 * @param {unknown} e
	 */
	async #setError(e) {
		this.lastError = e instanceof Error ? e.message : String(e);
		await this.#persistState();
	}

	async #clearError() {
		this.lastError = null;
		await this.#persistState();
	}

	async #persistState() {
		const vault = getLocalVault();
		if (vault) {
			await vault.set(T_BACKUP_STATE, {
				autoSyncEnabled: this.autoSyncEnabled,
				lastError: this.lastError,
				lastSyncTime: this.lastSyncTime
			});
		}
	}

	async enable() {
		const vault = getLocalVault();
		if (!vault) throw new Error('Storage not ready');
		if (!isStorageAvailable()) throw new Error('App passcode not set or locked');

		this.autoSyncEnabled = true;
		await this.#persistState();
		this.#startAutoSync();

		await this.sync();
		this.#scheduleNextAutoSync(); // clobbers UNLOCK_DELAY timer via #clearTimer in #scheduleTimer
	}

	async disable() {
		const vault = getLocalVault();
		if (!vault) return;

		this.autoSyncEnabled = false;
		await this.#persistState();
		this.#clearTimer();
		this.#removeVisibilityHandler();
	}

	stopAutoSync() {
		this.#clearTimer();
		this.#removeVisibilityHandler();
	}

	clearError() {
		return this.#clearError();
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
		return verifyCloudBackupMnemonic(words);
	}

	/**
	 * Called during onboarding after validating words
	 * @param {string[]} words
	 */
	async adoptCloudBackup(words) {
		return adoptCloudBackup(words);
	}

	/**
	 * Schedule a sync after user modifies tokens (30-second batch window).
	 * No guard — user actions should sync ASAP.
	 * Called from `scheduleSyncOnUserAction` standalone export.
	 */
	_scheduleSyncOnUserAction() {
		if (!this.autoSyncEnabled) return;
		if (Date.now() < this.#batchEndTime) return;

		this.#batchEndTime = Date.now() + USER_ACTION_DELAY;
		this.#scheduleTimer(USER_ACTION_DELAY);
	}
}

export const backupService = new BackupService();

/**
 * Module-level: fire-and-forget boundary for tokens code.
 * Delegates to class instance.
 */
export function scheduleSyncOnUserAction() {
	backupService._scheduleSyncOnUserAction();
}

/**
 * Module-level: verify a 24-word mnemonic against the cloud backup.
 * Heavy (BIP39 wordlists), manages circular dep boundary.
 * @param {string[]} words
 */
export async function verifyCloudBackupMnemonic(words) {
	try {
		const candidateMsk = mnemonicToMSK(words.join(' '));
		const tempKey = await importPayloadKey(candidateMsk);
		const vault = new CloudFileVault(tempKey);

		const buffer = await driveClient.download(BACKUP_FILENAME, 'arraybuffer');
		const arrayBuffer = typeof buffer === 'string' ? new TextEncoder().encode(buffer).buffer : buffer;

		await vault.unpack(new Uint8Array(arrayBuffer));
		return true;
	} catch (e) {
		devconsole.warn('[Backup] Mnemonic verification failed', e);
		return false;
	}
}

/**
 * Module-level: adopt a cloud backup's MSK after validating the recovery phrase.
 * @param {string[]} words
 */
export async function adoptCloudBackup(words) {
	const newMsk = mnemonicToMSK(words.join(' '));
	await tokensContext.purgeTokens();

	await adoptMSK(newMsk);

	await backupService.enable();
}
