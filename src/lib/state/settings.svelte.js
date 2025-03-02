/**
 * Store user's preferences. Persisted browser-side in localStorage.
 * @module Settings
 */
import { browser } from '$app/environment';
import { getContext, hasContext, setContext } from 'svelte';

const T_SETTINGS = 'T_settings';

/** @type {import("$lib/types").Settings} */
const DEFAULT_SETTINGS = {
	showNextCode: false,
	useBiometricUnlock: false,
	sortOrder: 'none'
};

function load() {
	if (browser) {
		const item = localStorage.getItem(T_SETTINGS);
		if (item) return JSON.parse(item);
	}
}

/**
 * @param {import("$lib/types").Settings} settings
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

class Settings {
	state = $state(DEFAULT_SETTINGS);

	/**
	 * @param {import("$lib/types").Settings | undefined} initialSettings
	 */
	constructor(initialSettings, alsoPersist = true) {
		if (initialSettings) {
			this.state = initialSettings;
			if (alsoPersist) persist($state.snapshot(this.state));
		} else this.state = load();
	}

	getSettings() {
		return this.state;
	}

	/**
	 * @param {string} key
	 * @param {any} value
	 * @param {boolean} shouldPersist
	 */
	updateSetting(key, value, shouldPersist = true) {
		this.state[key] = value;
		if (shouldPersist) persist($state.snapshot(this.state));
	}

	resetSettings(shouldPurge = true) {
		this.state = DEFAULT_SETTINGS;
		if (shouldPurge) purge();
	}
}

/**
 * @param {import("$lib/types").Settings | undefined} initialSettings
 * @returns {Settings}
 */
function createSettingsContext(initialSettings, alsoPersist = true) {
	const settings = new Settings(initialSettings, alsoPersist);
	setContext(T_SETTINGS, settings);
	return settings;
}

/**
 * @returns {Settings}
 */
function useSettingsContext() {
	if (!hasContext(T_SETTINGS))
		throw new Error('Settings context not found. Did you forget to call createSettingsContext()?');

	return getContext(T_SETTINGS);
}

export { DEFAULT_SETTINGS, load, purge, createSettingsContext, useSettingsContext };
