import { browser } from '$app/environment';
import { getContext, hasContext, setContext } from 'svelte';

const T_TOKENS = 'T_tokens';

class TokensCtx {
	storage;
	/** @type {import('$lib/types').Token[]} */
	state = $state([]);

	/**
	 * @param {import('$lib/types').EncryptedStorage} storage
	 */
	constructor(storage) {
		if (!browser) {
			throw new Error('TokenService constructor called on server side');
		}
		this.storage = storage;
	}

	async init() {
		this.state = (await this.storage.get(T_TOKENS)) || [
			{
				// TODO: remove this; only for testing
				id: '33',
				secret: 'secretpoop',
				account: 'account',
				issuer: 'Client Test'
			}
		];
		return this.state;
	}

	async #persist() {
		await this.storage.set(T_TOKENS, this.state);
	}

	getTokens() {
		return this.state;
	}

	/**
	 * @param {import('$lib/types').Token} token
	 */
	addToken(token) {
		this.state = [...this.state, token];
		this.#persist();
		return this.getTokens();
	}

	/**
	 * @param {any} id
	 * @param {any} updatedToken
	 */
	updateToken(id, updatedToken) {
		this.state = this.state.map((t) => (t.id === id ? updatedToken : t));
		this.#persist();
		return this.getTokens();
	}

	/**
	 * @param {any} id
	 */
	removeToken(id) {
		this.state = this.state.filter((t) => t.id !== id);
		this.#persist();
		return this.getTokens();
	}
}

/**
 * @param {import("$lib/types").EncryptedStorage} storage
 */
function createTokensContext(storage) {
	const tokensCtx = new TokensCtx(storage);
	setContext(T_TOKENS, tokensCtx);
	tokensCtx.init();
	return tokensCtx;
}

function useTokensContext() {
	if (!hasContext(T_TOKENS)) {
		throw new Error('Tokens context not found. Did you forget to call createTokensContext()?');
	}
	return getContext(T_TOKENS);
}

export { createTokensContext, useTokensContext };
