# Save State Architecture

## 1. Purpose

This document defines the target architecture of the Save State application after consolidation of the existing frontend and API.

The architecture is intentionally conservative.

The migration should solve existing architectural friction without introducing unnecessary technologies or redesigning unrelated parts of the system.

---

# 2. Ecosystem Boundary

The ecosystem contains three projects:

```text
AGORA_VAI/
├── save-state-frontend/
├── save-state-api/
└── atp-engine/
```

The first two belong to the Save State application.

ATP Engine is a separate system.

The target state is:

```text
AGORA_VAI/
├── save-state/
└── atp-engine/
```

The old frontend and API repositories remain available during migration and are decommissioned only after the new application is validated.

---

# 3. Target System

```text
                         ┌──────────────────────┐
                         │      Browser         │
                         └──────────┬───────────┘
                                    │
                                    ▼
                    ┌─────────────────────────────┐
                    │      Save State             │
                    │      Next.js App Router     │
                    │                             │
                    │  UI                         │
                    │  Authentication             │
                    │  Games                      │
                    │  Lists                      │
                    │  Dashboard                  │
                    │  Server Services             │
                    │  Route Handlers              │
                    │  ATP BFF                     │
                    └───────┬───────────┬─────────┘
                            │           │
                            │           │ HTTP
                            │           ▼
                            │   ┌─────────────────┐
                            │   │   ATP Engine    │
                            │   │   Express       │
                            │   │   Node 20       │
                            │   └────────┬────────┘
                            │            │
                            │            ▼
                            │      ATP MongoDB
                            │
                            ▼
                       Save State
                        MongoDB
```

---

# 4. Architectural Style

Save State uses a **modular monolith**.

This means:

* one Next.js application;
* one deployment unit;
* multiple explicit internal modules;
* server-side domain/application logic;
* client-side UI where necessary;
* HTTP boundaries only where useful.

It does NOT mean:

* one giant module;
* one giant service;
* every feature sharing every dependency;
* Express embedded inside Next.js;
* direct access to every internal service from every component.

---

# 5. Application Layers

The conceptual layering is:

```text
Presentation
    ↓
Application
    ↓
Persistence / Infrastructure
```

For browser reads:

```text
Server Component
      ↓
Server Service
      ↓
Mongoose
      ↓
MongoDB
```

For client mutations:

```text
Client Component
      ↓
Route Handler
      ↓
Server Service
      ↓
Mongoose
      ↓
MongoDB
```

For ATP:

```text
Next.js Server
      ↓
ATP Client/BFF
      ↓ HTTP
ATP Engine
```

---

# 6. Proposed Directory Structure

```text
save-state/
├── app/
│   ├── (auth)/
│   │   ├── login/
│   │   ├── register/
│   │   └── ...
│   │
│   ├── (app)/
│   │   ├── dashboard/
│   │   ├── backlog/
│   │   ├── games/
│   │   └── ...
│   │
│   ├── admin/
│   │   └── atp/
│   │
│   └── api/
│       ├── auth/
│       ├── games/
│       ├── game-lists/
│       └── atp/
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

This is a target organization, not a requirement to create empty directories immediately.

---

# 7. Server Components

Server Components should be the default for data-heavy pages.

Example:

```text
Dashboard Page
    ↓
dashboard service
    ↓
MongoDB
```

The Dashboard should not fetch its own API over HTTP if the data is already available to the server.

This is one of the primary architectural benefits of the migration.

---

# 8. Client Components

Client Components should exist at the smallest practical boundary.

Examples:

```text
GameCard
    └── interactive controls

GameEditor
    └── form state

RPGUI initialization
    └── browser-only behavior

UI state
    └── Zustand
```

A parent page should not become a Client Component solely because one child requires browser APIs.

---

# 9. Authentication

The authentication model remains:

```text
Browser
    ↓
httpOnly JWT cookie
    ↓
Next.js server
    ↓
JWT verification
    ↓
