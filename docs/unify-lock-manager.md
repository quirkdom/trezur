# Unify Lock/Unlock into AppLifecycleManager

## Problem

Lock/unlock logic is scattered across 4 files, with overlapping responsibilities and two bugs:

- **`src/lib/state/app.svelte.js`** — orchestrates `keyManager` + `tokensContext` + `localVault`
- **`src/routes/+layout.svelte`** — cold start init, auto-lock effect, `toggleAppLockAction` callback
- **`src/lib/components/nav/FooterNav.svelte`** — directly manipulates `conditions.isAppLocked` AND delegates to layout callback
- **`src/lib/components/passcode/UnlockScreen.svelte`** — passcode verify, forgot-passcode purge

**Bug 1 — Passcode bypass via remount dance**: When the app is locked with a passcode, FooterNav's `toggleAppLock()` sets `isAppLocked = false`, hiding `UnlockScreen` and briefly exposing the main content. The auto-lock `$effect` in layout fires immediately and re-sets `isAppLocked = true`, causing `UnlockScreen` (and its `PasscodeDialog`) to remount. The dialog only opens because it re-renders — fragile and causes a content flash.

**Bug 2 — Broken two-way binding on a `$derived`**: `showPasscodeDialog = $derived(conditions.isUserPasscodeSet || false)` is bound with `bind:open={showPasscodeDialog}`. `$derived` values are readonly — two-way binding is silently broken. The dialog can never be properly dismissed.

## Approach

Transform `src/lib/state/app.svelte.js` into an **`AppLifecycleManager`** class. It becomes the single module that owns:

1. All key/tokens/vault orchestration — already exists
2. `isAppLocked` management — **new** (currently spread across Layout + FooterNav + UnlockScreen)
3. Passcode prompt lifecycle — **new** (replaces the broken `$derived` bind + remount dance)
4. `toggleLock()` — **new** single entry point for FooterNav
5. Forgot passcode flow — **moved** from UnlockScreen
6. Cold-start init + auto-lock effect — **moved** from Layout

Callers become thin consumers that call one method and observe one reactive state.

## Design

### AppLifecycleManager API (`src/lib/state/app.svelte.js`)

```js
class AppLifecycleManager {
  // --- reactive state ---
  localVault = $state(null);
  passcodePromptRequested = $state(false);
  isLocked = $derived(this.#conditionsCtx.getConditions().isAppLocked);

  // --- lifecycle (called once from +layout.svelte) ---
  init(conditionsCtx, settingsCtx)
  //   Stores context refs.
  //   Cold-start: if no passcode + clientId + no vault → initStorageAndTokens(clientId)
  //   Registers $effect: if passcode set + no cryptoKey + not locked → lock()

  // --- lock/unlock ---
  lock()
  //   keyManager.lock() + tokensContext.resetTokens() + localVault = null
  //   + conditionsCtx.updateCondition('isAppLocked', true)

  async unlock(passkey)
  //   calls initStorageAndTokens(passkey)
  //   on success: conditionsCtx.updateCondition('isAppLocked', false)
  //   resets passcodePromptRequested = false

  // --- FooterNav entry point ---
  async toggleLock()
  //   if unlocked → lock()
  //   if locked + no passcode → unlock(clientId)
  //   if locked + passcode → passcodePromptRequested = true  (does NOT touch isAppLocked)

  // --- UnlockScreen entry points ---
  async unlockWithPasscode(passcode)
  //   Same as unlock(passcode). Semantically named for UnlockScreen handleUnlock.

  async forgotPasscode()
  //   Moves entire logic from UnlockScreen:
  //   purgeTokens(), clear T_ES_* localStorage keys,
  //   conditionsCtx.updateConditions({isAppLocked:false, isUserPasscodeSet:false}),
  //   lock(), re-init with clientId, goto('/')

  // --- backward compat ---
  getLocalVault()
  //   returns this.localVault (used by +page.svelte isLoading derived)
}
```

### Key behavioral change: passcode unlock flow

**Before (buggy — remount dance):**

```
locked + passcode → FooterNav long-press
  → FooterNav sets isAppLocked=false (hides UnlockScreen, shows content)
  → auto-lock $effect fires: re-sets isAppLocked=true
  → UnlockScreen remounts, PasscodeDialog reopens via broken $derived bind
```

