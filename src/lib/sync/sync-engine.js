import { getMaxTimestamp, mergeTokens } from '$lib/state/tokens.svelte';
import { driveClient } from '$lib/sync/gdrive';

/** @typedef {import('$lib/types').Token} Token */
/** @typedef {import('$lib/types').SyncState} SyncState */

export const BACKUP_FILENAME = 'tokens.trzr';
export const BACKUP_FILE_TYPE = 'TOKN';

/**
 * @param {import('$lib/utils/cloud-file-vault').CloudFileVault} vault
 * @returns {Promise<{ state: SyncState, etag: string | null }>}
 */
export async function fetchCloudState(vault) {
	try {
		const { data: buffer, etag } = await driveClient.download(BACKUP_FILENAME, 'arraybuffer');
		const arrayBuffer = typeof buffer === 'string' ? new TextEncoder().encode(buffer).buffer : buffer;
		const { payload: cloudPayload } = await vault.unpack(new Uint8Array(arrayBuffer));

		/** @type {Token[]} */
		const cloudTokens = [];
		const rawCloudTokens = /** @type {any} */ (cloudPayload).tokens || {};
		for (const val of Object.values(rawCloudTokens)) {
			// Handle legacy wrapper if present
			const token = val.data ? { ...val.data, updatedAt: val.updatedAt } : val;
			cloudTokens.push(token);
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
		return { state: { tokens: [], tombstones: {} }, etag: null };
	}
}

/**
 * Merge local and cloud token states, resolving conflicts based on timestamps and tombstones.
 *
 * Conflict Resolution Algorithm:
 * 1. Merge Tombstones: Union local and cloud tombstones, keeping the latest deletion timestamp for each token ID.
 * 2. Merge Tokens:
 *    - If a cloud token is not in local: adopt it if its max field timestamp is equal to or greater than the tombstone timestamp (ensuring legacy tokens with timestamp 0 are adopted when no tombstone exists).
 *    - If a cloud token is also local: merge individual fields using Last-Writer-Wins (LWW) logic, where the incoming cloud token wins tie-breakers.
 * 3. Re-apply Tombstones: Delete any token whose tombstone timestamp is greater than or equal to its maximum field timestamp.
 *
 * Token Ordering:
 * - Local tokens retain their original relative order because the merged collection is initialized with `local.tokens`.
 * - Cloud-exclusive tokens (new tokens not present locally) are appended to the end in the order they appear in the cloud payload.
 * - This insertion-based merge preserves relative local consistency, though clients with mutually exclusive, unsynced
 *   tokens may end up with different array sequences (which are resolved visually in the UI by sort settings).
 *
 * @param {SyncState} local Local token state
 * @param {SyncState} cloud Cloud token state
 * @returns {SyncState} Merged token state after resolving conflicts
 */
export function resolveSyncConflicts(local, cloud) {
	/** @type {Record<string, number>} */ const mergedTombstones = { ...local.tombstones };

	// 1. Merge tombstones: take the latest deletion timestamp
	for (const [id, ts] of Object.entries(cloud.tombstones))
		mergedTombstones[id] = Math.max(mergedTombstones[id] || 0, ts);

	/** @type {Record<string, Token>} */
	const mergedTokens = Object.fromEntries(local.tokens.map((t) => [t.id, t]));

	// 2. Merge tokens: resolve conflict for each cloud token
	for (const cloudToken of cloud.tokens) {
		const id = cloudToken.id;
		const tombTs = mergedTombstones[id] || 0;

		if (!mergedTokens[id]) {
			// Token only exists in cloud
			const maxCloudTokenTimestamp = getMaxTimestamp(cloudToken); // 0 for legacy, > 0 for modern
			if (maxCloudTokenTimestamp >= tombTs) {
				// when maxCloudTokenTimestamp is 0 (legacy), this condition allows adoption if no tombstone exists (tombTs=0), ensuring legacy tokens are not erroneously discarded
				mergedTokens[id] = cloudToken;
			}
		} else {
			mergedTokens[id] = mergeTokens(mergedTokens[id], cloudToken);
		}
	}

	// 3. Re-apply tombstones: ensure any token newer than or equal to a deletion is kept, else deleted
	for (const [id, ts] of Object.entries(mergedTombstones)) {
		if (mergedTokens[id] && ts >= getMaxTimestamp(mergedTokens[id])) delete mergedTokens[id];
	}

	return {
		tokens: Object.values(mergedTokens),
		tombstones: mergedTombstones
	};
}

/**
 * @param {import('$lib/utils/cloud-file-vault').CloudFileVault} vault
 * @param {any} payload
 * @param {number} snapshotTime
 * @param {string | null} [etag]
 */
export async function uploadCloudState(vault, payload, snapshotTime, etag) {
	const cloudFileBytes = await vault.pack(payload, BACKUP_FILE_TYPE, snapshotTime);
	await driveClient.upload(
		BACKUP_FILENAME,
		new Blob([/** @type {BlobPart} */ (cloudFileBytes)], { type: 'application/octet-stream' }),
		{ etag: etag ?? undefined }
	);
}

/**
 * Compare local merged state with cloud state to determine if an upload is necessary.
 * @param {SyncState} merged
 * @param {SyncState} cloud
 * @returns {boolean}
 */
export function areSyncStatesEquivalent(merged, cloud) {
	if (merged.tokens.length !== cloud.tokens.length) return false;

	// Build a map of cloud tokens for O(1) lookup
	const cloudTokenMap = new Map(cloud.tokens.map((t) => [t.id, t]));

	for (const t of merged.tokens) {
		const cloudT = cloudTokenMap.get(t.id);
		if (!cloudT) return false;
		if (getMaxTimestamp(t) !== getMaxTimestamp(cloudT)) return false;
	}

	const mergedTombIds = Object.keys(merged.tombstones);
	const cloudTombIds = Object.keys(cloud.tombstones);
	if (mergedTombIds.length !== cloudTombIds.length) return false;

	for (const id of mergedTombIds) {
		if (merged.tombstones[id] !== cloud.tombstones[id]) return false;
	}

	return true;
}
