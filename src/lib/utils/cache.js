/**
 * A simple Map wrapper that clears itself entirely after a period of inactivity.
 * Useful for short-lived caches to prevent memory leaks and stale data.
 *
 * @template K, V
 */
export class ExpiringMap {
	/** @type {Map<K, V>} */
	#map = new Map();
	/** @type {number} */
	#ttl;
	/** @type {any} */
	#timer = null;

	/**
	 * @param {number} ttl Time to live in milliseconds.
	 */
	constructor(ttl) {
		this.#ttl = ttl;
	}

	/**
	 * @param {K} key
	 * @param {V} value
	 */
	set(key, value) {
		this.#map.set(key, value);
		this.#refreshTimer();
	}

	/**
	 * @param {K} key
	 * @returns {V | undefined}
	 */
	get(key) {
		return this.#map.get(key);
	}

	/**
	 * @param {K} key
	 */
	delete(key) {
		this.#map.delete(key);
		if (this.#map.size === 0) {
			this.#stopTimer();
		}
	}

	clear() {
		this.#map.clear();
		this.#stopTimer();
	}

	#refreshTimer() {
		this.#stopTimer();
		this.#timer = setTimeout(() => this.clear(), this.#ttl);
	}

	#stopTimer() {
		if (this.#timer) {
			clearTimeout(this.#timer);
			this.#timer = null;
		}
	}
}
