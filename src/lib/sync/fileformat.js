const VERSION = 1;
const MAGIC = 'TRZR';
const HEADER_SIZE = 64;

/**
 * Creates the binary ArrayBuffer with the 64-byte TRZR header and payload.
 *
 * @param {number} version
 * @param {string} type (e.g., 'TOKN')
 * @param {Uint8Array} payloadCiphertext (raw ciphertext)
 * @param {Uint8Array} payloadIV (12 bytes)
 * @param {Uint8Array} authTag (16 bytes, AES-GCM auth tag over header AAD)
 * @returns {Uint8Array}
 */
export function assembleCloudFile(version, type, payloadCiphertext, payloadIV, authTag) {
	if (version !== 1) throw new Error(`Unsupported version: ${version}`);
	if (type.length !== 4) throw new Error('Type must be exactly 4 characters');

	const buffer = new ArrayBuffer(HEADER_SIZE + payloadCiphertext.length);
	const view = new DataView(buffer);
	const bytes = new Uint8Array(buffer);

	// magic: TRZR
	bytes.set(new TextEncoder().encode(MAGIC), 0);

	// version
	view.setUint8(4, version);

	// type
	bytes.set(new TextEncoder().encode(type), 5);

	// iv
	bytes.set(payloadIV, 9);

	// auth tag (AES-GCM over header AAD block, bytes 0..20)
	bytes.set(authTag, 21);

	// bytes 37..63 are reserved/padding (0 by default)

	// append ciphertext payload
	bytes.set(payloadCiphertext, HEADER_SIZE);

	return bytes;
}

/**
 * Parses an ArrayBuffer of a .trzr file.
 *
 * @param {Uint8Array} fileData
 * @returns {{ version: number, type: string, payloadIV: Uint8Array, authTag: Uint8Array, payloadCiphertext: Uint8Array }}
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
	const authTag = fileData.subarray(21, 37);
	// bytes 37..63 are reserved

	const payloadCiphertext = fileData.subarray(HEADER_SIZE);

	return { version, type, payloadIV, authTag, payloadCiphertext };
}
