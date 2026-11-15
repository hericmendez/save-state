# Game Grid Density — Implementation Report

**Status:** implemented and validated
**Date:** 2026-11-15
**Scope:** shared ATP catalog and backlog/collection game-card grid

## 1. Previous behavior and diagnosis

- The shared `Collection` component served the ATP catalog and backlog/collection views. Its card grid used fixed Tailwind breakpoints (`1`, `2`, `3`, then `6` columns); there was no user-selectable density.
- Grid/table selection was supplied by the caller. The table was rendered through the existing semantic `DataTable` component.
- The game card used the RPGUI golden frame, full-size favorite/details icons and title/subtitle/metadata over the cover. Its game-title paragraph explicitly carried `font-display`, which resolves to the configurable title-font stack (`--font-display-name`), rather than the text-font preference. The vendor RPGUI button has a `140px` minimum width, unsuitable for fitting two view controls plus a density selector on narrow screens.
- The application already persisted UI preferences in Zustand’s `save-state-ui` localStorage record and set layout/font attributes in a parser-blocking pre-paint script. The app also supports a pixel-perfect layout mode using 80% zoom.
- Home and directory/catalog taxonomy pages have separate grids; they do not use the shared `Collection` grid and were left unchanged.

## 2. Architecture and behavior chosen

- Added a global `6 | 8 | 10 | 12` density preference to the existing UI preference store. The default and invalid/missing-value fallback are `6`.
- The pre-paint script reads only those four valid values and sets `data-grid-density` before rendering, avoiding a grid flash. Zustand persists and validates the preference in the existing `save-state-ui` record; changing density also updates the root attribute immediately.
- Replaced the shared grid’s fixed breakpoints with CSS Grid and container queries. The usable grid-container width (not just viewport width) determines the number of columns. The selection is a maximum: if the container cannot support the selected density, the grid steps down.
- Below 768px the grid is fixed at exactly two equal columns, regardless of the saved desktop preference. Mobile resizing does not change the stored preference.
- The density control is shown alongside the existing grid/table controls only in grid mode. The semantic table path and its markup were not changed.

## 3. Files changed

- `features/shared/layout-mode.ts` — density type, accepted values, default, parser, restore helper, root-attribute updater, and pre-paint script handling.
- `features/shared/ui-store.ts` — persisted global preference and setter, using the existing store and storage key.
- `features/collection/view-mode-toggle.tsx` — compact RPGUI framed-grey view controls and density selector.
- `features/games/collection.tsx` — shared responsive grid wrapper and toolbar placement.
- `features/games/game-card-frame.tsx` — compact, accessible favorite/details controls and responsive title/metadata presentation.
- `app/globals.css` — container-query breakpoints, two-column mobile layout, RPGUI frame/card adjustments, text clamping, control targets, and the card-title body-font rule.
- `tests/layout-mode.test.ts` — parsing, default, restoration, persistence wiring, CSS breakpoints and shared-grid coverage.
- `tests/game-grid-density.test.tsx` — selector options, persistence, card actions, title-font source, special-character titles and grid/table switching coverage.
- `docs/game-grid-density-validation/` — Playwright measurements and viewport screenshots, including typography validation.
- `docs/GAME_GRID_DENSITY_IMPLEMENTATION_REPORT.md` — this report.

No dependencies were added. IGDB-related tracked changes and pre-existing untracked files were not part of this implementation.

## 4. Selector and persistence

The compact RPGUI dropdown offers **6**, **8**, **10** and **12**. Its preference is global across screens using the shared grid, rather than a per-page setting. When the user switches to table mode, the selector is hidden; returning to grid mode retains the selected value.

The parser-blocking script initializes the root density attribute from localStorage before paint. React initially renders a stable default selector value and reveals the restored value after hydration, while the CSS attribute already uses the saved density. The preference remains in the existing `save-state-ui` Zustand record; no second persistence system was introduced.

## 5. Typography adjustment

The card title no longer has the `font-display` utility. Instead, the `.game-card-title` rule sets only `font-family: var(--font-body-name)`. That variable follows the existing “Configurações → Aparência → Fonte dos textos” preference (`JetBrains Mono` or `Roboto`) and is updated by the existing root data attribute. This is scoped to game-card titles; the `.font-display` utility, RPGUI vendor rules, headings, buttons, metadata, table and other screens were not changed.

The title retains its previous `11px` size, normal (`400`) weight, `15.125px` line-height, white text with the RPGUI black outline, alignment, and two-line clamp. These contrast styles are scoped to the title and do not change `.font-display` or RPGUI styles globally. Responsive card dimensions, actions, metadata, frame and grid behavior are unchanged. Japanese glyphs continue to use normal browser font fallback when they are not present in the selected text-font face.

Playwright checked both text-font preferences against all three title-font choices. In all six combinations, the title’s computed font family matched the configured body font, while changing the display-font preference had no effect on the card title. The measured title stayed at `11px`, weight `400`, line-height `15.125px`, with a two-line clamp.

## 6. Responsive breakpoints and card adaptation

Container thresholds progressively permit 3–12 columns. The grid keeps a nominal minimum of about 112px per framed card including the 12px column gap. The effective count is capped by the chosen density and available container width. This also accounts for sidebar width and the app’s 80% pixel-perfect zoom without introducing a forced minimum width or page-level horizontal scroll.

