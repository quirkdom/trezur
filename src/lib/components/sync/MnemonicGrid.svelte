<script>
	/**
	 * @type {{ words: string[] }}
	 */
	let { words } = $props();
</script>

<div class="grid grid-cols-2 gap-2 rounded-xl border border-white/5 bg-zinc-900/50 p-4 sm:grid-cols-4 md:gap-4">
	{#each words as word, index (index)}
		<div class="flex items-center gap-2 rounded-lg border border-white/5 bg-black/40 px-3 py-2 shadow-inner">
			<span class="w-5 text-right text-xs font-medium text-zinc-500">{index + 1}.</span>
			<span class="text-sm font-semibold tracking-wide text-zinc-200">{word}</span>
		</div>
	{/each}
</div>
