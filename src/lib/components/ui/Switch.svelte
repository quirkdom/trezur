<script>
	/**
	 * @type {{
	 * 	checked?: boolean,
	 * 	disabled?: boolean,
	 * 	class?: string,
	 * 	onCheckedChange?: (willBeChecked: boolean) => void | Promise<void>,
	 * }}
	 */
	let {
		checked = $bindable(undefined),
		disabled = undefined,
		class: className = '',
		onCheckedChange = undefined
	} = $props();

	async function handleClick() {
		const willBeChecked = !checked;
		await onCheckedChange?.(willBeChecked);
		checked = willBeChecked;
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
		'-opacity-75 relative inline-flex h-6 w-10 shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring focus-visible:ring-purple-500 disabled:cursor-not-allowed disabled:opacity-50',
		'data-[state=off]:bg-zinc-700 data-[state=on]:bg-[#34C759]',
		className
	]}
	onclick={handleClick}
	onkeydown={handleKeyDown}
>
	<span
		class={[
			'pointer-events-none inline-block h-5 w-5 translate-y-0.5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out',
			checked ? 'translate-x-[18px]' : 'translate-x-0.5'
		]}
	></span>
</button>
