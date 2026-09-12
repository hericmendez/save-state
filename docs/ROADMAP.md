# Save State — Project Roadmap

> **Canonical roadmap for implementation phases, phase boundaries, and agent authorization.**
>
> This document exists so both humans and coding agents can understand:
>
> * what each phase means;
> * why the phase exists;
> * what is and is not included;
> * what must be true before a phase starts;
> * what proves that a phase is complete;
> * and whether the next phase is actually authorized to begin.
>
> **This is a control document, not a task dump.**
>
> Detailed phase specifications live in `docs/MIGRATION_PLAN.md`. This document
> defines sequence, status, dependencies, and gates — not implementation tasks.
>
> Agents MUST NOT infer phase scope, completion, or authorization from filenames,
> TODOs, commit messages, or the apparent state of the codebase when this document
> provides an explicit rule.

---

## 1. Authority and Numbering Ruling

Canonical phase numbering follows **`docs/MIGRATION_PLAN.md`**:

```text
Phase 0    Architecture Freeze
Phase 0.5  Architecture Consistency Audit
Phase 1    Next.js Skeleton
Phase 2    Server Infrastructure
Phase 3    Authentication
Phase 4    Core Server Reads
Phase 5    Mutations and Route Handlers
Phase 6    UI Migration
Phase 7    RPGUI Integration
Phase 8    Regression Tests
Phase 9    ATP BFF Integration
Phase 10   Deployment and Parallel Validation
Phase 11   Legacy Decommissioning
```

**Explicit ruling (recorded so it never needs rediscovery):** an earlier draft of
this roadmap mislabeled Phase 7 as "Regression / Migration Verification" and left
Phase 8 as an undefined placeholder. That numbering was incorrect and has been
removed. The correct mapping is:

```text
Phase 7 = RPGUI Integration
Phase 8 = Regression Tests
Phase 9 = ATP BFF Integration
```

If any document, prompt, or report appears to use different numbering, the agent
MUST treat `docs/MIGRATION_PLAN.md` as authoritative and report the conflict
instead of choosing an interpretation.

---

## 2. Agent Operating Rules

### 2.1 Read this document first

Before implementation work, the agent MUST read:

1. `docs/ROADMAP.md`
2. `AGENTS.md`
3. `docs/MIGRATION_PLAN.md` (phase execution detail)
4. Applicable Architecture / Integration / Decision documents

### 2.2 The roadmap is the phase authority

This document defines phase numbering, names, purpose, boundaries, prerequisites,
acceptance criteria, exit conditions, and dependencies. Other documents provide
implementation detail but MUST NOT silently redefine a phase.

### 2.3 Completing a phase does not automatically authorize the next phase

```text
Phase N COMPLETE
        ↓
Check Phase N+1 prerequisites
        ↓
Check authorization
        ↓
Only then may Phase N+1 begin
```

An agent MUST NOT start a future phase merely because its prerequisites appear
satisfied. Explicit user authorization is required.

### 2.4 Do not expand scope between phases

A phase MUST NOT absorb work belonging to another phase. Related findings get
documented, triaged as blocker or deferred, and left for their owning phase.

### 2.5 Preserve existing behavior during migration

Unless a phase explicitly states otherwise: contracts, ownership/security,
authentication/session, error semantics, and UI behavior are preserved. Intentional
behavioral changes require explicit scope.

---

## 3. Phase Status Model

```text
PLANNED      — exists in the roadmap, not authorized for implementation.
READY        — prerequisites satisfied and eligible to start (not permission).
IN PROGRESS  — explicitly authorized and implementation has started.
VERIFICATION — implementation complete enough for acceptance criteria to be evaluated.
IMPLEMENTED  — the required implementation exists.
VERIFIED     — the implementation passed its defined verification.
COMPLETE     — verification passed AND completion/authorization conditions
               (including commit hygiene below) are formally satisfied.
BLOCKED      — cannot proceed; blocker recorded.
DEFERRED     — intentionally postponed; owner recorded where known.
```

Critical distinction used by this roadmap:

```text
IMPLEMENTED + VERIFIED  ≠  COMPLETE
```

Uncommitted work MUST NOT be silently collapsed into COMPLETE. Phases 7 and 8
below are IMPLEMENTED + VERIFIED but UNCOMMITTED, and are therefore reported
exactly that way — not as COMPLETE.

---

## 4. Canonical Phase Table

