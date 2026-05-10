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
import { tokensContext } from '$lib/state/tokens.svelte';

/** @type {import('$lib/utils/local-kv-vault').LocalKVVault | null} */
let localVault = $state(null);

export function getLocalVault() {
	return localVault;
}

/**
 * Initialize storage state and management for this app.
 * Usually accompanies an app unlock action, but can be called independently if needed.
 *
 * Does _not_ touch the `isAppLocked` condition — callers own that responsibility.
 *
 * @param {string} passkey
 * @returns {Promise<boolean>} Boolean whether initialization succeeded. False usually means an incorrect passkey, but could also indicate other errors.
 */
export async function initStorage(passkey) {
	try {
		const cryptoKey = await keyManager.unlock(passkey);
		if (!cryptoKey) return false;

		localVault = new LocalKVVault(cryptoKey);
		await tokensContext.iMake(localVault);
		return true;
	} catch (err) {
		console.error('[storage] initStorage failed:', err);
		return false;
	}
}

/**
 * Clear in-memory storage state for this app; doesn't touch persistent storage.
 * Usually accompanies an app lock action.
 *
 * Does _not_ touch the `isAppLocked` condition — callers own that responsibility.
 */
export function clearStorage() {
	tokensContext.resetTokens();
	localVault = null;
	keyManager.lock();
}

/**
 * Clears and purges all storage state for this app, both in-memory and persistent.
 * Usually accompanies a "factory reset" or "forgot passcode" action.
 *
 * Does not touch the `isAppLocked` condition — callers own that responsibility.
 */
export async function purgeStorage() {
	tokensContext.purgeTokens();
	localVault?.clear();
	localVault = null;
	keyManager.purge();
}
