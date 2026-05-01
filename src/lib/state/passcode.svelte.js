/**
 * Session level passcode store for app lock and encryption
 */
class PasscodeStore {
	/** @type {string | null} */
	#value = $state(null);

	/** @type {string | null} */
	#previous = $state(null);

	get passcode() {
		return this.#value;
	}

	set passcode(passcode) {
		this.#previous = this.#value;
		this.#value = passcode;
	}

	/**
	 * Get the previous passcode (only valid during a passcode change transition)
	 */
	get previous() {
		return this.#previous;
	}

	clear() {
		this.#value = null;
		this.#previous = null;
	}
}

/**
 * Instance of the passcode store
 */
export const sessionPasscode = new PasscodeStore();
