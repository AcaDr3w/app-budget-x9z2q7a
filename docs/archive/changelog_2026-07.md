# Changelog Archiviato - 2026-07

## [2026-07-25] - Ruota importo estesa a 4 cifre (0-9999)

### Ô£à Completed Changes

**script.js ÔÇö Integer wheel 0-999 ÔåÆ 0-9999:**
- Loop generazione ruota: `i <= 999` ÔåÆ `i <= 9999`
- Padding: `padStart(3, '0')` ÔåÆ `padStart(4, '0')` (2 occorrenze nel loop + syncInputToWheel)
- Validazione input hidden: `val <= 999` ÔåÆ `val <= 9999`

**index.html ÔÇö Input max attribute:**
- `max="999"` ÔåÆ `max="9999"` su `#hiddenIntegerInput`

**style.css ÔÇö Container width:**
- `.wheel-container`: `width: 80px` ÔåÆ `width: 100px` per accomodare 4 cifre

### ­ƒÄ» Status: COMPLETATO
- Ruota sinistra ora permette di selezionare valori da 0000 a 9999
- Stessa logica, stesso funzionamento, solo range esteso

---

## [2026-07-25] - Layout cleanup: toggle centering + uniform spacing

### Ô£à Completed Changes

**style.css ÔÇö Toggle text centering:**
- Added `display: flex; align-items: center; justify-content: center;` to `.toggle-option`
- Removed redundant `text-align: center`
- "Spesa Sostenuta" / "Spesa Prevista" now perfectly centered in their containers, no overlapping

**style.css ÔÇö Uniform vertical spacing:**
- Removed `margin: 10px 0` from `.sheet-amount-display`
- Removed `margin: 20px 0` from `.sheet-type-toggle`
- Removed `margin-top: 10px` from `.sheet-inputs`
- Added `gap: 20px` to `#viewInput > .sheet-body`
- All three blocks now use uniform 20px spacing (was inconsistent 20px/30px)

### ­ƒÄ» Status: COMPLETATO
- Toggle text perfectly centered via flexbox
- Uniform gap between amount wheels, toggle, and date/note inputs
- Zero HTML/JS changes

---

## [2026-07-25] - Fix Visibility of Expense Form in Bottom Sheet (CSS Overflow Conflict)

### Ô£à Completed Changes

**style.css ÔÇö Fixed slider overflow logic:**
- Removed `overflow: hidden` from `.bottom-sheet .sheet-slider` which was clipping the second view (`#viewInput`) when sliding right.
- Added `overflow-x: hidden` to `.bottom-sheet` instead, to properly hide the slider's overflow relative to the sheet container.
- These changes resolve the bug where clicking on a category tile in the bottom sheet resulted in a blank/hidden expense input form.

### ­ƒÄ» Status: COMPLETATO
- The sliding animation in the bottom sheet now correctly reveals the expense form.
- The previous bug caused by nested flex overflow clipping is fixed.

## [2026-07-25] - Ripristino Visibilit├á Form Spese nel Bottom Sheet (Slide Destra)

### Ô£à Completed Changes

**style.css ÔÇö 4 correzioni CSS puntuali:**

1. **`min-height: 0` su `.bottom-sheet .sheet-slider .sheet-view`** (riga 1379):
   - Permette al flex item di ricevere altezza `stretch` dal padre in flex row, risolvendo il calcolo zero su WebKit mobile.

2. **`min-height: 0` su `#viewInput`** (riga 1362):
   - Garantisce altezza nel flex column annidato, evitando che il form resti compresso.

3. **`flex-shrink: 0` su `.sheet-footer`** (riga 1340):
   - Impedisce compressione accidentale dei bottoni Salva/Annulla in contesti di spazio ridotto.

4. **`.bottom-sheet-header` gap 12px ÔåÆ 15px** (riga 1387):
   - Allineamento pi├╣ arioso tra freccia indietro e titolo.

### ­ƒÄ» Status: COMPLETATO
- Form spese (ruota importo, toggle sostenuta/prevista, data, note, bottoni) ora visibile dopo slide destra
- Scroll interno funzionante se form lungo
- Header con freccia e titolo allineato correttamente
- Zero modifiche a index.html o script.js

---

## [2026-07-24] - Fix Swipe-to-Close Bottom Sheet (Selettore Handle Errato)

### Ô£à Completed Changes

**script.js ÔÇö setupSwipeToClose() selettori scoped:**
- `document.querySelector('.drag-handle-wrapper')` ÔåÆ `document.querySelector('#bottomSheet .drag-handle-wrapper')`
  - Causa: due bottom sheet nel DOM (future + spese), `querySelector` prendeva il primo (future), lasciando il main sheet senza listener
- `document.querySelector('.sheet-header')` ÔåÆ `document.querySelector('#bottomSheet .bottom-sheet-header')`
  - Causa: classe rinominata da `.sheet-header` a `.bottom-sheet-header`, selettore morto

