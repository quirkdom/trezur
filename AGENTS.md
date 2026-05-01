# Trezur Development Guide

## Commands
- **Dev server**: `npm run dev` (Vite dev server)
- **Build**: `npm run build` (production build)
- **Lint**: `npm run lint` (Prettier + ESLint)
- **Type check**: `npm run check` (Svelte Check with JSDoc)
- **Format**: `npm run format` (Prettier auto-fix)

## Architecture

### Framework & Build
- **Framework**: SvelteKit with Vite, TypeScript via JSDoc
- **Deployment**: Cloudflare Pages (adapter-cloudflare)
- **Build Tool**: Vite with SvelteKit adapter for Cloudflare Pages
- **Service Worker**: PWA capabilities for offline functionality

### Application Structure
- **Pages**: `/src/routes/` - SvelteKit routes (`+page.svelte`, `+layout.svelte`)
- **Components**: `/src/lib/components/` - Reusable UI components organized by feature
- **State Management**: `/src/lib/state/` - Reactive stores using Svelte 5 runes
- **Utilities**: `/src/lib/utils/` - Helper functions and shared logic
- **Types**: `/src/types.ts` - TypeScript interfaces and type definitions

### State Management Setup

#### Encrypted Storage Layer (`storage.svelte.js`)
- **Purpose**: Secure client-side storage for sensitive token data
- **Implementation**: Custom encrypted localStorage wrapper with AES encryption
- **Key Management**:
  - Device-specific `clientId` for basic encryption (no passcode)
  - User `passcode` for enhanced encryption when set
  - Automatic migration between encryption keys
- **Initialization**: Happens in `+layout.svelte` `$effect` on every page load
- **See**: [TEST_FLOWS.md](TEST_FLOWS.md) flows 1-11 for storage initialization testing

#### Token State (`tokens.svelte.js`)
- **Purpose**: Manages TOTP/HOTP token collection with CRUD operations
- **Implementation**: Singleton context pattern with reactive token array
- **Features**:
  - Token validation and deduplication
  - Automatic persistence to encrypted storage
  - Migration support for encryption changes
- **Initialization**: Requires encrypted storage to be ready first
- **Context**: `tokensContext` provides app-wide token management

#### Settings State (`settings.svelte.js`)
- **Purpose**: User preferences and app configuration
- **Implementation**: Context pattern with localStorage persistence
- **Settings**: `showNextCode`, `useBiometricUnlock`, `sortOrder`
- **Persistence**: Direct localStorage (not encrypted, as settings are non-sensitive)

#### Passcode State (`passcode.svelte.js`)
- **Purpose**: Runtime passcode management and app lock state
- **Implementation**: Session-based reactive store
- **Features**: Passcode validation, session clearing, lock state management
- **Documentation**: See `docs/passcode-management.md` for detailed flow of locking, unlocking, and session initialization

#### Conditions State (`conditions.svelte.js`)
- **Purpose**: Device and app state conditions
- **Implementation**: Reactive store for device detection and app flags
- **Conditions**: `isAppLocked`, `isUserPasscodeSet`, `isAppleDevice`, `clientId`

### App Operation Flow

#### 1. Initial Load (`+layout.svelte`)
- **Storage Init**: `$effect` initializes encrypted storage on `clientId` or passcode
- **Context Setup**: All state contexts are initialized
- **Lock Check**: App locks if passcode is set and not unlocked

#### 2. Token Loading (`+page.svelte`)
- **Dependency**: Waits for storage initialization
- **Loading**: `$effect` loads tokens from encrypted storage
- **Display**: Tokens rendered in `TokenList` component

#### 3. User Interactions
- **Token Management**: Add via form or QR scan, edit/delete existing tokens
- **Import/Export**: JSON-based backup and restore from various authenticator apps
- **Settings**: Passcode management, preferences, data purge
- **Migration**: Automatic encryption upgrades with user confirmation

#### 4. Security Features
- **Encryption**: All tokens encrypted at rest using Web Crypto API
- **Passcode Protection**: Optional additional encryption layer
- **Offline-First**: No server communication, all data local
- **Data Export**: Manual backup capability for user control

### Testing
- **Test Flows**: Comprehensive testing guide available in [TEST_FLOWS.md](TEST_FLOWS.md)
- **Coverage**: Storage initialization, token operations, import/export, security features
- **Browser Tools**: Use dev tools for storage inspection and state debugging

## Code Style
- **Formatting**: Prettier with tabs, single quotes, 100 char width, Tailwind plugin
- **Imports**: Use `$lib/` and `$app/` aliases, group by source (lib, app, external)
- **Types**: JSDoc type hints preferred over TypeScript files (except interfaces in `types.ts`)
- **Components**: PascalCase files, use Svelte 5 runes (`$state`, `$derived`, `$effect`)
- **State**: Context pattern with `.svelte.js` files for reactive stores
- **No tests**: Project has no test framework configured
