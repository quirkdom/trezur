import { DEFAULT_SETTINGS, load as loadSettings } from '$lib/state/settings.svelte';
import { DEFAULT_CONDITIONS, load as loadConditions } from '$lib/state/conditions.svelte';
import { nanoid } from 'nanoid';
import { browser } from '$app/environment';
import { encryptedLocalStorage } from '$lib/state/storage.svelte';

/** @type {import('./$types').LayoutLoad} */
export async function load({ depends, data }) {
	depends('app://layout-load');
	// run all invalidation side-effects (if necessary; not needed on first load)
	if (browser) await encryptedLocalStorage.reset();

	// return new app data
	return {
		settings: loadSettings() ?? DEFAULT_SETTINGS,
		conditions: {
			...(loadConditions() ?? DEFAULT_CONDITIONS),
			clientId: loadConditions()?.clientId || nanoid(),
			isAppleDevice: data.isAppleDevice
		}
	};
}
