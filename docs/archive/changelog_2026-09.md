# Changelog Archiviato - 2026-09

## [2026-09-15] - Plus centrato, popup mese, previste unificate

### Completed Changes
- **nav +**: bottom nav `grid` 5 colonne; cerchio 56px bordo bianco, ombra, `translateY(-10px)` solo sul FAB.
- **popup rendiconto**: `closeRendicontoPopup` tollera `event` assente; panel restyle; tap riga ÔåÆ `editExpense` con X, icona e tema macro.
- **previste**: `isOpenPlanned` unica fonte per hero/KPI/grafico/liste/save. Shared non mette pi├╣ `planned` sulle sostenute. Conversione previstaÔåÆsostenuta in place. Ultime tx cliccabili (giallo/rosso).
- **cache**: `style.css?v=2.6`, `script.js?v=2.3`, SW `bilancio-pwa-v12`.

### Status: COMPLETATO. Verifica 390├ù844: + centrato; KPI Previste apre popup chiudibile; lista = solo aperte; salva/converti senza doppio conteggio.

## [2026-09-15] - Nav: drawer account + plus radiale

### Completed Changes
- **nav**: Impostazioni tolta da bottom/top nav. Ordine mobile `Mese | Analisi | + | Investimenti | Previsioni`. Avatar header/desktop apre `#accountDrawer` con le stesse tile. Popup settings in `#accountPopups`.
- **plus**: `#navQuickAdd` ÔÇö tap apre arco 180┬░ macroÔåÆmicro; hold+drag evidenzia e in dwell passa alle micro; rilascio su micro apre il form (`openExpenseFormForCategory`).
- **cache**: `style.css?v=2.5`, `script.js?v=2.2`, SW `bilancio-pwa-v11`.

### Status: COMPLETATO. Verifica 390├ù844: nav senza Impostazioni, drawer 6 tile + popup Categorie, radiale 4 macro e 6 micro Veicoli, form Bollo da plus.

## [2026-09-15] - Form spesa a sezioni (dati, documenti, opzioni)

### Completed Changes
- **struttura**: header icona+titolo; importo unico; toggle Sostenuta/Prevista filled; card Data/Nota; griglia Scatta scontrino / Galleria; card Altre opzioni (ricorrente + chip "Ogni mese" + fine ricorrenza + dividi). Footer Annulla / Salva con check, fissi in basso (slider overflow visible, view stretch + min-height 0).
- **funzionale**: IDs e save/receipt/split invariati. Niente settimanale/annuale (il clone ├¿ solo mensile).
- **cache**: `style.css?v=2.3`, `script.js?v=2.1`, SW `bilancio-pwa-v10`.

### Status: COMPLETATO. Verifica 390├ù844 Bollo: sezioni visibili, footer Annulla/Salva in viewport.

## [2026-09-15] - Form spesa mobile allineato al riferimento pill

### Completed Changes
- **layout**: `#viewInput.sheet-form` ÔÇö importo 44px + underline accento, toggle tipo a pill, data/nota a pill bianche, chip scontrino tondi, switch Ripeti/Dividi a riga intera tappabile, footer Annulla (bianco) + Salva (accento) a pill fissi sopra la safe-area.
- **IDs invariati**: amountInput, sheetDate, sheetNote, recurringToggle, sharedToggle, save/close. Nessuna nuova logica save/receipt.

### Status: COMPLETATO in locale. Form Bollo 390├ù844 allineato al riferimento: importo 44px, toggle/campi/footer a pill, switch funzionanti, footer visibile. `style.css?v=1.9`, SW `v8`.

## [2026-09-15] - Bottomsheet: accento = colore icona macro

### Completed Changes
- **causa**: `MACRO_THEME` usava ottanio/ambra/verde/viola vecchi (`#2a9d8f`, `#7bc043`ÔÇª), diversi dalle icone delle card Mese (`--accent-casa/cibo/veicoli/svago`: `#4DB6A8`, `#F0A030`, `#4E8FD8`, `#8B7CC8`).
- **fix**: `getMacroAccent` legge i token CSS; `getMacroTheme` deriva tint/border/wash. `MACRO_COLOR` allineato. Veicoli passa da verde a blu come l'icona auto.

### Status: COMPLETATO in locale. Titolo/chip/Salva coincidono con il colore icona card (Veicoli blu `#4E8FD8`). `script.js?v=2.0`, SW `v7`.

## [2026-09-15] - Restyle bottomsheet macrocategorie (griglia + form)

### Completed Changes
- **tema**: `MACRO_THEME` ha `wash` per lo sfondo foglio; `applyMacroSheetTheme` / `clearMacroSheetTheme` settano `--macro-accent/tint/border/wash` e `data-macro`. Titoli da `MACRO_CARD_META` (Casa e Utenze / Cibo / Veicoli / Svago e Altro) al posto delle chiavi legacy.
- **griglia 3 col**: card bianche semitrasparenti sulla wash, chip icona 40px, nome 2 righe (`line-clamp`), importo pill, barra progresso a tutta larghezza. Badge budget e ultime spese allineati. `#microCategoriesGrid` isolato dalla griglia 4-col di `.category-grid-mobile`.
- **form spesa**: importo 40px + underline accento macro, toggle/input/chip tinti, Salva pieno `--macro-accent`, Annulla ghost, switch on = accento. Label "Dividi spesa" senza emoji. Scope solo `#bottomSheet` (income/future invariati).
- **cache**: `style.css?v=1.8`, `script.js?v=1.9`, SW `bilancio-pwa-v6`.

