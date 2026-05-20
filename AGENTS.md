# Trezur Development Guide

This guide provides a concise, high-level map of Trezur's architecture, state management, security model, and developer commands for AI agents.

## Developer Commands
- **Dev server**: `npm run dev` (Vite dev server)
- **Build**: `npm run build` (production build)
- **Lint**: `npm run lint` (Prettier format check + ESLint)
- **Type check**: `npm run check` (Svelte Check with JSDoc configurations)
- **Format**: `npm run format` (Prettier auto-fix)

## Project Architecture & Directory Layout

### Tech Stack
- **Framework**: Svelte 5 & SvelteKit (Vite-based)
- **Styling**: Tailwind CSS v4 (via `@tailwindcss/vite`)
- **Type safety**: JSDoc type hints with Svelte Check (`/src/lib/types.ts` contains key interfaces)
- **Deployment**: Cloudflare Pages (`adapter-cloudflare`)
- **PWA**: Service worker for offline capability

### Application Structure
- **Routes & Pages**: `/src/routes/(app)/` (core pages: `+layout.svelte`, `+page.svelte`, `settings/`) and `/src/routes/(legalese)/` (privacy/terms).
- **State Management**: `/src/lib/state/` - Svelte 5 runes (`$state`, `$derived`, `$effect`) in `.svelte.js` context singletons.
- **Sync Engine**: `/src/lib/sync/` - Google Drive OAuth integration, sync timing, and conflict resolution.
- **Components**: `/src/lib/components/` - Reusable Svelte components categorized by feature (`nav`, `tokens`, `sync`, `passcode`, `ui`).
- **Utilities**: `/src/lib/utils/` - Encryption wrappers, BIP39 helper, legacy migration, and utility functions.

---

## State Management & Storage Orchestration

State is managed via Svelte 5 reactive context classes. The central coordinator is the storage layer.

### 1. Key Manager (`src/lib/state/key-manager.svelte.js`)
- **Purpose**: Handles key derivation, MSK wrapping/unwrapping, and passcode updates.
- **In-memory cache**: Holds `#cryptoKey` (payload key) and `#passcode` as private fields. Never exposes them.
- **Needs Migration flag**: Set to `true` if a legacy v0 database is detected (triggers a backup download + migration flow on the main page).

### 2. Encrypted Storage Layer (`src/lib/state/storage.svelte.js`)
- **Purpose**: Global lifecycle orchestration for the local vault (`LocalKVVault`), payload keys, token contexts, and sync service.
- **State**: Exposes `localVault` (encrypted LocalKVVault wrapper) and `cryptoKey`.
- **Initialization**: `initStorage(passkeyParam)` derives keys, instantiates the vault, loads tokens, and starts the sync service.
- **Teardown**: `clearStorage()` stops sync and wipes in-memory tokens/keys (used for locking). `purgeStorage()` performs a full wipe (forgot passcode / delete all data).

### 3. Token State (`src/lib/state/tokens.svelte.js`)
- **Purpose**: Collection management for TOTP/HOTP tokens.
- **Context**: `tokensContext` contains the active `TokensCtx` instance.
- **Conflict Resolution**: Last-Writer-Wins (LWW) per-field merge logic using four timestamps in `updatedAt` (`account`, `issuer`, `secret`, `params`).
- **Tombstones**: Records deleted token IDs to prevent stale cloud backups from resurrecting them during sync merges.

### 4. Settings State (`src/lib/state/settings.svelte.js`)
- **Purpose**: User preferences (`showNextCode`, `useBiometricUnlock`, `sortOrder`).
- **Persistence**: Plaintext in `T_settings` localStorage (not sensitive).

### 5. Conditions State (`src/lib/state/conditions.svelte.js`)
- **Purpose**: Device/application flags (`isUserPasscodeSet`, `isAppLocked`, `isAppleDevice`, `clientId`).
- **Persistence**: Persists `clientId` (fallback key/device ID) and `isUserPasscodeSet` to `T_conditions` localStorage.

---

## Security & Key Hierarchy

Trezur uses a robust three-layer security model to encrypt all sensitive data at rest:

```
Passcode / Device clientId
    │
    ▼ PBKDF2 (600,000 iterations, SHA-256, 16-byte salt)
Local Wrapping Key (LWK, AES-256-GCM)
    │
    ├── wrap/unwrap ──► Master Secret Key (MSK, 32 random bytes)
    │                        │
    │                        ▼ importRawKey
    │                   Payload CryptoKey (AES-256-GCM)
    │                        │
    │                        ├── Encrypts LocalKVVault (localStorage: `T_ES_*`)
    │                        └── Encrypts CloudFileVault (Google Drive: `tokens.trzr`)
    │
    └── MSK is convertible to a 24-word BIP39 mnemonic for recovery
```

- Changing the passcode re-wraps the same MSK using a new LWK. Token data is **never** re-encrypted.
- If no passcode is set, the device-specific `clientId` is used as the passkey fallback.

---

## Cloud Sync & Recovery

- **Backup Target**: Google Drive `appDataFolder` as `tokens.trzr` (binary TRZR format).
- **Verification**: Cloud backups are verified using BIP39 recovery phrases via a header auth tag, enabling key matching without downloading the full backup.
- **Synchronization**: Managed by `CloudSyncService` (`src/lib/sync/cloud-sync.svelte.js`). Scheduled automatically on unlock (10s), token edits (30s batching), tab focus, or manually.
- **Conflict Resolution**: `sync-engine.js` merges local and cloud states atomically using LWW field-level timestamps and tombstones.

---

## Code Style
- **Formatting**: Prettier with tabs, single quotes, 120 char print width, and tailwind/svelte plugins.
- **Imports**: Use `$lib/` and `$app/` aliases, group by source (lib, app, external).
- **Types**: JSDoc type hints preferred over TypeScript files (except interfaces in `src/lib/types.ts`).
- **Components**: PascalCase files, Svelte 5 runes (`$state`, `$derived`, `$effect`).
- **State**: Context pattern with `.svelte.js` files for reactive stores.
- **No tests**: Project has no test framework configured.

---

## Detailed Documentation Map

For detailed walk-throughs of specific flows, refer to:
- [passcode-and-keys.md](docs/passcode-and-keys.md) — Deep dive into KeyManager, storage adoption, and passcode transition.
- [token-storage.md](docs/token-storage.md) — In-depth look at LWW timestamps, LocalKVVault, and token model definitions.
- [cloud-sync.md](docs/cloud-sync.md) — Breakdown of the binary TRZR file format, sync loops, and Google Drive OAuth integration.
- [TEST_FLOWS.md](docs/TEST_FLOWS.md) — Complete list of 40 manual test scenarios covering authentication, tokens, imports, and sync.
