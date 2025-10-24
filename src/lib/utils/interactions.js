import { on } from 'svelte/events';

/**
 * Svelte friendly longpress interaction that you can attach to elements.
 * This is a factory method which returns attachable functions.
 * @param {number} threshold Time (in ms) to wait before triggering the longpress event
 */
function longpress(threshold = 750) {
	return (/** @type HTMLElement */ element) => {
		/**
		 * @type {number | null | undefined}
		 */
		let timer;
		const start = () => {
			element.dispatchEvent(new PointerEvent('longpressstart'));
			timer = self.setTimeout(() => {
				element.dispatchEvent(new PointerEvent('longpress'));
			}, threshold);
		};
		const end = () => {
			if (timer) {
				self.clearTimeout(timer);
				timer = null;
			}
			element.dispatchEvent(new PointerEvent('longpressend'));
		};

		let removePointerdownListener = on(element, 'pointerdown', start);
		let removePointerupListener = on(element, 'pointerup', end);
		let removePointerleaveListener = on(element, 'pointerleave', end);

		return () => {
			removePointerdownListener();
			removePointerupListener();
			removePointerleaveListener();
		};
	};
}

export { longpress };
