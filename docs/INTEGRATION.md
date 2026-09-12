# docs/INTEGRATION.md

# Save State Integration Architecture

## 1. Purpose

This document defines how Save State communicates with external systems, with special emphasis on ATP Engine.

The most important rule is:

> Save State integrates with ATP through its HTTP contract, never through ATP internals or database access.

---

# 2. Current Ecosystem

```text
save-state-frontend
        │
        ▼
save-state-api
        │
        ├── Save State MongoDB
        │
        └── ATP Engine (future)
```

Target:

```text
Browser
   │
   ▼
Save State Next.js
   │
   ├── Save State MongoDB
   │
   └── HTTP
        │
        ▼
   ATP Engine
        │
        ▼
   ATP MongoDB
```

---

# 3. Integration Boundary

ATP exposes an HTTP API.

Save State should consume ATP through a dedicated server-side client.

Conceptually:

```text
server/atp/
    client.ts
    types.ts
    schemas.ts
```

The client is the only layer responsible for knowing ATP's HTTP details.

---

# 4. Why the Boundary Exists

ATP and Save State have different responsibilities.

### Save State

Owns:

* user accounts;
* authentication;
* personal game records;
* personal lists;
* ratings;
* reviews;
* personal progress;
* user-facing UI.

### ATP Engine

Owns:

* canonical game discovery;
* external metadata;
* source resolution;
* classification;
* enrichment;
* canonical identifiers;
* external source evidence;
* cover discovery;
* catalog operations.

The systems should remain independently evolvable.

---

# 5. ATP HTTP Contract

Save State should treat ATP responses as external DTOs.

Do not import:

```text
ATP domain entities
ATP repositories
ATP Mongoose models
ATP application services
```

Instead:

```text
HTTP response
    ↓
validation
    ↓
Save State DTO
```

---

# 6. Error Translation

ATP errors should not leak blindly into the browser.

Conceptually:

```text
ATP error
    ↓
ATP client
    ↓
Save State domain/application error
    ↓
Route Handler
    ↓
browser-safe error
```

The ATP request ID may be preserved where useful for diagnostics.

---

# 7. Timeouts

ATP is an external dependency.

Save State must not allow an ATP request to hang indefinitely.

The ATP client should use explicit timeouts.

Timeouts should result in controlled errors rather than uncontrolled request hangs.

---

# 8. ATP Search

ATP search may eventually power game discovery in Save State.

The architecture should support:

```text
Search UI
    ↓
Save State
    ↓
ATP BFF
    ↓
ATP search
```

The browser should not need knowledge of ATP's internal URL structure.

---

# 9. ATP Game Selection

When a user selects an ATP game:

```text
ATP Game.id
      ↓
Save State
      ↓
GlobalGame.atpDomainId
      ↓
UserGame.gameId
```

The Save State database remains authoritative for the user's personal relationship with the game.

ATP remains authoritative for canonical metadata.

---

# 10. Metadata Ownership

For manually-created games:

```text
GlobalGame.source = manual
```

Save State may own editable metadata according to existing rules.

For ATP-backed games:

```text
GlobalGame.source = atp
```

ATP-originated metadata should be treated as a snapshot/reference to ATP rather than arbitrary user-editable canonical data.

The exact synchronization policy is deferred until ATP integration is implemented.

---

# 11. ATP Admin Operations

Administrative ATP operations must not be exposed as an unrestricted proxy.

Bad:

```text
POST /api/atp/*
```

with arbitrary path forwarding.

Preferred:

```text
POST /api/atp/sync
POST /api/atp/catalog/...
```

where each operation has explicit authorization and validation.

---

# 12. CORS

CORS is not the architectural security boundary.

The important boundary is:

```text
public browser
        ↓
authorized Save State server
        ↓
ATP
```

ATP may later support direct browser reads if authentication and restrictive CORS policies make that appropriate.

That is a future decision.

---

# 13. Deployment Independence

ATP and Save State should be deployable independently.

```text
Save State deployment
       ≠
ATP deployment
```

The HTTP contract is the integration contract.

If the contract changes incompatibly, the integration must be versioned or migrated deliberately.

---

# 14. Integration Rule

When in doubt:

> Keep the dependency pointing from Save State toward the ATP HTTP contract, never from Save State toward ATP internals.

---

# 15. Implemented Phase 9 BFF (Save State side)

The BFF is implemented as an explicit allowlist under `/api/atp/*`:

```text
GET  /api/atp/search          → ATP GET /api/v1/games/search
GET  /api/atp/games/:id       → ATP GET /api/v1/games/:id (+ cover lookup)
GET  /api/atp/games/:id/cover → ATP GET /api/v1/games/:id/cover
POST /api/atp/import           → ATP lookup, writes only to Save State
```

Rules preserved from this document:

* every endpoint requires the Save State session; no browser credentials,
  cookies, or URLs are forwarded to ATP;
* no generic proxy exists; admin/sync/history endpoints are not mapped;
* ATP responses are Zod-validated at the boundary; failures become controlled
  Save State errors, never raw upstream bodies;
* covers resolve lazily per item (ADR-023); import snapshots the selected
  cover URL into `GlobalGame.cover` with no re-resolution or sync;
* imports create `GlobalGame(source: "atp", atpDomainId)` snapshots plus
  `UserGame` rows through the existing mutation path (duplicate and race
  semantics unchanged);
* no ATP service credential exists: server-to-server BFF access removes the
  browser dependency but does not itself make ATP's unauthenticated API
  private — a deliberate, recorded limitation, not a claim otherwise.
