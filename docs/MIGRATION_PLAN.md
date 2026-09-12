# Save State Migration Plan

## 1. Purpose

This document defines the migration plan for consolidating the existing Save State frontend and API into a Next.js modular monolith while preserving ATP Engine as an independent service.

The migration is incremental and rollback-friendly.

The migration must not be treated as a big-bang rewrite.

---

# 2. Current State

The ecosystem currently consists of:

```text
AGORA_VAI/
├── save-state-frontend/
├── save-state-api/
└── atp-engine/
```

Current architecture:

```text
Browser
   ↓
Save State Frontend
   ↓
Save State API
   ├── Save State MongoDB
   └── ATP Engine (future integration)
```

The frontend and API currently represent one logical product but are deployed and developed as separate applications.

ATP Engine is already a separate system.

---

# 3. Target State

The target architecture is:

```text
AGORA_VAI/
├── save-state/
└── atp-engine/
```

With:

```text
Browser
   ↓
Save State — Next.js
   ├── UI
   ├── Authentication
   ├── Games
   ├── Lists
   ├── Dashboard
   ├── Server Services
   ├── Route Handlers
   └── ATP BFF
          │
          │ HTTP
          ▼
      ATP Engine
```

Databases remain separate:

```text
Save State → Save State MongoDB

ATP Engine → ATP MongoDB
```

---

# 4. Migration Principles

## 4.1 Incremental

Each phase should produce a verifiable state.

Do not combine unrelated migration phases.

---

## 4.2 Behavior preservation

The first objective is to preserve existing behavior.

The migration is not a product redesign.

If existing behavior is broken but changing it is not required for migration, document it and defer the fix.

---

## 4.3 Architecture preservation

The migration must preserve the following:

* MongoDB;
* Mongoose;
* JWT authentication;
* httpOnly cookie;
* `sessionVersion`;
* existing domain semantics;
* existing game/list behavior;
* ATP independence.

---

## 4.4 Rollback

The existing frontend/API should remain available until the new application is validated.

The migration should allow the deployment path to be reverted without requiring a database rollback whenever possible.

---

## 4.5 No ATP integration during the early migration

ATP integration is deliberately postponed.

The framework migration and ATP integration are separate sources of complexity.

They should not be debugged simultaneously.

---

# 5. Phase Overview

```text
Phase 0
Architecture Freeze

Phase 0.5
Consistency Audit

Phase 1
Next.js Skeleton

Phase 2
Server Infrastructure

Phase 3
Authentication

Phase 4
Core Server Reads

Phase 5
Mutations and Route Handlers

Phase 6
UI Migration

Phase 7
RPGUI Integration

Phase 8
Regression Tests

Phase 9
ATP BFF Integration

Phase 10
Deployment and Parallel Validation

Phase 11
Legacy Decommissioning
```

---

# Phase 0 — Architecture Freeze

## Objective

Establish and document the architecture before implementation begins.

## Tasks

* create root `AGENTS.md`;
* create `docs/ARCHITECTURE.md`;
* create `docs/INTEGRATION.md`;
* create `docs/DEVELOPMENT_RULES.md`;
* create `docs/DECISIONS.md`;
* create this `MIGRATION_PLAN.md`;
* review existing frontend/API/ATP architecture;
* identify known migration constraints.

## Explicit decisions

The project must establish that:

* Save State becomes a Next.js modular monolith;
* ATP remains independent;
* MongoDB remains;
* Mongoose remains;
* JWT remains;
* Server Components are preferred for reads;
* Client Components are localized;
* RPGUI remains client-side;
* ATP integration happens later;
* no unrelated feature development is included.

## Exit Criteria

* documentation exists;
* architectural contradictions have been resolved;
* no implementation has started.

---

# Phase 0.5 — Architecture Consistency Audit

## Objective

Verify that the governance documents match the actual repositories.

## Mode

Read-only.

No implementation.

No dependency installation.

No file modifications.

No commits.

## Inspect

* Save State frontend;
* Save State API;
* ATP Engine;
* configuration;
* authentication;
* persistence;
* tests;
* RPGUI;
* deployment configuration;
* error contracts;
* domain identity;
* ATP boundary and deployment assumptions;
* existing API contracts.

## Required output

The audit must classify findings as:

```text
FACT
INFERENCE
RECOMMENDATION
CONFLICT
```

The agent must identify:

* contradictions between documentation and implementation;
* assumptions that are not supported by code;
* migration risks;
* missing decisions;
* documentation that needs correction.

## Exit Criteria

The architecture documents accurately represent the current state and intended target state.

---

# Phase 1 — Next.js Skeleton

## Objective

Create the new Save State application without migrating business behavior yet.

Target:

```text
save-state/
```

## Tasks

* create Next.js App Router application;
* configure TypeScript;
* verify the Node.js 20 and pnpm baseline against the actual project/toolchain (see ADR-022);
* configure linting/formatting according to project standards;
* configure environment handling;
* configure Node runtime where server infrastructure requires it;
* establish basic folder structure;
* establish root layout;
* establish basic route groups;
* establish test infrastructure.

## Do not

