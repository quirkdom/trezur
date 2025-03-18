# trezur

Trezur is a fast, simple, light-weight web-app to generate TOTP and HOTP tokens.

## Stack
- [Svelte](https://svelte.dev/) + SvelteKit
- [TailwindCSS](https://tailwindcss.com/)
- [Vite](https://vitejs.dev/) (through SvelteKit)

Trezur is almost entirely written in JavaScript, with JSDoc type hints used for type checking and documentation.

## TODOs

### Bugs

- [x] In TokenList, on search, the token code shown is always that of the first ones.
    - Repro: With no search, not the code of the first few tokens. Now search for tokens: the account and issuer names change to match the search query, but the codes are those of the first few tokens.
    - [x] Temporarily solved using Keyed Each loops.
- [x] When Data is purged from Settings page, it wipes out the persisted conditions.clientId, and also undefines in-memory state of conditions.clientId.
    - Yes, invalidate() can be called, and while that triggers layout load(), the context is not updated with the new data from this load(). Context had already been set during +layout.svelte initialization
    once and it doesn't get re-initialized again. Valuable discussion [here](https://github.com/sveltejs/kit/discussions/10819).
    - [x] When doing conditions.resetConditions(), or during +layout.svelte initialization, conditions.clientId needs to be set again from data.conditions.clientId
- [ ] When [in DEV mode] sample data load button is clicked in settings page, it adds data into tokensContext state, and then immediately persists it. However after navigating to '/', the $effect to make
tokens context in +page.svelte re-runs, which causes #load to run, and that blindly merges persisted data (i.e. tokens that were just persisted) and existing tokens in memory state, resulting in duplicate tokens.
    - [x] Can be possibly solved by de-duping against IDs. But is that a good idea?
        - Currently solved this by deduping on `id` and `secret`. But this should only be a short term solution.
    - [ ] What should be a good long term solution to sync persisted data with in-memory state?

### Immediate needs

- [ ] Add drawer to add new tokens
    - [ ] Wire up QR code scanner
    - [x] Wire up add new token form data -> Tokenable -> Add to TokenContext
- [x] Interact with existing tokens
  - [x] Edit or delete tokens
  - [ ] Copy token to clipboard
  - [x] Generate QR codes of tokens
- [x] Implement preferences page
- [x] Implement sorting

- [ ] Better UX for touch devices
    - [ ] [BUG] Hover actions on token card don't work on touch devices
    - [ ] Implement swipe gestures for token actions
    - [ ] Implement long press for token actions
    - Some resources for that:
        - [MDN contextmenu](https://developer.mozilla.org/en-US/docs/Web/API/Element/contextmenu_event)
        - [Detect touch screens](https://stackoverflow.com/a/63666289/2844164)
        - [Svelte Gestures package](https://github.com/Rezi/svelte-gestures)

- [ ] Move settings and conditions to exported global states. Contexts are overkill for that.
- [ ] Add passcode to encrypt/decrypt tokens (also serves to lock / unlock app)
- [x] Store tokens encypted in browser storage (probably using [WebCrypto](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API) and [IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API))

### Next steps

- [ ] Add a way to import/export tokens
- [ ] Setup GDrive [app folder backup](https://developers.google.com/drive/api/guides/appdata)
- [ ] Setup iCloud backup using [CloudKit](https://developer.apple.com/documentation/cloudkit)

### Next Gen

- [ ] Experiments: HDR-supported *ultra-bright* QR codes.
    - [Demo](https://notes.dt.in.th/HDRQRCode)
    - [SO answer to detect HDR capable displays](https://stackoverflow.com/a/75213217/2844164)
- [ ] Add HOTP token support
- [ ] Service worker for background sync
- [ ] Allow S3 compatible backup
- [ ] Auto-tiling token cards when list is too long and screen space is available
- [ ] Logo support
- [ ] Move to TypeScript