### ­ƒÄ» Status: COMPLETATO
- Swipe-to-close sul bottom sheet spese ripristinato
- Anche l'header (titolo) ora funziona come area di drag
- Future bottom sheet invariato (ha gi├á il suo swipe dedicato in `setupFutureSwipeToClose`)

---

## [2026-07-24] - Fix Form Spese Scomparso (Tab "Mese") ÔÇö Bottom Sheet #viewInput

### Ô£à Completed Changes

**style.css ÔÇö .bottom-sheet: altezza definita:**
- Aggiunto `height: 85dvh` accanto a `max-height: 85dvh`
- Flex container ora ha un'altezza "definita" ÔåÆ `flex: 1` su `.sheet-slider` funziona correttamente su tutti i browser

**style.css ÔÇö #viewInput convertito in flex column:**
- Aggiunto `#viewInput { display: flex; flex-direction: column; }`
- `.sheet-body` diventa `flex: 1; min-height: 0` cos├¼ si espande a riempire lo spazio verticale
- `.sheet-footer` resta ancorato in fondo

**style.css ÔÇö Scroll centralizzato:**
- Rimosso `overflow-y: auto` da `.bottom-sheet .sheet-slider .sheet-view` (era il contenitore sbagliato)
- Spostato scrolling dentro `.sheet-body` con `overflow-y: auto !important`
- Eliminato doppio overflow annidato che causava conflitto

### ­ƒÄ» Status: COMPLETATO
- Clic su categoria nel bottom sheet ora mostra correttamente il form (ruota importo, toggle, data, nota, pulsanti)
- Scroll del form contenuto dentro `.sheet-body`, footer sempre visibile
- Desktop invariato

---

## [2026-07-24] - Body Scroll Lock & Scroll Chaining Fix (Bottom Sheet + Popup)

### Ô£à Completed Changes

**style.css ÔÇö body.sheet-open rafforzato:**
- Aggiunto `height: 100dvh !important`, `height: -webkit-fill-available !important`
- Aggiunto `overscroll-behavior: none !important`, `-webkit-overflow-scrolling: none !important`
- `width: 100% !important` per prevenire scroll orizzontale

**style.css ÔÇö .bottom-sheet constraint viewport:**
- Aggiunto `max-height: 85dvh` per limitare altezza massima
- Aggiunto `display: flex; flex-direction: column; overflow: hidden`
- Aggiunto `flex-shrink: 0` su `.drag-handle-wrapper` e `.bottom-sheet-header`
- Aggiunto `.sheet-slider { flex: 1; min-height: 0; overflow: hidden }`
- Aggiunto `.sheet-view { overflow-y: auto; -webkit-overflow-scrolling: touch; overscroll-behavior-y: contain; flex: 1; min-height: 0 }`

**style.css ÔÇö Scroll isolato nelle aree contenuto:**
- `.bottom-sheet .sheet-body`: aggiunto `overflow-y: auto !important; -webkit-overflow-scrolling: touch !important`
- `#futureSheetBody`: stesse regole + `flex: 1; min-height: 0`

**style.css ÔÇö touch-action riabilitato dentro il sheet:**
- `.bottom-sheet * { touch-action: auto }` ÔÇö riabilita tocchi/scroll dentro il sheet
- `.drag-handle-wrapper, .sheet-handle { touch-action: none !important }` ÔÇö resta esclusivo per drag

**script.js ÔÇö Rimosso `style.overflow` inline (ridondante):**
- `openTransactionSheet()`: rimosso `document.body.style.overflow = 'hidden'`
- `closeTransactionSheet()`: rimosso `document.body.style.overflow = ''`
- `openBottomSheetFromMacro()`: rimosso `document.body.style.overflow = 'hidden'`
- `openFutureSheet()`: rimosso `document.body.style.overflow = 'hidden'`
- `closeFutureSheet()`: rimosso `document.body.style.overflow = ''`

**script.js ÔÇö Body lock aggiunto ai popup modali:**
- `openIaModal()` / `closeIaModal()`: ora aggiungono/rimuovono `body.sheet-open`
- `openArchiveModal()` / `closeArchiveModal()`: ora aggiungono/rimuovono `body.sheet-open`
- `openRendicontoPopup()` / `closeRendicontoPopup()`: ora aggiungono/rimuovono `body.sheet-open`

### ­ƒÄ» Status: COMPLETATO
- Body scroll completamente bloccato quando un bottom sheet o popup ├¿ aperto
- Scroll all'interno del sheet isolato (no scroll chaining al body)
- Touch riabilitato dentro il sheet per input/scroll nativi
- Drag handle mantiene touch-action: none per swipe-to-close
- iOS rubber-band bloccato sul body

---