Phase 1 is infrastructure/skeleton work only. It MUST NOT migrate:

* authentication behavior;
* domain services;
* application pages;
* RPGUI JavaScript initialization;
* ATP integration;
* game/list business logic;
* dashboard logic;
* exports.

It also MUST NOT:

* migrate all pages;
* migrate all components;
* redesign UI;
* replace authentication;
* replace database technology.

## Exit Criteria

The new application:

* starts locally;
* builds successfully;
* passes TypeScript/build checks;
* has the intended directory architecture;
* has its Node runtime strategy established for server paths;
* has environment classification established (server-only vs client-safe);
* has Mongoose connection caching;
* has safe Mongoose model compilation;
* has basic server error infrastructure;
* has test infrastructure with relevant infrastructure tests passing;
* does not yet depend on the old frontend runtime;
* has no Save State domain behavior migrated yet;
* has no ATP integration;
* has no migrated authentication.

---

# Phase 2 — Server Infrastructure

## Objective

Establish the server-side foundation required by the modular monolith.

## Tasks

Implement:

* MongoDB connection;
* connection caching;
* Mongoose model guards;
* server-only modules;
* environment configuration;
* error infrastructure;
* validation infrastructure;
* shared server utilities.

## Schema scope

Establish generic shared validation/schema conventions and helpers as needed.

Domain-specific schemas remain scoped to their respective migration phases:

* authentication schemas belong to Phase 3 — Authentication;
* game/list domain schemas belong to their respective later domain phases.

Phase 2 must not migrate domain-specific schemas.

## Important

Connection handling must be compatible with:

* local development;
* hot reload;
* Vercel/serverless execution;
* concurrent requests.

## Exit Criteria

The application can safely connect to the Save State MongoDB and use its Mongoose models.

---

# Phase 3 — Authentication

## Objective

Migrate authentication without changing authentication semantics.

## Preserve

* registration;
* login;
* logout;
* current-user lookup;
* password change;
* password reset;
* JWT;
* httpOnly cookie;
* `sessionVersion`;
* bcrypt behavior.

## Tasks

* migrate User model;
* migrate auth services;
* migrate cookie handling;
* migrate protected server access;
* migrate auth Route Handlers where required;
* migrate authentication UI;
* preserve `POST /api/logout` clear-cookie behavior without a `sessionVersion` bump (see ADR-019);
* replace the hardcoded reset URL with environment-driven `APP_URL` configuration and select the concrete email provider (see ADR-020);
* preserve existing authentication rate limiting (see ADR-021).

## Tests

At minimum verify:

* registration;
* login;
* authenticated session;
* logout;
* invalid token;
* expired token;
* sessionVersion invalidation;
* ownership isolation;
* password change;
* password reset behavior.

## Exit Criteria

A user can authenticate against the new application using the existing database.

---

# Phase 4 — Core Server Reads

## Objective

Move read-heavy application behavior to Server Components.

## Priority

1. Dashboard
2. Game lists
3. Backlog
4. Game detail
5. Other read-only screens

## Architecture

```text
Server Component
      ↓
Server Service
      ↓
Mongoose
      ↓
MongoDB
```

Do not call the application's own Route Handlers for internal server reads.

## Dashboard

Move dashboard aggregation from the browser to the server.

The browser should receive an appropriate dashboard view model rather than raw game data that it must aggregate itself.

## Exit Criteria

Core pages can render server-side using Save State data without depending on the old frontend API client.

---

# Phase 5 — Mutations and Route Handlers

## Objective

Migrate write operations.

## Areas

* games;
* lists;
* user settings;
* authentication mutations;
* exports.

## Architecture

```text
Client Component
      ↓
Route Handler
      ↓
Server Service
      ↓
Mongoose
```

Where a Server Action is clearly more appropriate, it may be considered, but it must not be introduced merely because it is available.

## Preserve

* validation;
* authorization;
* ownership checks;
* duplicate handling;
* pagination;
* error contracts;
* existing response semantics where applicable.

## Harden

* GameList duplicate-name creation should be hardened if appropriate (see ARCHITECTURE.md §18 — unlike GlobalGame creation, it currently lacks duplicate-key recovery).
* Evaluate durable/distributed rate limiting for production without weakening existing authentication protection (see ADR-021).

## Exit Criteria

The new application can perform the full existing Save State CRUD workflow.

---

# Phase 6 — UI Migration

## Objective

Move the existing Save State UI into the new application while preserving behavior and appearance as much as practical.

## Scope

Migrate:

* layouts;
* navigation;
* dashboard UI;
* backlog;
* games;
* lists;
* forms;
* settings;
* authentication screens.

## Rules

Do not perform a visual redesign.

Do not replace:

* Tailwind;
* Zustand;
* RPGUI;
* existing visual language;

as part of this phase.

## Client Boundary

Identify browser-dependent components individually.

Do not convert entire routes to Client Components just to simplify migration.

## Exit Criteria

The new application provides feature parity for the existing Save State UI.

---

# Phase 7 — RPGUI Integration

## Objective

Integrate RPGUI into the Next.js application safely.

## Concerns

