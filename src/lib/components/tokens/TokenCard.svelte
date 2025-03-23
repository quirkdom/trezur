<script>
	import { useTokensContext } from '$lib/state/tokens.svelte';
	import NumberFlow, { NumberFlowGroup } from '@number-flow/svelte';
	import { ClipboardCopy, EllipsisVertical, QrCode, Trash2 } from 'lucide-svelte';
	import { TOTP } from 'otpauth';
	import { onMount } from 'svelte';
	import Editable from '../ui/Editable.svelte';
	import TokenQrCode from './TokenQRCode.svelte';

	const { id, digits, account, secret, period, issuer, algorithm, showNextCode } = $props();

	const tokensContext = useTokensContext();

	// Generate code, and setup ticker for every period
	const token = $derived(
		new TOTP({
			secret,
			issuer,
			label: account,
			algorithm,
			digits,
			period
		})
	);

	/*
	   It's ok to ignore this warning because we are updating the state manually using onMount -> secondsTicker.
	*/
	// svelte-ignore state_referenced_locally
	let code = $state(token.generate());
	// svelte-ignore state_referenced_locally
	let nextCode = $state(token.generate({ timestamp: Date.now() + period * 1000 }));
	// svelte-ignore state_referenced_locally
	let remaining = $state(token.period - (Math.floor(Date.now() / 1000) % token.period));

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

	let showTokenQRModal = $state(false);

	function handleDelete() {
		confirm(`Are you sure you want to delete the ${issuer || account} token?`) &&
			tokensContext.current?.removeToken(id);
	}
</script>

<div class="relative space-y-2 rounded-xl bg-zinc-900 p-4">
	<!-- Row-1 : Show token details & countdown -->
	<div class="flex items-start justify-between">
		<div>
			<Editable
				value={issuer}
				onEdit={(/** @type {string} */ val) =>
					tokensContext.current?.updateToken(id, { issuer: val })}
				class="max-w-[300px] truncate text-lg font-medium text-white"
			/>
			{#if account.length > 40}
				<Editable
					value={account}
					onEdit={(/** @type {string} */ val, /** @type {string} */ prev) => {
						tokensContext.current?.updateToken(id, { account: val || prev }); // Account (token label) cannot be empty
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
					onEdit={(/** @type {string} */ val, /** @type {string} */ prev) => {
						tokensContext.current?.updateToken(id, { account: val || prev }); // Account (token label) cannot be empty
					}}
					class="text-sm text-zinc-500"
				/>
			{/if}
		</div>
		{@render CircleTimer()}
	</div>

	<!-- Row-2: Show token code & options -->
	<div class="flex items-end justify-between">
		<!-- Show the actual codes -->
		<div class="font-mono text-3xl tracking-wider">
			<NumberFlowGroup>
				<NumberFlow
					format={{ minimumIntegerDigits: token.digits, useGrouping: false }}
					value={code}
				/>
				{#if showNextCode}
					<span
						class={[
							'transition-colors duration-1500 ease-linear',
							remaining > 10 ? 'text-gray-400' : 'animate-pulse text-[#EB3912]'
						]}>≪</span
					>
					<NumberFlow
						format={{ minimumIntegerDigits: token.digits, useGrouping: false }}
						value={nextCode}
						class="text-2xl text-gray-400"
					/>
				{/if}
			</NumberFlowGroup>
		</div>

		<!-- Actions button group with hover effect -->
		<div class="group relative mb-1">
			<!-- Main button (Ellipsis) - hidden on hover and on touch screens -->
			<button
				class="touch-device:hidden rounded-lg p-1.5 text-zinc-500 opacity-50 transition duration-300 group-hover:invisible group-hover:opacity-0"
			>
				<EllipsisVertical size={20} />
				<span class="sr-only">Edit {issuer} token</span>
			</button>
			<!-- Expanded buttons (QR, Copy and Delete) - visible on hover or always on touch screens -->
			<div
				class="touch-device:static touch-device:border-envelope touch-device:opacity-100 absolute right-0 bottom-0 flex text-zinc-500 opacity-0 transition duration-500 ease-in-out group-hover:opacity-100"
			>
				<button
					class="touch-device:border-l touch-device:border-y touch-device:border-[#EB3912] rounded-l-lg bg-zinc-800 p-1.5 opacity-70 transition duration-300 ease-in-out hover:text-[#EB3912] hover:opacity-100"
					onclick={() => (showTokenQRModal = true)}
				>
					<QrCode size={20} />
					<span class="sr-only">Show QR code for {issuer} token</span>
				</button>
				<button
					class="touch-device:border-y touch-device:border-[#EB3912] bg-zinc-800 p-1.5 opacity-70 transition duration-300 ease-in-out hover:text-[#EB3912] hover:opacity-100"
					onclick={() => navigator.clipboard.writeText(code)}
				>
					<ClipboardCopy size={20} />
					<span class="sr-only">Copy {issuer} token code</span>
				</button>
				<button
					class="touch-device:border-y touch-device:border-r touch-device:border-[#EB3912] rounded-r-lg bg-zinc-800 p-1.5 opacity-70 transition duration-300 ease-in-out hover:text-[#EB3912] hover:opacity-100"
					onclick={handleDelete}
				>
					<Trash2 size={20} />
					<span class="sr-only">Delete {issuer} token</span>
				</button>
			</div>
		</div>
	</div>

	<!-- QR Code Modal -->
	<TokenQrCode bind:open={showTokenQRModal} {token} />
</div>

{#snippet CircleTimer()}
	<div class="relative mt-1 h-8 w-8">
		<svg class="h-full w-full -rotate-90 transform">
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
		<NumberFlow
			value={remaining}
			class="absolute inset-0 flex items-center justify-center text-xs"
		/>
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
