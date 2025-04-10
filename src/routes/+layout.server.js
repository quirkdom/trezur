import { isAppleDevice } from '$lib/utils';

/** @type {import('./$types').LayoutServerLoad} */
export async function load({ request }) {
	return {
		isAppleDevice: isAppleDevice(request.headers.get('User-Agent'))
	};
}