| Phase | Name                               | Status                         |
| ----- | ---------------------------------- | ------------------------------ |
| 0     | Architecture Freeze                | COMPLETE (`0d31153`)           |
| 0.5   | Architecture Consistency Audit     | COMPLETE (doc-repair pass)     |
| 1     | Next.js Skeleton                   | COMPLETE (`b92f201`)           |
| 2     | Server Infrastructure              | COMPLETE (`b92f201`)           |
| 3     | Authentication                     | COMPLETE (`6b697b2`)           |
| 4     | Core Server Reads                  | COMPLETE (`6b697b2`)           |
| 5     | Mutations and Route Handlers       | COMPLETE (`6b697b2`)           |
| 6     | UI Migration                       | COMPLETE (`44bb36d`)           |
| 7     | RPGUI Integration                  | COMPLETE (`fdbdf81`)                 |
| 8     | Regression Tests                   | COMPLETE (`fdbdf81`)                 |
| 9     | ATP BFF Integration                | COMPLETE (`a4d9190`)                 |
| 10    | Deployment and Parallel Validation | PLANNED                        |
| 11    | Legacy Decommissioning             | PLANNED                        |

---

## 5. Phase History (Phases 0–8)

Summaries only. Detailed specifications: `docs/MIGRATION_PLAN.md`. No phase
report files exist in the repository; narratives below reconstruct session
verification records, not invented detail.

### Phase 0 — Architecture Freeze — COMPLETE (`0d31153`)

- **Objective:** Establish and document the architecture before implementation.
- **Result:** `AGENTS.md` plus `ARCHITECTURE.md`, `INTEGRATION.md`,
  `DEVELOPMENT_RULES.md`, `DECISIONS.md` (ADR-001–ADR-018), `MIGRATION_PLAN.md`.
- **Significance:** Created the governance stack every later phase builds on.
- **Deferred:** none. **Next dependency:** Phase 0.5.

### Phase 0.5 — Architecture Consistency Audit — COMPLETE (doc-repair pass)

- **Objective:** Verify governance documents match the actual repositories (read-only).
- **Result:** Found `MIGRATION_PLAN.md` truncated mid-word with all Phase 1–11
  bodies missing, plus missing decisions. A documentation-only correction pass
  completed the plan and recorded ADR-019 (logout), ADR-020 (env-driven reset
  URL), ADR-021 (rate limiting), ADR-022 (Node 20 + pnpm), ADR-023 (lazy covers).
- **Significance:** Repaired the plan that now governs all execution.
- **Next dependency:** Phase 1.

### Phase 1 — Next.js Skeleton — COMPLETE (`b92f201`)

- **Objective:** New application shell with zero domain behavior.
- **Result:** Next 15 + React 19 + Tailwind v4, strict TS, env classification,
  cached Mongoose connection, model guards, `{error:{code,message}}` helpers,
  health endpoint, vendored RPGUI CSS/assets, 17 infra tests. Validated:
  test/typecheck/lint/build green + live health smoke.
- **Significance:** The infrastructure baseline (connection caching, server-only
  boundaries) that all server code relies on.
- **Deviations:** FlatCompat eslint wrapper; CSS `@import` moved to layout import;
  two minimal vendored-CSS parser-compat fixes.
- **Next dependency:** Phase 2.

### Phase 2 — Server Infrastructure — COMPLETE (`b92f201`)

- **Objective:** Reusable server-side foundation (validation, pagination, handler,
  logging conventions).
- **Result:** `server/shared/` (validation helpers with `VALIDATION_ERROR` /
  `INVALID_QUERY` split, pagination envelope, `handleRoute`, redacting logger);
  `INVALID_QUERY` added to the error registry. 37 tests total, all green.
- **Significance:** Every later handler/service builds on these modules.
- **Deferred:** domain schemas explicitly scoped out (auth → Phase 3, game/list →
  later phases).
- **Next dependency:** Phase 3.

### Phase 3 — Authentication — COMPLETE (`6b697b2`)

- **Objective:** Migrate auth semantics verbatim (ADR-019/020/021 applied).
- **Result:** User + PasswordResetToken models; 8 handlers
  (register/login/me/patch-me/change/forgot/reset/logout); JWT + `token` cookie +
  `sessionVersion`; bcryptjs cost 10; in-memory rate limits preserved; console
  email stub (token excluded from logs — deliberate hardening); reset URL from
  `APP_URL`. 35 auth tests + live full-cycle smoke.
- **Significance:** Session infrastructure reused by Phases 4–8 and required by
  Phase 9.
- **Deferred:** `GET /api/auth/export[/csv]` (payload needs unmigrated game
  models; endpoints absent, nothing fabricated); real email provider.
- **Known decision:** SafeUser kept as legacy `{id,name,email}`.
- **Next dependency:** Phase 4.

### Phase 4 — Core Server Reads — COMPLETE (`6b697b2`)

- **Objective:** Server Component → service → Mongoose reads; dashboard
  aggregation moves server-side (ADR-011).
- **Result:** Read models with exact legacy fields/indexes; query-only schemas;
  `listGames`/`getGame`/list/stats services; 6 GET handlers preserving envelope
  quirks and param-validation asymmetries; `getCurrentSession()` via
  `next/headers`; minimal dashboard Server Component. 35 read tests + live smoke.
