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

/**
 * @param {File} file A File object with contents of the file to download.
 * @see {@link https://pqina.nl/blog/how-to-prompt-the-user-to-download-a-file-instead-of-navigating-to-it/}
 */
export function triggerDownloadFile(file) {
	// Create a link and set the URL using `createObjectURL`
	const link = document.createElement('a');
	link.style.display = 'none';
	link.href = URL.createObjectURL(file);
	link.download = file.name;

	// It needs to be added to the DOM so it can be clicked
	document.body.appendChild(link);
	link.click();

	// To make this work on Firefox we need to wait
	// a little while before removing it.
	setTimeout(() => {
		URL.revokeObjectURL(link.href);
		link.parentNode?.removeChild(link);
	}, 0);
}
