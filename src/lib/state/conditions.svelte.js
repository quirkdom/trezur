/**
 * Conditions or constraints that apply to the app. Cannot be modified directly by the user.
 * @module Conditions
 */
import { getContext, hasContext, setContext } from 'svelte';

const T_CONDITIONS = 'T_conditions';

/** @type {import("$lib/types").Conditions} */
const DEFAULT_CONDITIONS = {
	isUserPasscodeSet: false,
	isAppLocked: false
};

class Conditions {
	state = $state(DEFAULT_CONDITIONS);

	/**
	 * @param {import("$lib/types").Conditions | undefined} initialConditions
	 */
	constructor(initialConditions) {
		if (initialConditions) this.state = initialConditions;
	}

	getConditions() {
		return this.state;
	}

	/**
	 * @param {string} key
	 * @param {any} value
	 */
	updateCondition(key, value) {
		this.state[key] = value;
	}

	resetConditions() {
		this.state = DEFAULT_CONDITIONS;
	}
}

/**
 * @param {import("$lib/types").Conditions | undefined} initialConditions
 * @returns {Conditions}
 */
function createConditionsContext(initialConditions) {
	const conditions = new Conditions(initialConditions);
	setContext(T_CONDITIONS, conditions);
	return conditions;
}

/**
 * @returns {Conditions}
 */
function useConditionsContext() {
	if (!hasContext(T_CONDITIONS))
		throw new Error(
			'Conditions context not found. Did you forget to call createConditionsContext()?'
		);

	return getContext(T_CONDITIONS);
}

export { DEFAULT_CONDITIONS, createConditionsContext, useConditionsContext };
