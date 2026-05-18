import { keyManager } from '$lib/state/key-manager.svelte';
import { adoptMSK, createCloudVault, getLocalVault, isStorageAvailable } from '$lib/state/storage.svelte';
import { getMaxTimestamp, mergeTokens, tokensContext } from '$lib/state/tokens.svelte';
import { driveClient } from '$lib/sync/gdrive';
import { devconsole } from '$lib/utils';
import { mnemonicToMSK } from '$lib/utils/bip39';
import { CloudFileVault } from '$lib/utils/cloud-file-vault';
import { importPayloadKey } from '$lib/utils/crypto-keys';

/** @typedef {import('$lib/types').Token} Token */

const T_BACKUP_STATE = 'T_backup_state';
const BACKUP_FILENAME = 'tokens.trzr';
const BACKUP_FILE_TYPE = 'TOKN';
const SYNC_INTERVAL = 3_600_000; // 1 hour — between auto syncs
const UNLOCK_DELAY = 10_000; // 10 seconds — initial delay on unlock
const USER_ACTION_DELAY = 30_000; // 30 seconds — batch window for user actions

class BackupService {
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
	 * Perform a full sync with the cloud provider.
	 */
	async sync() {
		if (this.isSyncing || !tokensContext.current || !isStorageAvailable()) return;

		this.isSyncing = true;
		devconsole.log('[Backup] Starting sync...');

		let retryCount = 0;
		const MAX_RETRIES = 3;

		try {
			const vault = createCloudVault();

			while (retryCount <= MAX_RETRIES) {
				// 1. Fetch cloud state
				const { state: cloudState, etag } = await _fetchCloudState(vault);

				// 2. Resolve conflicts (LWW Merge)
				const localState = {
					tokens: tokensContext.current.getTokens(),
					tombstones: tokensContext.current.getTombstones()
				};
				const merged = _resolveSyncConflicts(localState, cloudState);

				// 3. Update local context
				await tokensContext.current.setTokensAndTombstones(merged.tokens, merged.tombstones, {
					skipSyncNotify: true
				});

				// 4. Push to cloud (only if something changed)
				if (!_isStateEqual(merged.tokens, merged.tombstones, cloudState)) {
					const finalPayload = {
						version: 5,
						lastSyncTs: Date.now(),
						tokens: Object.fromEntries(merged.tokens.map((t) => [t.id, t])),
						tombstones: merged.tombstones
					};

					try {
						await _uploadCloudState(vault, finalPayload, etag);
						devconsole.log('[Backup] Cloud state updated');
						break; // Success!
					} catch (/** @type {any} */ uploadErr) {
						if (uploadErr.message.includes('Precondition Failed') && retryCount < MAX_RETRIES) {
							retryCount++;
							const delay = Math.floor(Math.random() * (250 - 100 + 1) + 100);
							devconsole.warn(
								`[Backup] Sync conflict (ETag mismatch), retrying ${retryCount}/${MAX_RETRIES} after ${delay}ms...`
							);
							await new Promise((resolve) => setTimeout(resolve, delay));
							continue; // Retry sync loop
						}
						throw uploadErr;
					}
				} else {
					devconsole.log('[Backup] No changes to upload');
					break;
				}
			}

			this.lastSyncTime = Date.now();
			await this.#persistState();
			await this.clearError();

			devconsole.log('[Backup] Sync completed');
		} catch (e) {
			this.lastError = e instanceof Error ? e.message : String(e);
			await this.#persistState();
			devconsole.error('[Backup] Sync failed', e);
		} finally {
			this.isSyncing = false;
		}
	}

	async enable() {
		const vault = getLocalVault();
		if (!vault || !isStorageAvailable()) throw new Error('Storage not ready or locked');

		this.autoSyncEnabled = true;
		await this.#persistState();
		this.#startAutoSync();

		await this.sync();
		this.#scheduleTimer(SYNC_INTERVAL); // schedule next auto-sync
	}

