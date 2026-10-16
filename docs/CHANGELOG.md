# Session Logs & Progress

## [2026-10-16] - Ghost: debiti ricreano le spese a ogni refresh

### Completed Changes
- **causa**: `shared_debts` senza policy DELETE; `syncSharedDebts` rimaterializza le spese da debiti `open` (toast visibile).
- **fix JS**: cancel debito con UPDATE `cancelled` su delete/wipe; skip rematerialize se source assente o `created_by` = me; tombstone locale.
- **outbox**: i put riusciti non restano in coda (prima venivano ri-upsertati).
- **SQL**: `migrations/007_shared_debts_delete.sql`.
- **cache**: `script.js?v=2.16`, adapter `?v=1.2`, SW `v24`.

### Status: COMPLETATO.

## [2026-10-16] - Scroll desktop + ghost spese condivise

### Completed Changes
- **scroll**: click su una spesa non apre più lo sheet mobile nascosto; `body.sheet-open` su desktop non blocca più overflow.
- **ghost**: `delete`/`clear`/`bulkDelete` tolgono la voce dall'outbox; delete spesa cancella anche shared_expenses/participants/debts.
- **form**: `switchFormTab` punta a `#nuovaVoceCard`; edit desktop = «Salva modifiche».
- **cache**: `style.css?v=3.8`, `script.js?v=2.15`, adapter `?v=1.1`, SW `v23`.

### Status: COMPLETATO.

## [2026-10-16] - Insight centrati, IA accanto al mese, wipe completo

### Completed Changes
- **insight mese**: pill centrata sotto i KPI.
- **assistente I.A.**: accanto al selettore mese; hub desktop nascosto; overlay, non pannello in pagina.
- **avatar**: cerchio 36px (override `button` min-height/radius).
- **wipe**: `resetTotalDB` include savings, investments, people/groups, debiti, shared, settings, outbox.
- **analisi**: «Tocca per l'analisi IA del periodo» centrato, senza marquee.
- **cache**: `style.css?v=3.7`, `script.js?v=2.14`, SW `bilancio-pwa-v22`.

### Status: COMPLETATO.

## [2026-10-16] - Registro sotto IA, no CSV/PDF, card tonde

### Completed Changes
- **vuoto IA–registro**: `#entriesCard` è nella colonna sinistra, subito dopo Assistente I.A. (non più `grid-row:2` sotto il rail).
- **export**: rimossi tasti CSV/PDF e le funzioni `exportCSV` / `exportPDF` / `ensureHtml2Pdf`.
- **radius**: card mese e progresso spesa a 20px; insight I.A. a pill staccata dal bordo.
- **cache**: `style.css?v=3.6`, `script.js?v=2.13`, SW `bilancio-pwa-v21`.

### Status: COMPLETATO.

## [2026-10-16] - Desktop: niente vuoto centrale, macro e record

### Completed Changes
- **vuoto**: `mese-col-main` è una colonna flex (non condivide le righe col form).
- **macro**: 4 badge con tinta pastello, icona in tile, progress più leggibile.
- **analisi**: titolo «Risparmi e investimenti» come le altre sezioni; record in 3 colonne centrate.
- **cache**: `style.css?v=3.5`, `script.js?v=2.12`, SW `bilancio-pwa-v20`.

### Status: COMPLETATO.

## [2026-10-16] - Desktop Mese v3 + refactor Analisi

### Completed Changes
- **scroll**: html/body/container/tab `overflow:visible` ≥768 (niente lock viewport).
- **mese**: categorie su; registro al centro con cerca; form Spesa+Sostenuta in alto a destra; grafico nel rail; calendario in basso (filtra per giorno, chip per togliere).
- **click categoria**: apre Nuova voce → Spesa con categoria e focus su Pagato.
- **hub**: Condividi e Ricerca nascosti su desktop.
- **analisi**: sezioni titolate, griglia 2 col, IA in fondo.
- **cache**: `style.css?v=3.4`, `script.js?v=2.11`, SW `bilancio-pwa-v19`.

### Status: COMPLETATO. Verifica browser 1440 Mese+Analisi e 390 mobile.

## [2026-10-16] - Insight IA: override `button { color: white }`

### Completed Changes
- **causa**: `#heroInsightPill` è un `<button>`, la regola globale `button { color: white }` rendeva il messaggio rotante bianco su fondo chiaro.
- **fix**: colore `--ia-strong` (`#581c87`) e fondo `--ia-bg-soft` con `!important` sul pulsante e sullo span, anche nel media mobile.
- **cache**: `style.css?v=3.3`, `script.js?v=2.10`, SW `bilancio-pwa-v18`.

### Status: COMPLETATO. Push origin/main + verifica GitHub Pages.

## [2026-10-16] - Desktop: contrasto insight IA e card visibili

### Completed Changes
- **insight**: `#heroInsightPill` viola chiaro + testo `--ia-strong` 14px/700 (il messaggio rotante si legge).
- **card desktop**: bordo `--border-soft` su summary, grafico, macro, rail, `#rendicontoCard`.
- **categorie**: se `userCategories` è vuoto, la griglia usa le macro; empty state se non c’è nulla.
- **cache**: `style.css?v=3.2`, `script.js?v=2.9`, SW `bilancio-pwa-v17`.

### Status: COMPLETATO. Push su origin/main per GitHub Pages.

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
