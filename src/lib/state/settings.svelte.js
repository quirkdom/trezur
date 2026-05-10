/**
 * Store user's preferences. Persisted browser-side in localStorage.
 * @module Settings
 * @typedef {import("$lib/types").Settings} Settings
 */
import { browser } from '$app/environment';
import { devconsole } from '$lib/utils';
import { getContext, hasContext, setContext } from 'svelte';

const T_SETTINGS = 'T_settings';

/** @type {Settings} */
const DEFAULT_SETTINGS = {
	showNextCode: false,
	useBiometricUnlock: false,
	sortOrder: 'none'
};

/**
 * @returns {Settings | undefined} Settings from storage or undefined if not found
 */
function load() {
	if (browser) {
		const item = localStorage.getItem(T_SETTINGS);
		if (item) return JSON.parse(item);
	}
}

/**
 * @param {Settings} settings
 */
function persist(settings) {
	if (browser) {
		localStorage.setItem(T_SETTINGS, JSON.stringify(settings));
	}
}

function purge() {
	if (browser) {
		localStorage.removeItem(T_SETTINGS);
	}
}

class SettingsCtx {
	state = $state(DEFAULT_SETTINGS);

	/**
	 * @param {Settings | undefined} initialSettings
	 */
	constructor(initialSettings) {
		if (initialSettings) {
			this.state = initialSettings;
			persist($state.snapshot(this.state)); // always persist because initial settings are provided and may be different from default settings
		} else {
			const loaded = load();
			if (loaded) this.state = loaded;
		}
	}

	getSettings() {
		return this.state;
	}

	/**
	 * @template {keyof Settings} K
	 * @param {K} key
	 * @param {Settings[K]} value
	 */
	updateSetting(key, value, shouldPersist = true) {
		this.state[key] = value;
		if (shouldPersist) persist($state.snapshot(this.state));
	}

	/**
	 * **CAUTION:** Resetting settings also purges from persistent storage by default. This won't survive an app reload.
	 */
	resetSettings(shouldPurge = true) {
		this.state = DEFAULT_SETTINGS;
		if (shouldPurge) {
			purge();

			devconsole.warn(
				"Resetting settings also purges it from persistent storage by default. This won't survive an app reload."
			);
		}
	}
}

/**
 * @param {Settings | undefined} initialSettings
 * @returns {SettingsCtx}
 */
function createSettingsContext(initialSettings) {
	const settings = new SettingsCtx(initialSettings);
	setContext(T_SETTINGS, settings);
	return settings;
}

/**
 * @returns {SettingsCtx}
 */
function useSettingsContext() {
	if (!hasContext(T_SETTINGS))
		throw new Error('Settings context not found. Did you forget to call createSettingsContext()?');

	return getContext(T_SETTINGS);
}

export { DEFAULT_SETTINGS, load, purge, createSettingsContext, useSettingsContext };
