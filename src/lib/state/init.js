/**
 * Orchestration module for initializing encrypted local storage and tokens context.
 *
 * This is the single entry point for all ELS + tokens initialization, replacing the
 * previous $effect-based auto-init in +layout.svelte. By making initialization explicit,
 * we eliminate race conditions between the auto-init effect and manual reset flows.
 *
 * @module init
 */
import { encryptedLocalStorage } from '$lib/state/storage.svelte';
import { tokensContext } from '$lib/state/tokens.svelte';

/**
 * Initialize encrypted local storage and tokens context with the given passkey.
 *
 * Call this explicitly at every entry point that needs ELS:
 * - App cold start (with clientId)
 * - Unlock (with passcode)
 * - After purge/reset (with newly generated clientId)
 * - After forgot-passcode (with existing clientId)
 * - After migration (with clientId)
 *
 * @param {string} passkey — clientId (no passcode) or user passcode
 * @returns {Promise<boolean>} — true if initialization succeeded
 */
export async function initStorageAndTokens(passkey) {
	const storage = await encryptedLocalStorage.init(passkey);
	if (storage) {
		await tokensContext.iMake(storage);
		return true;
	}
	return false;
}
