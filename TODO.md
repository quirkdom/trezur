# TODOs

Individual files have small, inline TODO reminders.

## Bugs
- [ ] When data is imported from settings page, it adds data into tokensContext state, and then immediately persists it. However after navigating to '/', the $effect to make tokens context in +page.svelte re-runs, which causes #load to run, and that blindly merges persisted data (i.e. tokens that were just persisted) and existing tokens in memory state, resulting in duplicate tokens.
    - [x] Can be possibly solved by de-duping against IDs. But is that a good idea?
        - Currently solved this by deduping on `id` and `secret`. But this should only be a short term solution.
    - [ ] What should be a good long term solution to sync persisted data with in-memory state?

## Next steps

- [ ] Add passcode to encrypt/decrypt tokens (also serves to lock / unlock app)
- [ ] Move settings and conditions to exported global states. Contexts are overkill for that.
- [ ] Setup GDrive [app folder backup](https://developers.google.com/drive/api/guides/appdata)
- [ ] Setup iCloud backup using [CloudKit](https://developer.apple.com/documentation/cloudkit)
- [ ] Better UX for touch devices
    - [ ] Implement swipe gestures for token actions
    - [ ] Implement long press for token actions
    - Some resources for that:
        - [MDN contextmenu](https://developer.mozilla.org/en-US/docs/Web/API/Element/contextmenu_event)
        - [Detect touch screens](https://stackoverflow.com/a/63666289/2844164)
        - [Svelte Gestures package](https://github.com/Rezi/svelte-gestures)
- [ ] Standardize CSS across components by making a tailwind theme

## Next Gen

- [ ] Experiments: HDR-supported *ultra-bright* QR codes.
    - [Demo](https://notes.dt.in.th/HDRQRCode)
    - [SO answer to detect HDR capable displays](https://stackoverflow.com/a/75213217/2844164)
- [ ] Add HOTP token support
- [ ] Service worker for background sync
- [ ] Allow S3 compatible backup
- [ ] Auto-tiling token cards when list is too long and screen space is available
- [ ] Logo support
- [ ] Move to TypeScript
