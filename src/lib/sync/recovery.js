import { adoptMSK } from '$lib/state/storage.svelte';
import { cloudSyncService } from '$lib/sync/cloud-sync.svelte';
import { driveClient } from '$lib/sync/gdrive';
import { BACKUP_FILENAME } from '$lib/sync/sync-engine';
import { devconsole } from '$lib/utils';
import { mnemonicToMSK } from '$lib/utils/bip39';
import { CloudFileVault } from '$lib/utils/cloud-file-vault';
import { importPayloadKey } from '$lib/utils/crypto-keys';

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

		return await vault.verifyHeader(new Uint8Array(arrayBuffer));
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
	await adoptMSK(newMsk);
	await cloudSyncService.enable();
}