- **Significance:** Killed the legacy client fan-out; established the read path
  UI migration consumes.
- **Next dependency:** Phase 5.

### Phase 5 — Mutations and Route Handlers — COMPLETE (`6b697b2`)

- **Objective:** Migrate all game/list/membership writes with exact contracts.
- **Result:** create/update/delete game + list services (slug, 11000-winner
  recovery, `GAME_ALREADY_IN_LIBRARY`, `GAME_METADATA_IMMUTABLE`, null-clearing,
  delete preserves GlobalGame); list mutations with `LIST_ALREADY_EXISTS`
  hardening; idempotent membership; separate PATCH+PUT handlers (verified
  equivalent); `slugify` added (justified). 39 mutation/concurrency tests,
  including deterministic parallel-creation race tests.
- **Significance:** Full CRUD contract surface for UI migration.
- **Deferred:** exports (standing deferral honored despite plan area listing).
- **Next dependency:** Phase 6.

### Phase 6 — UI Migration — COMPLETE (`44bb36d`)

- **Objective:** Product UI on App Router with server sessions and localized
  client boundaries (47 files).
- **Result:** Auth pages + server-guarded layout + sidebar shell; dashboard from
  `getGameStats`; backlog/lists/detail/new/edit pages; Collection, portal modal
  and menus, forms, manager, settings; same-origin API client; ui-store reduced
  to layout prefs (AuthStore deleted); legacy route defects fixed
  (deduped `/`, dropped `#`/stub/orphan routes); `zustand` + `framer-motion`
  added with justification. Live UI smoke incl. redirects and cross-user 404s.
- **Significance:** The application is end-to-end usable on the new stack.
- **Deviations:** minimal delete-game UI added (legacy had none); canonical edit
  route; dashboard renders `GameStats` directly; one redirect-swallowing bug
  found and fixed.
- **Next dependency:** Phase 7.

### Phase 7 — RPGUI Integration — COMPLETE (`fdbdf81`)

- **Objective:** Integrate the existing RPGUI runtime safely (plan §Phase 7).
- **Result:** Byte-identical `rpgui.js` vendored to `public/vendor/`; controlled
  client boundary (`RpguiInitializer` + `beforeInteractive` guard + pure guard
  helpers); **global `RPGUI.init()` deliberately never invoked** (audited React
  ownership conflict: it hides native selects and duplicates progress DOM);
  `.rpgui-input` declarations mirrored into app-owned CSS (vendored file
  untouched); `rpgui-content` removed from auth forms (fixed-position hazard).
  5 guard tests. Production Chromium verification: runtime loads, auto-init
  suppressed, zero injected DOM, crisp pixels at 100%/150%/390px/DPR2, portals
  styled, zero console errors.
- **Significance:** Closes the pixel-art motivation without endangering React
  reconciliation. No modernization performed.
- **Not committed.** See §11 gate.
- **Next dependency:** Phase 8 (already executed; commit outstanding).

### Phase 8 — Regression Tests — COMPLETE (`fdbdf81`)

- **Objective:** Verify migration preserved behavior (plan §Phase 8 coverage lists).
- **Result:** 162/162 tests (23 files) incl. 11 focused additions (normalization,
  pagination boundaries); restored missing `INVALID_ID` CastError mapping;
  16-check CDP browser regression (auth UI, real form submits, modal, lists,
  navigation loop, back/forward, logout, network + console audits); full
  production CRUD smoke; contract code-list diffed identical to legacy.
- **Significance:** The stability gate for Phase 9.
- **Not committed.** See §11 gate.
- **Next dependency:** Phase 9 (NOT authorized).

---

## 6. Phase 9 — ATP BFF Integration — COMPLETE (`a4d9190`)

Intended architecture:

```text
Browser
   │
   │ same-origin / application API
   ▼
Save State BFF
   │
   │ server-side integration
   ▼
ATP Engine
```

The browser MUST NOT directly depend on ATP Engine. Detailed tasks live in
`docs/MIGRATION_PLAN.md` (Phase 9 section); ADR-015/016/017/023 and
`docs/INTEGRATION.md` define the boundary rules. Do not begin implementation;
see §7.

## 7. Phase 9 Entry Gate

Phase 9 becomes READY/AUTHORIZED only when ALL hold:

```text
Phase 7 verified
+
Phase 8 verified
+
Phase 7/8 changes committed
+
test suite green
+
typecheck green
+
lint green
+
build green
+
no unresolved P0/P1 regression
+
Phase 9 specification (MIGRATION_PLAN.md) read
+
explicit user authorization
=
Phase 9 READY / AUTHORIZED
```

Current state: code passes all checks, but Phases 7–8 are **uncommitted**.
Therefore:

