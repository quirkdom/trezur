import { dev } from '$app/environment';

/**
 * @param {string | null} userAgentString
 */
export function isAppleDevice(userAgentString) {
	return userAgentString ? /(Mac|iPhone|iPad|iPod)/.test(userAgentString) : false;
}

export const devconsole = {
	log: dev ? console.log.bind(console) : () => {},
	warn: dev ? console.warn.bind(console) : () => {},
	error: dev ? console.error.bind(console) : () => {}
};
