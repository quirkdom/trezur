# Sync + Encryption Spec — v1 (Master Password first, progressive enhancements later)

**Purpose:** securely encrypt a single cloud-backed token backup so any device that knows the _Master Password_ and has the cloud auth can sync & decrypt. Later we will add recovery codes and per-device wraps.

**High-level constraints**

- Browser-only implementation, use WebCrypto (`crypto.subtle`) only (no WASM).
- Single cloud file containing both metadata and encrypted payload (so range reads work).
- Metadata (non-secret) kept in the file header so the client can decide whether to download the encrypted payload.
- JSON payload for tokens (plaintext before encryption) per earlier schema; final file is binary container: `[Header][MetadataJSON][CiphertextPayload]`.
- Merge strategy: per-field LWW for `account` and `issuer`, token-level LWW for everything else as previously described. Use `lastUpdatedTs` per-field.

---

## Terminology

- **MSK** — Master Sync Key: 32 random bytes used to encrypt token payload (AES-256-GCM).
- **MK** — MasterKey: derived from user Master Password via PBKDF2. MK is used to encrypt (wrap) MSK.
- **Header** — fixed-size binary area at start of file containing magic/version + KDF params + lengths + wrapped MSK metadata + offsets.
- **MetadataJSON** — small plaintext JSON after the header containing per-token timestamps and deleted tombstones (no secrets).
- **Payload** — AES-GCM ciphertext of `tokens` JSON, encrypted with MSK.

---

## File layout (byte-offset reference)

All multibyte numbers are big-endian.

```
[0..3]    4 bytes   magic = "TOKN"
[4]       1 byte    version = 1
[5]       1 byte    kdf_id (1 = PBKDF2-SHA256)
[6..9]    4 bytes   kdf_iterations (uint32)
[10]      1 byte    salt_len (uint8)
[11]      1 byte    wrapped_msk_iv_len (uint8)  // IV used to wrap MSK with MK
[12..15]  4 bytes   metadata_length (uint32)   // JSON metadata bytes
[16..19]  4 bytes   payload_length (uint32)    // ciphertext payload bytes
[20..35]  16 bytes  salt (actual used bytes == salt_len; remaining zero-padded)
[36..51]  16 bytes  wrapped_msk_iv (actual used bytes == wrapped_msk_iv_len; zero padded)
[52..127] reserved/padding (76 bytes) -> header total 128 bytes
[128..(128+metadata_length-1)]  metadata JSON (UTF-8 plaintext)
[(128+metadata_length)..(128+metadata_length+payload_length-1)]  ciphertext payload (raw bytes)
```

**Notes:**

- Header is exactly 128 bytes to support `Range: bytes=0-127` reads.
- `wrapped_msk` ciphertext bytes are stored inside the metadata JSON (so file header only holds IV/salt and lengths). This keeps header small; the metadata JSON contains the `wrapped_msk.data` as base64 or byte array.

---

## Metadata JSON schema (plaintext — small)

```json
{
  "version": 1,
  "tokens": {
    "<id>": {
      "updatedAt": {
        "account": 169...,
        "issuer": 169...
      }
    }
  },
  "deleted": { "<id>": 169... },
  "wrapped_msk": {
     "iv": "<base64>",       // IV used to wrap MSK with MK
     "data": "<base64>"      // AES-GCM ciphertext of MSK (32 bytes) using MK
  }
}
```

- `wrapped_msk` MUST be present and is the only way to retrieve MSK. It is encrypted with MK (derived from Master Password).
- Nothing in metadata reveals secrets (only timestamps + wrapped MSK ciphertext).

---

## Plaintext payload (JSON to encrypt with MSK)

```json
{
  "tokens": {
    "<id>": {
      "data": {
        "id": "...",
        "account": "...",
        "secret": "...",
        "digits": 6,
        "period": 30,
        "issuer": "...",
        "type": "TOTP",
        "algorithm": "SHA1",
        "counter": 0,
        "lastUpdatedTs": 169...
      },
      "meta": {
        "updatedAt": { "account": 169..., "issuer": 169... }
      }
    }
  },
  "lastTs": 169...
}
```

