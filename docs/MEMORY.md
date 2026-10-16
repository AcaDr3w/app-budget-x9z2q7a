# Project Core Memory

## DESKTOP LAYOUT v3 (2026-10-16)

**Stato**: la pagina desktop scrolla (niente lock overflow). Mese usa `display:contents` + grid areas.

**Mese desktop**:
- Centro: selettore mese (frecce), KPI, macro, Categorie & Budget, Assistente I.A., registro + cerca.
- Destra: Nuova voce (tab Spesa + Sostenuta di default) → grafico progresso → calendario in basso.
- Click categoria → `startExpenseForCategory` (tab Spesa, categoria, focus Pagato).
- Click giorno calendario → filtra registro (ritoccare lo stesso giorno o «Togli filtro giorno» toglie il filtro).
- Hub: nascosti Ricerca e Condividi (la cerca è sul registro; Condivise è nel form).
- CSS ≤767 intatto.

**Analisi desktop**: sezioni titolate (Panoramica, Segnali, Risparmi, Record, Andamento, I.A., Mesi archiviati); IA in fondo.

**Cache**: `style.css?v=3.7`, `script.js?v=2.14`, SW `bilancio-pwa-v22`. IA accanto al mese (overlay). `resetTotalDB` pulisce anche obiettivi, investimenti, debiti, condivise e outbox.

## DESKTOP LAYOUT v2 (2026-10-16)

**Stato**: desktop non è più la UI mobile stirata. ≥768 è un layout Operate a pannelli: centro = contenuto, destra = inserimento. I popup restano solo dove serve focus (rendiconto, condivise, settings).

**Mese**: `#rendicontoCard` / `#categoryGridDesktop` nel canvas (`.mese-primary`), non nel rail. Rail = calendario + form + registro. Hub Ricerca → focus `#searchInput` (niente `#searchPopup`). Hub IA → `#iaNotesModal` inline (`position:static`). CSS ≤767 intatto; `#rendicontoCard` resta `hide-mobile`.

**Altri tab**: Analisi IA storica inline (`.ia-history-inline`, niente `iaModal` al tap). Previsioni: `.future-desktop-extras` (scadenze `#dlFormWrap-d` + IA `#iaFutureResponse`) a fianco del chart; `#futureActionHub` nascosto; `openFutureSheet` scrolla il pannello. Investimenti: `#investAddPopup` sempre visibile a destra; dettaglio asset inline sotto, non overlay.

**JS**: `isDesktop()` continua a bloccare lo sheet. `openSearchPopup` / hub IA / `openFutureSheet` / `openInvestAddSheet` / `onAiInsightCardTap` hanno ramo desktop.

**Cache**: `style.css?v=3.3`, `script.js?v=2.10`, SW `bilancio-pwa-v18`. Insight hero: `button{color:white}` override su `#heroInsightPill` con `--ia-strong` `!important`. Griglia categorie: fallback da `userMacroCategories` se `userCategories` è vuoto.

## DESKTOP = UI MOBILE ALLARGATA (2026-10-15)

**Stato**: un solo albero visivo ≥768. La dashboard mobile (Mese/Analisi/Previsioni/Investimenti) è il canvas desktop; i cloni `.hide-mobile` poveri sono anche `.hide-desktop` (sempre nascosti).

**Causa del “vuoto/rotto”**: due HTML per tab. Su desktop il grafico Mese non aveva cap nel media mobile (70/120px solo ≤767, più `.chart-card-single{max-height:140px}` globale) e `#mese-action-hub` era `hide-desktop`; il rail 3-colonne stava sotto il fold. Analisi/Future/Invest nascondevano le dashboard funzionanti e JS dipingeva canvas `display:none` (`futureChartCanvasD`).

**Contratto ≥768** (media in coda a `style.css`, **non** si tocca `@media (max-width: 767px)`):
- Body/container scrollano (override del lock `overflow:hidden` @1200).
- Mese: griglia `mese-primary | rail`. Chart `.chart-container-box` 260px. 4 macro in riga (≥1024; 2 col sotto). `.month-head` nascosto. Hub Ricerca/IA/Condividi visibile. Rail: calendario + form Nuova voce + `#categoryGridDesktop` + `#entriesCard`.
- Analisi: KPI/carousel/savings visibili + grafici grandi + tabella mesi. `renderAnalisiMobile` + `renderGlobalHistory` su ogni viewport.
- Previsioni/Invest: `.future-mobile-dashboard` / `.invest-mobile-dashboard`. JS: solo `futureChartCanvas` e `investAssetGrid`.
- Sheet/FAB/bottom-nav restano nascosti; `isDesktop()` continua a bloccare `openTransactionSheet`.

**Cache**: `style.css?v=3.3`, `script.js?v=2.10`, SW `bilancio-pwa-v18`. Insight hero: `button{color:white}` override su `#heroInsightPill` con `--ia-strong` `!important`. Griglia categorie: fallback da `userMacroCategories` se `userCategories` è vuoto.

## SPESE CONDIVISE POPUP (2026-10-15)

**Stato**: popup `#popup-spese-condivise` ridisegnato (resta popup, non bottomsheet). Salda nel footer del dettaglio, non in lista.

**Cause dei bug screenshot**:
- `js/ui-dialogs.js` non era in `index.html` → `showPromptDialog`/`showConfirmDialog` ReferenceError (Salda e confirm elimina).
- `button { width: 100% }` globale gonfiava `.btn-add-solid` / `.btn-settle` a tutta riga: quadrato vuoto accanto ad Aggiungi, Salda overlay sulla riga sotto, scrollbar orizzontale.
- Net lista usava `Number(person_id)` + `p.id ===` → mismatch stringa/number dal cloud, tutti "In pari".
- `@media 360px` wrappava input+bottone al 100% (peggiorava il width 100%).
- `getSimplifiedDebts` mutava i net dei membri (cloni ora).

**Contratto saldo**: `netTheyOweMe` solo su spese dove ci sono io e l'amico. Hero = somma di quei net. Badge lista: Ti deve / Devi / In pari + importo, niente Salda in riga. Dettaglio: ledger + footer sticky con `parseAmountInput`. Gruppi: stesso pattern; footer Salda quota solo se io devo; bottone spesa solo se `unpaidGap(me) > 0`.

**ID**: `sameId` / `findPersonById` / `findGroupById` su match people/gruppi/partecipanti. Dopo Salda: `loadPeopleGroups` + re-render dettaglio.

**Cache**: `style.css?v=3.3`, `script.js?v=2.10`, SW `bilancio-pwa-v18`. Insight hero: `button{color:white}` override su `#heroInsightPill` con `--ia-strong` `!important`. Griglia categorie: fallback da `userMacroCategories` se `userCategories` è vuoto. Script: `js/ui-dialogs.js` prima di `script.js`.

## 🔍 AUDIT DEBUG FUNZIONI (2026-10-15, COMPLETATO)

**Stato**: audit statico + runtime chiuso. Run 1: `chartB` dichiarato. Run verifica post-fix (locale 8765, `script.js?v=2.4`): id unici, parser IT, insight pill, `getSetting` definita, IA usa previste aperte.

