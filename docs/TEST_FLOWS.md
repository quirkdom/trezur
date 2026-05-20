# Test Flows for Trezur App

Comprehensive test flows covering all app functionality. Use browser dev tools to monitor console logs, localStorage state, and network activity.

## Browser Storage Keys

| Key                    | Purpose                                                                |
| ---------------------- | ---------------------------------------------------------------------- |
| `T_settings`           | User preferences (`showNextCode`, `sortOrder`) — plaintext             |
| `T_conditions`         | `clientId`, `isUserPasscodeSet` — plaintext                            |
| `T_ES_KDF_META`        | KDF parameters: `{ v, name, salt, iterations, hash }` — plaintext JSON |
| `T_ES_WRAPPED_MSK`     | MSK encrypted with LWK: `{ iv, data }` — stored as JSON arrays         |
| `T_ES_WRAPPED_MSK_BAK` | Backup wrapped MSK (temporary, during passcode change)                 |
| `T_ES_tokens`          | Token list ciphertext — AES-GCM encrypted                              |
| `T_ES_tombstones`      | Tombstone list ciphertext — AES-GCM encrypted                          |
| `T_ES_backup_state`    | Cloud sync state ciphertext — AES-GCM encrypted                        |

`T_ES_*` values (except KDF_META) are encrypted via `LocalKVVault` using the payload CryptoKey derived from the MSK.

## Cold Start & Storage Init

#### 1. Fresh App Load (No Passcode)

- **Steps**: Clear all localStorage, load `/`.
- **Expected**: App shows empty token list. No lock screen.
- **Storage Check**: `T_conditions` has `clientId` + `isUserPasscodeSet: false`. `T_ES_KDF_META` + `T_ES_WRAPPED_MSK` exist. `T_settings` created with defaults.
- **Edge**: Direct load to `/settings` → Storage inits, settings page renders with no errors.

#### 2. Fresh App Load (Passcode Set)

- **Steps**: Set passcode in settings. Close tab. Reopen app.
- **Expected**: App opens to lock screen with `UnlockScreen`. Tokens hidden.
- **Storage Check**: `T_conditions` has `isUserPasscodeSet: true`. `T_ES_KDF_META` exists. `T_ES_WRAPPED_MSK` re-wrapped under passcode-derived LWK.

#### 3. Unlock Flow

- **Steps**: On lock screen, long-press lock icon → passcode dialog opens. Enter correct passcode.
- **Expected**: `isAppLocked` becomes false, tokens appear. No flash of main content. No dialog remounting.
- **Storage Check**: No storage changes during unlock. Only in-memory `cryptoKey` is derived and cached.

#### 4. Set Passcode

- **Steps**: No passcode set. Go to Settings → Set Passcode → enter passcode → confirm.
- **Expected**: Passcode set. `isUserPasscodeSet` becomes true. Lock icon now shows locked state.
- **Storage Check**: `T_ES_WRAPPED_MSK` re-wrapped with passcode-derived LWK (was wrapped with clientId-LWK). `T_ES_KDF_META` may update with new salt. `T_conditions` shows `isUserPasscodeSet: true`. Tokens unchanged.

#### 5. Change Passcode

- **Steps**: Passcode already set. Settings → Change Passcode → enter old → enter new → confirm.
- **Expected**: Passcode changed. Lock/unlock works with new passcode. Tokens intact.
- **Storage Check**: `T_ES_KDF_META` updated with new salt. `T_ES_WRAPPED_MSK` re-wrapped with new passcode-derived LWK. `T_ES_WRAPPED_MSK_BAK` should be absent (deleted after successful change). Token data unchanged.

#### 6. Remove Passcode

- **Steps**: Passcode set. Settings → Remove Passcode → type confirmation → confirm.
- **Expected**: `isUserPasscodeSet` becomes false. Lock icon shows unlocked state. App no longer locks on reload.
- **Storage Check**: `T_ES_WRAPPED_MSK` re-wrapped with clientId-derived LWK. `T_conditions` shows `isUserPasscodeSet: false`. Tokens unchanged.

#### 7. App Lock (Manual)

- **Steps**: Passcode set. Long-press lock icon in FooterNav while unlocked.
- **Expected**: `isAppLocked = true`. UnlockScreen renders. In-memory cryptoKey cleared.
- **Storage Check**: No localStorage changes. Encrypted data remains, just not decryptable without passcode.

#### 8. App Unlock Without Passcode

- **Steps**: No passcode set. Lock → long-press lock icon to unlock.
- **Expected**: `initStorage(clientId)` re-derives keys. App unlocks immediately, no dialog.
- **Storage Check**: No storage changes.

#### 9. Forgot Passcode

