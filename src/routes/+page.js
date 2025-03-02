import { browser } from '$app/environment';
import EncryptedLocalStorage from '$lib/utils/EncryptedLS';

/** @type {import('./$types').PageLoad} */
export async function load() {
	let storedTokens = [];

	if (browser) {
		const encryptedLocalStorage = new EncryptedLocalStorage('secret-passcode-woohoo'); // TODO: As is, only for testing. Should eventually be replaced with a proper passcode check.

		storedTokens = await encryptedLocalStorage.get('tokens');

		if (!storedTokens) {
			// Only for testing purposes //
			const { tokens } = await fetch('/temp/Chronos_20-02-2025.json').then((response) =>
				response.json()
			);
			await encryptedLocalStorage.set('tokens', tokens);
			// Only for testing purposes //

			storedTokens = await encryptedLocalStorage.get('tokens');
		}
	}

	return { tokens: storedTokens };
}