sessionVersion verification
```

The cookie remains inaccessible to JavaScript running in the browser.

The migration should preserve:

* login;
* registration;
* logout;
* current-user lookup;
* password change;
* password reset;
* session invalidation.

---

# 10. Data Model

The core Save State domain remains:

```text
User
 │
 ├── UserGame
 │      │
 │      └── GlobalGame
 │
 └── GameList
```

A `UserGame` represents the user's relationship with a game.

A `GlobalGame` represents shared game metadata.

A `GameList` represents a user's custom organization of games.

These concepts must not be collapsed into one model.

---

# 11. Game Identity

The Save State database continues to use MongoDB `_id` as its database identity.

ATP identity is separate.

Future mapping:

```text
ATP Game.id
     │
     ▼
GlobalGame.atpDomainId
     │
     ▼
GlobalGame._id
     │
     ▼
UserGame.gameId
```

This allows ATP metadata to remain externally identified without replacing Save State's persistence identity.

Implemented mapping (Phase 9, policy closed by ADR-024): the chain above
is live. `GlobalGame._id` stays primary; `atpDomainId` is an optional,
sparse-unique external reference; ATP imports are write-once snapshots
with no synchronization. Terminology convention: `atpGameId`/`atpDomainId`
= ATP `Game.domainId`; `GlobalGameId` = `GlobalGame._id`; `UserGameId` =
`UserGame._id`. (The `/api/games/[gameId]` route param addresses a
UserGame and is intentionally left renamed-out-of-scope.)

---

# 12. ATP Boundary

ATP is treated as an external service.

Save State should have an internal ATP client:

```text
server/atp/
├── client.ts
├── schemas.ts
├── types.ts
└── ...
```

The ATP client owns:

* HTTP requests;
* ATP DTO parsing;
* timeout behavior;
* error translation;
* authentication to ATP if introduced;
* service URL configuration.

Application code should not manually construct ATP URLs throughout the codebase.

Bad:

```ts
fetch(`${process.env.ATP_URL}/api/v1/games/${id}`)
```

throughout multiple files.

Preferred:

```ts
atpClient.getGame(id)
```

---

# 13. ATP DTO Boundary

ATP's internal domain types must not leak directly into Save State.

The HTTP boundary should be:

```text
ATP domain
    ↓
ATP HTTP response
    ↓
Save State ATP DTO
    ↓
Save State application model
```

This allows ATP and Save State to evolve independently.

---

# 14. Dashboard

The old frontend performs client-side aggregation of game data.

The target architecture should move dashboard aggregation to the server.

Preferred:

```text
Dashboard Server Component
        ↓
Dashboard Service
        ↓
MongoDB aggregation/query
        ↓
Dashboard View Model
```

The browser should receive the already-computed dashboard data.

This reduces:

* unnecessary transfer;
* client-side computation;
* duplicated business logic;
* loading complexity.

---

# 15. API Compatibility

Existing API behavior should be preserved during migration.

The consolidated application may internally use server services instead of HTTP calls.

HTTP endpoints remain where they provide value:

* external/browser API compatibility;
* mutations from client components;
* exports;
* authentication;
* ATP BFF.

The existence of a Route Handler does not require internal server code to call that Route Handler.

---

# 16. Validation

Validation should occur at external boundaries.

Examples:

```text
HTTP request
    ↓
Zod schema
    ↓
application service
```

Forms should also validate user input where appropriate.

Server-side validation remains authoritative.

---

# 17. Error Handling

The application should use structured errors.

Existing API contract:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message"
  }
}
```

Internal services may use typed/domain errors and translate them at HTTP boundaries.

The UI should not depend on parsing arbitrary exception messages.

---

# 18. Persistence and Concurrency

Shared-resource creation must remain safe under concurrent requests.

GlobalGame creation currently handles duplicate-key races by refetching the existing document.

That behavior should be preserved.

This guarantee is specific to GlobalGame creation. It must not be read as claiming that all shared-resource creation in the current API has equivalent race recovery. GameList duplicate-name creation, in particular, should be hardened during Phase 5 if appropriate.

