# Trezur Development Guide

## Commands
- **Dev server**: `npm run dev` (Vite dev server)
- **Build**: `npm run build` (production build)
- **Lint**: `npm run lint` (Prettier + ESLint)
- **Type check**: `npm run check` (Svelte Check with JSDoc)
- **Format**: `npm run format` (Prettier auto-fix)

## Architecture
- **Framework**: SvelteKit with Vite, TypeScript via JSDoc
- **Deployment**: Cloudflare Pages (adapter-cloudflare)
- **Storage**: Client-side encrypted localStorage for TOTP/HOTP tokens
- **Structure**: `/src/lib/` (components, state, utils), `/src/routes/` (pages)
- **State**: Svelte 5 runes for reactive state management

## Code Style
- **Formatting**: Prettier with tabs, single quotes, 100 char width, Tailwind plugin
- **Imports**: Use `$lib/` and `$app/` aliases, group by source (lib, app, external)
- **Types**: JSDoc type hints preferred over TypeScript files (except interfaces in `types.ts`)
- **Components**: PascalCase files, use Svelte 5 runes (`$state`, `$derived`, `$effect`)
- **State**: Context pattern with `.svelte.js` files for reactive stores
- **No tests**: Project has no test framework configured
