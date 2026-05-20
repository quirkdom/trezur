<script>
	import NavActions from '$lib/components/nav/NavActions.svelte';
</script>

<svelte:head>
	<title>Trezur · Terms of Service</title>
	<meta name="description" content="Trezur Terms of Service" />
</svelte:head>

<header class="mb-6 flex items-center gap-4">
	<NavActions backButtonTo="/" />
	<h1 class="text-2xl font-medium">Terms of Service</h1>
</header>

<main class="space-y-6 text-sm leading-relaxed text-zinc-300">
	<section class="space-y-2">
		<p class="text-zinc-400"><strong>Last Updated:</strong> May 20, 2026</p>
		<p>
			Welcome to Trezur! By using the Trezur web application (the "Service"), you agree to be bound by these Terms of
			Service. If you do not agree to these terms, please do not use the Service.
		</p>
	</section>

	<section class="space-y-2">
		<h3 class="text-base font-medium text-white">1. Nature of Service</h3>
		<p>
			Trezur is a client-side web application provided by <a
				href="https://quirkdom.com"
				target="_blank"
				rel="noopener noreferrer"><strong>Quirkdom</strong></a
			> to assist users in generating and managing TOTP and HOTP codes for two-factor authentication. The Service is provided
			on an "as-is" and "as-available" basis.
		</p>
	</section>

	<section class="space-y-2">
		<h3 class="text-base font-medium text-white">2. No Warranty</h3>
		<p>
			Quirkdom makes no warranties, express or implied, regarding the reliability, accuracy, or availability of the
			Service. Because the Service operates entirely within your browser and relies on your local storage, we are not
			responsible for any data loss, including but not limited to the loss of your encryption passphrases or the failure
			of your personal cloud backup sync. <strong
				>You are solely responsible for managing and backing up your own data.</strong
			>
		</p>
	</section>

	<section class="space-y-2">
		<h3 class="text-base font-medium text-white">3. Permitted Use and Prohibitions</h3>
		<p>
			Trezur is provided for your personal and professional use. You are welcome to use the Service within your own
			business or organization to assist in managing your two-factor authentication needs.
		</p>
		<p>However, you agree that you will not:</p>
		<ul class="list-disc space-y-1 pl-5">
			<li>
				<strong>Resell or Distribute:</strong> Sell, rent, lease, or charge a fee for access to the Service, in whole or in
				part, to any third party.
			</li>
			<li>
				<strong>Create Derivative Paywalls:</strong> Replicate, clone, "white label," or otherwise incorporate the Service
				into a product or platform that is offered to others behind a paywall or as a commercial service.
			</li>
			<li>
				<strong>Misrepresent Ownership:</strong> Present the Service as being created by, or developed by, any entity other
				than Quirkdom.
			</li>
			<li>
				<strong>Reverse Engineer:</strong> Attempt to derive the source code or modify the Service for the purpose of circumventing
				these restrictions.
			</li>
		</ul>
	</section>

	<section class="space-y-2">
		<h3 class="text-base font-medium text-white">4. Limitation of Liability</h3>
		<p>
			To the maximum extent permitted by applicable law, Quirkdom shall not be liable for any indirect, incidental,
			special, or consequential damages resulting from your use or inability to use the Service, including any loss of
			access to accounts secured by 2FA.
		</p>
	</section>

	<section class="space-y-2">
		<h3 class="text-base font-medium text-white">5. User Responsibility for Security</h3>
		<p>
			While Trezur provides tools for encryption, you are responsible for maintaining the confidentiality of your
			passphrases and ensuring the security of the devices on which you use the Service. Quirkdom has no access to your
			tokens, keys, or data; therefore, we cannot recover them for you if lost.
		</p>
	</section>

	<section class="space-y-2">
		<h3 class="text-base font-medium text-white">6. Changes to Terms</h3>
		<p>
			We reserve the right to modify these terms at any time. Continued use of the Service following any changes
			constitutes your acceptance of the new Terms of Service.
		</p>
	</section>

	<section class="space-y-2">
		<h3 class="text-base font-medium text-white">7. Contact</h3>
		<p>
			If you have questions regarding these terms, please contact us at
			<!-- svelte-ignore a11y_invalid_attribute (This is intentional; for security) -->
			<a
				href="javascript:"
				aria-label="contact email"
				class="crypt-mail"
				data-t="moc"
				data-d="modkriuq"
				data-u="tcatnoc"
			></a>.
		</p>
	</section>
</main>
