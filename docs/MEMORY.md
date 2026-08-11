# Project Core Memory

## 🛠️ Tech Stack & Architecture
- **Structure**: Vanilla HTML5, CSS3, Modern ES6 JavaScript.
- **Files**: `index.html`, `style.css`, `script.js`.

## 📌 Global Rules & Custom Conventions
- **Costanti globali**: SEMPRE posizionare le costanti (`const`) all'inizio del file, prima di ogni altra dichiarazione, per evitare errori di Temporal Dead Zone.
- **Variabili globali**: Dichiarare tutte le variabili (`let`) utilizzate in callback/funzioni in testa al file, nella sezione variabili globali, per evitare errori TDZ in contesti asincroni.
- **Funzioni**: Dichiarare funzioni dopo le costanti ma prima delle chiamate DOM immediate.
- **Inizializzazione DOM**: Evitare operazioni DOM sincroni all'esterno di eventi `onload` o `DOMContentLoaded`.
- **Controlli difensivi**: quando si usa `getElementById`, sempre verificare il risultato non sia null prima di accedere a proprietà/metodi.

## 🔧 Bug Fixes & Soluzioni Recenti
- **2026-08-11**: ROADMAP ripristino feature da `legacy_version/` in `docs/ROADMAP.md` — 7 fasi con riferimenti riga al codice legacy; Fase 1 (Spese Ricorrenti: toggle mobile+desktop, `saveRecurringClones`, `setupRecurringToggle`) e Fase 2 (Gestione Ripetizioni: `renderRipetizioni`, `deleteRecurringGroup`, card inline in Impostazioni) COMPLETATE. **Ogni sessione deve leggere ROADMAP.md** per sapere cosa manca e cosa è già stato riportato.
- **2026-08-11**: Fallback dinamico modelli `:free` — client: `fetchFreeModels()` da `/api/v1/models` + dropdown dinamico (`populateFreeModelSelect`, opzione `🎲 Casuale (Free)` value `random`); server: `FALLBACK_MODELS` + loop candidati dedup con timeout 30s, stop su 401/403, 502 solo a esaurimento
  - **Regola**: il modello `:free` può sparire/diventare a pagamento → mai hardcodare UN solo modello; lista attiva dal client + fallback array nel server
- **2026-08-11**: Surfacing errori invoke — helper `extractFunctionError(err)` in script.js (legge `err.context` di `FunctionsHttpError` → `Status <code>: <body>`); Edge Function chat-openrouter: guardia secret mancante → 500 esplicito, JSON malformato → 400, errori OpenRouter → 502 con dettaglio
- **2026-08-11**: Fix `reading 'invoke'` — `window.supabase` (namespace UMD CDN) non ha `.functions`; usare sempre `window.supabaseClient.functions.invoke` (istanza creata in supabase-adapter.js)
  - **Regola**: `.functions` esiste solo sull'istanza `createClient()` (→ `window.supabaseClient`), mai sul namespace `window.supabase`
- **2026-08-11**: Edge Function `chat-openrouter` — JWT auth obbligatorio + whitelist modelli free (`openrouter/free` o regex `:free$`); rimosso fetch diretto a OpenRouter da `runFinancialAnalysisIA` (chiave mai lato client); rimosso input API key da index.html
  - **Regola**: mai fare fetch a OpenRouter DAL BROWSER; la key vive solo in `Deno.env` dell'Edge Function; deploy manuale via CLI (`supabase functions deploy chat-openrouter`)
