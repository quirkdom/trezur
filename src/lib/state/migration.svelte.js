import { browser } from '$app/environment';
import { devconsole } from '$lib/utils';
import { deriveLWK, wrapMSK, unwrapMSK } from '$lib/utils/crypto-keys';
import { encryptedLocalStorage } from '$lib/state/storage.svelte.js';
import { tokensContext } from '$lib/state/tokens.svelte.js';

const T_ES_WRAPPED_MSK = 'T_ES__wrapped_msk__';
const T_ES_WRAPPED_MSK_BAK = 'T_ES__wrapped_msk_bak__';

/**
 * Atomically re-wrap the MSK under a new passkey's LWK.
 * @param {string} newPasskey
 * @param {string} oldPasskey
 */
export async function migratePasscode(newPasskey, oldPasskey) {
	if (!browser) throw new Error('SSR safety: Migration can only be used in the browser.');
	if (!encryptedLocalStorage.current) throw new Error('[Migration] migratePasscode: no active storage instance.');

	// ── Phase 1: Prepare (all in memory, nothing persisted) ──
	const metadata = await encryptedLocalStorage.getOrCreateKDFMetadata(oldPasskey);
	const oldLwk = await deriveLWK(oldPasskey, metadata);
	const newLwk = await deriveLWK(newPasskey, metadata);

	const storedWrapped = localStorage.getItem(T_ES_WRAPPED_MSK);
	if (!storedWrapped) throw new Error('[Migration] migratePasscode: no wrapped MSK found in storage.');

	const msk = await unwrapMSK(JSON.parse(storedWrapped), oldLwk);
	const newWrappedMSK = await wrapMSK(msk, newLwk);

	// ── Phase 2: Commit ──
	localStorage.setItem(T_ES_WRAPPED_MSK_BAK, storedWrapped);
	localStorage.setItem(T_ES_WRAPPED_MSK, JSON.stringify(newWrappedMSK));
	localStorage.removeItem(T_ES_WRAPPED_MSK_BAK);

	devconsole.log('[Migration] MSK re-wrapped successfully. CryptoKey and storage instance unchanged.');
}

/**
 * Replace the local MSK with a new one (e.g. from cloud backup).
 * Re-encrypts all tokens under the new MSK.
 * @param {Uint8Array} newMsk
 * @param {string} currentPasskey
 */
export async function migrateMSK(newMsk, currentPasskey) {
	if (!browser) throw new Error('SSR safety: Migration can only be used in the browser.');
	if (!tokensContext.current) throw new Error('[Migration] migrateMSK: no active tokens context.');

	devconsole.log('[Migration] Adopting new MSK...');

	// 1. Read current tokens from memory
	const currentTokens = structuredClone($state.snapshot(tokensContext.current.getTokens()));

	// 2. Clear current tokens and reset engine
	await tokensContext.resetTokens();
	await encryptedLocalStorage.reset(true);

	// 3. Wrap the new MSK with the current passkey
	const metadata = await encryptedLocalStorage.getOrCreateKDFMetadata(currentPasskey);
	const lwk = await deriveLWK(currentPasskey, metadata);
	const newWrappedMSK = await wrapMSK(newMsk, lwk);

	// 4. Commit new MSK to local storage
	const storedWrapped = localStorage.getItem(T_ES_WRAPPED_MSK);
	if (storedWrapped) localStorage.setItem(T_ES_WRAPPED_MSK_BAK, storedWrapped);
	localStorage.setItem(T_ES_WRAPPED_MSK, JSON.stringify(newWrappedMSK));

	// 5. Re-initialize storage layer with new MSK
	await encryptedLocalStorage.init(currentPasskey);

	// 6. Re-initialize tokens context
	if (!encryptedLocalStorage.current) throw new Error('[Migration] Failed to re-initialize encrypted storage');
	await tokensContext.iMake(encryptedLocalStorage.current);

	if (currentTokens.length > 0) {
		await tokensContext.current?.addTokens(...currentTokens);
	}

	// Cleanup backup
	localStorage.removeItem(T_ES_WRAPPED_MSK_BAK);
	devconsole.log('[Migration] MSK migration complete. Tokens re-encrypted.');
}
