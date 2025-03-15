/**
 * @param {string | null} userAgentString
 */
export function isAppleDevice(userAgentString) {
	return userAgentString ? /(Mac|iPhone|iPad|iPod)/.test(userAgentString) : false;
}
