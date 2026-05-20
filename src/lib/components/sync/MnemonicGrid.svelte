<script>
	import { ClipboardCopy, Download } from '@lucide/svelte';

	/**
	 * @type {{ words: string[] }}
	 */
	let { words } = $props();

	const COLS = 4;

	const formattedText = $derived.by(() => {
		const lines = [];
		for (let i = 0; i < words.length; i += COLS) {
			lines.push(words.slice(i, i + COLS).join('  '));
		}
		return lines.join('\n');
	});

	function copyToClipboard() {
		navigator.clipboard.writeText(formattedText);
	}

	function downloadAsTxt() {
		const blob = new Blob([formattedText], { type: 'text/plain' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = 'trezur-recovery-words.txt';
		a.click();
		URL.revokeObjectURL(url);
	}
</script>

<div class="relative rounded-xl border border-zinc-800 bg-zinc-900 p-3">
	<div class="grid grid-cols-4 gap-x-1 gap-y-1 font-mono text-sm leading-relaxed text-white select-all">
		{#each words as word, index (index)}
			<span class={['px-2 py-0.5', index < 4 && 'col-span-2']}>{word + ' '}</span>
		{/each}
	</div>

	<div class="absolute top-3 right-3 flex">
		<button
			class="rounded-l-lg bg-zinc-800 p-1.5 text-zinc-500 opacity-70 transition duration-300 ease-in-out hover:text-[#EB3912] hover:opacity-100"
			onclick={copyToClipboard}
		>
			<ClipboardCopy size={20} />
			<span class="sr-only">Copy recovery words</span>
		</button>
		<button
			class="rounded-r-lg bg-zinc-800 p-1.5 text-zinc-500 opacity-70 transition duration-300 ease-in-out hover:text-[#EB3912] hover:opacity-100"
			onclick={downloadAsTxt}
		>
			<Download size={20} />
			<span class="sr-only">Download recovery words as text file</span>
		</button>
	</div>
</div>
