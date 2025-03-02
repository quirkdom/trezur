<script>
	let {
		/** @type {boolean | undefined} */ checked = $bindable(undefined),
		/** @type {boolean | undefined} */ disabled = undefined,
		/** @type {string} */ class: className = '',
		/** @type {((checked: boolean) => void) | undefined} */ onCheckedChange = undefined
	} = $props();

	function handleClick() {
		checked = !checked;
		onCheckedChange?.(checked);
	}

	/** @param {KeyboardEvent} event */
	function handleKeyDown(event) {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			handleClick();
		}
	}
</script>

<button
	type="button"
	role="switch"
	aria-checked={checked}
	aria-label="Toggle switch"
	data-state={checked ? 'on' : 'off'}
	{disabled}
	class={[
		'-opacity-75 relative inline-flex h-6 w-10 flex-shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring focus-visible:ring-purple-500 disabled:cursor-not-allowed disabled:opacity-50',
		'data-[state=off]:bg-zinc-700 data-[state=on]:bg-[#34C759]',
		className
	]}
	onclick={handleClick}
	onkeydown={handleKeyDown}
>
	<span
		class={[
			'pointer-events-none inline-block h-5 w-5 translate-y-[2px] transform rounded-full bg-white ring-0 shadow-lg transition duration-200 ease-in-out',
			checked ? 'translate-x-[18px]' : 'translate-x-[2px]'
		]}
	></span>
</button>