**After (clean — no remount, no toggle):**

```
locked + passcode → FooterNav long-press
  → toggleLock() → passcodePromptRequested = true
  → isAppLocked stays true, UnlockScreen stays rendered
  → UnlockScreen's $effect observes passcodePromptRequested → opens PasscodeDialog
  → user enters passcode → unlockWithPasscode() → isAppLocked=false
```

### UnlockScreen dialog binding fix

```svelte
<!-- BEFORE (broken — $derived can't be two-way bound) -->
let showPasscodeDialog = $derived(conditions.isUserPasscodeSet || false);
<PasscodeDialog bind:open={showPasscodeDialog} ... />

<!-- AFTER (proper $state, driven by lifecycle manager) -->
let showPasscodeDialog = $state(false);
$effect(() => {
  if (lifecycleManager.passcodePromptRequested) {
    showPasscodeDialog = true;
    lifecycleManager.passcodePromptRequested = false; // consume the request
  }
});
<PasscodeDialog bind:open={showPasscodeDialog} ... />
```

### Files changed

| File                                              | Change                                                                                                                                                                                                                                                                             |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/state/app.svelte.js`                     | Replace standalone functions with `AppLifecycleManager` class. Export singleton `lifecycleManager`.                                                                                                                                                                                |
| `src/routes/+layout.svelte`                       | Remove cold-start block, auto-lock `$effect`, `toggleAppLockAction`. Replace with `lifecycleManager.init(conditionsContext)`. Change `FooterNav` prop to `onToggleLock={lifecycleManager.toggleLock}`. Change `{#if conditions.isAppLocked}` to `{#if lifecycleManager.isLocked}`. |
| `src/lib/components/nav/FooterNav.svelte`         | Replace `toggleAppLockAction(willLockApp)` prop with `onToggleLock()`. Remove direct `conditionsContext.updateCondition()` call.                                                                                                                                                   |
| `src/lib/components/passcode/UnlockScreen.svelte` | Replace `$derived` dialog binding with `$state` + `$effect` driven by `lifecycleManager.passcodePromptRequested`. Replace `initStorageAndTokens`/`lockApp` with `lifecycleManager.unlockWithPasscode`/`lifecycleManager.forgotPasscode`. Remove inline forgot-passcode logic.      |
| `src/routes/settings/+page.svelte`                | Replace `lockApp()` with `lifecycleManager.lock()`.                                                                                                                                                                                                                                |
| `src/routes/+page.svelte`                         | Replace `initStorageAndTokens`/`getLocalVault` with `lifecycleManager.unlock`/`lifecycleManager.getLocalVault`.                                                                                                                                                                    |

### Backward compatibility

- `getLocalVault()` stays as a function on the singleton (used by `+page.svelte` for its `isLoading` derived)
- All existing callers of `initStorageAndTokens`/`lockApp`/`unlockApp` map to `lifecycleManager.unlock`/`lifecycleManager.lock`/`lifecycleManager.unlock`
- The `lifecycleManager` singleton follows the same pattern as `keyManager`, `backupService`, `driveClient`

## Verification

1. **Cold start (no passcode)**: Fresh app → tokens load, no unlock screen
2. **Set passcode**: Settings → Set Passcode → dialog → lock icon shows locked state
3. **Lock**: Long-press lock → app locks → UnlockScreen shows (isAppLocked=true)
4. **Unlock with passcode**: Long-press lock → PasscodeDialog opens (no isAppLocked toggle, no remount, no flash) → enter passcode → app unlocks
5. **Wrong passcode**: Error message → dialog stays open, app stays locked
6. **Unlock without passcode**: Long-press lock → app unlocks directly (no dialog)
7. **Lock without passcode**: Long-press → locks → "locked away" message → long-press again → unlocks directly
8. **Forgot passcode**: "Forgot passcode?" → confirm → data purged → app resets to cold start
9. **Purge all data**: Settings → Delete all → confirm → app resets
10. **Migration effect**: `lifecycleManager.unlock(clientId)` still works after backup
11. **Backup service**: `backupService.loadFromStorage()` fires when vault becomes available
