/**
 * Passcode utilities for app lock and encryption
 * @module Passcode
 */

/**
 * Reactive session storage for passcode (cleared on browser close/refresh).
 * Using $state module pattern for reactivity across the app.
 */
export let sessionPasscode = $state({
	value: /** @type {string | null} */ (null)
});

/**
 * Set the passcode for the current session (never persisted)
 * @param {string} passcode
 */
export function setSessionPasscode(passcode) {
	sessionPasscode.value = passcode;
}

/**
 * Get the passcode for the current session
 * @returns {string | null}
 */
export function getSessionPasscode() {
	return sessionPasscode.value;
}

/**
 * Clear the passcode from session
 */
export function clearSessionPasscode() {
	sessionPasscode.value = null;
}
