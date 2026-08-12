# Project Core Memory

## 🗄️ SHARED EXPENSES V2 — tipi FK dinamici + quoting/cast (2026-08-12)
- **DB reale**: `expenses.id` = **TEXT**, `people.id` = BIGINT, `group_members.user_id` = TEXT. `ADD COLUMN IF NOT EXISTS` NON converte colonne pre-esistenti → mai hardcodare BIGINT su FK verso tabelle legacy.
- **`migrations/001_shared_expenses_v2.sql`**: `shared_expenses`/`shared_expense_participants` create via `DO $$ ... EXECUTE format()` con tipo letto da `information_schema.columns` (fallback text/bigint). Fix errore 42804 (expense_id bigint vs expenses.id text).
- **Quoting obbligatorio**: `"personId"`, `"groupId"` (camelCase) — in SQL non quotato Postgres li lowercasa → colonna non trovata.
- **Cast**: `auth.uid()` è UUID; le colonne `user_id` legacy sono TEXT → confronti SEMPRE con `::text` su entrambi i lati (es. `user_id = auth.uid()::text`, `created_by::text = auth.uid()::text`).
- **Patch**: `migrations/001b_fix_fk_types.sql` = self-contained (DROP IF EXISTS + ricrea) per stati parziali.
- Ogni migration termina con `NOTIFY pgrst, 'reload schema';`.

## 🎨 BOTTOM SHEET MACRO-CATEGORIE v2 — altezza dinamica + tema macro + badge budget + ultime spese (2026-08-12)
- **`.bottom-sheet` (STYLE.CSS 1504)**: `height:auto; max-height:85vh; overflow-y:auto` (niente più 85dvh fissa → niente vuoto in basso). GLOBALE per scelta utente: anche la view input spesa scrolla l'intero sheet. `.bottom-sheet-grid` `max-height:46vh` (era 60vh).
- **Tema per macro**: const `MACRO_THEME` (script.js, dopo CATEGORIES_MAP) → `casa_utenze` ottanio `#2a9d8f`, `veicoli` verde `#7bc043`, `spese_svago` viola `#6f42c1`; ognuno con accent/tint/border. `openBottomSheetFromMacro` setta `--macro-accent/--macro-tint/--macro-border` su `#bottomSheet` + colore titolo accent.
- **Micro-card UNIFORMI**: MAI più `getCategoryCardBg(cat)` (colori hash casuali) nel sheet — bg `var(--macro-tint)` + bordo `var(--macro-border)`; accent solo su `.cat-icon-wrap`, `.cat-speso` (importo speso `fmtEPlain(aVal,0)` sotto il nome) e barra progresso (normal=accent, warn `#f59e0b` >70%, over `#ef4444` ≥100%).
- **Badge budget**: `#macroSheetSubheader` + `.macro-budget-badge` ("Speso: X su Y disponibili" + mini progress bar), render in `renderMacroBudgetBadge(macroGroup)`.
- **Ultime spese**: `#macroSheetRecent` + `renderMacroRecentSpese(macroGroup)` (top 5 per data desc, actual>0 altrimenti planned, righe `.macro-recent-*`, blocco nascosto se vuoto).
- **Reset titolo**: colore accent in apertura; `''` in `slideToInputView`/`closeTransactionSheet`; ripristinato in `slideBackToCategories`.
- **Regola**: `fmtEPlain(n, 0)` già include " €" — NON aggiungere suffisso € nei template.

