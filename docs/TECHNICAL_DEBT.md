# Save State — Technical Debt Register

> Living register of known pending items. Each entry carries evidence, not
> estimates. An entry leaves this file only when the work is done or the
> decision is explicitly reversed in `docs/DECISIONS.md`.
>
> Conventions: `TD-NN` identifier, description, impact, evidence (files),
> current status, recommended next action. No effort estimates.

## Open items

### TD-01 — No real IGDB search latency metrics

- **Description:** There are no measured latency figures for combined-filter
  searches. Previous estimates were inferred from request counts and the
  250 ms IGDB throttle, not from observation.
- **Impact:** Low (no correctness effect). Blocks data-driven decisions on
  `involved_companies` caching or other search performance work.
- **Evidence:** `save-state/server/search/igdb-provider.ts`
  (multi-request filter resolution), `save-state/server/search/igdb-client.ts`
  (throttle).
- **Status:** Open. No telemetry implemented (deliberately out of Etapa 2
  scope).
- **Next action:** Measure total time, auxiliary call count and bottlenecks
  on combined queries before proposing any caching/telemetry change.

### TD-02 — No dynamic fallback for off-catalog platforms

- **Description:** Platform filter values outside the curated catalog
  (e.g. `iOS`) resolve to zero IGDB ids and return an empty page. There is
  no live fallback via IGDB `/platforms`.
- **Impact:** Medium-low. Unknown names yield empty results instead of
  suggestions; no silent broadening occurs (documented behavior).
- **Evidence:** `save-state/server/search/igdb-platforms.ts`
  (`resolveIgdbPlatformIds` returns `unresolved`, never guesses);
  `save-state/server/search/igdb-provider.ts` (empty page on unresolved).
- **Status:** Open. Fallback evaluated and deferred in Etapa 2.
- **Next action:** If implemented, query `/platforms` only on catalog miss,
  never replace curated metadata or invent ids, and keep the static catalog
  as the source of truth.

### TD-03 — No inline invalid year-range feedback

- **Description:** `yearMin > yearMax` is rejected by the API
  (`schemas/search.ts` refine) with the standard error contract, but the
  search UI shows the generic error state instead of a field-specific
  message.
- **Impact:** Low (validation exists server-side; UX only).
- **Evidence:** `save-state/features/atp/catalog-search.tsx` (yearMin/yearMax
  inputs), `save-state/schemas/search.ts` (`yearMin <= yearMax` refine).
- **Status:** Open. Deferred in Etapa 2; not required for its completion.
- **Next action:** Add an inline hint / skip-fetch guard in the advanced
  filters when both bounds are set and `min > max`.

### TD-04 — "Limpar filtros" placement vs. wireframe

- **Description:** The "Limpar filtros" button sits beside the
  "Filtros avançados" toggle (always visible) rather than inside the
  collapsible panel.
- **Impact:** Negligible visual divergence; behavior is correct (clears
  filters and sort, preserves title text).
- **Evidence:** `save-state/features/atp/catalog-search.tsx` (filter panel).
- **Status:** Open. Intentionally left during Etapa 2.
- **Next action:** Move inside the panel only together with a broader
  filter-panel review, if ever.

### TD-05 — Scratch `teste/` route breaks typecheck and build

- **Description:** `save-state/app/(app)/teste/` is an untracked
  experimental route. Its `page copy.tsx` and `platform-card copy.tsx`
  variants use an outdated `Platform` shape (`id/name/family/logo/image`
  props that no longer exist), producing 5 `tsc` errors and 1 ESLint
  `jsx-key` error that fails `next build`.
- **Impact:** Medium. `npx tsc --noEmit` and `npm run build` fail with the
  directory present; both pass with it temporarily moved aside and the
  directory restored byte-identical afterwards.
- **Evidence:** `save-state/app/(app)/teste/page copy.tsx`,
  `save-state/app/(app)/teste/platform-card copy.tsx` (both untracked).
- **Status:** Open. Files preserved untouched (not deleted, moved, or
  excluded from `tsconfig`).
- **Next action:** Owner decides: delete the stale `* copy.tsx` variants
  (or the whole scratch route) if experimental, or update them to the
  current `PlatformCard` contract.

### TD-06 — Preexisting test failures (GameModal/drawer pattern tests)

- **Description:** 9 tests fail, all unrelated to search: 8 in
  `tests/game-modal-drawer.test.ts` (static source-pattern assertions such
  as `items-stretch justify-end` against the drawer/modal sources) and 1 in
  `tests/loading-ux.test.ts` (`hasLoadingPattern` expecting
  `isFinishing`/`isTogglingFavorite` guards in `game-modal.tsx`).
- **Impact:** Medium. Suite is red (827/836 passing); failures predate
  Etapa 2 and are independent of it (verified: full-suite failure set
  identical before and after the Etapa 2 changes).
- **Evidence:** `save-state/tests/game-modal-drawer.test.ts`,
  `save-state/tests/loading-ux.test.ts`,
  `save-state/features/games/game-modal.tsx`.
- **Status:** Open. Not fixed: the drawer/GameModal area was redesigned
  without updating these pattern tests, and aligning them requires
  product-area decisions outside Etapa 2 scope.
- **Next action:** Update the pattern assertions to the current drawer
  implementation, or rewrite them as behavioral tests.

## Resolved at Etapa 2 close-out

- Stale `tests/atp-search-query.test.ts` expectations (singular-`year`
  contract): rewritten for `yearMin/yearMax` + sort + route-locked family.
- Stale `tests/search/igdb-provider.test.ts` year test: migrated to
  `yearMin/yearMax`; sort/year-range/combined coverage added.
- Stale `tests/search/igdb-direct.test.ts` family test: updated to the
  Etapa 2 contract (free family ignored, fixed context preserved).
