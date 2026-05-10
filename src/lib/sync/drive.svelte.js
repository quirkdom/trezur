import { browser } from '$app/environment';
import { devconsole } from '$lib/utils';

const SCOPES = 'https://www.googleapis.com/auth/drive.appdata';
const GSI_SCRIPT_URL = 'https://accounts.google.com/gsi/client';

/**
 * @typedef {Object} DriveFile
 * @property {string} id
 * @property {string} name
 * @property {string} [mimeType]
 */

class DriveClient {
	/** @type {'implicit' | 'pkce'} */
	flow;

	/** @type {boolean} */
	isReady = $state(false);
	/** @type {boolean} */
	isSignedIn = $state(false);
	/** @type {string | null} */
	accessToken = $state(null);
	/** @type {string | null} */
	refreshToken = $state(null);
	/** @type {number} */
	tokenExpiry = $state(0);

	/** @type {any} */
	tokenClient = null;

	/** @type {Promise<void> | null} */
	#loadingPromise = null;

	/** @param {'implicit' | 'pkce'} flow */
	constructor(flow = 'implicit') {
		this.flow = flow;
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
			if (this.flow === 'implicit') {
				this.tokenClient = google.accounts.oauth2.initTokenClient({
					client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
					scope: SCOPES,
					callback: (resp) => this.#handleTokenResponse(resp)
				});
			} else if (this.flow === 'pkce') {
				this.tokenClient = google.accounts.oauth2.initCodeClient({
					client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
					scope: SCOPES,
					ux_mode: 'popup',
					callback: (resp) => this.#handleCodeResponse(resp)
				});
			}
			this.isReady = true;
			devconsole.log(`[Drive] GSI Client initialized (${this.flow} flow)`);
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

	/**
	 * @param {any} resp
	 */
	async #handleCodeResponse(resp) {
		if (resp.error) {
			devconsole.error('[Drive] Code error', resp);
			if (this.#signInRejecter) {
				this.#signInRejecter(resp.error);
				this.#signInResolver = null;
				this.#signInRejecter = null;
			}
			return;
		}

		try {
			// Exchange code for tokens
			/** @type {Record<string, string>} */
			const params = {
				client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
				code: resp.code,
				grant_type: 'authorization_code',
				redirect_uri: window.location.origin // Matches default in initCodeClient
			};
			// Include client_secret if configured (for confidential clients)
			if (import.meta.env.VITE_GOOGLE_CLIENT_SECRET) {
				params.client_secret = import.meta.env.VITE_GOOGLE_CLIENT_SECRET;
			}
			const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
				method: 'POST',
				headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
				body: new URLSearchParams(params)
			});

			if (!tokenResp.ok) {
				throw new Error('Token exchange failed');
			}

			const tokens = await tokenResp.json();
			this.accessToken = tokens.access_token;
			this.refreshToken = tokens.refresh_token;
			this.tokenExpiry = Date.now() + tokens.expires_in * 1000 - 60000;
			this.isSignedIn = true;

			devconsole.log('[Drive] Tokens received (PKCE)', tokens);

			if (this.#signInResolver) {
				this.#signInResolver(this.accessToken || '');
				this.#signInResolver = null;
				this.#signInRejecter = null;
			}
		} catch (e) {
			devconsole.error('[Drive] Token exchange error', e);
			if (this.#signInRejecter) {
				this.#signInRejecter(e);
				this.#signInResolver = null;
				this.#signInRejecter = null;
			}
		}
	}

	async signIn() {
		await this.load();
		if (!this.tokenClient) return;

		return new Promise((resolve, reject) => {
			this.#signInResolver = resolve;
			this.#signInRejecter = reject;
			if (this.flow === 'implicit') {
				// Request explicit consent
				this.tokenClient.requestAccessToken({ prompt: 'consent' });
			} else if (this.flow === 'pkce') {
				// Request code with consent
				this.tokenClient.requestCode();
			}
		});
	}

	async signInSilent() {
		await this.load();
		if (!this.tokenClient) return;

		if (this.flow === 'pkce' && this.refreshToken) {
			// Use refresh token for silent refresh
			return this.#refreshToken();
		}

		return new Promise((resolve, reject) => {
			this.#signInResolver = resolve;
			this.#signInRejecter = reject;
			if (this.flow === 'implicit') {
				// Try to refresh silently
				this.tokenClient.requestAccessToken({ prompt: '' });
			} else if (this.flow === 'pkce') {
				// No refresh token, fall back to full sign-in
				this.tokenClient.requestCode();
			}
		});
	}

	signOut() {
		if (this.accessToken && window.google) {
			google.accounts.oauth2.revoke(this.accessToken, () => {
				devconsole.log('[Drive] Token revoked');
			});
		}
		this.accessToken = null;
		this.refreshToken = null;
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
	 * Refresh access token using refresh token (PKCE only).
	 */
	async #refreshToken() {
		if (!this.refreshToken) throw new Error('No refresh token');

		/** @type {Record<string, string>} */
		const params = {
			client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
			refresh_token: this.refreshToken,
			grant_type: 'refresh_token'
		};
		// Include client_secret if configured
		if (import.meta.env.VITE_GOOGLE_CLIENT_SECRET) {
			params.client_secret = import.meta.env.VITE_GOOGLE_CLIENT_SECRET;
		}
		const resp = await fetch('https://oauth2.googleapis.com/token', {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams(params)
		});

		if (!resp.ok) throw new Error('Refresh failed');

		const tokens = await resp.json();
		this.accessToken = tokens.access_token;
		this.tokenExpiry = Date.now() + tokens.expires_in * 1000 - 60000;

		devconsole.log('[Drive] Token refreshed (PKCE)');
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
	 * @param {string | Blob | Uint8Array} content
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
		/** @type {any} */
		const fileContent = content;
		form.append('file', new Blob([fileContent], { type: mimeType }));

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
	 * @param {'text' | 'arraybuffer'} responseType
	 */
	async download(filename, responseType = 'text') {
		const token = await this.ensureToken();
		const file = await this.findFile(filename);
		if (!file) throw new Error('File not found');

		const url = `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`;
		const res = await fetch(url, {
			headers: { Authorization: `Bearer ${token}` }
		});

		if (!res.ok) throw new Error('Download failed');
		if (responseType === 'arraybuffer') {
			return await res.arrayBuffer();
		}
		return await res.text();
	}
}

// Default to implicit flow for backward compatibility
export const driveClient = new DriveClient('implicit');

// For testing PKCE, use: new DriveClient('pkce')
