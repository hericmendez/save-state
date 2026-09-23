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

# 20. Parallel Development Sessions

This is an operational recommendation, not an application bug fix.

One `next dev` instance must use a working tree at a time. Parallel
sessions must not run `next dev` simultaneously while sharing the same
directory (and therefore the same `.next` folder): concurrent dev
servers can cause transient inconsistencies in route manifests and
compiled route artifacts (sporadic HTML 404s or `ENOENT` for route
chunks that exist in source).

This does not represent an Activity Feed bug, does not change any
production configuration, and requires no locking mechanism or code.

---