// =====================================================================
// SERVICE WORKER (PWA)
// =====================================================================
if ('serviceWorker' in navigator) {
    const refreshOnControllerChange = () => {
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (window.__swReloading) return;
            window.__swReloading = true;
            console.log('[PWA] Nuovo service worker attivo, ricarico la pagina.');
            window.location.reload();
        });
    };

    const registerServiceWorker = async () => {
        try {
            const registration = await navigator.serviceWorker.register('./service-worker.js');
            console.log('[PWA] Service Worker registrato:', registration.scope);
            await registration.update();
            if (document.visibilityState === 'visible') {
                await registration.update();
            }
            return registration;
        } catch (err) {
            console.warn('[PWA] SW non registrato:', err);
            return null;
        }
    };

    window.addEventListener('load', async () => {
        await registerServiceWorker();
        refreshOnControllerChange();
    });

    document.addEventListener('visibilitychange', async () => {
        if (document.visibilityState === 'visible') {
            const registration = await navigator.serviceWorker.getRegistration();
            if (registration) {
                console.log('[PWA] Visibilità ripristinata, controllo aggiornamenti service worker.');
                await registration.update();
            }
        }
    });
}

// =====================================================================
// COSTANTI E DATABASE
// =====================================================================
const OLLAMA_URL = 'http://localhost:11434/api/generate';
const OLLAMA_TAGS_URL = 'http://localhost:11434/api/tags';

const db = new Dexie('BilancioDB');
db.version(1).stores({
    months:          'month',
    income:          'id, month',
    expenses:        'id, month, date, category',
    annualDeadlines: 'id, month',
    categories:      'name',
    settings:        'key'
});
db.version(2).stores({
    savingsGoals: '++id, name, targetAmount, createdAt'
}).upgrade(tx => {});
db.version(3).stores({
    syncState: 'id'
}).upgrade(tx => {});

// Device ID univoco (generato una sola volta per installazione)
function getDeviceId() {
    let id = localStorage.getItem('app_device_id');
    if (!id) {
        id = 'dev_' + Math.random().toString(36).substring(2, 10) + '_' + Date.now().toString(36);
        localStorage.setItem('app_device_id', id);
    }
    return id;
}

// Progressive Versioning: incrementa il contatore ad ogni modifica
async function updateGlobalVersion() {
    const state = await db.syncState.get('versionData');
    const currentCounter = state ? (state.counter || 0) : 0;
    const newCounter = currentCounter + 1;
    await db.syncState.put({ id: 'versionData', counter: newCounter, deviceId: getDeviceId(), lastUpdated: Date.now() });
    console.log(`[SYNC] Version counter incrementato: ${currentCounter} → ${newCounter}`);
    debouncedAutoSync();
}

// =====================================================================
// TOAST NOTIFICATIONS
// =====================================================================
function showToast(msg, isError = false) {
    const toast = document.createElement('div');
    toast.innerText = msg;
    toast.style.cssText = `
        position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
        background: ${isError ? '#ef4444' : '#10b981'}; color: white;
        padding: 10px 20px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        font-size: 14px; z-index: 10000; font-weight: bold; opacity: 0; transition: opacity 0.3s;
    `;
    document.body.appendChild(toast);
    setTimeout(() => toast.style.opacity = '1', 10);
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// =====================================================================
// GOOGLE DRIVE OAUTH2
// =====================================================================
const CLIENT_ID = '216749813771-25voe4c21bu5m56u5viauk99jbcp8qop.apps.googleusercontent.com';
const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest';
const SCOPES = 'https://www.googleapis.com/auth/drive.file';
let tokenClient, gapiInited = false, gisInited = false;

function gapiLoaded() { gapi.load('client', async () => { await gapi.client.init({ discoveryDocs: [DISCOVERY_DOC] }); gapiInited = true; maybeEnableDriveButtons(); }); }
function gisLoaded() {
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID, scope: SCOPES,
        callback: (resp) => {
            if (resp.error) throw resp;
            localStorage.setItem('gdrive_connected', 'true');
            localStorage.setItem('gdrive_access_token', resp.access_token);
            localStorage.setItem('gdrive_token_expires', (Date.now() + resp.expires_in * 1000).toString());
            
            document.getElementById('btnGDriveAuth').style.display = 'none';
            document.getElementById('btnGDriveSync').style.display = 'flex';
            
            if (!window._silentLoginAttempting) {
                showToast('Connesso a Google Drive!', false);
                startupCloudCompare();
            }
        }
    });
    gisInited = true; maybeEnableDriveButtons();
}
function maybeEnableDriveButtons() {
    if (gapiInited && gisInited) {
        document.getElementById('btnGDriveAuth').disabled = false;
        if (localStorage.getItem('gdrive_connected') === 'true') {
            const token = localStorage.getItem('gdrive_access_token');
            const expires = parseInt(localStorage.getItem('gdrive_token_expires') || '0', 10);
            
            document.getElementById('btnGDriveAuth').style.display = 'none';
            document.getElementById('btnGDriveSync').style.display = 'flex';

            if (token && Date.now() < expires) {
                gapi.client.setToken({ access_token: token });
                startupCloudCompare();
            } else {
                window._silentLoginAttempting = true;
                tokenClient.requestAccessToken({ prompt: '' });
            }
        }
    }
}
function handleAuthClick() { window._silentLoginAttempting = false; tokenClient.requestAccessToken({ prompt: 'consent' }); }

// =====================================================================
// VARIABILI GLOBALI E SYNC
// =====================================================================
let autoSyncTimeout = null;
function debouncedAutoSync() {
    if (localStorage.getItem('gdrive_connected') === 'true') {
        clearTimeout(autoSyncTimeout);
        autoSyncTimeout = setTimeout(() => {
            syncToDrive(true);
        }, 1500);
    }
}

async function startupCloudCompare() {
    try {
        const r = await gapi.client.drive.files.list({
            q: "name='budget_pwa_backup.json' and trashed=false",
            fields: 'files(id,name)',
            pageSize: 1, spaces: 'drive'
        });
        const found = r.result.files;
        if (found?.length > 0) {
            const cloudFile = found[0];

            const fData = await gapi.client.drive.files.get({ fileId: cloudFile.id, alt: 'media' });
            if (!fData.body) return;

            const cloudJson = typeof fData.body === 'string' ? JSON.parse(fData.body) : fData.body;
            const cloudCounter = cloudJson.db_version_counter || 0;
            const cloudDeviceId = cloudJson.last_device_id || '';

            const localState = await db.syncState.get('versionData');
            const localCounter = localState ? (localState.counter || 0) : 0;
            const localDeviceId = getDeviceId();

            console.log(`[SYNC] Confronto versioni — Cloud: v${cloudCounter} (${cloudDeviceId}) | Locale: v${localCounter} (${localDeviceId})`);

            if (cloudCounter > localCounter) {
                console.log(`[SYNC] Cloud v${cloudCounter} > Locale v${localCounter}: RIPRISTINO DISTRUTTIVO...`);
                await processSilentRestore(cloudJson, cloudCounter);
                showToast('☁️ Dati aggiornati da Drive', false);
            } else if (localCounter > cloudCounter) {
                console.log(`[SYNC] Locale v${localCounter} > Cloud v${cloudCounter}: PUSH su Drive...`);
                syncToDrive(true);
                showToast('📤 Backup inviato a Drive', false);
            } else {
                console.log('[SYNC] Sincronizzazione allineata (stessa versione).');
            }
        }
    } catch (e) {
        console.warn('[SYNC] Errore durante il confronto startup cloud:', e);
    }
}

async function processSilentRestore(data, cloudCounter) {
    try {
        if (data.categories && data.months) {
            db.close();
            await new Promise((resolve, reject) => {
                const req = indexedDB.deleteDatabase('BilancioDB');
                req.onsuccess = resolve;
                req.onerror = reject;
                req.onblocked = resolve;
            });
            await db.open();

            await db.categories.bulkPut(data.categories);
            if (data.annual_deadlines) await db.annualDeadlines.bulkPut(data.annual_deadlines);
            if (data.income) await db.income.bulkPut(data.income);
            if (data.expenses) await db.expenses.bulkPut(data.expenses);
            if (data.months) await db.months.bulkPut(data.months);
            if (data.savingsGoals) await db.savingsGoals.bulkPut(data.savingsGoals);
            if (data.settings) await db.settings.bulkPut(data.settings);
            
            await db.syncState.put({ id: 'versionData', counter: cloudCounter || 0, deviceId: getDeviceId(), lastUpdated: Date.now() });
            
            console.log('[SYNC] Svuotamento DB e Ripristino da Drive completato. Riavvio...');
            window.location.reload();
        }
    } catch(err) {
        console.warn('[SYNC] Errore ripristino silenzioso', err);
    }
}

const DEFAULT_CATEGORIES = [
    {name: "Alimentari", icon: "🍔"}, {name: "Igiene e Pulizia", icon: "🧴"}, {name: "Carburante Auto", icon: "🚗"}, {name: "Carburante Moto", icon: "🏍️"},
    {name: "Sanitarie", icon: "🏥"}, {name: "Bolletta Acqua", icon: "💧"}, {name: "Bolletta Luce", icon: "💡"}, {name: "Bolletta Gas", icon: "🔥"},
    {name: "Bolletta Rifiuti", icon: "♻️"}, {name: "Bolletta Condominio", icon: "🏢"}, {name: "Bolletta Telefonia", icon: "📱"}, {name: "Mutuo", icon: "🏠"},
    {name: "Tasse Auto (Assicurazione/Bollo)", icon: "🚗"}, {name: "Tasse Moto (Assicurazione/Bollo)", icon: "🏍️"},
    {name: "Manutenzioni Programmate", icon: "🔧"}, {name: "Imprevisti e Svago", icon: "🎉"}, {name: "Formazione", icon: "📚"},
    {name: "Abbigliamento", icon: "👕"}, {name: "Varie", icon: "📦"}
];
const ICON_OPTIONS = ['🏠','🚗','🏍️','🍔','🛍️','🏥','✈️','📚','💡','💧','🔥','📱','🏢','♻️','🧴','🔧','🎉','👕','📦','💰','📈','🎮','🐾','👶','💄','🎵','🏋️','🍕'];
let userCategories = [];
let categoryIconMap = {}; // { 'Alimentari': '🍔', ... }
let currentData = { income: [], expenses: [] };
let annualDeadlines = [];
let selectedFilterDate = null;
let selectedFilterCategory = null;
let searchQuery = "";
let chartB = null, chartC = null;
let historyBarChart = null;
let tradingChart = null;
let startCycleDay = parseInt(localStorage.getItem('global_start_cycle_day')) || 23;

