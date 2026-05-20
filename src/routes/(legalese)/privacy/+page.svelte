<script>
	import NavActions from '$lib/components/nav/NavActions.svelte';
</script>

<svelte:head>
	<title>Trezur · Privacy Policy</title>
	<meta name="description" content="Trezur Privacy Policy" />
</svelte:head>

<header class="mb-6 flex items-center gap-4">
	<NavActions backButtonTo="/" />
	<h1 class="text-2xl font-medium">Privacy Policy</h1>
</header>

<main class="space-y-6 text-sm leading-relaxed text-zinc-300">
	<section class="space-y-2">
		<p class="text-zinc-400"><strong>Last Updated:</strong> May 20, 2026</p>
		<p>
			Trezur is a product of <a href="https://quirkdom.com" target="_blank" rel="noopener noreferrer"
				><strong>Quirkdom</strong></a
			>. Trezur is a privacy-focused, offline-first, browser-side application designed to generate TOTP and HOTP codes
			for two-factor authentication (2FA). We are committed to your privacy and believe that your security credentials
			should remain entirely under your control.
		</p>
	</section>

	<section class="space-y-2">
		<h3 class="text-base font-medium text-white">1. Data Collection and Usage</h3>
		<p>Trezur operates as a browser-side only web application hosted by Quirkdom. This means:</p>
		<ul class="list-disc space-y-1 pl-5">
			<li>
				<strong>No Personal Data Collection:</strong> We do not collect, store, or process any personal information, usage
				data, or authentication tokens on our servers.
			</li>
			<li>
				<strong>Local Storage:</strong> All 2FA token data is stored locally, encrpyted within your browser's storage. It
				never leaves your device unless you explicitly choose to initiate a backup / sync.
			</li>
			<li>
				<strong>No Trackers:</strong> Our application does not utilize tracking cookies, marketing pixels, or third-party
				behavioral analytics. We may use privacy-first web analytics (such as Cloudflare Web Analytics) to monitor aggregate
				site performance, which does not collect personally identifiable information.
			</li>
		</ul>
	</section>

	<section class="space-y-2">
		<h3 class="text-base font-medium text-white">2. Google Drive Integration</h3>
		<p>
			Trezur offers an optional feature that allows you to back up and sync your encrypted token data to your personal
			Google Drive (stored within a dedicated application data folder).
		</p>
		<ul class="list-disc space-y-1 pl-5">
			<li>
				<strong>How we use Google Data:</strong> If you enable this feature, Trezur requests access only to the
				<strong>Google Drive App Data folder</strong> (the narrowest scope necessary). This scope allows the app to save and
				retrieve your own encrypted backup files.
			</li>
			<li>
				<strong>Encryption of Backups:</strong> Before your data is sent to Google Drive, it is
				<strong>encrypted locally on your device</strong> using industry-standard encryption protocols. This means that even
				within your Google Drive, the file remains encrypted and protected by your own passphrase, providing an additional
				layer of security separate from the encryption provided by Google Drive itself.
			</li>
			<li>
				<strong>No Access to Other Files:</strong> Our application does not have access to any other files in your Google
				Drive or any other personal Google account data (such as Gmail, Calendar, or Contacts).
			</li>
			<li>
				<strong>Data Handling:</strong> Quirkdom does not store, process, or transmit your Google OAuth access tokens or any
				of your authentication secrets on our servers. The synchronization process occurs directly between your browser and
				the Google Drive API.
			</li>
		</ul>
	</section>

	<section class="space-y-2">
		<h3 class="text-base font-medium text-white">3. Data Security</h3>
		<ul class="list-disc space-y-1 pl-5">
			<li><strong>Encryption at Rest:</strong> All token data stored within your browser is encrypted locally.</li>
			<li>
				<strong>Client-Side Architecture:</strong> Because Trezur is a web application that runs entirely within your browser,
				no data is sent back to our hosting infrastructure (Cloudflare Pages/Workers) during normal operation.
			</li>
		</ul>
	</section>

	<section class="space-y-2">
		<h3 class="text-base font-medium text-white">4. Changes to This Policy</h3>
		<p>
			We may update this Privacy Policy from time to time to reflect changes in our practices or legal obligations. We
			will notify you of any significant changes by updating the "Last Updated" date at the top of this page.
		</p>
	</section>

	<section class="space-y-2">
		<h3 class="text-base font-medium text-white">5. Contact</h3>
		<p>
			If you have any questions or concerns regarding this Privacy Policy or how Trezur handles your data, please
			contact us at:
			<!-- svelte-ignore a11y_invalid_attribute (This is intentional; for security) -->
			<a
				href="javascript:"
				aria-label="contact email"
				class="crypt-mail"
				data-t="moc"
				data-d="modkriuq"
				data-u="tcatnoc"
			></a>
		</p>
	</section>
</main>
