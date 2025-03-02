<script>
	import { useSettingsContext } from '$lib/state/settings.svelte';
	import { ArrowLeft, ArrowUpDown, Plus, ArrowDownZA, ArrowDownAZ, ArrowUp } from 'lucide-svelte';
	import { slide } from 'svelte/transition';

	const { backButton = undefined, sortButton = false, newTokenButton = false } = $props();

	const settingsContext = useSettingsContext();
	const sortOrder = $derived(sortButton ? settingsContext.getSettings().sortOrder : null);

	function cycleSortOrder() {
		if (!sortButton || !sortOrder) return;

		if (sortOrder === 'asc') {
			settingsContext.updateSetting('sortOrder', 'desc');
		} else if (sortOrder === 'desc') {
			settingsContext.updateSetting('sortOrder', 'none');
		} else {
			settingsContext.updateSetting('sortOrder', 'asc');
		}
	}
</script>

<!-- TODO: Add new token modal -->
<nav class="flex gap-4">
	{#if backButton}
		<a href={backButton.to}>
			<button class="text-primary align-middle">
				<ArrowLeft size={24} />
				<span class="sr-only">Go back</span>
			</button>
		</a>
	{/if}
	{#if sortButton}
		<button class="text-primary" onclick={cycleSortOrder}>
			{#if sortOrder === 'asc'}
				<div transition:slide>
					<ArrowDownAZ size={24} />
				</div>
			{:else if sortOrder === 'desc'}
				<div transition:slide>
					<ArrowDownZA size={24} />
				</div>
			{:else}
				<div transition:slide>
					<ArrowUpDown size={24} />
				</div>
			{/if}
			<span class="sr-only">
				Sort {sortOrder === 'asc' ? 'ascending' : sortOrder === 'desc' ? 'descending' : 'none'}
			</span>
		</button>
	{/if}
	{#if newTokenButton}
		<button class="text-primary">
			<Plus size={24} />
			<span class="sr-only">Add Token</span>
		</button>
	{/if}
</nav>

<style lang="postcss">
	/* TODO: Move to theming */
	.text-primary {
		@apply text-[#EB3912];
	}
</style>
