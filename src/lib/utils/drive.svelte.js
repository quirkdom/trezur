import { browser } from '$app/environment';
import { devconsole } from '$lib/utils';

const SCOPES = 'https://www.googleapis.com/auth/drive.appdata';
const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest';
const GSI_SCRIPT_URL = 'https://accounts.google.com/gsi/client';

/**
 * @typedef {Object} DriveFile
 * @property {string} id
 * @property {string} name
 * @property {string} [mimeType]
 */

class DriveClient {
	/** @type {boolean} */
	isReady = $state(false);
	/** @type {boolean} */
	isSignedIn = $state(false);
	/** @type {string | null} */
	accessToken = $state(null);
	/** @type {number} */
	tokenExpiry = $state(0);

	/** @type {any} */
	tokenClient = null;

	/** @type {Promise<void> | null} */
	#loadingPromise = null;

	constructor() {
		// Lazy load, don't init in constructor
	}

	async load() {
		if (!browser) return;
		if (this.isReady) return;
		if (this.#loadingPromise) return this.#loadingPromise;

		this.#loadingPromise = new Promise((resolve, reject) => {
			if (document.querySelector(`script[src="${GSI_SCRIPT_URL}"]`)) {
				this.#initClient();
				resolve();
				return;
			}

			const script = document.createElement('script');
			script.src = GSI_SCRIPT_URL;
			script.async = true;
			script.defer = true;
			script.onload = () => {
				this.#initClient();
				resolve();
			};
			script.onerror = (e) => {
				devconsole.error('[Drive] Failed to load GSI script', e);
				reject(e);
			};
			document.head.appendChild(script);
		});

		return this.#loadingPromise;
	}

	#initClient() {
		if (typeof window === 'undefined' || !window.google) return;

		try {
			// @ts-ignore
			this.tokenClient = google.accounts.oauth2.initTokenClient({
				client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
				scope: SCOPES,
				callback: (resp) => this.#handleTokenResponse(resp)
			});
			this.isReady = true;
			devconsole.log('[Drive] GSI Client initialized');
		} catch (e) {
			devconsole.error('[Drive] Failed to initialize GSI', e);
		}
	}

	/** @type {((token: string) => void) | null} */
	#signInResolver = null;
	/** @type {((reason: any) => void) | null} */
	#signInRejecter = null;

	/**
	 * @param {any} resp
	 */
	#handleTokenResponse(resp) {
		if (resp.error) {
			devconsole.error('[Drive] Token error', resp);
			if (this.#signInRejecter) {
				this.#signInRejecter(resp.error);
				this.#signInResolver = null;
				this.#signInRejecter = null;
			}
			return;
		}
		this.accessToken = resp.access_token;
		// expires_in is in seconds. Set expiry to now + expires_in - 60s (buffer)
		this.tokenExpiry = Date.now() + resp.expires_in * 1000 - 60000;
		this.isSignedIn = true;

		devconsole.log(
			'[Drive] Token received:',
			this.accessToken,
			'expires at: ',
			new Date(this.tokenExpiry).toLocaleString()
		);

		if (this.#signInResolver) {
			this.#signInResolver(this.accessToken || '');
			this.#signInResolver = null;
			this.#signInRejecter = null;
		}
	}

	async signIn() {
		await this.load();
		if (!this.tokenClient) return;

		return new Promise((resolve, reject) => {
			this.#signInResolver = resolve;
			this.#signInRejecter = reject;
			// Request explicit consent
			this.tokenClient.requestAccessToken({ prompt: 'consent' });
		});
	}

	async signInSilent() {
		await this.load();
		if (!this.tokenClient) return;

		return new Promise((resolve, reject) => {
			this.#signInResolver = resolve;
			this.#signInRejecter = reject;
			// Try to refresh silently
			this.tokenClient.requestAccessToken({ prompt: '' });
		});
	}

	signOut() {
		// @ts-ignore
		if (this.accessToken && window.google) {
			// @ts-ignore
			google.accounts.oauth2.revoke(this.accessToken, () => {
				devconsole.log('[Drive] Token revoked');
			});
		}
		this.accessToken = null;
		this.isSignedIn = false;
		this.tokenExpiry = 0;
	}

	/**
	 * Ensure we have a valid token. If expired, try to refresh silently.
	 */
	async ensureToken() {
		await this.load();

		if (!this.accessToken || Date.now() > this.tokenExpiry) {
			devconsole.log('[Drive] Token expired or missing, trying silent refresh...');
			try {
				const token = await this.signInSilent();
				return token;
			} catch {
				throw new Error('Failed to refresh token silently');
			}
		}
		return this.accessToken;
	}

	/**
	 * @param {string} filename
	 * @returns {Promise<DriveFile | null>}
	 */
	async findFile(filename) {
		const token = await this.ensureToken();
		const q = `name = '${filename}' and 'appDataFolder' in parents and trashed = false`;
		const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&spaces=appDataFolder&fields=files(id, name)`;

		const res = await fetch(url, {
			headers: { Authorization: `Bearer ${token}` }
		});

		if (!res.ok) throw new Error('Failed to find file');
		const data = await res.json();
		return data.files && data.files.length > 0 ? data.files[0] : null;
	}

	/**
	 * @param {string} filename
	 * @param {string} content
	 * @param {string} [mimeType='application/json']
	 */
	async upload(filename, content, mimeType = 'application/json') {
		const token = await this.ensureToken();
		const file = await this.findFile(filename);

		const metadata = {
			name: filename,
			mimeType: mimeType,
			parents: file ? undefined : ['appDataFolder']
		};

		const form = new FormData();
		form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
		form.append('file', new Blob([content], { type: mimeType }));

		let url = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
		let method = 'POST';

		if (file) {
			url = `https://www.googleapis.com/upload/drive/v3/files/${file.id}?uploadType=multipart`;
			method = 'PATCH';
		}

		const res = await fetch(url, {
			method,
			headers: { Authorization: `Bearer ${token}` },
			body: form
		});

		if (!res.ok) {
			const err = await res.text();
			throw new Error(`Upload failed: ${err}`);
		}

		return await res.json();
	}

	/**
	 * @param {string} filename
	 */
	async download(filename) {
		const token = await this.ensureToken();
		const file = await this.findFile(filename);
		if (!file) throw new Error('File not found');

		const url = `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`;
		const res = await fetch(url, {
			headers: { Authorization: `Bearer ${token}` }
		});

		if (!res.ok) throw new Error('Download failed');
		return await res.text();
	}
}

export const driveClient = new DriveClient();
