# AGENTS.md

## Save State Ecosystem — Agent Governance

This document defines the architectural, development, migration, and safety rules for AI coding agents operating inside the Save State ecosystem.

The repository root contains multiple related projects:

```text
AGORA_VAI/
├── AGENTS.md
├── docs/
├── save-state-frontend/
├── save-state-api/
└── atp-engine/
```

The ecosystem is currently being consolidated into a Next.js modular monolith for Save State while keeping ATP Engine as an independent service.

The agent MUST treat these rules as authoritative unless the user explicitly overrides them.

---

# 1. Mission

The current architectural goal is:

> Consolidate Save State frontend and Save State API into a single Next.js App Router application without merging ATP Engine into the application.

The target architecture is:

```text
Browser
   │
   ▼
Save State — Next.js Modular Monolith
   ├── UI
   ├── Authentication
   ├── UserGame
   ├── GameList
   ├── Dashboard
   ├── Server Services
   ├── Route Handlers
   └── ATP BFF
          │
          │ HTTP
          ▼
      ATP Engine
          │
          ▼
      ATP MongoDB
```

Save State's own data remains in its own MongoDB.

ATP Engine remains an independently deployable and independently maintainable service.

---

# 2. Highest-Priority Architectural Rules

## 2.1 ATP Engine MUST remain independent

The ATP Engine is a separate bounded system.

The Save State application MUST NOT:

* import ATP Engine source code;
* import ATP Engine domain classes;
* import ATP Engine repositories;
* import ATP Engine Mongoose models;
* connect directly to ATP Engine's MongoDB;
* duplicate ATP Engine's internal business logic;
* treat ATP Engine's database as part of Save State;
* merge the ATP Engine repository into the Save State application.

Integration MUST happen through the ATP Engine's HTTP API.

Allowed:

```text
Save State server
    ↓ HTTP
ATP Engine API
```

Forbidden:

```text
Save State
    ↓
ATP Engine MongoDB
```

and:

```text
Save State
    ↓
import "../../../atp-engine/src/..."
```

ATP Engine's internal implementation is not part of Save State's application layer.

---

# 3. Save State Target Architecture

The target Save State application is a modular monolith.

"Modular monolith" means:

* one deployable application;
* one application boundary;
* explicit internal modules;
* explicit server/client boundaries;
* shared infrastructure where appropriate;
* no uncontrolled cross-module dependencies.

The target structure is approximately:

```text
save-state/
├── app/
│   ├── (auth)/
│   ├── (app)/
│   ├── admin/
│   └── api/
│
├── components/
│
├── features/
│   ├── auth/
│   ├── games/
│   ├── lists/
│   └── dashboard/
│
├── server/
│   ├── auth/
│   ├── games/
│   ├── lists/
│   ├── stats/
│   ├── export/
│   ├── atp/
│   └── shared/
│
├── db/
│   ├── connection.ts
│   └── models/
│
├── schemas/
│
├── lib/
│
└── tests/
```

This structure is a guideline, not permission to create unnecessary abstractions.

The agent MUST preserve clear boundaries.

---

# 4. Next.js Architecture Rules

## 4.1 App Router

The consolidated Save State application MUST use:

* Next.js App Router;
* TypeScript;
* Node.js runtime where database/authentication/server infrastructure is involved.

Do not introduce Pages Router.

---

## 4.2 Server Components are the default

Server Components MUST be preferred for read-only application data.

Preferred:

```text
Server Component
    ↓
server service
    ↓
MongoDB
```

Avoid:

```text
Server Component
    ↓
HTTP request to own /api route
    ↓
server service
    ↓
MongoDB
```

The application should not make HTTP requests to itself merely because an API route exists.

Internal server-side code should call the appropriate service directly.

---

## 4.3 Client Components are deliberate

Do NOT add:

```tsx
"use client";
```

to pages or large component trees merely to make migration easier.

Client Components are justified when they require:

* browser APIs;
* interactive state;
* event handlers;
* Zustand;
* portals;
* clipboard;
* confirmation dialogs;
* RPGUI browser initialization;
* other inherently client-side behavior.

The default assumption is:

> If a component does not need the browser, it should remain a Server Component.

---

# 5. Data Access Rules

