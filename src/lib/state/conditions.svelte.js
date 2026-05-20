/**
 * Conditions or constraints that apply to the app. Cannot be modified directly by the user.
 * @module Conditions
 * @typedef {import("$lib/types").Conditions} Conditions
 */
import { browser } from '$app/environment';
import { devconsole } from '$lib/utils';
import { getContext, hasContext, setContext } from 'svelte';
import { nanoid } from 'nanoid';

const T_CONDITIONS = 'T_conditions';
const PERSISTABLE_KEYS = ['clientId', 'isUserPasscodeSet'];

/** @type Conditions */
const DEFAULT_CONDITIONS = {
	isUserPasscodeSet: false,
	isAppLocked: false,
	isAppleDevice: false
};

/**
 * @returns {Conditions | undefined} Conditions from storage or undefined if not found
 */
function load(fallback = DEFAULT_CONDITIONS) {
	if (browser) {
		const item = localStorage.getItem(T_CONDITIONS);
		if (item) return { ...fallback, ...JSON.parse(item) }; // we have to do this because not all keys are persisted
	}
}

/**
 * @param {Conditions} conditions
 */
function persist(conditions) {
	if (browser) {
		localStorage.setItem(T_CONDITIONS, JSON.stringify(conditions, PERSISTABLE_KEYS));
	}
}

function purge() {
	if (browser) {
		localStorage.removeItem(T_CONDITIONS);
	}
}

/**
 * Note: Persistence occurs on every create/update/delete because Conditions are integral to
 * app-function. Hence, properties that need to be persistent must be guaranteed persistence.
 */
class ConditionsCtx {
	state = $state(DEFAULT_CONDITIONS);

	/**
	 * @param {Partial<Conditions>} [initialConditions]
	 */
	constructor(initialConditions) {
		const loaded = load() ?? DEFAULT_CONDITIONS;

		this.state = { ...loaded, ...initialConditions };
		this.state.clientId ??= browser ? nanoid() : undefined;

		persist($state.snapshot(this.state));
	}

	getConditions() {
		return this.state;
	}

	/**
	 * @template {keyof Conditions} K
	 * @param {K} key
	 * @param {Conditions[K]} value
	 */
	updateCondition(key, value) {
		this.state[key] = value;
		if (PERSISTABLE_KEYS.includes(key)) persist($state.snapshot(this.state));
	}

	/**
	 * @param {Partial<{[key in keyof Conditions]: Conditions[key]}>} conditions
	 */
	updateConditions(conditions) {
		Object.assign(this.state, conditions);
		persist($state.snapshot(this.state));
	}

	/**
	 * **CAUTION:** Resetting conditions always purges from persistent storage. This won't survive an app reload.
	 */
	resetConditions() {
		this.state = DEFAULT_CONDITIONS;
		purge();

		devconsole.warn(
			"[Conditions] Resetting conditions always purges it from persistent storage. This won't survive an app reload."
		);
	}
}

/**
 * @param {Partial<Conditions>} [initialConditions]
 * @returns {ConditionsCtx}
 */
function createConditionsContext(initialConditions) {
	const conditions = new ConditionsCtx(initialConditions);
	setContext(T_CONDITIONS, conditions);
	return conditions;
}

/**
 * @returns {ConditionsCtx}
 */
function useConditionsContext() {
	if (!hasContext(T_CONDITIONS))
		throw new Error('Conditions context not found. Did you forget to call createConditionsContext()?');

	return getContext(T_CONDITIONS);
}

export { DEFAULT_CONDITIONS, createConditionsContext, useConditionsContext, load };
