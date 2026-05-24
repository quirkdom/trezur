import { keyManager } from '$lib/state/key-manager.svelte';
import { createCloudVault, getLocalVault, isStorageAvailable } from '$lib/state/storage.svelte';
import { tokensContext } from '$lib/state/tokens.svelte';
import { driveClient } from '$lib/sync/gdrive';
import {
	fetchCloudState,
	areSyncStatesEquivalent,
	resolveSyncConflicts,
	uploadCloudState,
	BACKUP_FILENAME
} from '$lib/sync/sync-engine';
import { devconsole } from '$lib/utils';

/** @typedef {import('$lib/types').Token} Token */

const T_BACKUP_STATE = 'T_backup_state';
const SYNC_INTERVAL = 3_600_000; // 1 hour — between auto syncs
const UNLOCK_DELAY = 10_000; // 10 seconds — initial delay on unlock
const USER_ACTION_DELAY = 30_000; // 30 seconds — batch window for user actions

class CloudSyncService {
	// --- Public Reactive State ---
	/** @type {boolean} */
	isSyncing = $state(false);
	/** @type {string | null} */
	lastError = $state(null);
	/** @type {boolean} */
	autoSyncEnabled = $state(false);
	/** @type {number} */
	lastSyncTime = $state(0);

	// --- Internal State ---
	/** @type {ReturnType<typeof setTimeout> | null} */
	#syncTimer = null;
	/** @type {number} */
	#batchEndTime = 0;
	/** @type {(() => void) | null} */
	#visibilityHandler = null;

	/**
	 * Initialize sync service: restore state from vault, start auto sync if enabled.
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
	 * Perform a full sync with the cloud provider.
	 */
	async sync() {
		if (this.isSyncing || !tokensContext.current || !isStorageAvailable()) return;

		this.isSyncing = true;
		devconsole.log('[Sync] Starting sync...');

		let retryCount = 0;
		const MAX_RETRIES = 3;

		try {
			const vault = createCloudVault();

			while (retryCount <= MAX_RETRIES) {
				// 1. Fetch cloud state
				const { state: cloudState, etag } = await fetchCloudState(vault);

				// 2. Resolve conflicts (LWW Merge)
				const localState = {
					tokens: tokensContext.current.getTokens(),
					tombstones: tokensContext.current.getTombstones()
				};
				const merged = resolveSyncConflicts(localState, cloudState);

				// 3. Update local context
				await tokensContext.current.setTokensAndTombstones(merged.tokens, merged.tombstones, {
					skipSyncNotify: true
				});

				// 4. Push to cloud (only if something changed)
				if (!areSyncStatesEquivalent(merged, cloudState)) {
					const finalPayload = {
						tokens: Object.fromEntries(merged.tokens.map((t) => [t.id, t])),
						tombstones: merged.tombstones
					};

					try {
						await uploadCloudState(vault, finalPayload, Date.now(), etag);
						devconsole.log('[Sync] Cloud state updated');
						break; // Success!
					} catch (/** @type {any} */ uploadErr) {
						if (uploadErr.message.includes('Precondition Failed') && retryCount < MAX_RETRIES) {
							retryCount++;
							const delay = Math.floor(Math.random() * (250 - 100 + 1) + 100);
							devconsole.warn(
								`[Sync] Sync conflict (ETag mismatch), retrying ${retryCount}/${MAX_RETRIES} after ${delay}ms...`
							);
							await new Promise((resolve) => setTimeout(resolve, delay));
							continue; // Retry sync loop
						}
						throw uploadErr;
					}
				} else {
					devconsole.log('[Sync] No changes to upload');
					break;
				}
			}

			this.lastSyncTime = Date.now();
			await this.#persistState();
			await this.clearError();

			devconsole.log('[Sync] Sync completed');
		} catch (e) {
			this.lastError = e instanceof Error ? e.message : String(e);
			await this.#persistState();
			devconsole.error('[Sync] Sync failed', e);
		} finally {
			this.isSyncing = false;
		}
	}

	async enable() {
		const vault = getLocalVault();
		if (!vault || !isStorageAvailable()) throw new Error('Storage not ready or locked');

		this.autoSyncEnabled = true;
		await this.#persistState();
		await this.sync();
		this.#startAutoSync();
	}

	async disable() {
		await this.storage?.delete(T_CLOUD_SYNC_STATE);

		this.autoSyncEnabled = false;
		this.lastError = null;
		this.lastSyncTime = 0;

		this.stopAutoSync();
	}

	stopAutoSync() {
		this.#clearTimer();
		if (this.#visibilityHandler) {
			document.removeEventListener('visibilitychange', this.#visibilityHandler);
			this.#visibilityHandler = null;
		}
	}

	async clearError() {
		this.lastError = null;
		await this.#persistState();
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
	 * Schedule a sync after user modifies tokens (30-second batch window).
	 */
	scheduleSyncOnUserAction() {
		if (!this.autoSyncEnabled || Date.now() < this.#batchEndTime) return;

		this.#batchEndTime = Date.now() + USER_ACTION_DELAY;
		this.#scheduleTimer(USER_ACTION_DELAY);
	}

	// --- Private Helpers ---

	#startAutoSync() {
		this.#clearTimer();

		const delay = UNLOCK_DELAY + Math.max(0, SYNC_INTERVAL - (Date.now() - this.lastSyncTime));
		this.#scheduleTimer(delay);

		if (!this.#visibilityHandler) {
			this.#visibilityHandler = () => {
				if (document.hidden || this.#syncTimer || Date.now() - this.lastSyncTime < SYNC_INTERVAL) return;
				this.#runAutoSync();
			};

			document.addEventListener('visibilitychange', this.#visibilityHandler);
		}
	}

	/**
	 * @param {number} delay in milliseconds
	 */
	#scheduleTimer(delay) {
		this.#clearTimer();
		this.#syncTimer = setTimeout(() => this.#runAutoSync(), delay);
	}

	#clearTimer() {
		if (this.#syncTimer) {
			clearTimeout(this.#syncTimer);
			this.#syncTimer = null;
		}
	}

	async #runAutoSync() {
		this.#syncTimer = null;
		try {
			await this.sync();
		} catch (e) {
			devconsole.error('[Sync] Auto sync failed', e);
		}
		if (this.autoSyncEnabled) this.#scheduleTimer(SYNC_INTERVAL);
	}

	async #persistState() {
		await this.storage?.set(T_CLOUD_SYNC_STATE, {
			autoSyncEnabled: this.autoSyncEnabled,
			lastError: this.lastError,
			lastSyncTime: this.lastSyncTime
		});
	}
}

// Singleton Instance
export const cloudSyncService = new CloudSyncService();
