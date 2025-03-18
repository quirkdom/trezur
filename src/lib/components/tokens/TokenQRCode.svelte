<script>
	import { encodeQR } from '@paulmillr/qr';
	import Modal from '../ui/Modal.svelte';

	/**
	 * @type {{ open: boolean, token: import('otpauth').TOTP | import('otpauth').HOTP }}
	 */
	let { open = $bindable(false), token } = $props();

	// let open = $state(true);

	// Generate QR code SVG
	// TODO: This might need to be reactive since for HOTPs, the token counter will change.
	const qrSvg = encodeQR(token.toString(), 'svg');
</script>

<Modal bind:open title={`QR Code for ${token.issuer || token.label}`}>
	<div class={'flex flex-col items-center p-4'}>
		{#if qrSvg}
			<div class="container rounded-lg bg-white p-4">
				{@html qrSvg}
			</div>
			<p class="mt-4 text-center text-sm text-zinc-400">
				Scan this QR code with another authenticator app
			</p>
		{:else}
			<p class="text-zinc-400">Unable to generate QR code.</p>
		{/if}
	</div>
</Modal>
