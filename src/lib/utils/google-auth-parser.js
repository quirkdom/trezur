import { Secret } from 'otpauth';

/**
 * Converts a URL-safe Base64 string into a Uint8Array.
 * @param {string} base64
 * @returns {Uint8Array}
 */
export function base64ToUint8Array(base64) {
	let standardBase64 = base64.replace(/-/g, '+').replace(/_/g, '/');
	while (standardBase64.length % 4) {
		standardBase64 += '=';
	}
	const binaryString = atob(standardBase64);
	const len = binaryString.length;
	const bytes = new Uint8Array(len);
	for (let i = 0; i < len; i++) {
		bytes[i] = binaryString.charCodeAt(i);
	}
	return bytes;
}

/**
 * Reads a Protocol Buffer varint value at the specified offset.
 * @param {Uint8Array} buffer
 * @param {number} offset
 * @returns {{ value: number, offset: number }}
 */
export function readVarint(buffer, offset) {
	let value = 0;
	let shift = 0;
	while (offset < buffer.length) {
		const byte = buffer[offset++];
		value |= (byte & 0x7f) << shift;
		if ((byte & 0x80) === 0) {
			return { value, offset };
		}
		shift += 7;
		if (shift >= 32) {
			// Support larger varints safely
		}
	}
	throw new Error('Malformed varint');
}

/**
 * Converts a Uint8Array into a hex string.
 * @param {Uint8Array} arr
 * @returns {string}
 */
export function uint8ArrayToHex(arr) {
	return Array.from(arr)
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}

/**
 * Parses binary Google Authenticator migration payload.
 * @param {Uint8Array} buffer
 * @returns {import('$lib/types').Tokenable[] | null}
 */
export function parseGoogleAuthenticatorPayload(buffer) {
	let offset = 0;
	const otpParametersBuffers = [];

	while (offset < buffer.length) {
		const tagVar = readVarint(buffer, offset);
		const tag = tagVar.value;
		offset = tagVar.offset;
		const wireType = tag & 0x07;
		const fieldNumber = tag >> 3;

		if (wireType === 2) {
			const lenVar = readVarint(buffer, offset);
			const length = lenVar.value;
			offset = lenVar.offset;
			const fieldValue = buffer.subarray(offset, offset + length);
			offset += length;

			if (fieldNumber === 1) {
				otpParametersBuffers.push(fieldValue);
			}
		} else if (wireType === 0) {
			const valVar = readVarint(buffer, offset);
			offset = valVar.offset;
		} else {
			offset++;
		}
	}

	const tokens = [];
	for (const subBuffer of otpParametersBuffers) {
		let subOffset = 0;
		let secretBytes = null;
		let name = '';
		let issuer = '';
		let algorithm = 1; // SHA1
		let digits = 1; // 6 digits
		let type = 2; // TOTP
		let counter = 0;

		while (subOffset < subBuffer.length) {
			const tagVar = readVarint(subBuffer, subOffset);
			const tag = tagVar.value;
			subOffset = tagVar.offset;
			const wireType = tag & 0x07;
			const fieldNumber = tag >> 3;

			if (wireType === 2) {
				const lenVar = readVarint(subBuffer, subOffset);
				const length = lenVar.value;
				subOffset = lenVar.offset;
				const fieldValue = subBuffer.subarray(subOffset, subOffset + length);
				subOffset += length;

				if (fieldNumber === 1) {
					secretBytes = fieldValue;
				} else if (fieldNumber === 2) {
					name = new TextDecoder().decode(fieldValue);
				} else if (fieldNumber === 3) {
					issuer = new TextDecoder().decode(fieldValue);
				}
			} else if (wireType === 0) {
				const valVar = readVarint(subBuffer, subOffset);
				const val = valVar.value;
				subOffset = valVar.offset;

				if (fieldNumber === 4) {
					algorithm = val;
				} else if (fieldNumber === 5) {
					digits = val;
				} else if (fieldNumber === 6) {
					type = val;
				} else if (fieldNumber === 7) {
					counter = val;
				}
			} else {
				subOffset++;
			}
		}

		let algoStr = 'SHA1';
		if (algorithm === 2) algoStr = 'SHA256';
		else if (algorithm === 3) algoStr = 'SHA512';
		else if (algorithm === 4) algoStr = 'MD5';

		let digitsNum = 6;
		if (digits === 2) digitsNum = 8;

		/** @type {"HOTP" | "TOTP"} */
		let typeStr = 'TOTP';
		if (type === 1) typeStr = 'HOTP';

		if (secretBytes && secretBytes.length > 0) {
			const secretHex = uint8ArrayToHex(secretBytes);
			const secretBase32 = Secret.fromHex(secretHex).base32;

			tokens.push({
				account: name,
				issuer: issuer,
				secret: secretBase32,
				type: typeStr,
				algorithm: algoStr,
				digits: digitsNum,
				period: 30,
				counter: counter
			});
		}
	}

	return tokens;
}
