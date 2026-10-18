# Session Logs & Progress

## [2026-10-18] - Categorie impostazioni: add/rename/delete + UI

### Completed Changes
- **composer**: campo Aggiungi fisso in alto (non più sotto le quattro liste).
- **accordion**: un macro aperto alla volta, meno scroll.
- **rename**: tap sul nome, stato «Stai modificando», Annulla.
- **delete**: le spese passano in «Varie» (hint in conferma e toast); «Varie» non si elimina.
- **cache**: `style.css?v=3.14`, `script.js?v=2.23`, SW `v32`.

### Status: COMPLETATO.

## [2026-10-18] - Spese previste: lock sul Salva e Paga che salda

### Completed Changes
- **mobile save**: un solo put in volo; tap ripetuti ignorati.
- **Paga**: `actual = planned`, `settled = true`, toast «Spesa saldata»; id con `sameId`.
- **toast**: `z-index: 11050`, sopra la bottom nav.

### Status: COMPLETATO.

## [2026-10-17] - Voce: LLM riceve le categorie reali dell'utente

### Completed Changes
- **prompt**: il messaggio utente elenca tutte le categorie attuali; l’LLM deve copiarne una esatta (niente «Alimentari» hardcoded).
- **match**: Lidl/spesa/supermercato si agganciano alla categoria che esiste davvero (nome tipo alimentari/spesa/cibo, o prima voce del macro Cibo).
- **cache**: `script.js?v=2.22`, SW `v31`.

### Status: COMPLETATO.

## [2026-10-17] - Radial + : icone alzate sopra la nav

### Completed Changes
- **layout**: l’arco Casa/Cibo/Veicoli/Svago sale di 56px rispetto al centro del + (`QUICK_ADD_ARC_LIFT`). Il cerchio + resta centrato nella bottom nav.
- **cache**: `script.js?v=2.21`, SW `v30`.

### Status: COMPLETATO.

## [2026-10-17] - Impeccable: colorize, typeset, layout, distill, harden, polish

### Completed Changes
- **colorize**: `--muted`/`--muted-light`/`--accent-nav-inactive`/`--text-secondary` portati a contrasto AA; placeholder e label nav usano token scuri (≥4.5:1).
- **typeset**: label nav, KPI, titoli sezione e barre progresso ≥11px (desktop e mobile).
- **layout**: Mese `CATEGORIE PRINCIPALI` / `ULTIME TRANSAZIONI` da `h3` a `h2`; `.card h2` senza `border-left`; traguardi/ledger a 1px.
- **distill**: `#rendicontoCard` senza card-in-card; `.card-glass` senza padding/ombra interna.
- **harden**: `button { color: inherit }` e `color:#fff` sui CTA pieni; `#receiptPreview` con pixel trasparente (anche in `clearReceiptPreview`).
- **optimize**: barre su `transform: scaleX(var(--fill))` invece di `width`.
- **cache**: `style.css?v=3.13`, `script.js?v=2.20`, SW `v29`. Layout desktop e mobile restano distinti.

### Status: COMPLETATO.

## [2026-10-17] - Login allineato all'app + verifica email

### Completed Changes
- **UI**: schermata auth con marca Bilancio Pro, tab Accedi/Registrati, CTA blu `--accent`, mostra/nascondi password, conferma password in signup, pannello «Controlla la mail».
- **Supabase**: `signUp` con `emailRedirectTo`; se non arriva sessione si chiede la conferma mail; `resend` signup; errori in italiano (`email not confirmed`, credenziali, account già esistente).
- **cache**: `style.css?v=3.12`, `supabase-adapter.js?v=1.3`, SW `v28`.

### Status: COMPLETATO.

## [2026-10-17] - + mobile centrato + secondo tap registra

### Completed Changes
- **layout**: cerchio + allineato al centro verticale della bottom nav (`align-self: stretch` + flex, niente `translateY`).
- **microfono**: `innerHTML` con `fas fa-microphone` e `font-weight: 900` (Solid); prima `font-weight: 500` rendeva il glifo vuoto.
- **secondo tap**: overlay dismiss non copre più la nav (`--nav-clearance` = altezza reale); `body.radial-open` alza z-index della nav/FAB; tap sul dismiss sopra il FAB avvia lo STT invece di chiudere.
- **cache**: `style.css?v=3.11`, `script.js?v=2.19`, SW `v27`.

### Status: COMPLETATO.

## [2026-10-16] - Fix tap + e smistamento «spesa» → Alimentari

### Completed Changes
- **gesto**: tap apre il radial; niente hold da 180ms (apriva e al sollevamento chiudeva). Capture solo per non perdere il pointerup. Click di fallback. Hit area 72px (il cerchio era 10px sopra il tap).
- **categorie**: alias «spesa»/supermercato → Alimentari; LLM riceve `{testo, categorie[]}`; lock grocery se l'llm risponde Varie.
- **hint**: «Tocca il microfono e parla, o scegli una categoria».
- **cache**: `style.css?v=3.10`, `script.js?v=2.18`, SW `v26`.

### Status: COMPLETATO.

## [2026-10-16] - Spesa vocale dal + mobile

### Completed Changes
- **FAB**: radial aperto → icona microfono; secondo tap ascolta (pulse rosso).
- **STT**: Web Speech `it-IT`; Safari iOS avvisa di usare Chrome.
- **parse**: locale (importo + categoria) poi LLM JSON via `invokeAI`.
- **save**: `saveTransactionFromSheet({silent})` + toast Annulla 5s; se manca la categoria apre lo sheet.
- **cache**: `style.css?v=3.9`, `script.js?v=2.17`, SW `v25`.

### Status: COMPLETATO.

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
