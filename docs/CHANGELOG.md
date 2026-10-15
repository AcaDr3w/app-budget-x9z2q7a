# Session Logs & Progress

## [2026-10-15] - Audit debug: id duplicati, parser importi, insight, getSetting

### Completed Changes
- **legacy dash-card**: rimossa la seconda griglia macro con id duplicati; restano card bianche + `month-head` desktop.
- **importi**: `parseAmountInput` gestisce migliaia IT (`1.200` = 1200); `getSheetAmount` e form desktop usano lo stesso helper.
- **IA**: `openIaNotesModal` usa `sumOpenPlanned`; `getSetting` definita; `#heroInsightPill` sotto i KPI.
- **cache**: `style.css?v=2.7`, `script.js?v=2.4`, SW `bilancio-pwa-v13`.

### Status: COMPLETATO. Verifica locale: id count=1, `1.200`→1200, pill insight popolata, `getSetting` = function.

## [2026-10-15] - Config locali strumenti ripulite (solo skills + mcp)

### Completed Changes
- **opencode**: config locale ripulita nel 2026-10-15 — dettaglio in docs/archive/changelog_2026-10.md)

---

Sessioni precedenti archiviate:
- docs/archive/changelog_2026-09.md (2026-09-15)
- docs/archive/changelog_2026-08.md (2026-08-11 .. 2026-08-21)
- docs/archive/changelog_2026-07.md (2026-07-18 .. 2026-07-31)
