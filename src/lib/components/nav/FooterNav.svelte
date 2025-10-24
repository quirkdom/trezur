<script>
	import { page } from '$app/state';
	import { Cog, Lock, LockOpen, Settings } from 'lucide-svelte';
	import { longpress } from '$lib/utils/interactions';
	import { useConditionsContext } from '$lib/state/conditions.svelte';

	/** @type {{toggleAppLockAction?: (willLockApp: boolean) => void}} */
	let { toggleAppLockAction = undefined } = $props();

	const conditionsContext = useConditionsContext();
	const conditions = $derived(conditionsContext.getConditions());

	let currentTab = $derived(page.url.pathname === '/settings' ? 'settings' : 'tokens');
	let isBeingLongPressed = $state(false);

	function toggleAppLock() {
		toggleAppLockAction?.(!conditions.isAppLocked);
		conditionsContext.updateCondition('isAppLocked', !conditions.isAppLocked);
	}
</script>

<nav
	class="fixed inset-x-0 bottom-6 mx-auto flex max-w-sm justify-center gap-32 rounded-3xl border-b-2 border-[#EB3912] bg-black/50 p-4 backdrop-blur-sm"
>
	<a href="/">
		<!-- TODO: Move to Tailwind theming -->
		<button
			class="flex flex-col items-center"
			class:text-[#EB3912]={currentTab === 'tokens'}
			class:text-zinc-500={currentTab !== 'tokens'}
		>
			<div
				{@attach longpress()}
				onlongpressstart={() => (isBeingLongPressed = true)}
				onlongpressend={() => (isBeingLongPressed = false)}
				onlongpress={toggleAppLock}
				class:animate-wiggle={isBeingLongPressed}
			>
				{#if conditions.isAppLocked}
					<Lock size={24} />
				{:else}
					<LockOpen size={24} />
				{/if}
			</div>
			<span class="mt-1 text-sm">Codes</span>
		</button>
	</a>
	<a href="/settings">
		<!-- TODO: Move to Tailwind theming -->
		<button
			class="flex flex-col items-center"
			class:text-[#EB3912]={currentTab === 'settings'}
			class:text-zinc-500={currentTab !== 'settings'}
		>
			<div class="transition duration-800 ease-in-out hover:rotate-90">
				{#if conditions.isAppleDevice}
					<Cog size={24} />
				{:else}
					<Settings size={24} />
				{/if}
			</div>
			<span class="mt-1 text-sm">Settings</span>
		</button>
	</a>
</nav>

<style>
	@keyframes wiggle {
		0%,
		100% {
			transform: rotate(0deg);
		}
		25% {
			transform: rotate(-10deg);
			scale: 120%;
		}
		75% {
			transform: rotate(10deg);
			scale: 120%;
		}
	}
	.animate-wiggle {
		animation: wiggle 0.25s ease-in-out infinite;
	}
</style>
