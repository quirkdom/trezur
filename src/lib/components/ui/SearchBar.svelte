<script>
	import { Search } from 'lucide-svelte';
	import { onMount } from 'svelte';

	let { searchQuery = $bindable(''), isAppleDevice = false } = $props();

	/** @type {HTMLInputElement} */
	let searchInput;
	let isInputFocused = $state(false);

	onMount(() => {
		// TODO: Check using Svelte actions to handle focus and blur events
		const handleKeyDown = (/** @type {KeyboardEvent} */ event) => {
			// Check for Meta+K (Mac) or Ctrl+K (Windows/Linux) to focus search input
			if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
				event.preventDefault();
				searchInput.focus();
			}

			// Handle Enter key to unfocus, but keep query
			if (event.key === 'Enter') {
				searchInput.blur();
			}

			// Handle ESC key to unfocus and clear query
			if (event.key === 'Escape') {
				searchQuery = '';
				searchInput.blur();
			}
		};

		window.addEventListener('keydown', handleKeyDown);

		return () => {
			window.removeEventListener('keydown', handleKeyDown);
		};
	});
</script>

<div class="sticky top-6 z-1">
	<div class="absolute inset-y-0 left-3 flex items-center text-zinc-500">
		<Search size={20} />
	</div>
	<input
		type="text"
		bind:value={searchQuery}
		bind:this={searchInput}
		placeholder="Search codes"
		class="w-full rounded-lg border-b border-zinc-700 bg-zinc-900 py-2 pr-4 pl-10 text-white placeholder-zinc-500 focus:border-b-0 focus:ring-2 focus:ring-[#EB3912] focus:outline-none"
		onfocus={() => (isInputFocused = true)}
		onblur={() => (isInputFocused = false)}
	/>
	{#if isInputFocused}
		{@render Kbd(['esc', '⏎'])}
	{:else}
		{@render Kbd([isAppleDevice ? '⌘ K' : 'Ctrl K'])}
	{/if}
</div>

{#snippet Kbd(/** @type {string[]} */ keys)}
	<div class="pointer-events-none absolute top-1/2 right-3 flex -translate-y-1/2 gap-1 select-none">
		{#each keys as key}
			<span
				class="inline-block rounded border border-zinc-700 bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-400"
				>{key}</span
			>
		{/each}
	</div>
{/snippet}
