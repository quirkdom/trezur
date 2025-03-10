/**
 * @typedef {import('$lib/types').Token} Token
 */

/**
 * @type {import('./$types').PageLoad}
 * @returns {Promise<{tokens: Token[]}>}
 */
export async function load() {
	return {
		tokens: [
			// {         // TODO: Remove this. Only for testing
			// 	id: '1',
			// 	issuer: 'Server Test',
			// 	account: 'account1',
			// 	secret: 'secrethaha'
			// }
		]
	};
}
