<script module>
	import { version } from '$app/environment';

	/**
	 * @param {import('$lib/types').Token[]} tokens
	 * @param {string} filename
	 */
	export function exportTokensDownload(tokens, filename) {
		const exportData = {
			date: new Date().toISOString(),
			v: version,
			tokens: tokens.map((token) => ({
				id: token.id,
				account: token.account,
				issuer: token.issuer,
				secret: token.secret,
				type: token.type,
				algorithm: token.algorithm,
				digits: token.digits,
				period: token.period,
				counter: token.counter
			}))
		};

		const jsonString = JSON.stringify(exportData, null, 2);
		const file = new File([jsonString], filename, { type: 'application/json' });
		triggerDownloadFile(file);
	}
</script>

<script>
	import { triggerDownloadFile } from '$lib/utils';
	import Modal from '../ui/Modal.svelte';

	/**
	 * @type {{open: boolean, tokens: import('$lib/types').Token[]}}
	 */
	let { open = $bindable(false), tokens } = $props();

	let filename = $state(`trezur_backup_${new Date().toISOString().split('T')[0]}.json`);
	let errorMessage = $state('');

	/**
	 * @param {SubmitEvent} event
	 */
	function handleExport(event) {
		event.preventDefault();

		try {
			errorMessage = '';
			exportTokensDownload(tokens, filename);
			open = false;
		} catch (error) {
			console.error('Export error:', error);
			errorMessage = `Error exporting tokens: ${error instanceof Error ? error.message : error}`;
		}
	}
</script>

<Modal bind:open title="Export Tokens">
	{#if errorMessage}
		<div class="mb-4 rounded-lg bg-red-900/30 p-3 text-red-400">
			{errorMessage}
		</div>
	{/if}

	<form onsubmit={handleExport} class="space-y-4">
		<div class="mb-4">
			<p>
				This will export {tokens.length} token{tokens.length !== 1 ? 's' : ''} as a JSON file.
			</p>
			<p class="mt-1 text-sm text-zinc-500">The exported file contains sensitive information. Store it securely.</p>
		</div>

		<div class="form-field">
			<label for="filename" class="mb-1 block text-sm text-gray-400">Filename</label>
			<input
				type="text"
				id="filename"
				bind:value={filename}
				required
				class="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 focus:border-[#EB3912] focus:outline-none"
			/>
		</div>

		<div class="mt-6 flex gap-4">
			<button
				type="button"
				class="flex-1 rounded-lg bg-zinc-800 py-3 transition-colors hover:bg-zinc-700"
				onclick={() => (open = false)}
			>
				Cancel
			</button>
			<button type="submit" class="flex-1 rounded-lg bg-[#EB3912] py-3 transition-colors hover:bg-[#D83511]">
				Export
			</button>
		</div>
	</form>
</Modal>
