<script>
	import { LoaderCircle, LoaderPinwheel } from '@lucide/svelte';

	let { isLoading = false, delay = 300, isAppleDevice = false, children } = $props();

	let showSpinner = $state(false);

	// $inspect('showSpinner', showSpinner, 'at', Date.now());

	$effect(() => {
		if (isLoading) {
			const appearanceTimer = setTimeout(() => {
				showSpinner = true;
			}, delay);

			return () => {
				clearTimeout(appearanceTimer);
				showSpinner = false;
			};
		}
	});
</script>

{#if showSpinner}
	<div class="space-y-4 px-4">
		{#if isAppleDevice}
			<LoaderPinwheel
				class="mx-auto h-16 w-16 animate-spin p-4 opacity-70 transition-transform [animation-duration:1.25s]"
			/>
		{:else}
			<LoaderCircle
				class="mx-auto h-16 w-16 animate-spin p-4 opacity-70 transition-transform [animation-duration:1.25s]"
			/>
		{/if}
		{@render children?.()}
	</div>
{/if}