## [2026-07-24] - Previsioni Tab Zero-Scroll Mobile Dashboard

### Ô£à Completed Changes

**index.html ÔÇö Ristrutturazione #future-tab:**
- Wrappato contenuto desktop originale in `<div class="hide-mobile">`
- Aggiunto nuovo blocco mobile `<div class="hide-desktop future-mobile-dashboard">` con:
  - Header compatto (h2 + `#futureAvgBoxMobile`)
  - Griglia 2├ù3 `#futureProjectionsGrid`
  - Action Hub `#futureActionHub` con 3 bottoni `[data-action]`: simula, scadenze, ia
- Aggiunto nuovo Bottom Sheet `#futureSheetOverlay` + `#futureBottomSheet` (pattern identico a bottom sheet spese)

**style.css ÔÇö Nuove regole mobile @media (max-width: 767px):**
- `.future-mobile-dashboard`: height `calc(100dvh - 60px - 60px - env(safe-area-inset-bottom))`, flex column, overflow hidden
- `.future-header-compact h2`: font-size 15px
- `#futureAvgBoxMobile`: font-size 10px, colore #64748b
- `#futureProjectionsGrid`: grid 2 colonne, gap 10px, flex: 1, min-height: 0
- `.proj-card`: flex centered, border-left 4px colorato, border-radius 16px
- `#futureActionHub`: flex row, gap 8px, flex-shrink 0, 3 bottoni pari
- Regole per `#futureSheetBody` e interni (.sheet-inputs-compact, .sheet-actions)

**script.js ÔÇö Refactor e nuove funzioni:**
- `renderFutureProjections()`: ora popola anche `#futureProjectionsGrid` (mobile) oltre a `#futureProjectionsList` (desktop); aggiorna anche `#futureAvgBoxMobile`
- `resetFutureSimulation()`: resetta anche `#simulatedExpenseMobile`
- `openFutureSheet(action)`: apre bottom sheet con contenuto dinamico per simula/scadenze/ia
- `closeFutureSheet()`: chiude bottom sheet
- `renderFutureProjectionsPreview(container, simAmount)`: proiezioni dentro il sheet (per simulazione live)
- `renderAnnualDeadlinesInSheet()`: scadenziario interattivo dentro il sheet
- Event binding: Action Hub click ÔåÆ `openFutureSheet`, overlay click ÔåÆ `closeFutureSheet`
- Swipe-to-close su `#futureBottomSheet` via touch events sul drag handle

### ­ƒÄ» Status: COMPLETATO
- Tab Previsioni su mobile ora occupa esattamente viewport (zero-scroll)
- 6 proiezioni in griglia 2├ù3 compatta
- 3 azioni (Simula, Scadenze, IA) in Action Hub bottom
- Ogni azione apre bottom sheet dedicato con interazione completa
- Desktop invariato

---

## [2026-07-23] - Fix Header Scroll, 3 Card Grid & Mobile Zero-Scroll (Analisi Tab)

### Ô£à Completed Changes

**style.css - Mobile CSS (max-width: 767px):**
- `#history-tab.active`: height cambiata da `calc(100dvh - 65px - ...)` a `calc(100dvh - 60px - 60px - env(safe-area-inset-bottom))` (header 60px + navbar 60px)
- Aggiunto `position: relative` e `box-sizing: border-box` al tab per contenere icone absolute
- Padding tab: da `10px` a `8px 12px`

**style.css - Records Hub: orizzontale ÔåÆ griglia 3 colonne:**
- `.records-hub-scroll`: da `display: flex; overflow-x: auto` con card `flex: 0 0 45%` a `display: grid; grid-template-columns: repeat(3, 1fr); overflow: visible`
- Card: padding ridotto a `6px 4px`, `min-width: 0`, `max-width: none`
- Label: font-size `10px`, `text-transform: uppercase`, `letter-spacing: 0.3px`
- Value: font-size `12px`, `font-weight: 700`
- `#recordsHubContainer`: aggiunto `margin-top: 36px` per fare spazio alle icone absolute

**style.css - Icone Azione (­ƒñû ­ƒôï) in alto a destra:**
- `.analisi-top-actions`: da `flex-shrink: 0` inline a `position: absolute; top: 8px; right: 12px; z-index: 5`
- Pulsanti ridotti: `36px` (da 40px), font-size `17px` (da 20px)
- Aggiunto `backdrop-filter: blur(4px)` per effetto vetro

**Chart.js ÔÇö gi├á corretto:**
- `responsive: true, maintainAspectRatio: false` gi├á presenti
- `#chartsCard` gi├á con `flex: 1; min-height: 0; display: flex; flex-direction: column`

### ­ƒÄ» Status: COMPLETATO
- Tab Analisi occupa solo spazio residuo tra header e navbar
- 3 card record in griglia compatta 3 colonne (nessun taglio)
- Icone IA e Archivio fluttuanti in alto a destra
- Grafico riempie flessibilmente lo spazio restante