// Inizializzazione valori UI da localStorage (impostazioni leggere, non dati finanziari)
document.getElementById('startCycleDay').value = startCycleDay;
const dateNow = new Date();
let initYear = dateNow.getFullYear(), initMonth = dateNow.getMonth() + 1;
if (dateNow.getDate() >= startCycleDay) { initMonth++; if (initMonth > 12) { initMonth = 1; initYear++; } }
document.getElementById('currentMonth').value = `${initYear}-${String(initMonth).padStart(2,'0')}`;
document.getElementById('annDeadlineMonth').value = `${initYear}-${String(initMonth).padStart(2,'0')}`;
document.getElementById('expDate').value = dateNow.toISOString().slice(0,10);
if (localStorage.getItem('ia_provider')) document.getElementById('iaProviderSelect').value = localStorage.getItem('ia_provider');
if (localStorage.getItem('gemini_api_key')) document.getElementById('geminiApiKeyInput').value = localStorage.getItem('gemini_api_key');

// =====================================================================
// AVVIO APP & MIGRAZIONE DA LOCALSTORAGE
// =====================================================================
async function initApp() {
    await migrateFromLocalStorage();
    await initCategories();
    await loadAnnualDeadlines();
    await loadMonthData();
    toggleIaProviderFields();
    checkDatabaseHealth();
    initPWA();
    if (localStorage.getItem('push_notifications_enabled') === 'true') {
        document.getElementById('pushNotifToggle').checked = true;
        checkPushNotifications();
    }
}

async function migrateFromLocalStorage() {
    let hasData = false;
    for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k.startsWith("bilancio_v2_") || k === "user_categories" || k === "annual_deadlines") { hasData = true; break; }
    }
    if (!hasData) return;
    console.log("🔄 Migrazione dati da localStorage a IndexedDB...");
    const cats = localStorage.getItem('user_categories');
    if (cats) await db.categories.bulkPut(JSON.parse(cats).map(c => ({name: c})));
    else await db.categories.bulkPut(DEFAULT_CATEGORIES.map(c => ({name: c})));
    const deadlines = localStorage.getItem('annual_deadlines');
    if (deadlines) {
        const parsed = JSON.parse(deadlines);
        await db.annualDeadlines.bulkPut(parsed.map(d => ({id: d.id, month: d.month, day: d.day||"", desc: d.desc, amount: d.amount, isPaid: d.isPaid||false})));
    }
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith("bilancio_v2_")) continue;
        const monthStr = key.replace("bilancio_v2_","");
        const data = JSON.parse(localStorage.getItem(key));
        const tIncome = data.income ? data.income.reduce((s,x) => s+x.amount,0) : 0;
        const tPlanned = data.expenses ? data.expenses.reduce((s,x) => s+x.planned,0) : 0;
        const tActual = data.expenses ? data.expenses.reduce((s,x) => s+x.actual,0) : 0;
        await db.months.put({month: monthStr, totalIncome: tIncome, totalPlanned: tPlanned, totalActual: tActual, notes: data.notes||"", iaNotes: data.iaNotes||""});
        if (data.income?.length > 0) await db.income.bulkPut(data.income.map(inc => ({id: inc.id, month: monthStr, desc: inc.desc, amount: inc.amount})));
        if (data.expenses?.length > 0) await db.expenses.bulkPut(data.expenses.map(e => ({id: e.id, month: monthStr, date: e.date, category: e.category, desc: e.desc, planned: e.planned, actual: e.actual, sharedPercentage: e.sharedPercentage||0})));
    }
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k.startsWith("bilancio_v2_") || k === "user_categories" || k === "annual_deadlines") keysToRemove.push(k);
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
    console.log("✅ Migrazione completata.");
}

// =====================================================================
// NAVIGAZIONE TABS
// =====================================================================
const TAB_TITLES = {
    'current-month-tab': 'Mese',
    'history-tab': 'Storico',
    'future-tab': 'Futuro',
    'settings-tab': 'Impostazioni'
};
function updateActivePageSubtitle(tabId) {
    const subtitle = document.getElementById('activePageSubtitle');
    if (!subtitle) return;
    subtitle.textContent = TAB_TITLES[tabId] || 'Dashboard';
}
function switchTab(tabId, buttonEl) {
    document.querySelectorAll('.tab-content').forEach(c => { c.classList.remove('active'); c.classList.add('hidden'); });
    document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
    const target = document.getElementById(tabId);
    target.classList.remove('hidden');
    target.classList.add('active');
    buttonEl.classList.add('active');
    updateActivePageSubtitle(tabId);
    if (tabId === 'history-tab') { renderGlobalHistory(); renderTradingChart(); }
    if (tabId === 'future-tab') { renderFutureProjections(); renderSavingsGoals(); renderAnnualDeadlines(); }
    window.scrollTo(0, 0);
}

// Mobile FAB click listener
(function() {
    const addBtn = document.getElementById('nav-btn-add');
    if (!addBtn) return;
    addBtn.addEventListener('click', scrollToAddExpense);
})();

// =====================================================================
// IMPOSTAZIONI CICLO
// =====================================================================
function changeStartCycleDay() {
    let val = parseInt(document.getElementById('startCycleDay').value);
    if (isNaN(val) || val < 1 || val > 28) { alert("Inserisci un giorno tra 1 e 28."); document.getElementById('startCycleDay').value = startCycleDay; return; }
    startCycleDay = val;
    localStorage.setItem('global_start_cycle_day', startCycleDay);
    loadMonthData();
}

function getMonthRange(monthStr) {
    let year = parseInt(monthStr.split('-')[0]);
    let month = parseInt(monthStr.split('-')[1]);
    let startMonth = month - 1, startYear = year;
    if (startMonth === 0) { startMonth = 12; startYear--; }
    let endDay = startCycleDay - 1;
    if (endDay === 0) { let pd = new Date(year, month-1, 0).getDate(); return {start: new Date(startYear, startMonth-1, 1), end: new Date(startYear, startMonth-1, pd)}; }
    return {start: new Date(startYear, startMonth-1, startCycleDay), end: new Date(year, month-1, endDay)};
}

// =====================================================================
// DATABASE HEALTH CHECK
// =====================================================================
async function checkDatabaseHealth() {
    let count = await db.months.count();
    document.getElementById('recoveryAlertBox').style.display = (count === 0 && annualDeadlines.length === 0) ? 'block' : 'none';
}

// =====================================================================
// CARICAMENTO DATI MESE
// =====================================================================
async function loadMonthData() {
    const month = document.getElementById('currentMonth').value;
    if (!month) return;
    let incomes = await db.income.where('month').equals(month).toArray();
    let expenses = await db.expenses.where('month').equals(month).toArray();
    currentData = {income: incomes, expenses: expenses};
    let mData = await db.months.get(month);
    document.getElementById('userNotes').value = mData?.notes || "";
    document.getElementById('iaNotes').value = mData?.iaNotes || "";
    clearAllFilters();
    checkAnnualAlertForCurrentMonth();
    renderImportCheckboxList();
}

// =====================================================================
// CATEGORIE
// =====================================================================
async function initCategories() {
    let storedCats = await db.categories.toArray();
    if (storedCats.length > 0) {
        userCategories = storedCats.map(c => c.name);
        categoryIconMap = {};
        storedCats.forEach(c => { categoryIconMap[c.name] = c.icon || '🏷️'; });
    } else {
        userCategories = DEFAULT_CATEGORIES.map(c => c.name);
        categoryIconMap = {};
        DEFAULT_CATEGORIES.forEach(c => { categoryIconMap[c.name] = c.icon; });
        await db.categories.bulkPut(DEFAULT_CATEGORIES);
    }
    renderCategoriesDropdown();
}
function getCatIcon(catName) {
    return categoryIconMap[catName] || '🏷️';
}
let categoryToEdit = null;

function renderCategoriesDropdown() {
    const select = document.getElementById('expenseCategory');
    const adminList = document.getElementById('categoriesAdminList');
    select.innerHTML = ''; adminList.innerHTML = '';
    userCategories.sort().forEach(cat => {
        const icon = getCatIcon(cat);
        let opt = document.createElement('option'); opt.value = cat; opt.innerText = `${icon} ${cat}`; select.appendChild(opt);
        let tag = document.createElement('span'); tag.className = 'cat-tag';
        tag.innerHTML = `${icon} ${cat} <button onclick="editCategory('${cat.replace(/'/g,"\\'")}')" style="color:#f59e0b; margin-right:4px;">✏️</button><button onclick="deleteCategory('${cat.replace(/'/g,"\\'")}')">×</button>`;
        adminList.appendChild(tag);
    });
}

function editCategory(cat) {
    categoryToEdit = cat;
    document.getElementById('newCatName').value = cat;
    document.getElementById('newCatIcon').value = getCatIcon(cat) || '🏷️';
    const btn = document.getElementById('btnSaveCategory');
    if(btn) {
        btn.innerText = 'Salva';
        btn.style.background = '#f59e0b';
    }
}

