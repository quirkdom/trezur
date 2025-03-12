/**
 * @typedef {import('$lib/types').Token} Token
 * @typedef {import('$lib/types').EncryptedStorage} EncryptedStorage
 */
import { browser } from '$app/environment';
import { getContext, hasContext, onMount, setContext } from 'svelte';

const ANTI_CTOR_TOKEN = Symbol('AntiConstructorToken');
const T_TOKENS = 'T_tokens';

class TokensCtx {
	storage;
	/** @type {Token[]} */
	#tokens = [];

	/**
	 * @param {EncryptedStorage} storage
	 * @param {symbol} [initToken]
	 * @param {Token[] | null} [tokens]
	 */
	constructor(storage, initToken, tokens) {
		if (initToken !== ANTI_CTOR_TOKEN)
			throw new Error('Cannot construct TokensCtx directly; await TokensCtx.make() instead.');
		if (!browser) throw new Error('TokenCtx can only be used in the browser');

		this.storage = storage;
		if (tokens) this.#tokens.push(...tokens);
	}

	/**
	 * @param {EncryptedStorage} storage
	 * @param {Token[] | null} [initialTokens] initial bunch of tokens to be added to context state. This is independent of any tokens that can be loaded from storage.
	 */
	static async make(storage, initialTokens) {
		const instance = new TokensCtx(storage, ANTI_CTOR_TOKEN, initialTokens);
		await instance.#load();
		return instance;
	}

	/**
	 * @todo TODO: Update merge algorithm with ID checks and other validations
	 */
	async #load() {
		const loadedTokens = (await this.storage.get(T_TOKENS)) || [];

		this.#tokens.push(...loadedTokens);

		console.log('Final tokens after load:', $state.snapshot(this.#tokens));

		await this.#persist();
	}

	async #persist() {
		if (!this.#tokens.length) return;
		await this.storage.set(T_TOKENS, $state.snapshot(this.#tokens));
		localStorage.setItem(T_TOKENS, JSON.stringify($state.snapshot(this.#tokens))); // TODO: remove this; only for debugging
	}

	async #clear() {
		await this.storage.delete(T_TOKENS);
		localStorage.removeItem(T_TOKENS); // TODO: remove this; only for debugging
	}

	getTokens() {
		return this.#tokens;
	}

	/**
	 * @param {Token} token
	 */
	addToken(token) {
		this.#tokens.push(token);
		this.#persist();
	}

	/**
	 * @typedef {import('$lib/types').Tokenable} Tokenable
	 * @param {string} id
	 * @param {Partial<{[key in keyof Tokenable]: Tokenable[key]}>} updates
	 * @todo TODO: check if this can be merged with addToken()
	 */
	updateToken(id, updates) {
		this.#tokens = this.#tokens.map((t) => (t.id === id ? { ...t, ...updates } : t)); // TODO: might be cleaner to change specific token directly.
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
 * @property {function(EncryptedStorage): Promise<TokensCtx>} makeMerge
 */
const tokensContext = $state({
	/** @type {TokensCtx | null} */
	current: null,

	/**
	 * Make a new Tokens context by merging any existing tokens into ones loaded newly from storage
	 * @param {EncryptedStorage} storage
	 */
	async makeMerge(storage) {
		const currentTokens = this.current && $state.snapshot(this.current.getTokens());
		return (this.current = await TokensCtx.make(storage, currentTokens));
	}

	/**
	 * Make a new Tokens context by loading tokens from storage. Any existing tokens are cleared.
	 * @param {EncryptedStorage} storage
	 */
	// async makeNew(storage) {
	// 	this.current?.clearTokens();
	// 	return this.makeMerge(storage);
	// }
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
 * Creates a new Token from a Tokenable object.
 * @param {Tokenable} tokenable
 * @returns {Token}
 */
function tokenize(tokenable) {
	// TODO: Validate generated token object. Also fill in default values.
	return {
		id: crypto.randomUUID(),
		...tokenable
	};
}

export { createTokensContext, useTokensContext, tokenize };
