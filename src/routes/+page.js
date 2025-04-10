/**
 * @typedef {import('$lib/types').Token} Token
 */

/**
 * @type {import('./$types').PageLoad}
 * @returns {Promise<{tokens: Token[]}>}
 */
export async function load() {
	return {
		tokens: []
	};
}
