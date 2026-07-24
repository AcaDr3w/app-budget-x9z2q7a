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

const TAB_TITLES = {
    'current-month-tab': 'Mese',
    'history-tab': 'Storico',
    'future-tab': 'Futuro',
    'settings-tab': 'Impostazioni'
};

// Responsive helper
function isDesktop() { return window.innerWidth >= 768; }

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

const defaultCategories = {
    casa_utenze: ["Alimentari", "Bolletta Acqua", "Bolletta Condominio", "Bolletta Gas", "Bolletta Luce", "Bolletta Rifiuti", "Bolletta Telefonia", "Igiene e Pulizia", "Mutuo"],
    veicoli: ["Carburante Auto", "Carburante Moto", "Manutenzioni", "Tasse Auto", "Tasse Moto"],
    spese_svago: ["Abbigliamento", "Cane", "Formazione", "Imprevisti e Svago", "Sanitarie", "Varie"]
};
const MACRO_LABELS = { casa_utenze: "Casa e Utenze", veicoli: "Veicoli", spese_svago: "Spese e Svago" };
const MACRO_ICON = { casa_utenze: "🏠", veicoli: "🚗", spese_svago: "🎉" };
const MACRO_COLOR = { casa_utenze: "#2a9d8f", veicoli: "#7bc043", spese_svago: "#6f42c1" };
const DEFAULT_ICONS = {
    Alimentari: "🛒", "Bolletta Acqua": "💧", "Bolletta Condominio": "🏢", "Bolletta Gas": "🔥",
    "Bolletta Luce": "💡", "Bolletta Rifiuti": "🗑️", "Bolletta Telefonia": "📞", "Igiene e Pulizia": "🧴",
    Mutuo: "🏠", "Carburante Auto": "⛽", "Carburante Moto": "🏍️", Manutenzioni: "🔧",
    "Tasse Auto": "💰", "Tasse Moto": "💰", Abbigliamento: "👕", Cane: "🐾",
    Formazione: "📚", "Imprevisti e Svago": "🎉", Sanitarie: "🏥", Varie: "📦"
};
let userMacroCategories = {};
let userCategories = [];
let categoryIconMap = {}; // { 'Alimentari': '🛒', ... }
let currentData = { income: [], expenses: [] };
let annualDeadlines = [];
let categoryToEdit = null;
let selectedFilterDate = null;
let selectedFilterCategory = null;
let searchQuery = "";
let chartB = null, chartC = null;
let historyBarChart = null;
let tradingChart = null;
let activeChartType = 'bars';

 // ===== VIEW MODE STATE =====
 let currentViewMode = 'full'; // 'full' or 'tabs'
 let activeMacroGroup = 'casa';

 // ===== BOTTOM SHEET SLIDER STATE =====
 let sheetCurrentMacroGroup = null; // Tracks which macro group opened the sheet

// =====================================================================
// CATEGORIES MAP - Struttura dati centralizzata per macro-categorie
// =====================================================================
const CATEGORIES_MAP = {
    "casa_utenze": [
        { id: "alimentari", nome: "Alimentari", icona: "fa-shopping-cart", colore: "#2a9d8f" },
        { id: "bolletta_acqua", nome: "Bolletta Acqua", icona: "fa-tint", colore: "#2a9d8f" },
        { id: "bolletta_condominio", nome: "Bolletta Condominio", icona: "fa-building", colore: "#2a9d8f" },
        { id: "bolletta_gas", nome: "Bolletta Gas", icona: "fa-fire", colore: "#2a9d8f" },
        { id: "bolletta_luce", nome: "Bolletta Luce", icona: "fa-lightbulb", colore: "#2a9d8f" },
        { id: "bolletta_rifiuti", nome: "Bolletta Rifiuti", icona: "fa-trash-alt", colore: "#2a9d8f" },
        { id: "bolletta_telefonia", nome: "Bolletta Telefonia", icona: "fa-phone", colore: "#2a9d8f" },
        { id: "igiene_pulizia", nome: "Igiene e Pulizia", icona: "fa-pump-soap", colore: "#2a9d8f" },
        { id: "mutuo", nome: "Mutuo", icona: "fa-home", colore: "#2a9d8f" }
    ],
    "veicoli": [
        { id: "carburante_auto", nome: "Carburante Auto", icona: "fa-gas-pump", colore: "#7bc043" },
        { id: "carburante_moto", nome: "Carburante Moto", icona: "fa-motorcycle", colore: "#7bc043" },
        { id: "manutenzioni", nome: "Manutenzioni", icona: "fa-wrench", colore: "#7bc043" },
        { id: "tasse_auto", nome: "Tasse Auto (Assic.)", icona: "fa-car", colore: "#7bc043" },
        { id: "tasse_moto", nome: "Tasse Moto (Assic.)", icona: "fa-shield-alt", colore: "#7bc043" }
    ],
    "spese_svago": [
        { id: "abbigliamento", nome: "Abbigliamento", icona: "fa-tshirt", colore: "#6f42c1" },
        { id: "cane", nome: "Cane", icona: "fa-dog", colore: "#6f42c1" },
        { id: "formazione", nome: "Formazione", icona: "fa-book-open", colore: "#6f42c1" },
        { id: "imprevisti_svago", nome: "Imprevisti e Svago", icona: "fa-glass-cheers", colore: "#6f42c1" },
        { id: "sanitarie", nome: "Sanitarie", icona: "fa-stethoscope", colore: "#6f42c1" },
        { id: "varie", nome: "Varie", icona: "fa-box", colore: "#6f42c1" }
    ]
};

function getCategoryMacroGroup(catName) {
    for (const [key, subs] of Object.entries(CATEGORIES_MAP)) {
        if (subs.some(sub => sub.nome === catName)) {
            return key;
        }
    }
    return 'spese_svago'; // fallback per categorie non mappate
}

// Inizializzazione valori UI
const dateNow = new Date();
let initYear = dateNow.getFullYear(), initMonth = dateNow.getMonth() + 1;
document.getElementById('currentMonth').value = `${initYear}-${String(initMonth).padStart(2,'0')}`;
document.getElementById('annDeadlineMonth').value = `${initYear}-${String(initMonth).padStart(2,'0')}`;
document.getElementById('expDate').value = dateNow.toISOString().slice(0,10);
if (localStorage.getItem('ia_provider')) document.getElementById('iaProviderSelect').value = localStorage.getItem('ia_provider');
if (localStorage.getItem('gemini_api_key')) document.getElementById('geminiApiKeyInput').value = localStorage.getItem('gemini_api_key');

// Aggiorna il display del mese nella pillola
function updateMonthDisplay() {
    const monthInput = document.getElementById('currentMonth');
    const display = document.getElementById('currentMonthDisplay');
    if (!monthInput || !display) return;
    const [year, month] = monthInput.value.split('-');
    const monthNames = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
    const monthName = monthNames[parseInt(month, 10) - 1] || '';
    display.textContent = `${monthName} ${year}`;
}

// Aggiorna il display del mese quando cambia la selezione
document.addEventListener('DOMContentLoaded', () => {
    const monthInputEl = document.getElementById('currentMonth');
    if (monthInputEl) {
        monthInputEl.addEventListener('change', updateMonthDisplay);
    }
});

