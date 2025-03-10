<script>
	import { X } from 'lucide-svelte';
	import { fly } from 'svelte/transition';

	let {
		/** @type {boolean} */ open = $bindable(false),
		/** @type {string} */ title = '',
		/** @type {(() => void) | undefined} */ onClose = undefined,
		/** @type {string} */ class: className = '',
		children
	} = $props();

	function handleClose() {
		open = false;
		onClose?.();
	}
</script>

{#if open}
	<div
		class="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
		role="presentation"
		onclick={(e) => e.target === e.currentTarget && handleClose()}
		onkeypress={(e) => e.key === 'Escape' && handleClose()}
	>
		<div
			transition:fly={{ duration: 300, y: '100%' }}
			class={[
				'fixed right-0 bottom-0 left-0 max-h-[90vh] overflow-auto rounded-t-xl border-t border-zinc-700 bg-zinc-900 p-6 shadow-lg',
				className
			]}
		>
			<div class="mb-6 flex items-center justify-between">
				<h2 class="text-2xl font-medium text-white">{title}</h2>
				<button
					class="rounded-full p-1 text-gray-400 hover:bg-zinc-800 hover:text-white"
					onclick={handleClose}
					aria-label="Close"
				>
					<X size={24} />
				</button>
			</div>
			{@render children()}
		</div>
	</div>
{/if}
