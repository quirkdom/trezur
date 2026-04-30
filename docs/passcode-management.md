# Trezur Passcode & App Lock State Management

This document outlines how the Trezur app handles passcodes, app locking, and encryption session initialization.

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

Passcode management occurs in `src/routes/settings/+page.svelte` through user interactions.

- **Setting a New Passcode (`handleSetPasscode`)**:
  1. The new passcode is saved to session memory: `sessionPasscode.passcode = passcode`.
  2. `encryptedLocalStorage` is initialized with the new passcode.
  3. The `tokensContext` is reinitialized (`iMake`) with the new storage. This process automatically re-encrypts any existing tokens with the new passcode.
  4. A verification sentinel is set in storage (`newStorage.setSentinel()`) to validate future unlock attempts.
  5. The global state `isUserPasscodeSet` is updated to `true`.
  6. The user receives a success alert summarizing the changes and how many tokens were re-encrypted.

- **Changing an Existing Passcode (`handleChangePasscode`)**:
  The flow is nearly identical to setting a new passcode. The new passcode is put into session memory, storage is re-initialized which triggers token re-encryption, and the verification sentinel is overwritten to match the new passcode.

- **Removing a Passcode (`handleRemovePasscode`)**:
  1. The user must manually confirm the removal by typing "YES".
  2. The existing passcode sentinel is removed from storage.
  3. `encryptedLocalStorage` is re-initialized using the fallback device-specific `clientId`.
  4. The `tokensContext` is reinitialized, re-encrypting tokens with the device key.
  5. `isUserPasscodeSet` is toggled to `false`.
  6. The `sessionPasscode` in memory is cleared (`sessionPasscode.clear()`).

## 3. Locking and Unlocking the App

### Locking Flow
- Locking can be triggered manually via settings or the footer navigation. 
- When the lock action is invoked, `sessionPasscode.clear()` is called. 
- Wiping the `sessionPasscode` triggers the layout effect (described in section 1), which detects the missing session passcode and sets `conditions.isAppLocked = true`, rendering the `<UnlockScreen />`.

### Unlocking Flow
- When `isAppLocked` is true, the `UnlockScreen` (`src/lib/components/passcode/UnlockScreen.svelte`) displays a `PasscodeDialog` in `"verify"` mode.
- When the user enters a passcode, it is verified (via the storage sentinel). On success, `handleUnlock(passcode)` executes:
  1. **Populating Session Memory**: The validated passcode is assigned to `sessionPasscode.passcode`.
  2. **Storage Initialization**: `encryptedLocalStorage.init(passcode)` is called. This provisions the AES-GCM encryption layer with the user's passcode as the key.
  3. **Data Context Setup**: `tokensContext.iMake(encryptedLocalStorage.current)` is called, linking the token state manager to the freshly initialized storage. 
  4. **Decryption**: Because the storage is now initialized with the correct key, subsequent reads via `tokensContext` will transparently decrypt the underlying data from local storage.
  5. **State Update**: Finally, `conditionsContext.updateCondition('isAppLocked', false)` is called. This hides the `<UnlockScreen />` and resumes normal app execution with decrypted data ready for rendering.

## 4. Tokens Migration Flow (Temporary)

> [!NOTE]
> This flow is a temporary backward-compatibility mechanism for migrating tokens from an older encryption implementation to the new AES-GCM storage and will be removed in the future.

When a user visits the main page (`src/routes/+page.svelte`), the app checks if `encryptedLocalStorage.current?.needsMigration` is true:
1. **User Notification & Backup**: It alerts the user that their tokens must be migrated to more secure encryption. It then automatically downloads a JSON backup of the current tokens (via `exportTokensDownload`) before proceeding, ensuring no data loss if migration fails.
2. **Storage Re-initialization**: It re-initializes `encryptedLocalStorage` using the fallback `clientId` (the device-specific key).
3. **Data Re-encryption**: It calls `tokensContext.iMake(encryptedLocalStorage.current)`, which merges any currently loaded tokens in memory into the newly initialized storage. This transparently re-encrypts the old tokens under the new encryption mechanism.
