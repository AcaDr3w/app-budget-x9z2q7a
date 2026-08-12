# Session Logs & Progress

## [2026-08-12] - Bottom Sheet Macro-Categorie ridisegnato: altezza dinamica, tema cromatico per macro, badge budget + ultime spese

### ✅ Completed Changes
- **Altezza dinamica**: `.bottom-sheet` da `height:85dvh` fissa → `height:auto; max-height:85vh; overflow-y:auto` (fine del vuoto in basso; il form spesa ora scrolla l'intero sheet). `.bottom-sheet-grid` `max-height: 60vh` → `46vh`.
- **Tema cromatico per macro** (nuovo const `MACRO_THEME` in script.js): CSS vars `--macro-accent/--macro-tint/--macro-border` settate su `#bottomSheet` in `openBottomSheetFromMacro`. Casa/Utenze ottanio `#2a9d8f`, Veicoli verde `#7bc043`, Spese e Svago viola `#6f42c1`.
- **Micro-card unificate**: rimosso `card.style.background = getCategoryCardBg(cat)` (colori casuali hash) → sfondo `--macro-tint` + bordo `--macro-border` neutri; colore tematico solo su icona, importo e barra progresso (stati warn `#f59e0b`/over `#ef4444` invariati, normal = accent macro).
- **Importo speso nelle micro-card**: nuovo `.cat-speso` sotto il nome (`fmtEPlain(aVal,0)` es. "14 €").
- **Badge budget header**: nuovo `#macroSheetSubheader` + `.macro-budget-badge` ("Speso: X su Y disponibili" + mini progress bar accent, over/warn semantiche).
- **Ultime spese**: nuovo `#macroSheetRecent` + `renderMacroRecentSpese(macroGroup)` — top 5 movimenti della macro (actual>0 altrimenti planned), sort data desc, righe con icona FA, categoria, desc, data gg/mm, importo accent; blocco nascosto se vuoto.
- **Titolo sheet**: colorato con accent macro in apertura, reset in `slideToInputView`/`closeTransactionSheet`, ripristino in `slideBackToCategories`.

### ⚙ Status: COMPLETATO
- `node --check` OK; braces CSS 710/710; `getCategoryCardBg` resta (usata da `.reg-dot`).

---

## [2026-08-11] - Refactoring Responsive UI fluida: badge stacked sopra titolo (zero sovrapposizioni), griglia auto-fit con celle fluide clamp, hub flessibile flex:1 1 0

### ✅ Completed Changes (SOLO mobile, blocco ≤767)
- **Badge/titolo separati semanticamente**: nuovo `.card-header` (`flex column; align-items:center; gap:4px`) con badge sopra e titolo centrato sotto → **mai più sovrapposizioni** (badge prima era `position:absolute`; ora statico). `card-title` `margin:0` (gap dal header), ellipsis anti-troncamento invariato.
- **Griglia micro-celle adattiva (wrap)**: `.card-micro-grid` = `grid-template-columns: repeat(auto-fit, minmax(min(56px, 100%), 1fr))` + `grid-template-rows: repeat(2, minmax(0, 1fr))` → wrap automatico sulle card larghe (Svago full-width), 2 colonne su quelle strette (Casa/Veicoli), mai overflow (il `min(56px,100%)` evita l'esplosione del 60px fisso a 320px). RIMOSSE classi runtime `cols-2`/`cols-3` (JS sempre `card-micro-grid`).
- **Celle fluide quadrate**: `.micro-cell`/`.micro-more` = `clamp(32px, 10vw, 42px)` + `aspect-ratio:1/1`; icone `clamp(13px,4vw,16px)`, `⋯` `clamp(14px,4.5vw,18px)`. Niente più 42px fissi.
- **Hub flessibile**: `#mese-action-hub button`/`#futureActionHub button` → `flex: 1 1 0` esplicito (crescita/restrizione equa, gap clamp invariato).
- **Fallback overflow**: `html { overflow-x: hidden !important; }` nel blocco mobile (body già `overflow:hidden`).
- **Contenitori già fluidi** (verificato, nessuna modifica): hero card e dash-card `width:100%`/grid `1fr`, padding/gap `clamp()`/%; KPI 3-colonne e insight fade invariati.
- **Typo check**: "Casa e Utenze" corretto ovunque (index:145, script:246/2049/2154/3566) — nessun "Casa e Utile" nel codice.

### ⚙ Status: COMPLETATO
- `node --check` OK; div 293/293; braces CSS 690/690; zero residui `cols-2`/`cols-3` nel codice (solo docs).

---

## [2026-08-11] - FIX overflow micro-categorie + card macro ristrutturate: solo icone FA in celle quadrate, titolo centrato, badge assoluto, glass quasi invisibile

### ✅ Completed Changes (SOLO mobile, blocco ≤767)
- **BUG FIXED — overflow a lista verticale**: celle prima `micro-emoji`+`micro-name` (testo nowrap su minmax 60px) spingevano la griglia fuori dal glass. Ora **SOLO icone**: `<i class="fas fa-...">` vettoriali (FontAwesome 6.5.0 già caricato), **nessun testo** nel render.
- **Map FA**: `FA_ICON_MAP` (20 categorie predefinite → icone FA: basket-shopping, droplet, building, fire, bolt, trash, phone, pump-soap, house-chimney, gas-pump, motorcycle, screwdriver-wrench, file-invoice-dollar, shirt, paw, book-open, champagne-glasses, briefcase-medical, box) + `MACRO_FA` fallback per macro (`fa-house`/`fa-car`/`fa-cart-shopping`) + helper `faIconFor(cat,macro)` (custom → `fa-tag`). Dati reali da `userMacroCategories` (categoriaIconMap emoji resta per lista voci/registri, NON usata qui).
- **Cella quadrata**: `.micro-cell` = `width/height 42px; aspect-ratio:1/1; flex center;` bg `rgba(255,255,255,0.5)` + bordo 0.8, icona 16px `color:inherit`. `.micro-more` = stesso quadrato, `⋯` solo (testo "+N altre" RIMOSSO).
- **Layout card**: titolo `card-title` CENTRATO (`text-align:center; width:100%; margin:0 0 12px`) + **badge assoluto** `top:12px; right:10px` (.dash-card `position:relative; overflow:hidden`); `card-body` flex row space-between (icona `flex:0 0 25%` + glass) `overflow:hidden; min-width:0`; `.dash-card > * {min-width:0; max-width:100%}`.
- **Glass quasi invisibile**: `rgba(255,255,255,0.15)` + `border rgba(255,255,255,0.2)` + radius 12px + padding 6px (rimosso blur(12px) e 0.5/bordo 0.8 invasivi).
- **Griglia rigida**: `.card-micro-grid` + classi runtime `cols-2{repeat(2,1fr)}` / `cols-3{repeat(3,1fr)}` (`gap:6px; justify-items:center; align-content:center`); scelta in `renderMacroCards`: conteggio ≤4 → 2 colonne, 5/6 → 3. `micro-empty` invariato (✏️ Aggiungi categorie).
- **Padding compatti**: `.dash-card` `clamp(8px,2vh,10px) 10px`, gap interni ridotti, icona macro clamp 26-34px, progress footer full-width invariato (fill #10b981/warn #f59e0b/over #ef4444).

### ⚙ Status: COMPLETATO
- `node --check` OK; div 290/290; braces CSS 691/691; zero residui `micro-name`/`micro-emoji`/`card-title-row`/`more-text` (solo `card-title`).

---

## [2026-08-11] - LIGHT PASTEL THEME mobile: palette pastello, hero card panna con KPI 3-colonne, insight con fade, macro-card 2 colonne (icona+glass), rimossi banner gialli

### ✅ Completed Changes (SOLO mobile, blocco ≤767)
- **Palette "Light Pastel"**: `body` mobile = gradiente `linear-gradient(135deg,#E0F2F1,#FFF3E0,#E8F5E9)` (+ `background-attachment:fixed`); testo scuro su sfondi chiari ovunque; niente testo bianco tranne badge LIFESTYLES.
- **Hero card `#mobile-hero-card`**: da gradiente scuro a **panna semitrasparente** `rgba(255,255,255,0.6)` + bordo `rgba(255,255,255,0.7)`, testo scuro (#111827/#1F2937), shadow morbida. **KPI = griglia 3 colonne uguali** (`grid-template-columns:repeat(3,1fr); gap:8px`): Entrate Totali / **Spese Previste (NUOVO id `heroSpesePreviste`, onclick → `openRendicontoPopup('previsto')`)** / Spese Sostenute. Pillole interne (`hero-month-pill`, `hero-insight-pill`, `hero-mini-pill`) → `rgba(255,255,255,0.8)` + bordo leggero + testo scuro; focus-visible outline scuro.
- **AI Daily Insight**: stessa logica locale rotante (`setInterval` 4s, tap = prossimo + pausa 6s) ma **transizione fade-in-out** (`transition:opacity 0.25s ease` + `heroInsightFadeT` in `showHeroInsight`: opacity 0 → 250ms → cambio testo + opacity 1; `clearTimeout` anti-race con il tap).
- **Macro-card ristrutturate (layout a 2 colonne rigide)**:
  - `card-body` wrapper (`flex row; align-items:center; gap:12px; flex:1; min-width:0`): **icona macro a sinistra `flex:0 0 25%`** (più grande, clamp 28-42px), **glass a destra `flex:1; min-width:0`** (`rgba(255,255,255,0.5)` + `border:1px solid rgba(255,255,255,0.8)`).
  - Micro-grid → `repeat(auto-fit, minmax(60px,1fr)); gap:6px`; `.micro-cell` = `rgba(255,255,255,0.5)` + bordo bianco, emoji nativa + nome scuro con ellipsis; `.micro-more`/`.micro-empty` testo scuro.
  - **Colori**: Casa `#B2DFDB` + testo/icona `#004D40` + badge `#80CBC4`; Veicoli `#C8E6C9` + `#1B5E20` + badge `#A5D6A7`; Spese e Svago (full width) `#E1BEE7` + `#4A148C` + badge **`#4A148C` con testo bianco**.
  - Progress bar full-width fuori dal flex: track `rgba(0,0,0,0.12)`, fill `#10b981`, warn `#f59e0b`, over `#ef4444`, label scura.
- **Rimossi banner gialli "uscite pianificate"**: pill oro `#upcoming-payments-pill` (HTML/CSS/JS: `renderUpcomingPayments` + call in `updateUI`) e `#deadlineAlert` `.deadline-alert` (JS blocco "⏳ N uscite pianificate in attesa di saldo" + CSS + regola desktop riga 2990). `#annualMonthAlert` blu (scadenze annuali) INVARIATO.
- `updateUI` ora scrive anche `heroSpesePreviste` (stessa riga degli altri hero id).

### ⚙ Status: COMPLETATO + PUSHATO (`git push origin main`)
- `node --check` OK; braces CSS 692/692; 293 div HTML bilanciati; id unici senza duplicati; zero residui `upcoming`/`deadlineAlert` nel codice (solo docs).

---

## [2026-08-11] - Mobile tab Mese v2: hero card "Riepilogo" (insight rotante + mini-pill), card con badge/icona grande, pill pagamenti oro, overlay blur 10px

### ✅ Completed Changes (SOLO mobile, blocco ≤767)
- **Hero card `#mobile-hero-card`** (`.hide-desktop`, primo figlio del tab, `flex-shrink:0`): gradiente blu/antracite `#0F172A→#1E293B`, radius 24px, tutto `clamp()`. Contiene: titolo "Riepilogo" + **pill mese cliccabile** (`heroMonthPill`/`heroMonthDisplay` → apre il picker, binding aggiunto in `setupMonthNavigation`; `updateMonthDisplay` scrive anche il hero), **AI Insight rotante** (`heroInsightPill` glass `rgba(255,255,255,.12)`+`blur(12px)`, testo che ruota ogni 4s tra le 5 regole locali, tap = prossimo + pausa 6s, stop su `document.hidden`), **2 mini-pill** "Entrate Totali" (`heroEntrateTotal`) e "Spese Sostenute" (`heroSpeseSostenute`) con onclick → `openRendicontoPopup('entrate'|'sostenuto')`.
- **`.month-head` nascosto su mobile** (`display:none !important` nel blocco ≤767): le 3 box KPI sostituite dal hero (Previste visibile nelle barre budget). DESKTOP invariato (month-head + `sum*` restano attivi, `updateUI` scrive entrambi i set di id).
- **Carousel standalone RIMOSSO** (HTML/CSS/JS: `ai-insight-carousel`, `aiInsightTrack/Dots`, `renderAIInsightSlides`, loop/dots) → sostituito da `renderHeroInsight()` (stesse 5 regole locali, slide ora stringhe `icona+testo` in un'unica pill).
- **Macro-card**: badge a pillola top-right statici (Gestione/Flotta/Lifestyles) + titolo a sinistra + **icona grande** (`.card-hero-icon` clamp 24-36px, allineata a sinistra sotto il titolo) + nuovi gradienti: Casa `#0E4B56→#1B6B78`, Veicoli `#2E8B57→#4CAF50`, Svago `#3B1E7B→#5E2B97`. Glass aggiornato a spec: `rgba(255,255,255,0.15)` + `blur(12px)`, radius 16px. Micro-grid 2×3 + progress invariati (dati reali da `renderMacroCards`).
- **Pill "Prossimi Pagamenti"** `#upcoming-payments-pill` (oro `#E5B83B`, radius 99px, tra griglia e hub, `flex-shrink:0`): `N = spese in sospeso (planned>0, actual==0) + scadenze annuali non pagate del mese` (`annualDeadlines.filter(d => d.month===mese && !d.isPaid)` — stessa fonte di `checkAnnualAlertForCurrentMonth`); nascosta se N=0 (`renderUpcomingPayments`).
- **Action hub**: label "🔍 Ricerca Spese" e "👥 Condividi Budget" (data-action invariati).
- **Overlay sheet ≤767**: `rgba(0,0,0,0.35)` + `blur(10px)`.
- Fix minori: etichette hub Mese/Future riallineate (erano state cross-applicate in una sessione precedente).

### ⚙ Status: COMPLETATO
- `node --check` OK; braces CSS 689/689; 227 id unici (0 duplicati); zero residui `ai-insight`/`carousel` nel codice (solo docs). **Nessun commit/push.**

---

## [2026-08-11] - Mobile tab Mese: macro-card glassmorphism (2x3 + progress), AI Daily Insight carousel locale, IA "vera" nel popup mese + confronto col mese precedente

### ✅ Completed Changes (SOLO mobile, blocco ≤767)
- **Macro-card ridisegnate** (`#current-month-tab`): titolo con icona inline, **sub-container glass** `.card-glass` (`rgba(255,255,255,.12)` + `backdrop-filter:blur(10px)` + bordo 18%) al centro, **progress bar** in fondo. Griglia `.card-micro-grid` tassativa **2 righe × 3 colonne senza scroll**: ≤6 micro-categorie → tutte; >6 → prime 5 + badge 6° slot `⋯ +N altre` (dashed); 0 → "✏️ Aggiungi categorie". `renderMacroCards()` legge `userMacroCategories` + `categoryIconMap` (emoji, fallback 📌), calcola speso/budget per macro da `currentData.expenses`, fill con stati colore (`fill-warn` ≥80%, `fill-over` sforato), label `Budget {Macro}: speso / previsto` (fmtEPlain 0 dec). Click card O badge → stesso bottom sheet (delegation 2149-2154 invariata, il badge sta dentro la card).
- **AI Daily Insight = carousel locale** (`#ai-insight-carousel`, tra grid e action hub, `display:none` ≥768): pillole swipeable (`scroll-snap-type:x mandatory`, snap 86%), dots indicatori, **auto-avanzamento 4s** (`startAIInsightLoop` → scrollTo smooth; pausa su pointerdown, resume 6s dopo lo scroll; stop quando tab nascosto). `renderAIInsightSlides()` — 100% matematica locale, zero API: 1) 🎉 miglioramento categoria vs mese precedente, 2) 📅 media giornaliera macro più attiva, 3) 🚀/⚠️ proiezione lineare risparmio a fine mese (ritmo attuale × giorni restanti), 4) 🔥 superamento budget macro, 5) onboarding se nessun dato. Hook in `updateUI()` (riga 3027-3028, dopo i KPI). `MACRO_CARD_META` = alias titoli/icone delle 3 macro.
- **I.A. "vera" al clic**: label pill azione → "🤖 Assistente I.A." (apre sempre `#iaMonthPopup` esistente con `runIaMonthAnalysis` → `callAIEndpoint`/OpenRouter). `runIaMonthAnalysis` estesa: il prompt ora include **blocco "Dati mese precedente"** (entrate/spese previste+sostenute via `getPreviousMonthStrings(month,1)[0]`) con **variazioni %** (`pctDiff`, `fmtDiff` +n%/-n%/n/d) e richiesta esplicita di confronto (resoconto max 6 righe).
- **Overlay bottom sheet blur (solo ≤767)**: `.sheet-overlay.open` = `rgba(0,0,0,0.3)` + `backdrop-filter:blur(8px)` (regola desktop globale invariata).
- **Micro-polish**: `.dash-card` `justify-content:space-evenly` + padding clamp ridotti; hover `translateY(-1px)` + `:focus-visible` outline bianco sulle card (a11y, `role="button" tabindex="0"`).