Encrypt exactly this JSON with AES-GCM using MSK and store resulting raw ciphertext as the payload bytes. Persist the `payload_length` and `payload_iv` in header.

---

## Cryptographic parameters (recommended)

- PBKDF2-HMAC-SHA256 for Master Password → MK. Iterations: **200000** (tune for desired latency).
- Salt: 16 bytes random (per file), placed in header.
- MSK: 32 random bytes (crypto.getRandomValues).
- All AES-GCM IVs: 12 bytes random.
- AES-GCM tag handled by WebCrypto and embedded in ciphertext bytes returned by `subtle.encrypt`.

**Rationale:** no WASM, WebCrypto native; parameters are reasonably strong for browser-only use.

---

## Core operations (TypeScript signatures)

Implement these methods in a `sync/crypto.ts` module (browser):

```ts
// derive MK from passphrase (returns CryptoKey for AES-GCM)
async function deriveMasterKey(passphrase: string, salt: Uint8Array, iterations: number): Promise<CryptoKey>;

// generate MSK
function generateMSK(): Uint8Array; // 32 bytes

// wrap MSK with MK => returns { iv: Uint8Array, data: Uint8Array }
async function wrapMSK(mk: CryptoKey, msk: Uint8Array): Promise<{ iv: Uint8Array; data: Uint8Array }>;

// unwrap MSK with MK => returns Uint8Array (msk)
async function unwrapMSK(mk: CryptoKey, iv: Uint8Array, data: Uint8Array): Promise<Uint8Array>;

// encrypt payload (plaintext JSON string) with MSK => {iv, data}
async function encryptPayload(
	msk: CryptoKey | CryptoKeyLike,
	plaintext: string
): Promise<{ iv: Uint8Array; data: Uint8Array }>;

// decrypt payload (iv,data) with MSK => plaintext string
async function decryptPayload(mskKey: CryptoKey, iv: Uint8Array, data: Uint8Array): Promise<string>;
```

**Note:** `deriveMasterKey` should `importKey('raw')` with passphrase bytes and then `deriveKey` to an AES-GCM CryptoKey.

---

## High-level flows

### A. Initial device (first-run)

1. Require user to set Master Password (5 words or custom).
2. Generate `salt` (16 bytes) for PBKDF2; store in header.
3. `MK = deriveMasterKey(passphrase, salt, iterations)`.
4. `MSK = generateMSK()`.
5. `wrapped = wrapMSK(MK, MSK)` → store `wrapped.data` and `wrapped.iv` inside `metadata.wrapped_msk` (base64).
6. Build plaintext payload JSON (tokens) and `payload_iv = random12`, `ciphertext = encryptPayload(MSK, JSON)`.
7. Set header fields: `kdf_iterations`, `salt_len`, `wrapped_msk_iv_len`, `metadata_length`, `payload_length`, `payload_iv`.
8. Write file: header (128 bytes) + metadata JSON + ciphertext payload. Upload to cloud (`PUT`) using conditional write if desired. Save `etag` locally.

### B. Subsequent device (connect)

1. Device collects Master Password from user (mandatory).
2. Fetch header bytes (range `0-127`).
3. Parse header, read `metadata_length`. Range-read metadata (next range).
4. Parse metadata JSON and locate `wrapped_msk` (base64).
5. Derive MK from given Master Password and header salt/iterations.
6. Attempt `unwrapMSK(MK, wrapped.iv, wrapped.data)`.
   - If success → MSK recovered.
   - If failure → report "Wrong master password" to user.

7. If MSK recovered and metadata comparison shows payload required, download payload (range read) and `decryptPayload(MSK, iv, ciphertext)`.
8. Merge local and remote metadata (per-field LWW). If changes require an upload, assemble merged plaintext, encrypt with MSK, re-upload using conditional write (`If-Match` with etag) and update `etag`.

