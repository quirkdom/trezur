<script>
	let { class: className, value, onEdit = undefined, children = undefined } = $props();
	let initialValue = value;
</script>

<div
	class={['focus:rounded-md focus:outline-2 focus:outline-offset-1 focus:outline-[#EB3912]', className]}
	role="textbox"
	contenteditable
	spellcheck="false"
	tabindex="0"
	bind:textContent={value}
	onfocus={() => (initialValue = value)}
	onkeydown={(e) => {
		if (e.key === 'Enter') {
			e.preventDefault();
			e.currentTarget.blur();
		} else if (e.key === 'Escape') {
			e.preventDefault();
			value = initialValue;
			e.currentTarget.blur();
		}
	}}
	onblur={() => {
		if (value !== initialValue) {
			onEdit?.(value, initialValue);
		}
		initialValue = value;
	}}
>
	{#if children}
		{@render children(value)}
	{:else}
		{value}
	{/if}
</div>