---

## [2026-07-22] - Bottom Sheet Dynamic Category Grid with Colorful Tiles

### Ô£à Completed Changes

**script.js - renderMicroCategoriesGrid() Rewrite:**
- Ora legge le categorie da `userMacroCategories[macroGroup]` (localStorage) invece che da `CATEGORIES_MAP` hardcoded
- Se la macro-categoria ├¿ vuota, mostra messaggio "Nessuna categoria presente. Aggiungila nelle Impostazioni"
- Genera wrapper `.bottom-sheet-grid` con card `.bottom-sheet-cat-card`
- Ogni card ha: `data-id="NOME"`, `.cat-icon-wrap` con `<i class="fas FA_ICON">`, `.cat-name`
- Sfondi pastello calcolati da `getCategoryCardBg()` per colori unici per categoria
- Click sulla card ÔåÆ `slideToInputView(cat)` (transizione orizzontale al form input)

**script.js - getFaIcon() Helper (NEW):**
- Mappa nome categoria ÔåÆ icona FontAwesome cercando in `CATEGORIES_MAP`
- Fallback: `fa-tag` per categorie non presenti nella mappa

**style.css - Bottom Sheet Grid Styles (NEW):**
- `.bottom-sheet-grid`: grid 3 colonne, gap 12px, max-height 60vh, overflow-y auto
- `.bottom-sheet-cat-card`: flex column, border-radius 18px, box-shadow, `:active` scale(0.94)
- `.cat-icon-wrap`: font-size 1.5rem, margin-bottom 6px
- `.cat-name`: font-size 0.75rem, font-weight 600
- `.bottom-sheet-empty`: messaggio vuoto centrato
- `#microCategoriesGrid`: override `display: block !important` (forza visibilit├á dentro bottom sheet nonostante classe `.category-grid-mobile`)

### ­ƒÄ» Status: COMPLETATO
- Click su macro-card (Casa/Veicoli/Svago) apre Bottom Sheet con griglia colorata 3 colonne
- Categorie lette dinamicamente da localStorage (impostazioni)
- Tessere con icone FontAwesome e sfondi pastello unici per categoria
- Messaggio empty-state se nessuna categoria presente

---

## [2026-07-22] - Back Button Flexbox Fix & Progress Bar on Category Tiles

### Ô£à Completed Changes

**index.html - Header Refactor:**
- Sostituito `<div class="sheet-header">` con `<div class="bottom-sheet-header">` (flexbox)
- Bottone back rinominato: `#sheetBackBtn` ÔåÆ `#btn-back-to-categories`, classe `.btn-back-sheet`
- Titolo rinominato: `#sheetTitle` ÔåÆ `#selected-category-title`, classe `.sheet-title`
- Freccia indietro ora in flexbox inline affiancata al titolo (non pi├╣ absolute positioning)

**style.css - Back Button Styles Replaced:**
- Rimosse vecchie regole `.sheet-back-btn` (absolute, top/left/translateY)
- Nuovo `.bottom-sheet-header`: `display: flex; align-items: center; gap: 12px; padding: 10px 16px;`
- Nuovo `.btn-back-sheet`: sfondo `#f0f2f5`, 36├ù36, border-radius 50%, `:active` pi├╣ scuro

**style.css - Progress Bar Styles (NEW):**
- `.cat-progress-track`: `width: 80%; height: 4px; background: #e9ecef; border-radius: 4px; margin-top: 8px;`
- `.cat-progress-bar`: `height: 100%; border-radius: 4px; transition: width 0.3s ease, background-color 0.3s ease;`

**script.js - Selector Updates:**
- `getElementById('sheetBackBtn')` ÔåÆ `getElementById('btn-back-to-categories')` (4 occorrenze)
- `getElementById('sheetTitle')` ÔåÆ `getElementById('selected-category-title')` (3 occorrenze)

**script.js - Progress Bar in renderMicroCategoriesGrid():**
- Calcolo somme Planned/Actual per categoria da `currentData.expenses`
- `perc = Math.min((aVal / pVal) * 100, 100)` se `pVal > 0`, altrimenti 0%
- `barColor`: verde `#2a9d8f` (0-70%), giallo `#e9c46a` (71-99%), rosso `#e76f51` (ÔëÑ100%)
- Barra HTML iniettata in ogni `.bottom-sheet-cat-card`

### ­ƒÄ» Status: COMPLETATO
- Freccia indietro pulita e allineata a sinistra accanto al titolo (flexbox)
- Ogni tessera categoria mostra barra progresso colorata (verde/giallo/rosso)
- Barra si aggiorna in base ai dati del mese corrente

---

## [2026-07-22] - Bottom Sheet UX Optimization (Drag Handle, Scroll Fix, Z-Index)

