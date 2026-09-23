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

# docs/DEVELOPMENT_RULES.md

# Save State Development Rules

## 1. General Principle

The project values:

* correctness;
* maintainability;
* explicit architecture;
* incremental changes;
* testability;
* predictable behavior.

It does not optimize for maximum abstraction or maximum number of technologies.

---

# 2. Smallest Coherent Change

Prefer:

```text
one feature
one concern
one migration step
```

over:

```text
rewrite everything while touching the feature
```

---

# 3. Existing Code Is Evidence

Existing code tells the agent how the system currently behaves.

It does not automatically define how the new architecture should work.

Before changing behavior, distinguish:

```text
Current behavior
Intended behavior
Target architecture
```

---

# 4. Do Not Invent Requirements

If a behavior is not documented or requested, do not invent it.

Examples:

* favorite games;
* new statuses;
* AI recommendations;
* automatic metadata synchronization;
* new user roles;
* social features.

Unknown requirements should be raised as questions.

---

# 5. Frontend Migration

The migration should preserve visual behavior initially.

Do not simultaneously:

* migrate framework;
* redesign UI;
* replace Tailwind;
* replace Zustand;
* replace RPGUI;
* introduce a new component library.

Those are separate concerns.

---

# 6. RPGUI

RPGUI should be isolated as a client-side presentation dependency.

Browser-only initialization belongs in client boundaries.

Pixel-art rendering must not be "fixed" by applying global hacks blindly.

If rendering behavior changes, test representative RPGUI components.

---

# 7. Data Fetching

For reads:

```text
Server Component
    ↓
server service
```

For client mutations:

```text
Client Component
    ↓
Route Handler
```

Avoid unnecessary:

```text
browser → own API → database
```

for server-rendered pages.

---

# 8. State Management

Use Zustand only for client-owned state.

Do not use it as a replacement for server-side data access.

---

# 9. Database

Mongoose models remain server-only.

Do not import database models into:

* React components;
* browser utilities;
* client state stores;
* client hooks.

---

# 10. Validation

Validate external input before entering application logic.

Use Zod consistently inside Save State.

Do not duplicate validation rules unnecessarily.

---

# 11. Tests

A migration must prove that important behavior survived.

Tests should focus on behavior rather than implementation details.

Prioritize:

* auth;
* authorization;
* game ownership;
* list ownership;
* CRUD;
* pagination;
* validation;
* exports;
* race-safe creation;
* ATP integration once introduced.

---

# 12. Dependency Changes

Adding a dependency requires a concrete reason.

Before adding one, ask:

1. Does the platform already provide this?
2. Can the current stack solve it?
3. Does it materially reduce complexity?
4. Does it create another architectural dependency?

Do not introduce dependencies merely because they are popular.

---

# 13. Framework Features

Next.js features should be used intentionally.

Do not use:

* Server Actions everywhere;
* middleware everywhere;
* dynamic rendering everywhere;
* Client Components everywhere;
* API routes for internal server calls;

without a concrete reason.

---

# 14. Security

Never commit secrets.

Never expose server-only environment variables.

Never move a secret into:

```text
NEXT_PUBLIC_*
```

Never expose privileged ATP endpoints directly to unauthenticated clients.

---

# 15. Migration Validation

Each migration phase should be independently verifiable.

Example:

```text
Phase 3 — Authentication

DONE when:
- login works;
- logout works;
- protected pages work;
- session invalidation works;
- relevant tests pass.
```

Do not declare a phase complete based solely on:

```text
npm run build
```

---

# 16. Documentation

When an architectural decision changes:

1. update `DECISIONS.md`;
2. update relevant architecture documentation;
3. update `AGENTS.md` only if the rule itself changed.

Do not allow documentation to silently diverge from architecture.

---

# 17. Commit Hygiene

Commits should represent coherent changes.

Prefer:

```text
feat(auth): migrate JWT authentication
```

over:

```text
feat: migrate entire application
```

Avoid unrelated formatting changes in migration commits.

---

# 18. Migration Safety

The old frontend and API should remain untouched unless the migration explicitly requires a compatibility change.

The new application should be developed in parallel.

Rollback should remain possible.

---

# 19. Stop Conditions

The agent should stop and ask the user when:

* a domain behavior is ambiguous;
* a migration requires changing existing semantics;
* a security decision is unclear;
* ATP contract behavior is unclear;
* a database migration could be destructive;
* a broad rewrite appears necessary;
* requirements conflict.

Do not guess when guessing could alter the architecture.

---

# docs/DECISIONS.md

# Save State Architecture Decision Record

This document records architectural decisions that should not be casually reconsidered during implementation.

---

## ADR-001 — Consolidate Save State Frontend and API

### Status

Accepted

### Decision

The Save State React frontend and Express API will be consolidated into a single Next.js modular monolith.

### Reason

The current split introduces unnecessary friction:

* duplicated type/contract boundaries;
* separate deployment;
* hardcoded API/CORS coupling;
* HTTP overhead for server-renderable data;
* duplicated validation concerns;
* client-side dashboard aggregation.

The consolidation solves concrete problems rather than being a framework rewrite for its own sake.

---

## ADR-002 — Use Next.js App Router

### Status

Accepted

### Decision

The consolidated Save State application will use Next.js App Router.

### Reason

App Router provides:

* Server Components;
* server-side data access;
* integrated routing;
* Route Handlers;
* a natural BFF boundary;
* one deployment surface.

---

## ADR-003 — Preserve MongoDB and Mongoose

### Status

Accepted

### Decision

Save State will continue using MongoDB and Mongoose.

### Reason

The existing persistence layer is functional and tested.

Changing database technology would add migration risk without solving a current architectural problem.

---

## ADR-004 — Preserve JWT Authentication