**Edge cases:** if `unwrapMSK` fails and user has no backup, inform them that data is unrecoverable.

---

## Merge logic (when payload is downloaded)

- For each token id in union(localIDs, remoteIDs):
  - If token exists only in local → keep local.
  - If only remote → keep remote.
  - If both → for `account` and `issuer` use `meta.updatedAt.field` per-field LWW:
    - mergedValue.field = value from side with higher `meta.updatedAt.field`.

  - For all other token fields, use `data.lastUpdatedTs` (token-level LWW). If token non-editable fields differ, treat as duplicate import (raise flagged error or present merge UI).

- Tombstones: `deleted[id]` timestamp beats tokens if `deletedAt > token.field.updatedAt` for both fields; delete locally.
- After merging, recalc `lastTs` as max of token timestamps and set per-token `lastUpdatedTs` appropriately.

---

## Cloud IO primitives (abstract API)

AI agent should implement an adapter with these functions:

```ts
// returns header bytes (Uint8Array) or HTTP HEAD equivalent object
async function cloudGetHeader(filePath: string): Promise<Uint8Array>;

// returns a byte range [start, end] inclusive as Uint8Array
async function cloudGetRange(filePath: string, start: number, end: number): Promise<Uint8Array>;

// conditional upload: write entire file only if etag matches (etag may be null for initial)
async function cloudPutFileIfMatch(
	filePath: string,
	fileBytes: Uint8Array,
	ifMatchEtag?: string
): Promise<{ success: boolean; newEtag?: string }>;
```

- Implementations: S3 adapter (use `If-Match`/`If-None-Match`), Google Drive AppData adapter (use `If-Match` header if available) or a download/upload + object version semantics.

---

## Error handling / UX behaviors

- If `unwrapMSK` fails:
  - Show `Wrong Master Password` dialog. Allow retries.
  - If user cancels, do not attempt payload download.

- If download header shows different `kdf_iterations` or `salt` unsupported: show migration error.
- If `cloudPutFileIfMatch` returns `etag mismatch`:
  - Re-fetch header+metadata, re-evaluate merge; re-merge and retry up to 3 attempts; if still failing, present UI describing conflict with options: retry, overwrite (force), or create branch (rename remote).

- If decryption of payload fails after successful unwrap: treat as corruption — show "backup corrupted" UI.

---

## Tests & QA (for the AI agent to implement)

Create automated tests (node + jsdom or headless browser):

1. **Crypto round-trip**
   - deriveMasterKey -> wrapMSK -> unwrapMSK -> assert equality.
   - encryptPayload -> decryptPayload with MSK -> assert plaintext matches.

2. **File serialization round-trip**
   - Build header+metadata+payload, then parse header, read metadata, decrypt payload.

3. **Metadata-only decision**
   - Given local metadata and cloud metadata, assert the logic decides **no payload download** when identical, and **payload required** when cloud has newer timestamps or missing tokens.

4. **Concurrent writes**
   - Simulate two devices changing different tokens, test merge correctness and conditional write conflict resolution (etag mismatch -> re-merge).

5. **Wrong Master Password**
   - Ensure unwrapMSK fails fast and does not download payload.

6. **Migration test**
   - Simulate header version mismatch and ensure graceful error.

---

## Minimal API surface for the rest of the app (to be called by UI)

```ts
// Unlock & sync (on connect)
async function unlockAndSync(
	filePath: string,
	masterPassword: string
): Promise<{ mergedTokens: Tokens; newEtag?: string }>;

// Local mutation (add/update/remove token) -> persist local and schedule background sync
async function localMutateAndSync(mutation: TokenMutation): Promise<void>;

// Force sync (manual)
async function forceSyncNow(): Promise<void>;
```

- `unlockAndSync` should:
  - read header + metadata
  - unwrap MSK with the provided password
  - decide whether to download payload
  - if payload needed, download + decrypt
  - merge with local, maybe write back (conditional)
  - return merged tokens for the UI to display

---

## Migration & Progressive Enhancement Roadmap