### Ô£à Completed Changes

**index.html - Drag Handle Wrapper:**
- Sostituito `<div class="sheet-handle">` con `<div class="drag-handle-wrapper"><div class="sheet-handle"></div></div>`
- La lineetta visiva ├¿ invariata, ma ora ha un wrapper con padding generoso per l'area di tocco

**style.css - Drag Handle Refactor:**
- Rimosse le vecchie regole `.sheet-handle` (width/height/background/touch-action)
- Nuovo `.drag-handle-wrapper`: `padding: 20px 0`, `touch-action: none`, `cursor: grab`
- `.sheet-handle` ora ha solo regole visive: 40px ├ù 5px, `background: #d1d5db`, `border-radius: 10px`
- `.bottom-sheet` z-index portato a `10000 !important` (sopra la navbar)

**style.css - Scroll Chaining Fix:**
- Aggiunto `.bottom-sheet .sheet-slider .sheet-view .sheet-body` con `overscroll-behavior-y: contain !important`
- Stesso selettore con `padding-bottom: calc(85px + env(safe-area-inset-bottom)) !important` per evitare che navbar copra il bottone Salva

**script.js - Swipe Handler Refactor (setupSwipeToClose):**
- Ora agganciato a `.drag-handle-wrapper` e `.sheet-header` (non pi├╣ a `.sheet-handle`)
- Event listener condivisi tra multiple target per maggiore area di presa
- Tocco registrato fluidamente anche fuori dalla lineetta esatta

### ­ƒÄ» Status: COMPLETATO
- Area di tocco drag handle molto pi├╣ larga (padding 20px sopra/sotto)
- Scroll interno non fa muovere la pagina dietro (overscroll-behavior: contain)
- Bottone Salva sempre visibile (padding-bottom 85px + safe-area)
- Body scroll disabilitato quando sheet aperto, ripristinato alla chiusura

---

## [2026-07-22] - Hierarchical Category Management System (Settings UI)

### Ô£à Completed Changes

**script.js - Data Structure Rewrite:**
- Sostituito `DEFAULT_CATEGORIES` (array di 29 oggetti) con `defaultCategories` (oggetto con 3 macro, 20 voci)
- Aggiunte costanti helper: `MACRO_LABELS`, `MACRO_ICON`, `MACRO_COLOR`, `DEFAULT_ICONS`
- Aggiunta variabile globale `userMacroCategories` (`{ casa_utenze: [...], veicoli: [...], spese_svago: [...] }`)
- Rimossa `ICON_OPTIONS` (non pi├╣ utilizzata)
- Aggiunto `rebuildUserCategories()` ÔÇö appiattisce `userMacroCategories` ÔåÆ `userCategories` (retro-compatibile)

**script.js - initCategories() Migration:**
- Carica categorie da DB con supporto campo `macro`
- Migrazione automatica: categorie esistenti senza `macro` ÔåÆ assegnate via `getCategoryMacroGroup()`
- Fallback: categorie legacy non in CATEGORIES_MAP ÔåÆ assegnate a `spese_svago`
- Se DB vuoto ÔåÆ seed con `defaultCategories` (20 categorie esatte)

**script.js - saveCategory() & deleteCategory() Refactor:**
- `saveCategory()`: ora legge macro da `<select id="newCatMacro">`, salva `{name, macro, icon}` in DB
- `deleteCategory()`: rimuove da `userMacroCategories[macro]` invece di flat filter
- `editCategory()`: aggiornato per impostare il select macro invece dell'icon selector

**script.js - renderFunctions Refactor:**
- `renderCategoriesDropdown()`: ora solo per dropdown spese (non pi├╣ admin tag list)
- `renderMacroCategories()` (NEW): genera 3 blocchi HTML con header colorato, lista categorie, pulsante ­ƒùæ´©Å
- `renderImportCheckboxList()`: adattato per appiattire `userMacroCategories`

**index.html - Settings Tab Rewrite:**
- Sostituito `<select id="newCatIcon">` (28 emoji) con `<select id="newCatMacro">` (3 macro-gruppi)
- Sostituita `<div id="categoriesAdminList">` con `<div id="macroCategoriesContainer">`
- Rimossa icon-selector, ora il form ha solo input testo + select macro + bottone

**style.css - Macro Block Styles (NEW):**
- `.macro-block`, `.macro-block-header`, `.macro-block-body`, `.macro-cat-item`, `.cat-delete-btn`, `.macro-cat-count`, `.macro-cat-empty`

### ­ƒÄ» Status: COMPLETATO
- Sistema gerarchico funzionante: 3 macro-categorie, 20 voci di default
- Aggiunta/rimozione categorie con associazione macro obbligatoria
- Visualizzazione a blocchi colorati nell'admin
- Piena retro-compatibilit├á con spese esistenti e backup JSON