**Harness (fuori repo, %TEMP%\ebpro-audit\)**: `smoke-server.mjs` (http 8765) + `smoke-run.mjs` (Chrome headless CDP porta 9333, viewport mobile 390/desktop 1280, WebSocket nativa node 24, ZERO dipendenze npm) + `stub-inject.js` (supabase Proxy thenable `{data:[],error:null,count:0}` + sessione fake `test-user-0001` + Chart fake, iniettato via `Page.addScriptToEvaluateOnNewDocument`; CDN bloccati con `--host-resolver-rules`). Riprendere: `node %TEMP%\ebpro-audit\smoke-run.mjs > %TEMP%\ebpro-audit\run.log 2>&1`; report JSON in `%TEMP%\ebpro-audit\report.json`. Rimuovere la riga `--remote-debugging-port=9333` da processi Chrome orfani prima di rilanciare.

**Esiti run 1** (prima del fix):
- Init OK: user autenticato fake, `mainAppWrapper` visibile.
- 15 step UI tutti PASS (switchTab ×4, mese prev/next, rendiconto, settings, drawer account, condivise, modal IA). Nota: `openIaNotesModal` passato ma selettore test sbagliato (conta `.popup-overlay`, non `.modal`).
- **1 eccezione**: `ReferenceError: chartB is not defined` @script.js:4514 (`renderDashboardCharts`, mini-chart modal IA). **FIX APPLICATO e verificato**: `let chartB = null, chartC = null;` prima della funzione.
- 2 warning benigni init: `[DB] put fallito su months/sync_state: utente non autenticato` (race auth iniziale, outbox protegge).
- Test funzionali 11/15 PASS. 4 FAIL: `parseAmountInput('1.200')→1.2` (separatore migliaia NON gestito: '1.200,50'→1.2, candidato fix); `foldLegacyMacroKeys` ritorna undefined (nessun return — side-effect su `userMacroCategories`, TEST corretto nel driver: verifica chiavi a 4); seed previste/sostenute `0 €` (il driver usava API sbagliata: serve Dexie-style `db.income.where('month').equals(m).toArray()` + chiamare `updateUI()` dopo `loadMonthData()` — driver corretto).

**Findings risolti (2026-10-15)**:
- **Id duplicati**: rimossa la griglia legacy `.dash-card` (KPI `month-head` desktop restano). `pctBadge-*` / `progressFill-*` / `budgetLabel-*` / `annualMonthAlert` ora count=1. Verifica: `dashCount=0`, 4 `.macro-card-white`.
- **`parseAmountInput` / `getSheetAmount`**: parser IT — `1.200`→1200, `1.200,50`→1200.5, `50,00`→50, `1.20` resta 1.2. Desktop `expPlanned`/`expActual` usano lo stesso helper.
- **`getSetting(key, fallback)`**: definita (legge `db.settings`). `#iaProviderSelect` resta assente (ramo UI morto, nessun crash).
- **`#heroInsightPill`**: ripristinata sotto i KPI mese. `renderHeroInsight` scrive il testo.
- **Modal IA**: `totals.planned = sumOpenPlanned(...)` (niente doppio conteggio planned+saldata).
- Id ancora assenti di proposito (UI tolta): `iaProviderSelect`, `futureCalMonthM`, `depositSavingsSelect`. Restano null-guarded.
- `data-act` 63 distinti tutti risolvibili (2 in supabase-adapter.js: `handleLogin`/`handleSignup`). `genId` duplicata ma identica → innocuo.

**PWA cache**: `CACHE_NAME = bilancio-pwa-v18`; `script.js?v=2.10`, `style.css?v=3.3`.

## 🧹 CONFIG LOCALI STRUMENTI: SOLO SKILLS + MCP (2026-10-15)
- **Politica repo**: gli strumenti usano la config GLOBALE (`~/.config/opencode/opencode.jsonc`, `~/.pi/agent/`). Localmente si tengono SOLO skills e MCP. Niente model/provider/lsp/permission/plugin in locale.
- **Opendcode**: `.opencode/` contiene solo `skills/` (9 skill uniche, non esistono in globale), `skills-manifest.json` (manifest discovery), `instructions.md` (regole agente) e `.gitignore`. I plugin locali npm (`package.json`/`package-lock.json`/`node_modules` con `@opencode-ai/plugin`) sono stati RIMOSSI (backup `.config-backup-20261015/`) — non reinstallarli.
- **pi**: nel progetto NON esiste `.pi/` (mcp/settings/auth/models tutti globali in `~/.pi/agent/`). L'unica cosa locale di pi è la skill `impeccable` in `.agents/skills/` (locked da `skills-lock.json` radice, source `pbakaus/impeccable`).
- **Backup ripristino**: tutto in `.config-backup-20261015/` (package.json, package-lock.json, node_modules). Ripristino = spostarli indietro in `.opencode/`.
- **MCP**: solo globali — opencode: codegraph, sequential-thinking, context7, bonsai; pi: codegraph, sequential-thinking, context7. Nessun MCP locale. Non toccare i file globali né le env `OMNIROUTE_API_KEY`/`OPENROUTER_API_KEY`.

> Storico dettagliato: docs/archive/memory_archive.md + docs/archive/changelog_*.md.