```text
Phase 9 = NOT AUTHORIZED
```

Do NOT mark Phase 9 READY merely because tests pass.

## 8. Phases 10–11 — Planned

- **Phase 10 — Deployment and Parallel Validation:** per `docs/MIGRATION_PLAN.md`.
  Requires Phase 9 COMPLETE plus its own prerequisites and authorization.
- **Phase 11 — Legacy Decommissioning:** per `docs/MIGRATION_PLAN.md`. Requires
  Phase 10 COMPLETE plus its own prerequisites and authorization.

No requirements may be invented for these phases while working on earlier ones.

## 9. Phase Transition Rules

The agent MUST NOT skip phases, start a future phase because code looks ready,
infer authorization from completion, absorb future work into the current phase,
or redesign architecture to satisfy unclear requirements. Transition shape:

```text
Current phase
     ↓
Acceptance criteria verified
     ↓
Working tree / commit condition satisfied
     ↓
Prerequisites for next phase verified
     ↓
Explicit authorization
     ↓
Next phase begins
```

## 10. Scope Control

```text
save-state/            — migration phases operate here
save-state-frontend/   — reference/rollback baseline until decommissioning
save-state-api/        — reference/rollback baseline until decommissioning
atp-engine/            — independent system; untouched by migration phases
```

`atp-engine/docs/roadmap.md` is ATP's independent roadmap. It does NOT define,
renumber, or constrain Save State migration phases. Legacy projects change only
at explicitly authorized steps (decommissioning).

## 11. Deferred Work Register

| Item | Status | Reason | Owner phase |
| ---- | ------ | ------ | ----------- |
| Export migration (`/api/auth/export[/csv]`) | DEFERRED | Payload needs game models; fabrication forbidden | TBD — assign before implementation |
| Durable/distributed rate limiting | DEFERRED | Preserved in-memory per ADR-021; evaluate pre-production | Phase 10 at latest |
| Real email provider | DEFERRED | Console stub per ADR-020 | Phase 3 follow-up / pre-production |
| No-global-`RPGUI.init()` documentation | CANDIDATE | Load-bearing but no ADR (decision: do not auto-create) | ADR candidate for a docs pass |
| Deployment | PLANNED | Phase 10 owns it | Phase 10 |
| Legacy decommissioning | PLANNED | Phase 11 owns it | Phase 11 |

## 12. ADR / Decision References

- ADR-001–ADR-018: foundation (`docs/DECISIONS.md`) — consolidation, App Router,
  MongoDB/Mongoose, JWT, ATP independence + HTTP, Server-Component reads,
  localized client, no React Query/Express-layer, server-side dashboard, RPGUI
  non-blocker, incremental migration, scope discipline, ATP admin/CORS/Zod,
  ATP deferred.
- ADR-019: logout clears cookie only (applied Phase 3).
- ADR-020: env-driven reset URL, provider deferred (applied Phase 3).
- ADR-021: preserve auth rate limiting (applied Phase 3; durability deferred).
- ADR-022: Node 20 + pnpm baseline (verified Phase 1).
- ADR-023: lazy cover loading (Phase 9 input).

Contents are not duplicated here; the ADRs are authoritative.

## 13. Completion Protocol

A phase is complete only when:

```text
Implementation
+
Verification
+
Regression safety
+
Scope compliance
+
Required documentation
+
Acceptance criteria
=
Phase Complete
```

Applicable checks per phase: tests, typecheck, lint, build, runtime, browser,
network, security verification — only those relevant to the phase. A passing
suite alone is never sufficient (see commit condition in §7).

## 14. Agent Conflict Rule

> If the roadmap, migration plan, ADRs, implementation instructions, or current
> code appear to disagree, the agent MUST investigate the conflict before
> modifying code. It MUST NOT silently choose an interpretation when the conflict
> can affect architecture, behavior, phase scope, or contracts.

Procedure: inspect authoritative documents → check ADRs → report ambiguity →
avoid irreversible changes until resolved. Precedence: explicit user instruction
> `AGENTS.md` > `docs/DECISIONS.md` > `docs/ARCHITECTURE.md` > other docs >
> existing implementation behavior; `docs/MIGRATION_PLAN.md` governs phase
> execution detail.

## 15. Current Project Position

```text
Completed:
Phase 0
Phase 0.5
Phase 1
Phase 2
Phase 3
Phase 4
Phase 5
Phase 6
Phase 7 — RPGUI Integration (`fdbdf81`)
Phase 8 — Regression Tests (`fdbdf81`)
Phase 9 — ATP BFF Integration (`a4d9190`)

Next:
Phase 10 — Deployment and Parallel Validation

Phase 10 status:
PLANNED / NOT AUTHORIZED
```

The next implementation action is **not automatically Phase 10**. It requires
explicit authorization per §7-equivalent gates for future phases.