// =====================================================================
// AVVIO APP & MIGRAZIONE DA LOCALSTORAGE
// =====================================================================
async function initApp() {
    // Request persistent storage to prevent browser auto-cleanup
    if (navigator.storage && navigator.storage.persist) {
        try {
            const granted = await navigator.storage.persist();
            if (granted) console.log("[Storage] Persistenza garantita dal browser.");
            else console.log("[Storage] Persistenza non garantita (storage temporaneo).");
        } catch (err) {
            console.warn("[Storage] Errore richiesta persistenza:", err);
        }
    }

    // Ensure IndexedDB is fully open before any operations
    try {
        await db.open();
        console.log("[DB] Database aperto con successo.");
    } catch (err) {
        console.error("[DB] Errore apertura database:", err);
        showToast("Errore nel database. Consulta la console.", true);
        return;
    }

    await migrateFromLocalStorage();
    await initCategories();
    setupCategoryForm();
    await loadAnnualDeadlines();
    await loadMonthData();
    toggleIaProviderFields();
    checkDatabaseHealth();
    initPWA();
    // Aggiorna il display del mese nella pillola all'avvio
    updateMonthDisplay();
    // Inizializza il view toggle
    setupViewToggle();
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
    if (cats) {
        const parsed = JSON.parse(cats);
        await db.categories.bulkPut(parsed.map(c => {
            const nm = typeof c === 'string' ? c : c.name;
            const macro = getCategoryMacroGroup(nm);
            return {name: nm, macro, icon: DEFAULT_ICONS[nm] || MACRO_ICON[macro] || '🏷️'};
        }));
    }
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
function updateActivePageSubtitle(tabId) {
    const subtitle = document.getElementById('activePageSubtitle');
    if (!subtitle) return;
    subtitle.textContent = TAB_TITLES[tabId] || 'Dashboard';
}
function switchTab(tabId, buttonEl) {
    document.querySelectorAll('.tab-content').forEach(c => { c.classList.remove('active'); c.classList.add('hidden'); });
    document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const target = document.getElementById(tabId);
    target.classList.remove('hidden');
    target.classList.add('active');
    const navMap = {
        'current-month-tab': 'navMese',
        'history-tab': 'navAnalisi',
        'future-tab': 'navPrevisioni',
        'settings-tab': 'navImpostazioni'
    };
    const navItem = document.getElementById(navMap[tabId]);
    if (navItem) navItem.classList.add('active');
    updateActivePageSubtitle(tabId);
    if (tabId === 'history-tab') { renderGlobalHistory(); renderTradingChart(); initChartToggle(); }
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
// UTILITY - MESE SOLARE STANDARD
// =====================================================================
function getMonthRange(monthStr) {
    // Mese solare standard: 1° giorno al 31° (ultimo giorno del mese)
    let year = parseInt(monthStr.split('-')[0]);
    let month = parseInt(monthStr.split('-')[1]);
    let start = new Date(year, month - 1, 1);
    let end = new Date(year, month - 1 + 1, 0); // 0 dell'ennesimo mese = ultimo giorno del mese
    return { start, end };
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
function rebuildUserCategories() {
    userCategories = [];
    for (const key of Object.keys(userMacroCategories)) {
        for (const cat of userMacroCategories[key]) {
            if (!userCategories.includes(cat)) userCategories.push(cat);
        }
    }
}

function loadCategories() {
    const stored = localStorage.getItem('user_macro_categories');
    if (stored) {
        try {
            userMacroCategories = JSON.parse(stored);
        } catch(e) {
            userMacroCategories = JSON.parse(JSON.stringify(defaultCategories));
        }
    } else {
        userMacroCategories = JSON.parse(JSON.stringify(defaultCategories));
        localStorage.setItem('user_macro_categories', JSON.stringify(userMacroCategories));
    }
    for (const key of ['casa_utenze', 'veicoli', 'spese_svago']) {
        if (!userMacroCategories[key]) userMacroCategories[key] = [];
    }
    categoryIconMap = {};
    for (const [macro, cats] of Object.entries(userMacroCategories)) {
        cats.forEach(name => {
            categoryIconMap[name] = DEFAULT_ICONS[name] || MACRO_ICON[macro] || '🏷️';
        });
    }
    rebuildUserCategories();
}

function saveMacroToLocalStorage() {
    localStorage.setItem('user_macro_categories', JSON.stringify(userMacroCategories));
}

async function syncUserMacroToDB() {
    try {
        for (const [macro, cats] of Object.entries(userMacroCategories)) {
            for (const name of cats) {
                const existing = await db.categories.get(name);
                if (existing) {
                    if (!existing.macro || existing.macro !== macro) {
                        await db.categories.update(name, { macro });
                    }
                } else {
                    await db.categories.put({ name, macro, icon: categoryIconMap[name] || MACRO_ICON[macro] || '🏷️' });
                }
            }
        }
        const allStored = await db.categories.toArray();
        for (const stored of allStored) {
            const found = Object.values(userMacroCategories).some(arr => arr.includes(stored.name));
            if (!found) {
                await db.categories.delete(stored.name);
            }
        }
        await updateGlobalVersion();
    } catch (err) {
        console.warn('[DB] syncUserMacroToDB error:', err);
    }
}

async function initCategories() {
    loadCategories();
    try {
        await syncUserMacroToDB();
    } catch (err) {
        console.warn('[DB] sync fallito:', err);
    }
    renderCategoriesDropdown();
    renderCategorySettings();
}
function getCatIcon(catName) {
    return categoryIconMap[catName] || '🏷️';
}

function getFaIcon(catName) {
    for (const subs of Object.values(CATEGORIES_MAP)) {
        const found = subs.find(sub => sub.nome === catName);
        if (found) return found.icona;
    }
    return 'fa-tag';
}



// =====================================================================
// CATEGORY COLOR MAPPING (for pie chart and grid)
// =====================================================================
const CATEGORY_COLORS = ['#3b82f6','#8b5cf6','#475569','#0d9488','#10b981','#f59e0b','#f97316','#ef4444','#06b6d4','#ec4899','#a855f7','#eab308'];

function getCategoryColor(catName) {
    if (!catName) return CATEGORY_COLORS[0];
    let hash = 0;
    for (let i = 0; i < catName.length; i++) {
        hash = catName.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % CATEGORY_COLORS.length;
    return CATEGORY_COLORS[index];
}

function getCategoryCardBg(catName) {
    const color = getCategoryColor(catName);
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, 0.15)`;
}

function getCategoryCardBorder(catName) {
    const color = getCategoryColor(catName);
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    return `1px solid rgba(${r}, ${g}, ${b}, 0.25)`;
}

// ===== BOTTOM SHEET STATE =====
let sheetSelectedCategory = null;
let sheetTransactionType = 'actual'; // 'actual' for Sostenuta, 'planned' for Prevista

function openTransactionSheet(categoryName) {
    console.log("Card cliccata:", categoryName);
    sheetSelectedCategory = categoryName;
    sheetTransactionType = 'actual';
    const overlay = document.getElementById('sheetOverlay');
    const sheet = document.getElementById('bottomSheet');
    const title = document.getElementById('sheetCategoryTitle');
    const intInput = document.getElementById('hiddenIntegerInput');
    const decInput = document.getElementById('hiddenDecimalInput');
    const sheetDate = document.getElementById('sheetDate');
    const toggleOptions = document.querySelectorAll('.toggle-option');
    
if (overlay && sheet && title) {
        title.textContent = categoryName;
        document.body.classList.add('sheet-open');
        overlay.classList.add('open');
        sheet.classList.add('open');
        
        // Reset inputs
        if (intInput) intInput.value = '';
        if (decInput) decInput.value = '';
        
        // Reset date to today
        if (sheetDate) {
            const today = new Date().toISOString().slice(0, 10);
            sheetDate.value = today;
        }
        
        // Reset toggle to 'actual' (Sostenuta)
        toggleOptions.forEach(opt => opt.classList.toggle('active', opt.dataset.type === 'actual'));
        
        initNativeWheels();
    }
}

function closeTransactionSheet() {
    const overlay = document.getElementById('sheetOverlay');
    const sheet = document.getElementById('bottomSheet');
    if (overlay && sheet) {
        document.body.classList.remove('sheet-open');
        overlay.classList.remove('open');
        sheet.classList.remove('open');
        sheet.style.transform = '';
        sheet.classList.remove('dragging');
    }
    sheetSelectedCategory = null;
    sheetTransactionType = 'actual';
    sheetCurrentMacroGroup = null;
    
    // Reset slider position
    const slider = document.querySelector('.sheet-slider');
    if (slider) slider.style.transform = 'translateX(0)';
}

// Wheel state
let wheelDebounceTimer = null;
let isScrollingProgrammatically = false;
let selectedInteger = 0;
let selectedDecimal = 0;

// Store scroll handlers for removal during programmatic scroll
let intWheelScrollHandler = null;
let decWheelScrollHandler = null;

// Constants for wheel calculations
const WHEEL_ITEM_HEIGHT = 50; // Must match CSS .wheel-item height

function initNativeWheels() {
    const intWheel = document.getElementById('integerWheel');
    const decWheel = document.getElementById('decimalWheel');
    const intInput = document.getElementById('hiddenIntegerInput');
    const decInput = document.getElementById('hiddenDecimalInput');
    
    if (!intWheel || !decWheel) return;
    
    // Generate integer wheel (0-999) with padding
    intWheel.innerHTML = '';
    decWheel.innerHTML = '';
    
    // Padding items for proper snap (empty items before/after)
    const intPaddingBefore = document.createElement('div');
    intPaddingBefore.className = 'wheel-item';
    intPaddingBefore.style.height = '50px';
    intWheel.appendChild(intPaddingBefore);
    
    for (let i = 0; i <= 999; i++) {
        const span = document.createElement('div');
        span.className = 'wheel-item' + (i === 0 ? ' selected' : '');
        span.textContent = i.toString().padStart(3, '0');
        span.dataset.value = i.toString().padStart(3, '0');
        intWheel.appendChild(span);
    }
    
    const intPaddingAfter = document.createElement('div');
    intPaddingAfter.className = 'wheel-item';
    intPaddingAfter.style.height = '50px';
    intWheel.appendChild(intPaddingAfter);
    
    // Decimal wheel (00-99) with padding
    const decPaddingBefore = document.createElement('div');
    decPaddingBefore.className = 'wheel-item';
    decPaddingBefore.style.height = '50px';
    decWheel.appendChild(decPaddingBefore);
    
    for (let i = 0; i <= 99; i++) {
        const span = document.createElement('div');
        span.className = 'wheel-item' + (i === 0 ? ' selected' : '');
        span.textContent = i.toString().padStart(2, '0');
        span.dataset.value = i.toString().padStart(2, '0');
        decWheel.appendChild(span);
    }
    
    const decPaddingAfter = document.createElement('div');
    decPaddingAfter.className = 'wheel-item';
    decPaddingAfter.style.height = '50px';
    decWheel.appendChild(decPaddingAfter);
    
    // Reset selections
    selectedInteger = 0;
    selectedDecimal = 0;
    
    // Define scroll handlers and store them for later removal
    intWheelScrollHandler = function() {
        // Skip if we're scrolling programmatically
        if (isScrollingProgrammatically) return;
        
        clearTimeout(wheelDebounceTimer);
        wheelDebounceTimer = setTimeout(() => {
            const items = intWheel.querySelectorAll('.wheel-item');
            const centerY = intWheel.scrollTop + 75; // 150px/2
            let closestIdx = 0;
            let closestDiff = Infinity;
            
            items.forEach((item, idx) => {
                const itemTop = idx * WHEEL_ITEM_HEIGHT;
                const itemCenter = itemTop + (WHEEL_ITEM_HEIGHT / 2);
                const diff = Math.abs(centerY - itemCenter);
                if (diff < closestDiff) {
                    closestDiff = diff;
                    closestIdx = idx;
                }
            });
            
            // Skip padding items (first and last)
            if (closestIdx > 0 && closestIdx < items.length - 1) {
                selectedInteger = closestIdx - 1;
                items.forEach((item, idx) => {
                    item.classList.toggle('selected', idx === closestIdx);
                });
                syncWheelToInput('integer', selectedInteger);
            }
        }, 100);
    };
    
    decWheelScrollHandler = function() {
        // Skip if we're scrolling programmatically
        if (isScrollingProgrammatically) return;
        
        clearTimeout(wheelDebounceTimer);
        wheelDebounceTimer = setTimeout(() => {
            const items = decWheel.querySelectorAll('.wheel-item');
            const centerY = decWheel.scrollTop + 75;
            let closestIdx = 0;
            let closestDiff = Infinity;
            
            items.forEach((item, idx) => {
                const itemTop = idx * WHEEL_ITEM_HEIGHT;
                const itemCenter = itemTop + (WHEEL_ITEM_HEIGHT / 2);
                const diff = Math.abs(centerY - itemCenter);
                if (diff < closestDiff) {
                    closestDiff = diff;
                    closestIdx = idx;
                }
            });
            
            if (closestIdx > 0 && closestIdx < items.length - 1) {
                selectedDecimal = closestIdx - 1;
                items.forEach((item, idx) => {
                    item.classList.toggle('selected', idx === closestIdx);
                });
                syncWheelToInput('decimal', selectedDecimal);
            }
        }, 100);
    };
    
    intWheel.addEventListener('scroll', intWheelScrollHandler);
    decWheel.addEventListener('scroll', decWheelScrollHandler);
    
    // Sync input changes to wheels - INPUT event for real-time sync
    const intContainer = document.getElementById('integerWheelContainer');
    const decContainer = document.getElementById('decimalWheelContainer');
    
    // Debounce timers for input events
    let intInputDebounceTimer = null;
    let decInputDebounceTimer = null;
    
    if (intInput) {
        intInput.addEventListener('input', () => {
            // Debounce the scroll to avoid interrupting fast typing
            clearTimeout(intInputDebounceTimer);
            intInputDebounceTimer = setTimeout(() => {
                const val = parseInt(intInput.value) || 0;
                if (val >= 0 && val <= 999) {
                    syncInputToWheel('integer', val);
                }
            }, 150);
        });
        // Enter key moves focus to decimal with small delay to avoid blur conflict
        intInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && decInput) {
                e.preventDefault();
                setTimeout(() => decInput.focus(), 50);
            }
        });
        // Focus/blur visual feedback + select all on focus
        intInput.addEventListener('focus', (e) => {
            if (intContainer) intContainer.classList.add('focused');
            e.target.select();
        });
        intInput.addEventListener('blur', () => {
            if (intContainer) intContainer.classList.remove('focused');
            isScrollingProgrammatically = false; // Reset flag on blur
        });
    }
    
    if (decInput) {
        decInput.addEventListener('input', () => {
            clearTimeout(decInputDebounceTimer);
            decInputDebounceTimer = setTimeout(() => {
                let val = parseInt(decInput.value) || 0;
                if (val < 0) val = 0;
                if (val > 99) val = 99;
                syncInputToWheel('decimal', val);
            }, 150);
        });
        // Focus/blur visual feedback + select all on focus
        decInput.addEventListener('focus', (e) => {
            if (decContainer) decContainer.classList.add('focused');
            e.target.select();
        });
        decInput.addEventListener('blur', () => {
            if (decContainer) decContainer.classList.remove('focused');
            isScrollingProgrammatically = false; // Reset flag on blur
        });
    }
    
// Click on wheel container opens keyboard
    if (intContainer) {
        intContainer.addEventListener('click', () => {
            if (intInput) intInput.focus();
        });
    }
    if (decContainer) {
        decContainer.addEventListener('click', () => {
            if (decInput) decInput.focus();
        });
    }
}

// =====================================================================
// VIEW MODE & MACRO TABS
// =====================================================================
function setupViewToggle() {
    const toggleBtn = document.getElementById('viewToggleBtn');
    const macroTabsContainer = document.getElementById('macroTabsContainer');
    
    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            if (currentViewMode === 'full') {
                currentViewMode = 'tabs';
                toggleBtn.innerHTML = '<i class="fas fa-th"></i>';
                if (macroTabsContainer) macroTabsContainer.style.display = 'flex';
            } else {
                currentViewMode = 'full';
                toggleBtn.innerHTML = '<i class="fas fa-layer-group"></i>';
                if (macroTabsContainer) macroTabsContainer.style.display = 'none';
            }
            updateUI();
        });
    }
    
    // Setup macro tab clicks
    document.querySelectorAll('.macro-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.macro-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            activeMacroGroup = tab.dataset.target;
            updateUI();
        });
    });
}

// setupViewToggle() è ora chiamato in initApp()

// =====================================================================
// BOTTOM SHEET WITH MACRO/MICRO CATEGORIES (ORIGINAL GRID INJECTION)
// =====================================================================
function openBottomSheetFromMacro(macroGroup) {
    sheetCurrentMacroGroup = macroGroup;
    const overlay = document.getElementById('sheetOverlay');
    const sheet = document.getElementById('bottomSheet');
    
    if (!overlay || !sheet) return;
    
    document.body.classList.add('sheet-open');
    overlay.classList.add('open');
    sheet.classList.add('open');
    
    // Render micro categories in the grid
    renderMicroCategoriesGrid(macroGroup);
    
    // Reset slider position
    const slider = document.querySelector('.sheet-slider');
    if (slider) slider.style.transform = 'translateX(0)';
    
    // Hide back button
    const backBtn = document.getElementById('btn-back-to-categories');
    if (backBtn) backBtn.style.display = 'none';
    
    // Set title based on macro group
    const sheetTitle = document.getElementById('selected-category-title');
    if (sheetTitle) {
        const titles = { 
            'casa_utenze': 'Casa e Utenze', 
            'veicoli': 'Veicoli', 
            'spese_svago': 'Spese e Svago' 
        };
        sheetTitle.textContent = titles[macroGroup] || 'Categoria';
    }
}

function renderMicroCategoriesGrid(macroGroup) {
    const container = document.getElementById('microCategoriesGrid');
    if (!container) return;
    
    container.innerHTML = '';
    
    const cats = userMacroCategories[macroGroup];
    if (!cats || cats.length === 0) {
        container.innerHTML = '<div class="bottom-sheet-empty">Nessuna categoria presente. Aggiungila nelle Impostazioni</div>';
        return;
    }
    
    const wrapper = document.createElement('div');
    wrapper.className = 'bottom-sheet-grid';
    
    cats.forEach(cat => {
        const faIcon = getFaIcon(cat);
        
        const pVal = currentData.expenses
            .filter(e => e.category === cat)
            .reduce((s, e) => s + e.planned, 0);
        const aVal = currentData.expenses
            .filter(e => e.category === cat)
            .reduce((s, e) => s + e.actual, 0);
        
        let perc = 0;
        let barColor = '#2a9d8f';
        if (pVal > 0) {
            perc = Math.min((aVal / pVal) * 100, 100);
            if (perc >= 100) barColor = '#e76f51';
            else if (perc > 70) barColor = '#e9c46a';
        }
        
        const card = document.createElement('div');
        card.className = 'bottom-sheet-cat-card';
        card.dataset.id = cat;
        card.style.background = getCategoryCardBg(cat);
        card.innerHTML = `
            <div class="cat-icon-wrap">
                <i class="fas ${faIcon}"></i>
            </div>
            <span class="cat-name">${cat}</span>
            <div class="cat-progress-track">
                <div class="cat-progress-bar" style="width: ${perc}%; background-color: ${barColor};"></div>
            </div>
        `;
        card.addEventListener('click', () => slideToInputView(cat));
        wrapper.appendChild(card);
    });
    
    container.appendChild(wrapper);
}

function slideToInputView(categoryName) {
    sheetSelectedCategory = categoryName;
    sheetTransactionType = 'actual';
    
    const slider = document.querySelector('.sheet-slider');
    if (slider) slider.style.transform = 'translateX(-100%)';
    
    // Show back button
    const backBtn = document.getElementById('btn-back-to-categories');
    if (backBtn) backBtn.style.display = 'flex';
    
    // Update title
    const sheetTitle = document.getElementById('selected-category-title');
    if (sheetTitle) sheetTitle.textContent = categoryName;
    
    // Reset inputs and init wheels
    const intInput = document.getElementById('hiddenIntegerInput');
    const decInput = document.getElementById('hiddenDecimalInput');
    const sheetDate = document.getElementById('sheetDate');
    const toggleOptions = document.querySelectorAll('.toggle-option');
    
    if (intInput) intInput.value = '';
    if (decInput) decInput.value = '';
    if (sheetDate) sheetDate.value = new Date().toISOString().slice(0, 10);
    
    toggleOptions.forEach(opt => {
        opt.classList.toggle('active', opt.dataset.type === 'actual');
    });
    
    initNativeWheels();
}

function slideBackToCategories() {
    const slider = document.querySelector('.sheet-slider');
    if (slider) slider.style.transform = 'translateX(0)';
    
    // Hide back button
    const backBtn = document.getElementById('btn-back-to-categories');
    if (backBtn) backBtn.style.display = 'none';
    
    // Update title back to macro
    const sheetTitle = document.getElementById('selected-category-title');
    if (sheetTitle && sheetCurrentMacroGroup) {
        const titles = { 
            'casa_utenze': 'Casa e Utenze', 
            'veicoli': 'Veicoli', 
            'spese_svago': 'Spese e Svago' 
        };
        sheetTitle.textContent = titles[sheetCurrentMacroGroup] || 'Categoria';
    }
    
    sheetSelectedCategory = null;
}

// Setup macro dash card click handlers with event delegation
function setupMacroDashCards() {
    const container = document.querySelector('.mobile-dashboard-container');
    if (!container) return;
    
    container.style.cursor = 'pointer';
    container.addEventListener('click', (e) => {
        const card = e.target.closest('[data-category]');
        if (!card) return;
        const macro = card.dataset.category;
        if (macro) openBottomSheetFromMacro(macro);
    });
}

// Setup back button handler
function setupBottomSheetBackBtn() {
    const backBtn = document.getElementById('btn-back-to-categories');
    if (backBtn) {
        backBtn.addEventListener('click', slideBackToCategories);
    }
}

function syncWheelToInput(type, value) {
    const intInput = document.getElementById('hiddenIntegerInput');
    const decInput = document.getElementById('hiddenDecimalInput');
    
    if (type === 'integer' && intInput) {
        intInput.value = value;
    } else if (type === 'decimal' && decInput) {
        decInput.value = value;
    }
}

// Sync input value to wheel scroll position using DOM-based approach
function syncInputToWheel(type, value) {
    const intWheel = document.getElementById('integerWheel');
    const decWheel = document.getElementById('decimalWheel');
    
    if (type === 'integer' && intWheel) {
        selectedInteger = value;
        // Format value with padding
        const formattedValue = value.toString().padStart(3, '0');
        // Find element by data-value
        const targetElement = intWheel.querySelector(`.wheel-item[data-value="${formattedValue}"]`);
        if (targetElement) {
            isScrollingProgrammatically = true;
            // Remove scroll listener temporarily
            if (intWheelScrollHandler) {
                intWheel.removeEventListener('scroll', intWheelScrollHandler);
            }
            // Use scrollIntoView to center the element
            targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            // Re-add listener and reset flag after smooth scroll completes
            setTimeout(() => {
                if (intWheelScrollHandler) {
                    intWheel.addEventListener('scroll', intWheelScrollHandler);
                }
                isScrollingProgrammatically = false;
            }, 400);
        }
    } else if (type === 'decimal' && decWheel) {
        selectedDecimal = value;
        // Format value with padding
        const formattedValue = value.toString().padStart(2, '0');
        // Find element by data-value
        const targetElement = decWheel.querySelector(`.wheel-item[data-value="${formattedValue}"]`);
        if (targetElement) {
            isScrollingProgrammatically = true;
            // Remove scroll listener temporarily
            if (decWheelScrollHandler) {
                decWheel.removeEventListener('scroll', decWheelScrollHandler);
            }
            // Use scrollIntoView to center the element
            targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            // Re-add listener and reset flag after smooth scroll completes
            setTimeout(() => {
                if (decWheelScrollHandler) {
                    decWheel.addEventListener('scroll', decWheelScrollHandler);
                }
                isScrollingProgrammatically = false;
            }, 400);
        }
    }
}

// Swipe-to-dismiss for bottom sheet
let dragStartY = 0;
let dragCurrentY = 0;
let isDragging = false;

function setupSwipeToClose() {
    const sheet = document.getElementById('bottomSheet');
    const handle = document.querySelector('.drag-handle-wrapper');
    const header = document.querySelector('.sheet-header');
    const dragTargets = [handle, header].filter(Boolean);
    
    if (!sheet || dragTargets.length === 0) return;
    
    const onTouchStart = (e) => {
        isDragging = true;
        dragStartY = e.touches[0].clientY;
        sheet.classList.add('dragging');
    };
    
    const onTouchMove = (e) => {
        if (!isDragging) return;
        dragCurrentY = e.touches[0].clientY;
        const deltaY = dragCurrentY - dragStartY;
        if (deltaY > 0) {
            sheet.style.transform = `translateY(${deltaY}px)`;
        }
    };
    
    const onTouchEnd = () => {
        if (!isDragging) return;
        isDragging = false;
        const deltaY = dragCurrentY - dragStartY;
        const sheetHeight = sheet.offsetHeight;
        const threshold = Math.min(100, sheetHeight * 0.3);
        sheet.classList.remove('dragging');
        if (deltaY > threshold) {
            closeTransactionSheet();
        } else {
            sheet.style.transform = '';
        }
    };
    
    dragTargets.forEach(el => {
        el.addEventListener('touchstart', onTouchStart, { passive: true });
        el.addEventListener('touchmove', onTouchMove, { passive: true });
        el.addEventListener('touchend', onTouchEnd);
        el.addEventListener('touchcancel', onTouchEnd);
    });
}

// Initialize swipe handlers when DOM ready
document.addEventListener('DOMContentLoaded', setupSwipeToClose);

// Toggle transaction type (Segmented control)
function setupToggleType() {
    const toggleOptions = document.querySelectorAll('.toggle-option');
    toggleOptions.forEach(opt => {
        opt.addEventListener('click', () => {
            toggleOptions.forEach(o => o.classList.remove('active'));
            opt.classList.add('active');
            sheetTransactionType = opt.dataset.type;
        });
    });
}

// Save transaction from bottom sheet
async function saveTransactionFromSheet() {
    const month = document.getElementById('currentMonth').value;
    const intInput = document.getElementById('hiddenIntegerInput');
    const decInput = document.getElementById('hiddenDecimalInput');
    const sheetDate = document.getElementById('sheetDate');
    const sheetNote = document.getElementById('sheetNote');
    const saveBtn = document.getElementById('saveTransactionBtn');
    
    const intVal = parseInt(intInput?.value) || selectedInteger;
    const decVal = parseInt(decInput?.value) || selectedDecimal;
    const amount = intVal + (decVal / 100);
    
    if (amount <= 0) {
        alert('Inserisci un importo maggiore di zero');
        return;
    }
    
    const date = sheetDate?.value || new Date().toISOString().slice(0, 10);
    const note = sheetNote?.value.trim() || '';
    
    const exp = {
        id: Date.now(),
        month: month,
        date: date,
        category: sheetSelectedCategory,
        desc: note || 'Aggiunto da mobile',
        planned: sheetTransactionType === 'planned' ? amount : 0,
        actual: sheetTransactionType === 'actual' ? amount : 0,
        sharedPercentage: 0
    };
    
    try {
        currentData.expenses.push(exp);
        await db.expenses.put(exp);
        closeTransactionSheet();
        updateUI();
        showToast('Spesa aggiunta', false);
    } catch (err) {
        console.error('[DB] Error adding expense from sheet:', err);
        showToast('Errore salvataggio', true);
        currentData.expenses.pop();
    }
}

// Setup close button and save button handlers
(function setupBottomSheetEvents() {
    const closeBtn = document.getElementById('closeSheetBtn');
    const overlay = document.getElementById('sheetOverlay');
    const sheet = document.getElementById('bottomSheet');
    const saveBtn = document.getElementById('saveTransactionBtn');
    
    if (closeBtn) {
        closeBtn.addEventListener('click', closeTransactionSheet);
    }
    if (overlay) {
        overlay.addEventListener('click', closeTransactionSheet);
    }
    if (saveBtn) {
        saveBtn.addEventListener('click', saveTransactionFromSheet);
    }
    // Prevent click-through on sheet
    if (sheet) {
        sheet.addEventListener('click', (e) => e.stopPropagation());
    }
})();

// Initialize toggle when DOM ready
document.addEventListener('DOMContentLoaded', setupToggleType);

// Initialize macro dash cards and back button
document.addEventListener('DOMContentLoaded', () => {
    setupMacroDashCards();
    setupBottomSheetBackBtn();
});

function renderCategoriesDropdown() {
    const select = document.getElementById('expenseCategory');
    if (!select) return;
    select.innerHTML = '';
    const sorted = [...userCategories].sort();
    sorted.forEach(cat => {
        const icon = getCatIcon(cat);
        let opt = document.createElement('option'); opt.value = cat; opt.innerText = `${icon} ${cat}`; select.appendChild(opt);
    });
}

function renderCategorySettings() {
    const keys = ['casa_utenze', 'veicoli', 'spese_svago'];
    keys.forEach(key => {
        const ul = document.getElementById('catList-' + key);
        const count = document.getElementById('count-' + key);
        if (!ul) return;
        ul.innerHTML = '';
        const cats = userMacroCategories[key] || [];
        if (cats.length === 0) {
            const empty = document.createElement('li');
            empty.className = 'macro-group-empty';
            empty.textContent = 'Nessuna categoria';
            ul.appendChild(empty);
        } else {
            cats.forEach(name => {
                const li = document.createElement('li');
                li.innerHTML = `<span>${getCatIcon(name)} ${name}</span>
                    <button class="cat-del-btn" data-cat="${name.replace(/'/g, "\\'")}">🗑️</button>`;
                li.querySelector('.cat-del-btn').addEventListener('click', () => deleteCategory(name));
                ul.appendChild(li);
            });
        }
        if (count) count.textContent = cats.length;
    });
}