## 🧾 SCONTRINO ASINCRONO — foto → job → notifica → conferma (2026-08-21)
- **Flusso**: attach foto → `startReceiptJob` (downscale → upload storage `receipts/<uid>/<jobId>.jpg` → riga `receipt_jobs` status `pending` → fire-and-forget edge `process-receipt`) → l'utente salva la spesa e il job viene linkato (`expense_id`) → quando l'IA risponde: **barra fixed `.receipt-confirm-bar`** + `new Notification` (se permesso) → tap Conferma → `editExpense(Number(job.expense_id))` con importo precompilato → il job e la foto vengono ELIMINATI (foto mai persistite oltre la conferma).
- **Edge `process-receipt`** (auth JWT come chat-openrouter): job → `processing` → download foto dallo storage (come utente, RLS ok) → OpenRouter vision (stessa `VISION_MODELS` di chat-openrouter — **mantenere sincronizzate**) → aggiorna job `done` con `{importo, negozio, data_scontrino, categoria_suggerita}` o `failed` con `error`. Timeout 45s/model, temperature 0.2.
- **Tabella `receipt_jobs`** (migration `20260821_receipt_jobs.sql`): `id` TEXT PK, `user_id`, `expense_id` (TEXT — **dalla cloud torna STRINGA**: normalizzare con `Number()` prima di confronti con `exp.id` numerico), `status` `pending|processing|done|failed`, `importo`, `negozio`, `data_scontrino`, `categoria_suggerita`, `error`, `created_at`, `updated_at`. RLS user_id::text = auth.uid()::text. Bucket storage privato `receipts` con policy `(storage.foldername(name))[1] = auth.uid()::text` (insert/select/update/delete propri). Allowlist adapter: 11 colonne.
- **Polling client** (10s, `startReceiptPolling` da `setupReceiptNoteActions` + resume su `visibilitychange`): job `done/failed` nuovi → banner (dedupe `receiptNotified` in memoria + `eb_receipt_ignored_<id>` in localStorage per lo ✕); self-healing: job `processing` da >2min → ri-invoca `process-receipt`; banner "Riprova" → cancella il flag e ri-invoca.
- **Cleanup**: `clearReceiptPreview` (chiusura/cancellazione sheet) elimina job orfani (senza `expense_id`) + foto; `confirmReceiptJob` elimina job + foto. Guardia anti-assurdo >500€ non più necessaria (l'importo è visibile nel banner prima della conferma esplicita).
- La vecchia `analyzeReceipt` sincrona (vision nel client via chat-openrouter) è RIMOSSA — non ripristinare.

## 📸 FOTO SCONTRINO -> VISION IA -> IMPORTO (2026-08-21)
- **Pulsanti**: `#btnNoteCamera` (capture) / `#btnNoteAttach` (galleria) nel bottom sheet → input hidden `#receiptCamInput`/`#receiptAttachInput` (`accept="image/*"`, `display:none`). Binding in `setupReceiptNoteActions()` (sostituisce i vecchi no-op).
- **Pipeline**: `handleReceiptFile` → `downscaleReceiptImage` (Image+canvas, lato lungo MAX 1280, JPEG 0.75 → base64 ≤ ~400KB, sotto il limite body delle Edge Functions) → `analyzeReceipt` → edge function `chat-openrouter` con **`vision: true`** → `parseAIJson` → importo in `#amountInput` (formato virgola `(n).toFixed(2).replace('.',',')`), negozio→`#sheetNote` se vuota, data→`#sheetDate` se `YYYY-MM-DD`, categoria→`sheetSelectedCategory`+titolo se in `userCategories`.
- **FOTO MAI PERSISTITA** (decisione utente): `finally { clearReceiptPreview() }` elimina preview + `URL.revokeObjectURL` appena l'IA risponde; cleanup anche in `closeTransactionSheet()`/`slideToInputView()`. Guardia anti-concorrenza `receiptPending` (bottoni no-op durante l'analisi). Nessuna colonna DB/allowlist da aggiungere.
- **Edge function**: flag `vision` nel body → candidate SOLO `VISION_MODELS`. **⚠ 2026-08-21: free tier Gemini CHIUSO da Google** — i vecchi ID (`gemini-2.x-exp:free`, `llama-3.3-70b:free`, `qwen-2.5-coder:free`) sono delistati e falliscono. Liste attuali: `VISION_MODELS` = `google/gemma-4-31b-it:free`, `google/gemma-4-26b-a4b-it:free`, `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free`, `nvidia/nemotron-nano-12b-v2-vl:free`, `openrouter/free` (ultima spiaggia, filtra per image-input); `FALLBACK_MODELS` = `inclusionai/ling-3.0-flash:free`, `z-ai/glm-5.2:free`, `nvidia/nemotron-3-ultra-550b-a55b:free`, `openai/gpt-oss-20b:free`, `openrouter/free`. Il catalogo free churna ogni settimana → rivedere le liste su https://openrouter.ai/collections/free-models se "tutti i modelli free falliti". Timeout: 30s testo, 45s vision. `messages` passano invariati → i `content` array `[{type:'text'},{type:'image_url', image_url:{url:dataUri}}]` funzionano senza altro. Il dropdown UI si auto-popola via `fetchFreeModels()` (non hardcodare gli ID lì).
- **Prompt OCR (2026-08-21)**: system + user blindati — importo = SOLO l'ultimo importo in fondo (preceduto da TOTALE/TOTAL/DA PAGARE/IMPORTO/TOT. €), MAI sommare le voci né il totale a se stesso; few-shot nell'user; campo diagnostico `somma_voci` nel JSON (non usato per il fill). Guardia anti-assurdo client-side: `importo > 500€` → `showConfirmDialog` prima di compilare (rifiuto = non scrive).
- **System prompt**: rispondi SEMPRE e SOLO JSON `{"importo": number|null, "somma_voci": number|null, "negozio": string|null, "data": "YYYY-MM-DD"|null, "categoria_suggerita": string|null}`; importo null = scontrino non riconosciuto (toast errore).
- **HEIC iOS**: Safari transcodifica in JPEG su `capture`; se il file non è decodificabile → toast errore.

## MOBILE TRUNCATION RULES (2026-08-19)
- **Label/descrizioni brevi su mobile**: MAI `white-space:nowrap`+ellipsis per label che possono superare la card (`.trend-label`, `.trend-delta`, `.card-progress-label`, `.hero-mini-label`, `.savings-sub`, `.hub-text`). Pattern: `display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; overflow-wrap:anywhere`.
- **Valori numerici** (`.trend-value`, `.hero-mini-value`): `nowrap`+ellipsis OK ma con `max-width:100%` e `overflow-wrap:anywhere` come fallback. `.invest-hero-value`: `white-space:normal` + `overflow-wrap:anywhere` (può spezzarsi).
- **Zero horizontal scroll invariante**: `html/body` bloccati su mobile; ogni contenitore largo (tabelle `min-width:640px`, records-hub, marquee, sheet-slider) DEVE stare dentro un wrapper `overflow-x:auto/hidden`. Verificato con audit headless (scrollWidth==clientWidth a 320-414px).
- **False positive da ignorare nell'audit**: `.ai-insight-track` (marquee intenzionale, `width:max-content`), `.ai-insight-refresh` (scrollWidth>clientWidth per il `::before{inset:-5px}` dell'hit-area), `.sheet-slider` (pager orizzontale nascosto).
- **Audit harness (fuori repo, Temp)**: `audit-server.mjs` (stub Supabase con sessione fake: `onAuthStateChange` fire con session → `mainAppWrapper` visibile, tabelle = Proxy thenable `{data:[],error:null,count:0}`) + `cdp-shots.mjs` (Chrome `--headless=new --remote-debugging-port`, misura CUT/TRUNC per tab×viewport). Screenshot evidenza in `docs/audit/before|after/`.

## NORMALIZE INVARIANTS (2026-08-19)
- **Type floor**: nessun font-size < 10px, incluso .5 (es. 8.5/9.5px VIETATI — `.anomaly-header`, `.savings-header`, `.savings-target-label`, `.future-milestone .fm-label/.fm-delta`, `.dl-micro-meta` riportati a 10px).
- **Radii scale**: 8 (piccoli controlli) / 10 (input, calendar-day) / 12-16 (card) / 20 / 999 (pill). Input/select/textarea 10px; btn-action/cat-del-btn/income-row-del/dl-type-btn/split-pill/condivise-tab/form-tab 8px; `.sim-growth-input` NIENTE `!important`.
- **Motion scale**: durate solo 0.15s / 0.3s / 0.5s (0.18/0.25/0.35/0.4s normalizzati).
- **Shadow tokens**: `--shadow-card`, `--shadow-card-hover`, `--shadow-float` (soft lift), `--shadow-knob` (1px 4px), `--shadow-popup` (overlay). Niente box-shadow letterali fuori da questi.
- **`.btn-ghost-del`** (.lg per 16px): delete ghost pattern nei template JS (deleteSavingsGoal, deleteInvestMovement) — non re-introdurre style inline.
- **`.macro-group-header`**: background `--border-faint`, NESSUN border-left colore (craft floor). I 3 header macro non hanno più inline style.
- **Flat-report colors**: `#ff9800`→`--previsto`, `#e53935`→`--sostenuto` (proiezioni); `#22c55e`→`--entrate` (ledger paid/saldo). Keep `!important` dove presente.

