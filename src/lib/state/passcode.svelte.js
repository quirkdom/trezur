/**
 * Session level passcode store for app lock and encryption
 */
class PasscodeStore {
	/** @type {string | null} */
	#value = $state(null);

	get passcode() {
		return this.#value;
	}

	set passcode(passcode) {
		this.#value = passcode;
	}

	clear() {
		this.#value = null;
	}
}

/**
 * Instance of the passcode store
 */
export const sessionPasscode = new PasscodeStore();
