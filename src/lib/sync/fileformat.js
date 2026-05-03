const VERSION = 1;
const MAGIC = 'TRZR';
const HEADER_SIZE = 64;

/**
 * Generates the SHA-256 hash of the MSK.
 * @param {Uint8Array} msk
 * @returns {Promise<Uint8Array>} 32-byte hash
 */
export async function generateKeyCheckValue(msk) {
	return new Uint8Array(await crypto.subtle.digest('SHA-256', /** @type {BufferSource} */ (msk)));
}

/**
 * Creates the binary ArrayBuffer with the 64-byte TRZR header and payload.
 *
 * @param {string} type (e.g., 'TOKN')
 * @param {Uint8Array} payloadCiphertext (raw ciphertext)
 * @param {Uint8Array} payloadIV (12 bytes)
 * @param {Uint8Array} msk
 * @returns {Promise<Uint8Array>}
 */
export async function assembleCloudFile(type, payloadCiphertext, payloadIV, msk) {
	if (type.length !== 4) throw new Error('Type must be exactly 4 characters');

	const buffer = new ArrayBuffer(HEADER_SIZE + payloadCiphertext.length);
	const view = new DataView(buffer);
	const bytes = new Uint8Array(buffer);

	// magic: TRZR
	bytes.set(new TextEncoder().encode(MAGIC), 0);

	// version
	view.setUint8(4, VERSION);

	// type
	bytes.set(new TextEncoder().encode(type), 5);

	// iv
	bytes.set(payloadIV, 9);

	// key_check
	const kcv = await generateKeyCheckValue(msk);
	bytes.set(kcv, 21);

	// bytes 53..63 are reserved/padding (0 by default)

	// append ciphertext payload
	bytes.set(payloadCiphertext, HEADER_SIZE);

	return bytes;
}

/**
 * Parses an ArrayBuffer of a .trzr file.
 *
 * @param {Uint8Array} fileData
 * @returns {{ version: number, type: string, payloadIV: Uint8Array, keyCheckValue: Uint8Array, payloadCiphertext: Uint8Array }}
 */
export function parseCloudFile(fileData) {
	if (fileData.byteLength < HEADER_SIZE) {
		throw new Error('File too small to contain valid header');
	}

	const view = new DataView(fileData.buffer, fileData.byteOffset, fileData.byteLength);

	const magic = new TextDecoder().decode(fileData.subarray(0, 4));
	if (magic !== MAGIC) {
		throw new Error('Invalid magic');
	}

	const version = view.getUint8(4);
	if (version !== VERSION) {
		throw new Error(`Unsupported version: ${version}`);
	}

	const type = new TextDecoder().decode(fileData.subarray(5, 9));
	const payloadIV = fileData.subarray(9, 21);
	const keyCheckValue = fileData.subarray(21, 53);
	// bytes 53..63 are reserved

	const payloadCiphertext = fileData.subarray(HEADER_SIZE);

	return { version, type, payloadIV, keyCheckValue, payloadCiphertext };
}
