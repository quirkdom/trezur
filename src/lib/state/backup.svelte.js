import { devconsole } from '$lib/utils';
import { driveClient } from '$lib/utils/drive.svelte.js';
import { tokensContext } from '$lib/state/tokens.svelte.js';
import { encryptedLocalStorage } from '$lib/state/storage.svelte.js';
import { sessionPasscode } from '$lib/state/passcode.svelte.js';

const T_BACKUP_ENABLED = 'T_backup_enabled';
const T_LAST_ERROR = 'T_last_error';
const BACKUP_FILENAME = 'trezur_backup.enc';
const SYNC_INTERVAL = 60 * 60 * 1000; // 1 hour

class BackupService {
	/** @type {boolean} */
	isSyncing = $state(false);
	/** @type {number} */
	lastSync = $state(0);
	/** @type {string | null} */
	lastError = $state(null);
	/** @type {boolean} */
	autoSyncEnabled = $state(false);
	/** @type {any} */
	settingsContext = null;

	constructor() {
		// Constructor
	}

	/**
	 * @param {any} settingsContext
	 */
	init(settingsContext) {
		this.settingsContext = settingsContext;
	}

	/**
	 * Call this after the app is unlocked and EncryptedStorage is ready.
	 */
	async loadFromStorage() {
		if (!encryptedLocalStorage.current) return;

		const enabled = await encryptedLocalStorage.current.get(T_BACKUP_ENABLED);
		if (enabled) {
			this.autoSyncEnabled = true;
			this.startAutoSync();
		}

		// Load last error
		const lastError = await encryptedLocalStorage.current.get(T_LAST_ERROR);
		if (lastError) {
			this.lastError = lastError;
		}

		// Also load last sync time from settings
		if (this.settingsContext) {
			const settings = this.settingsContext.getSettings();
			if (settings.lastSyncTime) {
				this.lastSync = settings.lastSyncTime;
			}
		}
	}

	async enable() {
		if (!encryptedLocalStorage.current) throw new Error('Storage not ready');
		if (!sessionPasscode.passcode) throw new Error('App passcode not set');

		await encryptedLocalStorage.current.set(T_BACKUP_ENABLED, true);
		this.autoSyncEnabled = true;
		this.startAutoSync();

		// Trigger initial sync
		await this.sync();
	}

	async disable() {
		if (!encryptedLocalStorage.current) return;

		await encryptedLocalStorage.current.delete(T_BACKUP_ENABLED);
		this.autoSyncEnabled = false;
		this.stopAutoSync();
	}

	/**
	 * @param {string} data
	 * @param {string} passcode
	 */
	async #encrypt(data, passcode) {
		const salt = crypto.getRandomValues(new Uint8Array(16));
		const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(passcode), 'PBKDF2', false, [
			'deriveKey'
		]);
		const key = await crypto.subtle.deriveKey(
			{ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
			keyMaterial,
			{ name: 'AES-GCM', length: 256 },
			false,
			['encrypt']
		);

		const iv = crypto.getRandomValues(new Uint8Array(12));
		const encoded = new TextEncoder().encode(data);
		const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);

		return JSON.stringify({
			salt: Array.from(salt),
			iv: Array.from(iv),
			data: Array.from(new Uint8Array(encrypted))
		});
	}

	/**
	 * @param {string} encryptedJson
	 * @param {string} passcode
	 */
	async #decrypt(encryptedJson, passcode) {
		const { salt, iv, data } = JSON.parse(encryptedJson);

		const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(passcode), 'PBKDF2', false, [
			'deriveKey'
		]);
		const key = await crypto.subtle.deriveKey(
			{ name: 'PBKDF2', salt: new Uint8Array(salt), iterations: 100000, hash: 'SHA-256' },
			keyMaterial,
			{ name: 'AES-GCM', length: 256 },
			false,
			['decrypt']
		);

		const decrypted = await crypto.subtle.decrypt(
			{ name: 'AES-GCM', iv: new Uint8Array(iv) },
			key,
			new Uint8Array(data)
		);

		return new TextDecoder().decode(decrypted);
	}

	async sync() {
		if (this.isSyncing) return;
		if (!tokensContext.current) return;

		// We need the passcode to encrypt.
		// If app is locked (no session passcode), we can't sync.
		// This satisfies "webapp is not open ... -> don't run any syncs" (implicit, as app would be locked or unloaded)
		// And "webapp is open (possibly in background)" -> sessionPasscode should be present if unlocked.
		if (!sessionPasscode.passcode) {
			devconsole.warn('[Backup] Cannot sync: App is locked (no session passcode)');
			return;
		}

		this.isSyncing = true;
		devconsole.log('[Backup] Starting sync...');

		try {
			// 1. Get tokens
			const tokens = tokensContext.current.getTokens();
			const json = JSON.stringify(tokens);

			// 2. Encrypt using session passcode
			const encrypted = await this.#encrypt(json, sessionPasscode.passcode);

			// 3. Upload
			await driveClient.upload(BACKUP_FILENAME, encrypted);

			this.lastSync = Date.now();
			if (this.settingsContext) {
				this.settingsContext.updateSetting('lastSyncTime', this.lastSync);
			}
			this.lastError = null;
			await encryptedLocalStorage.current?.delete(T_LAST_ERROR);
			devconsole.log('[Backup] Sync completed');
		} catch (e) {
			this.lastError = e instanceof Error ? e.message : String(e);
			await encryptedLocalStorage.current?.set(T_LAST_ERROR, this.lastError);
			devconsole.error('[Backup] Sync failed', e);
		} finally {
			this.isSyncing = false;
		}
	}

	/**
	 * @param {string} passcode
	 */
	async restore(passcode) {
		if (!passcode) throw new Error('No passcode provided for restore');

		this.isSyncing = true;
		try {
			// 1. Download
			const content = await driveClient.download(BACKUP_FILENAME);

			// 2. Decrypt
			const json = await this.#decrypt(content, passcode);
			const tokens = JSON.parse(json);

			// 3. Merge
			if (tokensContext.current) {
				await tokensContext.current.addTokens(...tokens);
			}

			devconsole.log('[Backup] Restore completed');
		} catch (e) {
			devconsole.error('[Backup] Restore failed', e);
			throw e;
		} finally {
			this.isSyncing = false;
		}
	}

	/**
	 * @param {string} passcode
	 * @returns {Promise<boolean>}
	 */
	async verifyBackupPasscode(passcode) {
		try {
			const content = await driveClient.download(BACKUP_FILENAME);
			await this.#decrypt(content, passcode);
			return true;
		} catch (e) {
			devconsole.warn('[Backup] Passcode verification failed', e);
			return false;
		}
	}

	/** @type {any} */
	#intervalId;

	startAutoSync() {
		if (this.#intervalId) clearInterval(this.#intervalId);

		const check = () => {
			if (!this.autoSyncEnabled) return;
			const now = Date.now();
			if (now - this.lastSync > SYNC_INTERVAL) {
				this.sync();
			}
		};

		this.#intervalId = setInterval(check, 60000); // Check every minute

		// Also check on visibility change (e.g. app opened after long time)
		document.addEventListener('visibilitychange', () => {
			if (!document.hidden) check();
		});

		// Run check immediately
		check();
	}

	stopAutoSync() {
		if (this.#intervalId) clearInterval(this.#intervalId);
	}
}

export const backupService = new BackupService();
