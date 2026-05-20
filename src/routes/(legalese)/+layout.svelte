<script>
	import { onMount } from 'svelte';
	import '../../app.css';
	import { resolve } from '$app/paths';

	onMount(() => {
		const cryptMailHandler = (/** @type {Event} */ event) => {
			event.preventDefault();

			const t = /** @type {HTMLAnchorElement} */ (event.currentTarget);

			let v = t.dataset.t + '\u002E' + t.dataset.d + '\u0040' + t.dataset.u;
			v = v.split('').reverse().join('');

			const linkhref = 'mailto:' + v;
			t.setAttribute('href', linkhref);
			window.location.href = linkhref;
		};

		document.querySelectorAll('.crypt-mail').forEach((e) => {
			e.addEventListener('click', cryptMailHandler);
		});

		return () => {
			document.querySelectorAll('.crypt-mail').forEach((e) => {
				e.removeEventListener('click', cryptMailHandler);
			});
		};
	});

	const { children } = $props();
</script>

<div class="min-h-screen bg-black p-4 text-white">
	<div class="mx-auto flex min-h-dvh max-w-md flex-col lg:max-w-2xl xl:max-w-3xl">
		<div class="flex-1">
			{@render children()}
		</div>

		<footer class="mt-6 -mb-3 flex justify-center gap-2 text-xs text-zinc-500">
			© 2026 Quirkdom
			<span>·</span>
			<a href={resolve('/privacy')} class="hover:text-zinc-400">Privacy</a>
			<span>·</span>
			<a href={resolve('/terms')} class="hover:text-zinc-400">Terms</a>
		</footer>
	</div>
</div>

<style>
	:global(.crypt-mail) {
		cursor: pointer;
		color: var(--color-blue-500);
		text-decoration: underline;
	}

	:global(.crypt-mail::after) {
		content: attr(data-t) '\002E' attr(data-d) '\0040' attr(data-u);
		unicode-bidi: bidi-override;
		direction: rtl;
	}
</style>
