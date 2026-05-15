/**
 * @typedef {import('$lib/types').Token} Token
 * @typedef {import('$lib/utils/local-kv-vault').KVStorage} KVStorage
 */
import { browser, dev } from '$app/environment';
import { devconsole } from '$lib/utils';
import { backupService } from '$lib/sync/backup.svelte.js';
import { nanoid } from 'nanoid';
import { SvelteMap, SvelteSet } from 'svelte/reactivity';

const ANTI_CTOR_TOKEN = Symbol('AntiConstructorToken');
const T_TOKENS = 'T_tokens';
const T_TOMBSTONES = 'T_tombstones';

class TokensCtx {
	/** @type {KVStorage} */
	storage;
	/** @type {Token[]} */
	#tokens = $state([]);
	/** @type {Record<string, number>} */
	#tombstones = $state({});

	/**
	 * @param {KVStorage} storage
	 * @param {symbol} [initToken]
	 */
	constructor(storage, initToken) {
		if (initToken !== ANTI_CTOR_TOKEN)
			throw new Error('Cannot construct TokensCtx directly; await TokensCtx.make() instead.');
		if (!browser) throw new Error('TokenCtx can only be used in the browser');

		this.storage = storage;
	}

	/**
	 * @param {KVStorage} storage
	 * @param {Object} [options]
	 * @param {Token[] | null | undefined} [options.extraTokens]
	 */
	static async make(storage, options) {
		const instance = new TokensCtx(storage, ANTI_CTOR_TOKEN);

		await instance.#load(); // first, load any tokens from storage

		if (options?.extraTokens?.length) {
			// Merge and deduplicate
			const tokenMap = new SvelteMap();

			// Add existing tokens
			for (const token of instance.#tokens) {
				const key = `${token.id}:${token.secret}`;
				tokenMap.set(key, token);
			}

			// Merge in extra tokens (will overwrite if duplicate)
			for (const token of options.extraTokens) {
				const key = `${token.id}:${token.secret}`;
				tokenMap.set(key, token);
			}

			instance.#tokens = [...tokenMap.values()];
			await instance.#persist(); // Ensure changes are persisted
		}

		return instance;
	}

	/**
	 * @todo TODO: Update merge algorithm with ID checks and other validations
	 */
	async #load() {
		const loadedTokens = (await this.storage.get(T_TOKENS)) || [];
		const loadedTombstones = (await this.storage.get(T_TOMBSTONES)) || {};
		this.#tombstones = loadedTombstones;

		// Deduplication logic: Handles edge cases where local storage might have duplicate
		// tokens. We use LWW merge to pick the freshest one if duplicates are found.
		const tokenMap = new SvelteMap();

		for (const token of loadedTokens) {
			const id = token.id;
			if (tokenMap.has(id)) {
				const existing = tokenMap.get(id);
				const merged = mergeTokens(existing, token);
				tokenMap.set(id, merged);
			} else {
				tokenMap.set(id, token);
			}
		}

		// Replace #tokens with the deduplicated result
		this.#tokens = [...tokenMap.values()];

