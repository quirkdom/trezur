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
		const backupMSK = keyManager.hasBackup;

		// 1. Roll back KeyManager first if transaction got interrupted before committing (or standalone changePasskey/replaceMSK crashed)
		if (backupMSK) {
			console.warn('[storage] Interrupted transaction detected on startup; rolling back MSK...');
			await keyManager.rollbackAdoptMSKTxn();
		}

		// 2. Standard KeyManager unlock
		const derivedKey = await keyManager.unlock(passkeyParam);
		if (!derivedKey) return false;

		cryptoKey = derivedKey;
		localVault = new LocalKVVault(cryptoKey);

		// 3. Roll back vault if the transaction did not commit (KeyManager backup is still present)
		if (backupMSK) {
			console.warn('[storage] Interrupted transaction detected; rolling back local vault...');
			await localVault.rollbackRekeyTxn();
		} else {
			// 4. Safe recovery cleanup: crashed after KM commit but before vault commit. Purge leftover backup unconditionally
			await localVault.commitRekeyTxn();
		}

		// 5. Initialize the services with the new vault instance and factory callback
		await tokensContext.init(localVault);
		await cloudSyncService.init(localVault, createCloudVault);
		return true;
	} catch (err) {
		console.error('[storage] initStorage failed:', err);
		return false;
	}
}

/**
 * Perform KDF migration from v0 to v1
 *
 * @param {string} passkeyParam
 */
export async function initStorageForKDFMigration(passkeyParam) {
	if (!keyManager.needsMigration) throw new Error('KDF migration not needed or already performed!');

	cryptoKey = await keyManager.unlock(passkeyParam);
	if (!cryptoKey) throw new Error('Failed to generate new key material');

	localVault = new LocalKVVault(cryptoKey);

	await tokensContext.migrateToNewStorage(localVault);
	await cloudSyncService.init(localVault, createCloudVault);
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
	if (!cryptoKey || !localVault) throw new Error('Storage not initialized — app must be unlocked first');

	// 1. Prepare KeyManager (backs up old wrapped MSK/meta into BAK_KEYMAN, writes new MSK)
	const tempCryptoKey = await keyManager.prepareAdoptMSKTxn(newMSK);

	try {
		// 2. Prepare Vault (consolidates backup into BAK_LOCALVAULT, re-encrypts primary keys with tempCryptoKey)
		await localVault.prepareRekeyTxn(tempCryptoKey);

		// 3. Commit Phase (Option 1: commit keyman -> commit localvault)
		await keyManager.commitAdoptMSKTxn(); // delete key manager backup

		await localVault.commitRekeyTxn(); // delete consolidated BAK_LOCALVAULT and transition active key

		// 4. Update coordinator state
		cryptoKey = tempCryptoKey;

		// 5. Reinitialize cloud sync service and tokens context
		await tokensContext.init(localVault);
		await cloudSyncService.init(localVault, createCloudVault);
	} catch (err) {
		console.error('[storage] MSK adoption failed, rolling back coordinated transaction...', err);

		// ROLLBACK PHASE: Ask participants to roll back
		await localVault.rollbackRekeyTxn();
		await keyManager.rollbackAdoptMSKTxn();

		throw err;
	}
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
