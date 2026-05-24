import { getMaxTimestamp, mergeTokens } from '$lib/state/tokens.svelte';
import { driveClient } from '$lib/sync/gdrive';

/** @typedef {import('$lib/types').Token} Token */

export const BACKUP_FILENAME = 'tokens.trzr';
export const BACKUP_FILE_TYPE = 'TOKN';

/**
 * @param {import('$lib/utils/cloud-file-vault').CloudFileVault} vault
 */
export async function fetchCloudState(vault) {
	try {
		const { data: buffer, etag } = await driveClient.download(BACKUP_FILENAME, 'arraybuffer');
		const arrayBuffer = typeof buffer === 'string' ? new TextEncoder().encode(buffer).buffer : buffer;
		const { payload: cloudPayload } = await vault.unpack(new Uint8Array(arrayBuffer));

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
export function resolveSyncConflicts(local, cloud) {
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
 * @param {Token[]} mergedTokens
 * @param {Record<string, number>} mergedTombstones
 * @param {{tokens: Record<string, Token>, tombstones: Record<string, number>}} cloudState
 */
export function isStateEqual(mergedTokens, mergedTombstones, cloudState) {
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