### Status: COMPLETATO in locale. Verifica 390├ù844: 4 macro con titoli MACRO_CARD_META, wash/accent corretti, 3 col (Casa 9 nomi), form 40px + Salva accento, back slider, close pulisce i token. Desktop 1024: `#bottomSheet` `display:none`; income/future invariati.

## [2026-09-15] - Grafico mese Entrate/Previste/Sostenute + linee KPI allineate

### Completed Changes
- **macro card**: rimossi i testi delle microcategorie sotto Casa/Cibo/Veicoli/Svago (e nascosta `.card-micro-list`).
- **grafico**: titolo "Progresso spesa mese corrente"; 3 barre euro Entrate `#22c55e` / Spese Previste `#eab308` / Spese Sostenute `#ef4444` (stessi importi del hero).
- **KPI mese**: linee sotto Entrate/Previste/Sostenute usano gli stessi 3 colori (niente pi├╣ beige/blu).

### Status: COMPLETATO in locale.

## [2026-09-15] - Categorie Impostazioni + tutte visibili nelle macro di Mese

### Completed Changes
- **bug settings**: `getCategoryMacroGroup` leggeva solo `CATEGORIES_MAP` statica ÔåÆ "Bolletta Condominio" e le categorie custom cadevano in `svago_altro`. Delete/edit non toglieva la voce dal gruppo vero. Fallback save `spese_svago` (chiave morta). `migrateToFourMacros` usava `old` fuori scope (ReferenceError) e non piegava `casa_utenze`/`spese_svago`.
- **fix**: `normalizeMacroKey` + `foldLegacyMacroKeys`; lookup prima su `userMacroCategories`; merge da `db.categories`; delete/edit puliscono tutti i 4 gruppi; popup Categorie si ri-renderizza all'apertura; tap sul nome per modificare; toast su duplicato.
- **Mese**: le 4 card Categorie Principali mostrano TUTTI i nomi (niente `slice(0,6)` / ellipsis). Stessa lista sulle dash-card. `script.js?v=1.7`, `style.css?v=1.6`, SW `v4`.

### Status: COMPLETATO in locale.

## [2026-09-15] - Ripristino Analisi / Investimenti / Previsioni / Impostazioni

### Completed Changes
- **causa 1 (HTML)**: `#current-month-tab` veniva chiuso troppo presto (dopo il blocco mobile Mese). I quattro tab restavano fuori da `#mainAppWrapper`; `overflow:hidden` li ritagliava ÔåÆ schermate vuote. Il markup originale era ancora nel file (KPI/anomalie/risparmi, hero investimenti, chart/sim/scadenze, tile settings). Richiusura corretta: wrapper KPI residui in `.month-head`; i quattro tab tornano figli di `.container` dentro `#appMain`.
- **causa 2 (JS)**: `stopAnomalyCarousel()` leggeva `anomalyTimer` mai dichiarato ÔåÆ `ReferenceError` in `switchTab` uscendo da Mese/Analisi. Dichiarato `let anomalyTimer = null`; stop wrappato in try/catch; check `typeof`.
- **causa 3 (PWA)**: Service Worker `bilancio-pwa-v2` + HTTP cache servivano `script.js` vecchio (`transferSize: 0`) anche dopo il fix su disco. Cache `v3`, fetch `{ cache: 'no-store' }`, `script.js?v=1.6`.
- **verifica browser**: dopo reset SW, i quattro tab hanno altezza 544px, `inWrapper=true`; click nav Analisi (KPI+anomalie+risparmi), Investimenti (hero+CTA), Previsioni (chart+slider+hub), Impostazioni (6 tile) + popup Categorie. 0 errori JS.

### Status: COMPLETATO in locale ÔÇö push GitHub Pages NON fatto (serve richiesta esplicita).

## [2026-09-15] - Debug menu index.html: tab form/IA morti + HTML sbilanciato

### Completed Changes
- **bug**: IIFE `wireTabs` leggeva `dataset.formPane` / `dataset.iaPane` (`data-form-pane` / `data-ia-pane`) ma l'HTML aveva `data-formtab` / `data-iatab`. Click su Entrata/Spesa/Condivise e HUB IA/Note/Grafici ÔåÆ `TypeError` (`undefined.charAt`), tab visivamente selezionato ma pannello invariato. Tastiera (frecce `setupTablistA11y` ÔåÆ `next.click()`) stessa eccezione.
- **fix**: tab form e IA allineati alla delegation `data-act` (`switchFormTab` / nuova `switchIaNotesTab`); IIFE `wireTabs` rimossa.
- **a11y/copy**: `TAB_TITLES` allineato alle label nav (`Analisi`/`Previsioni` al posto di `Storico`/`Futuro`).
- **harden**: `switchTab` ritorna se l'id tab non esiste.
- **html**: chiuso esplicitamente `.container` prima di `</main>`; rimosso `</div>` extra in coda a `#bottomSheet` (parser: 1 unmatched close).
- **verification**: probe browser su top-nav (5), bottom-nav (5), form tabs (3), IA tabs (3), settings tiles (6), condivise Amici/Gruppi, hub mese, hub previsioni, select periodo Analisi. 0 errori JS; 36 `data-act` risolti; HTML balance ok.

### Status: COMPLETATO ÔÇö menu di index.html verificati e tab interni riparati.

