# Cloud Sync

Trezur backs up 2FA tokens to Google Drive and can restore them on a new device. All tokens are encrypted with a user-controlled key before leaving the device.

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│ UI Layer                                                      │
│ BackupSettingsSection / RecoveryKit / RecoveryScannerDialog   │
├──────────────────────────────────────────────────────────────┤
│ Orchestration: cloud-sync.svelte.js (CloudSyncService)        │
│ auto-sync timer, enable/disable, scheduleSyncOnUserAction     │
├──────────────┬──────────────┬────────────────────────────────┤
│ sync-engine  │ gdrive.js    │ recovery.js                    │
│ fetch/upload │ Google Drive │ verify & adopt cloud backup    │
│ merge/resolve│ OAuth + REST │ from mnemonic                  │
├──────────────┴──────────────┴────────────────────────────────┤
│ Crypto: CloudFileVault (encrypt/decrypt .trzr) + fileformat  │
│ crypto-keys.js: MSK → payloadKey   bip39.js: MSK ↔ mnemonic  │
├──────────────────────────────────────────────────────────────┤
│ State: storage.svelte.js / tokens.svelte.js                   │
│ LocalKVVault (localStorage) + TokensCtx (LWW merge)          │
└──────────────────────────────────────────────────────────────┘
```

## Key Hierarchy

```
User Passcode (or device clientId if no passcode)
    │
    ▼ PBKDF2 (600,000 iterations, SHA-256, random 16-byte salt)
Local Wrapping Key (LWK, AES-256-GCM)
    │
    ├── wrap/unwrap ──► Master Secret Key (MSK, 32 random bytes)
    │                        │
    │                        ▼ importRawKey
    │                   Payload CryptoKey (AES-256-GCM)
    │                        │
    │                        ├── encrypts LocalKVVault (localStorage)
    │                        └── encrypts CloudFileVault (Google Drive)
    │
    └── MSK is convertible to a 24-word BIP39 mnemonic for recovery
```

The MSK is the root secret. Both local storage and cloud backups use the same payload key derived from it. The LWK is derived from the user's passcode (or the auto-generated device `clientId` if no passcode is set). Changing the passcode only re-wraps the MSK — tokens are never re-encrypted.

## TRZR File Format

Cloud backups are stored as a single `tokens.trzr` file in Google Drive's `appDataFolder`.

### Header (64 bytes)

| Offset | Size | Field                                             |
| ------ | ---- | ------------------------------------------------- |
| 0      | 4    | Magic: `TRZR` (ASCII)                             |
| 4      | 1    | Version: `0x01`                                   |
| 5      | 4    | Type descriptor: `TOKN` (ASCII)                   |
| 9      | 12   | Payload IV (AES-GCM nonce)                        |
| 21     | 16   | Auth Tag (AES-GCM over bytes 0–20)                |
| 37     | 6    | Snapshot time (48-bit big-endian, ms since epoch) |
| 43     | 21   | Reserved (zeros)                                  |

### Payload (decrypted JSON)

```json
{
	"tokens": {
		"<id>": {
			"id": "...",
			"account": "...",
			"secret": "...",
			"issuer": "...",
			"digits": 6,
			"period": 30,
			"algorithm": "SHA1",
			"type": "TOTP",
			"counter": 0,
			"updatedAt": {
				"account": 1700000000000,
				"issuer": 1700000000000,
				"secret": 1700000000000,
				"params": 1700000000000
			}
		}
	},
	"tombstones": {
		"<deleted_id>": 1700000000000
	}
}
```

## Header Authentication

The auth tag at offset 21 proves the file was encrypted with a specific MSK — without knowing the MSK, you can't produce a valid tag. This is used during recovery to verify a mnemonic before downloading the full backup.

**How it works:** An AES-GCM encrypt of empty plaintext with the first 21 bytes of the header (magic + version + type + IV) as `additionalData`. The resulting 16-byte auth tag is stored at offset 21. Verification decrypts the empty ciphertext+tag with the same AAD — if it resolves, the key matches.

A derived IV is used for the auth tag (payload IV byte 11 XOR'd with 0x01) to avoid nonce reuse with payload encryption.

## LWW Per-Field Merge

Conflict resolution uses Last-Writer-Wins at the field level.

### updatedAt Structure

Each token has four independent timestamps:

```js
updatedAt: {
  account: number,  // when account name last changed
  issuer:  number,  // when issuer last changed
  secret:  number,  // when secret last changed
  params:  number   // when period/digits/algorithm/type/counter last changed
}
```

### mergeTokens(local, cloud)

For each field group (account, issuer, secret, params):

- If `cloud.updatedAt[field] >= local.updatedAt[field]`: take cloud's value
- Otherwise: keep local's value
- Set the merged token's `updatedAt[field]` to the winner's timestamp

Cloud wins ties. Legacy tokens without `updatedAt` are treated as timestamp 0.

### resolveSyncConflicts(localState, cloudState)

1. **Merge tombstones**: For each cloud tombstone, keep the higher of local vs cloud timestamp.
2. **Merge tokens**: For each cloud token:
   - Not in local → adopt it (iff its max timestamp ≥ its tombstone timestamp)
   - In local → `mergeTokens(local[id], cloud[id])`
3. **Re-apply tombstones**: Delete any token whose tombstone timestamp ≥ its max field timestamp.

### Tombstones

Deleted tokens aren't removed from the file — they're recorded as tombstones: `{ "<id>": deletion_timestamp }`. This ensures a delete on one device propagates to others rather than being resurrected by a stale backup.

## Onboarding Flow

When a user toggles Google Drive Backup ON:

1. **Ensure passcode**: Prompts the user to set a passcode if none exists.
2. **OAuth sign-in**: Google Identity Services popup, scope `drive.appdata`.
3. **Check for existing backup**: `driveClient.findFile('tokens.trzr')`.

**Scenario A — Backup exists** (recovery / linking a new device):

1. Show RecoveryScannerDialog (QR scan or manual 24-word entry).
2. `verifyCloudBackupMnemonic(words)`: derives MSK from mnemonic, downloads the header of `tokens.trzr`, verifies the auth tag. Confirms the mnemonic matches without downloading the entire file.
3. `adoptCloudBackup(words)`: derives new MSK from mnemonic, re-wraps with current passcode, wipes local tokens and repopulates from cloud on next sync.
4. `cloudSyncService.enable()` — starts auto-sync.

**Scenario B — No backup exists** (fresh onboarding):

1. `rotateMSK()` — generates a fresh MSK, re-wraps with passcode.
2. Show RecoveryKit with 24-word mnemonic. User must confirm they've saved the words.
3. `cloudSyncService.enable()` — pushes first backup.

## Recovery Flow

Two pathways for restoring from a mnemonic:

**QR Code Scan (device-to-device):**

1. On source device: Settings → Backup → "Link Devices" → shows QR encoding the 24 words.
2. On new device: Toggle backup on → detects existing backup → "Scan QR Code".
3. Uses `qr/dom.js` for camera scanning. On scan, calls `adoptCloudBackup(words)`.

**Manual Entry:**

1. User types 24 space-separated BIP39 words.
2. `verifyCloudBackupMnemonic(words)`: derives MSK, downloads header, verifies auth tag.
3. On success, `adoptCloudBackup(words)` replaces the local MSK.

## Auto-Sync Engine

`CloudSyncService` (singleton, `src/lib/sync/cloud-sync.svelte.js`) manages sync timing.

### Intervals

| Trigger                 | Delay                              |
| ----------------------- | ---------------------------------- |
| Initial enable          | Immediate                          |
| Recurring               | 1 hour                             |
| Post-unlock             | 10 seconds                         |
| User token change       | 30 seconds (batches rapid changes) |
| Tab re-focus (if stale) | Immediate                          |

### Sync Loop

```
sync()
  ├─ Guard: already syncing? storage available?
  ├─ Loop (up to 4 attempts):
  │   ├─ fetchCloudState: download & decrypt tokens.trzr
  │   ├─ resolveSyncConflicts(local, cloud)
  │   ├─ tokensContext.setTokensAndTombstones(merged)
  │   ├─ State unchanged? → done
  │   └─ uploadCloudState: encrypt & upload with If-Match ETag
  │       └─ 412 Precondition Failed → retry with jitter (100–250ms)
  └─ Persist local vault