## MENU WIRING (2026-09-15)
- **Tab interni = `data-act`, mai IIFE `wireTabs`**: form desktop (`data-formtab` + `data-act="switchFormTab"`) e modal IA (`data-iatab` + `data-act="switchIaNotesTab"`). `wireTabs` usava la stessa chiave per dataset E prefisso id pane (`formPane`/`iaPane`) ma l'HTML ha `data-formtab`/`data-iatab` → `undefined.charAt` al click. NON reintrodurre.
- **Nav principale**: top-nav + bottom-nav → `data-act="switchTab"` + `data-args='["<tab-id>"]'`. `TAB_TITLES` = Mese/Analisi/Investimenti/Previsioni. Impostazioni NON è un tab: avatar (`openAccountDrawer`) apre `#accountDrawer`. Bottom nav: `Mese | Analisi | #navQuickAdd (+) | Investimenti | Previsioni`. Il `+` non è un tab.
- **Altri menu già delegati**: settings tiles → `openSettingsPopup`; condivise Amici/Gruppi → `switchCondiviseTab`; hub mese `#mese-action-hub [data-action]`; hub previsioni `#futureActionHub [data-action]`.
- **HTML**: `.container` si chiude PRIMA di `</main>`; overlay/sheet restano fratelli di `<main>` dentro `#mainAppWrapper`.
- **Tab Analisi/Investimenti/Previsioni/Impostazioni MAI orfani**: `#current-month-tab` NON si chiude dopo il blocco mobile Mese. I quattro tab (`#history-tab` ~583, `#future-tab` ~749, `#investimenti-tab` ~834, `#settings-tab` ~921) devono restare dentro `#mainAppWrapper` > `#appMain` > `.container`. Se escono dal wrapper, `overflow:hidden` su body/container li taglia → schermata bianca. NON è contenuto cancellato: è solo l'albero HTML.
- **`anomalyTimer`**: dichiarato accanto a `searchQuery` (`let anomalyTimer = null`). `stopAnomalyCarousel()` lo legge; senza dichiarazione `switchTab` verso Investimenti/Previsioni/Impostazioni lancia ReferenceError. `stopAnomalyCarousel` è difensivo (`typeof` + try/catch in `switchTab`).
- **PWA cache**: `CACHE_NAME = bilancio-pwa-v14`; fetch same-origin con `{ cache: 'no-store' }`. `script.js?v=2.6`, `style.css?v=2.9`. Dopo un fix JS/CSS, bumpare `?v=` E `CACHE_NAME` altrimenti il SW/HTTP cache serve i file vecchi.

## CATEGORIE (2026-09-15)
- **Fonte di verità**: `userMacroCategories` con SOLO le 4 chiavi `casa` / `cibo` / `veicoli` / `svago_altro`. Alias legacy `casa_utenze` → `casa`, `spese_svago`/`svago` → `svago_altro` via `foldLegacyMacroKeys()` in `loadCategories`.
- **`getCategoryMacroGroup`**: prima cerca in `userMacroCategories`, poi `CATEGORIES_MAP`. Mai usare solo la mappa statica (manca Bolletta Condominio e ignora le custom).
- **Mese card**: NESSUN elenco di microcategorie sotto Casa/Cibo/Veicoli/Svago (decisione 2026-09-15). `.card-micro-list` nascosta.
- **Grafico mese** (`renderMacroBudgetChart`): titolo "Progresso spesa mese corrente". 3 barre Entrate `#22c55e` / Spese Previste `#eab308` / Spese Sostenute `#ef4444` (importi euro, stessi del hero). Linee KPI `.line-entrate/.line-previste/.line-sostenute` = stessi colori. Non ripristinare il grafico per-macro Budget vs Sostenuto.
- **Settings**: tile nel cassetto `#accountDrawer` (avatar header). Popup in `#accountPopups` (fuori dal transform del drawer). `openSettingsPopup` / `closeSettingsPopup` cercano `#accountPopups .popup-overlay`. Non reintrodurre tab Impostazioni in nav.
- **Plus radiale**: tap o hold+drag su `#navQuickAdd` apre arco 180° verso l’alto (macro → micro). Conferma → `openExpenseFormForCategory` (sheet già su `viewInput`, senza `openBottomSheetFromMacro`). Solo mobile. Nav 5 colonne uguali; il `+` è un cerchio 56px con bordo bianco e `translateY(-10px)` solo sul cerchio (niente `top` sul item).
- **Prevista aperta**: `isOpenPlanned(e)` = `planned > 0 && actual === 0 && !settled`. Hero, `#sumPrevisto`, `months.totalPlanned`, grafico mese e lista rendiconto usano SOLO queste. `getCategoryForecasts({ fallbackPrevActual })` può hintare le card macro vuote col mese scorso, **non** entra nei totali. Save condiviso: `planned` solo se tipo prevista. Edit prevista→sostenuta **in place** (niente clone). `payExpense` apre il form. Ultime tx: giallo/rosso + tap → `editExpense`.
- **`closeRendicontoPopup`**: `data-act-close` chiama la fn SENZA event → NON fare `event.preventDefault()` incondizionato (TypeError, X morta). Overlay e X chiudono.
- **Bottomsheet form (2026-09-15)**: sezioni Data/Nota + Documenti (scontrino/galleria) + Altre opzioni (ricorrente mensile + dividi). Header icona categoria via `setSheetCategoryIcon`. Toggle Sostenuta/Prevista filled. Ricorrenza resta solo mensile (`saveRecurringClones`). IDs invariati. Non toccare income/future.

## CONTENUTO TAB (non cancellare, 2026-09-15)
- **Analisi (`#history-tab`)**: periodo 3m/6m/year/custom, card insight IA, KPI swipe (media uscite / top crescita / scostamento budget), carosello anomalie, card risparmi, su desktop anche IA storica + registro mesi.
- **Investimenti (`#investimenti-tab`)**: hero Patrimonio/Cashflow/ROI, `+ Nuovo Asset / Salvadanaio`, griglia asset; desktop lista + sheet dettaglio/movimenti.
- **Previsioni (`#future-tab`)**: grafico proiezioni, simulatore what-if (slider + crescita % + reset), traguardi, hub Simula/Scadenze/IA Futura.
- **Impostazioni (drawer, non tab)**: tile Categorie, App & Notifiche, Backup, Cloud Drive, Ripetizioni, Zona Pericolo. Popup in `#accountPopups`. Spese Condivise resta popup a parte.

