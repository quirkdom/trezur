import type { HTMLAttributes } from 'svelte/elements';

declare module 'svelte/elements' {
	/**
	 * Add extra attributes for custom interactions.
	 * @see {@link file://./lib/utils/interactions.js}
	 * @see {@link https://example.com}
	 */
	interface HTMLAttributes<T> {
		onlongpress?: PointerEventHandler<T>;
		onlongpressstart?: PointerEventHandler<T>;
		onlongpressend?: PointerEventHandler<T>;
	}
}