```

## Google Drive Integration

`DriveClient` (`src/lib/sync/gdrive.js`) handles OAuth and API calls.

### OAuth

- Library: Google Identity Services (`accounts.google.com/gsi/client`)
- Flow: Implicit (token returned directly in callback)
- Scope: `https://www.googleapis.com/auth/drive.appdata` — private per-app folder, invisible in user's Drive UI
- Token caching: In-memory `accessToken` with `tokenExpiry` (actual expiry minus 60s buffer)

### API Operations

| Method                      | Endpoint                                    | Notes                                                           |
| --------------------------- | ------------------------------------------- | --------------------------------------------------------------- |
| `findFile(filename)`        | `GET /drive/v3/files?q=name='...'`          | Cached for 5 minutes                                            |
| `download(filename)`        | `GET /drive/v3/files/{id}?alt=media`        | Returns `{ data, etag }`, supports Range headers                |
| `upload(filename, content)` | `POST` (create) or `PATCH` (update with id) | Multipart upload, `If-Match: {etag}` for optimistic concurrency |

### Token Lifecycle

- `signIn()` — explicit consent, opens Google popup
- `signInSilent()` — tries silent refresh on page load
- `ensureToken()` — checks expiry before every API call, refreshes if needed
- `signOut()` — revokes token via Google API, clears local state

## Source Files

| File                                                   | Role                                                         |
| ------------------------------------------------------ | ------------------------------------------------------------ |
| `src/lib/sync/cloud-sync.svelte.js`                    | Sync orchestrator: timing, enable/disable, sync loop         |
| `src/lib/sync/sync-engine.js`                          | fetchCloudState, uploadCloudState, resolveSyncConflicts      |
| `src/lib/sync/gdrive.js`                               | Google Drive OAuth client, file operations                   |
| `src/lib/sync/recovery.js`                             | verifyCloudBackupMnemonic, adoptCloudBackup                  |
| `src/lib/sync/fileformat.js`                           | TRZR binary format: assembleCloudFile, parseCloudFile        |
| `src/lib/utils/cloud-file-vault.js`                    | CloudFileVault: encrypt/decrypt with header auth             |
| `src/lib/utils/crypto-keys.js`                         | deriveLWK, generateMSK, wrapMSK, unwrapMSK, importPayloadKey |
| `src/lib/utils/bip39.js`                               | mskToMnemonic, mnemonicToMSK (BIP39 ↔ 32-byte entropy)       |
| `src/lib/utils/cache.js`                               | ExpiringMap for file ID caching                              |
| `src/lib/state/storage.svelte.js`                      | createCloudVault(), adoptMSK(), rotateMSK()                  |
| `src/lib/state/tokens.svelte.js`                       | TokensCtx: token store with LWW merge support                |
| `src/lib/components/sync/BackupSettingsSection.svelte` | Backup toggle UI, onboarding flow                            |
| `src/lib/components/sync/RecoveryKit.svelte`           | Display/share recovery words or QR                           |
| `src/lib/components/sync/RecoveryScannerDialog.svelte` | QR scanner + manual recovery entry                           |