function setupCategoryForm() {
    const btn = document.getElementById('btnSaveCategory');
    if (btn) btn.addEventListener('click', saveCategory);
    const input = document.getElementById('newCatName');
    if (input) {
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                saveCategory();
            }
        });
    }
}

function editCategory(cat) {
    categoryToEdit = cat;
    document.getElementById('newCatName').value = cat;
    let macro = getCategoryMacroGroup(cat);
    for (const [m, cats] of Object.entries(userMacroCategories)) {
        if (cats.includes(cat)) { macro = m; break; }
    }
    const sel = document.getElementById('newCatMacro');
    if (sel) sel.value = macro;
    const btn = document.getElementById('btnSaveCategory');
    if(btn) {
        btn.innerText = 'Salva';
        btn.style.background = '#f59e0b';
    }
}

async function saveCategory() {
    const input = document.getElementById('newCatName');
    const name = input.value.trim();
    if (!name) return;
    const macroSelect = document.getElementById('newCatMacro');
    const macro = macroSelect ? macroSelect.value : 'spese_svago';
    
    try {
        if (categoryToEdit) {
            if (name !== categoryToEdit && userCategories.includes(name)) {
                alert('Categoria già esistente.'); return;
            }
            if (name !== categoryToEdit) {
                const allExp = await db.expenses.where('category').equals(categoryToEdit).toArray();
                for (let e of allExp) { await db.expenses.update(e.id, {category: name}); }
                currentData.expenses.forEach(e => { if (e.category === categoryToEdit) e.category = name; });
                const oldMacro = getCategoryMacroGroup(categoryToEdit);
                if (userMacroCategories[oldMacro]) {
                    userMacroCategories[oldMacro] = userMacroCategories[oldMacro].filter(c => c !== categoryToEdit);
                }
                delete categoryIconMap[categoryToEdit];
                await db.categories.delete(categoryToEdit);
            }
            if (!userMacroCategories[macro]) userMacroCategories[macro] = [];
            if (!userMacroCategories[macro].includes(name)) userMacroCategories[macro].push(name);
            categoryIconMap[name] = categoryIconMap[name] || MACRO_ICON[macro] || '🏷️';
            await db.categories.put({name, macro, icon: categoryIconMap[name]});
            
            categoryToEdit = null;
            const btn = document.getElementById('btnSaveCategory');
            if(btn) {
                btn.innerText = 'Aggiungi';
                btn.style.background = 'var(--accent)';
            }
        } else {
            if (userCategories.includes(name)) return;
            if (!userMacroCategories[macro]) userMacroCategories[macro] = [];
            userMacroCategories[macro].push(name);
            categoryIconMap[name] = MACRO_ICON[macro] || '🏷️';
            await db.categories.put({name, macro, icon: categoryIconMap[name]});
        }
        rebuildUserCategories();
        saveMacroToLocalStorage();
        await updateGlobalVersion();
        input.value = '';
        renderCategoriesDropdown();
        renderCategorySettings();
        renderImportCheckboxList();
        updateUI();
    } catch (err) {
        console.error('[DB] Errore salvataggio categoria:', err);
        showToast('Errore nel salvare la categoria', true);
    }
}
async function deleteCategory(cat) {
    if (!confirm(`Eliminare "${cat}"?`)) return;
    const macro = getCategoryMacroGroup(cat);
    if (userMacroCategories[macro]) {
        userMacroCategories[macro] = userMacroCategories[macro].filter(c => c !== cat);
    }
    delete categoryIconMap[cat];
    await db.categories.delete(cat);
    rebuildUserCategories();
    saveMacroToLocalStorage();
    renderCategoriesDropdown();
    renderCategorySettings();
    renderImportCheckboxList();
    updateUI();
}
function renderImportCheckboxList() {
    const container = document.getElementById('importCategoriesList');
    if (!container) return; container.innerHTML = '';
    const autoChecked = ["Alimentari","Carburante Auto","Mutuo","Bolletta Luce","Varie"];
    const flat = [...userCategories].sort();
    flat.forEach(cat => {
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
    
    try {
        currentData.expenses.push(exp);
        await db.expenses.put(exp);
        document.getElementById('expDesc').value = '';
        document.getElementById('expPlanned').value = '';
        document.getElementById('expActual').value = '';
        document.getElementById('expShared').value = '';
        updateUI();
        checkDatabaseHealth();
    } catch (err) {
        console.error('[DB] Errore salvataggio spesa:', err);
        showToast('Errore nel salvare la spesa', true);
        currentData.expenses.pop(); // Rollback from memory
    }
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
// CATEGORY GRID (MOBILE)
// =====================================================================
function renderCategoryGrid(catSums) {
    const container = document.getElementById('categoryGridContainer');
    if (!container) return;
    
    // Su desktop, nascondi il contenitore
    if (isDesktop()) {
        container.innerHTML = '';
        container.style.display = 'none';
        return;
    }
    
    container.style.display = 'grid';
    container.innerHTML = '';
    
    userCategories.forEach(cat => {
        const pVal = catSums[cat]?.planned || 0;
        const aVal = catSums[cat]?.actual || 0;
        const icon = getCatIcon(cat);
        
        // Filtra per macro-gruppo in modalità tabs
        if (currentViewMode === 'tabs') {
            const macroGroup = getCategoryMacroGroup(cat);
            if (macroGroup !== activeMacroGroup && macroGroup !== 'altro') {
                return; // Salta questa categoria
            }
        }
        
        // Calcolo percentuale con logica corretta
        let pct = 0;
        let barClass = 'default';
        if (pVal > 0) {
            pct = Math.min(100, (aVal / pVal) * 100);
            if (aVal > pVal) {
                barClass = 'over';
            } else if (pct > 80) {
                barClass = 'warning';
            }
        } else if (aVal > 0) {
            // Caso: previsto = 0 ma sostenuto > 0 (speso senza budget)
            pct = 100;
            barClass = 'over';
        }
        
const card = document.createElement('div');
        card.className = 'category-card';
        card.style.background = getCategoryCardBg(cat);
        card.style.border = getCategoryCardBorder(cat);
        card.innerHTML = `
            <div class="category-card-icon">${icon}</div>
            <div class="category-card-name">${cat}</div>
            <div class="category-progress-bar">
                <div class="category-progress-fill ${barClass}" style="width: ${pct}%"></div>
            </div>
        `;
        card.onclick = () => openTransactionSheet(cat);
        container.appendChild(card);
    });
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

    // Tabella categorie - responsive: full list on desktop, filtered on mobile/tabs
    let catSums = {}; userCategories.forEach(c => catSums[c] = {planned:0, actual:0});
    currentData.expenses.forEach(exp => { if (catSums[exp.category]) { catSums[exp.category].planned += exp.planned; catSums[exp.category].actual += exp.actual; } });
    const tableBody = document.getElementById('overviewTableBody'); tableBody.innerHTML = '';
    const showAllCategories = isDesktop() && currentViewMode !== 'tabs'; // Desktop shows all, mobile only active, tabs filters by macro group
    userCategories.sort().forEach(cat => {
        const pVal = catSums[cat].planned, aVal = catSums[cat].actual, diff = pVal - aVal;
        let diffClass = '', diffText = '';
        if (pVal > 0 || aVal > 0) { diffClass = diff >= 0 ? 'diff-plus' : 'diff-minus'; diffText = `${diff >= 0 ? '+' : ''}${fmtE(diff)}`; }
        
        // Filtra per macro-gruppo in modalità tabs (sia desktop che mobile)
        if (currentViewMode === 'tabs') {
            const macroGroup = getCategoryMacroGroup(cat);
            if (macroGroup !== activeMacroGroup && macroGroup !== 'altro') {
                return; // Salta questa categoria
            }
        }
        
        // On desktop, show all categories (even with 0 values); on mobile, only show those with activity
        if (showAllCategories || pVal > 0 || aVal > 0) {
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

    // Render griglia categorie per mobile
    renderCategoryGrid(catSums);

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
    document.body.classList.add('sheet-open');
}

function closeRendicontoPopup(event) {
    event.preventDefault();
    event.stopPropagation();
    document.getElementById('popup-rendiconto').classList.remove('active');
    document.body.classList.remove('sheet-open');
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

let chartToggleInitialized = false;
function initChartToggle() {
    if (chartToggleInitialized) return;
    chartToggleInitialized = true;
    const btns = document.querySelectorAll('.chart-toggle-btn');
    btns.forEach(btn => {
        btn.addEventListener('click', () => {
            btns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activeChartType = btn.dataset.chart;
            document.querySelectorAll('.chart-panel').forEach(p => p.classList.remove('active'));
            const panel = document.getElementById('chartPanel' + (activeChartType === 'bars' ? 'Bars' : 'Line'));
            if (panel) panel.classList.add('active');
            // Trigger Chart.js resize after container becomes visible
            setTimeout(() => {
                const chart = activeChartType === 'bars' ? historyBarChart : tradingChart;
                if (chart && typeof chart.resize === 'function') chart.resize();
            }, 50);
        });
    });
}

// =====================================================================
// MODAL FUNCTIONS (Mobile Analisi Tab)
// =====================================================================
function openIaModal() {
    const modal = document.getElementById('iaModal');
    if (modal) { modal.classList.add('active'); document.body.classList.add('sheet-open'); }
}

function closeIaModal(event) {
    if (event && event.target !== event.currentTarget) return;
    const modal = document.getElementById('iaModal');
    if (modal) { modal.classList.remove('active'); document.body.classList.remove('sheet-open'); }
}

async function openArchiveModal() {
    await renderArchiveModalContent();
    const modal = document.getElementById('archiveModal');
    if (modal) { modal.classList.add('active'); document.body.classList.add('sheet-open'); }
}

function closeArchiveModal(event) {
    if (event && event.target !== event.currentTarget) return;
    const modal = document.getElementById('archiveModal');
    if (modal) { modal.classList.remove('active'); document.body.classList.remove('sheet-open'); }
}

async function renderArchiveModalContent() {
    const container = document.getElementById('archiveModalBody');
    if (!container) return;
    let months = await db.months.toArray();
    let hd = months.map(m => ({month:m.month, income:m.totalIncome, actual:m.totalActual, savings:m.totalIncome-m.totalActual}));
    hd.sort((a,b) => a.month.localeCompare(b.month));
    container.innerHTML = '';
    if (hd.length === 0) {
        container.innerHTML = '<div style="text-align:center;color:#94a3b8;padding:20px;font-size:13px;">Nessun dato storico.</div>';
        return;
    }
    hd.forEach(d => {
        const savings = d.savings;
        const card = document.createElement('div');
        card.className = 'history-card';
        card.innerHTML = `
            <div class="history-card-left">
                <div class="history-card-month">${d.month.split('-').reverse().join('/')}</div>
                <div class="history-card-savings">Risparmio: <span class="history-card-savings-val ${savings >= 0 ? 'positive' : 'negative'}">${fmtN(savings)}</span></div>
            </div>
            <div class="history-card-right">
                <span class="history-card-income">+${fmtN(d.income)}</span>
                <span class="history-card-spent">-${fmtN(d.actual)}</span>
            </div>
        `;
        container.appendChild(card);
    });
}

async function runHistoryAnalysisIAModal() {
    const months = await db.months.orderBy('month').toArray();
    const respBox = document.getElementById('iaHistoryResponseModal');
    if (!months.length) { if (respBox) { respBox.innerText = '❌ Nessun mese archiviato.'; respBox.style.display = 'block'; } return; }
    let dataText = 'Dati:\n';
    months.forEach(m => {
        const savings = m.totalIncome - m.totalActual;
        dataText += `- ${m.month}: Entrate ${fmtE(m.totalIncome)}, Uscite ${fmtE(m.totalActual)}, Risparmio ${fmtE(savings)}\n`;
    });
    const prompt = `Agisci come un analista finanziario. Lingua: Italiano. Analizza questo storico plurimensile dei saldi: ${dataText}Fornisci un quadro generale sull'andamento del patrimonio (sta crescendo, è stabile o sta calando?). Evidenzia se c'è un mese record (positivo o negativo) e scrivi una conclusione concisa (max 4 righe) sullo stato di salute generale delle finanze.`;
    await callAIEndpoint(prompt, 'iaHistoryResponseModal', '');
}

function renderHistoryCardsMobile(data) {
    const tbody = document.getElementById('historyTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    if (data.length === 0) {
        tbody.innerHTML = '<div style="text-align:center;color:#94a3b8;padding:20px;font-size:13px;">Nessun dato storico.</div>';
        return;
    }
    const container = document.createElement('div');
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.gap = '6px';
    data.forEach(d => {
        const savings = d.savings;
        const card = document.createElement('div');
        card.className = 'history-card';
        card.innerHTML = `
            <div class="history-card-left">
                <div class="history-card-month">${d.month.split('-').reverse().join('/')}</div>
                <div class="history-card-savings">Risparmio: <span class="history-card-savings-val ${savings >= 0 ? 'positive' : 'negative'}">${fmtN(savings)}</span></div>
            </div>
            <div class="history-card-right">
                <span class="history-card-income">+${fmtN(d.income)}</span>
                <span class="history-card-spent">-${fmtN(d.actual)}</span>
            </div>
        `;
        container.appendChild(card);
    });
    tbody.appendChild(container);
}

async function renderGlobalHistory() {
    let months = await db.months.toArray();
    renderRecordsHub(months);
    let hd = months.map(m => ({month:m.month, income:m.totalIncome, planned:m.totalPlanned, actual:m.totalActual, savings:m.totalIncome-m.totalActual}));
    hd.sort((a,b) => a.month.localeCompare(b.month));
    const tbody = document.getElementById('historyTableBody'); tbody.innerHTML = '';
    if (hd.length === 0) {
        if (window.innerWidth < 768) {
            tbody.innerHTML = '<div style="text-align:center;color:#94a3b8;padding:20px;font-size:13px;">Nessun dato storico.</div>';
        } else {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#94a3b8;padding:20px;">Nessun dato storico.</td></tr>';
        }
    } else if (window.innerWidth < 768) {
        renderHistoryCardsMobile(hd);
    } else {
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
        options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'top',labels:{font:{size:10},boxWidth:8,boxHeight:8,padding:8}},tooltip:{bodyFont:{size:11},titleFont:{size:11}}},scales:{x:{grid:{display:false},ticks:{font:{size:10}}},y:{grid:{color:'rgba(0,0,0,0.05)'},ticks:{font:{size:10}}}}}
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
        options:{responsive:true,maintainAspectRatio:false,scales:{x:{grid:{color:'rgba(0,0,0,0.04)'},ticks:{font:{size:10}}},y:{grid:{color:'rgba(0,0,0,0.04)'},ticks:{font:{size:10}}}},plugins:{legend:{position:'top',labels:{font:{size:10,weight:'bold'},boxWidth:8,boxHeight:8,padding:8}},tooltip:{bodyFont:{size:11},titleFont:{size:11}}}}
    });
}

// =====================================================================
// PROIEZIONI FUTURE (Matematiche)
// =====================================================================
async function renderFutureProjections(isSimulated = false) {
    let simAmount = 0;
    if (isSimulated) {
        simAmount = parseFloat(document.getElementById('simulatedExpense')?.value) || 0;
    }

    let months = await db.months.toArray();
    let numMonths = months.length;
    let totalIncome = months.reduce((s,m) => s+m.totalIncome,0);
    let totalActual = months.reduce((s,m) => s+m.totalActual,0);
    let avgIncome = numMonths > 0 ? totalIncome / numMonths : 0;
    let avgActual = numMonths > 0 ? (totalActual / numMonths) + simAmount : simAmount;
    let avgSavings = avgIncome - avgActual;

    // Avviso accuratezza (desktop)
    const warnBox = document.getElementById('futureAccuracyWarning');
    const avgBox = document.getElementById('futureAvgBox');
    if (numMonths === 0) {
        if (warnBox) { warnBox.innerHTML = `⚠️ <strong>Nessun dato registrato.</strong> Inizia ad inserire entrate e spese per ottenere le proiezioni.`; warnBox.style.display = 'block'; }
        const listContainer = document.getElementById('futureProjectionsList');
        if (listContainer) {
            listContainer.innerHTML = `<div style="text-align:center;color:#94a3b8;padding:20px;">Inserisci dati per attivare le proiezioni.</div>`;
        }
        const grid = document.getElementById('futureProjectionsGrid');
        if (grid) grid.innerHTML = `<div style="grid-column:span 2;text-align:center;color:#94a3b8;padding:40px 10px;font-size:13px;">Inserisci dati per attivare le proiezioni.</div>`;
        return;
    } else if (numMonths < 3) {
        if (warnBox) { warnBox.innerHTML = `⚠️ <strong>Precisione limitata:</strong> I calcoli si basano su ${numMonths} mese${numMonths>1?'i':''}. Con più dati storici le proiezioni a lungo termine saranno molto più accurate.`; warnBox.style.display = 'block'; }
    } else { if (warnBox) warnBox.style.display = 'none'; }

    const avgText = `<strong>Base di calcolo:</strong> ${numMonths} mes${numMonths===1?'e':'i'} archiviati · Media entrate: <strong>${fmtE(avgIncome)}/mese</strong> · Media uscite: <strong>${fmtE(avgActual)}/mese</strong> · Risparmio medio: <strong style="color:${avgSavings>=0?'#10b981':'#ef4444'}">${fmtE(avgSavings)}/mese</strong>`;
    if (avgBox) avgBox.innerHTML = avgText;
    const avgBoxMobile = document.getElementById('futureAvgBoxMobile');
    if (avgBoxMobile) avgBoxMobile.innerHTML = avgText;

    const periods = [
        {label:'3 Mesi', m:3}, {label:'6 Mesi', m:6}, {label:'1 Anno', m:12},
        {label:'2 Anni', m:24}, {label:'5 Anni', m:60}, {label:'10 Anni', m:120}
    ];

    // Desktop: lista verticale
    const listContainer = document.getElementById('futureProjectionsList');
    if (listContainer) {
        listContainer.innerHTML = '';
        periods.forEach(p => {
            let estSavings = avgSavings * p.m;
            let row = document.createElement('div');
            row.style.cssText = "display:flex; justify-content:space-between; align-items:center; padding: 14px; background: var(--panel); border-radius: 12px; border: 1px solid #e2e8f0; border-left: 4px solid " + (estSavings>=0?'#10b981':'#ef4444') + ";";
            row.className = estSavings >= 0 ? 'proj-row-positive' : 'proj-row-negative';
            row.innerHTML = `<span style="font-weight:bold; font-size:14px; color:var(--primary);">${p.label}</span><span class="text-right" style="font-size:16px;">${fmtE(estSavings)}</span>`;
            listContainer.appendChild(row);
        });
    }

    // Mobile: griglia 2x3
    const grid = document.getElementById('futureProjectionsGrid');
    if (grid) {
        grid.innerHTML = '';
        periods.forEach(p => {
            let estSavings = avgSavings * p.m;
            let card = document.createElement('div');
            card.className = 'proj-card';
            card.style.borderLeftColor = estSavings >= 0 ? '#10b981' : '#ef4444';
            card.innerHTML = `
                <span class="proj-label">${p.label}</span>
                <span class="proj-value" style="color:${estSavings >= 0 ? '#10b981' : '#ef4444'}">${fmtE(estSavings)}</span>
            `;
            grid.appendChild(card);
        });
    }
}

function resetFutureSimulation() {
    const input = document.getElementById('simulatedExpense');
    if (input) input.value = '';
    const inputMobile = document.getElementById('simulatedExpenseMobile');
    if (inputMobile) inputMobile.value = '';
    renderFutureProjections();
}

// =====================================================================
// FUTURE TAB — BOTTOM SHEET (Mobile)
// =====================================================================
function openFutureSheet(action) {
    const overlay = document.getElementById('futureSheetOverlay');
    const sheet = document.getElementById('futureBottomSheet');
    const body = document.getElementById('futureSheetBody');
    const title = document.getElementById('futureSheetTitle');
    if (!overlay || !sheet || !body) return;

    if (action === 'simula') {
        title.textContent = '🤔 Simulatore';
        body.innerHTML = `
            <p style="font-size:12px;color:#475569;margin-bottom:12px;">Vuoi comprare a rate o abbonarti a qualcosa? Scopri l'impatto sul tuo futuro.</p>
            <div class="sheet-inputs-compact">
                <input type="number" id="simulatedExpenseMobile" class="responsive-input" placeholder="Spesa mensile fissa €">
            </div>
            <div class="sheet-actions">
                <button class="btn-spesa" style="background:#3b82f6;" id="simulateBtnSheet">Simula</button>
                <button class="btn-spesa" style="background:#64748b;" id="resetSimBtnSheet">Reset</button>
            </div>
            <div id="futureAccuracyWarningMobile" class="proj-info-box" style="display:none;margin-top:12px;"></div>
            <div id="futureProjectionsListMobile" style="display:flex;flex-direction:column;gap:8px;margin-top:16px;"></div>
        `;
        body.querySelector('#simulateBtnSheet').onclick = () => {
            let amt = parseFloat(document.getElementById('simulatedExpenseMobile')?.value) || 0;
            const syncInput = document.getElementById('simulatedExpense');
            if (syncInput) syncInput.value = amt;
            renderFutureProjections(true);
            renderFutureProjectionsInSheet(true);
        };
        body.querySelector('#resetSimBtnSheet').onclick = () => {
            document.getElementById('simulatedExpenseMobile').value = '';
            const syncInput = document.getElementById('simulatedExpense');
            if (syncInput) syncInput.value = '';
            renderFutureProjections();
            renderFutureProjectionsInSheet();
        };
        renderFutureProjectionsInSheet();
    } else if (action === 'scadenze') {
        title.textContent = '🗓️ Scadenze';
        body.innerHTML = `
            <div style="background:#f1f5f9;border-radius:12px;padding:14px;margin-bottom:16px;">
                <div class="sheet-inputs-compact">
                    <div><label style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;display:block;margin-bottom:4px;">Mese Scadenza</label><input type="month" id="annDeadlineMonthSheet"></div>
                    <div><label style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;display:block;margin-bottom:4px;">Giorno (opz.)</label><input type="number" id="annDeadlineDaySheet" min="1" max="31" placeholder="Es. 15"></div>
                    <div><label style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;display:block;margin-bottom:4px;">Descrizione</label><input type="text" id="annDeadlineDescSheet" placeholder="Es. Bollo Auto..."></div>
                    <div><label style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;display:block;margin-bottom:4px;">Importo Previsto (€)</label><input type="number" id="annDeadlineAmountSheet" step="0.01" placeholder="0.00"></div>
                </div>
                <button class="btn-spesa" style="background:var(--warning);margin-top:6px;" id="addDeadlineBtnSheet">Salva Scadenza</button>
            </div>
            <h3 style="font-size:13px;font-weight:700;margin:0 0 8px;">📋 Scadenziario Programmato</h3>
            <div id="annualDeadlinesListSheet"></div>
        `;
        body.querySelector('#addDeadlineBtnSheet').onclick = () => {
            const month = document.getElementById('annDeadlineMonthSheet').value;
            const day = document.getElementById('annDeadlineDaySheet').value;
            const desc = document.getElementById('annDeadlineDescSheet').value.trim();
            const amount = parseFloat(document.getElementById('annDeadlineAmountSheet').value) || 0;
            if (!month || !desc || amount <= 0) { alert('Compila mese, descrizione e importo.'); return; }
            const syncMonth = document.getElementById('annDeadlineMonth');
            const syncDay = document.getElementById('annDeadlineDay');
            const syncDesc = document.getElementById('annDeadlineDesc');
            const syncAmount = document.getElementById('annDeadlineAmount');
            if (syncMonth) syncMonth.value = month;
            if (syncDay) syncDay.value = day;
            if (syncDesc) syncDesc.value = desc;
            if (syncAmount) syncAmount.value = amount;
            addAnnualDeadline().then(() => renderAnnualDeadlinesInSheet());
        };
        renderAnnualDeadlinesInSheet();
    } else if (action === 'ia') {
        title.textContent = '🤖 Analisi I.A.';
        body.innerHTML = `
            <p style="font-size:12px;color:#475569;margin-bottom:12px;">
                L'IA leggerà le proiezioni matematiche e indicherà le categorie di spesa critiche su cui agire per proteggere o migliorare il tuo futuro finanziario.
            </p>
            <button class="btn-ia" id="btnFutureIASheet">🧠 Attiva Analisi Predittiva I.A.</button>
            <div id="iaFutureResponseSheet" class="ia-response-box"></div>
        `;
        body.querySelector('#btnFutureIASheet').onclick = async () => {
            const responseBox = document.getElementById('iaFutureResponseSheet');
            const btn = document.getElementById('btnFutureIASheet');
            if (!responseBox) return;
            responseBox.style.display = 'block';
            responseBox.innerHTML = '⏳ Analisi in corso...';
            if (btn) btn.disabled = true;
            try {
                const months = await db.months.toArray();
                const numM = months.length;
                const totalIncome = months.reduce((s, m) => s + m.totalIncome, 0);
                const totalActual = months.reduce((s, m) => s + m.totalActual, 0);
                const avgSavings = numM > 0 ? (totalIncome - totalActual) / numM : 0;
                const projected1 = avgSavings * 12;
                const projected5 = avgSavings * 60;
                const projected10 = avgSavings * 120;
                const categoryTotals = {};
                (currentData.expenses || []).forEach(e => { categoryTotals[e.category] = (categoryTotals[e.category] || 0) + e.actual; });
                const categoryLines = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([cat, val]) => `- ${cat}: ${fmtE(val)}/mese`).join('\n');
                const dataText = `Dati Proiezioni 10 anni:\n- Risparmio medio mensile: ${fmtE(avgSavings)}\n- Patrimonio stimato a 1 anno: ${fmtE(projected1)}\n- Patrimonio stimato a 5 anni: ${fmtE(projected5)}\n- Patrimonio stimato a 10 anni: ${fmtE(projected10)}\nCategorie di spesa attuali:\n${categoryLines}`;
                const prompt = `Agisci come un pianificatore finanziario lungimirante. Lingua: Italiano. Esamina questa proiezione matematica basata sui dati attuali: ${dataText}. Fai una considerazione critica sul risultato a lungo termine (il traguardo a 10 anni è realistico o rischioso?). Indica quali categorie di spesa attuali potrebbero minacciare questa proiezione a causa dell'inflazione o di spese impreviste. Massimo 4 frasi, stile diretto e motivazionale.`;
                await callAIEndpoint(prompt, 'iaFutureResponseSheet', null);
            } catch (e) {
                responseBox.innerHTML = '❌ Errore durante l\'analisi IA.';
            } finally {
                if (btn) btn.disabled = false;
            }
        };
    }

    document.body.classList.add('sheet-open');
    overlay.classList.add('open');
    sheet.classList.add('open');
}

function closeFutureSheet() {
    const overlay = document.getElementById('futureSheetOverlay');
    const sheet = document.getElementById('futureBottomSheet');
    if (overlay && sheet) {
        document.body.classList.remove('sheet-open');
        overlay.classList.remove('open');
        sheet.classList.remove('open');
        sheet.style.transform = '';
        sheet.classList.remove('dragging');
    }
}

function renderFutureProjectionsInSheet(isSimulated) {
    const body = document.getElementById('futureSheetBody');
    if (!body) return;
    let simAmount = 0;
    if (isSimulated) {
        simAmount = parseFloat(document.getElementById('simulatedExpenseMobile')?.value) || 0;
    }
    renderFutureProjectionsPreview(body, simAmount);
}

async function renderFutureProjectionsPreview(container, simAmount) {
    const months = await db.months.toArray();
    const numMonths = months.length;
    const totalIncome = months.reduce((s, m) => s + m.totalIncome, 0);
    const totalActual = months.reduce((s, m) => s + m.totalActual, 0);
    const avgIncome = numMonths > 0 ? totalIncome / numMonths : 0;
    const avgActual = numMonths > 0 ? (totalActual / numMonths) + simAmount : simAmount;
    const avgSavings = avgIncome - avgActual;

    const warnBox = container.querySelector('#futureAccuracyWarningMobile');
    const listContainer = container.querySelector('#futureProjectionsListMobile');
    if (!listContainer) return;

    if (numMonths === 0) {
        if (warnBox) { warnBox.innerHTML = `⚠️ <strong>Nessun dato registrato.</strong> Inizia ad inserire entrate e spese.`; warnBox.style.display = 'block'; }
        listContainer.innerHTML = `<div style="text-align:center;color:#94a3b8;padding:20px;font-size:13px;">Inserisci dati per attivare le proiezioni.</div>`;
        return;
    } else if (numMonths < 3) {
        if (warnBox) { warnBox.innerHTML = `⚠️ <strong>Precisione limitata:</strong> Basata su ${numMonths} mese${numMonths>1?'i':''}.`; warnBox.style.display = 'block'; }
    } else { if (warnBox) warnBox.style.display = 'none'; }

    const periods = [
        {label:'3 Mesi', m:3}, {label:'6 Mesi', m:6}, {label:'1 Anno', m:12},
        {label:'2 Anni', m:24}, {label:'5 Anni', m:60}, {label:'10 Anni', m:120}
    ];
    listContainer.innerHTML = '';
    periods.forEach(p => {
        let estSavings = avgSavings * p.m;
        let row = document.createElement('div');
        row.style.cssText = "display:flex; justify-content:space-between; align-items:center; padding: 12px; background: var(--panel); border-radius: 10px; border: 1px solid #e2e8f0; border-left: 4px solid " + (estSavings>=0?'#10b981':'#ef4444') + ";";
        row.innerHTML = `<span style="font-weight:600; font-size:13px; color:var(--primary);">${p.label}</span><span style="font-size:15px; font-weight:800; color:${estSavings>=0?'#10b981':'#ef4444'}">${fmtE(estSavings)}</span>`;
        listContainer.appendChild(row);
    });
}

async function renderAnnualDeadlinesInSheet() {
    const deadlines = await db.annualDeadlines.toArray();
    const container = document.getElementById('annualDeadlinesListSheet');
    if (!container) return;
    container.innerHTML = '';
    if (deadlines.length === 0) {
        container.innerHTML = `<p style="color:#94a3b8;font-size:13px;text-align:center;padding:20px;">Nessuna scadenza inserita.</p>`;
        return;
    }
    deadlines.sort((a,b) => {
        let da = new Date(a.month + '-' + (a.day ? String(a.day).padStart(2,'0') : '01'));
        let db2 = new Date(b.month + '-' + (b.day ? String(b.day).padStart(2,'0') : '01'));
        return da - db2;
    });
    const today = new Date();
    deadlines.forEach(item => {
        const row = document.createElement('div');
        row.className = 'item-row';
        let isPast = !item.isPaid && new Date(item.month + '-' + (item.day ? String(item.day).padStart(2,'0') : '01')) < today;
        let formattedM = item.month.split('-').reverse().join('/') + (item.day ? ` (g.${item.day})` : '');
        if (isPast) row.style.cssText = 'background:#fee2e2;border-left:4px solid #ef4444;padding-left:10px;border-radius:6px;';
        else if (item.isPaid) row.style.opacity = '0.65';
        row.innerHTML = `
            <span class="item-name">${item.isPaid ? '✅' : isPast ? '🚨' : '⏰'} <strong>${item.desc}</strong><span class="item-meta">${formattedM}</span></span>
            <span class="item-vals">
                <span style="color:var(--previsto);font-weight:bold;font-size:13px;">${fmtE(item.amount)}</span>
                ${!item.isPaid ? `<button class="btn-action btn-pay" style="width:auto;margin:0;">Pagato</button>` : `<button class="btn-action" style="background:#64748b;width:auto;margin:0;">Annulla</button>`}
                <button class="btn-del" style="width:auto;margin:0;">✕</button>
            </span>`;
        row.querySelector('.btn-pay')?.addEventListener('click', async () => {
            await db.annualDeadlines.update(item.id, {isPaid: true});
            renderAnnualDeadlinesInSheet();
            loadAnnualDeadlines();
        });
        row.querySelector('.btn-del')?.addEventListener('click', async () => {
            if (confirm('Eliminare questa scadenza?')) {
                await db.annualDeadlines.delete(item.id);
                renderAnnualDeadlinesInSheet();
                loadAnnualDeadlines();
            }
        });
        row.querySelector('.btn-action:not(.btn-pay)')?.addEventListener('click', async () => {
            await db.annualDeadlines.update(item.id, {isPaid: false});
            renderAnnualDeadlinesInSheet();
            loadAnnualDeadlines();
        });
        container.appendChild(row);
    });
}

// Setup eventi Action Hub e chiusura bottom sheet previsioni
document.addEventListener('DOMContentLoaded', () => {
    const hub = document.getElementById('futureActionHub');
    if (hub) {
        hub.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-action]');
            if (!btn) return;
            openFutureSheet(btn.dataset.action);
        });
    }
    const futureOverlay = document.getElementById('futureSheetOverlay');
    if (futureOverlay) {
        futureOverlay.addEventListener('click', closeFutureSheet);
    }
    const futureSheet = document.getElementById('futureBottomSheet');
    if (futureSheet) {
        futureSheet.addEventListener('click', (e) => e.stopPropagation());
    }
});

