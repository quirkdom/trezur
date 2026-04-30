# Trezur Passcode & App Lock State Management

This document outlines how the Trezur app handles passcodes, app locking, and encryption session initialization based on the Master Sync Key (MSK) and Local Wrap Key (LWK) architecture.

## 1. App Locked State and Session Passcode Requirement on Load

The app's lock state and session requirement are determined centrally in `src/routes/+layout.svelte` via reactive effects (`$effect`).

- **Lock Condition Evaluation**: 
  The app constantly monitors three states:
  1. `conditions.isUserPasscodeSet`: Whether the user has configured a custom passcode.
  2. `sessionPasscode.passcode`: The in-memory session passcode.
  3. `conditions.isAppLocked`: The current lock UI state.
  
  If a passcode is set (`isUserPasscodeSet === true`) but the session memory is empty (`sessionPasscode.passcode` is falsy) and the app is not already locked, an effect automatically triggers `conditionsContext.updateCondition('isAppLocked', true)`. This locks the app interface, hiding the main content behind the `<UnlockScreen />`.

- **No Passcode (Device Key) Initialization**: 
  If `isUserPasscodeSet` is `false`, the app skips the lock screen. It automatically initializes `encryptedLocalStorage` using the device-specific `clientId` and subsequently initializes the `tokensContext`.

## 2. Setting, Changing, or Removing a Passcode

Passcode management occurs in `src/routes/settings/+page.svelte` through user interactions. Because tokens are encrypted with a random Master Sync Key (MSK), changing a passcode only requires re-wrapping the MSK, not re-encrypting the entire token vault.

- **Setting a New Passcode (`handleSetPasscode`)**:
  1. The new passcode is saved to session memory: `sessionPasscode.passcode = passcode`.
  2. `encryptedLocalStorage` is initialized with the new passcode, and `options.oldPasskey: conditions.clientId` is provided. This unwraps the MSK using the device key and re-wraps it securely under the new user passcode.
  3. The `tokensContext` is reinitialized (`iMake`) with the new storage.
  4. The global state `isUserPasscodeSet` is updated to `true`.

- **Changing an Existing Passcode (`handleChangePasscode`)**:
  The flow is nearly identical to setting a new passcode. The new passcode is put into session memory, and storage is initialized using the *old* `sessionPasscode.passcode` as `options.oldPasskey`. The MSK is unwrapped using the old passcode and immediately re-wrapped using the new passcode. The tokens vault remains perfectly intact.

- **Removing a Passcode (`handleRemovePasscode`)**:
  1. The user must manually confirm the removal by typing "YES".
  2. `encryptedLocalStorage` is re-initialized using the fallback device-specific `clientId` and the *old* `sessionPasscode.passcode` is provided as `options.oldPasskey`. The MSK is unwrapped from the user's passcode and re-wrapped under the device key.
  3. The `tokensContext` is reinitialized.
  4. `isUserPasscodeSet` is toggled to `false`.
  5. The `sessionPasscode` in memory is cleared (`sessionPasscode.clear()`).

## 3. Locking and Unlocking the App

### Locking Flow
- Locking can be triggered manually via settings or the footer navigation. 
- When the lock action is invoked, `sessionPasscode.clear()` is called. 
- Wiping the `sessionPasscode` triggers the layout effect (described in section 1), which detects the missing session passcode and sets `conditions.isAppLocked = true`, rendering the `<UnlockScreen />`.

### Unlocking Flow
- When `isAppLocked` is true, the `UnlockScreen` (`src/lib/components/passcode/UnlockScreen.svelte`) displays a `PasscodeDialog` in `"verify"` mode.
- When the user enters a passcode, it is verified by calling `encryptedLocalStorage.test(passcode)`. This tests whether the provided passcode can successfully derive an LWK and unwrap the stored MSK. On success, `handleUnlock(passcode)` executes:
  1. **Populating Session Memory**: The validated passcode is assigned to `sessionPasscode.passcode`.
  2. **Storage Initialization**: `encryptedLocalStorage.init(passcode)` is called. This unpacks the MSK using the passcode, derives the AES-GCM payload CryptoKey, and provisions the `AESGCMEncryptedStorage` adapter.
  3. **Data Context Setup**: `tokensContext.iMake(encryptedLocalStorage.current)` is called, linking the token state manager to the freshly initialized storage. 
  4. **Decryption**: Because the storage is now initialized with the correct key, subsequent reads via `tokensContext` will transparently decrypt the underlying data from local storage.
  5. **State Update**: Finally, `conditionsContext.updateCondition('isAppLocked', false)` is called. This hides the `<UnlockScreen />` and resumes normal app execution with decrypted data ready for rendering.

## 4. Tokens Migration Flow (Legacy V1 -> V2)

> [!NOTE]
> This flow is a backward-compatibility mechanism for migrating tokens from the older weak-KDF implementation (V1) to the new MSK/LWK AES-GCM architecture (V2) and will be removed in the future.

When a user visits the main page (`src/routes/+page.svelte`), the app checks if `encryptedLocalStorage.needsMigration` is true (detected because the stored KDF metadata indicates an old version, or no KDF metadata exists but old `T_ES_` records exist):
1. **User Notification & Backup**: It alerts the user that their tokens must be migrated to more secure encryption. It then automatically downloads a JSON backup of the current tokens (via `exportTokensDownload`) before proceeding, ensuring no data loss if migration fails.
2. **Storage Re-initialization**: It re-initializes `encryptedLocalStorage` using the fallback `clientId` (the device-specific key).
3. **Data Re-encryption**: It calls `tokensContext.iMake(encryptedLocalStorage.current)`. Because the new storage instance utilizes the freshly generated MSK encryption, `iMake` reads the tokens loaded in memory (decrypted from the legacy adapter) and writes them back into the new storage adapter. This transparently re-encrypts the old tokens under the new MSK architecture.
