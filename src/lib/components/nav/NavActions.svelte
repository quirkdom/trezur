<script>
	import { ArrowLeft, ArrowUpDown, Plus, ArrowDownZA, ArrowDownAZ } from 'lucide-svelte';
	import { slide } from 'svelte/transition';

	let {
		/** @type {string | undefined} */ backButtonTo = undefined,
		/** @type {{ sortOrder?: 'asc' | 'desc' | 'none', onSortChange?: (order: 'asc' | 'desc' | 'none') => void } | undefined} */ sortButton = undefined,
		/** @type {function | undefined} */ addButton = undefined
	} = $props();

	const sortOrder = $derived(sortButton?.sortOrder);

	function cycleSortOrder() {
		if (!sortButton || !sortOrder) return;

		const nextSortOrder = sortOrder === 'asc' ? 'desc' : sortOrder === 'desc' ? 'none' : 'asc';
		sortButton.onSortChange?.(nextSortOrder);
	}

	// $inspect(sortOrder);
</script>

<nav class="flex gap-4">
	{#if backButtonTo}
		<a href={backButtonTo}>
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
				Sort {sortOrder === 'asc' ? 'descending' : sortOrder === 'desc' ? 'naturally' : 'ascending'}
			</span>
		</button>
	{/if}
	{#if addButton}
		<button class="text-primary" onclick={addButton}>
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