// Swipe-to-close per futureBottomSheet
(function setupFutureSwipeToClose() {
    const sheet = document.getElementById('futureBottomSheet');
    const handle = document.querySelector('#futureBottomSheet .drag-handle-wrapper');
    if (!sheet || !handle) return;
    let startY = 0, currentY = 0, isDragging = false;
    const onTouchStart = (e) => { isDragging = true; startY = e.touches[0].clientY; sheet.classList.add('dragging'); };
    const onTouchMove = (e) => {
        if (!isDragging) return;
        currentY = e.touches[0].clientY;
        const deltaY = currentY - startY;
        if (deltaY > 0) sheet.style.transform = `translateY(${deltaY}px)`;
    };
    const onTouchEnd = () => {
        if (!isDragging) return;
        isDragging = false;
        const deltaY = currentY - startY;
        const threshold = Math.min(100, sheet.offsetHeight * 0.3);
        sheet.classList.remove('dragging');
        if (deltaY > threshold) closeFutureSheet();
        else sheet.style.transform = '';
    };
    handle.addEventListener('touchstart', onTouchStart, { passive: true });
    handle.addEventListener('touchmove', onTouchMove, { passive: true });
    handle.addEventListener('touchend', onTouchEnd);
    handle.addEventListener('touchcancel', onTouchEnd);
})();

