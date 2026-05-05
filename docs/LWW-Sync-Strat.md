## Technical Spec: Trezur LWW Sync (Lazy Init)

### 1. Data Model

Tokens may exist without an `updatedAt` object (Legacy). The sync engine must normalize these on the fly.

```ts
export interface Token {
    id: string;
    account: string;
    issuer: string;
    secret: string;
    type: 'HOTP' | 'TOTP';
    digits: number;
    period: number;
    algorithm: string;
    counter: number;
    updatedAt?: { // Optional for legacy support
        account?: number;
        issuer?: number;
        secret?: number;
        params?: number;
    };
}
```

### 2. Normalization Logic (The "Safe Getter")

Whenever comparing two tokens, the agent must use a helper to resolve timestamps.

- **If `updatedAt.key` exists:** Use value.
- **If `updatedAt.key` is missing:** Return `0`.

### 3. Mutation Rules

- **On Manual Edit:** If a user edits a field, the app **must** create/update the `updatedAt` object for that token with `Date.now()`. This "promotes" a legacy token to a modern one.
- **On Import:** All imported tokens are treated as new snapshots. Assign `Date.now()` to all `updatedAt` keys immediately.

### 4. The Merge Engine (LWW-per-field)

#### Step 1: Deletions

1.  Check for a Tombstone: `Record<string, number>`.
2.  Get the "Max Local Timestamp": `Math.max(...Object.values(token.updatedAt ?? {}), 0)`.
3.  If `tombstoneTime > maxLocalTimestamp`, the token is deleted.

#### Step 2: Field Resolution

Compare Local (`L`) and Cloud (`C`). For each field group:

| Field       | Comparison Logic                                                         |
| :---------- | :----------------------------------------------------------------------- |
| **Account** | `(L.upd?.account ?? 0) >= (C.upd?.account ?? 0) ? L.account : C.account` |
| **Issuer**  | `(L.upd?.issuer ?? 0) >= (C.upd?.issuer ?? 0) ? L.issuer : C.issuer`     |
| **Secret**  | `(L.upd?.secret ?? 0) >= (C.upd?.secret ?? 0) ? L.secret : C.secret`     |
| **Params**  | `(L.upd?.params ?? 0) >= (C.upd?.params ?? 0) ? L_group : C_group`       |

**Tie-Breaker:** If timestamps are equal (including `0` vs `0`), the **Cloud** value wins.

### 5. Operational Flow

1.  **Sync Triggered:** Fetch Cloud state.
2.  **Diffing:** Iterate through all IDs.
3.  **Merge:** Apply the resolution logic above.
    - _Note:_ If a legacy local token is merged with cloud data that has real timestamps, the cloud data will naturally win.
4.  **Save:** Persist the result. Any token that was updated during the merge should now have a full `updatedAt` object saved to local storage.
