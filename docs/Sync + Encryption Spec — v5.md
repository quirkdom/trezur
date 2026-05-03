# TREZUR Sync + Encryption Spec — v5.2 (Multi-File & Unified Payload)

**Purpose:** A local-first, zero-knowledge encryption and synchronization protocol for 2FA tokens and application metadata.
**Root of Trust:** A 32-byte random **Master Sync Key (MSK)**.
**Access Model:** No cloud password. Access is granted via a 24-word Recovery Kit (BIP-39) or local device authentication (PIN/Passcode).

---

## 1. High-Level Architecture

- **Multi-File Cloud Storage:** Each data entity is stored as an independent `.trzr` file (e.g., `tokens.trzr`, `prefs.trzr`) on Google Drive/S3.
- **Self-Describing Headers:** Each file contains a 64-byte binary header with metadata for verification and decryption.
- **Field-Level LWW Merge:** Conflicts are resolved at the individual field level using timestamps stored inside the encrypted JSON payload.
- **Local-First:** Data is stored in `localStorage`. The MSK is stored in a "wrapped" state, protected by a high-iteration PBKDF2 key derived from a **Local PIN**.

---

## 2. Binary File Layout (`.trzr`)

All multibyte numbers are **big-endian**. The payload starts exactly at byte 64.

| Offset    | Size     | Field       | Description                                             |
| :-------- | :------- | :---------- | :------------------------------------------------------ |
| `0..3`    | 4 bytes  | `magic`     | Hardcoded: `TRZR`                                       |
| `4`       | 1 byte   | `version`   | Current version: `5`                                    |
| `5..8`    | 4 bytes  | `type`      | Payload type (UTF-8): `TOKN`, `PREF`, or `LOGS`         |
| `9..20`   | 12 bytes | `iv`        | Unique random IV for AES-256-GCM                        |
| `21..52`  | 32 bytes | `key_check` | `SHA-256(MSK)` used to verify the key before decryption |
| `53..63`  | 11 bytes | `reserved`  | Zero-padded for future flags (e.g., compression)        |
| `64..end` | Variable | `payload`   | AES-256-GCM ciphertext + 16-byte Auth Tag               |

---

## 3. Cryptographic Parameters

### Cloud Encryption (High Entropy)

- **Algorithm:** AES-256-GCM.
- **Key:** The 32-byte MSK used **directly** as the cipher key (no secondary KDF).
- **IV:** 12-byte random value, regenerated for **every** write.

### Local MSK Wrapping (Low Entropy)

To protect the MSK in `localStorage` against physical theft of the device, it must be wrapped using a key derived from the **Local PIN**.

- **KDF:** PBKDF2-HMAC-SHA256.
- **Iterations:** $600,000$.
- **Salt:** 16 bytes of random data.
- **Storage Key:**
  - `T_ES__wrapped_msk__` (JSON object containing ciphertext `data` and `iv`).
  - `T_ES_kdf_meta__` (JSON object containing algorithm `name`, `hash` function, `salt`, and `iterations`).

---

## 4. Encrypted Token Payload Structure (JSON)

The decrypted payload for `tokens.trzr` must follow this schema to support field-level merging:

```json
{
	"version": 5,
	"lastSyncTs": 1714345200,
	"tokens": {
		"<uuid>": {
			"data": {
				"id": "<uuid>",
				"account": "user@example.com",
				"issuer": "Service",
				"secret": "...",
				"type": "TOTP",
				"digits": 6,
				"period": 30,
				"algorithm": "SHA1",
				"counter": 0
			},
			"updatedAt": {
				"account": 1714345000,
				"issuer": 1714345000,
				"secret": 1714345000,
				"params": 1714345000
			}
		}
	},
	"tombstones": {
		"<deleted-uuid>": 1714345100
	}
}
```

---

## 5. Core Operational Flows

### A. Onboarding (New vs. Returning)

1.  **Initial Load:** Generate a temporary MSK. User can add tokens locally.
2.  **Cloud Connect:** Login to Google Drive and check for an existing `tokens.trzr`.
3.  **Branch - Existing Backup:**
    - Prompt user to scan a QR code (containing 24 words) or type the 24-word phrase.
    - Verify against `key_check` in the cloud header.
    - If valid, adopt the cloud MSK and discard the temporary one.
4.  **Branch - New Backup:**
    - Display the MSK as a 24-word **Recovery Kit** in a **6 x 4 numbered grid**.
    - Force user to confirm they have saved the phrase.
5.  **Localize:** Ask user for a **Local PIN**. Wrap the MSK and store it in `localStorage`.

### B. Sync & Merge Algorithm

1.  **Poll:** Check the cloud file's ETag. If changed, download the `.trzr` file.
2.  **Decrypt:** Use the MSK and the IV from the header.
3.  **Merge:**
    - Iterate through all token IDs.
    - For fields `account`, `issuer`, and `secret`, the value with the highest `updatedAt` timestamp wins.
    - If a token ID is present in `tombstones` with a timestamp newer than the token's latest `updatedAt`, delete the token.
4.  **Push:** After merge, encrypt with a **new random IV**, update the header, and upload.

---

## 6. UI/UX Requirements

- **The Recovery Grid:** 24 words must be displayed in a 6-row, 4-column grid, clearly numbered 1 to 24.
- **The QR Code:** The "Add Device" feature must generate a QR code encoding the 24-word mnemonic as a plain string.
- **PIN Protection:** The app must prompt for the Local PIN to unwrap the MSK whenever the session is lost (e.g., page refresh or browser restart).

---

## 7. Future Roadmap (Future Ideas)

- **WebAuthn:** Implement biometric unwrapping of the `trzr_wrapped_msk` to replace the Local PIN.
- **Compression:** Add a flag in the `reserved` header bytes to indicate if the payload is Gzipped _before_ encryption.

---

## Deliverables for Agent

1.  **`sync/crypto.ts`**: WebCrypto implementation of AES-GCM and PBKDF2.
2.  **`sync/fileformat.ts`**: Binary parser for the 64-byte TRZR header.
3.  **`sync/engine.ts`**: The ETag-based sync loop and field-level LWW merge logic.
4.  **`ui/recovery.tsx`**: The 6x4 grid component and QR generation logic.
