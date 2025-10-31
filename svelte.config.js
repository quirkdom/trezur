import cloudflareAdapter from '@sveltejs/adapter-cloudflare';
import pkg from './package.json' with { type: 'json' };

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		adapter: cloudflareAdapter(),
		version: {
			name: pkg.version,
			pollInterval: 3_600_000 // 1 hour
		}
	}
};

export default config;
