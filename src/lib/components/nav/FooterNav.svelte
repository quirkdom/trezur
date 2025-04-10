<script>
	import { page } from '$app/state';
	import { Cog, Lock, LockOpen, Settings } from 'lucide-svelte';
	import { slide } from 'svelte/transition';

	let { isLocked, isAppleDevice } = $props();
	let currentTab = $derived(page.url.pathname === '/settings' ? 'settings' : 'tokens');
</script>

<nav
	class="fixed inset-x-0 bottom-6 mx-auto flex max-w-sm justify-center gap-32 rounded-3xl border-b-2 border-[#EB3912] bg-black/50 p-4 backdrop-blur-sm"
>
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
				{#if isAppleDevice}
					<Cog size={24} />
				{:else}
					<Settings size={24} />
				{/if}
			</div>
			<span class="mt-1 text-sm">Settings</span>
		</button>
	</a>
</nav>