		// Persist after loading to ensure the state is clean,
		// especially if deduplication changed anything or if storage was empty.
		await this.#persist();
	}

	async #persist() {
		if (this.#tokens.length === 0 && Object.keys(this.#tombstones).length === 0) return this.#purge();

		await this.storage.set(T_TOKENS, $state.snapshot(this.#tokens));
		await this.storage.set(T_TOMBSTONES, $state.snapshot(this.#tombstones));

		if (dev) {
			// TODO: remove this; only for debugging
			localStorage.setItem(T_TOKENS, JSON.stringify($state.snapshot(this.#tokens)));
			localStorage.setItem(T_TOMBSTONES, JSON.stringify($state.snapshot(this.#tombstones)));
		}
	}

	async #purge() {
		await this.storage.delete(T_TOKENS);
		await this.storage.delete(T_TOMBSTONES);

		if (dev) {
			// TODO: remove this; only for debugging
			localStorage.removeItem(T_TOKENS);
			localStorage.removeItem(T_TOMBSTONES);
		}
	}

	getTokens() {
		return this.#tokens;
	}

	getTombstones() {
		return this.#tombstones;
	}

	/**
	 * @param {Record<string, number>} newTombstones
	 */
	mergeTombstones(newTombstones) {
		for (const [id, ts] of Object.entries(newTombstones)) {
			if (!this.#tombstones[id] || this.#tombstones[id] < ts) {
				this.#tombstones[id] = ts;
			}
		}
		return this.#persist();
	}

	/**
	 * @param {Token[]} tokensToAdd
	 */
	addTokens(...tokensToAdd) {
		const now = Date.now();
		// Create a set of keys for existing tokens for efficient lookup
		const existingTokenKeys = new SvelteSet();
		for (const token of this.#tokens) {
			existingTokenKeys.add(`${token.id}:${token.secret}`);
		}

		const newTokens = [];
		for (const token of tokensToAdd) {
			const key = `${token.id}:${token.secret}`;
			if (!existingTokenKeys.has(key)) {
				// On Import: Assign Date.now() to all updatedAt keys immediately.
				const tokenWithTimestamps = {
					...token,
					updatedAt: {
						account: now,
						issuer: now,
						secret: now,
						params: now
					}
				};
				newTokens.push(tokenWithTimestamps);
				// Add the new key to the set as well to handle duplicates within tokensToAdd itself
				existingTokenKeys.add(key);
			}
		}

		if (newTokens.length > 0) {
			this.#tokens.push(...newTokens);
			backupService.scheduleSyncOnUserAction();
			return this.#persist();
		}
	}

	/**
	 * @typedef {import('$lib/types').Tokenable} Tokenable
	 * @param {string} id The ID of the token to update.
	 * @param {Partial<{[key in keyof Tokenable]: Tokenable[key]}>} updates The updates to apply.
	 */
	updateToken(id, updates) {
		const tokenIndex = this.#tokens.findIndex((t) => t.id === id);
		if (tokenIndex === -1) {
			devconsole.warn(`Token with id ${id} not found for update.`);
			return; // Token not found
		}

		const originalToken = this.#tokens[tokenIndex];
		const updatedToken = { ...originalToken, ...updates };
		const now = Date.now();

		updatedToken.updatedAt = updatedToken.updatedAt ? { ...updatedToken.updatedAt } : {};

		if (updates.account !== undefined) updatedToken.updatedAt.account = now;
		if (updates.issuer !== undefined) updatedToken.updatedAt.issuer = now;
		if (updates.secret !== undefined) updatedToken.updatedAt.secret = now;
		if (
			updates.period !== undefined ||
			updates.digits !== undefined ||
			updates.algorithm !== undefined ||
			updates.type !== undefined ||
			updates.counter !== undefined
		) {
			updatedToken.updatedAt.params = now;
		}

		// Apply the update.
		this.#tokens[tokenIndex] = updatedToken;
		backupService.scheduleSyncOnUserAction();
		return this.#persist();
	}

	/**
	 * @param {string} id
	 * @returns {Promise<void>}
	 */
	removeToken(id) {
		const now = Date.now();
		this.#tokens = this.#tokens.filter((t) => t.id !== id);
		this.#tombstones[id] = now;
		backupService.scheduleSyncOnUserAction();
		return this.#persist();
	}

	/**
	 * Clears token state (in-memory, and optionally purges from persistent storage).
	 *
	 * @param {boolean} shouldPurge If true, purge from persistent storage as well
	 * @returns {void | Promise<void>}
	 */
	clearTokens(shouldPurge = false) {
		this.#tokens = [];
		this.#tombstones = {};

		if (shouldPurge) return this.#purge();
	}

	/**
	 * Atomically replaces the current tokens and tombstones
	 * @param {Token[]} tokens
	 * @param {Record<string, number>} tombstones
	 * @param {{ skipSyncNotify?: boolean }} [options]
	 */
	async setTokensAndTombstones(tokens, tombstones, options) {
		this.#tokens = tokens;
		this.#tombstones = tombstones;
		if (!options?.skipSyncNotify) {
			backupService.scheduleSyncOnUserAction();
		}
		return this.#persist();
	}
}

/**
 * Reactive singleton class for managing the current token context instance.
 * Provides methods to initialize and reset the context.
 */
class TokensContext {
	/** @type {TokensCtx | null} */
	#current = $state(null);

	get current() {
		return this.#current;
	}

	/**
	 * (Intelligently) Make a new Tokens context.
	 * - Scenario 1: Create a new Tokens context instance, loading existing tokens from provided storage.
	 * - Scenario 2: Storage is changing. Merge any existing in-memory tokens into new storage.
	 * @param {KVStorage} storage
	 */
	async iMake(storage) {
		// artificial delay to simulate loading (for testing)
		// await new Promise((resolve) => setTimeout(resolve, 1500));

		if (this.#current) {
			const existingTokens = $state.snapshot(this.#current.getTokens());
			this.#current = await TokensCtx.make(storage, { extraTokens: existingTokens });
		} else this.#current = await TokensCtx.make(storage);
	}

	/**
	 * Evict in-memory token state only, leaving persistent storage intact.
	 *
	 * **CAUTION:** This leaves the app without a valid tokens context; subsequent token operations will fail
	 * until re-initialized via `iMake`.
	 */
	resetTokens() {
		this.#current?.clearTokens(false);
		this.#current = null;

		devconsole.warn(
			'App without valid Tokens context; subsequent token operations will fail. Call iMake() to re-initialize.'
		);
	}

	/**
	 * Wipe tokens from both memory and persisted storage.
	 *
	 * **CAUTION:** You must always invalidate app state and reload the app after calling this.
	 * This leaves the app without a valid tokens context; subsequent token operations will fail.
	 */
	async purgeTokens() {
		await this.#current?.clearTokens(true);
		this.#current = null;

		devconsole.warn(
			'App without valid Tokens context; subsequent token operations will fail. Remember to invalidate app state and reload the app.'
		);
	}
}

/**
 * Reactive singleton instance of TokensContext.
 */
export let tokensContext = new TokensContext();

/**
 * Creates a new Token from a Tokenable.
 * @param {Tokenable} tokenable
 * @returns {Token}
 */
export function tokenize(tokenable) {
	return {
		id: nanoid(10),
		digits: 6,
		period: 30,
		issuer: '',
		counter: 0,
		algorithm: 'SHA1',
		...tokenable
	};
}

/**
 * Returns the maximum timestamp from a token's updatedAt object.
 * @param {Token} token
 * @returns {number}
 */
export function getMaxTimestamp(token) {
	if (!token.updatedAt) return 0;
	return Math.max(
		token.updatedAt.account || 0,
		token.updatedAt.issuer || 0,
		token.updatedAt.secret || 0,
		token.updatedAt.params || 0
	);
}

/**
 * Merges two tokens using LWW-per-field logic.
 * Incoming (tokenB) wins on tie-break.
 * @param {Token} tokenA
 * @param {Token} tokenB
 * @returns {Token}
 */
export function mergeTokens(tokenA, tokenB) {
	/** @type {(t: Token, key: 'account' | 'issuer' | 'secret' | 'params') => number} */
	const getTs = (t, key) => t.updatedAt?.[key] ?? 0;

	const merged = { ...tokenA };
	const mergedUp = {
		account: getTs(tokenA, 'account'),
		issuer: getTs(tokenA, 'issuer'),
		secret: getTs(tokenA, 'secret'),
		params: getTs(tokenA, 'params')
	};

	const upB = tokenB.updatedAt || {};

	if ((upB.account || 0) >= mergedUp.account) {
		merged.account = tokenB.account;
		mergedUp.account = upB.account || 0;
	}
	if ((upB.issuer || 0) >= mergedUp.issuer) {
		merged.issuer = tokenB.issuer;
		mergedUp.issuer = upB.issuer || 0;
	}
	if ((upB.secret || 0) >= mergedUp.secret) {
		merged.secret = tokenB.secret;
		mergedUp.secret = upB.secret || 0;
	}
	if ((upB.params || 0) >= mergedUp.params) {
		merged.digits = tokenB.digits;
		merged.period = tokenB.period;
		merged.algorithm = tokenB.algorithm;
		merged.type = tokenB.type;
		merged.counter = tokenB.counter;
		mergedUp.params = upB.params || 0;
	}

	merged.updatedAt = mergedUp;
	return merged;
}
