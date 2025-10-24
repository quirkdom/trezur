# TODOs

Individual files have small, inline TODO reminders.

## Bugs

- [ ] (P0) Fix repeated tokens context init and re-init (upto 5 times consecutively now) on page load, when a user passcode is already set.

  - [x] This was fixed by removing manual `await encryptedLocalStorage.init(passcode);` in [UnlockScreen.svelte#handleUnlock](src/lib/components/UnlockScreen.svelte#L17)
  - [ ] However, the fix surfaced that whenever we do changes to passcode (e.g. in settings page, or on unlock), we often also manually init the storage instance. This is then duplicated by effects in [src/routes/+page.svelte](src/routes/+page.svelte) and [src/routes/+layout.svelte](src/routes/+layout.svelte). We need to either remove init/syncing effects entirely and move to manual calls **_OR_** figure out how to wait for the storage instance to be ready before running side-effects of setting/changing passcode.

- [ ] (P0) [Hard to repro] Sometimes, after running the dev server after a long break, on initial load, the app wipes out tokens stored in encrypted local storage.

  - Example error trace:

    ```
    Tokens context initializing with new storage.
    Decryption failed: DOMException: The operation failed for an operation-specific reason encrypted-storage.js:116:12
        get encrypted-storage.js:116
        #load tokens.svelte.js:51
        make tokens.svelte.js:37
        iMake tokens.svelte.js:168
        _page +page.svelte:46
        _page +page.svelte:64
        update_reaction runtime.js:292
        update_effect runtime.js:472
        flush_queued_effects batch.js:604
        process batch.js:179
        flush_effects batch.js:559
        flush batch.js:290
        ensure batch.js:413
        run_all utils.js:45
        run_micro_tasks task.js:10
        queue_micro_task task.js:28
        (Async: VoidFunction)
        queue_micro_task task.js:19
        enqueue batch.js:423
        ensure batch.js:407
        internal_set sources.js:183
        set sources.js:162
        set proxy.js:302
        init storage.svelte.js:25
        _layout +layout.svelte:33
        update_reaction runtime.js:292
        update_effect runtime.js:472
        flush_queued_effects batch.js:604
        process batch.js:179
        flush_effects batch.js:559
        flush batch.js:290
        ensure batch.js:413
        run_all utils.js:45
        run_micro_tasks task.js:10
        flush_tasks task.js:40
        flushSync batch.js:500
        Svelte4Component legacy-client.js:127
        <anonymous> legacy-client.js:54
        initialize client.js:558
        _hydrate client.js:2797
        start client.js:356
        <anonymous> (index):1528
        (Async: promise callback)
        <anonymous> (index):1527
    ```

- [ ] (P1) Fix the container layout of the pages to better position and align text content on Codes screen

  - Currently, the header takes up some vertical space and the text container is a flexbox below it, which makes it hard to align the text contents to vertical center of app viewport. This is further complicated by the footer, which is sticky and inset to the bottom.
  - [ ] The right way to go about this is probably to have header, main content and footer all inside a single flexbox container, with the main content growing to eat up all vertical space possible and the header and footer of fixed sizes being fixed at the top and bottom respectively.

- [ ] Reset Option on Wrong Passcode missing from view
- [ ] Refactor how sentinel and encrypted storage metadata is stored
- [ ] Maintain focus on Add Token Drawer -> token secret box, when reveal button is clicked.

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

- [ ] Add passcode to encrypt/decrypt tokens (also serves to lock / unlock app)
- [ ] Move settings and conditions to exported global states. Contexts are overkill for that.
- [ ] Setup GDrive [app folder backup](https://developers.google.com/drive/api/guides/appdata)
- [ ] Setup iCloud backup using [CloudKit](https://developer.apple.com/documentation/cloudkit)
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