## INLINE ACTIONS DELEGATION (2026-08-19)
- **Zero `onclick=` inline** in index.html (113) e script.js (15): convertiti in `data-act`/`data-act-close`/`data-act-stop` + `data-args='<json>'`/`data-el`/`data-var`, gestiti dal delegated listener di `setupInlineActions()` (chiamata nel DOMContentLoaded iniziale). `data-act-close` invoca la fn SENZA event (le `close*` guardano `event && event.target !== currentTarget`); `data-act-stop` = no-op (pannelli popup). Speciali: `data-ai-refresh="1"` (stopPropagation + `generateInsightCard(true)`) e `data-import-trigger="1"` (`#importFileInput.click()`) con binding diretti (lo stopPropagation DEVE girare prima del listener delegato). Solo handler NON-click restano inline (12: oninput/onchange/onkeyup/onkeydown/onfocus/onblur — i 4 `onkeydown` di pill/summary/card rimossi il 2026-08-19). Tutte le 58 azioni risolvono a funzioni globali (2 in supabase-adapter.js: `window.handleLogin`/`handleSignup`).
- **KEYBOARD DELEGATION (2026-08-19)**: in `setupInlineActions()` c'è anche un delegated `keydown` — Enter/Space su `[role="button"][tabindex]` → `preventDefault()` + `el.click()` (copre 7 div attivi: hero pill, summary-box, dash-card, ai-insight-card). Guard nativo: se il target è `button/input/select/textarea/a[href]` il keydown non intercetta (NON rompere: il refresh dentro `#aiInsightCard` deve attivarsi da solo).

## ⚠ SUPABASE CDN = SINCRONO (2026-08-18)
- **`@supabase/supabase-js@2` (index.html:14) NON deve avere `defer`/`async`**: `supabase-adapter.js:4` usa `window.supabase.createClient()` a top-level (parse time). Un tentativo di defer ha rotto l'app (TypeError createClient). Google API invece può restare defer (usati solo post-DOMContentLoaded). **Chart.js NON è più nel `<head>`**: caricato lazy da `ensureChartJs()` (iniettato al primo `new Chart`).

## 🗂 TABLIST A11Y + TOUCH TARGET (2026-08-18)
- **`setupTablistA11y()`** (script.js, DOMContentLoaded): su ogni `[role="tablist"]` imposta `role="tab"` sui button, sincronizza `aria-selected` con `.active` (click + apertura), navigazione Frecce + Home/End con attivazione automatica (`next.click()`). Le `.condivise-tabs` hanno ora `role="tablist"` + `aria-label="Spese condivise"` (le altre tablist già presenti in HTML).
- **`.popup-close`**: hit-area 44×44 via `::before { inset:-6px }` — visuale 32px invariata. NON togliere il ::before.
- **`theme-color` = `#ffffff`** (header/bottom-nav mobili bianchi). `<title>` = "Bilancio Pro" senza emoji.

## ♿ ACCESSIBILITA' MODAL/SHEET — setupModalAccessibility (2026-08-18)
- **`setupModalAccessibility()`** (script.js, chiamata nel DOMContentLoaded iniziale): Esc chiude popup/sheet attivi, focus trap Tab/Shift+Tab, focus → primo focusable all'apertura, ripristino alla chiusura.
- **Meccanica**: MutationObserver su `class` di tutto il body; selettore overlay attivo = `.popup-overlay.active, #sheetOverlay.open, #incomeSheetOverlay.open, #futureSheetOverlay.open`; `focusScope()` per i sheet risolve il fratello tramite `SHEET_MAP` (overlay→sheet: `sheetOverlay`→`bottomSheet`, ecc. — il focus trap agisce sugli elementi DENTRO lo sheet, gli overlay sono vuoti). Flag `data-a11yFocused` su ogni overlay; ripulito su TUTTI i contenitori quando nulla è aperto (mai lasciare il flag su un overlay chiuso o il focus non parte alla riapertura).
- **Esc**: popup → click sul `.popup-close` interno; sheet → `click()` sull'overlay (tutti e 3 gli overlay hanno click-to-close bindato).
- **`#monthSelectorPill` è ora un `<button>` VERO** (era `div[role=button]` con 2 button annidati — invalido). Le frecce ‹ › vivono FUORI nel `.month-selector-group` (flex 1 1 100%, gap 6). Pill = `flex:1; margin-bottom:0` nel gruppo (larghezza invariata su mobile). `border:none; font-family:inherit` obbligatori sui button custom.
- **Auth modal**: stili inline → classi `.auth-*`; `display:none` in CSS, JS toggla `style.display='flex'|'none'` (supabase-adapter.js) — NON toccare il toggle.
- **html2pdf è lazy**: rimosso dal `<head>`; `ensureHtml2Pdf()` inietta il bundle on-demand in `exportPDF()`. supabase-js e chart.js hanno `defer`.
- **reduced-motion** (style.css, fine file): marquee fermo, transizioni annullate SOLO per movimento spaziale (anomaly-track, sheet/overlay/popup, sheet-slider, dragging). Niente kill globale delle transizioni.
- **`.box-sostenuto` = `rgba(185,28,28,.96)`** (bianco ≈5.9:1, WCAG AA). Vecchio rosso #e74c3c NON ripristinare.
- **Classi estratte da inline** (riusare, non re-inlineare): `.btn-violet` (gradient 8b5cf6→6366f1), `.record-card-{violet,gold,red}`, `.invest-type-grid`, `.danger-zone-box/-text/-title/.btn-danger-full`, `.ia-future-card`, `.ia-modal-title`, `.popup-panel > h3` (margine 0 0 8px sui direct-child), `.noscript-banner`, `.month-selector-group`.

