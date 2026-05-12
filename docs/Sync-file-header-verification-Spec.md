### **Spec: TRZR Header Verification via AES-GCM AAD**

**Objective:** Replace the `SHA-256` key hash with **Additional Authenticated Data (AAD)** to verify the `cryptoKey` and header integrity without needing the raw Master Sync Key (MSK).

---

### 1. Updated Binary Layout (First 64 Bytes)

| Offset   | Size     | Field         | Description                                          |
| -------- | -------- | ------------- | ---------------------------------------------------- |
| `0..20`  | 21 bytes | **AAD Block** | Includes `magic`, `version`, `type`, and `iv`.       |
| `21..36` | 16 bytes | **Auth Tag**  | The GCM Authentication Tag protecting the AAD Block. |
| `37..63` | 27 bytes | **Reserved**  | Zero-padded for future use.                          |

---

### 2. Implementation Logic (WebCrypto)

#### **A. Packing (Encryption)**

When creating a `.trzr` file:

1. **AAD:** Capture bytes `0..20` of the header.
2. **Generate Tag:** Use `crypto.subtle.encrypt` with:

- `name: "AES-GCM"`, `iv: <header_iv>`, `additionalData: <AAD_bytes>`.
- **Ciphertext:** Use an empty `new Uint8Array(0)`.

3. **Store:** Extract the 16-byte **tag** from the end of the (empty) encryption result and write it to offset `21`.

#### **B. Verification (Decryption)**

Before processing the full payload:

1. **Extract:** Read the 21-byte AAD block and the 16-byte Tag from the header.
2. **Verify:** Call `crypto.subtle.decrypt` using the existing `cryptoKey`, the header `iv`, the stored `tag`, and the `additionalData` (AAD block).
3. **Validate:** If the promise resolves, the key and header are valid. If it throws `OperationError`, the key is incorrect or the header is corrupt.

---

### 3. Requirements

- **No Extra Keys:** Use only the `AES-GCM` `cryptoKey` already in memory.
- **Atomic Integrity:** Verification must fail if `version`, `type`, or `iv` are tampered with.
- **Stateless:** Do not cache or store MSK hashes; perform verification on-demand during sync.
