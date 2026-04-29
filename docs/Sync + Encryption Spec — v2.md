# Sync + Encryption Spec — v2 (Mnemonic & Recovery Kit)

**Purpose:** Securely encrypt a single cloud-backed token backup. Access is granted via an existing authorized device (QR scan) or a physical Recovery Kit (24 words). No Master Password is used.

**High-level constraints**

- Browser-only implementation, use WebCrypto (`crypto.subtle`) only (no WASM).
- **Zero-Password:** Root of trust is a 32-byte Master Sync Key (MSK).
- **LocalStorage:** All local persistent data (tokens + wrapped MSK) resides in `localStorage`.
- Single cloud file containing both metadata and encrypted payload.
- Metadata (non-secret) kept in the file header so the client can decide whether to download the encrypted payload.
- Merge strategy: per-field LWW for `account` and `issuer`, token-level LWW for everything else.

---

## Terminology

- **MSK** — Master Sync Key: 32 random bytes used to encrypt token payload (AES-256-GCM).
- **Mnemonic** — The 24-word BIP-39 representation of the MSK (The "Recovery Kit").
- **LWK** — Local Wrap Key: derived from a **Local PIN** via PBKDF2. Used only to encrypt (wrap) the MSK when stored in `localStorage`.
- **Header** — fixed-size binary area at start of file containing magic/version + offsets + MSK verification hash.
- **MetadataJSON** — small plaintext JSON after the header containing per-token timestamps and deleted tombstones (no secrets).
- **Payload** — AES-GCM ciphertext of `tokens` JSON, encrypted with MSK.

---

## File layout (byte-offset reference)

All multibyte numbers are big-endian.

```
[0..3]    4 bytes   magic = "TOKN"
[4]       1 byte    version = 2
[5..8]    4 bytes   metadata_length (uint32)   // JSON metadata bytes
[9..12]   4 bytes   payload_length (uint32)    // ciphertext payload bytes
[13..24]  12 bytes  payload_iv (raw bytes)     // IV for the main payload
[25..56]  32 bytes  key_check_value            // SHA-256 hash of the MSK
[57..127] reserved/padding (71 bytes) -> header total 128 bytes
[128..(128+metadata_length-1)]  metadata JSON (UTF-8 plaintext)
[(128+metadata_length)..(128+metadata_length+payload_length-1)]  ciphertext payload (raw bytes)
```

**Notes:**

- `key_check_value` allows the app to verify if a scanned QR or typed mnemonic is correct _before_ attempting decryption.
- Header remains 128 bytes for efficient range reads.

---

## Metadata JSON schema (plaintext — small)

```json
{
  "version": 2,
  "tokens": {
    "<id>": {
      "updatedAt": {
        "account": 169...,
        "issuer": 169...
      }
    }
  },
  "deleted": { "<id>": 169... }
}
```

- No wrapped keys are stored in the cloud. The cloud only holds the encrypted data and the metadata to manage it.

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

---

## Cryptographic parameters

- **MSK:** 32 random bytes (`crypto.getRandomValues`).
- **Mnemonic:** BIP-39 English (24 words).
- **Local Wrap:** PBKDF2-HMAC-SHA256 (600,000 iterations) to derive LWK from a Local PIN.
- **Encryption:** AES-256-GCM for both local wrap and cloud payload.
- **Local Storage:** Store the `wrapped_msk` (ciphertext + IV + salt) in `localStorage`.

---

## Core operations (TypeScript signatures)

```ts
// MSK Generation & Recovery
function generateMSK(): Uint8Array;
function mskToMnemonic(msk: Uint8Array): string; // Returns 24 words
function mnemonicToMSK(words: string): Uint8Array;

// Local persistence (localStorage)
async function deriveLocalWrapKey(pin: string, salt: Uint8Array): Promise<CryptoKey>;
async function wrapMSK(msk: Uint8Array, lwk: CryptoKey): Promise<{ iv: Uint8Array; data: Uint8Array }>;
async function unwrapMSK(wrapped: Uint8Array, iv: Uint8Array, lwk: CryptoKey): Promise<Uint8Array>;

// Cloud operations
async function encryptPayload(msk: Uint8Array, plaintext: string): Promise<{ iv: Uint8Array; data: Uint8Array }>;
async function decryptPayload(msk: Uint8Array, iv: Uint8Array, data: Uint8Array): Promise<string>;
```

---

## High-level flows

### A. Initial device (first-run)

1. Generate `MSK`.
2. Generate `Mnemonic` (24 words) and display to user as their "Recovery Kit."
3. Require user to set a **Local PIN**.
4. Derive `LWK` from PIN, `wrapMSK`, and store the result in `localStorage`.
5. Encrypt tokens with `MSK` and upload to cloud.

### B. Unified Discovery/Onboarding (New Device or Restoring)

1. User connects Google Drive.
2. App reads header (bytes 0-127). If `magic == "TOKN"`, an existing backup is found.
3. **Prompt User:** "Existing Backup Found. To unlock, scan the QR code from another device or enter your 24-word Recovery Phrase."
4. **Key Acquisition:**
   - **QR:** User scans QR from Device A. The QR contains the **24 words**.
   - **Manual:** User types the 24 words.
5. **Validation:** Convert words to MSK. Hash the MSK and compare to `key_check_value` in the header.
6. **Persistence:** Once validated, prompt user for a **Local PIN** (specific to this device). Wrap MSK and save to `localStorage`.
7. Proceed to download payload and merge.

---

## Merge logic & Cloud IO

- Remains identical to v1 spec (LWW per-field merge, `cloudPutFileIfMatch` for etag-based conflict resolution).

---

## Error handling / UX behaviors

- **Wrong Key:** If the hash of the provided words doesn't match `key_check_value`, show "Invalid Recovery Phrase" and do not download the payload.
- **Background Sync:** The `MSK` is kept in memory while the app is open. If the app is refreshed, the user must enter their **Local PIN** to unwrap the MSK from `localStorage` before sync can resume.

---

## Deliverable checklist for AI agent

1. Implement `sync/crypto.ts` with WebCrypto + BIP-39 logic.
2. Implement `sync/storage.ts` for `localStorage` wrappers (saving/loading the wrapped MSK).
3. Implement `sync/fileformat.ts` for the 128-byte header and binary assembly.
4. Implement `sync/engine.ts` for the unified Discovery flow and merge logic.
5. Add automated tests for the Mnemonic <-> MSK roundtrip and Local Wrap/Unwrap logic.

---

### Security Note on QR Codes

The QR code should encode the 24 words as a plain string. This allows any standard QR scanner to read the words if necessary, but the app should handle the scan internally to immediately convert those words into the MSK and proceed with the "Localize" flow.

Since the goal is to keep things simple for the user while maintaining high security, this spec ensures they only ever have to worry about two things: their **Local PIN** (for daily use) and their **24 words** (for new devices/emergencies).