## 5.1 Mongoose remains

The migration MUST NOT replace MongoDB/Mongoose merely because the application is moving to Next.js.

Do not introduce:

* Prisma;
* Drizzle;
* a new ORM;
* a new database;
* a new persistence strategy;

unless explicitly requested by the user.

---

## 5.2 Mongoose connection caching is mandatory

The Next.js application MUST use a cached/reused MongoDB connection.

The implementation must prevent connection creation on every request or invocation.

The agent MUST account for:

* local development hot reload;
* serverless execution;
* concurrent requests;
* model recompilation;
* Vercel execution behavior.

Models must also avoid repeated Mongoose model compilation errors.

---

# 6. Authentication Rules

Save State currently uses:

* JWT;
* httpOnly cookie;
* cookie named `token`;
* `sessionVersion`;
* password hashing with bcrypt.

The migration MUST preserve these semantics.

Do NOT replace the authentication system with:

* NextAuth/Auth.js;
* Clerk;
* Supabase Auth;
* another authentication provider;

unless explicitly requested.

The existing `sessionVersion` invalidation mechanism MUST remain functionally equivalent.

Authentication behavior must not change merely because the framework changes.

---

# 7. API and Error Contract

The existing API error shape is:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message"
  }
}
```

New Route Handlers MUST preserve this contract where they replace existing API endpoints.

Do not introduce inconsistent error formats such as:

```json
{
  "message": "..."
}
```

or:

```json
{
  "success": false,
  "errorMessage": "..."
}
```

unless a deliberate architectural decision explicitly changes the contract.

---

# 8. Validation

Save State should use a single validation strategy inside the consolidated application.

Zod is the preferred validation library.

Schemas should be reusable between:

* Route Handlers;
* server services where appropriate;
* form boundaries where appropriate;
* tests.

ATP Engine remains independent.

ATP currently uses its own Zod version and dependency set.

Do NOT force ATP to share Save State's Zod package.

The HTTP boundary between Save State and ATP is the compatibility boundary.

---

# 9. Save State Domain Model

Existing core concepts include:

```text
User
GlobalGame
UserGame
GameList
```

The agent MUST preserve their semantics during migration.

Do not invent new domain behavior.

For example:

* do not invent favorites;
* do not redefine statuses;
* do not change rating semantics;
* do not change list semantics;
* do not merge GlobalGame and UserGame;
* do not make ATP snapshots mutable unless explicitly designed.

---

# 10. GlobalGame and ATP Identity

The intended future relationship is:

```text
ATP Game.id
     │
     ▼
GlobalGame.atpDomainId
     │
     ▼
UserGame.gameId
```

`GlobalGame.atpDomainId` should be additive and sparse.

The ATP identifier is not the same thing as MongoDB's `_id`.

Do not replace MongoDB `_id` with ATP identifiers.

Do not create title-specific hacks.

Identity mapping must be generic.

---

# 11. ATP Integration

ATP integration is a later migration phase.

The initial Save State migration MUST NOT begin by integrating ATP.

The intended architecture is:

```text
Browser
   ↓
Next.js
   ↓
ATP BFF
   ↓ HTTP
ATP Engine
```

The browser should not directly access privileged ATP operations.

Public ATP read operations may eventually have a different access strategy, but that is a future architectural decision.

Do not assume that "ATP has no CORS" is a permanent invariant.

CORS, authentication, authorization, and service-to-service authentication are separate concerns.

---

# 12. ATP Admin

Future ATP administration should be exposed through Save State's authenticated admin area.

Conceptually:

```text
Browser
   ↓
Save State /admin/atp
   ↓
authorized Route Handler / server service
   ↓
