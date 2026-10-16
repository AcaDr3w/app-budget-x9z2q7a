# Session Logs & Progress

## [2026-10-16] - Desktop: layout a pannelli, categorie al centro, meno popup

### Completed Changes
- **mese**: griglia categorie (`#categoryGridDesktop`) nel canvas centrale; rail solo form+registro; ricerca e IA inline.
- **analisi**: card IA storica visibile in pagina; tap insight non apre il modal su desktop.
- **previsioni**: pianificatore scadenze + IA affiancati al grafico; niente bottom sheet.
- **investimenti**: form “Nuovo Asset” sempre in colonna; dettaglio asset in pagina.
- **cache**: `style.css?v=3.1`, `script.js?v=2.8`, SW `bilancio-pwa-v16`.

### Status: COMPLETATO. Verifica 1280: categorie fuori dal rail, IA static, search focus registro, Previsioni 2 col, Invest form visibile. 390: hide-mobile, sheet ok, zero page-scroll.

## [2026-10-15] - Desktop: stessa UI mobile, allargata

### Completed Changes
- **mese**: wrap `.mese-primary`; hub senza `hide-desktop`; `.month-head` nascosto ≥768; chart cap 260px; 4 macro; rail sticky form+registro.
- **analisi/future/invest**: dashboard mobile visibili su desktop; cloni `hide-mobile hide-desktop`; canvas/lista unici (`futureChartCanvas`, `investAssetGrid`).
- **css**: nuovo blocco `@media (min-width: 768px)` in coda; lock overflow@1200 sbloccato; media ≤767 intatto.
- **cache**: `style.css?v=3.0`, `script.js?v=2.7`, SW `bilancio-pwa-v15`.

### Status: COMPLETATO. Verifica 1280/1440 (due col, chart 260, 4 macro, form visibile) e 390 (bottom-nav, zero page-scroll, sheet apribile, rail nascosto).

## [2026-10-15] - Ecosistema spese condivise: popup, saldi, Salda

### Completed Changes
- **dialog**: incluso `js/ui-dialogs.js`; Salda non usa più prompt overlay — form nel footer del dettaglio.
- **layout**: riga Aggiungi/Crea senza wrap; override `width:auto` su bottoni condivise (causa: `button{width:100%}`); overflow-x hidden; hit 44px; hero "Il tuo saldo".
- **saldi**: `sameId` su person/group id; net io-vs-amico; lista senza Salda; dopo settle resta sul dettaglio.
- **gruppi**: stesso list/detail; Salda quota sticky solo se in debito; `getSimplifiedDebts` su cloni.
- **cache**: `style.css?v=2.9`, `script.js?v=2.6`, SW `bilancio-pwa-v14`.

### Status: COMPLETATO. Verifica locale 360/390/1280: niente overflow riga Aggiungi, Salda parziale 30→20, dialogs caricati.

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