---

## [2026-07-20] - CATEGORIES_MAP Data Structure & Bottom Sheet Logic (UPDATED)

### Ô£à Completed Changes

**script.js - CATEGORIES_MAP Constant (Updated):**
- Restructured: chiavi semplificate `casa_utenze`, `veicoli`, `spese_svago`
- Formato semplificato: array diretto invece di oggetto con `subcategories`
- 20 categorie in totale (9 casa_utenze + 5 veicoli + 6 spese_svago)
- Propriet├á: `id`, `nome`, `icona` (FontAwesome), `colore`

**script.js - getCategoryMacroGroup() Refactor:**
- Aggiornato per leggere direttamente da `CATEGORIES_MAP` con nuova struttura
- Loop su `Object.entries(CATEGORIES_MAP)` con `.some(sub => sub.nome === catName)`
- Fallback a `'spese_svago'` per categorie non mappate

**script.js - openBottomSheetFromMacro() Update:**
- Mappa titoli aggiornata: `casa_utenze` ÔåÆ "Casa e Utenze", `veicoli` ÔåÆ "Veicoli", `spese_svago` ÔåÆ "Spese e Svago"

**script.js - slideBackToCategories() Update:**
- Mappa titoli allineata alle nuove chiavi macro-categorie

**script.js - renderMicroCategoriesGrid() Refactor:**
- Ciclo diretto su `CATEGORIES_MAP[macroGroup]` (array), non pi├╣ `.subcategories`
- Controllo `userCategories.includes(cat)` per mostrare solo categorie abilitate
- Icona e stili da `getCatIcon()` esistente

**index.html - Macro Card Data Attributes (Updated):**
- Aggiornato `data-category="casa_utenze"` su `.card-casa`
- `data-category="veicoli"` su `.card-veicoli` (invariato)
- Aggiornato `data-category="spese_svago"` su `.card-svago`

### ­ƒÄ» Status: COMPLETATO
- Struttura dati scalabile per macro-categorie (3 macro, 20 totali)
- Click su macro-card apre Bottom Sheet con sottocategorie dinamiche originali (20)

---

## [2026-07-20] - Millimetric Zero-Tolerance Space Fix (Mobile)

### Ô£à Completed Changes

**style.css - Mobile CSS (max-width: 767px):**
- Aggiunto `margin: 0 !important; padding: 0 !important;` su html, body (reset tolleranza zero)
- `.container`: `padding-bottom: calc(60px + env(safe-area-inset-bottom))` (calibrazione esatta navbar)
- `.container`: aggiunto `margin-bottom: 0 !important` (evita spazio vuoto)
- `#current-month-tab`: `padding-bottom: 0 !important`, `margin-bottom: 0 !important` (riduzione spazio bottom)
- `.main-layout`: aggiunto `margin-bottom: 0 !important` (nessun overflow vuoto)
- `.mobile-dashboard-container`: `margin: 15px 0 0 !important` (azzerato margin-bottom)
- `.summary-grid`: `margin-bottom: 0 !important` (azzerato spazio dopo riepiloghi)

**style.css - Bottom Sheet Touch Isolation:**
- `.bottom-sheet`: aggiunto `overscroll-behavior-y: contain !important` (blocca propagazione scroll al body)
- `.sheet-handle`: aggiunto `touch-action: none !important` (disattiva gesture native browser su handle)

**style.css - Max-width: 768px Media Query:**
- `body`: `padding-bottom: 0 !important` (allineato al 767px per coerenza)
- `.summary-grid`: `margin-bottom: 0 !important` (azzerato spazio dopo riepiloghi)

**script.js - Body Scroll Lock on Sheet Open:**
- `openTransactionSheet()`: aggiunto `document.body.style.overflow = 'hidden'`
- `openBottomSheetFromMacro()`: aggiunto `document.body.style.overflow = 'hidden'`
- `closeTransactionSheet()`: aggiunto `document.body.style.overflow = ''` per ripristino scroll

### ­ƒÄ» Status: COMPLETATO
- Spazio vuoto in fondo alla home eliminato
- Drag verso il basso sul Bottom Sheet non attiva pi├╣ pull-to-refresh
- Scroll della pagina sottostante isolato durante interazione sheet

---

## [2026-07-19] - Global Scroll Unlock & Home Screen Space Optimization (Mobile-Only)

### Ô£à Completed Changes

**style.css - Mobile CSS (max-width: 767px):**
- `overflow-y: auto !important` su html, body, .container, .main-container, .app-wrapper, #app, .page, .view, .section (sblocco scroll totale)
- `min-height: 100vh !important` al posto di `min-height: 0` per permettere contenuti lunghi
- `.container`: padding-bottom `calc(85px + env(safe-area-inset-bottom))` (spazio navbar)
- `#current-month-tab`: `height: auto`, `min-height: 0`, `padding-bottom: 20px` (compattazione home)
- `.main-layout`: `height: auto`, `min-height: 0` (nessun overflow vuoto)