## 🎨 LIGHT PASTEL mobile — STATO ATTUALE: badge stacked, griglia auto-fit fluida (2026-08-11)
- **Card macro**: `.card-header` = `flex column; align-items:center; gap:4px` → **badge sopra, titolo centrato sotto** (MAI più position:absolute sul badge — sovrapposizioni risolte). `.card-title` `margin:0`, ellipsis nowrap. Corpo: `card-body` flex row space-between (icona `flex:0 0 25%` + glass). Padding card `clamp(8px,2vh,10px) 10px`.
- **Griglia micro-celle**: `.card-micro-grid` = `repeat(auto-fit, minmax(min(56px, 100%), 1fr))` + 2 righe max → wrap automatico (Svago full-width), 2 col sulle mezze card, **niente classi cols-2/cols-3** (rimosse). `min(56px,100%)` = difesa anti-esplosione a 320px (un 60px fisso rompeva).
- **Celle**: quadrate `clamp(32px,10vw,42px)` + `aspect-ratio:1/1`, solo icone FA (`faIconFor` → `FA_ICON_MAP`/`MACRO_FA`/`fa-tag`), MAI testo nelle celle (regola assoluta: il nome ha causato il bug overflow a lista). `.micro-more` = solo `⋯`.
- **Hub Mese/Future**: bottoni `flex:1 1 0` + `gap: clamp(6px,1.8vw,8px)`.
- **Fallback**: `html{overflow-x:hidden !important}` nel blocco 767.
- **Colori invariati**: Casa `#B2DFDB`/`#004D40`/badge `#80CBC4`; Veicoli `#C8E6C9`/`#1B5E20`/`#A5D6A7`; Svago `#E1BEE7`/`#4A148C`/badge `#4A148C`+bianco. Body gradiente `#E0F2F1→#FFF3E0→#E8F5E9` + `background-attachment:fixed`; hero panna `rgba(255,255,255,0.6)`; KPI `repeat(3,1fr)` (`heroEntrateTotal`/`heroSpesePreviste`/`heroSpeseSostenute`); insight fade 250ms (`heroInsightFadeT`).
- **Banner gialli RIMOSSI** (pill oro + deadlineAlert); `annualMonthAlert` blu INVARIATO; `.month-head` nascosto ≤767; label corretta "Casa e Utenze" (nessun typo).

## 🎨 LIGHT PASTEL mobile — FIX v2: micro-categorie SOLO icone FA quadrate + card ristrutturate (2026-08-11, SOSTITUITO da badge stacked + auto-fit qui sopra)
- **Celle micro = solo icone FontAwesome, MAI testo**: `renderMacroCards` genera `<i class="fas fa-...">`; la cella è QUADRATA rigida (`width/height:42px; aspect-ratio:1/1; flex center`, bg `rgba(255,255,255,0.5)`). Testo label + `+N altre` RIMOSSI (solo `⋯` nel more-cell). Se rivedi la griglia: MAI reintrodurre nomi testuali nelle celle (causa del bug overflow a lista).
- **Icone**: `FA_ICON_MAP` (20 default by name) + `MACRO_FA` fallback + `faIconFor(cat,macro)` → `fa-tag` per custom. `categoryIconMap` emoji RESTA per lista voci/registri/`getCatIcon` — non toccare.
- **Griglia rigida**: `.card-micro-grid.cols-2{repeat(2,1fr)}` / `.cols-3{repeat(3,1fr)}`, `gap:6px; justify-items:center; align-content:center`; classe scelta in `renderMacroCards` (≤4 → 2 col, 5/6 → 3 col). `.card-glass` QUASI INVISIBILE: `rgba(255,255,255,0.15)` + bordo 0.2 + radius 12 + padding 6 (niente blur).
- **Layout card macro**: `.dash-card{position:relative; overflow:hidden}`; titolo `h3.card-title` CENTRATO (`margin:0 0 12px`); badge ASSOLUTO `top:12px; right:10px`; `card-body` flex row `space-between; overflow:hidden` = icona `flex:0 0 25%` + glass; `.dash-card > *{min-width:0;max-width:100%}`. Padding card: `clamp(8px,2vh,10px) 10px`.
- **Colori card invariati**: Casa `#B2DFDB`/`#004D40`/badge `#80CBC4`; Veicoli `#C8E6C9`/`#1B5E20`/badge `#A5D6A7`; Svago `#E1BEE7`/`#4A148C`/badge `#4A148C`+bianco. Fill progress `#10b981`/warn `#f59e0b`/over `#ef4444`, track `rgba(0,0,0,0.12)`.
- **Body ≤767**: gradiente `135deg #E0F2F1→#FFF3E0→#E8F5E9` + `background-attachment:fixed`; hero card panna `rgba(255,255,255,0.6)`, KPI griglia `repeat(3,1fr)` (`heroEntrateTotal`/`heroSpesePreviste`/`heroSpeseSostenute`), insight fade 250ms (`heroInsightFadeT`), pill `rgba(255,255,255,0.8)`.
- **Banner gialli RIMOSSI** (pill oro + deadlineAlert): `annualMonthAlert` (scadenze annuali, blu) INVARIATO. `.month-head` resta nascosto ≤767.

