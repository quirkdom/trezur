import { ds, generateKDFParams } from './salada';

const AES_GCM = 'AES-GCM';

/**
 * @param {Uint8Array} saltBytes
 * @param {boolean} [isLegacy=false]
 *
 * @todo Remove isLegacy opt and simpilfy, after all users have migrated
 */
export function generateKDFMetadata(saltBytes, isLegacy = false) {
	const kdfProps = generateKDFParams('PBKDF2-SHA256', /** @type {any} */ (saltBytes));
	return {
		v: isLegacy ? 0 : 1,
		...kdfProps,
		...(isLegacy ? { iterations: 100000 } : {})
	};
}

/**
 * @param {string} passkey
 */
export async function getLegacySalt(passkey) {
	return ds(passkey);
}

/**
 * @param {string} passkey
 * @param {any} metadata
 */
export async function deriveLWK(passkey, metadata) {
	const saltBytes = Uint8Array.from(atob(metadata.salt), (c) => c.charCodeAt(0));

	const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(passkey), metadata.name, false, [
		'deriveKey'
	]);

	return crypto.subtle.deriveKey(
		{
			name: metadata.name,
			salt: saltBytes,
			iterations: metadata.iterations,
			hash: metadata.hash
		},
		keyMaterial,
		{ name: AES_GCM, length: 256 },
		false,
		['encrypt', 'decrypt']
	);
}

export function generateMSK() {
	return crypto.getRandomValues(new Uint8Array(32));
}

/**
 * @param {Uint8Array} msk
 * @param {CryptoKey} lwk
 */
export async function wrapMSK(msk, lwk) {
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const encryptedMsk = await crypto.subtle.encrypt({ name: AES_GCM, iv }, lwk, /** @type {any} */ (msk));
	return {
		iv: Array.from(iv),
		data: Array.from(new Uint8Array(encryptedMsk))
	};
}

/**
 * @param {{ iv: number[], data: number[] }} wrappedData
 * @param {CryptoKey} lwk
 */
export async function unwrapMSK(wrappedData, lwk) {
	const { iv, data } = wrappedData;
	const decrypted = await crypto.subtle.decrypt({ name: AES_GCM, iv: new Uint8Array(iv) }, lwk, new Uint8Array(data));
	return new Uint8Array(decrypted);
}

/**
 * @param {Uint8Array} msk
 */
export async function importPayloadKey(msk) {
	return crypto.subtle.importKey('raw', /** @type {any} */ (msk), { name: AES_GCM }, false, ['encrypt', 'decrypt']);
}
