<script>
	import { X } from 'lucide-svelte';
	import { fade } from 'svelte/transition';

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
	<!-- TODO: Use svelte actions instead of onclick/onkeypress to dismiss modal -->
	<div
		class="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
		role="presentation"
		onclick={(e) => e.target === e.currentTarget && handleClose()}
		onkeypress={(e) => e.key === 'Escape' && handleClose()}
		transition:fade={{ duration: 150 }}
	>
		<div
			class={[
				'fixed top-1/2 left-1/2 w-full max-w-md -translate-x-1/2 -translate-y-1/2 overflow-auto rounded-xl border border-zinc-700 bg-zinc-900 p-4 shadow-lg',
				className
			]}
			transition:fade={{ duration: 250, delay: 50 }}
		>
			<div class="mb-3 flex items-center justify-between">
				<h2 class="text-xl font-medium text-white">{title}</h2>
				<button
					class="p-1 text-gray-400 hover:text-[#EB3912]"
					onclick={handleClose}
					aria-label="Close"
				>
					<X size={20} />
				</button>
			</div>

			<div class="px-1">
				{@render children()}
			</div>
		</div>
	</div>
{/if}