async function saveCategory() {
    const input = document.getElementById('newCatName'); const name = input.value.trim();
    if (!name) return;
    const iconSelect = document.getElementById('newCatIcon');
    const icon = iconSelect ? iconSelect.value : '🏷️';
    
    if (categoryToEdit) {
        if (name !== categoryToEdit && userCategories.includes(name)) {
            alert('Categoria già esistente.'); return;
        }
        if (name !== categoryToEdit) {
            const allExp = await db.expenses.where('category').equals(categoryToEdit).toArray();
            for (let e of allExp) { await db.expenses.update(e.id, {category: name}); }
            currentData.expenses.forEach(e => { if (e.category === categoryToEdit) e.category = name; });
            userCategories = userCategories.filter(c => c !== categoryToEdit);
            delete categoryIconMap[categoryToEdit];
            await db.categories.delete(categoryToEdit);
        }
        if (!userCategories.includes(name)) userCategories.push(name);
        categoryIconMap[name] = icon;
        await db.categories.put({name, icon});
        
        categoryToEdit = null;
        const btn = document.getElementById('btnSaveCategory');
        if(btn) {
            btn.innerText = 'Aggiungi';
            btn.style.background = 'var(--accent)';
        }
    } else {
        if (userCategories.includes(name)) return;
        userCategories.push(name);
        categoryIconMap[name] = icon;
        await db.categories.put({name, icon});
    }
    await updateGlobalVersion();
    input.value = '';
    renderCategoriesDropdown(); renderImportCheckboxList(); updateUI();
}
async function deleteCategory(cat) {
    if (!confirm(`Eliminare "${cat}"?`)) return;
    userCategories = userCategories.filter(c => c !== cat);
    delete categoryIconMap[cat];
    await db.categories.delete(cat);
    renderCategoriesDropdown(); renderImportCheckboxList(); updateUI();
}
function renderImportCheckboxList() {
    const container = document.getElementById('importCategoriesList');
    if (!container) return; container.innerHTML = '';
    const autoChecked = ["Alimentari","Carburante Auto","Mutuo","Bolletta Luce","Varie"];
    userCategories.sort().forEach(cat => {
        const icon = getCatIcon(cat);
        const label = document.createElement('label'); label.className = 'import-checkbox-item';
        label.innerHTML = `<input type="checkbox" value="${cat}" ${autoChecked.includes(cat)?'checked':''}> ${icon} ${cat}`;
        container.appendChild(label);
    });
}

// =====================================================================
// ADD / DELETE ENTRIES
// =====================================================================
async function addIncome() {
    const month = document.getElementById('currentMonth').value;
    const desc = document.getElementById('incDesc').value.trim() || "Entrata";
    const amount = parseFloat(document.getElementById('incAmount').value) || 0;
    if (amount <= 0) return;
    let inc = {id: Date.now(), month, desc, amount};
    currentData.income.push(inc); await db.income.put(inc);
    document.getElementById('incDesc').value = ''; document.getElementById('incAmount').value = '';
    updateUI(); checkDatabaseHealth();
}
async function addExpense() {
    const month = document.getElementById('currentMonth').value;
    const date = document.getElementById('expDate').value;
    const cat = document.getElementById('expenseCategory').value;
    const desc = document.getElementById('expDesc').value.trim() || "Spesa";
    let planned = parseFloat(document.getElementById('expPlanned').value) || 0;
    let actual = parseFloat(document.getElementById('expActual').value) || 0;
    let shared = parseFloat(document.getElementById('expShared').value) || 0;
    if (planned === 0 && actual === 0) return;
    if (shared > 0 && shared < 100) { planned *= (shared/100); actual *= (shared/100); }
    let exp = {id: Date.now(), month, date, category: cat, desc, planned, actual, sharedPercentage: shared};
    currentData.expenses.push(exp); await db.expenses.put(exp);
    document.getElementById('expDesc').value = ''; document.getElementById('expPlanned').value = '';
    document.getElementById('expActual').value = ''; document.getElementById('expShared').value = '';
    updateUI(); checkDatabaseHealth();
}
async function payExpense(id) {
    const exp = currentData.expenses.find(i => i.id === id); if (!exp) return;
    const val = prompt("Importo effettivo pagato (€):", exp.planned.toFixed(2));
    if (val !== null) {
        const p = parseFloat(val.replace(',','.')); if (!isNaN(p)) { exp.actual = p; await db.expenses.update(id, {actual: p}); updateUI(); }
    }
}
async function deleteEntry(type, id) {
    if (type === 'income') { currentData.income = currentData.income.filter(i => i.id !== id); await db.income.delete(id); }
    else { currentData.expenses = currentData.expenses.filter(i => i.id !== id); await db.expenses.delete(id); }
    updateUI(); checkDatabaseHealth();
}

// =====================================================================
// COPIA DAL MESE PRECEDENTE
// =====================================================================
async function copyFromPreviousMonth() {
    const currentMonthVal = document.getElementById('currentMonth').value;
    let year = parseInt(currentMonthVal.split('-')[0]); let month = parseInt(currentMonthVal.split('-')[1]) - 1;
    if (month === 0) { month = 12; year--; }
    const prevMonthStr = `${year}-${String(month).padStart(2,'0')}`;
    let prevExpenses = await db.expenses.where('month').equals(prevMonthStr).toArray();
    if (prevExpenses.length === 0) { alert("Nessun dato nel ciclo precedente."); return; }
    const checkboxes = document.querySelectorAll('#importCategoriesList input[type="checkbox"]');
    let sel = []; checkboxes.forEach(cb => { if (cb.checked) sel.push(cb.value); });
    if (sel.length === 0) { alert("Seleziona almeno una categoria."); return; }
    let count = 0; const range = getMonthRange(currentMonthVal);
    for (let e of prevExpenses) {
        if (sel.includes(e.category) && !currentData.expenses.some(x => x.category === e.category)) {
            let newExp = {id: Date.now()+count, month: currentMonthVal, date: range.start.toISOString().slice(0,10), category: e.category, desc: "Stima ereditata", planned: e.planned||e.actual, actual: 0, sharedPercentage: 0};
            currentData.expenses.push(newExp); await db.expenses.put(newExp); count++;
        }
    }
    updateUI(); checkDatabaseHealth(); alert(`${count} voci ereditate.`);
}

// =====================================================================
// NOTE
// =====================================================================
async function saveNotes() {
    const month = document.getElementById('currentMonth').value;
    const notes = document.getElementById('userNotes').value;
    const iaNotes = document.getElementById('iaNotes').value;
    let mData = await db.months.get(month);
    if (mData) {
        await db.months.update(month, {notes, iaNotes});
    } else {
        await db.months.put({month, totalIncome:0, totalPlanned:0, totalActual:0, notes, iaNotes});
    }
    await updateGlobalVersion();
}

// =====================================================================
// SCADENZARIO ANNUALE
// =====================================================================
async function loadAnnualDeadlines() {
    annualDeadlines = await db.annualDeadlines.toArray();
    await renderAnnualDeadlines();
    checkAnnualAlertForCurrentMonth();
}
async function addAnnualDeadline() {
    const month = document.getElementById('annDeadlineMonth').value;
    const day = document.getElementById('annDeadlineDay').value;
    const desc = document.getElementById('annDeadlineDesc').value.trim();
    const amount = parseFloat(document.getElementById('annDeadlineAmount').value) || 0;
    if (!month || !desc || amount <= 0) { alert("Compila mese, descrizione e importo."); return; }
    let item = {id: Date.now(), month, day, desc, amount, isPaid: false};
    await db.annualDeadlines.put(item);
    await updateGlobalVersion();
    document.getElementById('annDeadlineDesc').value = '';
    document.getElementById('annDeadlineAmount').value = '';
    document.getElementById('annDeadlineDay').value = '';
    loadAnnualDeadlines();
}
async function deleteAnnualDeadline(id) {
    if (confirm("Eliminare questa scadenza?")) { await db.annualDeadlines.delete(id); await updateGlobalVersion(); loadAnnualDeadlines(); }
}
async function toggleDeadlinePaid(id, isPaid) {
    await db.annualDeadlines.update(id, {isPaid}); await updateGlobalVersion(); loadAnnualDeadlines();
}
async function renderAnnualDeadlines() {
    await loadAnnualDeadlines_db();
}
async function loadAnnualDeadlines_db() {
    annualDeadlines = await db.annualDeadlines.toArray();
    const container = document.getElementById('annualDeadlinesList'); if (!container) return;
    container.innerHTML = '';
    if (annualDeadlines.length === 0) { container.innerHTML = `<p style="color:#94a3b8;font-size:13px;text-align:center;padding:20px;">Nessuna scadenza inserita.</p>`; return; }
    annualDeadlines.sort((a,b) => {
        let da = new Date(a.month + '-' + (a.day ? String(a.day).padStart(2,'0') : '01'));
        let db2 = new Date(b.month + '-' + (b.day ? String(b.day).padStart(2,'0') : '01'));
        return da - db2;
    });
    const today = new Date();
    annualDeadlines.forEach(item => {
        const row = document.createElement('div'); row.className = 'item-row';
        let isPast = !item.isPaid && new Date(item.month + '-' + (item.day ? String(item.day).padStart(2,'0') : '01')) < today;
        let formattedM = item.month.split('-').reverse().join('/') + (item.day ? ` (g.${item.day})` : '');
        if (isPast) row.style.cssText = 'background:#fee2e2;border-left:4px solid #ef4444;padding-left:10px;border-radius:6px;';
        else if (item.isPaid) row.style.opacity = '0.65';
        row.innerHTML = `
            <span class="item-name">${item.isPaid ? '✅' : isPast ? '🚨' : '⏰'} <strong>${item.desc}</strong><span class="item-meta">${formattedM}</span></span>
            <span class="item-vals">
                <span style="color:var(--previsto);font-weight:bold;font-size:13px;">${fmtE(item.amount)}</span>
                ${!item.isPaid ? `<button class="btn-action btn-pay" onclick="toggleDeadlinePaid(${item.id},true)">Pagato</button>` : `<button class="btn-action" style="background:#64748b;" onclick="toggleDeadlinePaid(${item.id},false)">Annulla</button>`}
                <button class="btn-del" onclick="deleteAnnualDeadline(${item.id})">✕</button>
            </span>`;
        container.appendChild(row);
    });
    if (localStorage.getItem('push_notifications_enabled') === 'true') checkPushNotifications();
}
function checkAnnualAlertForCurrentMonth() {
    const currentMonthVal = document.getElementById('currentMonth').value;
    const alertBox = document.getElementById('annualMonthAlert'); if (!alertBox) return;
    const match = (annualDeadlines||[]).filter(d => d.month === currentMonthVal && !d.isPaid);
    if (match.length > 0) {
        let txt = `🔔 <strong>Scadenze annuali da pagare questo mese:</strong><ul style="margin:6px 0 0 18px;">`;
        match.forEach(d => { txt += `<li>${d.desc}${d.day ? ' (g.'+d.day+')' : ''}: <strong>${fmtE(d.amount)}</strong></li>`; });
        txt += `</ul>`;
        alertBox.innerHTML = txt; alertBox.style.display = 'block';
    } else { alertBox.style.display = 'none'; }
}

