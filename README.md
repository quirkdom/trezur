# trezur

Trezur is a fast, simple, light-weight web-app to generate TOTP and HOTP tokens.

## Stack
- [x] [Svelte](https://svelte.dev/) + SvelteKit
- [x] [TailwindCSS](https://tailwindcss.com/)
- [x] [Vite](https://vitejs.dev/) (through SvelteKit)

Trezur is almost entirely written in JavaScript, with JSDoc type hints used for type checking and documentation.

## TODOs

### Bugs

- [x] In TokenList, on search, the token code shown is always that of the first ones.
      Repro: With no search, not the code of the first few tokens. Now search for tokens: the account and issuer names change to match the search query, but the codes are those of the first few tokens.
      Temporarily solved using Keyed Each loops.

### Immediate needsp

- [ ] Add drawer to add new tokens
- [ ] Interact with existing tokens
  - [ ] Edit or delete tokens
  - [ ] Copy token to clipboard
  - [ ] Generate QR codes of tokens
- [ ] Implement preferences page

- [ ] Add passcode to encrypt/decrypt tokens (also serves to lock / unlock app)
- [ ] Store tokens encypted in browser storage (probably using [WebCrypto](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API) and [IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API))

### Next steps

- [ ] Add a way to import/export tokens
- [ ] Setup GDrive [app folder backup](https://developers.google.com/drive/api/guides/appdata)
- [ ] Setup iCloud backup using [CloudKit](https://developer.apple.com/documentation/cloudkit)

### Next Gen

- [ ] Add HOTP token support
- [ ] Service worker for background sync
- [ ] Allow S3 compatible backup
- [ ] Auto-tiling token cards when list is too long and screen space is available
- [ ] Logo support
- [ ] Move to TypeScript
