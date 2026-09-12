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
* validation/schema drift across the HTTP boundary, with frontend and backend independently describing API data;
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

## ADR-019 — Preserve Logout Behavior During Migration

### Status

Accepted

### Decision

The migration preserves the current logout behavior:

```text
POST /api/logout
    ↓
clear authentication cookie
```

Logout does NOT increment `sessionVersion`.

### Reason

This is a behavior-preservation decision, not a claim that it is the final ideal security model.

Changing logout to invalidate all active tokens would alter authentication semantics and must be treated as a separate security decision with its own review.

---

## ADR-020 — Environment-Driven Email and Reset URLs

### Status

Accepted

### Decision

The migration must remove the hardcoded reset URL and the console-only email behavior.

The architecture must use environment-driven configuration such as:

```text
APP_URL
EMAIL_PROVIDER
```

### Reason

The current API hardcodes the reset-password URL to a localhost address and delivers reset messages through a console-only email stub.

Neither behavior is shippable in the consolidated application.

The concrete email provider is deferred to Phase 3 and must be recorded here when chosen. No specific provider is selected by this decision.

---

## ADR-021 — Preserve Auth Rate Limiting; Evaluate Durability Before Production

### Status

Accepted

### Decision

Existing authentication rate limiting behavior is preserved during migration.

No new distributed rate-limit infrastructure is introduced in Phase 1 merely because Vercel/serverless execution is being introduced.

However:

* in-memory rate limiting is not a durable distributed production solution;
* durable/distributed rate limiting must be evaluated before production deployment (Phase 5/Phase 10);
* authenticated game/list route rate limiting remains a separate security decision.

### Reason

This decision must not silently weaken existing authentication protection.

Deferring the durability evaluation keeps early phases focused on behavior preservation while guaranteeing the production question is asked before cutover.

---

## ADR-022 — Node.js 20 and pnpm Baseline

### Status

Accepted, subject to Phase 1 verification

### Decision

The intended Save State development/runtime baseline is:

```text
Node.js 20
pnpm
```

### Reason

ATP Engine already pins Node 20 in its engine field and container image, and the Save State API workspace shows pnpm usage.

Aligning the consolidated application on this baseline reduces toolchain drift across the ecosystem.

The baseline must be verified against the actual project/toolchain during Phase 1. If verification fails, this decision is reconsidered explicitly rather than worked around silently.

Existing repositories are not modified as part of recording this decision.

---

## ADR-023 — Lazy Cover Loading as Initial ATP Strategy

### Status

Accepted as Phase 9 decision input

### Decision

The current ATP `GameResponse` does not include all cover metadata required by the Save State search UI.

The integration must avoid a naive:

```text
search N games
    ↓
N individual cover requests
```

pattern against ATP and its upstream sources.

The initial Phase 9 strategy prefers lazy cover loading unless implementation evidence demonstrates that a batched ATP endpoint is necessary.

### Reason

A search-fan-out integration multiplies upstream source load and risks request timeouts for no structural benefit.

This decision is a Phase 9 input, not a Phase 1 blocker, and may be revisited during Phase 9 based on measured behavior.

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