// =====================================================================
// AGGIORNAMENTO UI PRINCIPALE
// =====================================================================
async function updateUI() {
    let totalIncome = currentData.income.reduce((s,i) => s+i.amount,0);
    let totalPlanned = currentData.expenses.reduce((s,i) => s+i.planned,0);
    let totalActual = currentData.expenses.reduce((s,i) => s+i.actual,0);

    document.getElementById('sumEntrate').innerText = fmtE(totalIncome,0);
    document.getElementById('sumPrevisto').innerText = fmtE(totalPlanned,0);
    document.getElementById('sumSostenuto').innerText = fmtE(totalActual,0);

    let netSavings = totalIncome - totalActual;
    let savingsPercent = totalIncome > 0 ? ((netSavings/totalIncome)*100).toFixed(1) : 0;

    const month = document.getElementById('currentMonth').value;
    let mData = await db.months.get(month);
    await db.months.put({month, totalIncome, totalPlanned, totalActual, notes: mData?.notes||"", iaNotes: mData?.iaNotes||""});
    await updateGlobalVersion();

    let pending = currentData.expenses.filter(e => e.planned > 0 && e.actual === 0).length;
    const alertBox = document.getElementById('deadlineAlert');
    if (pending > 0) { alertBox.innerText = `⏳ ${pending} uscite pianificate in attesa di saldo.`; alertBox.style.display = 'block'; } else { alertBox.style.display = 'none'; }

    // Tabella categorie
    let catSums = {}; userCategories.forEach(c => catSums[c] = {planned:0, actual:0});
    currentData.expenses.forEach(exp => { if (catSums[exp.category]) { catSums[exp.category].planned += exp.planned; catSums[exp.category].actual += exp.actual; } });
    const tableBody = document.getElementById('overviewTableBody'); tableBody.innerHTML = '';
    userCategories.sort().forEach(cat => {
        const pVal = catSums[cat].planned, aVal = catSums[cat].actual, diff = pVal - aVal;
        let diffClass = '', diffText = '';
        if (pVal > 0 || aVal > 0) { diffClass = diff >= 0 ? 'diff-plus' : 'diff-minus'; diffText = `${diff >= 0 ? '+' : ''}${fmtE(diff)}`; }
        if (pVal > 0 || aVal > 0) {
            const icon = getCatIcon(cat);
            let row = document.createElement('div');
            row.className = 'flat-row';
            if (selectedFilterCategory === cat) row.classList.add('selected');
            row.onclick = () => filterByCategory(cat);
            row.innerHTML = `
                <div class="flat-left">
                    <div class="flat-icon">${icon}</div>
                    <div class="flat-title-group">
                        <span class="flat-title">${cat}</span>
                        <span class="flat-subtitle val-previsto">Prev: ${fmtE(pVal)}</span>
                    </div>
                </div>
                <div class="flat-right">
                    <span class="flat-actual val-sostenuto">${fmtE(aVal)}</span>
                    <span class="flat-margin ${diffClass}">${diffText}</span>
                </div>
            `;
            tableBody.appendChild(row);
        }
    });

    const tableFoot = document.getElementById('overviewTableFoot'); tableFoot.innerHTML = '';
    let savingsDiv = document.createElement('div'); savingsDiv.className = 'flat-footer-row';
    savingsDiv.innerHTML = `
        <div class="flat-footer-title">💰 RISPARMIO NETTO <span class="savings-badge">${savingsPercent}%</span></div>
        <div class="flat-footer-actual">${fmtE(netSavings)}</div>
    `;
    tableFoot.appendChild(savingsDiv);

    renderCalendar();

    const btnClear = document.getElementById('btnClearAllFilters');
    btnClear.style.display = (selectedFilterDate || selectedFilterCategory || searchQuery !== "") ? 'inline-block' : 'none';

    // Lista voci
    const listContainer = document.getElementById('entriesList'); listContainer.innerHTML = '';
    if (!selectedFilterDate && !selectedFilterCategory && searchQuery === "") {
        currentData.income.forEach(inc => {
            const row = document.createElement('div'); row.className = 'item-row';
            row.innerHTML = `<span class="item-name">💰 <strong>${inc.desc}</strong></span><span class="item-vals"><span style="color:var(--entrate);font-weight:bold;">+${fmtE(inc.amount)}</span><button class="btn-del" onclick="deleteEntry('income',${inc.id})">✕</button></span>`;
            listContainer.appendChild(row);
        });
    }
    let filteredExp = currentData.expenses;
    if (selectedFilterDate) filteredExp = filteredExp.filter(e => e.date === selectedFilterDate);
    if (selectedFilterCategory) filteredExp = filteredExp.filter(e => e.category === selectedFilterCategory);
    if (searchQuery !== "") filteredExp = filteredExp.filter(e => e.desc.toLowerCase().includes(searchQuery) || e.category.toLowerCase().includes(searchQuery) || e.date.includes(searchQuery));
    filteredExp.sort((a,b) => new Date(b.date) - new Date(a.date));
    filteredExp.forEach(exp => {
        const isPending = exp.planned > 0 && exp.actual === 0;
        const fd = exp.date.split('-').reverse().slice(0,2).join('/');
        const sharedTxt = exp.sharedPercentage > 0 ? ` <span style="font-size:9px;color:#3b82f6;">(${exp.sharedPercentage}%)</span>` : '';
        const row = document.createElement('div'); row.className = 'item-row';
        row.innerHTML = `
            <span class="item-name">${isPending ? '⏳ ' : ''}${getCatIcon(exp.category)} <strong>${exp.category}</strong>${sharedTxt}<span class="item-meta">${fd} · ${exp.desc}</span></span>
            <span class="item-vals">
                <div><span class="val-p">Stima: ${fmtE(exp.planned)}</span><span class="val-s">${exp.actual > 0 ? fmtE(exp.actual) : 'Da pagare'}</span></div>
                ${isPending ? `<button class="btn-action btn-pay" onclick="payExpense(${exp.id})">Paga</button>` : ''}
                <button class="btn-del" onclick="deleteEntry('expense',${exp.id})">✕</button>
            </span>`;
        listContainer.appendChild(row);
    });

    // Grafici
    if (chartB) chartB.destroy();
    chartB = new Chart(document.getElementById('budgetChart').getContext('2d'), {
        type:'bar', data:{labels:['Entrate','Spese Previste','Spese Sostenute'],datasets:[{data:[totalIncome,totalPlanned,totalActual],backgroundColor:['#10b981','#f97316','#ef4444'],borderRadius:6}]},
        options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}}}
    });
    if (chartC) chartC.destroy();
    const activeCats = Object.keys(catSums).filter(c => catSums[c].actual > 0);
    chartC = new Chart(document.getElementById('categoryChart').getContext('2d'), {
        type:'doughnut', data:{labels:activeCats,datasets:[{data:activeCats.map(c => catSums[c].actual),backgroundColor:['#3b82f6','#8b5cf6','#475569','#0d9488','#10b981','#f59e0b','#f97316','#ef4444']}]},
        options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom',labels:{boxWidth:8,font:{size:9}}}}}
    });
}

// =====================================================================
// CALENDARIO
// =====================================================================
function renderCalendar() {
    const grid = document.getElementById('calendarGrid'); if (!grid) return; grid.innerHTML = '';
    const monthVal = document.getElementById('currentMonth').value; if (!monthVal) return;
    const range = getMonthRange(monthVal);
    ['L','M','M','G','V','S','D'].forEach(d => { let h = document.createElement('div'); h.className = 'calendar-day-header'; h.innerText = d; grid.appendChild(h); });
    let firstDayIndex = (range.start.getDay()+6)%7;
    for (let i=0; i<firstDayIndex; i++) { let e = document.createElement('div'); e.className = 'calendar-day empty'; grid.appendChild(e); }
    let cursor = new Date(range.start);
    while (cursor <= range.end) {
        const ds = cursor.toISOString().slice(0,10);
        const dayNum = cursor.getDate();
        const hasPlanned = currentData.expenses.some(e => e.date === ds && e.planned > 0);
        const hasDeadline = annualDeadlines.some(a => a.month === monthVal && (!a.day || parseInt(a.day) === dayNum) && !a.isPaid);
        const isHighlight = hasPlanned || hasDeadline;
        let d = document.createElement('div'); d.className = `calendar-day${isHighlight?' has-deadline':''}${selectedFilterDate===ds?' selected':''}`;
        d.innerHTML = `${cursor.getDate()}<span>${cursor.getMonth()+1}/${cursor.getFullYear().toString().slice(-2)}</span>`;
        const td = ds; d.onclick = () => filterByDate(td);
        grid.appendChild(d); cursor.setDate(cursor.getDate()+1);
    }
}

// =====================================================================
// FILTRI
// =====================================================================
function filterByCategory(cat) { selectedFilterCategory = cat; selectedFilterDate = null; document.getElementById('listTitle').scrollIntoView({behavior:'smooth'}); updateUI(); }
function filterByDate(ds) { selectedFilterDate = ds; selectedFilterCategory = null; document.getElementById('listTitle').scrollIntoView({behavior:'smooth'}); updateUI(); }
function handleSearch() { searchQuery = document.getElementById('searchInput').value.toLowerCase(); updateUI(); }
function clearAllFilters() { selectedFilterDate = null; selectedFilterCategory = null; searchQuery = ""; const s = document.getElementById('searchInput'); if(s) s.value = ""; updateUI(); }
function scrollToAddExpense() { switchTab('current-month-tab', document.getElementById('tab-btn-current')); setTimeout(() => { document.getElementById('addExpenseCard').scrollIntoView({behavior:'smooth',block:'start'}); }, 100); }
function toggleSection(id, el) { document.getElementById(id).classList.toggle('show'); el.classList.toggle('active'); }

