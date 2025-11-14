# TODOs

Individual files have small, inline TODO reminders.

## Bugs

- [x] (P0) Fix repeated tokens context init and re-init (upto 5 times consecutively now) on page load, when a user passcode is already set.
  - [x] This was fixed by removing manual `await encryptedLocalStorage.init(passcode);` in [UnlockScreen.svelte#handleUnlock](src/lib/components/passcode/UnlockScreen.svelte)
  - [x] However, the fix surfaced that whenever we do changes to passcode (e.g. in settings page, or on unlock), we often also manually init the storage instance. This is then duplicated by effects in [src/routes/+page.svelte](src/routes/+page.svelte) and [src/routes/+layout.svelte](src/routes/+layout.svelte). We need to either remove init/syncing effects entirely and move to manual calls **_OR_** figure out how to wait for the storage instance to be ready before running side-effects of setting/changing passcode.

- [x] (P0 🚨) User passcode can be bypassed by simply dismissing password prompt, and long pressing the lock icon. 🤦‍♂️

- [x] (P0) Revisit the reset and purge mechanism of Settings -> Purge All and Forgot Passcode -> Reset options
  - [x] Settings -> Purge All: probably fixed. Needed to clear the encrypted storage before resetting conditions, since encrypted storage is inited by an $effect dependent on conditions [see [+layout.svelte](src/routes/+layout.svelte)]
  - [x] Forgot Passcode -> Reset: Needs further investigation. encrypted storage is being inited and reset (and repeat) multiple times unecessarily, through the aforementioned $effect.
    - By the time we try to purge encryptedStorage.current, it has been already set to null by the aforementioned $effect. tokensContext still holds a reference to the old storage instance, but we don't use it. We should probably just investigate the $effect that resets encrypted storage.

- [x] (P0) [Bug: Settings -> Import/Export/Migrate]: If the settings page is directly loaded, there is no tokensContext.current inited. Any imports or exports will _silently_ fail. This is because the $effect that inits tokensContext.current is in the Codes page.
  - [x] We need to either move the $effect to the +layout.svelte or Settings +page.svelte, or we need to manually init tokensContext.current in the settings page.

- [ ] Fix the container layout of the pages to better position and align text content on Codes screen
  - Currently, the header takes up some vertical space and the text container is a flexbox below it, which makes it hard to align the text contents to vertical center of app viewport. This is further complicated by the footer, which is sticky and inset to the bottom.
  - [ ] The right way to go about this is probably to have header, main content and footer all inside a single flexbox container, with the main content growing to eat up all vertical space possible and the header and footer of fixed sizes being fixed at the top and bottom respectively.

- [x] Fix the longpress interaction on the app lock button. The longpress animation keeps on playing even after the longpress event has been triggered, in all browsers except FF.
- [x] Reset Option on Wrong Passcode missing from view
- [x] Refactor how sentinel and encrypted storage metadata is stored
- [x] Maintain focus on Add Token Drawer -> token secret box, when reveal button is clicked.
  - This is especially problematic in mobile, where the keyboard dissapears on lost focus.

- [x] When data is imported from settings page, it adds data into tokensContext state, and then immediately persists it. However after navigating to '/', the $effect to make tokens context in +page.svelte re-runs, which causes #load to run, and that blindly merges persisted data (i.e. tokens that were just persisted) and existing tokens in memory state, resulting in duplicate tokens.
  - [x] Can be possibly solved by de-duping against IDs. But is that a good idea?
    - Currently solved this by deduping on `id` and `secret`. But this should only be a short term solution.
  - [x] What should be a good long term solution to sync persisted data with in-memory state?
    - This was finally solved by updating the $effects in [src/routes/+layout.svelte](src/routes/+layout.svelte) and [src/routes/+page.svelte](src/routes/+page.svelte) to only run and re-initialize token context when the underlying storage actually changes.

### Due to external dependencies

- [x] [number-flow](https://github.com/barvian/number-flow) fails to SSR on cloudflare-pages due to improper esm-env resolution [[issue](https://github.com/barvian/number-flow/issues/45)] [[fix](https://github.com/barvian/number-flow/issues/45#issuecomment-2557244185)]
- [x] svelte-kit v2 uses a vulnerable version of cookie pkg. [[fix](https://github.com/sveltejs/kit/issues/13089#issuecomment-2510265451)]

## Next steps

- [x] Add passcode to encrypt/decrypt tokens (also serves to lock / unlock app)
  - [ ] Investigate WebAuthn / Passkey support. [[Client side WebAuthn](https://github.com/mylofi/webauthn-local-client)]
- [ ] Move settings and conditions to exported global states. Contexts are overkill for that.
- [ ] Setup GDrive [app folder backup](https://developers.google.com/drive/api/guides/appdata)
- [ ] Setup iCloud backup using [CloudKit](https://developer.apple.com/documentation/cloudkit)
- [ ] Most Recently Used sort order
- [ ] Better PWA support
  - [ ] [iOS Tips](https://www.netguru.com/blog/pwa-ios)
  - [ ] [Webmanifest tips](https://web.dev/learn/pwa/web-app-manifest)
  - [ ] PWA Install: [prompt](https://web.dev/learn/pwa/installation-prompt), [install criteria](https://web.dev/articles/install-criteria), [custom install experience](https://web.dev/articles/customize-install)
  - [ ] [PWA Enhacements](https://web.dev/learn/pwa/enhancements)
- [ ] Better UX for touch devices
  - [ ] Implement swipe gestures for token actions
  - [ ] Implement long press for token actions
  - Some resources for that:
    - [MDN contextmenu](https://developer.mozilla.org/en-US/docs/Web/API/Element/contextmenu_event)
    - [Detect touch screens](https://stackoverflow.com/a/63666289/2844164)
    - [Svelte Gestures package](https://github.com/Rezi/svelte-gestures)
- [ ] Standardize CSS across components by making a tailwind theme
  - [ ] Also, look into CSS icons. See [SvelteKit best practices](https://svelte.dev/docs/kit/icons).

## Next Gen

- [ ] Experiments: HDR-supported _ultra-bright_ QR codes.
  - [Demo](https://notes.dt.in.th/HDRQRCode)
  - [SO answer to detect HDR capable displays](https://stackoverflow.com/a/75213217/2844164)
- [ ] Add HOTP token support
- [ ] Service worker for background sync
- [ ] Allow S3 compatible backup
- [ ] Auto-tiling token cards when list is too long and screen space is available
- [ ] Logo support
- [ ] Move to TypeScript