	async disable() {
		this.autoSyncEnabled = false;
		await this.#persistState();
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
	 * Internal-only: use the exported `scheduleSyncOnUserAction` for external calls.
	 */
	_scheduleSyncOnUserAction() {
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
	 * @param {number} delay
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
			devconsole.error('[Backup] Auto sync failed', e);
		}
		if (this.autoSyncEnabled) this.#scheduleTimer(SYNC_INTERVAL);
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
}

// Singleton Instance
export const backupService = new BackupService();

/**
 * Fire-and-forget boundary for tokens code.
 */
export function scheduleSyncOnUserAction() {
	backupService._scheduleSyncOnUserAction();
}

/**
 * Verify a 24-word mnemonic against the cloud backup.
 * (Heavy export for tree-shaking)
 * @param {string[]} words
 */
export async function verifyCloudBackupMnemonic(words) {
	try {
		const candidateMsk = mnemonicToMSK(words.join(' '));
		const tempKey = await importPayloadKey(candidateMsk);
		const vault = new CloudFileVault(tempKey);

		const { data: buffer } = await driveClient.download(BACKUP_FILENAME, 'arraybuffer', {
			range: 'bytes=0-63'
		});
		const arrayBuffer = typeof buffer === 'string' ? new TextEncoder().encode(buffer).buffer : buffer;

		await vault.verifyHeader(new Uint8Array(arrayBuffer));
		return true;
	} catch (e) {
		devconsole.warn('[Backup] Mnemonic verification failed', e);
		return false;
	}
}

/**
 * Adopt a cloud backup's MSK after validating the recovery phrase.
 * (Heavy export for tree-shaking)
 * @param {string[]} words
 */
export async function adoptCloudBackup(words) {
	const newMsk = mnemonicToMSK(words.join(' '));
	await tokensContext.purgeTokens();
	await adoptMSK(newMsk);
	await backupService.enable();
}

// --- Internal "Fat" Logic Functions (Unexported) ---

/**
 * @param {import('$lib/utils/cloud-file-vault').CloudFileVault} vault
 */
async function _fetchCloudState(vault) {
	try {
		const { data: buffer, etag } = await driveClient.download(BACKUP_FILENAME, 'arraybuffer');
		const arrayBuffer = typeof buffer === 'string' ? new TextEncoder().encode(buffer).buffer : buffer;
		const cloudPayload = await vault.unpack(new Uint8Array(arrayBuffer));

		/** @type {Record<string, Token>} */
		const cloudTokens = {};
		const rawCloudTokens = /** @type {any} */ (cloudPayload).tokens || {};
		for (const [id, val] of Object.entries(rawCloudTokens)) {
			// Handle legacy wrapper if present
			cloudTokens[id] = val.data ? { ...val.data, updatedAt: val.updatedAt } : val;
		}

		return {
			state: {
				tokens: cloudTokens,
				tombstones: /** @type {Record<string, number>} */ (/** @type {any} */ (cloudPayload).tombstones || {})
			},
			etag
		};
	} catch (/** @type {any} */ err) {
		if (err.message !== 'File not found') throw err;
		return { state: { tokens: {}, tombstones: {} }, etag: null };
	}
}

/**
 * @param {{tokens: Token[], tombstones: Record<string, number>}} local
 * @param {{tokens: Record<string, Token>, tombstones: Record<string, number>}} cloud
 */
function _resolveSyncConflicts(local, cloud) {
	/** @type {Record<string, number>} */
	const mergedTombstones = { ...local.tombstones };

	// 1. Merge tombstones
	for (const [id, ts] of Object.entries(cloud.tombstones)) {
		if (!mergedTombstones[id] || mergedTombstones[id] < ts) {
			mergedTombstones[id] = ts;
		}
	}

	/** @type {Record<string, Token>} */
	const mergedTokens = {};
	for (const t of local.tokens) mergedTokens[t.id] = t;

	// 2. Merge tokens
	for (const [id, cloudToken] of Object.entries(cloud.tokens)) {
		const tombTs = mergedTombstones[id] || 0;

		if (!mergedTokens[id]) {
			if (getMaxTimestamp(cloudToken) > tombTs) {
				mergedTokens[id] = cloudToken;
			}
		} else {
			mergedTokens[id] = mergeTokens(mergedTokens[id], cloudToken);
		}
	}

	// 3. Re-apply tombstones
	for (const [id, ts] of Object.entries(mergedTombstones)) {
		if (mergedTokens[id] && ts >= getMaxTimestamp(mergedTokens[id])) {
			delete mergedTokens[id];
		}
	}

	return {
		tokens: Object.values(mergedTokens),
		tombstones: mergedTombstones
	};
}

/**
 * @param {import('$lib/utils/cloud-file-vault').CloudFileVault} vault
 * @param {any} payload
 * @param {string | null} [etag]
 */
async function _uploadCloudState(vault, payload, etag) {
	const cloudFileBytes = await vault.pack(payload, BACKUP_FILE_TYPE);
	await driveClient.upload(
		BACKUP_FILENAME,
		new Blob([/** @type {BlobPart} */ (cloudFileBytes)], { type: 'application/octet-stream' }),
		{ etag: etag ?? undefined }
	);
}

/**
 * Compare local merged state with cloud state to determine if an upload is necessary.
 * @param {Token[]} mergedTokens
 * @param {Record<string, number>} mergedTombstones
 * @param {{tokens: Record<string, Token>, tombstones: Record<string, number>}} cloudState
 */
function _isStateEqual(mergedTokens, mergedTombstones, cloudState) {
	const cloudTokenIds = Object.keys(cloudState.tokens);
	if (mergedTokens.length !== cloudTokenIds.length) return false;

	for (const t of mergedTokens) {
		const cloudT = cloudState.tokens[t.id];
		if (!cloudT) return false;
		if (getMaxTimestamp(t) !== getMaxTimestamp(cloudT)) return false;
	}

	const mergedTombIds = Object.keys(mergedTombstones);
	const cloudTombIds = Object.keys(cloudState.tombstones);
	if (mergedTombIds.length !== cloudTombIds.length) return false;

	for (const id of mergedTombIds) {
		if (mergedTombstones[id] !== cloudState.tombstones[id]) return false;
	}

	return true;
}