- **Steps**: On lock screen, "Forgot passcode?" → type "YES" → confirm.
- **Expected**: All data purged. `isAppLocked = false`, `isUserPasscodeSet = false`. App resets to `/` with fresh MSK, empty vault.
- **Storage Check**: `T_ES_KDF_META`, `T_ES_WRAPPED_MSK`, and all `T_ES_*` vault keys deleted. `T_conditions` reset. Fresh MSK generated and wrapped with clientId-LWK.

#### 10. Purge All Data

- **Steps**: Settings → Delete all data → type confirmation → confirm.
- **Expected**: All data cleared. App redirects to `/` and cold-starts fresh.
- **Storage Check**: All localStorage keys removed. `T_settings`, `T_conditions`, all `T_ES_*` keys gone.

#### 11. Page Reload (Passcode Set)

- **Steps**: Passcode set. Unlock app normally. Reload page.
- **Expected**: App opens to lock screen. Auto-lock `$effect` fires: detects passcode set + no cryptoKey in memory → sets `isAppLocked = true`.
- **Storage Check**: No storage changes.

#### 12. Navigation Between Pages

- **Steps**: Load `/`. Navigate to `/settings`. Navigate back to `/`.
- **Expected**: Vault stays initialized. No re-init. No errors.
- **Storage Check**: No additional localStorage writes.

## Token Management

#### 13. Manual Token Addition

- **Steps**: Add button → fill issuer, account, Base32 secret → submit.
- **Expected**: Token validates and appears in list. Duplicate `id:secret` pairs rejected silently.
- **Storage Check**: `T_ES_tokens` in vault updated after encryption. All `updatedAt` fields stamped with `Date.now()`.

#### 14. QR Code Scanning

- **Steps**: Add → Scan QR → point at valid `otpauth://` QR.
- **Expected**: QR parsed, form auto-fills, submits if complete.
- **Edge**: Invalid QR format, camera denied, partial data — should show clear error, no partial additions.

#### 15. Token Code Display

- **Steps**: Add TOTP token → watch code change.
- **Expected**: Code updates every 30 seconds. Countdown shown. "Next code" displays when setting enabled.
- **Storage Check**: No writes during code generation (runtime calculation).

#### 16. Token Editing

- **Steps**: Edit token → change account name or other field → save.
- **Expected**: Changes persist. Only changed fields get new `updatedAt` timestamps.
- **Storage Check**: `T_ES_tokens` updated. Unchanged field timestamps preserved.

#### 17. Token Deletion

- **Steps**: Delete token → confirm.
- **Expected**: Token removed from list. Tombstone created.
- **Storage Check**: Token removed from `T_ES_tokens`. Tombstone added to `T_ES_tombstones` with `Date.now()` timestamp.

#### 18. Search & Filter

- **Steps**: Type in search bar with multiple tokens.
- **Expected**: Real-time case-insensitive filtering by issuer/account.
- **Storage Check**: No writes. Client-side filter only.

#### 19. Token Sorting

- **Steps**: Change sort order in settings.
- **Expected**: Tokens reorder. Setting persists across sessions.
- **Storage Check**: `T_settings.sortOrder` updated.

## Import/Export

#### 20. Import Trezur JSON

- **Steps**: Settings → Import → select Trezur backup file.
- **Expected**: Tokens parse and add. Duplicates detected by `id:secret`.
- **Storage Check**: `T_ES_tokens` updated with imported tokens.

#### 21. Import from External Services

- **Steps**: Import from LastPass, Raivo, 2FAS, Ente, Aegis, Chronos formats.
- **Expected**: Correct mapping. Proper `updatedAt` timestamps (imports get `Date.now()`).
- **Edge**: Invalid/corrupt file → clear error, no partial imports.

#### 22. Export Tokens

- **Steps**: Settings → Export → save file.
- **Expected**: JSON downloads with all token data.
- **Storage Check**: No changes. Read-only operation.

## Cloud Sync

#### 23. Enable Backup (Fresh)

- **Steps**: Settings → toggle Google Drive Backup ON. Set passcode if prompted. Sign in with Google. Save recovery words.
- **Expected**: Backup enabled. RecoveryKit shows 24 words. First backup pushed to Drive.
- **Storage Check**: `T_ES_backup_state` updated with `autoSyncEnabled: true`. Cloud file `tokens.trzr` exists in Google Drive `appDataFolder`.

#### 24. Enable Backup (Existing) — Recovery

- **Steps**: On a new device with existing cloud backup, toggle backup ON. Sign in to same Google account. Scan QR or enter 24 recovery words.
- **Expected**: `verifyCloudBackupMnemonic` passes. Backup adopted. Tokens sync down.
- **Storage Check**: MSK replaced with mnemonic-derived key. Local tokens replaced by cloud state.

#### 25. Auto-Sync After Token Change