* CSS loading;
* image assets;
* font assets;
* browser initialization;
* `window`;
* `document`;
* global RPGUI behavior;
* pixel-art rendering.

## Rules

RPGUI must remain isolated from server code.

Do not rewrite RPGUI itself during this phase.

The separate RPGUI modernization project remains independent.

## Exit Criteria

Representative RPGUI components render correctly in:

* development;
* production build;
* deployed environment.

---

# Phase 8 — Regression Tests

## Objective

Verify that migration preserved behavior.

## API/domain coverage

Verify:

* auth;
* ownership;
* games;
* lists;
* pagination;
* validation;
* exports;
* duplicate/race behavior;
* error contracts.

## UI coverage

Prioritize:

* authentication;
* navigation;
* dashboard;
* game creation;
* game update;
* list operations;
* logout;
* critical error states.

## Exit Criteria

Critical behavior has automated verification and the migrated application has no known blocker regressions.

---

# Phase 9 — ATP BFF Integration

## Objective

Integrate ATP only after the Save State consolidation is stable.

## Tasks

Implement:

* ATP HTTP client;
* ATP DTO validation;
* ATP error translation;
* timeout handling;
* server-only ATP configuration;
* game search;
* game lookup;
* cover retrieval where required;
* GlobalGame ↔ ATP identity mapping.

## Mapping

```text
ATP Game.id
      ↓
GlobalGame.atpDomainId
      ↓
UserGame.gameId
```

## Important

Do not expose ATP administrative endpoints directly to the browser.

Future admin operations must be explicitly allowlisted.

Avoid a naive search-then-N-cover-requests integration. Prefer lazy cover loading for the initial strategy unless measured evidence requires a batched ATP endpoint (see ADR-023).

## Exit Criteria

Save State can consume ATP through a stable server-side HTTP integration.

---

# Phase 10 — Deployment and Parallel Validation

## Objective

Deploy the new application while preserving rollback capability.

## Save State

Deploy Next.js independently.

## ATP

Continue deploying ATP independently.

## Validation

Compare:

* authentication;
* CRUD;
* lists;
* dashboard;
* exports;
* game metadata;
* performance;
* error behavior.

## Rollback

If critical regressions are found, traffic should be returned to the old frontend/API.

The migration must not require destructive database changes merely to roll back the application.

## Production readiness

Before cutover:

* finalize the production CORS posture (the legacy hardcoded origin must not carry over);
* rotate any credentials that were ever committed or shared as demos;
* confirm the durable rate-limit evaluation from ADR-021.

## Exit Criteria

The new application is considered production-capable.

---

# Phase 11 — Legacy Decommissioning

## Objective

Remove the old Save State frontend/API only after the new application has proven stable.

## Preconditions

All must be true:

* production validation completed;
* authentication verified;
* critical CRUD verified;
* exports verified;
* ATP integration verified if already enabled;
* no unresolved critical regressions;
* rollback window has passed;
* required documentation is current.

## Actions

Only after approval:

* archive old frontend;
* archive old API;
* remove obsolete deployment configuration;
* remove obsolete CI/CD;
* update ecosystem documentation.

Do not delete historical repositories before the new system has been validated.

---

# 6. Migration Invariants

Throughout every phase:

1. ATP remains independent.
2. Save State MongoDB remains the Save State database.
3. Mongoose remains the Save State persistence layer.
4. JWT authentication remains.
5. Existing domain semantics remain.
6. No unrelated features are introduced.
7. Old systems remain available until decommissioning.
8. Secrets are never exposed.
9. Client/server boundaries remain explicit.
10. Migration remains rollback-friendly.

---

# 7. Explicitly Out of Scope

Unless separately requested, this migration does NOT include:

* RPGUI modernization;
* visual redesign;
* new game statuses;
* favorites;
* social features;
* AI recommendations;
* replacing MongoDB;
* replacing Mongoose;
* replacing JWT;
* replacing Tailwind;
* replacing Zustand;
* introducing React Query;
* merging ATP into Save State;
* moving ATP to Vercel;
* rewriting ATP Engine.

---

# 8. Migration Completion

The migration is complete when:

```text
save-state/
    is the canonical Save State application

save-state-frontend/
    is no longer required

save-state-api/
    is no longer required

atp-engine/
    remains independently deployable
```

The architecture documentation must then describe the current architecture rather than the migration target.

`MIGRATION_PLAN.md` should be marked as completed and retained as historical project documentation.

---

# 9. Final Target

```text
                         Browser
                            │
                            ▼
                 ┌────────────────────┐
                 │    Save State      │
                 │      Next.js       │
                 │                    │
                 │ UI                 │
                 │ Auth               │
                 │ Games              │
                 │ Lists              │
                 │ Dashboard          │
                 │ Server Services    │
                 │ Route Handlers     │
                 │ ATP BFF            │
                 └───────┬────────────┘
                         │
              ┌──────────┴───────────┐
              │                      │
              ▼                      ▼
       Save State MongoDB       ATP Engine
                                     │
                                     ▼
                                ATP MongoDB
```

The migration succeeds when the boundaries are simpler internally without sacrificing the independent boundary around ATP.
