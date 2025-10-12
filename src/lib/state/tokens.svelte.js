/**
 * @typedef {import('$lib/types').Token} Token
 * @typedef {import('$lib/types').EncryptedStorage} EncryptedStorage
 */
import { browser, dev } from '$app/environment';
import { nanoid } from 'nanoid';
import { getContext, hasContext, setContext } from 'svelte';

const ANTI_CTOR_TOKEN = Symbol('AntiConstructorToken');
const T_TOKENS = 'T_tokens';

class TokensCtx {
	storage;
	/** @type {Token[]} */
	#tokens = $state([]);

	/**
	 * @param {EncryptedStorage} storage
	 * @param {symbol} [initToken]
	 */
	constructor(storage, initToken) {
		if (initToken !== ANTI_CTOR_TOKEN)
			throw new Error('Cannot construct TokensCtx directly; await TokensCtx.make() instead.');
		if (!browser) throw new Error('TokenCtx can only be used in the browser');

		this.storage = storage;
	}

	/**
	 * @param {EncryptedStorage} storage
	 * @param {Object} [options]
	 * @param {Token[] | null | undefined} [options.extraTokens]
	 */
	static async make(storage, options) {
		const instance = new TokensCtx(storage, ANTI_CTOR_TOKEN);

		await instance.#load(); // first, load any tokens from storage

		if (options?.extraTokens) {
			instance.#tokens.push(...options.extraTokens); // merge in any extra tokens given
			await instance.#persist(); // Ensure changes are persisted
		}

		return instance;
	}

	/**
	 * @todo TODO: Update merge algorithm with ID checks and other validations
	 */
	async #load() {
		const loadedTokens = (await this.storage.get(T_TOKENS)) || [];

		// Use a map to track tokens by their canonical identifier for deduplication
		const tokenMap = new Map();

		for (const token of loadedTokens) {
			const key = `${token.id}:${token.secret}`;
			tokenMap.set(key, token);
		}

		// Replace #tokens with the deduplicated result
		this.#tokens = [...tokenMap.values()];

		// Persist after loading to ensure the state is clean,
		// especially if deduplication changed anything or if storage was empty.
		await this.#persist();
	}

	async #persist() {
		if (!this.#tokens.length) return this.#clear();

		await this.storage.set(T_TOKENS, $state.snapshot(this.#tokens));

		if (dev) localStorage.setItem(T_TOKENS, JSON.stringify($state.snapshot(this.#tokens))); // TODO: remove this; only for debugging
	}

	async #clear() {
		await this.storage.delete(T_TOKENS);

		if (dev) localStorage.removeItem(T_TOKENS); // TODO: remove this; only for debugging
	}

	getTokens() {
		return this.#tokens;
	}

	/**
	 * @param {Token[]} tokensToAdd
	 */
	addTokens(...tokensToAdd) {
		// Create a set of keys for existing tokens for efficient lookup
		const existingTokenKeys = new Set();
		for (const token of this.#tokens) {
			existingTokenKeys.add(`${token.id}:${token.secret}`);
		}

		const newTokens = [];
		for (const token of tokensToAdd) {
			const key = `${token.id}:${token.secret}`;
			if (!existingTokenKeys.has(key)) {
				newTokens.push(token);
				// Add the new key to the set as well to handle duplicates within tokensToAdd itself
				existingTokenKeys.add(key);
			}
		}

		if (newTokens.length > 0) {
			this.#tokens.push(...newTokens);
			this.#persist();
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
			if (dev) console.warn(`Token with id ${id} not found for update.`);
			return; // Token not found
		}

		const originalToken = this.#tokens[tokenIndex];
		const updatedToken = { ...originalToken, ...updates };

		// Apply the update.
		this.#tokens[tokenIndex] = updatedToken;
		this.#persist();
	}

	/**
	 * @param {string} id
	 */
	removeToken(id) {
		this.#tokens = this.#tokens.filter((t) => t.id !== id);
		this.#persist();
	}

	clearTokens() {
		this.#tokens = [];
		this.#clear();
	}
}

/**
 * Reactive container to hold a token context instance; can be updated when underlying storage engine changes.
 * @typedef {Object} TokensContextContainer
 * @property {TokensCtx | null} current
 * @property {function(EncryptedStorage): Promise<TokensCtx>} iMake
 * @property {function(): void} resetTokens
 */
const tokensContext = $state({
	/** @type {TokensCtx | null} */
	current: null,

	/**
	 * (Intelligently) Make a new Tokens context.
	 * - Scenario 1: Create a new Tokens context instance, loading existing tokens from provided storage.
	 * - Scenario 2: Storage is changing. Merge any existing in-memory tokens into new storage.
	 * @param {EncryptedStorage} storage
	 */
	async iMake(storage) {
		if (this.current) {
			const existingTokens = $state.snapshot(this.current.getTokens());
			this.current = await TokensCtx.make(storage, { extraTokens: existingTokens });
		} else this.current = await TokensCtx.make(storage);

		return this.current;
	},

	/**
	 * Reset Tokens context by wiping out all tokens (both in memory and storage) and clearing the current context instance.
	 *
	 * **CAUTION:** You must always invalidate app state and reload the app after calling this.
	 * This leaves the app without a valid tokens context; subsequent token operations will fail.
	 */
	resetTokens() {
		if (dev)
			console.warn(
				'App without valid Tokens context; subsequent token operations will fail. Remember to invalidate app state and reload the app.'
			);

		this.current?.clearTokens();
		this.current = null;
	}
});

/**
 *
 * @returns {TokensContextContainer}
 */
function createTokensContext() {
	// Store the ref in context, not the instance directly
	setContext(T_TOKENS, tokensContext);

	// Return the ref and the updater function
	return tokensContext;
}

/**
 * @returns {TokensContextContainer}
 */
function useTokensContext() {
	if (!hasContext(T_TOKENS)) {
		throw new Error('Tokens context not found. Did you forget to call createTokensContext()?');
	}

	return getContext(T_TOKENS);
}

/**
 * Creates a new Token from a Tokenable.
 * @param {Tokenable} tokenable
 * @returns {Token}
 */
function tokenize(tokenable) {
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

export { createTokensContext, useTokensContext, tokenize };