- **Steps**: Backup enabled. Add/edit/delete a token. Wait 30 seconds.
- **Expected**: Cloud sync triggers. Tokens synced to Google Drive.
- **Storage Check**: `tokens.trzr` updated on Drive. ETag changes.

#### 26. Sync Conflict Resolution

- **Steps**: Two devices with same account, same MSK, backup enabled. Make different changes on each device. Let both sync.
- **Expected**: LWW per-field merge applies. Later field timestamps win. No data loss.
- **Storage Check**: Merged token has per-field timestamps from the later writer for each field.

#### 27. Sync After Unlock

- **Steps**: Backup enabled. Lock app. Wait > 10s. Unlock.
- **Expected**: Sync triggers ~10s after unlock.
- **Storage Check**: Sync runs if state differs from cloud.

#### 28. Disable Backup

- **Steps**: Toggle backup OFF in settings.
- **Expected**: Auto-sync stops. Cloud file remains on Drive (not deleted).
- **Storage Check**: `T_ES_backup_state.autoSyncEnabled = false`.

## Recovery Kit & Mnemonic

#### 29. RecoveryKit Display

- **Steps**: Settings → Backup → "View Recovery Kit".
- **Expected**: 24 BIP39 words shown in 4-column grid. No word numbers. Copy/download available. QR code for device linking.
- **Storage Check**: No changes.

#### 30. QR Code Scanning for Recovery

- **Steps**: On new device, choose "Scan QR Code" during recovery. Point at recovery QR from another device.
- **Expected**: Scanner opens. QR decoded. Mnemonic verified via header auth tag.
- **Edge**: Non-Trezur QR → error. Camera denied → fallback to manual entry.

#### 31. Manual Recovery Entry

- **Steps**: Recovery flow → enter 24 words manually.
- **Expected**: Words validated as BIP39. Header auth tag verified. Backup adopted.
- **Edge**: Invalid words → clear error. Wrong words (valid BIP39, wrong key) → header verification fails → error.

## Edge Cases

#### 32. Storage Quota

- **Steps**: Add many tokens, monitor localStorage usage.
- **Expected**: Graceful failure if quota exceeded. User notified.
- **Storage Check**: Monitor for quota errors.

#### 33. Legacy Migration (v0 → v1 KDF)

- **Steps**: Manually set `T_ES_KDF_META` with `v: 0`. Set `T_ES_WRAPPED_MSK` with old-format wrapped data. Reload.
- **Expected**: KeyManager detects v0, upgrades to v1 metadata, re-wraps MSK with new salt/iterations. Tokens intact.
- **Storage Check**: `T_ES_KDF_META.v` becomes `1`. `T_ES_WRAPPED_MSK` re-wrapped.

#### 34. MSK Backup Self-Healing

- **Steps**: Set `T_ES_WRAPPED_MSK` to garbage. Set `T_ES_WRAPPED_MSK_BAK` to valid wrapped MSK. Reload and unlock.
- **Expected**: KeyManager detects corrupted primary, restores from backup, deletes backup.
- **Storage Check**: `T_ES_WRAPPED_MSK` restored. `T_ES_WRAPPED_MSK_BAK` absent.

#### 35. Concurrent Operations

- **Steps**: Import tokens while adding one manually.
- **Expected**: No race conditions. Both operations' tokens present.
- **Storage Check**: All tokens in vault.

#### 36. Offline Operation

- **Steps**: Disconnect network. Use app normally. Add/edit/delete tokens.
- **Expected**: All local operations work. Cloud sync defers.
- **Storage Check**: Local vault updated. Sync will catch up when online.

#### 37. Data Corruption

- **Steps**: Manually corrupt `T_ES_WRAPPED_MSK` in localStorage. Reload.
- **Expected**: App detects failed decryption. Falls back to lock screen state.
- **Storage Check**: Corrupted data detected, app doesn't crash.

## UI / UX

#### 38. Responsive Design

- **Steps**: Test on mobile (iOS Safari, Android Chrome) and desktop.
- **Expected**: Layout adapts. Touch targets adequate. Text readable.

#### 39. Keyboard Navigation

- **Steps**: Tab through all interactive elements.
- **Expected**: Focus visible. Forms operable. Dialogs trap focus.

#### 40. Service Worker / PWA

- **Steps**: Install as PWA. Use offline. Return online.
- **Expected**: App loads from cache offline. Updates when online.

## General Checks

- **No console errors**: Monitor for uncaught promises, init failures, React warnings.
- **Security**: Secrets never logged. Encrypted data not readable without key. No XSS vectors.
- **Performance**: Storage operations non-blocking. Token codes smooth. No excessive re-renders.
- **Data integrity**: No data loss during passcode changes, imports, or sync conflicts.