## 🎨 LIGHT PASTEL THEME mobile — hero panna KPI 3-colonne + macro-card 2 colonne (2026-08-11, SOSTITUITO dal FIX v2 qui sopra)
- **Palette ≤767**: `body` mobile = gradiente `linear-gradient(135deg,#E0F2F1,#FFF3E0,#E8F5E9)` + `background-attachment:fixed`; testo scuro ovunque su pastello; niente testo bianco tranne il badge LIFESTYLES (`#4A148C` su `#E1BEE7`). Desktop col `--bg` invariato.
- **`#mobile-hero-card`**: panna `rgba(255,255,255,0.6)` + bordo `rgba(255,255,255,0.7)`, testo `#111827/#1F2937`. KPI = **griglia `repeat(3,1fr); gap:8px`**: `heroEntrateTotal` / `heroSpesePreviste` (+`openRendicontoPopup('previsto')`) / `heroSpeseSostenute` — `updateUI` scrive tutti e 3. Pillole interne (`hero-month-pill`/`hero-insight-pill`/`hero-mini-pill`): `rgba(255,255,255,0.8)` + bordo leggero + testo scuro.
- **Insight rotante**: invariato (`renderHeroInsight` regole locali, interval 4s, tap next + pausa 6s) + **fade-in-out** via `showHeroInsight` (opacity 0 → 250ms → testo + opacity 1, `heroInsightFadeT` con clearTimeout anti-race); CSS `transition:opacity 0.25s ease`.
- **Macro-card 2 colonne rigide**: `.card-body{flex row; align-items:center; gap:12px; flex:1; min-width:0}` = icona sx `flex:0 0 25%` (clamp 28-42px) + glass dx `flex:1; min-width:0` (`rgba(255,255,255,0.5)` + bordo `rgba(255,255,255,0.8)`). Micro-grid `repeat(auto-fit,minmax(60px,1fr)); gap:6px`, `.micro-cell` glass bianco, nome scuro ellipsis. Footer = progress full-width fuori dal flex. **Colori**: Casa `#B2DFDB`/`#004D40`/badge `#80CBC4`; Veicoli `#C8E6C9`/`#1B5E20`/badge `#A5D6A7`; Svago `#E1BEE7`/`#4A148C`/badge `#4A148C`+testo bianco. Fill progress: `#10b981`/warn `#f59e0b`/over `#ef4444`, track `rgba(0,0,0,0.12)`.
- **Banner gialli RIMOSSI** (nessun residuo nel codice): pill oro `#upcoming-payments-pill` (`renderUpcomingPayments` eliminata) e `#deadlineAlert`/`.deadline-alert` (blocco alerte uscite pianificate + CSS + regola desktop). `#annualMonthAlert` (scadenze annuali, blu) INVARIATO.
- **`.month-head` resta NASCOSTO ≤767** (hero sostituisce le KPI box; desktop invariato, `updateUI` scrive entrambi i set `sum*` + `hero*`).
- **Overlay sheet ≤767**: `rgba(0,0,0,0.35)` + `blur(10px)`.

## 📱 Mobile tab Mese v2 — HERO card + badge card + pill pagamenti (2026-08-11, SOSTITUITO dal tema LIGHT PASTEL: dark hero → panna, pill oro rimossa, macro-card ristrutturate)
- **`#mobile-hero-card`** (solo ≤767, `.hide-desktop`, primo figlio del tab, `flex-shrink:0`): gradiente `#0F172A→#1E293B`, radius 24px. Titolo "Riepilogo" + `heroMonthPill` (mese cliccabile → picker; `setupMonthNavigation` bindato, `updateMonthDisplay` scrive `heroMonthDisplay`) + `heroInsightPill` (glass `rgba(255,255,255,.12)` blur 12px, **rotazione 4s** tra le 5 regole locali di `renderHeroInsight`, tap = next + pausa 6s, stop su hidden) + 2 mini-pill `heroEntrateTotal`/`heroSpeseSostenute` (onclick `openRendicontoPopup('entrate'|'sostenuto')`).
- **`.month-head` NASCOSTO ≤767** (le box KPI mobili rimpiazzate dal hero; su desktop il month-head + `sumEntrate/sumPrevisto/sumSostenuto` restano attivi e `updateUI` scrive ENTRAMBI i set). NON ripristinare il month-head mobile.
- **Carousel standalone RIMOSSO** (`renderAIInsightSlides`/`aiInsightTrack/Dots`/loop non esistono più): oggi c'è `renderHeroInsight()` + `showHeroInsight`/`nextHeroInsight`/`startHeroInsightLoop`/`stopHeroInsightLoop`/`scheduleHeroInsightResume` (globals `heroInsight*`). Se serve il vecchio carousel, rifare da zero.
- **Macro-card v2 (sostituite)**: badge pill top-right statici Gestione/Flotta/Lifestyles, titolo sx, `.card-hero-icon` grande (clamp 24-36px) sx sotto il titolo; gradienti: Casa `#0E4B56→#1B6B78`, Veicoli `#2E8B57→#4CAF50`, Svago `#3B1E7B→#5E2B97`. `.card-glass` = `rgba(255,255,255,0.15)` + `blur(12px)` + radius 16px.
- **`#upcoming-payments-pill`** (oro `#E5B83B`, tra griglia e hub, `flex-shrink:0`): `renderUpcomingPayments()` = spese in sospeso + scadenze annuali non pagate del mese (`annualDeadlines`); `display:none` se N=0. **RIMOSSA nel tema Light Pastel.**
- **Overlay sheet ≤767**: `rgba(0,0,0,0.35)` + `backdrop-filter:blur(10px)`.

