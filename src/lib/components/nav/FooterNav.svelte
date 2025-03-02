<script>
	import { page } from '$app/state';
	import { Lock, LockOpen, Settings } from 'lucide-svelte';
	import { slide } from 'svelte/transition';

	let { isLocked } = $props();

	let currentTab = $derived(page.url.pathname === '/settings' ? 'settings' : 'tokens');
</script>

<nav class="fixed inset-x-0 bottom-8 flex items-center justify-center gap-32">
	<a href="/">
		<button
			class="flex flex-col items-center"
			class:text-[#EB3912]={currentTab === 'tokens'}
			class:text-zinc-500={currentTab !== 'tokens'}
		>
			<!-- <div class="hover:animate-wiggle"> -->
			{#if isLocked}
				<div transition:slide={{ axis: 'y' }}>
					<Lock size={24} />
				</div>
			{:else}
				<div transition:slide={{ axis: 'y' }}>
					<LockOpen size={24} />
				</div>
			{/if}
			<!-- </div> -->

			<span class="mt-1 text-sm">Codes</span>
		</button>
	</a>
	<a href="/settings">
		<!-- TODO: Move to theming -->
		<button
			class="flex flex-col items-center"
			class:text-[#EB3912]={currentTab === 'settings'}
			class:text-zinc-500={currentTab !== 'settings'}
		>
			<div class="transition duration-800 ease-in-out hover:rotate-90">
				<Settings size={24} />
			</div>
			<span class="mt-1 text-sm">Settings</span>
		</button>
	</a>

	<!-- <button class="border-4 p-3" onclick={() => (isUnlocked = !isUnlocked)}>
		{isUnlocked ? '🔒' : '🔓'}
	</button> -->
</nav>

<!-- <style lang="postcss">
	@reference "../../../app.css";

	@theme {
		--animate-wiggle: wiggle 1s ease-in-out infinite;

		@keyframes wiggle {
			0%,
			100% {
				transform: rotate(-30deg);
			}
			50% {
				transform: rotate(30deg);
			}
		}
	}
</style> -->
