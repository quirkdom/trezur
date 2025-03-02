<script>
	import { Settings2 } from 'lucide-svelte';
	import { TOTP } from 'otpauth';
	import { onMount } from 'svelte';
	import Editable from '../ui/Editable.svelte';

	const { digits, account, secret, period, issuer, algorithm, showNextCode } = $props();

	// Generate code, and setup ticker for every period
	const token = new TOTP({
		secret,
		issuer,
		label: account,
		algorithm,
		digits,
		period
	});

	let code = $state(token.generate());
	let nextCode = $state(token.generate({ timestamp: Date.now() + period * 1000 }));
	let remaining = $state(token.period - (Math.floor(Date.now() / 1000) % token.period));

	// $inspect('account / issuer update', account, issuer);
	// $inspect('code update', code, nextCode);

	onMount(() => {
		const secondsTicker = setInterval(() => {
			remaining = token.period - (Math.floor(Date.now() / 1000) % token.period);

			if (remaining === token.period) {
				code = token.generate();
				nextCode = token.generate({ timestamp: Date.now() + period * 1000 });
			}
		}, 1000);

		return () => clearInterval(secondsTicker);
	});
</script>

<div class="relative mb-4 rounded-xl bg-zinc-900 p-4">
	<div class="mb-2 flex items-start justify-between">
		<div>
			<Editable
				value={issuer}
				onEdit={(/** @type {string} */ val) => {
					console.log('Issuer updated', val); // TODO
				}}
				class="max-w-[300px] truncate text-lg font-medium text-white"
			/>
			{#if account.length > 40}
				<Editable
					value={account}
					onEdit={(/** @type {string} */ val) => {
						console.log('Account updated', val); // TODO
					}}
					class="max-w-[300px] overflow-hidden"
				>
					<div class="animate-marquee text-sm whitespace-nowrap text-zinc-500">
						{account}
					</div>
				</Editable>
			{:else}
				<Editable
					value={account}
					onEdit={(/** @type {string} */ val) => {
						console.log('Account updated', val); // TODO
					}}
					class="text-sm text-zinc-500"
				/>
			{/if}
		</div>
		{@render CircleTimer()}
	</div>
	<div class="font-mono text-3xl tracking-wider">
		<span>{code}</span>
		{#if showNextCode}
			<span
				class={[
					'transition-colors duration-1500 ease-linear',
					remaining > 10 ? 'text-gray-400' : 'animate-pulse text-[#EB3912]'
				]}>≪</span
			>
			<span class="text-2xl text-gray-400">{nextCode}</span>
		{/if}
	</div>
	<button
		class="absolute right-4 bottom-4 rounded-lg p-1.5 text-zinc-500 opacity-25 transition duration-500 hover:bg-zinc-800 hover:text-[#EB3912] hover:opacity-100"
	>
		<!-- TODO: Glue Edit Token modal -->
		<Settings2 size={20} />
		<span class="sr-only">Edit {issuer} token</span>
	</button>
</div>

{#snippet CircleTimer()}
	<div class="relative h-8 w-8">
		<svg class="h-full w-full -rotate-90 transform">
			<circle
				cx="16"
				cy="16"
				r="14"
				stroke="currentColor"
				stroke-width="2"
				fill="none"
				class="text-zinc-900"
			/>
			<circle
				cx="16"
				cy="16"
				r="14"
				stroke="currentColor"
				stroke-width="2"
				fill="none"
				stroke-dasharray="87.96"
				stroke-dashoffset={87.96 * (1 - remaining / token.period)}
				stroke-linecap="round"
				class="text-[#EB3912]"
			/>
		</svg>
		<div class="absolute inset-0 flex items-center justify-center text-xs">
			{remaining}
		</div>
	</div>
{/snippet}

<style>
	@keyframes marquee {
		0% {
			transform: translateX(0);
		}
		100% {
			transform: translateX(-100%);
		}
	}
	.animate-marquee {
		animation: marquee 10s linear infinite;
		transform: translateX(0);
	}
	.animate-marquee:not(:hover) {
		animation-play-state: paused;
	}
</style>
