# Test Flows for Trezur App

Comprehensive test flows covering all app functionality: storage initialization, token management, import/export, settings, security, UI/UX, and edge cases. Use browser dev tools to monitor console logs, storage state, and network activity.

## Storage Initialization Flows

After the updates (combined `$effect` in `+layout.svelte` and unlock init in `UnlockScreen.svelte`), test these flows to ensure storage initializes correctly, tokens load, and no races/errors occur. Focus on scenarios where storage wasn't previously inited (e.g., direct settings access, post-purge).

#### 1. **Fresh App Load (No Passcode Set)**

- **Steps**: Clear localStorage, load `/` (codes page).
- **Expected**: Storage inits on `clientId` via layout `$effect`. Tokens load/display. No errors.
- **Storage Check**: `localStorage` should contain `T_settings` with default values. No `T_tokens` if no tokens exist. Encrypted storage initialized with clientId key.
- **Edge**: Direct load to `/settings` → Storage inits, settings page renders.

#### 2. **Fresh App Load (Passcode Set)**

- **Steps**: Set passcode, reload app.
- **Expected**: App locks. Unlock → Storage inits on passcode, tokens load.
- **Storage Check**: Encrypted storage should have sentinel set. Tokens encrypted with passcode key.

#### 3. **Unlock Flow**

- **Steps**: With passcode set, reload → Unlock via dialog.
- **Expected**: `handleUnlock` inits storage on passcode, unlocks app, tokens load immediately.
- **Storage Check**: Same encrypted storage key persists, no re-encryption during unlock.

#### 4. **Set Passcode**

- **Steps**: In settings, set new passcode.
- **Expected**: `handleSetPasscode` inits storage, migrates tokens, updates conditions.
- **Storage Check**: New encrypted storage created with passcode key, sentinel set, tokens migrated and re-encrypted.

#### 5. **Change Passcode**

- **Steps**: In settings, change existing passcode.
- **Expected**: `handleChangePasscode` re-inits storage, migrates tokens.
- **Storage Check**: Storage re-initialized with new passcode key, tokens re-encrypted, old storage cleared.

#### 6. **Remove Passcode**

- **Steps**: In settings, remove passcode.
- **Expected**: `handleRemovePasscode` inits storage on `clientId`, updates conditions.
- **Storage Check**: Sentinel removed, storage re-initialized with clientId key, tokens re-encrypted with device key.

#### 7. **Purge All Data**

- **Steps**: In settings, purge data.
- **Expected**: Resets storage/conditions, `goto('/')` with invalidate → Layout `$effect` re-runs, inits on new `clientId`, tokens reload.
- **Storage Check**: All localStorage cleared (`T_settings`, `T_tokens` removed), encrypted storage reset.

#### 8. **Direct Settings Access (No Prior Codes Visit)**

- **Steps**: Clear storage, navigate directly to `/settings`.
- **Expected**: Layout `$effect` inits storage on `clientId` (since no passcode), settings render.
- **Storage Check**: `T_settings` created with defaults, no encrypted storage changes.

#### 9. **App Lock/Unlock Toggle**

- **Steps**: With passcode, toggle lock in settings.
- **Expected**: Locks/unlocks without re-init (storage persists).
- **Storage Check**: No storage changes, only UI state changes.

#### 10. **Navigation Between Pages**

- **Steps**: Load codes, nav to settings, back to codes.
- **Expected**: Storage stays inited, no re-init calls.
- **Storage Check**: Storage state unchanged, no additional localStorage writes.

#### 11. **Forgot Passcode (Reset)**

- **Steps**: In unlock screen, forgot passcode → Confirm reset.
- **Expected**: Resets storage/conditions, `goto('/')` → Re-init on new `clientId`.
- **Storage Check**: All encrypted storage cleared, new clientId-based storage initialized.

## Token Management Flows

#### 12. **Manual Token Addition**

- **Steps**: Click add button → Fill form (issuer, account, secret) → Submit.
- **Expected**: Token validates, adds to list, appears immediately. Duplicate secrets rejected.
- **Storage Check**: `T_tokens` in encrypted storage should contain new token with generated ID, proper fields.
- **Edge**: Invalid Base32 secret, missing required fields, special characters.