ATP Engine
```

Do not expose ATP's administrative API directly to the browser merely to save implementation time.

Do not create a generic proxy such as:

```text
/api/atp/*
```

that forwards arbitrary paths and methods.

Only explicitly allowlisted operations should be exposed.

Destructive operations require:

* authentication;
* authorization;
* explicit intent;
* appropriate validation;
* auditability where appropriate.

---

# 13. RPGUI Rules

RPGUI is a presentation dependency.

It is NOT an architectural dependency of the server.

RPGUI code that requires:

* `window`;
* `document`;
* DOM initialization;
* browser events;
* global RPGUI initialization;

must remain inside client boundaries.

Do not make the entire application a Client Component to accommodate RPGUI.

The modernization/fork of RPGUI is a separate project and MUST NOT be coupled to the Save State migration.

The Save State migration may temporarily consume the existing RPGUI implementation.

Do not redesign RPGUI while migrating Save State.

---

# 14. Zustand

Zustand remains allowed.

Use Zustand for genuinely client-side state such as:

* UI state;
* interactive controls;
* transient browser state;
* client-only preferences where appropriate.

Do not put server data into Zustand merely because the old React SPA did so.

Server-owned data should generally be fetched/rendered on the server.

---

# 15. React Query

React Query/TanStack Query is NOT required.

Do not introduce it unless a concrete problem justifies it.

The migration should not replace one data-fetching abstraction with another without need.

---

# 16. Route Handlers

Route Handlers should be used for:

* client mutations;
* authentication endpoints;
* exports;
* browser-facing API compatibility;
* ATP BFF operations;
* operations that genuinely require an HTTP boundary.

Route Handlers should remain thin.

Preferred:

```text
Route Handler
    ↓
validation
    ↓
application/server service
    ↓
repository/model
```

Do not put large business workflows directly inside route files.

---

# 17. Services

Business logic should remain outside route handlers and UI components.

Preferred:

```text
UI / Route Handler
       ↓
Application Service
       ↓
Repository / Model
```

Services should avoid unnecessary coupling to Next.js.

A service should not depend on:

```text
NextRequest
NextResponse
React components
browser APIs
```

unless that dependency is genuinely required.

---

# 18. Database Models

Mongoose models should remain isolated from UI code.

Forbidden:

```text
component → mongoose model
```

Preferred:

```text
component
   ↓
server service
   ↓
mongoose model
```

Server-only modules MUST NOT be imported into Client Components.

---

# 19. Security

Never expose:

* MongoDB credentials;
* JWT secrets;
* ATP service credentials;
* internal URLs that are meant to remain server-side;
* administrative credentials;

to browser bundles.

Environment variables must be explicitly classified as:

```text
server-only
```

or:

```text
client-safe
```

Do not prefix a secret with `NEXT_PUBLIC_`.

---

# 20. Existing Security Issues

Known issues discovered before migration must not be silently carried into the new application.

In particular, review:

* committed `.env` files;
* hardcoded localhost URLs;
* reset-password URLs;
* CORS configuration;
* production secrets;
* ATP administrative exposure;
* rate limiting.

Fix security issues deliberately.

Do not perform unrelated security rewrites during the migration.

---

# 21. Testing

Existing behavior must remain covered during migration.

The current API has a substantial test suite.

The migration must preserve or replace coverage for:

* authentication;
* ownership isolation;
* games;
* lists;
* pagination;
* exports;
* validation;
* duplicate/race behavior;
* error contracts.

The frontend currently has little/no automated test coverage.

Do not treat that as permission to skip testing the migrated application.

At minimum, critical migrated behavior must be tested.

---

# 22. Migration Strategy

Migration MUST be incremental.

Do not perform a big-bang rewrite.

The old applications should remain available while the new application is developed.

Recommended sequence:

```text
Phase 0
Architecture freeze

Phase 1
Next.js skeleton

Phase 2
Server Infrastructure

Phase 3
Authentication

Phase 4
Server-side reads

Phase 5
Mutations

Phase 6
UI migration

Phase 7
RPGUI integration

Phase 8
Tests and regression verification

Phase 9
ATP BFF integration

Phase 10
Deployment and parallel validation

Phase 11
Decommission old Save State frontend/API
```

Do not skip phases merely because implementation appears straightforward.

`docs/MIGRATION_PLAN.md` is the authoritative definition of each phase's objective, scope, tasks, exclusions, dependencies, and exit criteria. This section states the sequence; the plan states the execution contract.

---

# 23. No Scope Creep

The migration is NOT an opportunity to redesign the entire product.

Do not introduce unrelated features.

Examples of forbidden migration scope:

* favorites;
* social features;
* recommendations;
* new game statuses;
* new rating systems;
* new list behavior;
* AI game search;
* ATP admin automation;
* visual redesign;
* RPGUI modernization;
* database redesign;

unless explicitly requested as a separate task.

---

# 24. Preserve Behavior Before Improving Behavior

During migration:

1. reproduce existing behavior;
2. verify it;
3. only then improve it.

If old behavior is clearly broken, document the issue instead of silently changing semantics.

For example:

```text
FACT:
The existing frontend does X.

PROBLEM:
X is inconsistent with the intended architecture.

MIGRATION:
Preserve behavior initially.

FOLLOW-UP:
Fix X in a separate change.
```

---

# 25. Do Not Recreate Express Inside Next.js

The migration is NOT:

```text
Express
    ↓
Next.js
    ↓
Express-like folder structure
```

Do not blindly copy:

```text
routes/
controllers/
services/
```

without considering App Router architecture.

Application/service logic can migrate.

The HTTP framework boundary changes.

The goal is a Next.js modular monolith, not "Express hidden inside Next.js."

---

# 26. Do Not Make Everything a Server Action

Server Actions are allowed where appropriate.

They are not the default replacement for every existing endpoint.

Use:

* Server Components for reads;
* Route Handlers for HTTP boundaries and client mutations where appropriate;
* Server Actions only when they provide a clear benefit.

Do not create a large collection of Server Actions merely because Next.js supports them.

---

# 27. Environment Configuration

All runtime configuration must come from environment variables.

Do not hardcode:

```text
localhost:1337
localhost:3000
MongoDB URLs
ATP URLs
JWT secrets
```

The consolidated Save State application should have explicit configuration for:

```text
MongoDB
JWT
application URL
ATP base URL
other external services
```

The ATP Engine retains its own independent configuration.

---

# 28. Deployment

Save State:

```text
Next.js
   ↓
Vercel
```

ATP Engine:

```text
Express/Node
   ↓
container-oriented host
```

ATP should not be forced into Vercel's execution model.

The ATP Engine currently contains long-running/server-oriented behavior such as:

* scheduler;
* startup seed behavior;
* in-memory rate limiting;
* long-running service assumptions.

Keep that architecture independent.

---

# 29. Audit Mode

When the user asks for an audit, investigation, feasibility study, or inspection:

DO NOT:

* modify files;
* install packages;
* delete files;
* rename architecture;
* run migrations;
* commit changes;

unless explicitly requested.

Audits must distinguish:

```text
FACT
```

from:

```text
INFERENCE
```

and:

```text
RECOMMENDATION
```

Do not present architectural guesses as facts.

---

# 30. Implementation Mode

When implementing a task:

1. inspect the current state;
2. read the relevant architecture documentation;
3. identify affected modules;
4. make the smallest coherent change;
5. run relevant tests/checks;
6. report what changed;
7. report remaining issues.

Do not silently expand scope.

---

# 31. User Control

The user prefers incremental implementation and manual control of significant frontend changes.

The agent should therefore:

* propose architectural changes before broad rewrites;
* avoid mass UI rewrites without approval;
* avoid replacing working technologies without justification;
* provide focused implementation steps;
* stop when a phase is complete instead of continuing autonomously.

---

# 32. Decision Precedence

When rules conflict, use this order:

1. Explicit user instruction
2. This AGENTS.md
3. `docs/DECISIONS.md`
4. `docs/ARCHITECTURE.md`
5. Other documentation
6. Existing implementation behavior

For migration phase execution detail (objectives, tasks, exclusions, exit criteria), `docs/MIGRATION_PLAN.md` is authoritative, subject to the precedence above. Rule documents define permanent constraints; the plan defines phased execution.

Existing implementation is evidence, not architectural authority.

---

# 33. Definition of Done

A migration phase is not complete merely because the application builds.

A phase is complete when:

* intended behavior works;
* relevant tests/checks pass;
* architectural boundaries remain intact;
* no unrelated scope was introduced;
* configuration is correct;
* no secrets were exposed;
* documentation is updated when decisions changed.

---

# 34. Final Rule

When uncertain:

> Prefer the smallest change that preserves the architecture.

Do not solve uncertainty by introducing a new framework, library, abstraction, database, service, or architectural pattern.

If an architectural decision is genuinely unclear, stop and ask the user.
