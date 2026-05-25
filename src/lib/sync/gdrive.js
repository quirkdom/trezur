/* global google */

import { browser } from '$app/environment';
import { env } from '$env/dynamic/public';
import { devconsole } from '$lib/utils';
import { ExpiringMap } from '$lib/utils/cache';

const SCOPES = 'https://www.googleapis.com/auth/drive.appdata';
const GSI_SCRIPT_URL = 'https://accounts.google.com/gsi/client';
const CACHE_TTL = 300_000; // 5 minutes - enough for a sync session but expires between autosyncs

/**
 * @todo Use static imports from `$env/dynamic/static` once we migrate to CF Workers and can define build variables in `wrangler.toml`.
 *
 * CF Pages only support dynamic env vars at build time. See: https://developers.cloudflare.com/pages/configuration/build-configuration/#environment-variables
 *
 * CF Workers possibly support static public env vars at build time, defined in `wrangler.toml`. See: https://developers.cloudflare.com/workers/ci-cd/builds/configuration/#environment-variables -> Wrangler
 */
const GOOGLE_CLIENT_ID = env.PUBLIC_GOOGLE_CLIENT_ID;

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
	isReady = false;
	/** @type {boolean} */
	isSignedIn = false;
	/** @type {string | null} */
	accessToken = null;
	/** @type {string | null} */
	refreshToken = null;
	/** @type {number} */
	tokenExpiry = 0;

	/** @type {google.accounts.oauth2.TokenClient | google.accounts.oauth2.CodeClient | null} */
	tokenClient = null;

	/** @type {Promise<void> | null} */
	#loadingPromise = null;

	/** @type {ExpiringMap<string, string>} */
	#cachedFileIds = new ExpiringMap(CACHE_TTL);

	/**
	 * @param {string} url
	 * @param {RequestInit} options
	 * @param {number} [timeoutMs=10000]
	 */
	async #fetchWithTimeout(url, options, timeoutMs = 10000) {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
		try {
			const res = await fetch(url, { ...options, signal: controller.signal });
			clearTimeout(timeoutId);
			return res;
		} catch (/** @type {any} */ err) {
			clearTimeout(timeoutId);
			if (err.name === 'AbortError') throw new Error('Request timed out', { cause: err });
			throw err;
		}
	}

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
				devconsole.error('[G-Drive] Failed to load GSI script', e);
				reject(e);
			};
			document.head.appendChild(script);
		});

		return this.#loadingPromise;
	}

	#initClient() {
		if (typeof window === 'undefined' || typeof google === 'undefined') return;

		try {
			if (this.flow === 'implicit') {
				this.tokenClient = google.accounts.oauth2.initTokenClient({
					client_id: GOOGLE_CLIENT_ID,
					scope: SCOPES,
					callback: (resp) => this.#handleTokenResponse(resp)
				});
			} else if (this.flow === 'pkce') {
				this.tokenClient = google.accounts.oauth2.initCodeClient({
					client_id: GOOGLE_CLIENT_ID,
					scope: SCOPES,
					ux_mode: 'popup',
					callback: (resp) => this.#handleCodeResponse(resp)
				});
			}
			this.isReady = true;
			devconsole.log(`[G-Drive] GSI Client initialized (${this.flow} flow)`);
		} catch (e) {
			devconsole.error('[G-Drive] Failed to initialize GSI', e);
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
			devconsole.error('[G-Drive] Token error', resp);
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
			'[G-Drive] Token received:',
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
	 * @param {google.accounts.oauth2.CodeResponse} resp
	 */
	async #handleCodeResponse(resp) {
		if (resp.error) {
			devconsole.error('[G-Drive] Code error', resp);
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
				client_id: GOOGLE_CLIENT_ID,
				code: resp.code,
				grant_type: 'authorization_code',
				redirect_uri: window.location.origin // Matches default in initCodeClient
			};
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

			devconsole.log('[G-Drive] Tokens received (PKCE)', tokens);

			if (this.#signInResolver) {
				this.#signInResolver(this.accessToken || '');
				this.#signInResolver = null;
				this.#signInRejecter = null;
			}
		} catch (e) {
			devconsole.error('[G-Drive] Token exchange error', e);
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

		this.#cachedFileIds.clear();

		return new Promise((resolve, reject) => {
			this.#signInResolver = resolve;
			this.#signInRejecter = reject;
			if (this.flow === 'implicit') {
				// Request explicit consent
				/** @type {google.accounts.oauth2.TokenClient} */ (this.tokenClient).requestAccessToken({
					prompt: 'consent'
				});
			} else if (this.flow === 'pkce') {
				// Request code with consent
				/** @type {google.accounts.oauth2.CodeClient} */ (this.tokenClient).requestCode();
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
				/** @type {google.accounts.oauth2.TokenClient} */ (this.tokenClient).requestAccessToken({
					prompt: ''
				});
			} else if (this.flow === 'pkce') {
				// No refresh token, fall back to full sign-in
				/** @type {google.accounts.oauth2.CodeClient} */ (this.tokenClient).requestCode();
			}
		});
	}

	signOut() {
		if (this.accessToken && typeof google !== 'undefined') {
			google.accounts.oauth2.revoke(this.accessToken, () => {
				devconsole.log('[G-Drive] Token revoked');
			});
		}
		this.accessToken = null;
		this.refreshToken = null;
		this.isSignedIn = false;
		this.tokenExpiry = 0;
		this.#cachedFileIds.clear();
	}

	/**
	 * Ensure we have a valid token. If expired, try to refresh silently.
	 */
	async ensureToken() {
		await this.load();

		if (!this.accessToken || Date.now() > this.tokenExpiry) {
			devconsole.log('[G-Drive] Token expired or missing, trying silent refresh...');
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
			client_id: GOOGLE_CLIENT_ID,
			refresh_token: this.refreshToken,
			grant_type: 'refresh_token'
		};
		const resp = await fetch('https://oauth2.googleapis.com/token', {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams(params)
		});

		if (!resp.ok) throw new Error('Refresh failed');

		const tokens = await resp.json();
		this.accessToken = tokens.access_token;
		this.tokenExpiry = Date.now() + tokens.expires_in * 1000 - 60000;

		devconsole.log('[G-Drive] Token refreshed (PKCE)');
		return this.accessToken;
	}

	/**
	 * @param {string} filename
	 * @returns {Promise<DriveFile | null>}
	 */
	async findFile(filename) {
		const cachedId = this.#cachedFileIds.get(filename);
		if (cachedId) {
			return { id: cachedId, name: filename };
		}

		const token = await this.ensureToken();
		const q = `name = '${filename}' and 'appDataFolder' in parents and trashed = false`;
		const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&spaces=appDataFolder&fields=files(id, name)`;

		const res = await this.#fetchWithTimeout(url, {
			headers: { Authorization: `Bearer ${token}` }
		});

		if (!res.ok) throw new Error('Failed to find file');
		const data = await res.json();
		const file = data.files && data.files.length > 0 ? data.files[0] : null;
		if (file) this.#cachedFileIds.set(filename, file.id);
		return file;
	}

	/**
	 * @param {string} filename
	 * @param {string | Blob | Uint8Array} content
	 * @param {Object} [options]
	 * @param {string} [options.mimeType='application/json']
	 * @param {string} [options.etag] - Ignored in Google Drive API v3
	 */
	async upload(filename, content, options = {}) {
		const { mimeType = 'application/json' } = options;
		const file = await this.findFile(filename);
		const token = this.accessToken;

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

		/** @type {Record<string, string>} */
		const headers = { Authorization: `Bearer ${token}` };

		if (file) {
			url = `https://www.googleapis.com/upload/drive/v3/files/${file.id}?uploadType=multipart`;
			method = 'PATCH';
		}

		const res = await this.#fetchWithTimeout(url, {
			method,
			headers,
			body: form
		});

		if (!res.ok) {
			const err = await res.text();
			throw new Error(`Upload failed: ${err}`);
		}

		this.#cachedFileIds.delete(filename);

		return await res.json();
	}

	/**
	 * @param {string} filename
	 * @param {'text' | 'arraybuffer'} responseType
	 * @param {{ range?: string }} [options]
	 * @returns {Promise<{ data: any, etag: string | null }>}
	 */
	async download(filename, responseType = 'text', options = {}) {
		const file = await this.findFile(filename);
		if (!file) throw new Error('File not found');

		const token = this.accessToken;

		/** @type {Record<string, string>} */
		const headers = { Authorization: `Bearer ${token}` };
		if (options.range) {
			headers['Range'] = options.range;
		}

		const url = `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`;
		const res = await this.#fetchWithTimeout(url, { headers });

		if (!res.ok) throw new Error('Download failed');

		let data;

		if (responseType === 'arraybuffer') {
			data = await res.arrayBuffer();
		} else {
			data = await res.text();
		}

		return { data, etag: null };
	}
}

// Default to implicit flow for backward compatibility
export const driveClient = new DriveClient('implicit');

// For testing PKCE, use: new DriveClient('pkce')