### ⚙ Status: COMPLETATO
- `node --check` OK; div HTML 284/284; braces CSS 684/684; 222 id unici (0 duplicati); 25 occorrenze `sheet-open`/`popup-open` invariati. **Nessun commit/push.**

---

## [2026-08-11] - Fix: scroll touch bloccato nei popup (body.popup-open separato da sheet-open)

### ✅ Completed Changes
- **Bug preesistente risolto**: `body.sheet-open{touch-action:none !important}` (necessario per il drag del bottom sheet) veniva applicato anche a TUTTI i popup/modal → scroll touch impossibile dentro i popup su mobile (liste categorie/Ripetizioni dei nuovi popup Impostazioni sarebbero state inutilizzabili).
- **Nuova classe `body.popup-open`** (style.css, accanto a `sheet-open`): lock solo `overflow:hidden` + `height` (niente `touch-action:none`/`overscroll-behavior`/`-webkit-overflow-scrolling:none`). Braces 653→654.
- **9 coppie open/close convertite a `popup-open`** in script.js: condivise (1352/1359), search (3281/3296), IA mese (3386/3394), IA note modal (3404/3420), settings popup (3430/3435), rendiconto (3565/3572), invest add (3872/3878), invest asset (3929/3936).
- **`sheet-open` resta SOLO sui bottom sheet reali** (drag richiede touch-action:none): transaction (677/703), edit expense (765→703 via `closeTransactionSheet`), income (823/838), macro sheet (2008→703), future (4331/4345).
- **`switchTab` (481)** ora rimuove entrambe le classi (`remove('sheet-open','popup-open')`).

### ⚙ Status: COMPLETATO
- `node --check` OK; 25 occorrenze riclassificate (9 popup pairs `popup-open`, 6 sheet `sheet-open`, 1 switchTab dual-clear); braces CSS 654/654. **Nessun commit/push.**

---

## [2026-08-11] - Refactoring layout mobile: zero-scroll di pagina, proporzionalità clamp(), Impostazioni a popup