async function openRendicontoPopup(type) {
    const month = document.getElementById('currentMonth').value;
    if (!month) return;
    const prevMonth = getPreviousMonthStrings(month, 1)[0];
    const barsContainer = document.getElementById('popupBars');
    const title = document.getElementById('popupTitle');
    const subtitle = document.getElementById('popupSubtitle');
    const overlay = document.getElementById('popup-rendiconto');
    const currentTitle = type === 'entrate' ? 'Entrate' : type === 'previsto' ? 'Spese Previste' : 'Spese Sostenute';
    title.innerText = 'Panoramica del mese corrente';
    subtitle.innerText = `${currentTitle} · ${month.split('-').reverse().join('/')} vs ${prevMonth.split('-').reverse().join('/')}`;
    const rows = await buildRendicontoRows(type, month, prevMonth);
    if (!barsContainer) return;
    if (rows.length === 0) {
        barsContainer.innerHTML = `<div style="font-size:13px;color:#64748b;padding:18px 0;text-align:center;">Nessun dato disponibile per questa panoramica.</div>`;
    } else {
        const maxValue = Math.max(...rows.map(r => Math.max(r.currentValue, r.previousValue)), 1);
        const legendHtml = `<div class="popup-legend">La linea o la zebratura rappresentano il mese scorso.</div>`;
        const rowsHtml = rows.map(row => {
            const currentPct = Math.round((row.currentValue / maxValue) * 100);
            const previousPct = Math.round((row.previousValue / maxValue) * 100);
            const variation = row.previousValue === 0 ? (row.currentValue === 0 ? '0%' : '+100%') : `${row.currentValue === row.previousValue ? '0%' : (row.currentValue > row.previousValue ? '+' : '') + Math.round(((row.currentValue - row.previousValue) / row.previousValue) * 100) + '%'}`;
            const previousLeft = `${Math.min(100, previousPct)}%`;
            const zebraHtml = previousPct > currentPct ? `<div class="popup-bar-zebra" style="left:${currentPct}%; width:${Math.min(100, previousPct - currentPct)}%;"></div>` : '';
            return `
                <div class="popup-bar-row">
                    <div class="popup-bar-title"><span>${row.label}</span><span>${variation}</span></div>
                    <div class="popup-bar-visual">
                        <div class="popup-bar-fill" style="width:${Math.min(100, currentPct)}%; background:${row.color};"></div>
                        ${zebraHtml}
                        <div class="popup-bar-previous" style="left:${previousLeft};"></div>
                    </div>
                    <div class="popup-bar-meta"><span>${fmtEPlain(row.currentValue, 2)}</span><span>Prev: ${fmtEPlain(row.previousValue, 2)}</span></div>
                </div>`;
        }).join('');
        barsContainer.innerHTML = rowsHtml + legendHtml;
    }
    overlay.classList.add('active');
}

function closeRendicontoPopup(event) {
    event.preventDefault();
    event.stopPropagation();
    document.getElementById('popup-rendiconto').classList.remove('active');
}

async function buildRendicontoRows(type, month, prevMonth) {
    const currentMap = {};
    const previousMap = {};
    if (type === 'entrate') {
        const currentIncome = await db.income.where('month').equals(month).toArray();
        const prevIncome = await db.income.where('month').equals(prevMonth).toArray();
        const currentTotal = currentIncome.reduce((sum, item) => sum + item.amount, 0);
        const previousTotal = prevIncome.reduce((sum, item) => sum + item.amount, 0);
        return [{ label: 'Entrate', currentValue: currentTotal, previousValue: previousTotal, color: '#10b981' }];
    }
    if (type === 'previsto') {
        const currentExpenses = await db.expenses.where('month').equals(month).toArray();
        const prevExpenses = await db.expenses.where('month').equals(prevMonth).toArray();
        currentExpenses.forEach(item => {
            if ((item.planned || 0) > 0) currentMap[item.category] = (currentMap[item.category] || 0) + item.planned;
        });
        prevExpenses.forEach(item => {
            if ((item.planned || 0) > 0) previousMap[item.category] = (previousMap[item.category] || 0) + item.planned;
        });
        const rows = Object.keys(currentMap).map(key => ({
            label: key,
            currentValue: currentMap[key] || 0,
            previousValue: previousMap[key] || 0,
            color: '#f97316'
        })).filter(r => r.currentValue > 0 || r.previousValue > 0);
        return rows.sort((a, b) => b.currentValue - a.currentValue || b.previousValue - a.previousValue);
    }
    const currentExpenses = await db.expenses.where('month').equals(month).toArray();
    const prevExpenses = await db.expenses.where('month').equals(prevMonth).toArray();
    currentExpenses.forEach(item => {
        if ((item.actual || 0) > 0) currentMap[item.category] = (currentMap[item.category] || 0) + item.actual;
    });
    prevExpenses.forEach(item => {
        if ((item.actual || 0) > 0) previousMap[item.category] = (previousMap[item.category] || 0) + item.actual;
    });
    const rows = Object.keys(currentMap).map(key => ({
        label: key,
        currentValue: currentMap[key] || 0,
        previousValue: previousMap[key] || 0,
        color: '#ef4444'
    })).filter(r => r.currentValue > 0 || r.previousValue > 0);
    return rows.sort((a, b) => b.currentValue - a.currentValue || b.previousValue - a.previousValue);
}

// =====================================================================
// STORICO PLURIMENSILE & RECORDS & SALVADANAI
// =====================================================================
async function renderRecordsHub(monthsArray) {
    if (monthsArray.length === 0) return;
    let bestMonth = monthsArray.reduce((prev, curr) => (curr.totalIncome - curr.totalActual) > (prev.totalIncome - prev.totalActual) ? curr : prev);
    document.getElementById('recordBestMonth').innerHTML = `${bestMonth.month.split('-').reverse().join('/')}<br>${fmtE(bestMonth.totalIncome - bestMonth.totalActual)}`;

    let allExpenses = await db.expenses.toArray();
    if (allExpenses.length > 0) {
        let maxExp = allExpenses.reduce((prev, curr) => curr.actual > prev.actual ? curr : prev);
        document.getElementById('recordHighestExp').innerHTML = `${fmtE(maxExp.actual)}<br>${maxExp.category}`;

        let catSums = {};
        allExpenses.forEach(e => { catSums[e.category] = (catSums[e.category] || 0) + e.actual; });
        let worstCat = Object.entries(catSums).reduce((prev, curr) => curr[1] > prev[1] ? curr : prev);
        document.getElementById('recordWorstCat').innerHTML = `${worstCat[0]}<br>${fmtE(worstCat[1])}`;
    }
}

async function renderSavingsGoals() {
    const goals = await db.savingsGoals.toArray();
    const container = document.getElementById('savingsGoalsList');
    const depositSelect = document.getElementById('depositSavingsSelect');
    if (!container) return; // element not present in minimal UI -> nothing to render
    container.innerHTML = '';
    if (!goals || goals.length === 0) {
        container.innerHTML = '<p style="color:#94a3b8;font-size:12px;">Nessun salvadanio creato.</p>';
        if (depositSelect) {
            depositSelect.innerHTML = '<option value="">Nessun salvadanaio disponibile</option>';
            depositSelect.disabled = true;
        }
        return;
    }
    if (depositSelect) {
        depositSelect.disabled = false;
        // Show only the name of the savings goal in the dropdown
        depositSelect.innerHTML = goals.map(g => `<option value="${g.id}">${g.name}</option>`).join('');
    }
    
    goals.forEach(g => {
        const accumulated = g.importo_accumulato || 0;
        const pct = g.targetAmount > 0 ? Math.min(100, Math.max(0, (accumulated / g.targetAmount) * 100)) : 0;
        const isComplete = pct >= 100;
        container.innerHTML += `
        <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:14px; margin-bottom:10px; position:relative;">
            <div style="display:flex; justify-content:space-between; align-items:center; width:100%; gap:12px; margin-bottom:10px; flex-wrap:wrap;">
                <div style="display:flex; align-items:center; gap:8px; font-weight:bold; font-size:15px; color:#1e293b; min-width:160px;">
                    <span>${g.name} ${isComplete ? '🎉' : ''}</span>
                </div>
                <div style="display:flex; align-items:center; gap:10px;">
                    <span style="font-size:13px; color:#64748b; white-space:nowrap;">${fmtE(accumulated)} / ${fmtE(g.targetAmount)}</span>
                    <button onclick="deleteSavingsGoal(${g.id})" title="Elimina" style="background:transparent; border:none; color:#ef4444; font-size:16px; cursor:pointer; padding:6px; border-radius:6px;">
                        🗑️
                    </button>
                </div>
            </div>
            <div style="height: 12px; background: #e2e8f0; border-radius: 10px; overflow:hidden; margin-bottom:8px;">
                <div style="width: ${pct}%; height: 100%; background: ${isComplete ? '#10b981' : '#3b82f6'}; transition: width 0.3s;"></div>
            </div>
            <div style="display:flex; justify-content:space-between; align-items:center; gap: 10px; font-size:13px; color:#334155;">
                <span>Avanzamento: <strong>${pct.toFixed(1)}%</strong></span>
                ${isComplete ? '<span style="color:#10b981; font-weight:700;">Obiettivo raggiunto</span>' : ''}
            </div>
        </div>`;
    });
}
async function addSavingsGoal() {
    const nameEl = document.getElementById('sgName');
    const amountEl = document.getElementById('sgAmount');
    if (!nameEl || !amountEl) return; // UI not present
    const name = nameEl.value.trim();
    const amount = parseFloat(amountEl.value) || 0;
    if (!name || amount <= 0) { alert('Inserisci un nome e un target valido.'); return; }
    await db.savingsGoals.put({name, targetAmount: amount, importo_accumulato: 0, createdAt: Date.now()});
    await updateGlobalVersion();
    nameEl.value = ''; amountEl.value = '';
    renderSavingsGoals();
}
async function deleteSavingsGoal(id) {
    if(confirm('Eliminare questo obiettivo?')) { await db.savingsGoals.delete(id); await updateGlobalVersion(); renderSavingsGoals(); }
}

async function depositToSavingsGoal() {
    const select = document.getElementById('depositSavingsSelect');
    const amountInput = document.getElementById('depositAmount');
    if (!select || !amountInput) return;
    const id = parseInt(select.value, 10);
    const amount = parseFloat(amountInput.value) || 0;
    if (!id || amount <= 0) { alert('Inserisci un importo valido da depositare.'); return; }
    const goal = await db.savingsGoals.get(id);
    if (!goal) { alert('Salvadanaio non trovato.'); return; }
    const newTotal = (goal.importo_accumulato || 0) + amount;
    await db.savingsGoals.update(id, {importo_accumulato: newTotal});
    await updateGlobalVersion();
    amountInput.value = '';
    const feedback = document.getElementById('depositFeedback');
    if (feedback) {
        feedback.innerText = `✅ Deposito di ${fmtEPlain(amount)} eseguito su "${goal.name}".`;
        setTimeout(() => { if (feedback) feedback.innerText = ''; }, 4000);
    }
    renderSavingsGoals();
}

