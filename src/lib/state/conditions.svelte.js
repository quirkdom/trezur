/**
 * Conditions or constraints that apply to the app. Cannot be modified directly by the user.
 * @module Conditions
 * @typedef {import("$lib/types").Conditions} Conditions
 */
import { browser } from '$app/environment';
import { getContext, hasContext, setContext } from 'svelte';

const T_CONDITIONS = 'T_conditions';
const PERSISTABLE_KEYS = ['clientId'];

/** @type Conditions */
const DEFAULT_CONDITIONS = {
	isUserPasscodeSet: false,
	isAppLocked: false
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
	 * @param {Conditions | undefined} initialConditions
	 */
	constructor(initialConditions) {
		if (initialConditions) {
			this.state = initialConditions;
			persist($state.snapshot(this.state));
		} else {
			const loaded = load();
			if (loaded) this.state = loaded;
		}
	}

	getConditions() {
		return this.state;
	}

	/**
	 * @param {keyof Conditions} key
	 * @param {Conditions[keyof Conditions]} value
	 */
	updateCondition(key, value) {
		// Using a type assertion to fix the type checking issue
		this.state = { ...this.state, [key]: value };
		persist($state.snapshot(this.state));
	}

	/**
	 * @param {Partial<{[key in keyof Conditions]: Conditions[key]}>} conditions
	 */
	updateConditions(conditions) {
		console.trace('Updating conditions:', conditions);
		this.state = { ...this.state, ...conditions };
		persist($state.snapshot(this.state));
	}

	resetConditions() {
		this.state = DEFAULT_CONDITIONS;
		purge();
	}
}

/**
 * @param {Conditions | undefined} initialConditions
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
		throw new Error(
			'Conditions context not found. Did you forget to call createConditionsContext()?'
		);

	return getContext(T_CONDITIONS);
}

export { DEFAULT_CONDITIONS, createConditionsContext, useConditionsContext, load };