### ­ƒÄ» Status: COMPLETATO
- Scroll verticale nativo funzionante su TUTTE le pagine mobile
- Pull-to-refresh ora attivo
- Schermata Mese compatta senza spazio vuoto in fondo
- Bottom navigation con 85px di spazio di sicurezza

---

## [2026-07-19] - Total Reset & Scroll Unblock (Mobile-Only)

### Ô£à Completed Changes

**style.css - Mobile CSS (max-width: 767px):**
- Reset aggressivo su tutti i contenitori: `html, body, .container, .main-container, .app-wrapper, #app, .page, .view, .section`
- `overflow-y: auto !important` su tutti gli elementi strutturali
- `position: relative !important` per rimuovere position: fixed bloccanti
- `min-height: 100vh !important` per permettere allungamento naturale
- `-webkit-overflow-scrolling: touch !important` per scroll elastico iOS
- `.bottom-nav` mantiene `position: fixed` come unico elemento fixed

### ­ƒÄ» Status: COMPLETATO
- Scroll verticale totale riattivato su tutte le pagine mobile
- Pull-to-refresh ora funzionante
- Layout mobile mantiene header sticky e navbar fixed in fondo
- Desktop invariato

## [2026-07-19] - Native Vertical Scroll Restoration

### Ô£à Completed Changes

**style.css - Mobile CSS (max-width: 767px):**
- `html, body`: sostituito `overflow: hidden` con `overflow-y: auto`, `position: fixed` con `position: relative`, `height: 100vh` con `min-height: 100vh`
- `.container`: sostituito `height: 100vh` con `min-height: 100vh`, `overflow: hidden` con `overflow-y: auto`
- Aggiunto `-webkit-overflow-scrolling: touch` per scroll fluido su iOS

### ­ƒÄ» Status: COMPLETATO
- Scroll verticale nativo e fluido riattivato su tutte le pagine mobile
- Possibilit├á di scrollare verso l'alto per aggiornare la pagina (pull-to-refresh)
- Layout mobile mantiene aspetto originale con flexibilit├á scroll

## [2026-07-19] - Macro-Card Proportions Optimization (Mobile)

### Ô£à Completed Changes

**style.css - Mobile CSS (max-width: 768px):**
- `.mobile-dashboard-container`: `gap: 12px`, `padding: 8px 15px` (spazi pi├╣ compatti)
- `.dash-card`: `min-height: 120px` (card Casa/Veicoli pi├╣ basse)

---

## [2026-07-18] - Mobile Scroll Lock & Full-Screen Layout (Flexbox Radicale)

### Ô£à Completed Changes

**style.css - Mobile CSS (max-width: 767px):**
- `html, body`: `margin: 0`, `padding: 0`, `height: 100vh`, `height: -webkit-fill-available`, `overflow: hidden`, `position: fixed`
- `.container`: `height: 100vh`, `display: flex`, `flex-direction: column`, `justify-content: space-between`, `align-items: center`, `padding: 10px 15px calc(85px + env(safe-area-inset-bottom)) 15px`
- `.mobile-dashboard-container`: `display: flex`, `flex-direction: column`, `flex-grow: 1`, `justify-content: center`, `gap: 12px`
- `.dash-card`: `flex: 1`, `min-height: 0`, `display: flex`, `flex-direction: column`, `justify-content: center`, `align-items: center`, `padding: 15px`
- `.summary-grid`: `width: 100%`, `margin-top: 5px`, `margin-bottom: 5px`

### ­ƒÄ» Status: COMPLETATO
- Layout mobile bloccato come app nativa
- Spazi equidistanti con flexbox space-between
- Nessuno scroll verticale disponibile
- Card distribuite equamente verticalmente

---

## [2026-07-18] - Bottom Navigation Mobile Redesign (iOS/Android Style)

### Ô£à Completed Changes

**index.html - HTML Structure:**
- Sostituito `.header` + `.navigation-tabs` con nuova struttura bottom-nav
- Header semplificato a `<h1>` con sottotitolo per mobile
- Nuova navbar `.bottom-nav` con 4 voci anchor:
  - `#navMese` ÔåÆ icona `fa-calendar-day`, label "Mese"
  - `#navAnalisi` ÔåÆ icona `fa-chart-line`, label "Analisi"  
  - `#navPrevisioni` ÔåÆ icona `fa-crystal-ball`, label "Previsioni"
  - `#navImpostazioni` ÔåÆ icona `fa-cog`, label "Impostazioni"
- Click handler mantiene compatibilit├á con funzione `switchTab()` esistente
- Versione CSS bumpata a `?v=1.5`