## 📱 Mobile tab Mese v1 — Macro-card glass 2x3 + AI Insight carousel (2026-08-11, SOSTITUITO da v2: hero card)
- **`.dash-card`**: titolo+icona inline, `.card-glass` (`rgba(255,255,255,.12)`+blur(10px), `flex:1; min-height:0`), `.card-progress` in fondo. `.card-micro-grid` = **SEMPRE 2×3 celle senza scroll**: ≤6 cat → tutte; >6 → prime 5 + badge `⋯ +N altre`; 0 → `micro-empty`. Regola da rispettare: MAI scroll interno alle card (zero-scroll invariato).
- **`renderMacroCards()`**: da `userMacroCategories[macro]` + `categoryIconMap` (emoji fallback 📌), totals da `currentData.expenses` via `catSet`; fill `.fill-warn` (≥80%)/`.fill-over` (sforato); label `Budget {title}: speso / previsto`. `MACRO_CARD_META` = alias titoli. Hook: `updateUI()` DOPO i 3 KPI (riga ~3027). Click card/badge → `openBottomSheetFromMacro` (delegation invariata).
- **AI Daily Insight (`#ai-insight-carousel`, solo ≤767, `display:none` ≥768)**: carousel `scroll-snap-type:x mandatory` (pill 86%), dots, auto 4s, pausa su pointerdown + resume 6s (`startAIInsightLoop`/`stopAIInsightLoop`/`scheduleAIInsightResume`, flag `aiInsightWired` per eventi una sola volta, stop su `document.hidden`). `renderAIInsightSlides()` = **solo matematica locale** (5 regole: miglioramento cat vs mese prec. / media giornaliera macro / proiezione lineare fine mese / sforo budget / onboarding). Chiamata in `updateUI` (fire-and-forget, è async per il prev month via `getPreviousMonthStrings(month,1)[0]`).
- **I.A. vera = popup `#iaMonthPopup`** (pulsante pill "Assistente I.A."): `runIaMonthAnalysis` include ora blocco "Dati mese precedente" + variazioni % (`pctDiff`/`fmtDiff`), resoconto max 6 righe richiesto nel prompt → `callAIEndpoint` (OpenRouter).
- **Overlay bottom sheet mobile**: `.sheet-overlay.open` ≤767 = `rgba(0,0,0,0.3)` + `backdrop-filter:blur(8px)` (desktop invariato).

## 📱 Body lock: `sheet-open` vs `popup-open` (2026-08-11)
- **`body.sheet-open`** = SOLO bottom sheet veri (transaction/edit/income/macro/future): include `touch-action:none` (obbligatorio per il drag via Pointer Events). NON applicare ai popup.
- **`body.popup-open`** = popup/modal (condivise, search, IA mese, IA note, settings, rendiconto, invest add/asset): lock `overflow:hidden` + height SOLO, niente touch-action → lo scroll touch interno ai popup funziona.
- **Mappa 25 occorrenze**: 9 coppie popup → `popup-open`; sheet → `sheet-open` (677/703, 765→703, 823/838, 2008→703, 4331/4345); `switchTab` rimuove entrambe. Se aggiungi un nuovo popup usa `popup-open`, mai `sheet-open`.

