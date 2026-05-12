import { parseCloudFile, assembleCloudFile } from '$lib/sync/fileformat.js';

const VERSION = 1;
const MAGIC = 'TRZR';

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
	 * @param {number} version
	 * @param {string} type
	 * @param {Uint8Array} iv
	 * @returns {{ aadBlock: Uint8Array, tagIV: Uint8Array }}
	 */
	#buildHeaderVerification(version, type, iv) {
		const aadBlock = new Uint8Array(21);
		aadBlock.set(new TextEncoder().encode(MAGIC), 0);
		aadBlock[4] = version;
		aadBlock.set(new TextEncoder().encode(type), 5);
		aadBlock.set(iv, 9);

		// Derive tag IV (flip last byte to avoid nonce reuse with payload encryption)
		const tagIV = iv.slice();
		tagIV[11] ^= 0x01;

		return { aadBlock, tagIV };
	}

	/**
	 * @param {object} payload
	 * @param {string} [type='DATA']
	 * @returns {Promise<Uint8Array>}
	 */
	async pack(payload, type = 'DATA') {
		const jsonStr = JSON.stringify(payload);
		const encoded = new TextEncoder().encode(jsonStr);
		const iv = crypto.getRandomValues(new Uint8Array(12));

		const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, this.#cryptoKey, encoded);

		const { aadBlock, tagIV } = this.#buildHeaderVerification(VERSION, type, iv);

		// Compute auth tag by encrypting empty plaintext with header as AAD
		const tagResult = await crypto.subtle.encrypt(
			{
				name: 'AES-GCM',
				iv: /** @type {any} */ (tagIV),
				additionalData: /** @type {any} */ (aadBlock)
			},
			this.#cryptoKey,
			new Uint8Array(0)
		);

		return assembleCloudFile(VERSION, type, new Uint8Array(ciphertext), iv, new Uint8Array(tagResult));
	}

	/**
	 * @param {Uint8Array} buffer
	 * @returns {Promise<object>}
	 */
	async unpack(buffer) {
		const parsed = parseCloudFile(buffer);

		const { aadBlock, tagIV } = this.#buildHeaderVerification(parsed.version, parsed.type, parsed.payloadIV);

		// Verify auth tag — throws OperationError if key/header mismatch
		await crypto.subtle.decrypt(
			{
				name: 'AES-GCM',
				iv: /** @type {any} */ (tagIV),
				additionalData: /** @type {any} */ (aadBlock)
			},
			this.#cryptoKey,
			/** @type {any} */ (parsed.authTag)
		);

		const decrypted = await crypto.subtle.decrypt(
			{ name: 'AES-GCM', iv: /** @type {any} */ (parsed.payloadIV) },
			this.#cryptoKey,
			/** @type {any} */ (parsed.payloadCiphertext)
		);

		const jsonStr = new TextDecoder().decode(decrypted);
		return JSON.parse(jsonStr);
	}
}