### Status

Accepted

### Decision

Save State will continue using JWT authentication through an httpOnly cookie and `sessionVersion`.

### Reason

The existing authentication model already provides the required behavior.

There is no architectural requirement to introduce Auth.js/NextAuth or another authentication provider.

---

## ADR-005 — ATP Remains Independent

### Status

Accepted

### Decision

ATP Engine remains a separate application, repository, runtime, and database.

### Reason

ATP has a distinct responsibility:

> canonical video game metadata discovery and enrichment.

Save State has a distinct responsibility:

> user-facing game tracking and personal game data.

Combining them would increase coupling and deployment complexity.

---

## ADR-006 — ATP Integration Uses HTTP

### Status

Accepted

### Decision

Save State communicates with ATP through ATP's HTTP API.

### Forbidden

```text
Save State → ATP MongoDB
```

```text
Save State → ATP source imports
```

### Allowed

```text
Save State → ATP HTTP API
```

---

## ADR-007 — Server Components for Reads

### Status

Accepted

### Decision

Server Components should be the default read path for server-owned data.

### Reason

The migration should take advantage of the architecture instead of reproducing the old SPA's:

```text
browser → API → database
```

pattern for every read.

---

## ADR-008 — Client Components Must Be Localized

### Status

Accepted

### Decision

Client Components are allowed where browser behavior is required, but must not become the default architecture.

### Reason

RPGUI, Zustand, event handlers, browser APIs, and interactive forms genuinely require client-side execution.

That does not justify making entire pages or application trees client-rendered.

---

## ADR-009 — No React Query Requirement

### Status

Accepted

### Decision

React Query/TanStack Query will not be introduced as part of the migration.

### Reason

The current application does not require another server-state abstraction to achieve the migration goals.

It may be reconsidered later if a concrete need appears.

---

## ADR-010 — No Express Compatibility Layer

### Status

Accepted

### Decision

The new application will not embed Express inside Next.js merely to preserve the old API structure.

### Reason

The goal is to migrate the application architecture, not reproduce the previous framework inside the new framework.

Application services and business logic may be reused conceptually or structurally where appropriate.

HTTP routing is being migrated to Next.js.

---

## ADR-011 — Dashboard Aggregation Moves Server-Side

### Status

Accepted

### Decision

Dashboard statistics should be calculated server-side.

### Reason

The existing frontend performs unnecessary client-side aggregation.

The consolidated architecture allows:

```text
Dashboard
    ↓
server service
    ↓
database
```

instead of transferring unnecessary records to the browser.

---

## ADR-012 — RPGUI Is Not a Migration Blocker

### Status

Accepted

### Decision

RPGUI will be treated as a client-side compatibility/integration problem rather than an architectural blocker.

### Reason

Its current architecture depends on browser globals and initialization, but these concerns can be isolated inside Client Components.

RPGUI modernization remains a separate project.

---

## ADR-013 — No Big-Bang Migration

### Status

Accepted

### Decision

The migration will occur incrementally while the old frontend/API remain available.

### Reason

Incremental migration provides:

* rollback;
* smaller debugging surfaces;
* phase-by-phase validation;
* lower deployment risk.

---

## ADR-014 — No Unrelated Product Features During Migration

### Status

Accepted

### Decision

The migration will not introduce unrelated product functionality.

### Examples

Not part of the migration by default:

* favorites;
* social features;
* recommendations;
* new game statuses;
* AI features;
* new list semantics;
* RPGUI redesign.

---

## ADR-015 — ATP Admin Lives Behind Save State

### Status

Accepted in principle

### Decision

Future ATP administrative UI will live inside Save State's authenticated admin area and communicate with ATP through allowlisted server-side operations.

### Reason

This creates a single user-facing administrative surface without exposing ATP administrative APIs directly to the browser.

---

## ADR-016 — ATP CORS Is Not a Permanent Invariant

### Status

Accepted

### Decision

The architecture does not require ATP to permanently have "no CORS."

### Reason

CORS controls browser-origin access.

It is separate from:

* authentication;
* authorization;
* service-to-service authentication.

The near-term architecture uses server-side BFF access, but future direct authorized browser reads are not architecturally forbidden.

---

## ADR-017 — ATP Zod Version Remains Independent

### Status

Accepted

### Decision

Save State and ATP may use different Zod versions internally.

### Reason

They are separate applications.

The HTTP DTO boundary prevents dependency-level coupling.

Save State may standardize on its chosen Zod version without forcing ATP to migrate simultaneously.

---

## ADR-018 — Migration Starts Without ATP

### Status

Accepted

### Decision

ATP integration is postponed until the Save State consolidation is stable.

### Reason

Integrating ATP during the framework migration would combine two independent sources of complexity:

```text
framework migration
+
external service integration
```

Separating them reduces debugging and rollback complexity.

---

# Decision Discipline

When proposing a new architectural decision, document:

```text
Context
Decision
Reason
Alternatives considered
Consequences
```

Do not silently replace an accepted decision.

If a previous decision appears wrong, explain why and request explicit reconsideration rather than changing it implicitly.

---

# Current Architectural North Star

The target system is:

```text
                 Browser
                    │
                    ▼
        ┌────────────────────────┐
        │   Save State / Next.js │
        │                        │
        │  UI                    │
        │  Auth                  │
        │  Games                 │
        │  Lists                 │
        │  Dashboard             │
        │  Server Services       │
        │  Route Handlers        │
        │  ATP BFF               │
        └───────┬─────────┬──────┘
                │         │
                │         │ HTTP
                ▼         ▼
          Save State    ATP Engine
           MongoDB          │
                            ▼
                        ATP MongoDB
```

The guiding principle is:

> Consolidate what belongs together. Preserve the boundary where independence has real value.
