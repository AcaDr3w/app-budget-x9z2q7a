# DESIGN.md — Bilancio Pro

> Captured 2026-08-19 from the shipped implementation (`index.html`, `style.css`, `script.js`, `manifest.json`) and `docs/MEMORY.md` invariants. Not a redesign: this file records the committed visual world so future work refines it instead of drifting.

## Mode
**Operate.** Personal-finance dashboard (PWA, Italian UI). Visitor's success = record, understand, and plan money in a few taps. Scanability, consistency, and native expectations outrank expression; brand lives in precise details (accent usage, pill geometry, motion restraint).

## World
**Light pastel.** Soft daylight surfaces, tinted macro-category cards, a panna-glass hero on mobile, white app shell with dark text. No dark mode (deliberate: personal finance reads best on light surfaces for this user).
- Body (mobile ≤767): `linear-gradient(135deg,#E0F2F1→#FFF3E0→#E8F5E9)` fixed; desktop solid `--bg`.
- Hero card: panna `rgba(255,255,255,0.6)` + border `rgba(255,255,255,0.7)`, dark text `#111827/#1F2937`.
- Sheet overlays ≤767: `rgba(0,0,0,0.35)` + `blur(10px)`.
- Macro cards (fixed palette, never hash-colored): **Casa e Utenze** `#B2DFDB/#004D40` badge `#80CBC4` · **Veicoli** `#C8E6C9/#1B5E20` badge `#A5D6A7` · **Svago** `#E1BEE7/#4A148C` badge `#4A148C` + white.
- PWA mark: geometric polyline chart (SVG data-URI), `theme_color #ffffff`, title "Bilancio Pro" (no emoji).

## Tokens (semantic, WCAG AA-swept 2026-08-19)
- `--accent #2563eb`, `--entrate #15803d`, `--previsto #c2410c`, `--sostenuto #dc2626`, `--ia-color #7c3aed` (white on all ≥4.5:1).
- Positive text `#047857` · red text/borders `#dc2626` · pending `#b45309` · active violet pill `#7c3aed`.
- Pastel tints (shadows, box fills, progress `#10b981`, borders `#ef4444`) are non-text: unchanged.
- Reality: 535 raw hex literals remain against ~108 token refs — tokens carry the semantic core; literals are drift risk (see "Known debt"). **2026-08-19**: token sweep done — 474 token refs vs 148 literal hex (only `:root` defs, `var()` fallbacks, rgba/shadow/gradient remain).

## Type
- System stack (no webfonts): UI sans + `ui-monospace` only for code/data contexts. No display face, no monospace costume.
- Floors (2026-08-19): 10px minimum anywhere (dense tables/badges/labels); 11px+ for interactive labels; body 13px; dense table cells 10-11px.
- Numerals: tabular-friendly formatting via `fmtEPlain`/`toLocaleString('it-IT')` + " €" suffix built into helpers (never appended twice).

## Motion
- One authored moment per context; exponential ease-out; transform/opacity only.
- Marquee AI insight: 14s translateX(-50%) on `.ai-insight-track`, pauses on `:active`.
- Hero insight: 250ms cross-fade, auto-rotate 4s, tap-next + 6s pause.
- Anomaly carousel: slide translateX(-100%·i), 500ms cubic-bezier(.4,0,.2,1), 3.5s auto.
- Charts: `animation:{duration:0}` (all 5; recreated wholesale per render).
- `prefers-reduced-motion`: intentional block — marquee static, spatial transitions off (sheet/overlay/popup/slider/drag). Never a global 0.01ms kill.

## Shell & Layout
- Mobile (≤767): zero-scroll — `body{height:100dvh;overflow:hidden}`, `.container` = `100dvh - 60px header - 71px nav`; each tab fills height with internal scroll only where needed.
- Desktop (≥768): top nav bar; bottom-nav hidden; `#current-month-tab` = CSS grid `260px | 1fr | 320px` (alert / month-head / 3-col layout), ≥1600px 5 columns.
- Touch floor: `button { min-height:44px }` with a fixed exemption set (month-arrow, popup-close 32px visual + `::before` 44px hit area, sim-reset, btn-back-sheet, btn-plus-solid, ripetizione-delete, btn-del 34px + `::before` 44px, income-row-del, cat-del-btn). Never remove exemptions without replacing the hit-area trick.