## 🔮 DASHBOARD PREVISIONI — architettura proiezioni (2026-08-18)
- **Tre linee separate nel grafico** (`renderFutureChart`, Chart.js): Patrimonio (base blu), Simulazione (verde #10b981 se slider>0 / rossa #ef4444 se <0, solo se ≠0), Investimenti (viola tratteggiata). MAI sommate tra loro — le due "crescita patrimonio" e "previsioni investimenti" sono proiezioni indipendenti.
- **`buildProjectionSeries(base, simAmount)`**: 121 punti mensili (0→10 anni), `patrimonio[t] = Σ(risparmio medio + simAmount) + aggiustamenti`. Aggiustamenti: one-off → −amount nel mese; ricorrente già attiva (start ≤ oggi) → +amount DOPO `endMonth` (la rata è già dentro la media storica → alla fine torna libera, scalino visibile); ricorrente futura → −amount da start a end. `isPaid` esclusi.
- **`buildInvestSeries(base, growthPct)`**: `base.investBase` = Σ `calcInvestStats(a, movs).currentValue` su `currentInvestments`; crescita composta mensile `(1+r/12)^t`, r da input `#futureInvestGrowth`/`#futureInvestGrowthM` (default 4, sincronizzati da `onFutureInvestGrowthInput`).
- **Scadenze ricorrenti**: `annual_deadlines` ha `recurring` (bool) + `endMonth` (TEXT YYYY-MM); `month` = mese evento (one-off) o start (ricorrente); `day` vuoto = intero mese. Richiede migration `20260818_recurring_deadlines.sql` (2 ALTER ADD COLUMN IF NOT EXISTS) + colonne in allowlist `_allowedColumns` adapter.
- **Planner condiviso**: `plannerFormHTML(p)` genera il form per prefisso `d` (desktop, iniettato in `#dlFormWrap-d` al DOMContentLoaded) e `s` (sheet mobile, iniettato in `openFutureSheet('scadenze')`). MAI duplicare id senza prefisso. `renderDeadlineListFor(p)` idem. Il calendario dedicato è stato rimosso (vedi sezione sopra).
- **`updateFutureDashboard()`** = orchestratore unico (base → sottotitolo → milestone → chart → liste/calendari): chiamata da switchTab future-tab, slider, growth, add/delete/toggle scadenza. `renderFutureChart` fa no-op se canvas nascosto (`offsetParent === null`) — il render avviene al cambio tab.
- **Chart.js su tab nascosto**: canvas in tab `display:none` ha dimensione 0 → distruggere/ricreare l'istanza `futureChart` SOLO quando il tab è attivo.
- **Slider bipolare**: `futureSimAmount` variabile globale; `syncSimSlider()` allinea entrambe le UI (desktop + mobile); bottone hub "⚡ Simula" = `toggleFutureSimRow()` (collapse riga slider).
- **IA futura**: `buildFutureIAPrompt()` (prompt unico) usato da `runFuturePredictionIA` (desktop) e `runFuturePredictionIASheet` (mobile). Include spese programmate per mese nei prossimi 12 mesi (ricorrenti proiettate nel range start..end).

## 🐛 RLS SENZA POLICY = dati mai sincronizzati (2026-08-18)
- **Sintomo**: menu Investimenti (e salvadanai) non salvano/sincronizzano, `put` fallisce, dati solo in outbox locale.
- **Causa**: le tabelle nuove (`investments`, `investment_movements`, `savings_goals`, `settings`) avevano RLS **ENABLED ma ZERO policy** (abilitata manualmente sul DB, non dalle migration del repo — quelle legacy `months`/`expenses` hanno le policy). RLS senza policy = DENY su tutto, anche per l'utente autenticato.
- **Fix**: migration `20260818_investments_rls.sql` — `ENABLE ROW LEVEL SECURITY` + policy `FOR ALL USING (user_id::text = auth.uid()::text) WITH CHECK (...)` + `NOTIFY pgrst`.
- **Regola**: OGNI nuova tabella Supabase = migration con RLS + policy esplicite (cast `::text` su entrambi i lati: user_id è TEXT, auth.uid() è UUID). MAI lasciare RLS senza policy.
- **Verifica remota read-only** (proxy `http://proxy.interno.it:8080`, chiave dal repo): `curl` GET su `https://bkviudppelulwufzhrat.supabase.co/rest/v1/<tabella>?select=*&limit=2` — 400 = colonna/relazione mancante; 200 `[]` = RLS o tabella vuota. Tabella con dati noti (es. `months`) → `[]` = RLS attiva.

## 📱 ANALISI mobile — STATO ATTUALE v6 (2026-08-14)
- **Layout stretto**: `#history-tab.active` = flex column `gap:8px`, `padding:12px`, `min-height:0`, `overflow:hidden` (height 100% del `.container` = `calc(100dvh - header 60px - nav 71px)`). Blocchi: header+select, banner IA, **KPI griglia fissa 3×1**, **sezione centrale ~55/45** (anomalie sopra, Risparmi sotto). Zero scroll verticale.
- **KPI = GRIGLIA 3×1 FISSA**: `.kpi-swipe` = `display:grid; grid-template-columns:repeat(3,1fr); gap:8px` (NIENTE overflow-x/scroll-snap). `.kpi-card` `padding:6px 8px` (NIENTE `min-height:44px`: non è touch target), flex column centrata; label 10px / value 11px / delta 10px, line-height 1.2, label+delta wrap 2 righe (`-webkit-line-clamp:2` + `overflow-wrap:anywhere`). Card: Media Uscite `#trendAvg*`, Top Crescita `#trendTopCat*` (solo delta>1% altrimenti "Nessuna crescita"), Scostamento `#budgetDiff*` = Σactual−Σplanned da `db.months` (label "vs Previsto").
- **BARRA FISSE/VARIABILI RIMOSSA** (v6): `#fixedVarBar`/`.fixedvar-*`/writes JS eliminati. `isFixed(e)` = `isRecurring || recurringGroupId || /(mutuo|affitto|bollett|tass|luce|gas|acqua|telefon|internet|canone|assicuraz)/i.test(category)` resta SOLO per l'esclusione anomalie.
- **Sezione centrale ~55/45**: `.anomaly-carousel` `flex:1.2 1 0` (grafico = cuore visivo) + `.savings-card` `flex:1 1 0`, entrambi `min-height:0`. **Sparkline anomalie = flex-fill**: `.anomaly-slide .sparkline-svg` `flex:1 1 0; width:100%; min-height:36px; max-height:none` (NIENTE clamp fisso) → riempie il `.anomaly-window` (misurato 202/243px a 414×896, floor 36px a 320×568 senza clip). Slide gap 3px. Dots: `button.anomaly-dot` È nell'exception `min-height:auto` (riga 177) + `max-height:6px` + `.anomaly-dots{align-items:center}` — il `button{min-height:44px}` globale li stirerebbe verticalmente.
- **Card Risparmi & Investimenti** `#savingsCard` (header "Risparmi & Investimenti"): `#savRateValue` "X% del reddito" = Σ `db.investmentMovements` (type=deposit, `date.slice(0,7)` nel periodSet) / Σ `db.income` (month nel periodSet); `#savCashflowValue` = entrate−uscite periodo (`.positive` #10b981 / `.negative` #ef4444, `fmtEPlain` include già " €"); `#savTargetBar` fill `min(100, tasso/target*100)` con classe `on-target` (#10b981) se tasso≥target altrimenti ambra #f59e0b; label `#savTargetLabel` "Target X% · In linea|Sotto target|Nessun accantonamento". **Target = `localStorage['eb_savings_target_pct']` default 20. TODO: renderlo configurabile da Impostazioni/Investimenti sia come % che come cifra fissa (oggi solo default hardcoded, senza UI)**. NOTA: i depositi sui Salvadanai legacy (`db.savingsGoals`) NON hanno date → contati SOLO i movimenti datati di `investmentMovements` (asset tipo `salvadanai` inclusi).
- **Carousel anomalie = SLIDE ORIZZONTALE**: `.anomaly-window` (flex:1, `overflow:hidden`, `touch-action: pan-y`) > `.anomaly-track` (flex row, `transition: transform .5s cubic-bezier(.4,0,.2,1)`, classe `.dragging` = no transition) > `.anomaly-slide` (`flex:0 0 100%; height:100%`, NIENTE absolute/opacity). `moveAnomalyTo(box, i)` = `translateX(-i*100%)` + dot attivo + aria-hidden. Dots (6px, attivo `#7c3aed` 16px), `goAnomalySlide(i)` = stop→jump→restart 3.5s. **Swipe**: `setupAnomalySwipe(box)` Pointer Events (guard `dataset.swipeBound`, bind post-render), |Δx|>50 → avanti/indietro, altrimenti snap; restart timer.
- **Banner IA**: marquee = `.ai-insight-marquee` (overflow:hidden, flex:1, SENZA animazione) > `.ai-insight-track` (inline-flex `width:max-content`, `aiMarquee` 14s translateX(-50%)) > 2 span identici. Transform SOLO sul track. ↻ 36px/13px → `generateInsightCard(true)`.
- **No-scroll**: `.container` height `calc(100dvh - var(--header-h,60px))`, padding-bottom `var(--nav-h-mobile,71px)`. Desktop ≥768: ramo `renderGlobalHistory` intatto (hide-mobile/hide-desktop).

## ⚡ SALDO PARZIALE AMICI (2026-08-13)
- `settleFriendBalance` → prompt importo (`showPromptDialog`, default = |net|, virgola accettata) → `settleParticipantPortion`.
- **Partial settle**: record pendente ridotto (`share`/`paid`) + NUOVO record `settled=true` (`share=taken` o `paid=taken`) → storico nel ledger; record chiusi interamente → `settled=true` senza duplicato. I calcoli dei net escludono sempre `settled` — i record saldati non sporcano i badge.
- **Sync shared_debts**: match via `expense_id` + uid amico (creditor O debtor) → `amount` ridotto, `settled` a 0.
- Direzione: `net = paid − share`; net<0 amico ti deve (entrata), net>0 devi tu (uscita) — il prompt si adatta.

## ⚡ RLS RECURSION group_members + merge outbox (2026-08-13)
- **groups_select ↔ group_members_select si interrogavano a vicenda** → loop → qualsiasi INSERT/UPDATE condiviso falliva con "infinite recursion detected in policy for relation group_members" → dati in outbox, mai visibili (letture solo-cloud).
- Fix: `is_group_member(gid)` **SECURITY DEFINER** (migration 005) usata da entrambe le policy; REVOKE PUBLIC/GRANT authenticated. MAI creare policy che si referenziano a vicenda — usare funzione SECURITY DEFINER.
- **Adapter**: le letture fanno SEMPRE merge con outbox (`_mergeOutbox` in toArray/get/where/orderBy, `_pk()` per months/categories) — pattern identico a `loadPeopleGroups`. Senza merge, i dati pending restano invisibili.

## ⚡ PRESET CARDS — niente display:flex (2026-08-13)
- `.preset-card` è `display: block` (flex elimina gli spazi tra testo e `<b>` → "Per conto diGiovanni"). Se in futuro servisse centratura verticale: padding, NON flex.

## ⚡ CONVENZIONE SEGNO DEBITI (2026-08-13)
- `net = paid − share` ovunque: **>0 = creditore** (ha pagato più della quota) → badge "Devi/Le devi" (rosso, negative/saldo-negative); **<0 = debitore** → "Ti deve" (verde, positive/saldo-positive). `showGroupDetail` era corretto; `renderFriendsTab`/`showFriendDetail` erano INVERTITI (fix applicato). Ledger amico: `diff<0` → "+" verde, `diff>0` → "−" rosso.
- `.popup-overlay` **z-index: 10500** (sopra navbar 9999!important e bottomsheet 10000!important) — NON riabbassare.

## ⚡ SHEET DIVIDI SPESA — mai scroll container annidato (2026-08-13)
- `.shared-panel.active`: `max-height: 2000px` + NIENTE `overflow-y: auto`/`overscroll-behavior: contain` (bloccavano lo swipe → sheet non scrollabile). Scroll SOLO in `.sheet-body`. Regola fissa per ogni contenitore dentro il bottomsheet.
- Desktop: `.form-advanced .shared-panel.active { max-height: 2000px }` (stessa regola).

## ⚡ DIVIDI SPESA — save gate + pushSharedDebts + no payer select (2026-08-13)
- **Save gate**: MAI usare `otherPart > 0` (perdeva p4: me=100% → otherPart=0 → nessun record → elenco amici/gruppi vuoto). Regola: `isShared && splitRes && splitRes.records.some(r => r.personId !== meId)` in `saveTransactionFromSheet` e `addExpense`.
- **pushSharedDebts**: `payerRec = records.find(r => r.paidAmount > 0)` → `creditor_user_id = payer's uid` (non più `window.supabaseUser.id`!), `debtor_user_id = p.user_id` (gruppo → user_id membro); skip `uid === payerUid` (self-debt) e uid mancanti.
- **RLS shared_debts**: INSERT richiede `creditor OR debtor = uid` (migration 004) — senza, p3/p4 non sincronizzano cross-account. UPDATE/SELECT entrambi i lati.
- **Niente selettore "Pagato da"**: rimosso (era ridondante coi preset). Payer = preset (p1/p2 Tu, p3/p4 primo non-me) OPPURE `.payer-chip-row` in modalità avanzata (`data-payer`, click → payerId + preset='custom'). `renderSharedPayer`/`bindSharedPayer` ELIMINATE — non riaggiungere.
- **Badge riepilogo** `.shared-remainder`: preset → "Paga X · N partecipanti"; advanced → remainder/errore.
- `.shared-panel.active` ha `overflow-y: auto` (mai `clip` — tagliava il contenuto >430px).

## ⚡ DIVIDI SPESA — preset Splitwise + checkbox + avanzato (2026-08-13)
- **Preset** = `sharedSplitState.preset: 'p1'|'p2'|'p3'|'p4'|'custom'` + `advanced` (bool) + `groupMeta: {label, memberIds}`. `applyPreset(preset, forceActive)` (forceActive=false preserva gli `active` per la ri-distribuzione %), `derivePreset()` ri-sincronizza la card attiva (chiamata in `renderPresets` dentro `refreshSharedPanelUI`).
- **p1** payer=me equal · **p2** payer=me, 100% su tutti i non-me attivi (100/k) · **p3** payer=primo non-me attivo, equal · **p4** payer=primo non-me, me=100% · avanzato = metodo `%|€` con input per riga.
- **Checkbox** `.participant-check`: esclusi → `active=false` → filtrati in `computeSharedSplits` (che ora usa `p.active`); pagatore NON deselezionabile; p2/p4 non svuotabili (toast) e valori ri-distribuiti via `applyPreset(preset,false)`.
- **Gruppo**: select `g_` → `groupMeta.memberIds` → label preset "per conto del gruppo" se gli attivi ⊆ membri; multiselezione = checkbox.
- **Auto-fix** `autoFixSplitValues(state, total)`: su blur degli input avanzati E prima di `computeSharedSplits` in `saveTransactionFromSheet` e `addExpense` → ultima riga = target − somma(altri) (clamp ≥0; errore solo se negativo).
- Micro-quota per riga = `sharesByPid` da `computeSharedSplits` (non-advanced); tag "paga" sul pagatore; `renderSplitEditor` = containerId → isDesktop via `sharedDetailFieldsDesktop`.
- Regola: **mai numeri obbligatori nei casi semplici** — preset card ≥44px, `.btn-advanced` full-width; pills `split-pill` restano solo per "Tipo voce" desktop (`data-exp-type`).

## 🤝 DIVIDI SPESA UX v3 — payer unico + segmented control + righe compatte (2026-08-13)
- **Stato**: `sharedSplitState = { participants: [], method: 'equal', groupId: null, payerId: null }`; partecipante = `{ personId, name, value }` (NON più `paid` per-riga). `payerId` null = "Tu".
- **`computeSharedSplits`**: `paidAmount = totale` SOLO al pagatore (`getSharedPayer` = payerId → me → primo). Branch `shares` RESTA nel compute (legacy) ma è FUORI dalla UI.
- **UI**: selettore `Pagato da` (`#sharedPayerSelect`/`Desktop`, bind one-shot via `dataset.bound`); segmented `.split-segment` 3 pill (equal/exact/percentage); righe `[.participant-avatar iniziali] [nome] [input|read-only] [.participant-remove 44px]`; badge `.shared-remainder.ok/.warn`. `renderSharedParticipants`/chips/`participant-paid`/`shared-preview` RIMOSSI.
- **Regole**: se il pagatore viene rimosso → reset `payerId` a me. `refreshSharedPanelUI(chipsId)` fa solo da dispatch mobile/desktop.
- **Banner budget** `#macroSheetSubheader`: NASCOSTO in `slideToInputView`, ripristinato in `slideBackToCategories` (è fuori dallo slider). Solo schermata microcategorie.
- **`.split-pill` base** = pill bordate (usata dalle pill "Tipo voce" desktop `data-exp-type` in `.split-method-pills`); `.split-segment .split-pill` la sovrascrive (segment iOS-like). Non rimuovere la base.

## 🤝 SPESE CONDIVISE FASE 2 — payer multiplo + split avanzati (2026-08-13)
- **Stato globale unico**: `let sharedSplitState = { participants: [], method: 'equal', groupId: null }` (script.js ~1345). Partecipante = `{ personId, name, paid, value }`; `value` = %/€/quota a seconda del metodo, `paid` = "ha pagato €".
- **`computeSharedSplits(state, total)`** → `{ records, splitMethod }` o `{ error }`: metodi `equal|percentage|exact|shares`; errori: % sommano 100, € sommano il totale, quote positive, paid copre il totale; **se nessun paid → paga tutto "Io"** (fallback primo partecipante); ultimo record aggiusta il round.
- **Salvataggio**: `saveSharedSplitsV2(expenseId, totalAmount, state)` → `saveSharedExpenseV2(...)` scrive `split_method` reale + `split_value` per record + `settled: false`. MAI più `saveSharedSplits`/`updateSplitFields` (rimossi).
- **UI**: `populateSharedPersonSelect(selEl)` richiede l'elemento (no-arg = no-op); `addSharedParticipant` gestisce 'me', `g_<id>` (membri gruppo → groupId), persona singola; `refreshSharedPanelUI(chipsId)` usa 'sharedParticipants' (mobile) / 'sharedParticipantsDesktop' (desktop) e legge il totale da `getSheetAmount()` / `getDesktopSharedTotal()`.
- **Regola**: prima di salvare spesa condivisa chiamare SEMPRE `computeSharedSplits`; su `res.error` → toast + abort salvataggio (mobile e desktop).
- **`settled`**: colonna su `shared_expense_participants` (migration 002); `calculateBalances`/`calculateGroupBalances`/`showFriendDetail` SKIPPANO le righe `settled`.
- **Pills desktop**: metodo in `#sharedPanelDesktop .split-pill` (scoped); le pill `data-exp-type` (Prevista/Sostenuta) sono FUORI dal panel — non toccarle.

## 🗄️ SHARED EXPENSES V2 — tipi FK dinamici + quoting/cast (2026-08-12)
- **DB reale**: `expenses.id` = **TEXT**, `people.id` = BIGINT, `group_members.user_id` = TEXT. `ADD COLUMN IF NOT EXISTS` NON converte colonne pre-esistenti → mai hardcodare BIGINT su FK verso tabelle legacy.
- **`migrations/001_shared_expenses_v2.sql`**: `shared_expenses`/`shared_expense_participants` create via `DO $$ ... EXECUTE format()` con tipo letto da `information_schema.columns` (fallback text/bigint). Fix errore 42804 (expense_id bigint vs expenses.id text).
- **Quoting obbligatorio**: `"personId"`, `"groupId"` (camelCase) — in SQL non quotato Postgres li lowercasa → colonna non trovata.
- **Cast**: `auth.uid()` è UUID; le colonne `user_id` legacy sono TEXT → confronti SEMPRE con `::text` su entrambi i lati (es. `user_id = auth.uid()::text`, `created_by::text = auth.uid()::text`).
- **Patch**: `migrations/001b_fix_fk_types.sql` = self-contained (DROP IF EXISTS + ricrea) per stati parziali.
- Ogni migration termina con `NOTIFY pgrst, 'reload schema';`.

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

## 🔧 Deploy Rule (GitHub Pages)
- **Automatic Push**: Al termine di ogni task o modifica di codice, l'AI deve autonomamente fare commit e push su GitHub per scatenare la build di GitHub Pages.

## REGOLA RESPONSIVE: container glass micro-categorie (2026-08-12)
- **MAI** height fisse nella catena .card-body > .card-glass > .card-micro-grid > .micro-cell/.micro-more/.micro-empty (causa taglio icone top/bottom su schermi corti). Tutto height:auto (contenuto definisce).
- .card-glass (STYLE.CSS 1110, blocco 767): padding: 8px 6px (respiro verticale), overflow: visible (mai clip). .card-body overflow visible.
- Icone micro: lex-shrink:0 su .micro-cell i, .micro-more, .micro-empty + clamp() espliciti.

## PREVISIONE SPESE (badge macro + hero) - regola 2026-08-12
- getCategoryForecasts() (script.js): per OGNI categoria -> planned mese corrente se >0, altrimenti actual del mese precedente (query db.expenses.where('month').equals(prev))
- Badge bottomsheet 'Speso X su Y previsti': Y = somma previsioni delle categorie della macro. Rosso SOLO se previsti>0 e actual>previsti; previsti=0 -> barra neutra (MAI rossa)
- Hero 'Spese Previste': stessa regola su tutte le categorie (getCategoryMacroGroup ha fallback = tutte le categorie coperte)
- openBottomSheetFromMacro e renderMacroBudgetBadge sono async (await su db)
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

## ? COLORI AA - token scuriti (2026-08-19)
- **NON ripristinare**: `--accent #2563eb`, `--entrate #15803d`, `--previsto #c2410c`, `--sostenuto #dc2626`, `--ia-color #7c3aed` (bianco su questi = >=4.5:1). Verde positivo testo = `#047857` (ex #059669/#10b981). Rosso testo/border button = `#dc2626`. Viola pill/badge attivi = `#7c3aed`. Arancio pending = `#b45309`.
- Tinte pastello decorative (box-shadow, box-entrate/previsto/sostenuto, barre progress `#10b981`, bordi `#ef4444`) NON sono testo: lasciare.
- **Icona PWA = mark geometrico polyline** (manifest data-URI, niente emoji non-encoded). theme_color #ffffff ovunque (manifest + meta).

