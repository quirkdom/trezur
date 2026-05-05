const AES_GCM = 'AES-GCM';

/**
 * @param {string} passkey
 * @param {any} metadata
 */
async function deriveLWK(passkey, metadata) {
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

function generateMSK() {
	return crypto.getRandomValues(new Uint8Array(32));
}

/**
 * @param {Uint8Array} msk
 * @param {CryptoKey} lwk
 */
async function wrapMSK(msk, lwk) {
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
async function unwrapMSK(wrappedData, lwk) {
	const { iv, data } = wrappedData;
	const decrypted = await crypto.subtle.decrypt({ name: AES_GCM, iv: new Uint8Array(iv) }, lwk, new Uint8Array(data));
	return new Uint8Array(decrypted);
}

/**
 * @param {Uint8Array} msk
 */
async function importPayloadKey(msk) {
	return crypto.subtle.importKey('raw', /** @type {any} */ (msk), { name: AES_GCM }, false, ['encrypt', 'decrypt']);
}

/**
 * @param {string} passkey
 * @param {any} metadata
 * @param {{ iv: number[], data: number[] }} wrappedData
 */
async function exportUnwrappedMSK(passkey, metadata, wrappedData) {
	const lwk = await deriveLWK(passkey, metadata);
	return unwrapMSK(wrappedData, lwk);
}

export { deriveLWK, generateMSK, unwrapMSK, wrapMSK, importPayloadKey, exportUnwrappedMSK };