- **2026-08-11**: Pulizia repo per GH Pages — rimossi `db_usages.txt` (artifact debug) e script CDN `dexie.js` da index.html (dipendenza morta dall'adapter Supabase)
- **2026-08-11**: Fix 400 schema cache PostgREST (`months.totalActual`, `sync_state.deviceId`)
  - **Causa**: `CREATE TABLE IF NOT EXISTS` non aggiunge colonne a tabelle esistenti; la cache schema di PostgREST non viene ricaricata
  - **Fix**: `supabase/migrations/20260811_schema_completo.sql` — `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` per OGNI colonna di OGNI tabella (quoted camelCase) + DO-block PK mancanti + `NOTIFY pgrst, 'reload schema';`
  - **Adapter**: Outbox localStorage (`eb_outbox_<tabella>`): put/update/bulkPut falliti → accodati e ritentati al login/`online` (`flushOutbox()`); `_upsert`/`_update` restituiscono l'errore; rimosso rollback `pop()` in `addExpense` (i dati non vanno MAI scartati dalla memoria)
  - **Regola**: ogni migrazione Supabase deve sempre usare `ADD COLUMN IF NOT EXISTS` (mai solo `CREATE TABLE IF NOT EXISTS`) e terminare con `NOTIFY pgrst, 'reload schema';`
- **2026-08-10**: Fix sync dati su Supabase (PGRST204 su `iaNotes`)
  - Migrazione: `supabase/migrations/20260810_full_sync.sql` — `ALTER TABLE months ADD COLUMN "iaNotes" TEXT` + tabelle `settings`, `savings_goals`, `sync_state` (prima erano localStorage-only via `LocalMockTable`, ora SupabaseTable)
  - Adapter: allowlist colonne per tabella (`_allowedColumns`) → strip campi ignoti prima dell'upsert; `.maybeSingle()` al posto di `.single()` (via 406); `SettingTable` normalizza record legacy `name/id` → `key`
  - **Regola**: ogni campo JS scritto su Supabase deve esistere come colonna (case-sensitive, quoted in SQL) — usare l'allowlist come unica fonte di verità
- **2026-08-10**: Fix SyntaxError "Identifier 'supabase' has already been declared"
  - **Causa**: il bundle UMD di `@supabase/supabase-js@2` (jsdelivr) dichiara `var supabase` globale → il `const supabase` in supabase-adapter.js era un conflitto
  - **Fix**: istanza rinominata `supabaseClient` in tutto supabase-adapter.js; `script.js:2514` usa `window.supabase.functions.invoke`
  - **Regola**: NON dichiarare mai variabili globali con nomi dei namespace dei bundle CDN (supabase, Chart, etc.)
  - **Pulizia repo**: creato `.gitignore` (`.codegraph/`, `.opencode/`, `supabase/.temp/`, `*.log`, `.DS_Store`), rimosso `.codegraph/` dall'indice con `git rm -r --cached`
- **2026-08-10**: Fix pagina bianca su GitHub Pages
  - Causa: `main` remoto senza cartella `js/` (push parziale migrazione Supabase) → 404 `js/supabase-adapter.js`
  - Causa crash: righe 321-322 `script.js` senza guardia null su `iaProviderSelect`/`geminiApiKeyInput` (elementi assenti: IA hub usa `ai-engine-select`)
  - Fix: guardie null-safe + `<link rel="icon" href="icon-512.png">` + force-push `master` → `main`
  - **Regola deploy**: ogni push deve includere anche le cartelle/file NUOVI (`git add -A`, mai file selettivi), altrimenti Pages rompe la reference
- **2026-07-25**: Fix visibilità form spese nel bottom sheet (Slide Destra)
  - Rimosso `overflow: hidden` da `.sheet-slider` che tagliava `#viewInput`.
  - Aggiunto `overflow-x: hidden` su `.bottom-sheet`.
- **2026-07-12**: Fix errore "Cannot access 'categoryToEdit' before initialization"
  - Spostato `let categoryToEdit = null;` dalla sezione CATEGORIE (riga 429) alla sezione variabili globali (riga 262)
  - Rimossa dichiarazione duplicata
  - Evita Temporal Dead Zone in `saveCategory()` async
- **2026-07-11**: Fix errore "Cannot access 'TAB_TITLES' before initialization"
  - Spostato `TAB_TITLES` dalla sezione NAVIGAZIONE TABS (riga ~331) all'inizio file (riga 50)
  - Rimosso duplicato di dichiarazione
  - Separata funzione `updateActivePageSubtitle` da `switchTab`
- **2026-07-11**: Fix errore "Cannot read properties of null (reading 'value')" in toggleIaProviderFields
  - **Problema**: Funzione chiamata da initApp() tentava di leggere `.value` da elementi inesistenti
  - **Elementi mancanti**: `iaProviderSelect`, `aiModelGroup`, `geminiKeyGroup`, `openRouterKeyGroup`, `iaProviderBadge`, `iaStatusHint`, `ollamaModelSelect`
  - **Soluzione**: Aggiunto controllo `if (!providerEl) return;` all'inizio della funzione

## 📊 Categories Map (2026-07-20 - Updated)

### Macro Categories & Subcategories

| Macro | Nome | Icona | Colore | Totale |
|-------|------|-------|--------|--------|
| **casa_utenze** | Casa e Utenze | `fa-home` | `#2a9d8f` | 9 |
| - | Alimentari | `fa-shopping-cart` | `#2a9d8f` | |
| - | Bolletta Acqua | `fa-tint` | `#2a9d8f` | |
| - | Bolletta Condominio | `fa-building` | `#2a9d8f` | |
| - | Bolletta Gas | `fa-fire` | `#2a9d8f` | |
| - | Bolletta Luce | `fa-lightbulb` | `#2a9d8f` | |
| - | Bolletta Rifiuti | `fa-trash-alt` | `#2a9d8f` | |
| - | Bolletta Telefonia | `fa-phone` | `#2a9d8f` | |
| - | Igiene e Pulizia | `fa-pump-soap` | `#2a9d8f` | |
| - | Mutuo | `fa-home` | `#2a9d8f` | |
| **veicoli** | Veicoli | `fa-car` | `#7bc043` | 5 |
| - | Carburante Auto | `fa-gas-pump` | `#7bc043` | |
| - | Carburante Moto | `fa-motorcycle` | `#7bc043` | |
| - | Manutenzioni | `fa-wrench` | `#7bc043` | |
| - | Tasse Auto (Assic.) | `fa-car` | `#7bc043` | |
| - | Tasse Moto (Assic.) | `fa-shield-alt` | `#7bc043` | |
| **spese_svago** | Spese e Svago | `fa-shopping-cart` | `#6f42c1` | 6 |
| - | Abbigliamento | `fa-tshirt` | `#6f42c1` | |
| - | Cane | `fa-dog` | `#6f42c1` | |
| - | Formazione | `fa-book-open` | `#6f42c1` | |
| - | Imprevisti e Svago | `fa-glass-cheers` | `#6f42c1` | |
| - | Sanitarie | `fa-stethoscope` | `#6f42c1` | |
| - | Varie | `fa-box` | `#6f42c1` | |

**Totale categorie**: 20

### CATEGORIES_MAP Structure (Dashboard / Bottom Sheet)
```javascript
const CATEGORIES_MAP = {
    "casa_utenze": [{ id, nome, icona, colore }, ...],  // 9 subcategories
    "veicoli": [{ id, nome, icona, colore }, ...],      // 5 subcategories
    "spese_svago": [{ id, nome, icona, colore }, ...]  // 6 subcategories
};
```

### defaultCategories Structure (Settings / Seed Data)
```javascript
const defaultCategories = {
    casa_utenze: [ "Alimentari", "Bolletta Acqua", ... ],  // 9
    veicoli: [ "Carburante Auto", ... ],                    // 5
    spese_svago: [ "Abbigliamento", ... ]                  // 6
};
```

### Variabili Globali Categorie
- `userMacroCategories` — oggetto `{ macro: [nomi] }`, fonte di verità
- `userCategories` — array flat derivato (retro-compatibile)
- `categoryIconMap` — mapping nome → emoji icona

### Bottom Sheet Grid (renderMicroCategoriesGrid)
- `getFaIcon(catName)`: cerca nome in `CATEGORIES_MAP` → restituisce classe FontAwesome (es. `fa-shopping-cart`), fallback `fa-tag`
- `renderMicroCategoriesGrid(macroGroup)`: legge da `userMacroCategories[macroGroup]`, genera `.bottom-sheet-grid` con `.bottom-sheet-cat-card`
- Ogni card: `data-id="NOME"`, `.cat-icon-wrap` con `<i class="fas FA_ICON">`, `.cat-name`, sfondo pastello via `getCategoryCardBg(cat)`
- Empty state: "Nessuna categoria presente. Aggiungila nelle Impostazioni"

### Bottom Sheet Grid CSS
- `.bottom-sheet-grid`: 3 colonne, gap 12px, max-height 60vh, overflow-y auto
- `.bottom-sheet-cat-card`: 18px radius, flex column, box-shadow, `:active` scale(0.94)
- `.cat-icon-wrap`: font-size 1.5rem
- `.cat-name`: font-size 0.75rem, weight 600
- `#microCategoriesGrid`: override `display: block !important` (visibile dentro bottom sheet)

### Bottom Sheet UX - Drag Handle & Scroll Isolation
- `.drag-handle-wrapper`: `padding: 20px 0`, `touch-action: none`, `cursor: grab` (area tocco 40px)
- `.sheet-handle`: solo visivo (40px × 5px, `#d1d5db`, `border-radius: 10px`)
- `setupSwipeToClose()`: eventi agganciati a `#bottomSheet .drag-handle-wrapper` + `#bottomSheet .bottom-sheet-header`
  - **⚠ Importante**: i selettori devono essere scoped con `#bottomSheet` perché ci sono due bottom sheet nel DOM (future + spese)
  - `querySelector('.drag-handle-wrapper')` senza scope prende il primo handle nel DOM (future sheet)
- Z-index `.bottom-sheet`: `10000 !important` (sopra navbar)
- Scroll chaining bloccato: `.sheet-body` con `overscroll-behavior-y: contain !important`
- Bottone Salva visibile: `padding-bottom: calc(85px + env(safe-area-inset-bottom))` sul `.sheet-body`
- Body scroll disabilitato con `body.sheet-open` class (CSS), rimosso `style.overflow` inline per coerenza

### Bottom Sheet Header (Back Button)
- `.bottom-sheet-header`: flexbox, gap 15px, padding 10px 16px
- `.btn-back-sheet #btn-back-to-categories`: 36×36 circle, `#f0f2f5`, `:active` `#e0e2e5`
- `#selected-category-title`: titolo categoria affiancato alla freccia
- Titolo macro in `openBottomSheetFromMacro()` → mostra nome macro (es. "Casa e Utenze")

### Category Tile Progress Bar
- Ogni `.bottom-sheet-cat-card` include `.cat-progress-track` + `.cat-progress-bar`
- Calcolo: `perc = Math.min((actualSum / plannedSum) * 100, 100)` se planned > 0, altrimenti 0%
- Colori: `#2a9d8f` (≤70%), `#e9c46a` (71-99%), `#e76f51` (≥100%)
- Dati da `currentData.expenses` filtrati per categoria

## 📐 Layout Mobile: Tab Analisi (Zero-Scroll)
- `#history-tab.active`: `height: calc(100dvh - 60px - 60px - env(safe-area-inset-bottom))` (header 60px + navbar ~60px)
- `position: relative` con `overflow: hidden` — blocca scroll pagina
- `.analisi-top-actions`: `position: absolute; top: 8px; right: 12px; z-index: 5` — icone fluttuanti in alto a destra

## 🃏 Records Hub: Griglia 3 Colonne
- `.records-hub-scroll`: `display: grid; grid-template-columns: repeat(3, 1fr)` invece di flex orizzontale
- Label card: `font-size: 10px; text-transform: uppercase; letter-spacing: 0.3px`
- Value card: `font-size: 12px; font-weight: 700`
- Padding card: `6px 4px`

## 📱 Tab Previsioni — Zero-Scroll Mobile Dashboard (2026-07-24)

### Viewport
- `.future-mobile-dashboard`: `height: calc(100dvh - 60px - 60px - env(safe-area-inset-bottom))`
- `display: flex; flex-direction: column; overflow: hidden`
- Stesso pattern di `#history-tab`

### Header Compatto
- `.future-header-compact h2`: font-size 15px
- `#futureAvgBoxMobile`: font-size 10px, colore #64748b

### Griglia 2×3 Proiezioni
- `#futureProjectionsGrid`: `display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; flex: 1; min-height: 0`
- `.proj-card`: flex column centered, border-left 4px colored, border-radius 16px
- Label: 11px uppercase, Value: 18px bold

### Action Hub (3 bottoni)
- `#futureActionHub`: `display: flex; gap: 8px; flex-shrink: 0`
- 3 bottoni con `data-action`: `simula`, `scadenze`, `ia`

### Bottom Sheet Previsioni
- `#futureSheetOverlay` + `#futureBottomSheet` (pattern identico al bottom sheet spese)
- `#futureSheetBody` con contenuto iniettato via JS
- `openFutureSheet(action)`: popola body in base a action, apre sheet
- `closeFutureSheet()`: chiude e resetta
- `renderFutureProjectionsPreview()`: proiezioni dentro il sheet
- `renderAnnualDeadlinesInSheet()`: scadenziario dentro il sheet

### JS Refactor
- `renderFutureProjections()` ora popola sia `#futureProjectionsList` (desktop) che `#futureProjectionsGrid` (mobile)
- `resetFutureSimulation()` ora resetta anche `#simulatedExpenseMobile`
- `openFutureSheet('ia')` chiama `callAIEndpoint` con responseBoxId `iaFutureResponseSheet`
- Swipe-to-close su `#futureBottomSheet`

## 🚫 Body Scroll Lock & Scroll Chaining Fix (2026-07-24)

### CSS body.sheet-open (rafforzato)
```css
overflow: hidden !important;
height: 100dvh !important;
height: -webkit-fill-available !important;
width: 100% !important;
touch-action: none !important;
overscroll-behavior: none !important;
-webkit-overflow-scrolling: none !important;
```

### Bottom Sheet structure (flex + height)
- `.bottom-sheet`: `height: 85dvh; max-height: 85dvh; display: flex; flex-direction: column; overflow: hidden`
- `.drag-handle-wrapper`, `.bottom-sheet-header`: `flex-shrink: 0`
- `.sheet-slider`: `flex: 1; min-height: 0; overflow: hidden`
- `#viewInput`: `display: flex; flex-direction: column; min-height: 0` — fa da flex column per body + footer
- `.sheet-body`: `flex: 1; min-height: 0; overflow-y: auto !important` — scroll contenuto, footer sempre visibile
- `.sheet-view`: `overscroll-behavior-y: contain; min-height: 0` (NO overflow-y, gestito da .sheet-body)
- `#futureSheetBody`: identico a .sheet-body

### Touch-action riabilitato dentro il sheet
- `.bottom-sheet * { touch-action: auto }` — permette scroll/input dentro il foglio
- Drag handle mantiene `touch-action: none !important`

### Popup modali con body lock
- `openIaModal/closeIaModal` → `classList.add/remove('sheet-open')`
- `openArchiveModal/closeArchiveModal` → `classList.add/remove('sheet-open')`
- `openRendicontoPopup/closeRendicontoPopup` → `classList.add/remove('sheet-open')`
- `style.overflow` inline rimosso (ridondante, gestito da CSS)

## ✅ Completed Tasks
- **2026-08-08**: Recovery sezione Previsioni mobile dopo corruzione worktree — ripristinata base staged (Drive OAuth + sync intatti), ricostruito bottom sheet Previsioni (`openFutureSheet`/`closeFutureSheet`/`renderFutureProjectionsPreview`/`renderAnnualDeadlinesInSheet`/`setupFutureSwipeToClose`), `renderFutureProjections` estesa a mobile, binding action hub. `node --check` OK (3037 righe).
- **2026-07-25**: Ruota importo estesa a 4 cifre (0-9999) — loop, padStart, validazione, CSS width
- **2026-07-25**: Layout cleanup — toggle text flex-centered, uniform `gap: 20px` in sheet-body
- **2026-07-24**: Body scroll lock robusto per bottom sheet e popup modali
- **2026-07-24**: Tab Previsioni mobile zero-scroll — griglia 2×3, action hub, 3 bottom sheet
- **2026-07-23**: Fix scroll tab Analisi — altezza viewport corretta (header 60px + nav 60px)
- **2026-07-23**: Records hub convertito da carosello orizzontale a griglia 3 colonne
- **2026-07-23**: Icone IA/Archivio posizionate absolute in alto a destra
- **2026-07-22**: DEFAULT_CATEGORIES sostituito con `defaultCategories` (oggetto con macro)
- **2026-07-22**: Nuova UI gerarchica impostazioni con 3 blocchi macro e form con select macro
- **2026-07-22**: Migrazione automatica categorie flat → strutturate con campo `macro` in DB
- **2026-07-22**: Bottom Sheet griglia dinamica colorata — lettura da localStorage, card con icone FA, empty-state
- **2026-07-22**: Bottom Sheet UX — drag handle wrapper, overscroll-behavior, z-index 10000, padding-bottom bottone
- **2026-07-22**: Back button flexbox fix + progress bar colorata sulle tessere categoria

---
 # #   =��  D e p l o y   R u l e   ( G i t H u b   P a g e s ) 
 -   * * A u t o m a t i c   P u s h * * :   A l   t e r m i n e   d i   o g n i   t a s k   o   m o d i f i c a   d i   c o d i c e ,   l ' A I   d e v e   a u t o n o m a m e n t e   f a r e   c o m m i t   e   p u s h   s u   G i t H u b   p e r   s c a t e n a r e   l a   b u i l d   d i   G i t H u b   P a g e s .  
 
## 2026-08-11 — Investimenti tab: CSS restyled & verifica integrazione
- Ported invest CSS (mobile dashboard, hero card, asset cards, type buttons, movements, nav active state) from `legacy_version/style.css` into `style.css` (appended; override-ordre wins on mobile due to later rules + `!important` on `.invest-mobile-dashboard` over `.hide-desktop`).
- Added `.popup-body` + `.btn-small` utilities missing from current CSS.
- Verified all 19 invest DOM ids exist in `index.html`; all 10 JS functions present; `node --check script.js` passes.
- `.hide-desktop` (L524) keeps mobile dashboard hidden on desktop; popups use existing `.popup-panel` base.

## 2026-08-11 — Fase 4 ROADMAP: Spese Condivise COMPLETATA
- Migration `supabase/migrations/20260811_shared_expenses.sql`: tabelle people, groups, group_members, shared_expense_splits + ALTER expenses (isShared, sharedPayer). NOTIFY pgrst.
- Adapter (`js/supabase-adapter.js`): 4 nuove tabelle in DB_ACCESSOR/_allowedColumns/window.db; expenses +2 colonne. NOTA: `groups` e` una keyword SQL quotata - il client Supabase la quota automaticamente.
- HTML: entry card Mese (desktop `#condiviseCard` + mobile `.condivise-entry-btn`), shared panel nel bottom sheet (dopo recurring), popup `popup-spese-condivise` (tabs Saldi/Gruppi + detail view dark).
- JS: data layer (people/groups/groupMembers), split calc in `saveTransactionFromSheet` (wheel amount via `getWheelSheetAmount`), reset in `closeTransactionSheet`, popup/ledger/settle port da legacy con window.db al posto di Dexie (`where().equals()` -> toArray+filter).
- Backup: 4 tabelle aggiunte a export/import.
- CSS: classi .shared-*/.condivise-*/.saldo-*/.gruppo-*/.ledger-* + pills; ledger in tema dark (#0f172a).
- Desktop: `addExpense` gia` supportava % condivisa (identico a legacy) - nessuna modifica.

## 2026-08-11 — Fase 5 ROADMAP: Rendiconto esteso + Modifica spesa COMPLETATA
- Migration `20260811_expenses_settled.sql`: colonna expenses.settled (badge "Saldata"). Adapter aggiornato.
- HTML: btnNewIncome + incomeListContainer + expenseListContainer nel popup rendiconto; incomeBottomSheet con amount-input nativo + swipe-to-close.
- **BUG FIX preesistente**: openTransactionSheet usava id inesistente `sheetCategoryTitle` -> bottom sheet mobile mai aperto. Corretto a `selected-category-title`.
- JS: editExpense (prefill wheel via syncInputToWheel/syncWheelToInput, slider->input view), branch edit in saveTransactionFromSheet (CASO A in-place / CASO B clone + settled=true), editingExpenseId reset in closeTransactionSheet, renderIncomeList/renderExpenseList/getIncomesForMonth, eventi income sheet + swipe.
- entriesList: righe cliccabili -> editExpense (skip button), settled-badge. settleBalance branch debito: exp.settled=true.
- openRendicontoPopup: liste per tipo (entrate -> btn+lista entrate; altro -> lista spese) + body sheet-open.
- CSS: .income-*, .settled-badge, .popup-income-btn, .amount-input, .income-sheet-body.

## 2026-08-11 - Fase 6 ROADMAP: Popup mobile (Ricerca, IA Mese, Action Hub) COMPLETATA
- HTML: #mese-action-hub (hide-desktop, 3 bottoni data-action search/ia/condivise) nel tab Mese al posto del vecchio .condivise-entry-btn; #searchPopup (searchPopupInput, searchPeriodSelect, searchCustomMonth, searchResultsList); #iaMonthPopup (btnIaMonthAnalysis, iaMonthResponse) dopo popup-rendiconto.
- JS: openSearchPopup/closeSearchPopup/toggleSearchCustomMonth/filterSearchResults (periodo current = currentData + getIncomesForMonth, all = toArray, custom = where('month').equals); openIaMonthPopup/closeIaMonthPopup/runIaMonthAnalysis -> riusa callAIEndpoint(prompt, 'iaMonthResponse', 'btnIaMonthAnalysis') gia presente (L4050) e saveNotes() verso months.iaNotes; wiring hub via IIFE addEventListener su #mese-action-hub.
- FIX: tab popup Spese Condivise ora hanno onclick switchCondiviseTab('saldi'|'gruppi') (prima bloccati su Saldi).
- CSS: #mese-action-hub + #mese-action-hub button (flex pills var(--panel)); rimosso blocco orfano .condivise-entry-btn (bilanciamento braces verificato, 534/534).
- Verifica: node --check OK; tutti gli id/function cross-referenziati presenti.

## 2026-08-11 - Fase 7 ROADMAP: Emoji picker categorie COMPLETATA
- HTML: `#emojiPickerBtn` (placeholder emoji ) + `#emojiInput` nascosto nel grid-inputs della sezione categorie impostazioni (prima di `#newCatName`).
- JS: `setupEmojiPicker` IIFE (click -> posizione fixed/opacity 0/focus per tastiera emoji nativa; input -> `[...val].pop()` -> testo bottone; blur -> reset). `saveCategory`: `chosenEmoji = document.getElementById('emojiPickerBtn')?.textContent`; branch edit `chosenEmoji || categoryIconMap[name] || MACRO_ICON[macro] || placeholder`, branch nuovo `chosenEmoji && chosenEmoji !== placeholder ? chosenEmoji : MACRO_ICON[macro] || placeholder`. `editCategory`: `pickerBtn.textContent = getCatIcon(cat)`.
- CSS: `.emoji-picker-btn` (40px cerchio, bordo #cbd5e1, bg #f8fafc, font 20px), `:active` #e2e8f0, `.emoji-input-hidden` (clip rect 0, opacity 0).
- Verifica: node --check OK, cross-ref id/class OK, braces 0/-.
- ROADMAP completo: tutte le 7 fasi [x].
