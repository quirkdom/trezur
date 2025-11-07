import { on } from 'svelte/events';

/**
 * Svelte friendly longpress interaction that you can attach to elements.
 * This is a factory method which returns attachable functions.
 *
 * @param {number} [threshold=400] Time (in ms) to wait before triggering the longpress event. Default is 400ms.
 * @returns {import('svelte/attachments').Attachment}
 */
function longpress(threshold = 400) {
	return (element) => {
		/**
		 * @type {number | null | undefined}
		 */
		let timer;
		const start = () => {
			element.dispatchEvent(new PointerEvent('longpressstart'));
			timer = self.setTimeout(() => {
				element.dispatchEvent(new PointerEvent('longpress'));
				element.dispatchEvent(new PointerEvent('longpressend'));
			}, threshold);
		};
		const end = () => {
			if (timer) {
				self.clearTimeout(timer);
				timer = null;
			}
			element.dispatchEvent(new PointerEvent('longpressend'));
		};

		let removeOnMouseDown = on(element, 'mousedown', start);
		let removeOnMouseUp = on(element, 'mouseup', end);
		let removeOnMouseLeave = on(element, 'mouseleave', end);

		let removeOnTouchDown = on(element, 'touchstart', start);
		let removeOnTouchUp = on(element, 'touchend', end);

		return () => {
			removeOnMouseDown();
			removeOnMouseUp();
			removeOnMouseLeave();

			removeOnTouchDown();
			removeOnTouchUp();
		};
	};
}

export { longpress };