// =====================================================================
// PROVIDER IA
// =====================================================================
function toggleIaProviderFields() {
    const providerEl = document.getElementById('iaProviderSelect');
    if (!providerEl) return; // Elemento non presente nella UI corrente
    const provider = providerEl.value;
    localStorage.setItem('ia_provider', provider);
    const modelGroup = document.getElementById('aiModelGroup');
    const geminiG = document.getElementById('geminiKeyGroup');
    const openRouterG = document.getElementById('openRouterKeyGroup');
    const badge = document.getElementById('iaProviderBadge');
    const hint = document.getElementById('iaStatusHint');
    if (provider === 'openrouter') { 
        if(modelGroup) modelGroup.style.display='flex'; 
        if(geminiG) geminiG.style.display='none'; 
        if(openRouterG) openRouterG.style.display='flex';
        if(badge) badge.innerText='OpenRouter'; 
        if(hint) hint.innerText="🌐 Connessione globale via OpenRouter."; 
        getSetting('openrouter_api_key', '').then(k => { if(k) document.getElementById('openRouterApiKeyInput').value = k; });
    }
    else if (provider === 'browser-gemini') { 
        if(modelGroup) modelGroup.style.display='none'; 
        if(geminiG) geminiG.style.display='none'; 
        if(openRouterG) openRouterG.style.display='none';
        if(badge) badge.innerText='Gemini Nano'; 
        if(hint) hint.innerText="✨ IA locale integrata nel browser."; 
    }
    else if (provider === 'gemini') { 
        if(modelGroup) modelGroup.style.display='none'; 
        if(geminiG) geminiG.style.display='flex'; 
        if(openRouterG) openRouterG.style.display='none';
        if(badge) badge.innerText='Gemini Cloud'; 
        if(hint) hint.innerText="☁️ Connessione Cloud a Google Gemini."; 
    }
    else { 
        if(modelGroup) modelGroup.style.display='flex'; 
        if(geminiG) geminiG.style.display='none'; 
        if(openRouterG) openRouterG.style.display='none';
        if(badge) badge.innerText='Ollama'; 
        if(typeof checkLocalLLM === 'function') checkLocalLLM(); 
    }
}
async function saveOpenRouterKey() { await setSetting('openrouter_api_key', document.getElementById('openRouterApiKeyInput').value.trim()); }
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
    const engineSelect = document.getElementById('ai-engine-select');
    const modelSelect = document.getElementById('openrouter-model-select');
    const keyInput = document.getElementById('openrouter-key-input');
    const errorBox = document.getElementById('hub-ia-error-box');

    if (!engineSelect || !modelSelect || !keyInput) {
        console.error("Elementi non trovati nel DOM!");
        return;
    }

    const provider = engineSelect.value;
    const model = modelSelect.value;
    const apiKey = keyInput.value.trim();

    const box = document.getElementById(responseBoxId);
    const btn = document.getElementById(btnId);
    if (box) { box.style.display = 'block'; box.innerText = '🤖 Elaborazione in corso...'; }
    if (btn) btn.disabled = true;
    if (errorBox) errorBox.style.display = 'none';

    try {
        if (provider === 'openrouter') {
            if (!apiKey) {
                if (errorBox) {
                    errorBox.textContent = "Errore: Inserire la OpenRouter API Key nell'apposito campo.";
                    errorBox.style.display = 'block';
                }
                if (box) box.innerText = "❌ Errore API Key mancante.";
                return;
            }
            const response = await window.fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer ' + apiKey,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: model,
                    messages: [{ role: 'user', content: promptText }]
                })
            });
            if (!response.ok) {
                throw new Error('Server risponde con status ' + response.status);
            }
            const data = await response.json();
            if (box) box.innerText = data.choices[0].message.content;
        } else {
            const res = await window.fetch('http://localhost:11434/api/generate', {
                method:'POST',
                headers:{'Content-Type':'application/json'},
                body:JSON.stringify({model: 'llama3', prompt:promptText, stream:false})
            });
            if(!res.ok) throw new Error("Ollama error");
            const data = await res.json(); 
            if (box) box.innerText = data.response;
        }
    } catch(err) { 
        if (box) box.innerText = "❌ Errore: " + err.message; 
        if (errorBox) { errorBox.textContent = "Errore: " + err.message; errorBox.style.display = 'block'; }
    }
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
    const errorBox = document.getElementById('hub-ia-error-box');
    if(errorBox) errorBox.style.display = 'none';

    const currentMonth = document.getElementById('currentMonth').value;
    if (!currentMonth) { 
        if(errorBox) { errorBox.textContent = 'Errore: Mese corrente non selezionato.'; errorBox.style.display = 'block'; }
        return; 
    }
    
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
    const promptTesto = `Agisci come un consulente finanziario cinico e conciso. Lingua: Italiano. Analizza i seguenti dati di spesa del mese corrente e il confronto con i due mesi passati: ${dataText}Identifica le 2 categorie meno importanti (es. svago, abbonamenti, extra) dove l'utente sta spendendo di più rispetto al solito o in assoluto. Scrivi un resoconto di massimo 3 frasi indicando quanto si potrebbe risparmiare e un consiglio pratico per tagliare subito quelle spese.`;

    const engineSelect = document.getElementById('ai-engine-select');
    const modelSelect = document.getElementById('openrouter-model-select');
    const keyInput = document.getElementById('openrouter-key-input');

    if (!engineSelect || !modelSelect || !keyInput) {
        console.error("Elementi non trovati nel DOM!");
        return;
    }

    const engine = engineSelect.value;
    const model = modelSelect.value;
    const apiKey = keyInput.value.trim();

    if (engine === 'openrouter') {
        if (!apiKey) {
            if(errorBox) {
                errorBox.textContent = "Errore: Inserire la OpenRouter API Key nell'apposito campo.";
                errorBox.style.display = 'block';
            }
            return;
        }

        try {
            document.getElementById('btn-analisi-strategica').textContent = "Elaborazione in corso...";
            document.getElementById('btn-analisi-strategica').disabled = true;

            const response = await window.fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer ' + apiKey,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: model,
                    messages: [{ role: 'user', content: promptTesto }]
                })
            });

            if (!response.ok) {
                throw new Error('Server risponde con status ' + response.status);
            }

            const data = await response.json();
            const rispostaTesto = data.choices[0].message.content;
            
            document.getElementById('iaNotes').value = rispostaTesto; 
            await saveNotes();

        } catch (err) {
            if(errorBox) {
                errorBox.textContent = "Errore: " + err.message;
                errorBox.style.display = 'block';
            }
        } finally {
            document.getElementById('btn-analisi-strategica').textContent = "Analisi Strategica Mese";
            document.getElementById('btn-analisi-strategica').disabled = false;
        }
    } else {
        try {
            document.getElementById('btn-analisi-strategica').textContent = "Elaborazione Ollama...";
            document.getElementById('btn-analisi-strategica').disabled = true;
            const res = await window.fetch('http://localhost:11434/api/generate', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model: 'llama3', prompt:promptTesto, stream:false})});
            if(!res.ok) throw new Error("Ollama error");
            const data = await res.json();
            document.getElementById('iaNotes').value = data.response; 
            await saveNotes();
        } catch(e) {
            if(errorBox) { errorBox.textContent = "Errore Ollama: " + e.message; errorBox.style.display = 'block'; }
        } finally {
            document.getElementById('btn-analisi-strategica').textContent = "Analisi Strategica Mese";
            document.getElementById('btn-analisi-strategica').disabled = false;
        }
    }
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

// Re-render rendiconto on window resize for responsive behavior
let resizeTimer;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => updateUI(), 250);
});



