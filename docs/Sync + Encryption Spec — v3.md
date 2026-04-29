# Sync + Encryption Spec — v3 (Mnemonic-First & Local PIN)

**Purpose:** Securely encrypt a single cloud-backed token backup. Access is rooted in a 32-byte Master Sync Key (MSK), managed via a 24-word Recovery Kit. No Master Password is used for the cloud.

**High-level constraints**

- **Browser-only:** WebCrypto (`crypto.subtle`) only. No WASM.
- **Zero-Password:** The MSK is the root secret.
- **LocalStorage:** Persistent storage for tokens and the "wrapped" MSK.
- **Single Cloud File:** Binary container holding Header, Metadata, and Ciphertext.
- **LWW Merge:** Per-field conflict resolution using timestamps.

---

## Terminology

- **MSK** — Master Sync Key: 32 random bytes (AES-256) used for all cloud encryption.
- **Mnemonic** — The 24-word BIP-39 representation of the MSK.
- **LWK** — Local Wrap Key: Derived from the **Local PIN** via PBKDF2 to secure the MSK on-disk.
- **Header** — 128-byte binary prefix with offsets and a hash for MSK verification.
- **MetadataJSON** — Plaintext JSON sync data (timestamps/tombstones).
- **Payload** — AES-256-GCM ciphertext of the actual 2FA tokens.

---

## File layout (128-byte Header)

All multibyte numbers are big-endian.

```
[0..3]    4 bytes   magic = "TOKN"
[4]       1 byte    version = 3
[5..8]    4 bytes   metadata_length (uint32)
[9..12]   4 bytes   payload_length (uint32)
[13..24]  12 bytes  payload_iv (raw bytes)
[25..56]  32 bytes  key_check_value (SHA-256 hash of the MSK)
[57..127] reserved/padding (71 bytes)
[128..(128+metadata_length-1)]  metadata JSON (UTF-8)
[(128+metadata_length)..(...)]   ciphertext payload (raw bytes)
```

---

## Cryptographic Parameters

- **MSK:** 32 random bytes.
- **KDF for Local PIN:** PBKDF2-HMAC-SHA256, **600,000 iterations**.
- **Local Wrap:** AES-256-GCM.
- **Mnemonic:** BIP-39 English (24 words).

---

## Core Operations (`sync/crypto.ts`)

```ts
// MSK & Mnemonic
function generateMSK(): Uint8Array;
function mskToMnemonic(msk: Uint8Array): string; // 24 words
function mnemonicToMSK(words: string): Uint8Array;

// Local Persistence
async function deriveLocalWrapKey(pin: string, salt: Uint8Array): Promise<CryptoKey>;
async function wrapMSK(
	msk: Uint8Array,
	lwk: CryptoKey
): Promise<{ iv: Uint8Array; data: Uint8Array; salt: Uint8Array }>;
async function unwrapMSK(wrapped: Uint8Array, iv: Uint8Array, lwk: CryptoKey): Promise<Uint8Array>;

// Cloud Logic
async function encryptPayload(msk: Uint8Array, plaintext: string): Promise<{ iv: Uint8Array; data: Uint8Array }>;
async function decryptPayload(msk: Uint8Array, iv: Uint8Array, data: Uint8Array): Promise<string>;
```

---

## High-Level Flows

### A. Initial Setup (Device 1)

1. **MSK Generation:** App creates the 32-byte MSK.
2. **Recovery Kit:** App displays the 24 words in a **6 x 4 grid**.
   > **UI Note:** The words must be numbered 1–24. The user should be forced to click "I have saved these" and potentially pass a "Check" (e.g., "What was word #7?") before the MSK is saved.
3. **Localize:** User sets a **Local PIN**. App derives LWK, wraps the MSK, and saves to `localStorage` as `local_msk_blob`.
4. **Cloud Push:** App hashes MSK for the header `key_check_value`, encrypts tokens, and uploads to GDrive.

### B. Unified Discovery (New Device / Restore)

1. User connects GDrive; App detects `TOKN` file.
2. **Key Challenge:** App shows a screen with two options:
   - **Scan QR:** Displays a camera view. Expects a QR containing the 24 words.
   - **Type Phrase:** Displays 24 input fields for the words.
3. **Verification:** App converts words to MSK, hashes it, and checks against the cloud header's `key_check_value`.
4. **Localize:** Upon match, user sets a **Local PIN** for _this_ device. MSK is wrapped and stored in `localStorage`.

### C. Background Sync

- **Locked State:** App requires Local PIN to unwrap the MSK from `localStorage`.
- **Active State:** MSK is held in a non-exportable variable. Sync runs every 5 minutes (Merge -> Encrypt -> Upload).

---

## Future Ideas & Roadmap

### 1. WebAuthn / Passkey Integration

Instead of a 6-digit Local PIN, use **WebAuthn (Passkeys)** to secure the local MSK.

- **Mechanism:** Use the `prf` extension (where available) to derive a hardware-backed key.
- **Benefit:** The user can unlock the vault with Biometrics (FaceID/TouchID). The hardware itself "releases" the key needed to unwrap the MSK, making the local storage significantly more resistant to forensic extraction.

### 2. Biometric Fallback

On mobile browsers supporting the **WebHID or WebAuthn** APIs, we can use a "Platform Authenticator" to store a local encryption key. This allows the user to never even type a Local PIN, relying entirely on the device's secure enclave to protect the MSK sitting in `localStorage`.

---

## Deliverable Checklist for Agent

1. **Crypto Module:** Implement AES-GCM and PBKDF2. Use a lightweight BIP-39 library for the 24-word logic.
2. **UI Grid:** Create the 6x4 Recovery Kit view.
3. **Storage:** Implement the `localStorage` logic for the `wrapped_msk` (storing the salt, IV, and ciphertext).
4. **Sync Engine:** Implement the "Download -> Merge -> Upload" loop with Etag checking.
5. **QR Generator:** Implement a utility to generate a QR code from the 24-word string for the "Add Device" feature.

---

### Mnemonic Grid Layout (Reference for UI)

|            |            |            |            |
| :--------- | :--------- | :--------- | :--------- |
| 1. [word]  | 2. [word]  | 3. [word]  | 4. [word]  |
| 5. [word]  | 6. [word]  | 7. [word]  | 8. [word]  |
| 9. [word]  | 10. [word] | 11. [word] | 12. [word] |
| 13. [word] | 14. [word] | 15. [word] | 16. [word] |
| 17. [word] | 18. [word] | 19. [word] | 20. [word] |
| 21. [word] | 22. [word] | 23. [word] | 24. [word] |