**style.css - Mobile CSS (max-width: 767px):**
- `.bottom-nav`: position fixed bottom, width 100%, padding con `env(safe-area-inset-bottom)`
- `.nav-item`: flex column, gap 4px, icona sopra testo sotto
- `.nav-icon-wrapper`: padding 6px 16px, border-radius 20px, sfondo pillola
- `.nav-label`: font-size 11px, font-weight 500, sempre visibile
- Stato active: sfondo azzurro `#E8F0FE`, icona/testo blu `#1A73E8`, font-weight 700
- `.navigation-tabs` legacy nascosto
- Body padding-bottom: 95px per spazio navbar

### ­ƒÄ» Status: COMPLETATO
- Navbar fissata in basso su mobile con aspetto app nativa
- 4 voci con icona + label (testo sempre visibile)
- Stato active con pillola azzurra chiaro
- Desktop invariato

---

## [2026-07-17] - Bottom Sheet with Original Grid Injection & Horizontal Transition

### Ô£à Completed Changes

**index.html - Bottom Sheet HTML Structure:**
- Ristrutturato Bottom Sheet in due viste: `#viewCategories` (griglia micro-categorie) e `#viewInput` (form input)
- Aggiunta struttura `.sheet-slider` con flexbox per transizione orizzontale
- Aggiunto `#microCategoriesGrid` con classe `.category-grid-mobile` come contenitore card iniettate
- Aggiunto `#sheetBackBtn` con icona `.fa-arrow-left`, nascosto di default (`display:none`)
- Modificato `#sheetTitle` per aggiornamento dinamico del titolo

**style.css - Sheet Slider & Back Button:**
- `.sheet-slider`: flexbox con `transition: transform 0.35s cubic-bezier(0.25, 0.46, 0.45, 0.94)`
- `.sheet-view`: `flex: 0 0 100%` per layout a schermo intero orizzontale
- `.sheet-back-btn`: posizionato assoluto a sinistra, `width: 36px`, `height: 36px`, `border-radius: 50%`, `background: rgba(0,0,0,0.05)`

**script.js - Original Grid Injection Logic:**
- Aggiunta variabile globale `sheetCurrentMacroGroup` per tracciare macro-group
- `openBottomSheetFromMacro(macroGroup)`: apre sheet, inietta griglia, nasconde back button
- `renderMicroCategoriesGrid(macroGroup)`: genera card usando classi `.category-card`, `.category-progress-bar`, etc.
- `slideToInputView(categoryName)`: esegue `translateX(-100%)`, mostra back button, aggiorna titolo
- `slideBackToCategories()`: resetta slider a `translateX(0)`, nasconde back button, ritorna al titolo macro
- `setupMacroDashCards()`: aggiunge click handler a `.card-casa`, `.card-veicoli`, `.card-svago`
- `setupBottomSheetBackBtn()`: listener click per back button
- `closeTransactionSheet()`: reset slider position e stato

### ­ƒÄ» Status: COMPLETATO
- Macro-card aprono Bottom Sheet con griglia micro-categorie filtrate
- Click su micro-categoria esegue transizione slide verso form input
- Back button permette di tornare alla griglia
- Card iniettate mantengono stili originali (colori, icone, progress bar)

---

## [2026-07-17] - Mobile Dashboard Macro-Card & CSS Fix

### Ô£à Completed Changes

**index.html - Mobile Dashboard HTML:**
- Inserito nuovo blocco HTML `.mobile-dashboard-container` subito dopo la pillola del mese
- Aggiunta struttura `.dash-card` con 3 macro-card:
  - `.card-casa` ÔåÆ "Casa e Utenze" con icona `fa-home`
  - `.card-veicoli` ÔåÆ "Veicoli" con icona `fa-car`
  - `.card-svago` ÔåÆ "Spese e Svago" con icona `fa-shopping-cart`

**style.css - Mobile-Only CSS:**
- Navbar fissata in basso: `position: fixed; bottom: 0; left: 50%; transform: translateX(-50%)`
- Header sticky con glassmorphism chiaro, height 60px
- `.summary-grid` ripristinato con stile compatto (padding 8px 4px, font-size 10px)
- `.mobile-dashboard-container` nascosta di default, visibile solo in `@media (max-width: 768px)`
- Gradienti card: Casa (#1A8699ÔåÆ#28B4A6), Veicoli (#5AB963ÔåÆ#8AD458), Svago (#8E2DE2ÔåÆ#4A00E0, grid-column span 2)
- Elementi nascosti su mobile: `.category-grid-mobile`, `.macro-tabs-wrapper`
- Body con `padding-bottom: 100px` per spazio navbar

### ­ƒÄ» Status: COMPLETATO
- Dashboard mobile visibile esclusivamente su schermi Ôëñ768px
- Header e navbar funzionanti correttamente
- Summary cards compatte mostrate tra mese e macro-card
