/**
 * Shared storage state and plain functions for initializing and clearing
 * the in-memory encrypted vault, key material, and tokens.
 *
 * Does NOT couple to ConditionsCtx — callers own lock-state updates.
 *
 * @module storage
 */
import { keyManager } from '$lib/state/key-manager.svelte';
import { LocalKVVault } from '$lib/utils/local-kv-vault';
import { CloudFileVault } from '$lib/utils/cloud-file-vault';
import { tokensContext } from '$lib/state/tokens.svelte';
import { generateMSK } from '$lib/utils/crypto-keys';
import { cloudSyncService } from '$lib/sync/cloud-sync.svelte';

/** @type {import('$lib/utils/local-kv-vault').LocalKVVault | null} */
let localVault = $state(null);

/** @type {CryptoKey | null} */
let cryptoKey = $state(null);

export function getLocalVault() {
	return localVault;
}

export function isStorageAvailable() {
	return localVault !== null && cryptoKey !== null;
}

/**
 * Initialize storage state and management for this app.
 * Usually accompanies an app unlock action, but can be called independently if needed.
 *
 * Does _not_ touch the `isAppLocked` condition — callers own that responsibility.
 *
 * @param {string} passkeyParam
 * @returns {Promise<boolean>} Boolean whether initialization succeeded. False usually means an incorrect passkey, but could also indicate other errors.
 */
export async function initStorage(passkeyParam) {
	try {
		const derivedKey = await keyManager.unlock(passkeyParam);
		if (!derivedKey) return false;

		cryptoKey = derivedKey;
		localVault = new LocalKVVault(cryptoKey);
		await tokensContext.iMake(localVault);
		await cloudSyncService.init();
		return true;
	} catch (err) {
		console.error('[storage] initStorage failed:', err);
		return false;
	}
}

/**
 * Create a new CloudFileVault backed by the cached crypto key.
 * The app must be unlocked (local vault present) before calling this.
 *
 * @returns {import('$lib/utils/cloud-file-vault.js').CloudFileVault}
 */
export function createCloudVault() {
	if (!cryptoKey) throw new Error('Storage not initialized — app must be unlocked first');
	return new CloudFileVault(cryptoKey);
}

/**
 * Adopt a new MSK (master secret key), typically from a cloud backup recovery phrase.
 *
 * Orchestrates the full adoption flow:
 * 1. keyManager re-wraps the new MSK with the existing passcode
 * 2. crypto key is re-derived from the stored passkey
 * 3. A new local vault is created and tokens context is re-initialized
 *
 * @param {Uint8Array} newMSK
 */
export async function adoptMSK(newMSK) {
	if (!cryptoKey) throw new Error('Storage not initialized — app must be unlocked first');

	const derivedKey = await keyManager.adoptMSK(newMSK);
	if (!derivedKey) throw new Error('Failed to derive cryptoKey after MSK adoption');
	cryptoKey = derivedKey;

	localVault = new LocalKVVault(cryptoKey);
	await tokensContext.iMake(localVault);
	await cloudSyncService.init();
}

/**
 * Rotate the MSK by generating a new one and adopting it.
 * Used during cloud onboarding to ensure a fresh, strongly-wrapped key is used for the backup.
 */
export async function rotateMSK() {
	await adoptMSK(generateMSK());
}

/**
 * Clear in-memory storage state for this app; doesn't touch persistent storage.
 * Usually accompanies an app lock action.
 *
 * Does _not_ touch the `isAppLocked` condition — callers own that responsibility.
 */
export function clearStorage() {
	cloudSyncService.stopAutoSync();
	tokensContext.resetTokens();
	localVault = null;
	cryptoKey = null;
	keyManager.lock();
}

/**
 * Clears and purges all storage state for this app, both in-memory and persistent.
 * Usually accompanies a "factory reset" or "forgot passcode" action.
 *
 * Does not touch the `isAppLocked` condition — callers own that responsibility.
 */
export async function purgeStorage() {
	cloudSyncService.stopAutoSync();
	tokensContext.purgeTokens();
	localVault?.clear();
	localVault = null;
	cryptoKey = null;
	keyManager.purge();
}
