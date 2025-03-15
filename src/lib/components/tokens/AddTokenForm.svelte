<script>
	import { Eye, EyeOff, ScanQrCode } from 'lucide-svelte';
	import Drawer from '../ui/Drawer.svelte';

	let { onAddToken, open = $bindable(false) } = $props();

	let showCamera = $state(false);
	let showSecret = $state(false);
	let issuer = $state('');
	let account = $state('');
	let secret = $state('');

	/** @type {HTMLVideoElement | undefined} */
	let videoElement = $state();
	/** @type {MediaStream | undefined} */
	let stream = $state();

	function close() {
		open = false; // This will update the parent's binding

		issuer = '';
		account = '';
		secret = '';

		if (stream) {
			stream.getTracks().forEach((track) => track.stop());
			stream = undefined;
		}
		showCamera = false;
	}

	async function startCamera() {
		showCamera = true;
		try {
			stream = await navigator.mediaDevices.getUserMedia({
				video: { facingMode: 'environment' }
			});
			if (videoElement) {
				videoElement.srcObject = stream;
			}
		} catch (err) {
			console.error('Error accessing camera:', err);
			showCamera = false;
		}
	}

	/**
	 * @param {SubmitEvent} event
	 */
	function handleSubmit(event) {
		event.preventDefault();
		onAddToken?.({ issuer, account, secret });
		close();
	}
</script>

<Drawer bind:open title="Add Token" onClose={close} class="mx-auto max-w-lg">
	{#if showCamera}
		<div class="mb-6 overflow-hidden rounded-lg bg-black">
			<video muted bind:this={videoElement} autoplay playsinline class="h-64 w-full object-cover"
			></video>
		</div>
	{:else}
		<button
			class="mb-6 flex w-full items-center justify-center gap-2 rounded-lg bg-zinc-800 py-4 text-white transition-colors hover:bg-zinc-700"
			onclick={startCamera}
		>
			<ScanQrCode size={20} />
			<span>Scan QR Code</span>
		</button>
	{/if}

	<!-- Form -->
	<form onsubmit={handleSubmit} class="space-y-4">
		<div>
			<label for="issuer" class="mb-1 block text-sm text-gray-400">Issuer (Optional)</label>
			<input
				id="issuer"
				type="text"
				placeholder="Service name"
				bind:value={issuer}
				class="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white placeholder-zinc-500 focus:border-[#EB3912] focus:outline-none"
			/>
		</div>

		<div>
			<label for="account" class="mb-1 block text-sm text-gray-400">Account</label>
			<input
				id="account"
				type="text"
				required
				placeholder="username@example.com"
				bind:value={account}
				class="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white placeholder-zinc-500 focus:border-[#EB3912] focus:outline-none"
			/>
		</div>

		<div>
			<label for="secret" class="mb-1 block text-sm text-gray-400">Secret</label>
			<div class="relative">
				<input
					id="secret"
					type={showSecret ? 'text' : 'password'}
					required
					placeholder="Enter token secret"
					bind:value={secret}
					class="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white placeholder-zinc-500 focus:border-[#EB3912] focus:outline-none"
				/>
				<button
					type="button"
					class="absolute top-1/2 right-2 -translate-y-1/2 text-gray-400 hover:text-white"
					onclick={() => (showSecret = !showSecret)}
				>
					{#if showSecret}
						<EyeOff size={20} />
					{:else}
						<Eye size={20} />
					{/if}
				</button>
			</div>
		</div>

		<div class="mt-6 flex gap-4">
			<button
				type="button"
				class="flex-1 rounded-lg bg-zinc-800 py-3 text-white transition-colors hover:bg-zinc-700"
				onclick={close}
			>
				Cancel
			</button>
			<button
				type="submit"
				class="flex-1 rounded-lg bg-[#EB3912] py-3 text-white transition-colors hover:bg-[#D83511]"
			>
				Add
			</button>
		</div>
	</form>
</Drawer>