## Components (canonical)
- **Macro cards**: badge stacked above centered title (never absolute-overlapping), `card-micro-grid` = `repeat(auto-fit, minmax(min(56px,100%),1fr))` with square FA-icon cells only (never text in cells).
- **KPI hero (mobile)**: fixed 3×1 grid (Entrate / Previste / Sostenute), tap → rendiconto popup.
- **Desktop category cards**: SVG half-moon gauge `gaugeArcSVG(pct,color)` (LEN=125.66, butt caps), state colors green `#10b981`/amber `#f59e0b` >80%/red `#ef4444` over.
- **Calendar**: 7-col grid; day = number + `GG/AA` sublabel; highlight classes `has-deadline`/`selected`; compact variant for registries.
- **Popups**: 16 `.popup-overlay` with `role="dialog" aria-modal="true" aria-labelledby`; body lock `popup-open`; Esc/focus-trap/restore via `setupModalAccessibility()`.
- **Bottom sheets**: swipe-to-close via `setupSheetSwipe` (Pointer Events), `will-change` only while `.dragging`; body lock `sheet-open` includes `touch-action:none` (never apply to popups).
- **Icons**: Font Awesome 6 solid only, all decorative `<i>` `aria-hidden="true"` (23/23). Emoji only as data glyphs in list rows (`categoryIconMap`), never in the PWA brand.
- **Sparklines**: inline SVG `<polyline vector-effect="non-scaling-stroke">` + fill polygon. Never canvas 2D for mini-charts; never Chart.js for micro-sparklines.

## Performance invariants (2026-08-19)
- Chart.js loaded lazily by `ensureChartJs()`; Google APIs deferred; **Supabase CDN stays synchronous** (`supabase-adapter.js` calls `createClient()` at parse time — a `defer`/`async` reintroduces a startup TypeError; pinned regression).
- `renderEntriesList()` is the only renderer for the entries list; `handleSearch` = 150ms debounce + list-only render. Never call `updateUI()` from search.
- `window resize` → `renderCalendar()` only (zero DB writes).
- Mobile search popup: 150ms debounce + per-period dataset cache (`searchDatasetCache`), invalidated on open.
- `renderCalendar` O(days) via precomputed `plannedDates`/`deadlineDates` Sets.
- `renderAnalisiMobile` uses `anyOf` indexed queries for period and baseline (no full-table scans).
- Font Awesome full CSS stays blocking (user decision, 2026-08-19).

## Known debt (documented, do not "fix" silently)
- **2026-08-19**: 113 inline `onclick` (index.html) + 15 (script.js) fully refactored to `data-act` delegation (see MEMORY.md "INLINE ACTIONS DELEGATION"). No CSP header yet — the header is the remaining harden item.
- 16 inline NON-click handlers remain (oninput/onchange/onsubmit/onkeyup/onkeydown/onfocus/onblur, incl. `onchange="importBackupJSON(event)"` on #importFileInput). Low-risk, needs a single dedicated pass.
- `script.js` ~325KB monolith (no bundler; split = high risk). `filterByDate`/`filterByCategory`/`clearAllFilters` call `updateUI()` (accepted: single-intent clicks).
- Detector deps installed 2026-08-19 (`htmlparser2 css-select css-tree domutils`): full-parse active.

## Copy & Language
- Italian UI throughout. Controls name their action; errors name problem + recovery. Prompts never `prompt()`/`alert()`/`confirm()` — `showPromptDialog`/`showToast`/`showConfirmDialog`.
- Claims only from real user data (AI insights are generated on tap/refresh, never auto-called on render).
