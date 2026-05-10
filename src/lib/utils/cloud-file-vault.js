import { parseCloudFile } from '$lib/sync/fileformat.js';

export class CloudFileVault {
	/** @type {CryptoKey} */
	#cryptoKey;

	/**
	 * @param {CryptoKey} cryptoKey
	 */
	constructor(cryptoKey) {
		this.#cryptoKey = cryptoKey;
	}

	/**
	 * @param {object} payload
	 * @returns {Promise<Uint8Array>}
	 */
	async pack(payload) {
		const jsonStr = JSON.stringify(payload);
		const encoded = new TextEncoder().encode(jsonStr);
		const iv = crypto.getRandomValues(new Uint8Array(12));

		const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, this.#cryptoKey, encoded);

		// The original assembleCloudFile requires the MSK, but we only have a CryptoKey now.
		// Wait, I should not use assembleCloudFile from fileformat.js if it expects raw MSK?
		// Let's implement it here directly. Fileformat was TRZR (magic) + version + IV + ciphertext.
		// version = 5
		const version = 5;
		const magic = new TextEncoder().encode('TRZR');
		const buffer = new Uint8Array(magic.length + 1 + iv.length + ciphertext.byteLength);
		buffer.set(magic, 0);
		buffer.set([version], magic.length);
		buffer.set(iv, magic.length + 1);
		buffer.set(new Uint8Array(ciphertext), magic.length + 1 + iv.length);

		return buffer;
	}

	/**
	 * @param {Uint8Array} buffer
	 * @returns {Promise<object>}
	 */
	async unpack(buffer) {
		// Use parseCloudFile to extract parts (since it's stateless)
		const parsed = parseCloudFile(buffer);

		/** @type {any} */
		const ciphertext = parsed.payloadCiphertext;
		const decrypted = await crypto.subtle.decrypt(
			{ name: 'AES-GCM', iv: /** @type {any} */ (parsed.payloadIV) },
			this.#cryptoKey,
			ciphertext
		);

		const jsonStr = new TextDecoder().decode(decrypted);
		return JSON.parse(jsonStr);
	}
}