#### 13. **QR Code Scanning**

- **Steps**: Click add → Scan QR → Camera opens → Point at valid otpauth QR.
- **Expected**: QR parses, form auto-fills, submits automatically if complete.
- **Storage Check**: Same as manual addition - new token stored in `T_tokens`.
- **Edge**: Invalid QR format, camera permission denied, partial QR data.

#### 14. **Token Code Generation**

- **Steps**: Add TOTP token → Wait for code changes.
- **Expected**: Code updates every 30s, shows countdown, next code displays when enabled.
- **Storage Check**: No storage changes during code generation - only runtime calculation.
- **Edge**: HOTP counter increment, custom periods/algorithms.

#### 15. **Token Editing**

- **Steps**: Click edit on token → Modify fields → Save.
- **Expected**: Changes persist, validation works, UI updates immediately.
- **Storage Check**: `T_tokens` updated with modified token fields, same ID preserved.

#### 16. **Token Deletion**

- **Steps**: Click delete on token → Confirm.
- **Expected**: Token removed from list and storage, no orphaned data.
- **Storage Check**: Token removed from `T_tokens` array, array compacted.

#### 17. **Search & Filter**

- **Steps**: Type in search bar with tokens present.
- **Expected**: Filters by issuer/account, case-insensitive, real-time updates.
- **Storage Check**: No storage changes - filtering is client-side only.

#### 18. **Token Sorting**

- **Steps**: Click sort button → Change order (asc/desc/none).
- **Expected**: Tokens reorder, setting persists across sessions.
- **Storage Check**: `T_settings` updated with new `sortOrder` value.

## Import/Export Flows

#### 19. **Import from Trezur Backup**

- **Steps**: Settings → Import → Select Trezur JSON file.
- **Expected**: Tokens parse and add, duplicates handled, success message.
- **Storage Check**: `T_tokens` updated with imported tokens, deduplication applied, IDs preserved from import.

#### 20. **Import from External Services**

- **Steps**: Settings → Import → Select service (LastPass, Raivo, 2FAS, Ente, Aegis, Chronos).
- **Expected**: File parses correctly, tokens import with proper mapping.
- **Storage Check**: `T_tokens` contains new tokens with generated IDs, proper field mapping from source format.
- **Edge**: Invalid file format, missing fields, unsupported algorithms.

#### 21. **Export Tokens**

- **Steps**: Settings → Export → Set filename → Export.
- **Expected**: JSON downloads, contains all token data, proper format.
- **Storage Check**: No storage changes - export reads from `T_tokens` without modification.

#### 22. **Import Error Handling**

- **Steps**: Import invalid/corrupted file.
- **Expected**: Clear error message, no partial imports, form remains open.
- **Storage Check**: `T_tokens` unchanged if import fails.

## Settings & Security Flows

#### 23. **Settings Changes**

- **Steps**: Toggle "Show next code", change sort order.
- **Expected**: Settings persist, UI updates immediately, tokens reflect changes.
- **Storage Check**: `T_settings` updated with new values (`showNextCode`, `sortOrder`).

#### 24. **Passcode Operations (Beyond Init)**

- **Steps**: Set/change/remove passcode with existing tokens.
- **Expected**: Migration works, no data loss, proper encryption.
- **Storage Check**: See flows 4-6 for specific storage changes during passcode operations.

#### 25. **App Lock/Unlock UI**

- **Steps**: With passcode set, use lock toggle in settings.
- **Expected**: UI hides tokens, unlock dialog appears, state persists.
- **Storage Check**: No storage changes - lock state is runtime only.

#### 26. **Data Purge Confirmation**

- **Steps**: Click "Delete all app data" → Enter confirmation.
- **Expected**: All data cleared, app resets to initial state.
- **Storage Check**: All localStorage cleared (`T_settings`, `T_tokens`), encrypted storage reset.

## UI/UX Flows

#### 27. **Navigation**

- **Steps**: Navigate between / and /settings, use back buttons.
- **Expected**: Smooth transitions, state preserved, no layout shifts.

#### 28. **Modal/Dialog Interactions**

