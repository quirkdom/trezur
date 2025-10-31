<script>
	import Modal from '../ui/Modal.svelte';

	/**
	 * @type {{ open: boolean, token: import('otpauth').TOTP | import('otpauth').HOTP }}
	 */
	let { open = $bindable(false), token } = $props();

	const qrSvg = $derived(open && import('qr').then(({ encodeQR }) => encodeQR(token.toString(), 'svg')));
</script>

<Modal bind:open title={`QR Code for ${token.issuer || token.label}`}>
	<div class="flex flex-col items-center p-4">
		{#await qrSvg then qrSvg}
			{#if qrSvg}
				<div class="container rounded-lg bg-white p-4">
					<!-- eslint-disable-next-line svelte/no-at-html-tags : This is ok because we trust the SVG element from the 'qr' lib. -->
					{@html qrSvg}
				</div>
				<p class="mt-4 text-center text-sm text-zinc-400">Scan this QR code with another authenticator app</p>
			{:else}
				<p class="text-zinc-400">Unable to generate QR code.</p>
			{/if}
		{:catch error}
			<div class="rounded-lg bg-red-900/30 p-3 text-red-400">
				Error generating QR code: {error instanceof Error ? error.message : error}
			</div>
		{/await}
	</div>
</Modal>
