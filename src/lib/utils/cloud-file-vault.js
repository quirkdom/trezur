import { parseCloudFile, assembleCloudFile } from '$lib/sync/fileformat';

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
	 * @param {Uint8Array} aadBlock
	 * @param {Uint8Array} tagIV
	 * @param {Uint8Array} authTag
	 * @returns {Promise<boolean>}
	 */
	async #verifyAuthTag(aadBlock, tagIV, authTag) {
		try {
			await crypto.subtle.decrypt(
				{
					name: 'AES-GCM',
					iv: /** @type {BufferSource} */ (tagIV),
					additionalData: /** @type {BufferSource} */ (aadBlock)
				},
				this.#cryptoKey,
				/** @type {BufferSource} */ (authTag)
			);
			return true;
		} catch {
			return false;
		}
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
		const tagResult = await crypto.subtle.encrypt(
			{
				name: 'AES-GCM',
				iv: /** @type {BufferSource} */ (tagIV),
				additionalData: /** @type {BufferSource} */ (aadBlock)
			},
			this.#cryptoKey,
			new Uint8Array(0)
		);

		return assembleCloudFile(VERSION, type, new Uint8Array(ciphertext), iv, new Uint8Array(tagResult));
	}

	/**
	 * @param {Uint8Array} buffer
	 * @returns {Promise<boolean>}
	 */
	async verifyHeader(buffer) {
		const parsed = parseCloudFile(buffer);
		const { aadBlock, tagIV } = this.#buildHeaderVerification(parsed.version, parsed.type, parsed.payloadIV);
		return this.#verifyAuthTag(aadBlock, tagIV, parsed.authTag);
	}

	/**
	 * @param {Uint8Array} buffer
	 * @returns {Promise<object>}
	 */
	async unpack(buffer) {
		const parsed = parseCloudFile(buffer);
		const { aadBlock, tagIV } = this.#buildHeaderVerification(parsed.version, parsed.type, parsed.payloadIV);
		if (!(await this.#verifyAuthTag(aadBlock, tagIV, parsed.authTag))) {
			throw new Error('Auth tag verification failed');
		}

		const decrypted = await crypto.subtle.decrypt(
			{ name: 'AES-GCM', iv: /** @type {BufferSource} */ (parsed.payloadIV) },
			this.#cryptoKey,
			/** @type {BufferSource} */ (parsed.payloadCiphertext)
		);

		const jsonStr = new TextDecoder().decode(decrypted);
		return JSON.parse(jsonStr);
	}
}