Mongoose connection caching is mandatory for the Next.js server infrastructure (local hot reload, serverless reuse, concurrent requests, model-recompilation safety). Connection caching is not an optional future optimization.

Application/data/result caching is a separate concern and remains deferred (see §23).

The migration must not assume:

```text
check existence
    ↓
create
```

is atomic.

Database uniqueness constraints remain important.

Transactions should only be introduced where they provide a concrete consistency guarantee and are compatible with the deployed MongoDB environment.

Do not introduce transactions simply because the application is moving to Next.js.

---

# 19. Configuration

Save State configuration is server-owned.

Conceptually:

```text
MONGODB_URI
JWT_SECRET
APP_URL
ATP_BASE_URL
```

Exact names may be chosen during implementation, but configuration must not be hardcoded.

Client-exposed configuration must be explicitly identified.

## 19.1 Ecosystem Databases and Ports

Each system owns its database. Names are intentionally distinct and must not be "standardized" into one:

| System | Database | Default port | `MONGODB_URI` default |
|---|---|---|---|
| Save State (new, `save-state/`) | `save-state` | 27017 | `mongodb://localhost:27017/save-state` |
| Save State API (legacy, `save-state-api/`) | `savestate` | 27018 (isolated dev, no auth) | `mongodb://localhost:27017/savestate` (fallback; real dev uses `.env` on 27018) |
| ATP Engine (`atp-engine/`) | `atp-engine` | 27017 | `mongodb://localhost:27017/atp-engine` |

Notes:

* the legacy API uses port 27018 for its isolated dev instance (`pnpm mongo:dev`) so it never collides with a system Mongo on 27017;
* the legacy seed (`pnpm seed`) writes only to the database named in `MONGODB_URI` and falls back to `mongodb://127.0.0.1:27018/savestate`;
* environments do not share Mongo state: a catalog populated on one host (e.g. Linux) is not automatically present on another (e.g. Windows). No automatic database copying or syncing is performed.

---

# 20. Deployment

Save State:

```text
Next.js
    ↓
Vercel
```

ATP:

```text
Node/Express
    ↓
Container-oriented deployment
```

The two systems may be deployed independently.

A Save State deployment failure must not require rebuilding ATP.

An ATP deployment must not require rebuilding Save State unless its HTTP contract changes incompatibly.

---

# 21. Observability

The migration should preserve useful server logging.

Errors should contain enough information to diagnose failures without exposing secrets.

ATP requests should eventually include appropriate request correlation information where useful.

Do not introduce a large observability platform merely for migration.

---

# 22. Architecture Invariants

The following are architectural invariants:

1. ATP Engine remains independent.
2. Save State owns its own database.
3. ATP owns its own database.
4. Save State communicates with ATP through HTTP.
5. JWT/httpOnly authentication remains.
6. Mongoose remains the Save State persistence layer.
7. Server Components are preferred for server-readable data.
8. Client Components are explicit and localized.
9. RPGUI does not force the whole application into the client.
10. The migration does not introduce unrelated product features.
11. Existing domain semantics are preserved.
12. Secrets remain server-side.
13. The application remains incrementally migratable and rollback-friendly.

---

# 23. What This Architecture Intentionally Does Not Decide

The following are intentionally deferred:

* exact ATP authentication mechanism;
* exact ATP hosting provider;
* whether some ATP public reads may eventually be direct from the browser;
* final admin UI;
* application/data/result caching strategy (Mongoose connection caching is mandatory and is not part of this deferral — see §18);
* search UX;
* RPGUI modernization;
* CDN/image optimization strategy;
* future game metadata synchronization strategy;
* background job infrastructure.

These decisions should be made when their respective phases arrive.

---

# 24. Architectural Goal

The migration is successful if the resulting system is:

```text
simpler to deploy
simpler to reason about
simpler to authenticate
simpler to share contracts within Save State
more efficient for server-readable data
still modular internally
still independent from ATP
```

The goal is not:

> "Rewrite everything in Next.js."

The goal is:

> "Remove unnecessary boundaries inside Save State while preserving the important boundary around ATP."
