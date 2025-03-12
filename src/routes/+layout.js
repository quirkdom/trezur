import { DEFAULT_SETTINGS, load as loadSettings } from '$lib/state/settings.svelte';
import { DEFAULT_CONDITIONS, load as loadConditions } from '$lib/state/conditions.svelte';

/** @type {import('./$types').LayoutLoad} */
export async function load() {
	return {
		settings: loadSettings() ?? DEFAULT_SETTINGS,
		conditions: loadConditions() ?? {
			...DEFAULT_CONDITIONS,
			clientId: crypto.randomUUID()
		}
	};
}