- **Steps**: Open add/import/export modals, interact with forms.
- **Expected**: Proper focus management, ESC to close, overlay behavior.

#### 29. **Loading States**

- **Steps**: Trigger operations that load (token loading, camera init).
- **Expected**: Spinners show, UI disabled during operations.

#### 30. **Responsive Design**

- **Steps**: Test on mobile/desktop, different screen sizes.
- **Expected**: Layout adapts, touch targets appropriate, text readable.

#### 31. **Error States**

- **Steps**: Trigger errors (invalid input, network issues).
- **Expected**: Clear error messages, recovery options, no crashes.

## Migration & Update Flows

#### 32. **App Update Migration**

- **Steps**: Load app with migration-needed flag set.
- **Expected**: Alert shows, backup downloads, migration completes.
- **Storage Check**: Tokens migrated to new encryption format, old storage cleared, migration flag reset.

#### 33. **Version Compatibility**

- **Steps**: Import exports from different app versions.
- **Expected**: Backward compatibility, graceful degradation.
- **Storage Check**: Imported tokens stored in current format, regardless of export version.

## Edge Cases & Error Scenarios

#### 34. **Invalid Token Data**

- **Steps**: Add token with invalid secret/algorithm.
- **Expected**: Validation prevents save, clear error messages.
- **Storage Check**: `T_tokens` unchanged if validation fails.

#### 35. **Storage Quota Issues**

- **Steps**: Fill browser storage, add more tokens.
- **Expected**: Graceful failure, user notification.
- **Storage Check**: Monitor localStorage size, check for quota exceeded errors in console.

#### 36. **Camera Access Issues**

- **Steps**: Deny camera permission, try QR scan.
- **Expected**: Fallback to manual entry, clear error message.
- **Storage Check**: No storage changes during camera operations.

#### 37. **Concurrent Operations**

- **Steps**: Import while adding tokens manually.
- **Expected**: No race conditions, proper state management.
- **Storage Check**: `T_tokens` should contain all tokens from both operations, no data loss.

#### 38. **Browser Compatibility**

- **Steps**: Test in different browsers, private/incognito mode.
- **Expected**: Core functionality works, graceful degradation.
- **Storage Check**: localStorage behavior may vary (incognito mode clears on close).

#### 39. **Network Issues**

- **Steps**: Offline operation, service worker behavior.
- **Expected**: App works offline, sync when online.
- **Storage Check**: All data remains local, no network-dependent storage changes.

#### 40. **Data Corruption Recovery**

- **Steps**: Manually corrupt localStorage, reload app.
- **Expected**: App handles gracefully, offers recovery options.
- **Storage Check**: Corrupted data detected, app falls back to clean state or shows recovery UI.

## General Checks

- **No Races/Errors**: Monitor console for async issues, uncaught promises, or "storage not ready" errors.
- **Token Loading**: Ensure tokens appear after storage init (via `+page.svelte` `$effect`).
- **SSR/Safety**: No init on server; browser checks work.
- **Performance**: No excessive re-inits; init only when needed. Token generation smooth.
- **Security**: Secrets never logged, encrypted storage works, no XSS vulnerabilities.
- **Accessibility**: Keyboard navigation, screen reader support, color contrast.
- **UI Consistency**: Consistent styling, loading states, error handling across components.
- **Data Integrity**: No data loss during operations, proper validation.
- **Cross-Platform**: Test on iOS Safari, Android Chrome, desktop browsers.
- **Storage Integrity**: `T_tokens` and `T_settings` in localStorage match app state. Encrypted storage properly initialized. No orphaned data.
- **Storage Performance**: Storage operations complete within reasonable time. No blocking operations on main thread.

Run in dev mode with `$inspect` logs. Use browser dev tools for storage inspection, network monitoring, and performance profiling. Test on multiple devices and browsers. Report any failures for fixes.

### Browser Storage Keys to Monitor

- `T_settings`: User preferences (showNextCode, useBiometricUnlock, sortOrder)
- `T_tokens`: Encrypted token data (only in dev mode for debugging)
- Encrypted storage: Main token storage with clientId/passcode keys
- Sentinels: Passcode validation markers in encrypted storage
