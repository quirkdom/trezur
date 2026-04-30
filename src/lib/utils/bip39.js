import { entropyToMnemonic, mnemonicToEntropy } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';

/**
 * @param {Uint8Array} msk
 * @returns {string}
 */
export function mskToMnemonic(msk) {
	return entropyToMnemonic(msk, wordlist);
}

/**
 * @param {string} words
 * @returns {Uint8Array}
 */
export function mnemonicToMSK(words) {
	return mnemonicToEntropy(words, wordlist);
}