async function renderGlobalHistory() {
    let months = await db.months.toArray();
    renderRecordsHub(months);
    let hd = months.map(m => ({month:m.month, income:m.totalIncome, planned:m.totalPlanned, actual:m.totalActual, savings:m.totalIncome-m.totalActual}));
    hd.sort((a,b) => a.month.localeCompare(b.month));
    const tbody = document.getElementById('historyTableBody'); tbody.innerHTML = '';
    if (hd.length === 0) { tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#94a3b8;padding:20px;">Nessun dato storico.</td></tr>'; } else {
        hd.forEach(d => {
            let tr = document.createElement('tr');
            tr.innerHTML = `<td><strong>${d.month.split('-').reverse().join('/')}</strong></td><td class="text-right">${fmtN(d.income)}</td><td class="text-right" style="color:var(--previsto);">${fmtN(d.planned)}</td><td class="text-right" style="color:var(--sostenuto);font-weight:bold;">${fmtN(d.actual)}</td><td class="text-right ${d.savings>=0?'diff-plus':'diff-minus'}">${fmtN(d.savings)}</td>`;
            tbody.appendChild(tr);
        });
    }
    if (historyBarChart) historyBarChart.destroy();
    const filtered = hd.slice(-6);
    const labels = filtered.map(d => d.month.split('-').reverse().join('/'));
    historyBarChart = new Chart(document.getElementById('historyBarChart').getContext('2d'), {
        type:'bar', data:{labels, datasets:[
            {label:'Entrate', data:filtered.map(d=>d.income), backgroundColor:'#10b981', borderRadius:4},
            {label:'Budget Previsto', data:filtered.map(d=>d.planned), backgroundColor:'#f97316', borderRadius:4},
            {label:'Spesa Effettiva', data:filtered.map(d=>d.actual), backgroundColor:'#ef4444', borderRadius:4}
        ]},
        options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'top'}},scales:{x:{grid:{display:false}},y:{grid:{color:'rgba(0,0,0,0.05)'}}}}
    });
}

// =====================================================================
// GRAFICO TRADING
// =====================================================================
async function renderTradingChart() {
    let months = await db.months.toArray();
    let hd = months.map(m => ({month:m.month, income:m.totalIncome, planned:m.totalPlanned, actual:m.totalActual}));
    hd.sort((a,b) => a.month.localeCompare(b.month));
    const filtered = hd.slice(-6);
    const labels = filtered.map(d => d.month.split('-').reverse().join('/'));
    if (tradingChart) tradingChart.destroy();
    tradingChart = new Chart(document.getElementById('annualTradingChart').getContext('2d'), {
        type:'line', data:{labels, datasets:[
            {label:'Entrate', data:filtered.map(d=>d.income), borderColor:'#10b981', backgroundColor:'transparent', borderWidth:3, tension:0.2, pointRadius:4},
            {label:'Budget', data:filtered.map(d=>d.planned), borderColor:'#f97316', backgroundColor:'transparent', borderWidth:2, borderDash:[5,5], tension:0.2, pointRadius:2},
            {label:'Speso', data:filtered.map(d=>d.actual), borderColor:'#ef4444', backgroundColor:'transparent', borderWidth:3, tension:0.1, pointRadius:4}
        ]},
        options:{responsive:true,maintainAspectRatio:false,scales:{x:{grid:{color:'rgba(0,0,0,0.04)'}},y:{grid:{color:'rgba(0,0,0,0.04)'}}},plugins:{legend:{position:'top',labels:{font:{weight:'bold'}}}}}
    });
}

// =====================================================================
// PROIEZIONI FUTURE (Matematiche)
// =====================================================================
async function renderFutureProjections(isSimulated = false) {
    let simAmount = 0;
    if (isSimulated) {
        simAmount = parseFloat(document.getElementById('simulatedExpense').value) || 0;
    }

    let months = await db.months.toArray();
    let numMonths = months.length;
    let totalIncome = months.reduce((s,m) => s+m.totalIncome,0);
    let totalActual = months.reduce((s,m) => s+m.totalActual,0);
    let avgIncome = numMonths > 0 ? totalIncome / numMonths : 0;
    let avgActual = numMonths > 0 ? (totalActual / numMonths) + simAmount : simAmount;
    let avgSavings = avgIncome - avgActual;

    // Avviso accuratezza
    const warnBox = document.getElementById('futureAccuracyWarning');
    const avgBox = document.getElementById('futureAvgBox');
    if (numMonths === 0) {
        warnBox.innerHTML = `⚠️ <strong>Nessun dato registrato.</strong> Inizia ad inserire entrate e spese per ottenere le proiezioni.`;
        warnBox.style.display = 'block';
        const listContainer = document.getElementById('futureProjectionsList');
        if (listContainer) {
            listContainer.innerHTML = `<div style="text-align:center;color:#94a3b8;padding:20px;">Inserisci dati per attivare le proiezioni.</div>`;
        }
        return;
    } else if (numMonths < 3) {
        warnBox.innerHTML = `⚠️ <strong>Precisione limitata:</strong> I calcoli si basano su ${numMonths} mese${numMonths>1?'i':''}. Con più dati storici le proiezioni a lungo termine saranno molto più accurate.`;
        warnBox.style.display = 'block';
    } else { warnBox.style.display = 'none'; }

    avgBox.innerHTML = `<strong>Base di calcolo:</strong> ${numMonths} mes${numMonths===1?'e':'i'} archiviati · Media entrate: <strong>${fmtE(avgIncome)}/mese</strong> · Media uscite: <strong>${fmtE(avgActual)}/mese</strong> · Risparmio medio: <strong style="color:${avgSavings>=0?'#10b981':'#ef4444'}">${fmtE(avgSavings)}/mese</strong>`;

    const periods = [
        {label:'3 Mesi', m:3}, {label:'6 Mesi', m:6}, {label:'1 Anno', m:12},
        {label:'2 Anni', m:24}, {label:'5 Anni', m:60}, {label:'10 Anni', m:120}
    ];
    const listContainer = document.getElementById('futureProjectionsList'); listContainer.innerHTML = '';
    periods.forEach(p => {
        let estSavings = avgSavings * p.m;
        let row = document.createElement('div');
        row.style.cssText = "display:flex; justify-content:space-between; align-items:center; padding: 14px; background: var(--panel); border-radius: 12px; border: 1px solid #e2e8f0; border-left: 4px solid " + (estSavings>=0?'#10b981':'#ef4444') + ";";
        row.className = estSavings >= 0 ? 'proj-row-positive' : 'proj-row-negative';
        row.innerHTML = `<span style="font-weight:bold; font-size:14px; color:var(--primary);">${p.label}</span><span class="text-right" style="font-size:16px;">${fmtE(estSavings)}</span>`;
        listContainer.appendChild(row);
    });
}

function resetFutureSimulation() {
    const input = document.getElementById('simulatedExpense');
    if (input) input.value = '';
    // Ricalcola e ripristina i valori di default senza simulazione
    renderFutureProjections();
}

// =====================================================================
// PROVIDER IA
// =====================================================================
function toggleIaProviderFields() {
    const provider = document.getElementById('iaProviderSelect').value;
    localStorage.setItem('ia_provider', provider);
    const ollamaG = document.getElementById('ollamaModelGroup');
    const geminiG = document.getElementById('geminiKeyGroup');
    const badge = document.getElementById('iaProviderBadge');
    const hint = document.getElementById('iaStatusHint');
    if (provider === 'openrouter') { ollamaG.style.display='none'; geminiG.style.display='none'; badge.innerText='OpenRouter'; hint.innerText="🌐 Connessione globale via OpenRouter."; }
    else if (provider === 'browser-gemini') { ollamaG.style.display='none'; geminiG.style.display='none'; badge.innerText='Gemini Nano'; hint.innerText="✨ IA locale integrata nel browser (se abilitata)."; }
    else if (provider === 'gemini') { ollamaG.style.display='none'; geminiG.style.display='flex'; badge.innerText='Gemini Cloud'; hint.innerText="☁️ Connessione Cloud a Google Gemini 1.5 Pro."; }
    else { ollamaG.style.display='flex'; geminiG.style.display='none'; badge.innerText='Ollama'; checkLocalLLM(); }
}
function saveGeminiKey() { localStorage.setItem('gemini_api_key', document.getElementById('geminiApiKeyInput').value.trim()); }
async function checkLocalLLM() {
    const select = document.getElementById('ollamaModelSelect');
    const hint = document.getElementById('iaStatusHint');
    select.innerHTML = '<option value="">Caricamento...</option>';
    try {
        const r = await fetch(OLLAMA_TAGS_URL);
        if (!r.ok) throw new Error();
        const data = await r.json();
        select.innerHTML = '';
        if (data.models?.length > 0) { data.models.forEach(m => { let o=document.createElement('option'); o.value=m.name; o.innerText=m.name; select.appendChild(o); }); hint.innerHTML='🟢 <strong>Ollama connesso!</strong> Modelli rilevati.'; hint.style.color='green'; }
        else { select.innerHTML='<option value="">Nessun modello installato</option>'; hint.innerText='⚠️ Nessun modello. Esegui: ollama run llama3'; hint.style.color='var(--warning)'; }
    } catch(e) { select.innerHTML='<option value="">Connessione fallita</option>'; hint.innerHTML='⚠️ Ollama non raggiungibile. Avvia con: OLLAMA_ORIGINS="*" ollama serve'; hint.style.color='var(--danger)'; }
}