## 📱 Mobile Layout — ZERO-SCROLL + PROPORZIONALE (2026-08-11, STATO ATTUALE)
- **La pagina mobile non scrolla MAI**: ≤767px `html{height:100%}` `body{height:100dvh;overflow:hidden}`; `.container{height:calc(100dvh - var(--header-h,60px)); padding-bottom:var(--nav-h-mobile)}` con `--header-h:60px` e `--nav-h-mobile:calc(71px + env(safe-area-inset-bottom))` in `:root` (il contenuto finisce ESATTAMENTE sopra la bottom-nav, safe-area inclusa). `.tab-content.active{height:100%;overflow:hidden}` → scroll solo nei menu interni (`flex:1; min-height:0; overflow-y:auto`).
- **Tutti i tab vincolati**: Mese/Analisi/Future/Invest = `height:100%` (via container, NON più formule `100dvh-60-60-safe` o `100dvh-76`); `#settings-tab.active` = `height:100%` + `overflow-y:auto` (scroll interno tab).
- **Card macro (tab Mese)**: `.mobile-dashboard-container{grid-template-rows:repeat(2,minmax(0,1fr))}`, `.dash-card{min-height:0;height:100%}` + clamp vh/vw su padding/icona/titolo → proporzionali a OGNI schermo, niente scroll forzato né buchi. `.card-svago` span 2, **senza** min-height 200px.
- **Impostazioni = griglia `.settings-tile` → popup `#settingsPopup-*`** (anche su desktop): id interni INVARIATI (`newCatName`/`btnSaveCategory`/`catList-*`/`count-*`/`ripetizioniList`/`pushNotifToggle`/`importFileInput`/`btnGDrive*`/`btnInstallApp`) → zero logica duplicata. `openSettingsPopup(name)`/`closeSettingsPopup(event)`; `switchTab` chiude i popup (rimuove `.active` + `sheet-open`). Niente più `.settings-col-left/right`.
- **Grid micro-categorie mobile**: NASCOSTA per decisione utente — regola esplicita `display:none !important` nel blocco 767 (vince sull'inline `container.style.display='grid'` di `renderCategoryGrid`); il menu del tab Mese sono le 3 card macro. NON ripristinare.
- **Popup body**: `.popup-body`/`.ia-notes-body`/`#condiviseBody` = `flex:1; min-height:0; max-height:none` dentro `.popup-panel` flex → scroll interno fluido, mai clip su schermi piccoli.
- **Rimossi**: `--nav-h:130px`, `.summary-pct`, `@media (max-width:400px)`, blocco legacy `@media (max-width:768px)` (MOBILE-ONLY DASHBOARD: dash-card 35px/50px/200px + category-grid none duplicata), `#nav-btn-add` (CSS+JS), `scrollToAddExpense`. Header mobile (sticky 60px bianco) ora vive nel blocco ≤767.

## 🖥️ Desktop Tab Mese — REFACTOR RADICALE (2026-08-11, L'ULTIMO STATO)
- **Shell ≥1200px = griglia CSS, niente più sidebar**: `body{overflow:hidden}` + `.container{height:calc(100dvh-56px)}`; `#current-month-tab.active` = `display:grid; grid-template-columns:260px minmax(0,1fr) 320px; grid-template-rows:auto auto minmax(0,1fr)`: riga1 alert (1/-1), riga2 `.month-head` SOLO in colonna centrale (il DOM resta figlio del tab! posizionato SOLO via grid), riga3 `.main-layout` (griglia 3col). Altri tab scrollano dentro l'height. Media 1600px → `repeat(5,1fr)` (max 5 colonne). Fallback impilato 768-1199 intatto.
- **`.header` (vecchia barra) e `.bottom-nav` ora sono `display:none` su desktop** (prima erano la "sidebar" fantasma sotto la navbar): `.header{display:none}` ≥768, `.bottom-nav{display:none}` base. Non ripristinarli. CSS morti rimossi: `.navigation-tabs/.tab-button/.add-button/.nav-spacer`.
- **Pill mese centrale tra 2 KPI-cluster**: `.kpi-cluster{display:contents}`; month-head flex; sx = Entrate+Previste, dx = Sostenute; pill `flex:1` (centrata esatta). MOBILE: `display:contents` degrada a ordine pill→3 box, pill `flex:1 1 100%`. **Risparmio RIMOSSO** (`#summaryRisparmio`, `#sumRisparmio`, `#sumRisparmioPct`, `.box-risparmio`, `.summary-pct` — non esistono più; niente write da `updateUI`).
- **Card categorie desktop = arco SVG mezza luna, NO Chart.js**: `gaugeArcSVG(pct,color)` → path `M 10 50 A 40 40 0 0 1 90 50` (viewBox 100×50), `stroke-dasharray=pct·125.66/100`, `stroke-linecap="butt"` (round=punta fantasma a 0% → non usare), lunghezza fissa LEN=125.66. Colori stato: verde #10b981 / ambra #f59e0b (pct>80) / rosso #ef4444 (sforato). Sotto l'arco: 1 riga `Speso / Budget` (budget rosso se sforato) + badge `⚠ Sforato di X`. Icona in `.cat-arc-icon` (top:56%, 18px, nel cavo: band interna y=14.5, icona y≈17-38). Carta vuota → arco grigio `— / —`.
- **CatSums**: `renderCategoryGridDesktop(catSums)` usa gli stessi `catSums` di `updateUI`; chiamata SOLO con griglia visibile; click card → `filterByCategory(cat)`.
- **Form desktop = parity col bottom sheet**: Entrata con `#incDate` (default oggi). Spesa con `<details class="form-advanced">`: pills Tipo (`[data-exp-type]` prevista teal/sostenuta rossa) + **Spesa Condivisa completa con id Desktop** (nessuna collisione col sheet): `#sharedToggleDesktop`, `#sharedPersonDesktop` (persona o gruppo `g_`), `#payerThemLblDesktop`, `#sharedDetailFieldsDesktop` + `#sharedPctDesktop`/`#sharedFixedDesktop`/`#sharedPreviewDesktop` (creati dinamicamente da `updateSplitFieldsDesktop`), `#btnNewPersonDesktop`. Wiring: `setupSharedPanelDesktop()` chiamato in `initApp` DOPO `setupSharedToggle()`. `addExpense`: quote come `saveSharedSplits(exp.id, otherPart, payer, selVal)`; pagatore "them" → `planned=myPart, actual=0` (mostra ⏳ Da pagare); salva `isShared/sharedPayer/sharedPersonId/sharedGroupId`; `resetExpenseAdvancedForm()` al salvataggio.
- **Registro nuovi stub**: `.reg-left/.reg-dot` (pallino 30px `getCategoryCardBg(cat)`)/`.reg-main/.reg-title/.reg-shared-pill/.val-pending` (ambra ⏳); entrate = dot verde 💰; sort `localeCompare` su stringa data (legacy senza data → `–`); `#overviewTableFoot` RIMOSSO (niente striscia risparmio).
- **IA & Note**: pulsante in fondo colonna destra `.ia-quick-card`/`.ia-quick-trigger` → apre `#iaNotesModal` (che contiene HUB IA + Note + `#budgetChart`/`#categoryChart`; canvas hidden = Chart.js a dimensione 0 → `renderDashboardCharts` SOLO a modal aperto).
- **Cleanup**: `renderImportChecklist`/`copyFromPreviousMonth` RIMOSSI definitivamente (con le 3 chiamate); HTML bilanciato (era sbilanciato di 1 div in HEAD → aggiunto `</div>` prima di `<!-- END MAIN APP WRAPPER -->`).
- **Pianificazione Ciclo / macro gruppi**: RIMOSSI dal desktop (`currentViewMode`/`activeMacroGroup`/`setupViewToggle`/`overviewTableBody` = stati morti, non usare).
- **Settaggi richiamati ma assenti da HTML** (id pre-esistenti, null-guard, by design): `aiModelGroup`, `geminiApiKeyInput`, `depositAmount`, `savingsGoalsList`, ecc.

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
- **2026-08-11**: Cartella `legacy_version/` RIMOSSA (tutte le feature importate, ROADMAP 7/7 completata) — nessuna reference nel codice attivo; i doc storici (ROADMAP/CHANGELOG/migrations) la citano solo a scopo storico.
- **2026-08-11**: Swipe-to-close bottom sheet riscritto — `setupSheetSwipe(sheetId, closeFn)` generica (Pointer Events touch+mouse, `setPointerCapture`, `translate3d`, clamp delta≥0); wiring su `#bottomSheet`/`#incomeBottomSheet`/`#futureBottomSheet`; chiusura fluida via transizione CSS (si rimuove `.dragging`+`.open` e si libera la transform inline nello stesso frame → anima da delta a 100%). `closeFutureSheet` pulisce ora `transform`/`.dragging`. CSS: `.bottom-sheet-header { touch-action: none }` + `will-change: transform` su `.dragging`.
  - **Regola**: i selettori dei drag target devono essere SCOPED al singolo sheet (`sheet.querySelector(...)`), mai query globali (prima prendeva l'handle del primo sheet nel DOM).
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

## REGOLA RESPONSIVE: container glass micro-categorie (2026-08-12)
- **MAI** height fisse nella catena .card-body > .card-glass > .card-micro-grid > .micro-cell/.micro-more/.micro-empty (causa taglio icone top/bottom su schermi corti). Tutto height:auto (contenuto definisce).
- .card-glass (STYLE.CSS 1110, blocco 767): padding: 8px 6px (respiro verticale), overflow: visible (mai clip). .card-body overflow visible.
- Icone micro: lex-shrink:0 su .micro-cell i, .micro-more, .micro-empty + clamp() espliciti.

## PREVISIONE SPESE (badge macro + hero) - regola 2026-08-12
- getCategoryForecasts() (script.js): per OGNI categoria -> planned mese corrente se >0, altrimenti actual del mese precedente (query db.expenses.where('month').equals(prev))
- Badge bottomsheet 'Speso X su Y previsti': Y = somma previsioni delle categorie della macro. Rosso SOLO se previsti>0 e actual>previsti; previsti=0 -> barra neutra (MAI rossa)
- Hero 'Spese Previste': stessa regola su tutte le categorie (getCategoryMacroGroup ha fallback = tutte le categorie coperte)
- openBottomSheetFromMacro e enderMacroBudgetBadge sono async (await su db)
- Bottomsheet grid: max-height none + card compatte (10px 6px, icona 1.3rem) -> 9 container sempre fissi

## REGOLA: IMPORT O SPESA = INPUT TESTO, MAI RUOTE (2026-08-12)
- Il bottomsheet spesa usa #amountInput (type=text, inputmode=decimal -> tastierino decimale nativo, virgola ok) + span .currency-symbol � a destra. MAI piu' .wheel-* / hiddenIntegerInput / initNativeWheels / selectedInteger (rimossi da DOM, CSS e JS).
- Leggere l'importo SEMPRE con getSheetAmount() (virgola->punto, parseFloat, >0).
- #btnNoteCamera / #btnNoteAttach = placeholder (logica foto/allegato futura).
- Spazi compact sheet: gap 12/8, footer mt 10, header mb 8. Live preview Dividi su input importo.

## REGOLA: BOTTOM SHEET SPAESE - HEADER/FOOTER FISSI (2026-08-12)
- .bottom-sheet = flex column + overflow hidden (max-heigh 85vh); .sheet-slider flex:1 min-height:0; SOLO .sheet-body (view input) e #viewCategories scorrono (overflow-y auto).
- .sheet-footer e' sibling del .sheet-body dentro #viewInput -> fisso in basso, padding-bottom env(safe-area-inset-bottom).
- Toggle recurring/shared: flex align-center gap 12px margin-top 8px. Input sheet: padding 12px 16px radius 12px.

## REGOLA: CONTAINER MICRO-CATEGORIE CARD MACRO = TRASPARENTE (2026-08-12)
- .card-glass e' totalmente trasparente: background transparent, border none. Mantiene solo padding e margin per allineamento griglia icone.

## SPESE CONDIVISE V2 - MODELLO E DASHBOARD (FASE 1, 2026-08-12)
- Nuove tabelle: shared_expenses (id, expense_id, group_id, total_amount, split_method, created_by, created_at) e shared_expense_participants (id, shared_expense_id, person_id, participant_name, share_amount, paid_amount, split_value, created_at).
- Tabella group_invites per token di invito; funzione Supabase join_group_with_token(token, member_name).
- Colonne people.user_id/email, groups.invite_token/created_by, group_members.user_id/member_name.
- calculateBalances() = net = paid - share; getSimplifiedDebts() = greedy settlement.
- Dashboard: tab Amici/Gruppi, avatar iniziali + colore deterministico, saldi verde/rosso/grigio.
- Link invito gruppo: window.location.origin + '?join_group=' + token.
- Migration automatica da vecchia shared_expense_splits al nuovo schema (flag in settings).
- Payer multiplo e split avanzati: FASE 2.