**v1 (this spec):** Master Password only (mandatory on each device). `wrapped_msk` stored in metadata. No recovery code. No per-device wraps. Cloud MSK accessible only to users who know Master Password.

**v1.1 (short-term):** Add ability to rotate Master Password:

- UI flow: provide old password -> derive MK_old -> unwrap MSK -> derive MK_new -> re-wrap MSK with MK_new -> update metadata header (no re-encrypt of payload necessary).

**v1.2 (recovery):** Add Recovery Code support:

- Generate RecoveryCode (24 random words or 128–256 bits) on first-run, show user, ask them to confirm saving.
- Create `wrapped_msk_recovery` field in metadata (ciphertext + iv), alongside `wrapped_msk`.
- On restore, accept either Master Password or Recovery Code to unwrap MSK.

**v1.3 (per-device wraps):** Allow per-device passcodes wrapping:

- Each device wraps MSK with a device-specific key (derived from device passcode & deviceSalt).
- Store these wrapped entries in `wrapped_devices` map in metadata (deviceId -> wrappedBlob).
- Allow enrolling/unenrolling devices, revocation (remove device entry + optionally rotate MSK and re-encrypt payload).

**v1.4 (optional harder):** Implement device-pairing QR fallback for onboarding if user disables recovery & cloud-wrapped MSK.

---

## Security notes & UX guidance (to include in UI copy)

- Make Master Password mandatory and display clear copy: _“Your Master Password is required to encrypt and decrypt your tokens. If you lose it, your backup cannot be recovered.”_
- Provide an optional “Export Recovery Code” feature (future) and strongly encourage the user to store it offline.
- When a user tries a wrong password, fail fast and do not download the entire payload; inform them of wrong password attempt.
- If user desires convenience over security, offer an option “store wrapped MSK in cloud unprotected by master password” — but default to safe: `wrapped_msk` must exist.

---

## Deliverable checklist for AI agent

1. Implement `sync/crypto.ts` with WebCrypto functions listed above.
2. Implement `sync/fileformat.ts` for header encoding/decoding, metadata JSON builder/parser, and file assembly/disassembly.
3. Implement `sync/cloud-adapter.ts` with `cloudGetHeader`, `cloudGetRange`, `cloudPutFileIfMatch`. Provide S3 and Google Drive appdata stubs.
4. Implement `sync/engine.ts` that coordinates: `unlockAndSync`, `localMutateAndSync`, merge logic, retry-on-etag-mismatch.
5. Add automated unit tests described above.
6. Add minimal UI integration hooks (`unlockAndSync`, `localMutateAndSync`) usable by the app.
7. Add a short README listing the header format, parameter choices, and "how to change KDF params" steps.

---

## Example small code snippet (derive + wrap + encrypt payload)

```ts
// deriveMasterKey example
async function deriveMasterKey(passphrase, salt, iterations) {
	const enc = new TextEncoder();
	const baseKey = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
	return crypto.subtle.deriveKey(
		{ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
		baseKey,
		{ name: 'AES-GCM', length: 256 },
		false,
		['encrypt', 'decrypt']
	);
}

// wrapMSK
async function wrapMSK(mk, mskBytes) {
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const c = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, mk, mskBytes);
	return { iv: Array.from(iv), data: Array.from(new Uint8Array(c)) };
}

// encryptPayload
async function encryptPayloadRaw(mskCryptoKey, plaintextStr) {
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const p = new TextEncoder().encode(plaintextStr);
	const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, mskCryptoKey, p);
	return { iv: Array.from(iv), data: Array.from(new Uint8Array(ct)) };
}
```

---

## Final notes

- This spec is intentionally pragmatic: Master Password-based unwrapping provides strong security and simple onboarding where any device that knows the Master Password and cloud credentials can sync without pairing.
- The header + metadata-first layout supports bandwidth-efficient decision making (range reads).
- Progressive enhancements (Recovery Code, per-device wraps) are explicitly supported by the metadata design; adding them later is straightforward, requiring additional `wrapped_*` entries in metadata.