// =====================================================================
// CHIAMATE AI
// =====================================================================
async function callAIEndpoint(promptText, responseBoxId, btnId) {
    const provider = document.getElementById('iaProviderSelect').value;
    const box = document.getElementById(responseBoxId);
    const btn = document.getElementById(btnId);
    box.style.display = 'block'; box.innerText = '🤖 Elaborazione in corso...';
    if (btn) btn.disabled = true;
    try {
        if (provider === 'openrouter') {
            const OPENROUTER_API_KEY = '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';
            const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
            const OPENROUTER_MODEL = 'google/gemini-2.5-flash:free';
            const res = await fetch(OPENROUTER_URL, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
                    'HTTP-Referer': window.location.href,
                    'X-Title': 'Bilancio Pro PWA',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: OPENROUTER_MODEL,
                    messages: [{ role: 'user', content: promptText }]
                })
            });
            const json = await res.json();
            box.innerText = json.choices?.[0]?.message?.content || "❌ Risposta IA non valida da OpenRouter.";
        } else if (provider === 'browser-gemini') {
            let session = null;
            if (typeof ai !== 'undefined' && ai.languageModel) session = await ai.languageModel.create();
            else if (typeof window.ai !== 'undefined' && window.ai.createTextSession) session = await window.ai.createTextSession();
            box.innerText = session ? await session.prompt(promptText) : "❌ Gemini Nano non disponibile su questo browser.";
        } else if (provider === 'gemini') {
            const apiKey = localStorage.getItem('gemini_api_key');
            if (!apiKey) { box.innerText = "❌ Chiave API Gemini mancante."; return; }
            const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro-latest:generateContent?key=${apiKey}`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contents:[{parts:[{text:promptText}]}]})});
            const json = await res.json();
            box.innerText = json.candidates?.[0]?.content?.parts?.[0]?.text || "❌ Risposta IA non valida.";
        } else {
            const model = document.getElementById('ollamaModelSelect').value;
            if (!model) { box.innerText = "❌ Nessun modello Ollama selezionato."; return; }
            const res = await fetch(OLLAMA_URL, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model, prompt:promptText, stream:false})});
            const json = await res.json(); box.innerText = json.response;
        }
    } catch(err) { box.innerText = "❌ Errore: " + err.message; }
    finally { if (btn) btn.disabled = false; }
}

function getPreviousMonthStrings(month, count) {
    const [year, mon] = month.split('-').map(Number);
    const months = [];
    for (let i = 1; i <= count; i++) {
        const date = new Date(year, mon - 1 - i, 1);
        months.push(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
    }
    return months;
}

async function runFinancialAnalysisIA() {
    const currentMonth = document.getElementById('currentMonth').value;
    if (!currentMonth) { document.getElementById('iaResponse').innerText = '❌ Mese corrente non selezionato.'; return; }
    const prevMonths = getPreviousMonthStrings(currentMonth, 2);
    const categories = [...new Set(currentData.expenses.map(e => e.category))].sort();
    const historicalExpenses = await db.expenses.where('month').anyOf(prevMonths).toArray();
    const historyMap = {};
    historicalExpenses.forEach(e => {
        const key = `${e.category}|${e.month}`;
        historyMap[key] = (historyMap[key] || 0) + e.actual;
    });
    let dataText = `Dati:\n- Mese corrente: ${currentMonth}\n- Spese per categoria:\n`;
    categories.forEach(cat => {
        const currentTotal = currentData.expenses.filter(e => e.category === cat).reduce((s, e) => s + e.actual, 0);
        const prev1 = historyMap[`${cat}|${prevMonths[0]}`] || 0;
        const prev2 = historyMap[`${cat}|${prevMonths[1]}`] || 0;
        dataText += `  - ${cat}: corrente ${fmtE(currentTotal)}; ${prevMonths[0]} ${fmtE(prev1)}; ${prevMonths[1]} ${fmtE(prev2)}\n`;
    });
    const prompt = `Agisci come un consulente finanziario cinico e conciso. Lingua: Italiano. Analizza i seguenti dati di spesa del mese corrente e il confronto con i due mesi passati: ${dataText}Identifica le 2 categorie meno importanti (es. svago, abbonamenti, extra) dove l'utente sta spendendo di più rispetto al solito o in assoluto. Scrivi un resoconto di massimo 3 frasi indicando quanto si potrebbe risparmiare e un consiglio pratico per tagliare subito quelle spese.`;
    await callAIEndpoint(prompt, 'iaResponse', 'btnAnalyseIA');
    const txt = document.getElementById('iaResponse').innerText;
    document.getElementById('iaNotes').value = txt; await saveNotes();
}
async function runHistoryAnalysisIA() {
    const months = await db.months.orderBy('month').toArray();
    if (!months.length) { document.getElementById('iaHistoryResponse').innerText = '❌ Nessun mese archiviato.'; return; }
    let dataText = 'Dati:\n';
    months.forEach(m => {
        const savings = m.totalIncome - m.totalActual;
        dataText += `- ${m.month}: Entrate ${fmtE(m.totalIncome)}, Uscite ${fmtE(m.totalActual)}, Risparmio ${fmtE(savings)}\n`;
    });
    const prompt = `Agisci come un analista finanziario. Lingua: Italiano. Analizza questo storico plurimensile dei saldi: ${dataText}Fornisci un quadro generale sull'andamento del patrimonio (sta crescendo, è stabile o sta calando?). Evidenzia se c'è un mese record (positivo o negativo) e scrivi una conclusione concisa (max 4 righe) sullo stato di salute generale delle finanze.`;
    await callAIEndpoint(prompt, 'iaHistoryResponse', 'btnHistoryIA');
}
async function runFuturePredictionIA() {
    const months = await db.months.toArray();
    const numM = months.length;
    const totalIncome = months.reduce((s, m) => s + m.totalIncome, 0);
    const totalActual = months.reduce((s, m) => s + m.totalActual, 0);
    const avgSavings = numM > 0 ? (totalIncome - totalActual) / numM : 0;
    const projected1 = avgSavings * 12;
    const projected5 = avgSavings * 60;
    const projected10 = avgSavings * 120;
    const categoryTotals = {};
    currentData.expenses.forEach(e => { categoryTotals[e.category] = (categoryTotals[e.category] || 0) + e.actual; });
    const categoryLines = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([cat, val]) => `- ${cat}: ${fmtE(val)}/mese`).join('\n');
    const dataText = `Dati Proiezioni 10 anni:\n- Risparmio medio mensile: ${fmtE(avgSavings)}\n- Patrimonio stimato a 1 anno: ${fmtE(projected1)}\n- Patrimonio stimato a 5 anni: ${fmtE(projected5)}\n- Patrimonio stimato a 10 anni: ${fmtE(projected10)}\nCategorie di spesa attuali:\n${categoryLines}`;
    const prompt = `Agisci come un pianificatore finanziario lungimirante. Lingua: Italiano. Esamina questa proiezione matematica basata sui dati attuali: ${dataText}. Fai una considerazione critica sul risultato a lungo termine (il traguardo a 10 anni è realistico o rischioso?). Indica quali categorie di spesa attuali potrebbero minacciare questa proiezione a causa dell'inflazione o di spese impreviste. Massimo 4 frasi, stile diretto e motivazionale.`;
    await callAIEndpoint(prompt, 'iaFutureResponse', 'btnFutureIA');
}

// =====================================================================
// EXPORT PDF - FIX DEFINITIVO
// =====================================================================
async function exportPDF() {
    const month = document.getElementById('currentMonth').value;
    let fileName = prompt("Nome del file PDF:", `Report_${month}`);
    if (!fileName) return;

    let totalIncome = currentData.income.reduce((s,i)=>s+i.amount,0);
    let totalActual = currentData.expenses.reduce((s,i)=>s+i.actual,0);
    let net = totalIncome - totalActual;
    const sorted = [...currentData.expenses].sort((a,b) => a.category.localeCompare(b.category));

    let htmlString = `
    <div style="padding: 40px; background: white; color: #1e293b; font-family: Arial, sans-serif; font-size: 13px; line-height: 1.5; width: 794px;">
        <div style="text-align: center; border-bottom: 3px solid #3b82f6; padding-bottom: 18px; margin-bottom: 24px;">
            <h1 style="font-size: 26px; margin: 0; color: #1e293b; font-weight: 800;">Resoconto Finanziario</h1>
            <h2 style="font-size: 16px; color: #64748b; font-weight: 400; margin-top: 6px;">Periodo: ${month}</h2>
        </div>
        <div style="display: table; width: 100%; margin-bottom: 28px; background: #f8fafc; padding: 16px; border-radius: 10px; box-sizing: border-box;">
            <div style="display: table-cell; text-align: center; width:33%;">
                <div style="font-size: 11px; font-weight: bold; color: #64748b; text-transform: uppercase; margin-bottom:6px;">Entrate Totali</div>
                <div style="font-size: 22px; font-weight: 800; color: #10b981;">${fmtE(totalIncome)}</div>
            </div>
            <div style="display: table-cell; text-align: center; width:33%;">
                <div style="font-size: 11px; font-weight: bold; color: #64748b; text-transform: uppercase; margin-bottom:6px;">Spese Sostenute</div>
                <div style="font-size: 22px; font-weight: 800; color: #ef4444;">${fmtE(totalActual)}</div>
            </div>
            <div style="display: table-cell; text-align: center; width:33%;">
                <div style="font-size: 11px; font-weight: bold; color: #64748b; text-transform: uppercase; margin-bottom:6px;">Risparmio Netto</div>
                <div style="font-size: 22px; font-weight: 800; color: ${net >= 0 ? '#10b981' : '#ef4444'};">${fmtE(net)}</div>
            </div>
        </div>
        <h3 style="font-size: 15px; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; margin-bottom: 12px; color:#1e293b;">Dettaglio per Categoria</h3>
        <table style="width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 24px;">
            <thead>
                <tr style="background: #f1f5f9;">
                    <th style="padding: 9px 12px; text-align: left; border-bottom: 1px solid #cbd5e1; color:#334155;">Categoria</th>
                    <th style="padding: 9px 12px; text-align: left; border-bottom: 1px solid #cbd5e1; color:#334155;">Note</th>
                    <th style="padding: 9px 12px; text-align: right; border-bottom: 1px solid #cbd5e1; color:#334155;">Pianificato</th>
                    <th style="padding: 9px 12px; text-align: right; border-bottom: 1px solid #cbd5e1; color:#334155;">Sostenuto</th>
                </tr>
            </thead>
            <tbody>
                ${sorted.map(exp => `
                <tr>
                    <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;">${exp.category}</td>
                    <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;color:#64748b;">${exp.desc}</td>
                    <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;text-align:right;">${fmtE(exp.planned).replace(/<[^>]*>?/gm, '')}</td>
                    <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;text-align:right;font-weight:bold;">${exp.actual>0?fmtE(exp.actual).replace(/<[^>]*>?/gm, ''):'Da pagare'}</td>
                </tr>`).join('')}
            </tbody>
        </table>
    `;
    const iaNotes = document.getElementById('iaNotes').value;
    if (iaNotes.trim()) {
        htmlString += `
        <div style="margin-bottom: 24px;">
            <h3 style="font-size: 14px; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; margin-bottom: 10px; color: #8b5cf6;">Analisi I.A. del Mese</h3>
            <div style="background: #fdfaff; border: 1px solid #e9d5ff; padding: 14px; border-radius: 8px; font-size: 12px; line-height: 1.6; color: #581c87; white-space: pre-line;">${iaNotes}</div>
        </div>`;
    }
    htmlString += `</div>`;

    const element = document.createElement('div');
    element.innerHTML = htmlString;

    const opt = {
        margin: [10,10,10,10],
        filename: `${fileName}.pdf`,
        image: {type:'jpeg', quality:0.95},
        html2canvas: { scale: 2, useCORS: true, logging: false, windowWidth: 794 },
        jsPDF: {unit:'mm', format:'a4', orientation:'portrait'}
    };

    html2pdf().set(opt).from(element).save();
}