### ✅ Completed Changes
- **Zero-page-scroll system (≤767px)**: `html{height:100%}` + `body{height:100dvh;overflow:hidden}` → la pagina non scrolla MAI; `.container` = `height:calc(100dvh - var(--header-h,60px))` + `padding-bottom: var(--nav-h-mobile)` (71px+safe-area) → i tab ereditano `height:100%`. Scroll SOLO dentro i menu interni (`flex:1; overflow-y:auto`). Nuove variabili in `:root`: `--header-h:60px`, `--nav-h-mobile:calc(71px + env(safe-area-inset-bottom))`; rimossa `--nav-h:130px` (morta).
- **Fissate 3 formule di altezza incoerenti**: Mese usava `100dvh-76` (senza safe-area → banda vuota sopra la nav, contenuto sotto il notch), Analisi/Future/Invest usavano `100dvh-60-60-safe` (~12px di contenuto sotto la nav) → tutte ora `height:100%` derivata dal container. `#settings-tab` allineato (height 100% + overflow-y auto interno).
- **Proporzionalità `clamp()`**: `.mobile-dashboard-container{grid-template-rows:repeat(2,minmax(0,1fr))}` + `.dash-card{min-height:0;height:100%}` → le 3 card macro riempiono SEMPRE lo spazio (zero scroll forzato, zero buchi su schermi grandi); paddings/icone/titoli `clamp(vh/vw)`. Idem: pill mese, KPI summary, action hub Mese/Future, bottom-nav (label `clamp` + `white-space:nowrap` + ellipsis per evitare wrap che alza la nav), proj-card, hero investimenti.
- **Popup robusti**: `.popup-body` → `flex:1; min-height:0; max-height:none` (prima `max-height:65vh` fisso poteva sbordare il panel su schermi piccoli); idem `.ia-notes-body` (62vh) e `#condiviseBody` (55vh inline rimosso); `.popup-bars` flessibile.
- **Impostazioni = pulsanti → popup (mobile E desktop)**: griglia `.settings-tile` (6 card: Categorie, App & Notifiche, Backup, Cloud, Ripetizioni, Zona Pericolo) con icona+titolo+descrizione+freccia e hover/active/focus-visible; contenuti spostati in 6 popup `#settingsPopup-*` dentro il tab con **id interni invariati** (zero duplicazione logica JS). Nuove `openSettingsPopup(name)`/`closeSettingsPopup(event)`; `switchTab` chiude i popup settings (overlay `.active` dentro tab nascosto riapparirebbe aperto). Rimossi `.settings-col-left/right`.
- **Cleanup**: eliminato blocco legacy `@media (max-width:768px)` "MOBILE-ONLY DASHBOARD" (`.dash-card` 35px/50px/200px in conflitto col blocco 767, `.category-grid-mobile display:none !important` duplicata) → header mobile pulito nel blocco 767; rimosso `@media (max-width:400px)` (fuso nei clamp), `.summary-pct`, `body{padding-bottom:100px}`, `.container{padding-bottom:130px}`, `#nav-btn-add` (CSS+JS), `scrollToAddExpense` (morto).
- **Nota (decisione utente)**: griglia micro-categorie mobile confermata NASCOSTA — regola esplicita `display:none !important` nel nuovo blocco (vince sull'inline di `renderCategoryGrid`); il menu del tab Mese restano le 3 card macro.

### ⚙ Status: COMPLETATO
- `node --check` OK, braces CSS 653/653, stack HTML bilanciato, 210 id unici (zero duplicati). **Nessun commit/push.**

---

## [2026-08-11] - Refactoring radicale desktop Tab Mese: pill centrata, card ad arco SVG, split completo, cleanup legacy

### ✅ Completed Changes
- **Bug "sidebar verticale" risolto**: non esisteva una sidebar — gli artefatti sotto la navbar erano la vecchia barra `.header` (mai nascosta ≥768) e la nav mobile `.bottom-nav` (nessuna regola CSS base → renderizzata come striscia di link su desktop). Ora: `.header { display:none }` ≥768, `.bottom-nav { display:none }` base (compare solo ≤767), rimossi CSS morti `.navigation-tabs/.tab-button/.add-button/.nav-spacer`.
- **Pill mese VERA centrale**: `.month-head` ristrutturato con 2 `.kpi-cluster` (`display:contents`) — sinistra `[Entrate][Previste]`, destra `[Sostenute]`, pill `flex:1` al centro esatto. **Risparmio rimosso** (`#summaryRisparmio` + `#sumRisparmio`/`#sumRisparmioPct` + CSS `.box-risparmio`/`.summary-pct` + write in `updateUI`). Mobile: ordine identico (pill → 3 box) via `display:contents` + pill 100%.
- **Tab Mese = griglia CSS ≥1200px**: `#current-month-tab.active` = grid `260px | 1fr | 320px`, righe `auto auto 1fr` → alert row1 (1/-1), `.month-head` row2 **solo colonna centrale**, `.main-layout` row3 (griglia interna 3 colonne). `body{overflow:hidden}` + `.container{height:calc(100dvh-56px)}` + altri tab a scroll interno. Fallback impilato 768-1199 intatto.
- **Card ad arco a mezza luna SVG** (Chart.js eliminato dalla griglia, ~20 gauge risparmiati per render): `gaugeArcSVG()` path `M 10 50 A 40 40 0 0 1 90 50` stroke 9, progress `stroke-dasharray = pct/100·125.66`, `linecap:butt` (niente finto punto a 0%), colori stato verdi/ambra/rossi; icona nel cavo dell'arco (top 56%, 18px, nessuna collisione: band interna y=14.5 vs icona y≈17-38); sotto: nome + **Speso / Budget** in una riga (`412,00 € / 500,00 €`), **budget rosso + badge "⚠ Sforato di X"** quando si sfora; carta vuota → arco grigio + "— / —". `renderCategoryGridDesktop` riscritta (template string, onclick → `filterByCategory`).
- **Registro ridisegnato**: righe compatte con pallino colore categoria (`.reg-dot` via `getCategoryCardBg`), nome+badge ✓ Saldata+pill `%` condivisa, sottotitolo `fd · nota`, Stima/Da pagare impilati, `⏳ Da pagare` ambra (`.val-pending`), azioni Paga/🗑 su colonna destra; guardia `exp.date` (legacy senza data → "–"); sort ISO sulla stringa data (niente NaN); stato vuoto con hint. Righe entrate con dot verde + data.
- **IA & Note spostato**: pulsante rimosso dal month-head → card compatta in **fondo colonna destra** (`.ia-quick-card` + `.ia-quick-trigger`) che apre `#iaNotesModal` esistente.
- **Striscia risparmio rimossa**: `#overviewTableFoot` (markup + write `updateUI` + `.flat-footer-*` + `.savings-badge` + `.row-savings`/`#overviewTableFoot` mobile dead rules). Risparmio resta in Analisi/db.
- **Form desktop — parity completa col bottom sheet mobile**:
  - **Entrata**: + campo **Data** (`#incDate`, default oggi, registrato in `inc.date`), controllo importo con toast.
  - **Spesa**: `<details class="form-advanced">` con **Tipo voce** (pills Prevista teal/Sostenuta rossa, accentua Stima/Pagato) e **pannello Spesa Condivisa completo**: `#sharedToggleDesktop`, `#sharedPersonDesktop` (persone + gruppi `g_`, `populateSharedPersonSelectDesktop`), pills pagatore (`#payerThemLblDesktop`), metodo equal/%/€ (`#sharedDetailFieldsDesktop`, `updateSplitFieldsDesktop`/`updateSharedPreviewDesktop`), `+` nuova persona (`#btnNewPersonDesktop`). `addExpense` ricalcola quote come la sheet (`saveSharedSplits(exp.id, otherPart, payer, selVal)`) + salva `isShared/sharedPayer/sharedPersonId/sharedGroupId`; quota % legacy applicata solo senza persona; `resetExpenseAdvancedForm()` al salvataggio.
  - **Bugfix invio dati**: `expDate` vuota → default oggi (prima: righe senza data, sort/registro rotti); catch di `addExpense` ora rollback `currentData.expenses`; `addIncome` validata.
- **Cleanup legacy JS**: rimossi `renderImportCheckboxList` (e le 3 chiamate) + `copyFromPreviousMonth` + sezione "COPIA DAL MESE PRECEDENTE" + CSS `.import-checkbox-list`, `.navigation-tabs` mobile, `.add-button`/`.tab-button` (media 968).
- **Fix HTML pre-esistente**: bottom sheet aveva UN div non chiuso (`div` opens 257/closes 256, presente anche in HEAD) → aggiunto `</div>` finale, ora bilanciato.
- **Mobile NON TOCCATO**: tutte le modifiche dentro media ≥768/≥1200 o classi `hide-mobile`; ordine mobile (pill→alert→dash→summary→grid) invariato.

### 🎯 Status: COMPLETATO
- `node --check` OK, braces CSS 643/643, HTML bilanciato (stack check), zero id duplicati (206), cross-ref getElementById audit: residui tutti pre-esistenti con null-guard. **Nessun commit/push.**

---

## [2026-08-11] - Refactoring visivo completo desktop Tab Mese: viewport-first zero-scroll

### ✅ Completed Changes
- **Top navbar orizzontale (desktop ≥768)**: nuovo `<nav class="top-nav hide-mobile">` con brand "Bilancio Pro" + 5 link (`data-tab` Mese/Analisi/Investimenti/Previsioni/Impostazioni). `switchTab` sincronizza `.top-nav-link.active` (aggiunta regola). Mobile invariato (bottom-nav).
- **Header Mese compatto** `.month-head`: pill mese + KPI (4 box) + pulsante `🤖 IA & Note` → apre la nuova modal.
- **Layout 3 pannelli ≥1200px zero-scroll**: `#current-month-tab.active` = `height: calc(100dvh - 56px)`, flex column, overflow hidden; `.main-layout` = grid `270px | 1fr | minmax(360px,400px)`; i 3 pannelli scrollano internamente (`overflow-y:auto`, scrollbar sottile). Fallback impilato 768-1199px.
- **Colonna sinistra**: calendario compatto `#calendarGridCompact` (L M M G V S D, tile 30px, span M/YY nascosto, click → filtra registro) + forms a tab **Entrata | Spesa | Condivise** (`.form-tabs`/`.form-pane`, wiring IIFE scoped); campi ultra-compatti (padding 8px, label 10px).
- **Rimosso "Pianificazione Ciclo"**: `#importSectionCard`/`#importSection` eliminati dall'HTML (JS `renderImportCheckboxList`/`copyFromPreviousMonth` restano, no-op sicuri con null-guard).
- **Griglia microcategorie ridisegnata**: card più dense (`minmax(148px,1fr)`, gap 10px, padding 12px) con **icona della categoria centrata DENTRO l'arco** (`.cat-grid-gauge-icon` absolute nel wrap 140×70), `%` sotto l'icona, nome 1 riga, chips prev/att 11px, diff micro-badge. Stessa config gauge Chart.js (nessun tooltip).
- **Registro Spese**: card `#entriesCard` nel pannello destro con righe moderne (`.item-row` card-like, hover lift, tinta sfondo, radius 10px), toolbar ricerca + CSV/PDF in testa; `scrollToRegistry()` scrolla il pannello invece di `scrollIntoView` pagina.
- **Modal IA & Note (desktop)**: `#iaNotesModal` (pattern popup, 640px, `z-index:2500`) con tab **HUB IA | Note | Grafici**. HUB IA + textarea `userNotes`/`iaNotes` spostati qui dal pannello; **mini-chart** (`#budgetChart`/`#categoryChart` → `.ia-mini-chart` 130px) con ricreazione al open: estratta `renderDashboardCharts()` da `updateUI` (chiamata solo con modal aperto — canvas hidden = size 0 per Chart.js).
- **CSS cleanup**: rimossi `.charts-wrapper`, `.calendar-details`, `.cat-grid-icon` (dead), div duplicato `#currentMonth` (bug: duplicato inserito durante restyle, rimosso). Net balance div edit = 0.
- **Mobile NON TOCCATO**: tutte le nuove sezioni `hide-mobile`; feature mobile (bottom sheet, action hub, dash) intatte.

### 🎯 Status: COMPLETATO
- `node --check` OK (script.js + adapter), braces CSS 649/649, zero id duplicati (203), cross-ref onclick/getElementById verificato (missing residui = pre-esistenti/by-design, documentati in MEMORY). **Nessun commit/push.**

---

## [2026-08-11] - Refactoring totale Tab Mese (desktop): navigazione mese, HUB IA, layout

### ✅ Completed Changes
- **BUG FIX — mese non cambiabile**: la pillola `#monthSelectorPill` non aveva alcun handler e `#currentMonth` era `display:none` → tab Mese bloccato sul mese corrente. Ora: pill cliccabile (`showPicker()` con fallback `click()`), tastiera (Enter/Space), frecce **‹ ›** (`#btnPrevMonth`/`#btnNextMonth`, classe `hide-mobile`) con `shiftMonth(±1)` → `loadMonthData()` + `updateMonthDisplay()`. Nuova `setupMonthNavigation()` chiamata nel DOMContentLoaded esistente.
- **HUB IA restyled**: rimosso markup inline-styled → `.hub-ia-card` (card gradient, h2 con bordo `--ia-color`), hint, `.btn-ia` in evidenza, select Motore/Modello in `<details class="hub-ia-advanced">` collassato (zero JS), `.hub-ia-error-box` con classe CSS (JS usa `style.display` inline → compatibile). ID invariati (`ai-engine-select`, `openrouter-model-select`, `btn-analisi-strategica`, `hub-ia-error-box`).
- **Colonna sinistra riordinata**: Registra Spesa → Nuova Entrata → Spese Condivise → Pianificazione Ciclo (collassabile, ultima). Sticky desktop (`top:118px`, `max-height`, overflow-y auto, scrollbar sottile). Fix typo "carato" → "carico".
- **KPI strip 4ª cella**: `#summaryRisparmio` (desktop-only `hide-mobile`) con importo + `#sumRisparmioPct` (+% / vuoto se nessuna entrata); `updateUI` aggiorna; summary-grid desktop ora `display:grid; repeat(4,1fr)`.
- **Voci del Periodo**: calendario in `<details class="calendar-details">` collassato di default (ricerca+registro+CSV/PDF sempre visibili).
- **CSS cleanup**: rimossi blocchi orfani `.flat-list-container/.flat-row/.flat-left/.flat-right/.flat-icon/.flat-title-group/.flat-title/.flat-subtitle/.flat-actual/.flat-margin` (zero consumer; `.flat-footer-*` conservati per la strip risparmio); `.card` → `border-radius: var(--radius-card)`; `:focus-visible` globale per button/input/select/textarea; `.month-arrow` 28px; `.box-risparmio` gradient blu-indaco; `summary-pct`.
- **Mobile NON TOCCATO** (tutte le aggiunte con `hide-mobile`, le card modificate sono `hide-mobile`).

### 🎯 Status: COMPLETATO
- `node --check` OK, braces CSS 572/572, zero id duplicati, tutti i nuovi id presenti. **Nessun commit/push**.

---

## [2026-08-11] - Refactor desktop Tab Mese: griglia categorie con gauge a semicerchio

### ✅ Completed Changes
- **index.html**: rimossi `#viewToggleBtn` + `#macroTabsContainer` (le 3 macrocategorie desktop Casa/Auto/Svago; su mobile i macro-tab erano già `display:none`, il toggle era un bottone morto). `#rendicontoCard` → titolo "📊 Categorie & Budget", `#overviewTableBody` sostituito con `#categoryGridDesktop`; `#overviewTableFoot` (risparmio netto) conservato.
- **script.js**: eliminati `setupViewToggle` (+ chiamata in `initApp`), stato `currentViewMode`/`activeMacroGroup` e tutti i branch `=== 'tabs'` (codice morto). Nuova `renderCategoryGridDesktop(catSums)` chiamata da `updateUI`: card per OGNI categoria (anche a zero) con bg pastello, icona, **gauge semicerchio** Chart.js (`doughnut`, `rotation:-Math.PI`, `circumference:Math.PI`, `cutout:'72%'`, `animation:false`, `events:[]`), % centrale, valori Prev/Sost, badge diff (green/red), stati ok/warning/over/empty; click → `filterByCategory(cat)` + stato `.selected` (`aria-pressed`).
- **style.css**: rimossi blocchi orfani `.view-toggle-btn`, `.macro-tabs-wrapper`, `.macro-tab` e reference in media query mobile. Nuovi token `:root` `--radius-card`, `--shadow-card`, `--shadow-card-hover`. `.category-grid-desktop` (`repeat(auto-fill, minmax(230px,1fr))`, gap 16px), `.cat-grid-card` (button 18px radius, hover lift -3px, active scale, `:focus-visible` outline accent, `.selected` ring) — solo desktop (card già `hide-mobile`). Canvas gauge 168×84 fisso (zero CLS), `clamp()` sulla %.

### 🎯 Status: COMPLETATO
- `node --check` OK, braces CSS 553/553, zero reference residue a view-toggle/macro-tab/overviewTableBody. **Nessun commit/push** (richiesto dall'utente).

---

## [2026-08-11] - Bottom sheet swipe-to-close completo + rimozione legacy_version

### ✅ Completed Changes
- **Rimossa cartella `legacy_version/`** (importate tutte le funzionalità, ROADMAP 7/7 fasi complete; nessun riferimento nel codice attivo).
- **script.js**: `setupSwipeToClose` (solo `#bottomSheet`, selettore header errato `.sheet-header`, solo touch) sostituita con `setupSheetSwipe(sheetId, closeFn)` generica:
  - Wiring su TUTTI e 3 i sheet: `#bottomSheet`→`closeTransactionSheet`, `#incomeBottomSheet`→`closeIncomeSheet`, `#futureBottomSheet`→`closeFutureSheet`.
  - Pointer Events (touch + mouse) + `setPointerCapture` → drag fluido anche da desktop.
  - Selettore corretto `.bottom-sheet-header` scoped al singolo sheet.
  - Clamp delta ≥ 0, `translate3d` per GPU, `e.preventDefault()` durante il move.
  - **Chiusura fluida**: release oltre soglia (min 120px / 35% altezza) → si toglie `.dragging` + `.open` e si libera la transform inline nello stesso frame: la transizione CSS (0.35s) scivola da delta a 100%; sotto soglia → snap-back animato.
- **script.js**: `closeFutureSheet` ora pulisce anche `transform` inline e classe `.dragging` (uniforme a `closeTransactionSheet`/`closeIncomeSheet`).
- **style.css**: `.bottom-sheet-header` con `touch-action: none` (draggabile su touch, specificity 0,2,0 > `.bottom-sheet *`); `.bottom-sheet.dragging` con `will-change: transform`.

### 🎯 Status: COMPLETATO
- `node --check` OK.

---

## [2026-08-11] - ROADMAP ripristino legacy + Fase 1: Spese Ricorrenti

### ✅ Completed Changes
- **docs/ROADMAP.md** (nuovo): piano 7 fasi per riportare le feature mancanti da `legacy_version/` (audit comparativo 11-08-2026), con riferimenti riga al codice sorgente legacy e checkbox di stato.
- **Fase 1 — Spese Ricorrenti (COMPLETATA)**:
  - **index.html**: toggle "Ripeti ogni mese" + input mese-fine nel bottom sheet mobile (`recurringToggle`/`recurringUntil`) e nel form desktop (`recurringToggleDesktop`/`recurringUntilDesktop`).
  - **script.js**: `setupRecurringToggle()` (animazione show/hide per mobile+desktop, init nel DOMContentLoaded), `saveRecurringClones()` (cloni mensili con `recurringGroupId`/`recurringEndMonth`, cap 240 mesi, giorno clampato all'ultimo del mese); integrati in `saveTransactionFromSheet` e `addExpense` (incl. reset toggle dopo il salvataggio); `closeTransactionSheet` resetta il toggle mobile.
  - **style.css**: blocco CSS ricorrenza riportato dal legacy (`.recurring-toggle-wrapper`, `.toggle-switch`/`.toggle-slider`, `.recurring-until-container(.active)`, `.recurring-until-input`, `.recurring-hint`).

### 🎯 Status: COMPLETATO
- `node --check` OK.
- Nota: le spese ricorrenti create restano gestibili (visibili/edit) solo tramite dati `recurringGroupId` in DB; il popup "Ripetizioni" di gestione è la Fase 2 della roadmap.

---

## [2026-08-11] - Fase 2 ROADMAP: Gestione Ripetizioni (Impostazioni)

### ✅ Completed Changes
- **index.html**: card inline "🔁 Ripetizioni" in `settings-col-right` (pattern attuale, non popup come nel legacy) con sezione collapsible `#ripetizioniSection` e container `#ripetizioniList`.
- **script.js**: `renderRipetizioni()` (raggruppa spese con `recurringGroupId`/`isRecurring`, mostra nome/importo/durata, bottone 🗑️) e `deleteRecurringGroup()` (rimuove solo spese future o del mese corrente non saldate); init in `initApp()`.
- **style.css**: blocco `.ripetizione-*`/`.ripetizioni-empty` (7 regole) riportato dal legacy.

### 🎯 Status: COMPLETATO
- `node --check` OK.

---

## [2026-08-11] - Fallback dinamico modelli :free (client + Edge Function)

### ✅ Completed Changes
- **script.js**: `fetchFreeModels()` (fetch `https://openrouter.ai/api/v1/models`, filtro `id.endsWith(':free')`, cache in variabile, timeout 10s, fallback silenzioso); `populateFreeModelSelect()` (dropdown = "🎲 Casuale (Free)" + modelli attivi, mantiene la selezione se ancora valida, chiamato in `initApp`); `resolveAIModel()` (valore `random` → scelto a caso dalla lista attiva; se lista vuota passa `random` al server).
- **supabase/functions/chat-openrouter/index.ts**: `FALLBACK_MODELS` (gemini-2.5-flash-exp, gemini-2.0-flash-exp, llama-3.3-70b, qwen-2.5-coder); loop sui candidati `[modello client] + fallback` (dedup, shuffle se `random`), timeout 30s per tentativo (`AbortSignal.timeout`); stop immediato su 401/403 (problema chiave); 502 solo dopo esaurimento di tutti i candidati.
- **index.html**: opzione statica `<option value="random">🎲 Casuale (Free)</option>`.

### 🎯 Status: COMPLETATO
- `node --check` OK.
- **Deploy manuale necessario**: `supabase functions deploy chat-openrouter`.

---

## [2026-08-11] - Surfacing errori Edge Function + hardening chat-openrouter

### 🔧 Situazione
- Clic su "Analisi Strategica Mese": `Errore: Edge Function returned a non-2xx status code` — il client non mostrava il motivo reale (401 JWT / 500 OpenRouter).
- Sonda read-only: funzione deployata, check JWT attivo (401 "Non autenticato" senza token). Restava da distinguere 401 da 500 e rendere visibili i dettagli.

### ✅ Completed Changes
- **script.js**: nuovo helper `extractFunctionError(err)` — estrae `err.context` (Response del `FunctionsHttpError`) e compone `Status <code>: <body>`; usato nei catch di `callAIEndpoint` e `runFinancialAnalysisIA` (errore reale ora visibile nell'error box).
- **supabase/functions/chat-openrouter/index.ts**: guardia `OPENROUTER_API_KEY` assente → 500 con messaggio esplicito; `req.json()` malformato → 400; `messages` vuoto → 400; errore OpenRouter → 502 con body (primi 500 caratteri) invece di 500 generico; lettura chiave estratta prima del fetch.

### 🎯 Status: COMPLETATO
- `node --check` OK.
- **Deploy manuale necessario**: `supabase functions deploy chat-openrouter` + verifica `supabase secrets list`.

---

## [2026-08-11] - Fix "Cannot read properties of undefined (reading 'invoke')"

### 🔧 Situazione
- Clic su "Analisi Strategica Mese": `Errore: Cannot read properties of undefined (reading 'invoke')`.
- **Causa**: `window.supabase` è il namespace UMD del bundle CDN (espone `createClient`, per cui l'auth funziona) ma NON `.functions`; l'istanza client con `.functions` è `window.supabaseClient` (js/supabase-adapter.js:4-5). Il fix precedente era parziale: `supabase.functions` → `window.supabase.functions`, ancora namespace.

### ✅ Completed Changes
- **script.js**: `window.supabase.functions.invoke` → `window.supabaseClient.functions.invoke` in `callAIEndpoint` (riga ~2517) e `runFinancialAnalysisIA` (riga ~2584).

---

## [2026-08-11] - Edge Function chat-openrouter: JWT auth + lock modelli free

### 🔧 Situazione
- La chiave OpenRouter era gestita **lato client**: `runFinancialAnalysisIA()` faceva fetch diretto a `openrouter.ai` con la key dell'input (esposta) — buco di sicurezza; inoltre la funzione non verificava l'autenticazione (chiunque con la chiave anon poteva chiamarla e bruciare la quota).

### ✅ Completed Changes
- **supabase/functions/chat-openrouter/index.ts**: check JWT obbligatorio (`supabase.auth.getUser`, 401 se assente/invalido); validazione server-side di `model` (solo `openrouter/free` o regex `:free$`, default `openrouter/free`); la chiave resta in `Deno.env.get('OPENROUTER_API_KEY')`.
- **script.js**: `runFinancialAnalysisIA()` ora usa `window.supabase.functions.invoke('chat-openrouter', { body: { model, ... } })` (mai più fetch diretto né key client); `callAIEndpoint` passa il modello selezionato (`openrouter-model-select`).
- **index.html**: rimosso input "OPENROUTER API KEY" (morto/convenzione errata).
- **Deploy manuale necessario**: `supabase functions deploy chat-openrouter` + `supabase secrets set OPENROUTER_API_KEY=...` (il push GitHub non deploya le Edge Function).

---

## [2026-08-11] - Pulizia repo per GitHub Pages

### ✅ Completed Changes
- **`db_usages.txt`**: rimosso dal repo (`git rm`) — artifact di debug mai referenziato, inutile pubblicamente su Pages.
- **`index.html`**: rimossa `<script src=".../dexie.js">` (dipendenza morta dall'adapter Supabase, ~120 KB scaricati inutilmente ad ogni load).

---

## [2026-08-11] - Schema completo Supabase + Outbox antifragile

### 🔧 Situazione
- Dopo l'esecuzione della migrazione `20260810_full_sync.sql`, nuovi 400: `Could not find the 'totalActual' column of 'months' in the schema cache` e `Could not find the 'deviceId' column of 'sync_state'`.
- **Causa**: `CREATE TABLE IF NOT EXISTS` salta le tabelle già esistenti senza aggiungere le colonne mancanti; + cache schema PostgREST non ricaricata.
- Tutti i dati sparivano al refresh: i put fallivano silenziosamente e non esisteva memoria locale di recupero.

### ✅ Completed Changes
- **supabase/migrations/20260811_schema_completo.sql (NUOVO, da eseguire)**: `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` per OGNI colonna inviata dal frontend su TUTTE le tabelle (months, income, expenses, categories, annual_deadlines, savings_goals, settings, sync_state) con nomi quoted camelCase + tipi corretti; DO-block per PK mancanti (`months.month_id`, `id` su income/expenses/annual_deadlines); `NOTIFY pgrst, 'reload schema';` in fondo.
- **js/supabase-adapter.js**: **Outbox su localStorage** (`eb_outbox_<tabella>`) — put/update/bulkPut in caso di errore accodano la voce (nessun dato perso), toast "⚠️ Salvataggio offline"; flush automatico all'autenticazione e su evento `online` (`flushOutbox()`); nuovi metodi interni `_upsert`/`_update` che restituiscono l'errore; rimosso no-op `mapped.name = mapped.name` in `_mapIn`.
- **script.js**: rimosso `currentData.expenses.pop()` (rollback) in `addExpense` — con l'outbox il dato va preservato in memoria.
- **service-worker.js**: `CACHE_NAME` → `bilancio-pwa-v2` (invalida cache JS sul nuovo deploy).

### 🎯 Status: COMPLETATO (in attesa di esecuzione SQL)
- `node --check` OK.
- **DOPO aver eseguito lo SQL**: hard refresh (Ctrl+F5) → se banner "Database vuoto": 📥 Carica Backup (.json) → verificare Network 200/201.

---

## [2026-08-10] - Fix Sync Supabase (colonna iaNotes mancante + tabelle settings/savingsGoals/syncState su DB)

### 🔧 Situazione
- Dati non salvati su Supabase: `POST 400 PGRST204 "Could not find the 'iaNotes' column of 'months' in the schema cache"` → salvataggio mesi falliva; `GET 406` da `.single()` su righe inesistenti.
- `settings`, `savingsGoals`, `syncState` erano su localStorage (`LocalMockTable`) → mai sincronizzati tra dispositivi.

### ✅ Completed Changes
- **supabase/migrations/20260810_full_sync.sql (NUOVO)**: `ALTER TABLE months ADD COLUMN IF NOT EXISTS "iaNotes" TEXT;` + `CREATE TABLE IF NOT EXISTS` per `settings (key,value,user_id)`, `savings_goals (name PK, targetAmount, importo_accumulato, createdAt, user_id)`, `sync_state (id PK, counter, deviceId, lastUpdated, user_id)` — da eseguire nell'SQL Editor (idempotente, nota RLS inclusa).
- **js/supabase-adapter.js**:
  - `_allowedColumns()`: allowlist colonne per tabella in `_mapIn()` — i campi sconosciuti vengono scartati prima dell'upsert → mai più PGRST204, il salvataggio non si rompe su campi opzionali.
  - `.single()` → `.maybeSingle()` in `get()` → via il 406 su mesi/righe inesistenti (GET 200 + null).
  - `put/update/bulkPut`: `console.warn` contestuale (non bloccanti).
  - Rimosso `LocalMockTable`; nuovo `SettingTable` (normalizza record legacy `name/id` → `key`).
  - `window.db`: `savingsGoals → SupabaseTable('savings_goals','name')`, `settings → SettingTable('settings','key')`, `syncState → SupabaseTable('sync_state','id')`.

### 🎯 Status: COMPLETATO (in attesa di esecuzione SQL)
- `node --check` OK su adapter e script.js.
- **DOPO aver eseguito lo SQL nell'editor Supabase**: refresh → i dati devono persistere e sincronizzarsi tra dispositivi.

---

### 🔧 Situazione
- Dopo il push precedente, pagina ancora bianca: `Uncaught SyntaxError: Identifier 'supabase' has already been declared (at supabase-adapter.js:1:1)`.
- **Causa verificata**: il bundle UMD di `@supabase/supabase-js@2` (v2.112.2, `dist/umd/supabase.js` servito da jsdelivr) dichiara `var supabase` a livello globale (`var supabase=(function(e){...})({...})`). La riga 4 dell'adapter (`const supabase = window.supabase.createClient(...)`) entrava in conflitto → SyntaxError → `window.db` mai creato → `initApp()` mai chiamato → pagina bianca.
- Inoltre su GitHub erano stati pushati file non essenziali (`.codegraph/`).

### ✅ Completed Changes
- **js/supabase-adapter.js**: istanza client rinominata `supabase` → `supabaseClient` (riga 4 + `window.supabaseClient`), aggiornati tutti i riferimenti interni (`supabaseClient.from` ×12, `supabaseClient.auth` ×3).
- **script.js:2514**: `supabase.functions.invoke` → `window.supabase.functions.invoke` (esplicito; il `var supabase` globale del bundle CDN resta disponibile).
- **.gitignore (NUOVO)**: `.codegraph/`, `.opencode/`, `supabase/.temp/`, `*.log`, `.DS_Store`.
- **Git**: `git rm -r --cached .codegraph/` (file locali intatti) — repo pulita con solo file essenziali.

### 🎯 Status: COMPLETATO
- `node --check` OK su script.js, supabase-adapter.js, ui-dialogs.js.
- Repository contiene ora solo file essenziali per GH Pages (index.html, js/, script.js, style.css, asset, docs).

---

### 🔧 Situazione
- GitHub Pages serviva pagina bianca: 404 `js/supabase-adapter.js`, `TypeError` a `script.js:321`, 404 `favicon.ico`.
- **Causa 404**: il branch remoto `main` (quello servito da Pages) conteneva `index.html` che referenzia `js/supabase-adapter.js` ma la cartella `js/` non era mai stata committata (push parziale/selectivo della migrazione Supabase). Il commit completo esisteva localmente su `master` (821405b) ma non era su `main` (alberi con storia diversa).
- **Causa crash**: righe 321-322 di script.js eseguivano `getElementById('iaProviderSelect').value`/`geminiApiKeyInput` senza guardia — elementi non presenti in index.html (l'IA hub usa `ai-engine-select`, `openrouter-model-select`, `openrouter-key-input`) → TypeError → script.js si fermava → app mai inizializzata.

### ✅ Completed Changes
- **script.js**: guardie null-safe su righe 321-324 (convenzione "controlli difensivi" di MEMORY.md) per `iaProviderSelect` e `geminiApiKeyInput`.
- **index.html**: aggiunto `<link rel="icon" href="icon-512.png" type="image/png">` (elimina 404 favicon.ico).
- **Git**: force-push del commit completo locale su `origin/main` (branch rinominato da `master` a `main`).

### 🎯 Status: COMPLETATO
- `node --check script.js` OK.
- Deploy Pages ora contiene `js/supabase-adapter.js` + `js/ui-dialogs.js` + `supabase/functions/`.

---

### 🔧 Situazione
- Il worktree di `script.js` era stato corrotto (blocco Previsioni mobile perso, `const defaultCategories = {` cancellato → SyntaxError, blocco Google Drive OAuth rimosso → ReferenceError `gapiLoaded` a runtime, `showAlertDialog` usato ma mai definito).
- `git checkout -- script.js` ha ripristinato la versione staged (2849 righe, sintassi valida, Drive OAuth + sync intatti).

### ✅ Completed Changes

**script.js (base: versione staged ripristinata + ricostruzione):**
- **Ricostruita sezione BOTTOM SHEET PREVISIONI (MOBILE)**: `openFutureSheet(action)` (azioni `simula`/`scadenze`/`ia`), `closeFutureSheet()`, `renderFutureProjectionsPreview(container, simAmount)`, `renderAnnualDeadlinesInSheet()`, `runFuturePredictionIASheet()` (chiama `callAIEndpoint` con responseBoxId `iaFutureResponseSheet`), `setupFutureSwipeToClose()` (swipe-down > 80px chiude).
- `renderFutureProjections()` estesa: popola anche `#futureProjectionsGrid` (griglia 2×3 `.proj-card`) e `#futureAvgBoxMobile`; gestito empty-state anche mobile.
- `resetFutureSimulation()` resetta anche `#simulatedExpenseMobile`.
- Binding DOMContentLoaded: click su bottoni `[data-action]` di `#futureActionHub`, click su `#futureSheetOverlay` → chiudi, `stopPropagation` sul sheet, swipe-to-close.

### 🎯 Status: COMPLETATO
- `node --check` OK (3037 righe).
- Tutti gli ID HTML referenziati esistono (i nuovi sono iniettati a runtime da `openFutureSheet`).
- Funzioni Drive (`gapiLoaded`, `gisLoaded`, `syncToDrive`, `handleAuthClick`, `startupCloudCompare`, `processSilentRestore`, `debouncedAutoSync`) ripristinate dalla versione staged.

### ⚠️ Da notare
- `showAlertDialog` (13 usi in una vecchia versione corrotta) NON è stato ripreso: la base staged usa `alert()` coerente e funzionante.
- Gap pre-esistenti (non introdotti da questa sessione): UI obiettivi risparmio (`savingsGoalsList`, `sgName`, `sgAmount`, `depositSavingsSelect`) assente in index.html; sezione IA hub rimossa dalla UI ma `toggleIaProviderFields` ha guardia null-safe.

---

## [2026-07-25] - Ruota importo estesa a 4 cifre (0-9999)

### ✅ Completed Changes

**script.js — Integer wheel 0-999 → 0-9999:**
- Loop generazione ruota: `i <= 999` → `i <= 9999`
- Padding: `padStart(3, '0')` → `padStart(4, '0')` (2 occorrenze nel loop + syncInputToWheel)
- Validazione input hidden: `val <= 999` → `val <= 9999`

**index.html — Input max attribute:**
- `max="999"` → `max="9999"` su `#hiddenIntegerInput`

**style.css — Container width:**
- `.wheel-container`: `width: 80px` → `width: 100px` per accomodare 4 cifre

### 🎯 Status: COMPLETATO
- Ruota sinistra ora permette di selezionare valori da 0000 a 9999
- Stessa logica, stesso funzionamento, solo range esteso

---

## [2026-07-25] - Layout cleanup: toggle centering + uniform spacing

### ✅ Completed Changes

**style.css — Toggle text centering:**
- Added `display: flex; align-items: center; justify-content: center;` to `.toggle-option`
- Removed redundant `text-align: center`
- "Spesa Sostenuta" / "Spesa Prevista" now perfectly centered in their containers, no overlapping

**style.css — Uniform vertical spacing:**
- Removed `margin: 10px 0` from `.sheet-amount-display`
- Removed `margin: 20px 0` from `.sheet-type-toggle`
- Removed `margin-top: 10px` from `.sheet-inputs`
- Added `gap: 20px` to `#viewInput > .sheet-body`
- All three blocks now use uniform 20px spacing (was inconsistent 20px/30px)

### 🎯 Status: COMPLETATO
- Toggle text perfectly centered via flexbox
- Uniform gap between amount wheels, toggle, and date/note inputs
- Zero HTML/JS changes

---

## [2026-07-25] - Fix Visibility of Expense Form in Bottom Sheet (CSS Overflow Conflict)

### ✅ Completed Changes

**style.css — Fixed slider overflow logic:**
- Removed `overflow: hidden` from `.bottom-sheet .sheet-slider` which was clipping the second view (`#viewInput`) when sliding right.
- Added `overflow-x: hidden` to `.bottom-sheet` instead, to properly hide the slider's overflow relative to the sheet container.
- These changes resolve the bug where clicking on a category tile in the bottom sheet resulted in a blank/hidden expense input form.

### 🎯 Status: COMPLETATO
- The sliding animation in the bottom sheet now correctly reveals the expense form.
- The previous bug caused by nested flex overflow clipping is fixed.

## [2026-07-25] - Ripristino Visibilità Form Spese nel Bottom Sheet (Slide Destra)

### ✅ Completed Changes

**style.css — 4 correzioni CSS puntuali:**

1. **`min-height: 0` su `.bottom-sheet .sheet-slider .sheet-view`** (riga 1379):
   - Permette al flex item di ricevere altezza `stretch` dal padre in flex row, risolvendo il calcolo zero su WebKit mobile.

2. **`min-height: 0` su `#viewInput`** (riga 1362):
   - Garantisce altezza nel flex column annidato, evitando che il form resti compresso.

3. **`flex-shrink: 0` su `.sheet-footer`** (riga 1340):
   - Impedisce compressione accidentale dei bottoni Salva/Annulla in contesti di spazio ridotto.

4. **`.bottom-sheet-header` gap 12px → 15px** (riga 1387):
   - Allineamento più arioso tra freccia indietro e titolo.

### 🎯 Status: COMPLETATO
- Form spese (ruota importo, toggle sostenuta/prevista, data, note, bottoni) ora visibile dopo slide destra
- Scroll interno funzionante se form lungo
- Header con freccia e titolo allineato correttamente
- Zero modifiche a index.html o script.js

---

## [2026-07-24] - Fix Swipe-to-Close Bottom Sheet (Selettore Handle Errato)

### ✅ Completed Changes

**script.js — setupSwipeToClose() selettori scoped:**
- `document.querySelector('.drag-handle-wrapper')` → `document.querySelector('#bottomSheet .drag-handle-wrapper')`
  - Causa: due bottom sheet nel DOM (future + spese), `querySelector` prendeva il primo (future), lasciando il main sheet senza listener
- `document.querySelector('.sheet-header')` → `document.querySelector('#bottomSheet .bottom-sheet-header')`
  - Causa: classe rinominata da `.sheet-header` a `.bottom-sheet-header`, selettore morto

### 🎯 Status: COMPLETATO
- Swipe-to-close sul bottom sheet spese ripristinato
- Anche l'header (titolo) ora funziona come area di drag
- Future bottom sheet invariato (ha già il suo swipe dedicato in `setupFutureSwipeToClose`)

---

## [2026-07-24] - Fix Form Spese Scomparso (Tab "Mese") — Bottom Sheet #viewInput

### ✅ Completed Changes

**style.css — .bottom-sheet: altezza definita:**
- Aggiunto `height: 85dvh` accanto a `max-height: 85dvh`
- Flex container ora ha un'altezza "definita" → `flex: 1` su `.sheet-slider` funziona correttamente su tutti i browser

**style.css — #viewInput convertito in flex column:**
- Aggiunto `#viewInput { display: flex; flex-direction: column; }`
- `.sheet-body` diventa `flex: 1; min-height: 0` così si espande a riempire lo spazio verticale
- `.sheet-footer` resta ancorato in fondo

**style.css — Scroll centralizzato:**
- Rimosso `overflow-y: auto` da `.bottom-sheet .sheet-slider .sheet-view` (era il contenitore sbagliato)
- Spostato scrolling dentro `.sheet-body` con `overflow-y: auto !important`
- Eliminato doppio overflow annidato che causava conflitto

### 🎯 Status: COMPLETATO
- Clic su categoria nel bottom sheet ora mostra correttamente il form (ruota importo, toggle, data, nota, pulsanti)
- Scroll del form contenuto dentro `.sheet-body`, footer sempre visibile
- Desktop invariato

---

## [2026-07-24] - Body Scroll Lock & Scroll Chaining Fix (Bottom Sheet + Popup)

### ✅ Completed Changes

**style.css — body.sheet-open rafforzato:**
- Aggiunto `height: 100dvh !important`, `height: -webkit-fill-available !important`
- Aggiunto `overscroll-behavior: none !important`, `-webkit-overflow-scrolling: none !important`
- `width: 100% !important` per prevenire scroll orizzontale

**style.css — .bottom-sheet constraint viewport:**
- Aggiunto `max-height: 85dvh` per limitare altezza massima
- Aggiunto `display: flex; flex-direction: column; overflow: hidden`
- Aggiunto `flex-shrink: 0` su `.drag-handle-wrapper` e `.bottom-sheet-header`
- Aggiunto `.sheet-slider { flex: 1; min-height: 0; overflow: hidden }`
- Aggiunto `.sheet-view { overflow-y: auto; -webkit-overflow-scrolling: touch; overscroll-behavior-y: contain; flex: 1; min-height: 0 }`

**style.css — Scroll isolato nelle aree contenuto:**
- `.bottom-sheet .sheet-body`: aggiunto `overflow-y: auto !important; -webkit-overflow-scrolling: touch !important`
- `#futureSheetBody`: stesse regole + `flex: 1; min-height: 0`

**style.css — touch-action riabilitato dentro il sheet:**
- `.bottom-sheet * { touch-action: auto }` — riabilita tocchi/scroll dentro il sheet
- `.drag-handle-wrapper, .sheet-handle { touch-action: none !important }` — resta esclusivo per drag

**script.js — Rimosso `style.overflow` inline (ridondante):**
- `openTransactionSheet()`: rimosso `document.body.style.overflow = 'hidden'`
- `closeTransactionSheet()`: rimosso `document.body.style.overflow = ''`
- `openBottomSheetFromMacro()`: rimosso `document.body.style.overflow = 'hidden'`
- `openFutureSheet()`: rimosso `document.body.style.overflow = 'hidden'`
- `closeFutureSheet()`: rimosso `document.body.style.overflow = ''`

**script.js — Body lock aggiunto ai popup modali:**
- `openIaModal()` / `closeIaModal()`: ora aggiungono/rimuovono `body.sheet-open`
- `openArchiveModal()` / `closeArchiveModal()`: ora aggiungono/rimuovono `body.sheet-open`
- `openRendicontoPopup()` / `closeRendicontoPopup()`: ora aggiungono/rimuovono `body.sheet-open`

### 🎯 Status: COMPLETATO
- Body scroll completamente bloccato quando un bottom sheet o popup è aperto
- Scroll all'interno del sheet isolato (no scroll chaining al body)
- Touch riabilitato dentro il sheet per input/scroll nativi
- Drag handle mantiene touch-action: none per swipe-to-close
- iOS rubber-band bloccato sul body

---

## [2026-07-24] - Previsioni Tab Zero-Scroll Mobile Dashboard

### ✅ Completed Changes

**index.html — Ristrutturazione #future-tab:**
- Wrappato contenuto desktop originale in `<div class="hide-mobile">`
- Aggiunto nuovo blocco mobile `<div class="hide-desktop future-mobile-dashboard">` con:
  - Header compatto (h2 + `#futureAvgBoxMobile`)
  - Griglia 2×3 `#futureProjectionsGrid`
  - Action Hub `#futureActionHub` con 3 bottoni `[data-action]`: simula, scadenze, ia
- Aggiunto nuovo Bottom Sheet `#futureSheetOverlay` + `#futureBottomSheet` (pattern identico a bottom sheet spese)

**style.css — Nuove regole mobile @media (max-width: 767px):**
- `.future-mobile-dashboard`: height `calc(100dvh - 60px - 60px - env(safe-area-inset-bottom))`, flex column, overflow hidden
- `.future-header-compact h2`: font-size 15px
- `#futureAvgBoxMobile`: font-size 10px, colore #64748b
- `#futureProjectionsGrid`: grid 2 colonne, gap 10px, flex: 1, min-height: 0
- `.proj-card`: flex centered, border-left 4px colorato, border-radius 16px
- `#futureActionHub`: flex row, gap 8px, flex-shrink 0, 3 bottoni pari
- Regole per `#futureSheetBody` e interni (.sheet-inputs-compact, .sheet-actions)

**script.js — Refactor e nuove funzioni:**
- `renderFutureProjections()`: ora popola anche `#futureProjectionsGrid` (mobile) oltre a `#futureProjectionsList` (desktop); aggiorna anche `#futureAvgBoxMobile`
- `resetFutureSimulation()`: resetta anche `#simulatedExpenseMobile`
- `openFutureSheet(action)`: apre bottom sheet con contenuto dinamico per simula/scadenze/ia
- `closeFutureSheet()`: chiude bottom sheet
- `renderFutureProjectionsPreview(container, simAmount)`: proiezioni dentro il sheet (per simulazione live)
- `renderAnnualDeadlinesInSheet()`: scadenziario interattivo dentro il sheet
- Event binding: Action Hub click → `openFutureSheet`, overlay click → `closeFutureSheet`
- Swipe-to-close su `#futureBottomSheet` via touch events sul drag handle

### 🎯 Status: COMPLETATO
- Tab Previsioni su mobile ora occupa esattamente viewport (zero-scroll)
- 6 proiezioni in griglia 2×3 compatta
- 3 azioni (Simula, Scadenze, IA) in Action Hub bottom
- Ogni azione apre bottom sheet dedicato con interazione completa
- Desktop invariato

---

## [2026-07-23] - Fix Header Scroll, 3 Card Grid & Mobile Zero-Scroll (Analisi Tab)

### ✅ Completed Changes

**style.css - Mobile CSS (max-width: 767px):**
- `#history-tab.active`: height cambiata da `calc(100dvh - 65px - ...)` a `calc(100dvh - 60px - 60px - env(safe-area-inset-bottom))` (header 60px + navbar 60px)
- Aggiunto `position: relative` e `box-sizing: border-box` al tab per contenere icone absolute
- Padding tab: da `10px` a `8px 12px`

**style.css - Records Hub: orizzontale → griglia 3 colonne:**
- `.records-hub-scroll`: da `display: flex; overflow-x: auto` con card `flex: 0 0 45%` a `display: grid; grid-template-columns: repeat(3, 1fr); overflow: visible`
- Card: padding ridotto a `6px 4px`, `min-width: 0`, `max-width: none`
- Label: font-size `10px`, `text-transform: uppercase`, `letter-spacing: 0.3px`
- Value: font-size `12px`, `font-weight: 700`
- `#recordsHubContainer`: aggiunto `margin-top: 36px` per fare spazio alle icone absolute

**style.css - Icone Azione (🤖 📋) in alto a destra:**
- `.analisi-top-actions`: da `flex-shrink: 0` inline a `position: absolute; top: 8px; right: 12px; z-index: 5`
- Pulsanti ridotti: `36px` (da 40px), font-size `17px` (da 20px)
- Aggiunto `backdrop-filter: blur(4px)` per effetto vetro

**Chart.js — già corretto:**
- `responsive: true, maintainAspectRatio: false` già presenti
- `#chartsCard` già con `flex: 1; min-height: 0; display: flex; flex-direction: column`

### 🎯 Status: COMPLETATO
- Tab Analisi occupa solo spazio residuo tra header e navbar
- 3 card record in griglia compatta 3 colonne (nessun taglio)
- Icone IA e Archivio fluttuanti in alto a destra
- Grafico riempie flessibilmente lo spazio restante

---

## [2026-07-22] - Bottom Sheet Dynamic Category Grid with Colorful Tiles

### ✅ Completed Changes

**script.js - renderMicroCategoriesGrid() Rewrite:**
- Ora legge le categorie da `userMacroCategories[macroGroup]` (localStorage) invece che da `CATEGORIES_MAP` hardcoded
- Se la macro-categoria è vuota, mostra messaggio "Nessuna categoria presente. Aggiungila nelle Impostazioni"
- Genera wrapper `.bottom-sheet-grid` con card `.bottom-sheet-cat-card`
- Ogni card ha: `data-id="NOME"`, `.cat-icon-wrap` con `<i class="fas FA_ICON">`, `.cat-name`
- Sfondi pastello calcolati da `getCategoryCardBg()` per colori unici per categoria
- Click sulla card → `slideToInputView(cat)` (transizione orizzontale al form input)

**script.js - getFaIcon() Helper (NEW):**
- Mappa nome categoria → icona FontAwesome cercando in `CATEGORIES_MAP`
- Fallback: `fa-tag` per categorie non presenti nella mappa

**style.css - Bottom Sheet Grid Styles (NEW):**
- `.bottom-sheet-grid`: grid 3 colonne, gap 12px, max-height 60vh, overflow-y auto
- `.bottom-sheet-cat-card`: flex column, border-radius 18px, box-shadow, `:active` scale(0.94)
- `.cat-icon-wrap`: font-size 1.5rem, margin-bottom 6px
- `.cat-name`: font-size 0.75rem, font-weight 600
- `.bottom-sheet-empty`: messaggio vuoto centrato
- `#microCategoriesGrid`: override `display: block !important` (forza visibilità dentro bottom sheet nonostante classe `.category-grid-mobile`)

### 🎯 Status: COMPLETATO
- Click su macro-card (Casa/Veicoli/Svago) apre Bottom Sheet con griglia colorata 3 colonne
- Categorie lette dinamicamente da localStorage (impostazioni)
- Tessere con icone FontAwesome e sfondi pastello unici per categoria
- Messaggio empty-state se nessuna categoria presente

---

## [2026-07-22] - Back Button Flexbox Fix & Progress Bar on Category Tiles

### ✅ Completed Changes

**index.html - Header Refactor:**
- Sostituito `<div class="sheet-header">` con `<div class="bottom-sheet-header">` (flexbox)
- Bottone back rinominato: `#sheetBackBtn` → `#btn-back-to-categories`, classe `.btn-back-sheet`
- Titolo rinominato: `#sheetTitle` → `#selected-category-title`, classe `.sheet-title`
- Freccia indietro ora in flexbox inline affiancata al titolo (non più absolute positioning)

**style.css - Back Button Styles Replaced:**
- Rimosse vecchie regole `.sheet-back-btn` (absolute, top/left/translateY)
- Nuovo `.bottom-sheet-header`: `display: flex; align-items: center; gap: 12px; padding: 10px 16px;`
- Nuovo `.btn-back-sheet`: sfondo `#f0f2f5`, 36×36, border-radius 50%, `:active` più scuro

**style.css - Progress Bar Styles (NEW):**
- `.cat-progress-track`: `width: 80%; height: 4px; background: #e9ecef; border-radius: 4px; margin-top: 8px;`
- `.cat-progress-bar`: `height: 100%; border-radius: 4px; transition: width 0.3s ease, background-color 0.3s ease;`

**script.js - Selector Updates:**
- `getElementById('sheetBackBtn')` → `getElementById('btn-back-to-categories')` (4 occorrenze)
- `getElementById('sheetTitle')` → `getElementById('selected-category-title')` (3 occorrenze)

**script.js - Progress Bar in renderMicroCategoriesGrid():**
- Calcolo somme Planned/Actual per categoria da `currentData.expenses`
- `perc = Math.min((aVal / pVal) * 100, 100)` se `pVal > 0`, altrimenti 0%
- `barColor`: verde `#2a9d8f` (0-70%), giallo `#e9c46a` (71-99%), rosso `#e76f51` (≥100%)
- Barra HTML iniettata in ogni `.bottom-sheet-cat-card`

### 🎯 Status: COMPLETATO
- Freccia indietro pulita e allineata a sinistra accanto al titolo (flexbox)
- Ogni tessera categoria mostra barra progresso colorata (verde/giallo/rosso)
- Barra si aggiorna in base ai dati del mese corrente

---

## [2026-07-22] - Bottom Sheet UX Optimization (Drag Handle, Scroll Fix, Z-Index)

### ✅ Completed Changes

**index.html - Drag Handle Wrapper:**
- Sostituito `<div class="sheet-handle">` con `<div class="drag-handle-wrapper"><div class="sheet-handle"></div></div>`
- La lineetta visiva è invariata, ma ora ha un wrapper con padding generoso per l'area di tocco

**style.css - Drag Handle Refactor:**
- Rimosse le vecchie regole `.sheet-handle` (width/height/background/touch-action)
- Nuovo `.drag-handle-wrapper`: `padding: 20px 0`, `touch-action: none`, `cursor: grab`
- `.sheet-handle` ora ha solo regole visive: 40px × 5px, `background: #d1d5db`, `border-radius: 10px`
- `.bottom-sheet` z-index portato a `10000 !important` (sopra la navbar)

**style.css - Scroll Chaining Fix:**
- Aggiunto `.bottom-sheet .sheet-slider .sheet-view .sheet-body` con `overscroll-behavior-y: contain !important`
- Stesso selettore con `padding-bottom: calc(85px + env(safe-area-inset-bottom)) !important` per evitare che navbar copra il bottone Salva

**script.js - Swipe Handler Refactor (setupSwipeToClose):**
- Ora agganciato a `.drag-handle-wrapper` e `.sheet-header` (non più a `.sheet-handle`)
- Event listener condivisi tra multiple target per maggiore area di presa
- Tocco registrato fluidamente anche fuori dalla lineetta esatta

### 🎯 Status: COMPLETATO
- Area di tocco drag handle molto più larga (padding 20px sopra/sotto)
- Scroll interno non fa muovere la pagina dietro (overscroll-behavior: contain)
- Bottone Salva sempre visibile (padding-bottom 85px + safe-area)
- Body scroll disabilitato quando sheet aperto, ripristinato alla chiusura

---

## [2026-07-22] - Hierarchical Category Management System (Settings UI)

### ✅ Completed Changes

**script.js - Data Structure Rewrite:**
- Sostituito `DEFAULT_CATEGORIES` (array di 29 oggetti) con `defaultCategories` (oggetto con 3 macro, 20 voci)
- Aggiunte costanti helper: `MACRO_LABELS`, `MACRO_ICON`, `MACRO_COLOR`, `DEFAULT_ICONS`
- Aggiunta variabile globale `userMacroCategories` (`{ casa_utenze: [...], veicoli: [...], spese_svago: [...] }`)
- Rimossa `ICON_OPTIONS` (non più utilizzata)
- Aggiunto `rebuildUserCategories()` — appiattisce `userMacroCategories` → `userCategories` (retro-compatibile)

**script.js - initCategories() Migration:**
- Carica categorie da DB con supporto campo `macro`
- Migrazione automatica: categorie esistenti senza `macro` → assegnate via `getCategoryMacroGroup()`
- Fallback: categorie legacy non in CATEGORIES_MAP → assegnate a `spese_svago`
- Se DB vuoto → seed con `defaultCategories` (20 categorie esatte)

**script.js - saveCategory() & deleteCategory() Refactor:**
- `saveCategory()`: ora legge macro da `<select id="newCatMacro">`, salva `{name, macro, icon}` in DB
- `deleteCategory()`: rimuove da `userMacroCategories[macro]` invece di flat filter
- `editCategory()`: aggiornato per impostare il select macro invece dell'icon selector

**script.js - renderFunctions Refactor:**
- `renderCategoriesDropdown()`: ora solo per dropdown spese (non più admin tag list)
- `renderMacroCategories()` (NEW): genera 3 blocchi HTML con header colorato, lista categorie, pulsante 🗑️
- `renderImportCheckboxList()`: adattato per appiattire `userMacroCategories`

**index.html - Settings Tab Rewrite:**
- Sostituito `<select id="newCatIcon">` (28 emoji) con `<select id="newCatMacro">` (3 macro-gruppi)
- Sostituita `<div id="categoriesAdminList">` con `<div id="macroCategoriesContainer">`
- Rimossa icon-selector, ora il form ha solo input testo + select macro + bottone

**style.css - Macro Block Styles (NEW):**
- `.macro-block`, `.macro-block-header`, `.macro-block-body`, `.macro-cat-item`, `.cat-delete-btn`, `.macro-cat-count`, `.macro-cat-empty`

### 🎯 Status: COMPLETATO
- Sistema gerarchico funzionante: 3 macro-categorie, 20 voci di default
- Aggiunta/rimozione categorie con associazione macro obbligatoria
- Visualizzazione a blocchi colorati nell'admin
- Piena retro-compatibilità con spese esistenti e backup JSON

---

## [2026-07-20] - CATEGORIES_MAP Data Structure & Bottom Sheet Logic (UPDATED)

### ✅ Completed Changes

**script.js - CATEGORIES_MAP Constant (Updated):**
- Restructured: chiavi semplificate `casa_utenze`, `veicoli`, `spese_svago`
- Formato semplificato: array diretto invece di oggetto con `subcategories`
- 20 categorie in totale (9 casa_utenze + 5 veicoli + 6 spese_svago)
- Proprietà: `id`, `nome`, `icona` (FontAwesome), `colore`

**script.js - getCategoryMacroGroup() Refactor:**
- Aggiornato per leggere direttamente da `CATEGORIES_MAP` con nuova struttura
- Loop su `Object.entries(CATEGORIES_MAP)` con `.some(sub => sub.nome === catName)`
- Fallback a `'spese_svago'` per categorie non mappate

**script.js - openBottomSheetFromMacro() Update:**
- Mappa titoli aggiornata: `casa_utenze` → "Casa e Utenze", `veicoli` → "Veicoli", `spese_svago` → "Spese e Svago"

**script.js - slideBackToCategories() Update:**
- Mappa titoli allineata alle nuove chiavi macro-categorie

**script.js - renderMicroCategoriesGrid() Refactor:**
- Ciclo diretto su `CATEGORIES_MAP[macroGroup]` (array), non più `.subcategories`
- Controllo `userCategories.includes(cat)` per mostrare solo categorie abilitate
- Icona e stili da `getCatIcon()` esistente

**index.html - Macro Card Data Attributes (Updated):**
- Aggiornato `data-category="casa_utenze"` su `.card-casa`
- `data-category="veicoli"` su `.card-veicoli` (invariato)
- Aggiornato `data-category="spese_svago"` su `.card-svago`

### 🎯 Status: COMPLETATO
- Struttura dati scalabile per macro-categorie (3 macro, 20 totali)
- Click su macro-card apre Bottom Sheet con sottocategorie dinamiche originali (20)

---

## [2026-07-20] - Millimetric Zero-Tolerance Space Fix (Mobile)

### ✅ Completed Changes

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

### 🎯 Status: COMPLETATO
- Spazio vuoto in fondo alla home eliminato
- Drag verso il basso sul Bottom Sheet non attiva più pull-to-refresh
- Scroll della pagina sottostante isolato durante interazione sheet

---

## [2026-07-19] - Global Scroll Unlock & Home Screen Space Optimization (Mobile-Only)

### ✅ Completed Changes

**style.css - Mobile CSS (max-width: 767px):**
- `overflow-y: auto !important` su html, body, .container, .main-container, .app-wrapper, #app, .page, .view, .section (sblocco scroll totale)
- `min-height: 100vh !important` al posto di `min-height: 0` per permettere contenuti lunghi
- `.container`: padding-bottom `calc(85px + env(safe-area-inset-bottom))` (spazio navbar)
- `#current-month-tab`: `height: auto`, `min-height: 0`, `padding-bottom: 20px` (compattazione home)
- `.main-layout`: `height: auto`, `min-height: 0` (nessun overflow vuoto)

### 🎯 Status: COMPLETATO
- Scroll verticale nativo funzionante su TUTTE le pagine mobile
- Pull-to-refresh ora attivo
- Schermata Mese compatta senza spazio vuoto in fondo
- Bottom navigation con 85px di spazio di sicurezza

---

## [2026-07-19] - Total Reset & Scroll Unblock (Mobile-Only)

### ✅ Completed Changes

**style.css - Mobile CSS (max-width: 767px):**
- Reset aggressivo su tutti i contenitori: `html, body, .container, .main-container, .app-wrapper, #app, .page, .view, .section`
- `overflow-y: auto !important` su tutti gli elementi strutturali
- `position: relative !important` per rimuovere position: fixed bloccanti
- `min-height: 100vh !important` per permettere allungamento naturale
- `-webkit-overflow-scrolling: touch !important` per scroll elastico iOS
- `.bottom-nav` mantiene `position: fixed` come unico elemento fixed

### 🎯 Status: COMPLETATO
- Scroll verticale totale riattivato su tutte le pagine mobile
- Pull-to-refresh ora funzionante
- Layout mobile mantiene header sticky e navbar fixed in fondo
- Desktop invariato

## [2026-07-19] - Native Vertical Scroll Restoration

### ✅ Completed Changes

**style.css - Mobile CSS (max-width: 767px):**
- `html, body`: sostituito `overflow: hidden` con `overflow-y: auto`, `position: fixed` con `position: relative`, `height: 100vh` con `min-height: 100vh`
- `.container`: sostituito `height: 100vh` con `min-height: 100vh`, `overflow: hidden` con `overflow-y: auto`
- Aggiunto `-webkit-overflow-scrolling: touch` per scroll fluido su iOS

### 🎯 Status: COMPLETATO
- Scroll verticale nativo e fluido riattivato su tutte le pagine mobile
- Possibilità di scrollare verso l'alto per aggiornare la pagina (pull-to-refresh)
- Layout mobile mantiene aspetto originale con flexibilità scroll

## [2026-07-19] - Macro-Card Proportions Optimization (Mobile)

### ✅ Completed Changes

**style.css - Mobile CSS (max-width: 768px):**
- `.mobile-dashboard-container`: `gap: 12px`, `padding: 8px 15px` (spazi più compatti)
- `.dash-card`: `min-height: 120px` (card Casa/Veicoli più basse)

---

## [2026-07-18] - Mobile Scroll Lock & Full-Screen Layout (Flexbox Radicale)

### ✅ Completed Changes

**style.css - Mobile CSS (max-width: 767px):**
- `html, body`: `margin: 0`, `padding: 0`, `height: 100vh`, `height: -webkit-fill-available`, `overflow: hidden`, `position: fixed`
- `.container`: `height: 100vh`, `display: flex`, `flex-direction: column`, `justify-content: space-between`, `align-items: center`, `padding: 10px 15px calc(85px + env(safe-area-inset-bottom)) 15px`
- `.mobile-dashboard-container`: `display: flex`, `flex-direction: column`, `flex-grow: 1`, `justify-content: center`, `gap: 12px`
- `.dash-card`: `flex: 1`, `min-height: 0`, `display: flex`, `flex-direction: column`, `justify-content: center`, `align-items: center`, `padding: 15px`
- `.summary-grid`: `width: 100%`, `margin-top: 5px`, `margin-bottom: 5px`

### 🎯 Status: COMPLETATO
- Layout mobile bloccato come app nativa
- Spazi equidistanti con flexbox space-between
- Nessuno scroll verticale disponibile
- Card distribuite equamente verticalmente

---

## [2026-07-18] - Bottom Navigation Mobile Redesign (iOS/Android Style)

### ✅ Completed Changes

**index.html - HTML Structure:**
- Sostituito `.header` + `.navigation-tabs` con nuova struttura bottom-nav
- Header semplificato a `<h1>` con sottotitolo per mobile
- Nuova navbar `.bottom-nav` con 4 voci anchor:
  - `#navMese` → icona `fa-calendar-day`, label "Mese"
  - `#navAnalisi` → icona `fa-chart-line`, label "Analisi"  
  - `#navPrevisioni` → icona `fa-crystal-ball`, label "Previsioni"
  - `#navImpostazioni` → icona `fa-cog`, label "Impostazioni"
- Click handler mantiene compatibilità con funzione `switchTab()` esistente
- Versione CSS bumpata a `?v=1.5`

**style.css - Mobile CSS (max-width: 767px):**
- `.bottom-nav`: position fixed bottom, width 100%, padding con `env(safe-area-inset-bottom)`
- `.nav-item`: flex column, gap 4px, icona sopra testo sotto
- `.nav-icon-wrapper`: padding 6px 16px, border-radius 20px, sfondo pillola
- `.nav-label`: font-size 11px, font-weight 500, sempre visibile
- Stato active: sfondo azzurro `#E8F0FE`, icona/testo blu `#1A73E8`, font-weight 700
- `.navigation-tabs` legacy nascosto
- Body padding-bottom: 95px per spazio navbar

### 🎯 Status: COMPLETATO
- Navbar fissata in basso su mobile con aspetto app nativa
- 4 voci con icona + label (testo sempre visibile)
- Stato active con pillola azzurra chiaro
- Desktop invariato

---

## [2026-07-17] - Bottom Sheet with Original Grid Injection & Horizontal Transition

### ✅ Completed Changes

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

### 🎯 Status: COMPLETATO
- Macro-card aprono Bottom Sheet con griglia micro-categorie filtrate
- Click su micro-categoria esegue transizione slide verso form input
- Back button permette di tornare alla griglia
- Card iniettate mantengono stili originali (colori, icone, progress bar)

---

## [2026-07-17] - Mobile Dashboard Macro-Card & CSS Fix

### ✅ Completed Changes

**index.html - Mobile Dashboard HTML:**
- Inserito nuovo blocco HTML `.mobile-dashboard-container` subito dopo la pillola del mese
- Aggiunta struttura `.dash-card` con 3 macro-card:
  - `.card-casa` → "Casa e Utenze" con icona `fa-home`
  - `.card-veicoli` → "Veicoli" con icona `fa-car`
  - `.card-svago` → "Spese e Svago" con icona `fa-shopping-cart`

**style.css - Mobile-Only CSS:**
- Navbar fissata in basso: `position: fixed; bottom: 0; left: 50%; transform: translateX(-50%)`
- Header sticky con glassmorphism chiaro, height 60px
- `.summary-grid` ripristinato con stile compatto (padding 8px 4px, font-size 10px)
- `.mobile-dashboard-container` nascosta di default, visibile solo in `@media (max-width: 768px)`
- Gradienti card: Casa (#1A8699→#28B4A6), Veicoli (#5AB963→#8AD458), Svago (#8E2DE2→#4A00E0, grid-column span 2)
- Elementi nascosti su mobile: `.category-grid-mobile`, `.macro-tabs-wrapper`
- Body con `padding-bottom: 100px` per spazio navbar

### 🎯 Status: COMPLETATO
- Dashboard mobile visibile esclusivamente su schermi ≤768px
- Header e navbar funzionanti correttamente
- Summary cards compatte mostrate tra mese e macro-card
## [2026-08-11] Investimenti tab polish
- Restyled Investimenti tab: hero stat card, asset grid (mobile scroll) + desktop list, type buttons, movements rows, premium purple active nav state.
- Restored `.popup-body`/`.btn-small` utilities.
- Verified id/function cross-references and JS syntax.

## [2026-08-11] Fase 4 - Spese Condivise
- Pannello Dividi Spesa nel bottom sheet mobile: toggle, persona/gruppo, payer pills, split pills (equal/%/fixed), preview importo.
- Popup Spese Condivise: tab Saldi (debiti/crediti, salda), tab Gruppi (crea, membri, cassa comune), detail ledger dark per persona/gruppo.
- Logica quota propria in saveTransactionFromSheet (planned/actual per payer) + saveSharedSplits.
- settleBalance: credito sottrae actual, debito converte planned->actual.
- Migrazione SQL + adapter Supabase + backup estesi.

## [2026-08-11] Fase 5 - Rendiconto esteso + Modifica spesa
- Nuova Entrata mobile (income bottom sheet, swipe-to-close, btn nel popup rendiconto).
- Liste entrate/spese nel popup rendiconto con delete; righe cliccabili -> modifica.
- editExpense + saveTransactionFromSheet edit mode (update in-place o clone con settled).
- Badge "Saldata" su expenses (settled) da edit type-change e settleBalance.
- FIX: bottom sheet mobile spese non si apriva (id sbagliato sheetCategoryTitle).

## [2026-08-11] Fase 6 - Popup mobile: Ricerca, IA Mese, Action Hub
- Action hub mese mobile (#mese-action-hub, 3 pulsanti Ricerca/IA/Condividi) al posto di condivise-entry-btn; "Condividi" riusa openCondivisePopup.
- Popup Ricerca (searchPopup): input + periodo (corrente/tutti/mese specifico) + risultati spese/entrate con icona categoria e % condivisa.
- Popup IA Mese (iaMonthPopup): runIaMonthAnalysis costruisce il prompt dai dati del mese (categorie, risparmio, budget) e riusa callAIEndpoint esistente; salva l'esito nelle note IA (months.iaNotes via saveNotes).
- FIX: tab Saldi/Gruppi popup Spese Condivise non commutable (mancava onclick su switchCondiviseTab).
- CSS: #mese-action-hub + bottoni (pills flessibili); rimossa classe orfana .condivise-entry-btn.

## [2026-08-11] Fase 7 - Rifiniture Impostazioni (Emoji picker categorie)
- HTML: emojiPickerBtn + emojiInput (input nascosto) nel grid-inputs categorie impostazioni, prima di newCatName.
- JS: IIFE setupEmojiPicker (tap -> focus input nascosto con tastiera emoji nativa; input -> ultimo codepoint -> testo bottone; blur -> reset style); saveCategory usa chosenEmoji in entrambi i branch (edit: chosenEmoji || icona esistente || MACRO_ICON; nuovo: emoji scelta se != placeholder); editCategory prefill bottone con getCatIcon(cat).
- CSS: .emoji-picker-btn (cerchio 40px) + :active + .emoji-input-hidden (clip tecnica). Braces bilanciate.

## [2026-08-12] - Fix: contenitori glass micro-categorie (Casa/Veicoli/Spese) tagliati

### Completed Changes
- .card-glass: padding 6px -> 8px 6px (respiro verticale), overflow hidden -> visible (stop taglio icone)
- .card-micro-grid: height 100% -> auto (contenuto definisce l'altezza)
- .micro-cell / .micro-more / .micro-empty: height 100% -> auto
- .micro-cell i / .micro-more / .micro-empty: added flex-shrink: 0 (icone mai compresse)
- .card-body: overflow hidden -> visible (rimosso clip genitore)

### Status: COMPLETATO
- braces CSS 710/710 OK

## [2026-08-12] - Bottomsheet Mese: container micro-categorie compatti + badge previsione proattiva

### Completed Changes
- style.css: .bottom-sheet-grid max-height none (niente scroll interno, gap 10px); .bottom-sheet-cat-card padding 10px 6px; .cat-icon-wrap 1.3rem -> 9 container fissi senza scroll
- script.js: nuova getCategoryForecasts() -> per categoria: planned mese corrente se >0, altrimenti actual mese precedente (db query month prev)
- renderMacroBudgetBadge async: label 'Speso X su Y previsti'; barra rossa solo se previsti>0 e actual>previsti; previsti=0 -> barra neutra
- heroSpesePreviste (updateUI): previsione globale (stessa regola su tutte le categorie)

### Status: COMPLETATO
- node --check OK; braces CSS 710/710

## [2026-08-12] - Refactoring modal inserimento spesa: input importo compatto (niente spin) + azioni nota

### Completed Changes
- **Spin rotante ELIMINATO**: rimosse 2 ruote (#integerWheel/#decimalWheel), input hidden, initNativeWheels, syncWheelToInput, syncInputToWheel, vars ruota (selectedInteger/selectedDecimal/WHEEL_ITEM_HEIGHT/isScrollingProgrammatically/handlers) e tutti i CSS .wheel-*
- **Nuovo campo importo**: input type=text inputmode=decimal (tastierino numerico decimale su mobile) + simbolo � fisso a destra; getSheetAmount() con parsing virgola->punto
- **Note actions**: 2 pulsanti icona sotto la nota (fa-camera #btnNoteCamera, fa-paperclip #btnNoteAttach) con handler placeholder vuoti (.note-action-btn)
- **Compatto**: .sheet-amount-display height 150px -> auto (anche modal Entrata alleggerito); gap sheet-body 20->12, sheet-inputs 12->8, footer 20->10, header 15->8, recurring 12->8, shared-panel 10->8
- **Live preview Dividi Spesa**: refresh updateSplitFields su input importo quando il panel e' attivo

### Status: COMPLETATO
- node --check OK; braces CSS 704/704; zero residui wheel nel codice