Mobile always uses two columns. The shared card retains the RPGUI golden frame and cover aspect ratio. Its frame padding/border are tightened to recover content area; title and subtitle wrap and clamp, while metadata is kept compact. Favorite and details actions remain present and use 40×40px targets on mobile (36×36px on desktop). The details action has an accessible title-specific label; the owned marker and favorite indicator are retained.

## 7. Browser validation results

Validated the real `Collection`, `GameCardFrame`, selector, RPGUI styles and pre-paint behavior in Chromium using a temporary production-preview harness. The harness and temporary route were removed after testing. Every tested row had matching first-row card count and computed grid columns, and no horizontal overflow or card-frame overflow was measured.

| Viewport / mode | Preference | Effective columns | Card width | Overflow |
|---|---:|---:|---:|---|
| 1280×900 | 6 | 6 | 159.3px | none |
| 1280×900 | 8 | 8 | 116.5px | none |
| 1280×900 | 10 | 8 | 116.5px | none |
| 1280×900 | 12 | 8 | 116.5px | none |
| 1920×1080 | 6 | 6 | 266px | none |
| 1920×1080 | 8 | 8 | 196.5px | none |
| 1920×1080 | 10 | 10 | 154.8px | none |
| 1920×1080 | 12 | 12 | 127px | none |
| 1024×900 (intermediate) | 12 | 6 | 116.7px | none |
| 320×844 | saved 10 | 2 | 142px | none |
| 360×844 | saved 10 | 2 | 162px | none |
| 390×844 | saved 10 | 2 | 177px | none |
| 430×844 | saved 10 | 2 | 197px | none |
| 1280×900, 80% zoom | 10 | 10 | — | none |

At 1280px, the actual content container accommodates up to eight cards at the configured minimum; 10 and 12 therefore step down to eight. At 1920px all four configured densities fit. The 1024px intermediate container reduces a request of 12 to six. Mobile retained the saved preference of 10 without applying it to its two-column layout.

Browser interaction checks passed: density 10 restored after a page reload; grid/table switching retained the semantic table and hid/revealed the selector appropriately; the details action worked; favorite and owned indicators were present; long-title content stayed within the frame; action targets measured 36px desktop and 40px mobile. Browser console/page errors: **none**.

The typography follow-up was also exercised in a production-built Chromium preview at 1280px and 1920px for all four desktop density selections, and at 320px, 360px, 390px and 430px with two cards per row. At 1280px, density 10 and 12 reduce to eight columns due to the content width. At all tested widths, title clamping remained two lines, the title box did not overlap the top action controls or leave the card frame, and there was no page or frame overflow.

Short Japanese, long Latin, accented/symbol titles, and Japanese characters mixed with punctuation were rendered in the compact and normal card sizes. The selected JetBrains Mono and Roboto body preferences were both checked against Press Start 2P, JetBrains Mono and Roboto display preferences.

### Captures and raw measurements

Screenshots and the full per-run measurements are in `docs/game-grid-density-validation/`:

- `desktop-1280-density-6.png`
- `desktop-1280-density-8.png`
- `desktop-1280-density-10.png`
- `desktop-1280-density-12.png`
- `desktop-1920-density-12.png`
- `intermediate-1024-density-12.png`
- `mobile-320.png`
- `mobile-430.png`
- `desktop-1280-pixel-perfect.png`
- `measurements.json`
- `typography-measurements.json`

The browser run used representative synthetic preview cards so the four densities could be compared consistently; it exercised the production-built shared components rather than modifying or seeding application data.

## 8. Automated checks and regression coverage

- Focused regression tests after the typography update: **6 files, 72 tests passed**.
- Full Vitest suite after the typography update: **123 files, 1,451 tests passed**. The first full-suite attempt ran concurrently with the production build and hit database-test timeouts; the isolated rerun passed.
- ESLint: **passed with zero errors**; seven existing warnings remain (one in `features/atp/catalog-search.tsx`, six unused suppression directives in `scripts/import-platform-images.mjs`).
- Production build: **passed** (`next build`).
- TypeScript: **passed** (`tsc --noEmit`, after the final build regenerated `.next/types` without the removed preview route).
- Playwright Chromium viewport and interaction matrix: **passed**, as detailed above.

The grid/table path, semantic table, search control, card details action, favorite/owned indicators, existing preference record, and separation of card-title body/display font settings were covered. No results, filters, ordering, import, pagination, ATP/IGDB calls, or database behavior were changed.

## 9. Limitations

- The effective density can be below the selected value when the content container is too narrow; this is intentional to avoid undersized cards and horizontal overflow.
- The narrowest desktop cards (about 116.5px in the 1280px preview at density 8) depend on the compact/clamped text presentation; a full title remains available through the title attribute, but the visible card text may be truncated.
- Playwright used a local Chromium binary and a temporary production build. It was visual/component validation, not a deployment or production-data test.
- Japanese glyph shapes depend on browser/system fallback fonts when the configured body font lacks a glyph; the browser still uses the configured body-font stack for the title.

## 10. Verdict

**Implemented and validated.** Users can select and persist 6, 8, 10 or 12 columns for shared desktop game grids; the layout adapts to actual container width and remains exactly two columns on tested mobile widths from 320px through 430px. Game-card titles now use the configured text font independently of the title/display preference, without changing RPGUI typography elsewhere or increasing title line count. The RPGUI presentation and card actions remain available, the semantic table is preserved, and all requested automated/build/browser checks passed. No commit, push or deployment was performed.