// =====================================================================
// EXPORT CSV
// =====================================================================
async function exportCSV() {
    const month = document.getElementById('currentMonth').value;
    let fileName = prompt("Nome file CSV:", `bilancio_${month}`);
    if (!fileName) return;
    let csv = `Report: ${month}\n\nENTRATE\nCausale;Importo\n`;
    currentData.income.forEach(i => { csv += `"${i.desc}";"${i.amount.toFixed(2)}"\n`; });
    csv += "\nSPESE\nData;Categoria;Nota;Pianificato;Sostenuto\n";
    currentData.expenses.forEach(e => { csv += `"${e.date}";"${e.category}";"${e.desc}";"${e.planned.toFixed(2)}";"${e.actual.toFixed(2)}"\n`; });
    const blob = new Blob(["\ufeff"+csv], {type:'text/csv;charset=utf-8;'});
    const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `${fileName}.csv`; link.click();
}

// =====================================================================
// BACKUP & RESTORE
// =====================================================================
async function getCompiledBackupData() {
    const versionState = await db.syncState.get('versionData');
    const counter = versionState ? (versionState.counter || 0) : 0;
    return JSON.stringify({
        db_version_counter: counter,
        last_device_id: getDeviceId(),
        lastUpdated: Date.now(),
        categories: await db.categories.toArray(),
        annual_deadlines: await db.annualDeadlines.toArray(),
        income: await db.income.toArray(),
        expenses: await db.expenses.toArray(),
        months: await db.months.toArray(),
        savingsGoals: await db.savingsGoals.toArray(),
        settings: await db.settings.toArray(),
        syncState: await db.syncState.toArray()
    }, null, 2);
}
async function exportBackupJSON() {
    let fn = prompt("Nome file backup:", "backup_bilancio.json");
    if (!fn) return; if (!fn.endsWith('.json')) fn += '.json';
    const blob = new Blob([await getCompiledBackupData()], {type:'application/json'});
    const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = fn; link.click();
}
async function shareBackupJSON() {
    const json = await getCompiledBackupData();
    if (navigator.share) {
        try {
            const blob = new Blob([json], {type:'application/json'});
            const file = new File([blob], 'backup_bilancio.json', {type:'application/json'});
            if (navigator.canShare?.({files:[file]})) { await navigator.share({files:[file],title:'Backup Bilancio'}); return; }
        } catch(e) { console.warn(e); }
    }
    exportBackupJSON();
}
function importBackupJSON(event) {
    const file = event.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const data = JSON.parse(e.target.result);
            if (data.categories && data.months) {
                await db.categories.clear(); await db.annualDeadlines.clear(); await db.income.clear(); await db.expenses.clear(); await db.months.clear();
                await db.categories.bulkPut(data.categories);
                if (data.annual_deadlines) await db.annualDeadlines.bulkPut(data.annual_deadlines);
                if (data.income) await db.income.bulkPut(data.income);
                if (data.expenses) await db.expenses.bulkPut(data.expenses);
                if (data.months) await db.months.bulkPut(data.months);
                alert("✅ Ripristino completato!");
                await initCategories(); await loadAnnualDeadlines(); await loadMonthData(); checkDatabaseHealth();
            } else { alert("File non valido o formato non riconosciuto."); }
        } catch(err) { alert("❌ Errore nel leggere il file di backup."); }
    };
    reader.readAsText(file);
}

// =====================================================================
// GOOGLE DRIVE SYNC
// =====================================================================
async function syncToDrive(silent = false) {
    try {
        const content = await getCompiledBackupData();
        const versionState = await db.syncState.get('versionData');
        const counter = versionState ? (versionState.counter || 0).toString() : '0';
        const meta = {
            name: 'budget_pwa_backup.json',
            appProperties: { db_version_counter: counter, last_device_id: getDeviceId() }
        };
        let existId = null;

        const r = await gapi.client.drive.files.list({
            q: "name='budget_pwa_backup.json' and trashed=false",
            fields: 'files(id,name)',
            pageSize: 10,
            spaces: 'drive'
        });

        const found = r.result.files?.filter(f => f.name === 'budget_pwa_backup.json');
        if (found?.length > 0) existId = found[0].id;

        const boundary = '-------314159265358979323846';
        const body = `\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${content}\r\n--${boundary}--`;

        if (existId) {
            await gapi.client.request({
                path: `/upload/drive/v3/files/${existId}`,
                method: 'PATCH',
                params: {uploadType: 'multipart'},
                headers: {'Content-Type': `multipart/related; boundary="${boundary}"`},
                body
            });
            if (!silent) showToast('✅ Sincronizzazione Drive completata', false);
        } else {
            await gapi.client.request({
                path: '/upload/drive/v3/files',
                method: 'POST',
                params: {uploadType: 'multipart'},
                headers: {'Content-Type': `multipart/related; boundary="${boundary}"`},
                body
            });
            if (!silent) showToast('✅ Sincronizzazione Drive completata (nuovo file)', false);
        }
    } catch(err) {
        console.error('Drive sync failed:', err);
        if (!silent) showToast("❌ Errore Drive. Controlla la console per i dettagli.", true);
    }
}

// =====================================================================
// RESET FUNCTIONS
// =====================================================================
async function resetCurrentMonth() {
    if (!confirm("Sei sicuro di voler azzerare tutte le spese e le entrate di QUESTO mese?")) return;
    const month = document.getElementById('currentMonth').value;
    const exp = await db.expenses.where('month').equals(month).primaryKeys();
    const inc = await db.income.where('month').equals(month).primaryKeys();
    await db.expenses.bulkDelete(exp); await db.income.bulkDelete(inc);
    await db.months.update(month, {totalIncome:0, totalPlanned:0, totalActual:0});
    loadMonthData(); alert("Mese resettato.");
}
async function resetTotalDB() {
    if (!confirm("⚠️ ATTENZIONE: Vuoi azzerare l'INTERO database? Perderai tutto lo storico.")) return;
    if (!confirm("Sei ASSOLUTAMENTE sicuro? Non si può tornare indietro senza un backup.")) return;
    await db.categories.clear(); await db.annualDeadlines.clear(); await db.income.clear(); await db.expenses.clear(); await db.months.clear();
    alert("Database azzerato."); location.reload();
}

// =====================================================================
// UTILITÀ FORMATTAZIONE
// =====================================================================
function fmtE(n, decimals=2) {
    const abs = Math.abs(n||0);
    if (decimals === 0 || abs % 1 === 0) return `${n < 0 ? '-' : ''}${Math.round(abs).toLocaleString('it-IT')} €`;
    const parts = abs.toFixed(decimals).split('.');
    return `${n < 0 ? '-' : ''}${Math.floor(abs).toLocaleString('it-IT')}<span class="hide-mobile">,${parts[1]}</span> €`;
}
function fmtEPlain(n, decimals = 2) {
    const abs = Math.abs(n||0);
    if (decimals === 0 || abs % 1 === 0) return `${n < 0 ? '-' : ''}${Math.round(abs).toLocaleString('it-IT')} €`;
    const parts = abs.toFixed(decimals).split('.');
    return `${n < 0 ? '-' : ''}${Math.floor(abs).toLocaleString('it-IT')},${parts[1]} €`;
}
function fmtN(n) { return fmtE(n); }

// =====================================================================
// PWA & PUSH NOTIFICATIONS
// =====================================================================
let deferredPrompt;
function initPWA() {
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        document.getElementById('btnInstallApp').style.display = 'block';
    });
}
async function installPWA() {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') { document.getElementById('btnInstallApp').style.display = 'none'; }
        deferredPrompt = null;
    } else {
        alert('Per installare l\'app, usa il menu del browser e seleziona "Aggiungi a Home" o "Installa app".');
    }
}
function togglePushNotifications() {
    const isEnabled = document.getElementById('pushNotifToggle').checked;
    if (isEnabled) {
        if (!("Notification" in window)) {
            alert("Il tuo browser non supporta le notifiche push.");
            document.getElementById('pushNotifToggle').checked = false;
            return;
        }
        Notification.requestPermission().then(permission => {
            if (permission === "granted") {
                localStorage.setItem('push_notifications_enabled', 'true');
                checkPushNotifications();
                alert("🔔 Notifiche attivate con successo!");
            } else {
                document.getElementById('pushNotifToggle').checked = false;
                localStorage.setItem('push_notifications_enabled', 'false');
                alert("Permesso negato per le notifiche.");
            }
        });
    } else {
        localStorage.setItem('push_notifications_enabled', 'false');
    }
}
function checkPushNotifications() {
    if (Notification.permission !== "granted") return;
    const today = new Date();
    const alertDays = 1; // Avvisa 24 ore prima
    annualDeadlines.forEach(item => {
        if (item.isPaid) return;
        const targetDate = new Date(item.month + '-' + (item.day ? String(item.day).padStart(2,'0') : '01'));
        const diffTime = targetDate.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        const notifKey = `notif_sent_${item.id}_${item.month}`;
        if (diffDays >= 0 && diffDays <= alertDays && !localStorage.getItem(notifKey)) {
            const n = new Notification("🔔 Scadenza in Arrivo", {
                body: `${item.desc} scade tra ${diffDays} giorn${diffDays===1?'o':'i'}. Importo: ${fmtE(item.amount).replace(/<[^>]*>?/gm, '')}`,
                icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 192 192'><rect width='192' height='192' rx='24' fill='%231e293b'/><text y='120' x='96' font-size='100' text-anchor='middle'>📊</text></svg>"
            });
            localStorage.setItem(notifKey, 'true');
        }
    });
}

// =====================================================================
// INIT
// =====================================================================
window.onload = initApp;

