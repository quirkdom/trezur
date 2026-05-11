<script>
	import { tokensContext } from '$lib/state/tokens.svelte';
	import { devconsole } from '$lib/utils';
	import NumberFlow, { NumberFlowGroup } from '@number-flow/svelte';
	import { ClipboardCopy, EllipsisVertical, QrCode, Trash2 } from '@lucide/svelte';
	import { TOTP } from 'otpauth';
	import { onMount } from 'svelte';
	import Editable from '../ui/Editable.svelte';
	import TokenQrCode from './TokenQRCode.svelte';

	const { id, digits, account, secret, period, issuer, algorithm, showNextCode } = $props();

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

			/*
    			Note: Normally these codes change once in the token.period. But, we need to calculate these every
                second because the browser might suspend JS, and on resume we need these to be up to date.
			*/
			code = token.generate();
			nextCode = token.generate({ timestamp: Date.now() + period * 1000 });
		}, 1000);

		return () => clearInterval(secondsTicker);
	});

	let showCopyAnimation = $state(false);
	let showTokenQRModal = $state(false);

	/**
	 * @typedef {import('$lib/types').Tokenable} Tokenable
	 * @param {Partial<{[key in keyof Tokenable]: Tokenable[key]}>} updates The updates to apply.
	 */
	function handleUpdate(updates) {
		if (!tokensContext.current) {
			devconsole.warn('App without valid Tokens context. Attempts to update token will fail.');
			return;
		}
		tokensContext.current.updateToken(id, updates);
	}

	function handleDelete() {
		if (!tokensContext.current) {
			devconsole.warn('App without valid Tokens context. Attempts to delete token will fail.');
			return;
		}

		confirm(`Are you sure you want to delete the ${issuer || account} token?`) && tokensContext.current.removeToken(id);
	}

	function copyCodeToClipboard() {
		navigator.clipboard.writeText(code);
		showCopyAnimation = true;
		setTimeout(() => (showCopyAnimation = false), 750);
	}

	/**
	 * Handles the click event on the card.
	 * Copies the token code to the clipboard if the click was not on a button or contenteditable element.
	 * @param {MouseEvent} event
	 */
	function handleCardClick(event) {
		if (
			event.target instanceof Element &&
			(event.target.closest('button') || event.target.closest('[contenteditable]'))
		)
			return; // let event propagate

		copyCodeToClipboard();
	}

	/**
	 * Handles the keydown event on the card for accessibility.
	 * Copies the token code to the clipboard if Enter or Space is pressed.
	 * @param {KeyboardEvent} event
	 */
	function handleCardKeydown(event) {
		if (event.target instanceof HTMLElement && (event.target.tagName === 'INPUT' || event.target.isContentEditable))
			return; // let event propagate

		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			copyCodeToClipboard();
		}
	}
</script>

<div
	class={[
		'border-zinc-800 p-0.5',
		showCopyAnimation &&
			'animate-ring rounded-xl bg-conic/[from_var(--ring-angle)] from-black from-80% via-[#EB3912] via-90% to-black to-100%'
	]}
>
	<div
		class="relative space-y-2 rounded-xl bg-zinc-900 p-4"
		onclick={handleCardClick}
		onkeydown={handleCardKeydown}
		tabindex="0"
		role="button"
		aria-label="Copy {issuer} code to clipboard"
	>
		<!-- Row-1 : Show token details & countdown -->
		<div class="flex items-start justify-between">
			<div>
				<Editable
					value={issuer}
					onEdit={(/** @type {string} */ val) => handleUpdate({ issuer: val })}
					class="max-w-75 truncate text-lg font-medium text-white"
				/>
				{#if account.length > 40}
					<Editable
						value={account}
						onEdit={(/** @type {string} */ val, /** @type {string} */ prev) => handleUpdate({ account: val || prev })}
						class="max-w-75 overflow-hidden"
					>
						<div class="animate-marquee text-sm whitespace-nowrap text-zinc-500">
							{account}
						</div>
					</Editable>
				{:else}
					<Editable
						value={account}
						onEdit={(/** @type {string} */ val, /** @type {string} */ prev) => handleUpdate({ account: val || prev })}
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
					<NumberFlow format={{ minimumIntegerDigits: token.digits, useGrouping: false }} value={code} />
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
				{#if showCopyAnimation}
					<div class="absolute right-0 bottom-0 flex p-1.5 text-[#EB3912] transition duration-300 ease-in-out">
						<ClipboardCopy size={20} />
						<span class="sr-only">{issuer} token code copied to clipboard.</span>
					</div>
				{:else}
					<!-- Main button (Ellipsis) - hidden on hover and on touch screens -->
					<button
						class="rounded-lg p-1.5 text-zinc-500 opacity-50 transition duration-300 group-hover:invisible group-hover:opacity-0 touch-device:hidden"
					>
						<EllipsisVertical size={20} />
						<span class="sr-only">Edit {issuer} token</span>
					</button>
					<!-- Expanded buttons (QR, Copy and Delete) - visible on hover or always on touch screens -->
					<div
						class="touch-device:border-envelope absolute right-0 bottom-0 flex text-zinc-500 opacity-0 transition duration-500 ease-in-out group-hover:opacity-100 touch-device:static touch-device:opacity-100"
					>
						<button
							class="rounded-l-lg bg-zinc-800 p-1.5 opacity-70 transition duration-300 ease-in-out hover:text-[#EB3912] hover:opacity-100 touch-device:border-y touch-device:border-l touch-device:border-[#EB3912]"
							onclick={() => (showTokenQRModal = true)}
						>
							<QrCode size={20} />
							<span class="sr-only">Show QR code for {issuer} token</span>
						</button>
						<button
							class={[
								'bg-zinc-800 p-1.5 transition duration-300 ease-in-out touch-device:border-y touch-device:border-[#EB3912]',
								showCopyAnimation ? 'text-[#EB3912] opacity-100' : 'opacity-70 hover:text-[#EB3912] hover:opacity-100'
							]}
							onclick={copyCodeToClipboard}
						>
							<ClipboardCopy size={20} />
							<span class="sr-only">Copy {issuer} token code</span>
						</button>
						<button
							class="rounded-r-lg bg-zinc-800 p-1.5 opacity-70 transition duration-300 ease-in-out hover:text-[#EB3912] hover:opacity-100 touch-device:border-y touch-device:border-r touch-device:border-[#EB3912]"
							onclick={handleDelete}
						>
							<Trash2 size={20} />
							<span class="sr-only">Delete {issuer} token</span>
						</button>
					</div>
				{/if}
			</div>
		</div>
	</div>
</div>

<!-- QR Code Modal -->
<TokenQrCode bind:open={showTokenQRModal} {token} />

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
		<NumberFlow value={remaining} class="absolute inset-0 flex items-center justify-center text-xs" />
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

	@property --ring-angle {
		syntax: '<angle>';
		initial-value: 0deg;
		inherits: false;
	}
	@keyframes ring-rotation {
		from {
			--ring-angle: 0deg;
		}
		to {
			--ring-angle: 360deg;
		}
	}
	.animate-ring {
		animation: ring-rotation 750ms cubic-bezier(0, 0, 0.2, 1);
	}
</style>
