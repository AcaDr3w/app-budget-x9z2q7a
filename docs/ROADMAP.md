# ROADMAP â€” Ripristino funzionalitÃ  da legacy_version/

> Fonte: audit comparativo `legacy_version/` vs radice (11-08-2026).
> Ogni task indica il codice sorgente legacy da cui riportare la logica.
> Stato: [ ] da fare | [~] in corso | [x] fatto

## Fase 1 â€” Spese Ricorrenti (prioritÃ  alta)
- [x] Toggle "Ripeti ogni mese" + "fino a" nel bottom sheet mobile (`recurringToggle`, `recurringUntil`) â€” legacy index.html:736-746
- [x] Toggle ricorrente nel form desktop (`recurringToggleDesktop`) â€” legacy index.html:215-225
- [x] `saveRecurringClones` (cloni mensili, `recurringGroupId`/`recurringEndMonth`) â€” legacy script.js:1484-1528
- [x] Integrazione in `saveTransactionFromSheet` + `addExpense` (legacy script.js:1413-1431, 1799-1815)
- [x] `setupRecurringToggle` (legacy script.js:1466-1481)
- [x] CSS: `.recurring-toggle-wrapper`, `.recurring-until-container(.active)`, `.recurring-hint`, `.recurring-until-input`, `.toggle-*`

## Fase 2 â€” Gestione Ripetizioni (popup Impostazioni)
- [x] Card Ripetizioni inline in Impostazioni (adattata da popup legacy a pattern attuale) â€” legacy index.html:577-580, 684-693
- [x] `renderRipetizioni` + `deleteRecurringGroup` â€” legacy script.js:2732-2812
- [x] CSS: `.ripetizione-*`, `.ripetizioni-empty`

## Fase 3 â€” Tab Investimenti & Asset
- [x]Navbar: `navInvestimenti` + branch `switchTab` â€” legacy index.html:39-42, script.js:496-508
- [x]Tab `investimenti-tab` (hero card, griglia mobile, lista desktop) â€” legacy index.html:468-552
- [x]`investAddPopup` (4 tipi) + `investAssetPopup` (stats/movimenti) â€” legacy index.html:503-550
- [x]JS: `loadInvestments`/`renderInvestments`/`calcInvestStats`/`saveNewInvestment`/`renderInvestAssetDetail`/`saveInvestMovement`/`editInvestInitialCapital`/`selectInvestType` â€” legacy script.js:2383-2684
- [x]Tabelle Dexie/adapter: `investments`, `investmentMovements`
- [x]CSS: `.invest-*`

## Fase 4 â€” Spese Condivise
- [x] Pannello "Dividi Spesa" nel bottom sheet (toggle, select persona/gruppo, payer pills, split pills %) â€” legacy index.html:748-772
- [x] Popup `popup-spese-condivise` (tab Saldi/Gruppi + detail ledger) â€” legacy index.html:156-175
- [x] JS: `loadPeopleGroups`/`saveNewPerson`/`saveNewGroup`/`saveSharedSplits`/`updateSplitFields`/`setupSharedToggle`/`renderSaldiTab`/`renderGruppiTab`/`showPersonDetail`/`showGroupDetail`/`settleBalance` â€” legacy script.js:749-930, 2936-3304
- [x] Logica condivisa in `saveTransactionFromSheet` (quota propria in planned, `sharedPercentage`) â€” legacy script.js:1345-1441
- [x] Tabelle: `people`, `groups`, `groupMembers`, `sharedExpenseSplits`
- [x] CSS: `\.shared-\*`, `\.condivise-\*`, `\.saldo-\*`, `\.ledger-\*`, `\.gruppo-\*`, `\.payer-pill`, `\.split-pill`

## Fase 5 â€” Rendiconto esteso + Modifica spesa
- [x] `btnNewIncome` + `incomeBottomSheet` (Nuova Entrata mobile, swipe-to-close) â€” legacy index.html:117, 782-805
- [x] `incomeListContainer`/`expenseListContainer` nel popup rendiconto â€” legacy index.html:119-120
- [x] JS: `openIncomeSheet`/`saveIncomeFromSheet`/`getIncomesForMonth`/`renderIncomeList`/`renderExpenseList` â€” legacy script.js:931-990, 2240-2328
- [x] `editExpense` + righe registro cliccabili â€” legacy script.js:1220-1279, 2131-2135, 2322-2325
- [x] Badge `settled-badge` â€” legacy script.js:2125, 2308
- [x] CSS: `\.income-\*`, `\.income-sheet-body`, `\.settled-badge`, `\.popup-income-btn`, `\.amount-input`

## Fase 6 - Popup mobile: Ricerca, IA Mese, Action Hub
- [x] `mese-action-hub` - legacy index.html:102-106, script.js:3819-3828
- [x] `searchPopup` + `filterSearchResults`/`toggleSearchCustomMonth` - legacy index.html:126-141, script.js:2817-2913
- [x] `iaMonthPopup` + `runIaMonthAnalysis` (salva in note IA) - legacy index.html:144-154, script.js:2918-2935, 3306-3351
- [x] CSS: `#mese-action-hub` + bottoni; fix `switchCondiviseTab` (onclick mancante)
## Fase 7 â€” Rifiniture Impostazioni
- [x] Emoji picker categorie (`emojiPickerBtn`/`emojiInput`) - legacy index.html:615-616, script.js:1639-1668
- [x] CSS: `.emoji-picker-btn`, `.emoji-input-hidden`

## Note trasversali
- CSS: riportare SOLO le 143 classi legacy mancanti usate dalle feature ripristinate (lista completa in audit)
- Supabase: ogni nuova tabella richiede migrazione con `ADD COLUMN IF NOT EXISTS` + `NOTIFY pgrst, 'reload schema'` (vedi MEMORY.md 2026-08-11)
- Codice orfano da risolvere: obiettivi risparmio (`renderSavingsGoals` ecc. â€” nessun elemento `savingsGoalsList` in index.html attuale): riagganciare o rimuovere
