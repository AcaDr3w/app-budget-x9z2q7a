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
    'investimenti-tab': 'Investimenti',
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
db.version(4).stores({
    investments: '++id, type',
    investmentMovements: '++id, investmentId'
}).upgrade(tx => {});
db.version(5).stores({
    people: '++id',
    groups: '++id',
    groupMembers: '++id, groupId',
    sharedExpenseSplits: '++id, expenseId, personId'
}).upgrade(tx => {});

function genId() { return Date.now() + Math.floor(Math.random() * 10000); }

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
            if (data.people) await db.people.bulkPut(data.people);
            if (data.groups) await db.groups.bulkPut(data.groups);
            if (data.groupMembers) await db.groupMembers.bulkPut(data.groupMembers);
            if (data.sharedExpenseSplits) await db.sharedExpenseSplits.bulkPut(data.sharedExpenseSplits);

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
let tradingChart = null;

// ===== SPESE CONDIVISE STATE =====
let people = [];
let groups = [];
let groupMembers = [];

 // ===== VIEW MODE STATE (defaults — toggle rimosso) =====
 let currentViewMode = 'full';
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
    const pill = document.querySelector('.month-selector-pill');
    if (pill) {
        pill.addEventListener('click', () => {
            const input = document.getElementById('currentMonth');
            if (input) {
                if (typeof input.showPicker === 'function') {
                    input.showPicker();
                } else {
                    input.focus();
                }
            }
        });
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
    // Settings popup: delegated click on cards
    document.getElementById('settings-tab')?.addEventListener('click', (e) => {
        const card = e.target.closest('.settings-card');
        if (card) openSettingsPopup(card.dataset.popup);
    });
    await loadAnnualDeadlines();
    await loadPeopleGroups();
    await loadMonthData();
    toggleIaProviderFields();
    checkDatabaseHealth();
    initPWA();
    setupSharedToggle();
    // Aggiorna il display del mese nella pillola all'avvio
    updateMonthDisplay();
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
        'investimenti-tab': 'navInvestimenti',
        'future-tab': 'navPrevisioni',
        'settings-tab': 'navImpostazioni'
    };
    const navItem = document.getElementById(navMap[tabId]);
    if (navItem) navItem.classList.add('active');
    updateActivePageSubtitle(tabId);
    if (tabId === 'history-tab') { renderGlobalHistory(); renderTradingChart(); }
    if (tabId === 'future-tab') { renderFutureProjections(); renderAnnualDeadlines(); }
    if (tabId === 'investimenti-tab') { renderInvestments(); }
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
    let incomes = await getIncomesForMonth(month);
    let expenses = (await db.expenses.toArray()).filter(e => (e.date || e.month).slice(0, 7) === month);
    currentData = {income: incomes, expenses: expenses};
    let mData = await db.months.get(month);
    document.getElementById('userNotes').value = mData?.notes || "";
    document.getElementById('iaNotes').value = mData?.iaNotes || "";
    await clearAllFilters();
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
let editingExpenseId = null; // null = new, number = editing existing expense

function openTransactionSheet(categoryName) {
    console.log("Card cliccata:", categoryName);
    sheetSelectedCategory = categoryName;
    sheetTransactionType = 'actual';
    const overlay = document.getElementById('sheetOverlay');
    const sheet = document.getElementById('bottomSheet');
    const title = document.getElementById('selected-category-title');
    const amountInput = document.getElementById('expenseAmountInput');
    const sheetDate = document.getElementById('sheetDate');
    const toggleOptions = document.querySelectorAll('.toggle-option');
    
if (overlay && sheet && title) {
        title.textContent = categoryName;
        document.body.classList.add('sheet-open');
        overlay.classList.add('open');
        sheet.classList.add('open');
        
        // Reset amount input
        if (amountInput) amountInput.value = '';
        
        // Reset date to today
        if (sheetDate) {
            const today = new Date().toISOString().slice(0, 10);
            sheetDate.value = today;
        }
        
        // Reset toggle to 'actual' (Sostenuta)
        toggleOptions.forEach(opt => opt.classList.toggle('active', opt.dataset.type === 'actual'));
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
    editingExpenseId = null;
    
    // Reset recurring toggle
    const recToggle = document.getElementById('recurringToggle');
    const recContainer = document.getElementById('recurringUntilContainer');
    const recUntil = document.getElementById('recurringUntil');
    if (recToggle) recToggle.checked = false;
    if (recContainer) recContainer.classList.remove('active');
    if (recUntil) recUntil.value = '';
    
    // Reset slider position
    const slider = document.querySelector('.sheet-slider');
    if (slider) slider.style.transform = 'translateX(0)';
    
    // Reset shared expense toggle
    const shToggle = document.getElementById('sharedToggle');
    const shPanel = document.getElementById('sharedPanel');
    if (shToggle) shToggle.checked = false;
    if (shPanel) shPanel.classList.remove('active');
}

// ===== SPESE CONDIVISE: PEOPLE & GROUPS =====
async function loadPeopleGroups() {
    people = await db.people.toArray();
    groups = await db.groups.toArray();
    groupMembers = await db.groupMembers.toArray();
}

function populateSharedPersonSelect() {
    const sel = document.getElementById('sharedPersonSelect');
    if (!sel) return;
    sel.innerHTML = '<option value="">Seleziona persona...</option>';
    people.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.name;
        sel.appendChild(opt);
    });
    if (groups.length > 0) {
        const og = document.createElement('optgroup');
        og.label = '👥 Gruppi';
        groups.forEach(g => {
            const opt = document.createElement('option');
            opt.value = 'g_' + g.id;
            opt.textContent = g.name;
            og.appendChild(opt);
        });
        sel.appendChild(og);
    }
}

function setupSharedToggle() {
    const toggle = document.getElementById('sharedToggle');
    const panel = document.getElementById('sharedPanel');
    if (toggle && panel) {
        toggle.addEventListener('change', () => {
            panel.classList.toggle('active', toggle.checked);
            if (toggle.checked) {
                populateSharedPersonSelect();
                updateSplitFields();
                updatePayerLabel();
            }
        });
    }
    const methodPills = document.querySelectorAll('.split-pill');
    methodPills.forEach(pill => {
        pill.addEventListener('click', () => {
            methodPills.forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            updateSplitFields();
        });
    });
    const payerPills = document.querySelectorAll('.payer-pill');
    payerPills.forEach(pill => {
        pill.addEventListener('click', () => {
            payerPills.forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
        });
    });
    const personSelect = document.getElementById('sharedPersonSelect');
    if (personSelect) {
        personSelect.addEventListener('change', updatePayerLabel);
    }
    const newPersonBtn = document.getElementById('btnNewPerson');
    if (newPersonBtn) {
        newPersonBtn.addEventListener('click', () => {
            const name = prompt('Nome della persona:');
            if (name && name.trim()) {
                saveNewPerson(name.trim());
            }
        });
    }
}

function updatePayerLabel() {
    const sel = document.getElementById('sharedPersonSelect');
    const themPill = document.getElementById('payerThemLbl');
    const mePill = document.querySelector('.payer-pill[data-payer="me"]');
    if (!sel || !themPill) return;
    const val = sel.value;
    if (!val || val === '') {
        themPill.textContent = '💳 Ha pagato...';
        themPill.style.opacity = '0.4';
        themPill.style.pointerEvents = 'none';
        if (themPill.classList.contains('active')) {
            themPill.classList.remove('active');
            if (mePill) mePill.classList.add('active');
        }
    } else if (val.startsWith('g_')) {
        const g = groups.find(gg => gg.id === parseInt(val.replace('g_', '')));
        themPill.textContent = '💳 Spesa di gruppo';
        themPill.style.opacity = '0.4';
        themPill.style.pointerEvents = 'none';
        if (themPill.classList.contains('active')) {
            themPill.classList.remove('active');
            if (mePill) mePill.classList.add('active');
        }
    } else {
        const p = people.find(pp => pp.id === parseInt(val));
        themPill.textContent = '💳 Ha pagato ' + (p ? p.name : '...');
        themPill.style.opacity = '1';
        themPill.style.pointerEvents = 'auto';
    }
}

async function saveNewPerson(name) {
    const person = { id: genId(), name, createdAt: Date.now() };
    await db.people.put(person);
    people.push(person);
    populateSharedPersonSelect();
    showToast('👤 ' + name + ' aggiunto', false);
}

function updateSplitFields() {
    const container = document.getElementById('sharedDetailFields');
    const activeMethod = document.querySelector('.split-pill.active');
    const method = activeMethod ? activeMethod.dataset.method : 'equal';
    const amountEl = document.getElementById('expenseAmountInput');
    const totalAmount = parseFloat(amountEl?.value) || 0;
    if (!container) return;
    
    if (method === 'equal') {
        container.innerHTML = '<div class="shared-hint">🧮 Diviso in parti uguali tra tutti i partecipanti</div>';
    } else if (method === 'percentage') {
        container.innerHTML = `
            <label class="shared-field-label">La tua percentuale (%)</label>
            <input type="number" id="sharedPctInput" class="sheet-input" step="1" min="1" max="100" placeholder="Es. 50" value="50">
            <div class="shared-preview" id="sharedPreview">${fmtE(totalAmount / 2)} a tuo carico</div>
        `;
        const pctInput = document.getElementById('sharedPctInput');
        if (pctInput) {
            pctInput.addEventListener('input', () => {
                const pct = parseFloat(pctInput.value) || 0;
                const preview = document.getElementById('sharedPreview');
                if (preview) {
                    const yourPart = totalAmount * pct / 100;
                    const otherPart = totalAmount - yourPart;
                    preview.textContent = `${fmtE(yourPart)} a tuo carico · ${fmtE(otherPart)} a carico altrui`;
                }
            });
        }
    } else if (method === 'fixed') {
        container.innerHTML = `
            <label class="shared-field-label">Importo a carico tuo (€)</label>
            <input type="number" id="sharedFixedInput" class="sheet-input" step="0.01" min="0" placeholder="Es. 25.00">
            <div class="shared-preview" id="sharedPreview">Inserisci l\'importo a tuo carico</div>
        `;
        const fixedInput = document.getElementById('sharedFixedInput');
        if (fixedInput) {
            fixedInput.addEventListener('input', () => {
                const yourPart = parseFloat(fixedInput.value) || 0;
                const preview = document.getElementById('sharedPreview');
                if (preview) {
                    const otherPart = totalAmount - yourPart;
                    preview.textContent = `${fmtE(yourPart)} a tuo carico · ${fmtE(otherPart)} a carico altrui`;
                }
            });
        }
    }
}

async function saveSharedSplits(expenseId, splitAmount, payer, selectedValue) {
    let personId = null, groupId = null;
    if (selectedValue.startsWith('g_')) {
        groupId = parseInt(selectedValue.replace('g_', ''));
        const members = groupMembers.filter(m => m.groupId === groupId);
        const perMember = splitAmount / (members.length || 1);
        for (const member of members) {
            await db.sharedExpenseSplits.put({
                id: genId(), expenseId, personId: member.personId, groupId,
                amount: perMember, splitType: 'equal', paidBy: payer,
                isPaid: false, settled: false, createdAt: Date.now()
            });
        }
    } else {
        personId = parseInt(selectedValue);
        await db.sharedExpenseSplits.put({
            id: genId(), expenseId, personId, groupId: null,
            amount: splitAmount, splitType: 'equal', paidBy: payer,
            isPaid: false, settled: false, createdAt: Date.now()
        });
    }
    return true;
}
function openIncomeSheet() {
    const overlay = document.getElementById('incomeSheetOverlay');
    const sheet = document.getElementById('incomeBottomSheet');
    if (!overlay || !sheet) return;
    document.body.classList.add('sheet-open');
    overlay.classList.add('open');
    sheet.classList.add('open');
    const amountInput = document.getElementById('incomeAmountInput');
    if (amountInput) amountInput.value = '';
    const dateInput = document.getElementById('incomeSheetDate');
    if (dateInput) dateInput.value = new Date().toISOString().slice(0, 10);
    const noteInput = document.getElementById('incomeSheetNote');
    if (noteInput) noteInput.value = '';
}

function closeIncomeSheet() {
    const overlay = document.getElementById('incomeSheetOverlay');
    const sheet = document.getElementById('incomeBottomSheet');
    if (overlay && sheet) {
        document.body.classList.remove('sheet-open');
        overlay.classList.remove('open');
        sheet.classList.remove('open');
        sheet.style.transform = '';
        sheet.classList.remove('dragging');
    }
}

async function saveIncomeFromSheet() {
    const month = document.getElementById('currentMonth').value;
    if (!month) { showToast('Nessun mese selezionato', true); return; }
    const amountInput = document.getElementById('incomeAmountInput');
    const dateInput = document.getElementById('incomeSheetDate');
    const noteInput = document.getElementById('incomeSheetNote');

    const amount = parseFloat(amountInput?.value) || 0;

    if (amount <= 0) { showToast('Inserisci un importo maggiore di zero', true); return; }

    const date = dateInput?.value || new Date().toISOString().slice(0, 10);
    const note = noteInput?.value.trim() || 'Entrata';

    const inc = { id: Date.now(), month, date, desc: note, amount };

    try {
        currentData.income.push(inc);
        await db.income.put(inc);
        closeIncomeSheet();
        await updateUI();
        // Re-render income list if popup is still open
        if (document.getElementById('popup-rendiconto').classList.contains('active')) {
            const month2 = document.getElementById('currentMonth').value;
            await renderIncomeList(month2);
        }
        showToast('Entrata aggiunta', false);
    } catch (err) {
        console.error('[DB] Error adding income from sheet:', err);
        showToast('Errore salvataggio', true);
        currentData.income.pop();
    }
}

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
    
    // Reset inputs
    const amountInput = document.getElementById('expenseAmountInput');
    const sheetDate = document.getElementById('sheetDate');
    const toggleOptions = document.querySelectorAll('.toggle-option');
    
    if (amountInput) amountInput.value = '';
    if (sheetDate) sheetDate.value = new Date().toISOString().slice(0, 10);
    
    toggleOptions.forEach(opt => {
        opt.classList.toggle('active', opt.dataset.type === 'actual');
    });
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

// Swipe-to-dismiss for bottom sheet
let dragStartY = 0;
let dragCurrentY = 0;
let isDragging = false;

function setupSwipeToClose() {
    const sheet = document.getElementById('bottomSheet');
    const handle = document.querySelector('#bottomSheet .drag-handle-wrapper');
    const header = document.querySelector('#bottomSheet .bottom-sheet-header');
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

// Open bottom sheet in edit mode with pre-filled data
function editExpense(id) {
    const exp = currentData.expenses.find(e => e.id === id);
    if (!exp) return;

    editingExpenseId = id;
    sheetSelectedCategory = exp.category;
    sheetTransactionType = exp.planned > 0 && exp.actual === 0 ? 'planned' : 'actual';

    const overlay = document.getElementById('sheetOverlay');
    const sheet = document.getElementById('bottomSheet');
    const slider = document.querySelector('.sheet-slider');
    const backBtn = document.getElementById('btn-back-to-categories');
    const sheetTitle = document.getElementById('selected-category-title');
    const amountInput = document.getElementById('expenseAmountInput');
    const sheetDate = document.getElementById('sheetDate');
    const sheetNote = document.getElementById('sheetNote');
    const toggleOptions = document.querySelectorAll('.toggle-option');

    if (!overlay || !sheet) return;

    document.body.classList.add('sheet-open');
    overlay.classList.add('open');
    sheet.classList.add('open');

    // Slide directly to input view, hide back button (category not changeable in edit)
    if (slider) slider.style.transform = 'translateX(-100%)';
    if (backBtn) backBtn.style.display = 'none';

    if (sheetTitle) sheetTitle.textContent = exp.category;

    // Pre-fill amount
    const amount = exp.planned || exp.actual || 0;
    if (amountInput) amountInput.value = amount.toFixed(2);

    // Pre-fill date
    if (sheetDate && exp.date) {
        sheetDate.value = exp.date;
    }

    // Pre-fill note
    if (sheetNote && exp.desc) {
        sheetNote.value = exp.desc;
    }

    // Set toggle type
    const isPlanned = sheetTransactionType === 'planned';
    toggleOptions.forEach(opt => {
        opt.classList.toggle('active', opt.dataset.type === sheetTransactionType);
    });

    // Reset recurring toggle in edit mode
    const recToggle = document.getElementById('recurringToggle');
    const recContainer = document.getElementById('recurringUntilContainer');
    const recUntil = document.getElementById('recurringUntil');
    if (recToggle) recToggle.checked = false;
    if (recContainer) recContainer.classList.remove('active');
    if (recUntil) recUntil.value = '';

    sheetCurrentMacroGroup = null;
}

// Save transaction from bottom sheet
async function saveTransactionFromSheet() {
    const amountInput = document.getElementById('expenseAmountInput');
    const sheetDate = document.getElementById('sheetDate');
    const sheetNote = document.getElementById('sheetNote');
    const saveBtn = document.getElementById('saveTransactionBtn');
    
    const amount = parseFloat(amountInput?.value) || 0;
    
    if (amount <= 0) {
        alert('Inserisci un importo maggiore di zero');
        return;
    }
    
    const date = sheetDate?.value || new Date().toISOString().slice(0, 10);
    const month = date.slice(0, 7);
    const note = sheetNote?.value.trim() || '';

    if (editingExpenseId) {
        // EDIT MODE
        const originalIdx = currentData.expenses.findIndex(e => e.id === editingExpenseId);
        if (originalIdx === -1) { editingExpenseId = null; return; }

        const originalExp = currentData.expenses[originalIdx];
        const originalType = originalExp.planned > 0 && originalExp.actual === 0 ? 'planned' : 'actual';
        const newType = sheetTransactionType;

        if (originalType === newType) {
            // CASO A: same type → update in place
            originalExp.month = month;
            originalExp.date = date;
            originalExp.category = sheetSelectedCategory;
            originalExp.desc = note || 'Aggiunto da mobile';
            originalExp.planned = newType === 'planned' ? amount : 0;
            originalExp.actual = newType === 'actual' ? amount : 0;
            currentData.expenses[originalIdx] = originalExp;
            await db.expenses.put(originalExp);
        } else {
            // CASO B: type changed → keep original untouched, create new clone
            if (originalType === 'planned' && newType === 'actual') {
                originalExp.settled = true;
                await db.expenses.put(originalExp);
            }
            const cloneExp = {
                id: Date.now(),
                month, date,
                category: sheetSelectedCategory,
                desc: note || 'Aggiunto da mobile',
                planned: newType === 'planned' ? amount : 0,
                actual: newType === 'actual' ? amount : 0,
                sharedPercentage: 0
            };
            currentData.expenses.push(cloneExp);
            await db.expenses.put(cloneExp);
            // Original expense is NOT modified otherwise
        }

        editingExpenseId = null;
        closeTransactionSheet();
        await updateUI();
        showToast('Spesa aggiornata', false);
        return;
    }

    // NEW EXPENSE - Shared expense logic
    const sharedToggle = document.getElementById('sharedToggle');
    const isShared = sharedToggle?.checked;
    const sharedPersonSelect = document.getElementById('sharedPersonSelect');
    const selVal = sharedPersonSelect?.value;
    const hasPersonSelected = selVal && selVal !== '';
    
    let myPart = amount;
    let otherPart = 0;
    let sharedPct = 0;
    let payer = 'me';
    
    if (isShared && hasPersonSelected) {
        const activePill = document.querySelector('.payer-pill.active');
        payer = activePill ? activePill.dataset.payer : 'me';
        
        const activeMethod = document.querySelector('.split-pill.active');
        const method = activeMethod ? activeMethod.dataset.method : 'equal';
        
        if (method === 'equal') {
            myPart = amount / 2;
            otherPart = amount / 2;
            sharedPct = 50;
        } else if (method === 'percentage') {
            const pct = parseFloat(document.getElementById('sharedPctInput')?.value) || 50;
            myPart = amount * pct / 100;
            otherPart = amount - myPart;
            sharedPct = pct;
        } else if (method === 'fixed') {
            const yourPart = parseFloat(document.getElementById('sharedFixedInput')?.value) || 0;
            myPart = Math.min(yourPart, amount);
            otherPart = amount - myPart;
            sharedPct = amount > 0 ? Math.round(myPart / amount * 100) : 0;
        }
        myPart = Math.max(0, Math.min(myPart, amount));
        otherPart = Math.max(0, amount - myPart);
    }
    
    let exp;
    if (isShared && hasPersonSelected && payer === 'them') {
        // Ha pagato l'altro → solo la mia quota va in previste, niente nelle sostenute
        exp = {
            id: Date.now(),
            month, date,
            category: sheetSelectedCategory,
            desc: note || 'Aggiunto da mobile',
            planned: myPart,
            actual: 0,
            sharedPercentage: sharedPct,
            isShared: true,
            sharedPayer: 'them'
        };
    } else {
        // Ho pagato io (o spesa normale) → tutto nelle sostenute/previste come prima
        exp = {
            id: Date.now(),
            month, date,
            category: sheetSelectedCategory,
            desc: note || 'Aggiunto da mobile',
            planned: sheetTransactionType === 'planned' ? (isShared ? myPart : amount) : 0,
            actual: sheetTransactionType === 'actual' ? (isShared ? amount : amount) : 0,
            sharedPercentage: isShared ? sharedPct : 0,
            isShared: isShared || undefined,
            sharedPayer: isShared ? 'me' : undefined
        };
    }
    
    try {
        const recToggle = document.getElementById('recurringToggle');
        const recUntilEl = document.getElementById('recurringUntil');
        const isRecurring = recToggle?.checked;
        if (isRecurring) {
            const groupId = Date.now();
            exp.recurringGroupId = groupId;
            exp.recurringEndMonth = recUntilEl?.value || '';
        }

        currentData.expenses.push(exp);
        await db.expenses.put(exp);

        if (isShared && hasPersonSelected && otherPart > 0) {
            await saveSharedSplits(exp.id, otherPart, payer, selVal);
        }

        if (isRecurring) {
            await saveRecurringClones(exp, recUntilEl?.value || '', exp.recurringGroupId);
        }

        closeTransactionSheet();
        await updateUI();
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

// Setup recurring toggle show/hide animation
function setupRecurringToggle() {
    const toggle = document.getElementById('recurringToggle');
    const container = document.getElementById('recurringUntilContainer');
    if (toggle && container) {
        toggle.addEventListener('change', () => {
            container.classList.toggle('active', toggle.checked);
        });
    }
    const toggleDesktop = document.getElementById('recurringToggleDesktop');
    const containerDesktop = document.getElementById('recurringUntilContainerDesktop');
    if (toggleDesktop && containerDesktop) {
        toggleDesktop.addEventListener('change', () => {
            containerDesktop.classList.toggle('active', toggleDesktop.checked);
        });
    }
}

// Helper: generate recurring clones
async function saveRecurringClones(originalExp, endMonthValue, groupId) {
    const amount = originalExp.planned || originalExp.actual;
    if (!amount || amount <= 0) return;

    const startDate = new Date(originalExp.date);
    const day = startDate.getDate();
    let y = startDate.getFullYear();
    let m = startDate.getMonth();
    const endMonth = endMonthValue || '';
    let count = 0;

    while (true) {
        count++;
        if (!endMonth && count > 240) break;

        m++;
        if (m > 11) { m = 0; y++; }

        const nextMonth = `${y}-${String(m + 1).padStart(2, '0')}`;
        if (endMonth && nextMonth > endMonth) break;

        const lastDay = new Date(y, m + 1, 0).getDate();
        const cloneDate = `${nextMonth}-${String(Math.min(day, lastDay)).padStart(2, '0')}`;

        const clone = {
            id: Date.now() + count,
            recurringGroupId: groupId,
            recurringEndMonth: endMonth || '',
            month: nextMonth,
            date: cloneDate,
            category: originalExp.category,
            desc: originalExp.desc,
            planned: amount,
            actual: 0,
            sharedPercentage: originalExp.sharedPercentage || 0
        };
        currentData.expenses.push(clone);
        await db.expenses.put(clone);
    }
}

// Initialize toggle when DOM ready
document.addEventListener('DOMContentLoaded', () => {
    setupToggleType();
    setupRecurringToggle();
});

// Initialize macro dash cards and back button
document.addEventListener('DOMContentLoaded', () => {
    setupMacroDashCards();
    setupBottomSheetBackBtn();
});

// ===== INCOME BOTTOM SHEET EVENTS =====
(function setupIncomeSheetEvents() {
    const closeBtn = document.getElementById('closeIncomeSheetBtn');
    const overlay = document.getElementById('incomeSheetOverlay');
    const sheet = document.getElementById('incomeBottomSheet');
    const saveBtn = document.getElementById('saveIncomeSheetBtn');
    const newIncomeBtn = document.getElementById('btnNewIncome');

    if (newIncomeBtn) {
        newIncomeBtn.addEventListener('click', openIncomeSheet);
    }
    if (closeBtn) {
        closeBtn.addEventListener('click', closeIncomeSheet);
    }
    if (overlay) {
        overlay.addEventListener('click', closeIncomeSheet);
    }
    if (saveBtn) {
        saveBtn.addEventListener('click', saveIncomeFromSheet);
    }
    if (sheet) {
        sheet.addEventListener('click', (e) => e.stopPropagation());
    }
})();

// Swipe-to-close for income bottom sheet
(function setupIncomeSwipeToClose() {
    const sheet = document.getElementById('incomeBottomSheet');
    const handle = document.querySelector('#incomeBottomSheet .drag-handle-wrapper');
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
        if (deltaY > threshold) closeIncomeSheet();
        else sheet.style.transform = '';
    };
    handle.addEventListener('touchstart', onTouchStart, { passive: true });
    handle.addEventListener('touchmove', onTouchMove, { passive: true });
    handle.addEventListener('touchend', onTouchEnd);
    handle.addEventListener('touchcancel', onTouchEnd);
})();

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
    // Emoji picker: tap button → show hidden input → native emoji keyboard
    const pickerBtn = document.getElementById('emojiPickerBtn');
    const emojiInput = document.getElementById('emojiInput');
    if (pickerBtn && emojiInput) {
        pickerBtn.addEventListener('click', () => {
            emojiInput.value = '';
            emojiInput.style.position = 'fixed';
            emojiInput.style.opacity = '0';
            emojiInput.style.pointerEvents = 'none';
            emojiInput.focus();
        });
        emojiInput.addEventListener('input', () => {
            const val = emojiInput.value.trim();
            if (val) {
                // Take the last character (in case multi-codepoint emoji sequence)
                const emoji = [...val].pop() || val;
                pickerBtn.textContent = emoji;
            }
            emojiInput.style.position = '';
            emojiInput.style.opacity = '';
            emojiInput.style.pointerEvents = '';
            emojiInput.blur();
        });
        emojiInput.addEventListener('blur', () => {
            emojiInput.style.position = '';
            emojiInput.style.opacity = '';
            emojiInput.style.pointerEvents = '';
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
    const pickerBtn = document.getElementById('emojiPickerBtn');
    if (pickerBtn) pickerBtn.textContent = getCatIcon(cat);
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
            const chosenEmoji = document.getElementById('emojiPickerBtn')?.textContent || '';
            categoryIconMap[name] = chosenEmoji || categoryIconMap[name] || MACRO_ICON[macro] || '🏷️';
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
            const chosenEmoji = document.getElementById('emojiPickerBtn')?.textContent || '';
            categoryIconMap[name] = chosenEmoji && chosenEmoji !== '🏷️' ? chosenEmoji : (MACRO_ICON[macro] || '🏷️');
            await db.categories.put({name, macro, icon: categoryIconMap[name]});
        }
        rebuildUserCategories();
        saveMacroToLocalStorage();
        await updateGlobalVersion();
        input.value = '';
        const pickerBtn = document.getElementById('emojiPickerBtn');
        if (pickerBtn) pickerBtn.textContent = '🏷️';
        renderCategoriesDropdown();
        renderCategorySettings();
        renderImportCheckboxList();
        await updateUI();
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
    await updateUI();
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
    await updateUI(); await checkDatabaseHealth();
}
async function addExpense() {
    const date = document.getElementById('expDate').value;
    const month = date.slice(0, 7);
    const cat = document.getElementById('expenseCategory').value;
    const desc = document.getElementById('expDesc').value.trim() || "Spesa";
    let planned = parseFloat(document.getElementById('expPlanned').value) || 0;
    let actual = parseFloat(document.getElementById('expActual').value) || 0;
    let shared = parseFloat(document.getElementById('expShared').value) || 0;
    if (planned === 0 && actual === 0) return;
    if (shared > 0 && shared < 100) { planned *= (shared/100); actual *= (shared/100); }
    let exp = {id: Date.now(), month, date, category: cat, desc, planned, actual, sharedPercentage: shared};
    
    try {
        // Recurring logic for desktop
        const recToggleDesktop = document.getElementById('recurringToggleDesktop');
        const recUntilDesktop = document.getElementById('recurringUntilDesktop');
        const isRecurringDesktop = recToggleDesktop?.checked;
        if (isRecurringDesktop) {
            const groupId = Date.now();
            exp.recurringGroupId = groupId;
            exp.recurringEndMonth = recUntilDesktop?.value || '';
        }

        currentData.expenses.push(exp);
        await db.expenses.put(exp);

        if (isRecurringDesktop) {
            await saveRecurringClones(exp, recUntilDesktop?.value || '', exp.recurringGroupId);
        }

        document.getElementById('expDesc').value = '';
        document.getElementById('expPlanned').value = '';
        document.getElementById('expActual').value = '';
        document.getElementById('expShared').value = '';
        if (recToggleDesktop) recToggleDesktop.checked = false;
        const recContainerDesktop = document.getElementById('recurringUntilContainerDesktop');
        if (recContainerDesktop) recContainerDesktop.classList.remove('active');
        await updateUI();
        await checkDatabaseHealth();
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
        const p = parseFloat(val.replace(',','.')); if (!isNaN(p)) { exp.actual = p; await db.expenses.update(id, {actual: p}); await updateUI(); }
    }
}
async function deleteEntry(type, id) {
    if (type === 'income') { currentData.income = currentData.income.filter(i => i.id !== id); await db.income.delete(id); }
    else { currentData.expenses = currentData.expenses.filter(i => i.id !== id); await db.expenses.delete(id); }
    await updateUI(); await checkDatabaseHealth();
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
    await updateUI(); await checkDatabaseHealth(); alert(`${count} voci ereditate.`);
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
    const _month = document.getElementById('currentMonth').value;
    if (_month) {
        currentData.income = await getIncomesForMonth(_month);
        currentData.expenses = (await db.expenses.toArray()).filter(e => (e.date || e.month).slice(0, 7) === _month);
    }
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
        const isSettled = exp.settled === true;
        const fd = exp.date.split('-').reverse().slice(0,2).join('/');
        const sharedTxt = exp.sharedPercentage > 0 ? ` <span style="font-size:9px;color:#3b82f6;">(${exp.sharedPercentage}%)</span>` : '';
        const row = document.createElement('div'); row.className = 'item-row';
        row.innerHTML = `
            <span class="item-name">${isPending ? '⏳ ' : ''}${getCatIcon(exp.category)} <strong>${exp.category}</strong>${isSettled ? '<span class="settled-badge">Saldata</span>' : ''}${sharedTxt}<span class="item-meta">${fd} · ${exp.desc}</span></span>
            <span class="item-vals">
                <div><span class="val-p">Stima: ${fmtE(exp.planned)}</span><span class="val-s">${exp.actual > 0 ? fmtE(exp.actual) : 'Da pagare'}</span></div>
                ${isPending ? `<button class="btn-action btn-pay" onclick="payExpense(${exp.id})">Paga</button>` : ''}
                <button class="btn-del" onclick="deleteEntry('expense',${exp.id})">✕</button>
            </span>`;
        row.style.cursor = 'pointer';
        row.addEventListener('click', (e) => {
            if (e.target.closest('button')) return;
            editExpense(exp.id);
        });
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
async function filterByCategory(cat) { selectedFilterCategory = cat; selectedFilterDate = null; document.getElementById('listTitle').scrollIntoView({behavior:'smooth'}); await updateUI(); }
async function filterByDate(ds) { selectedFilterDate = ds; selectedFilterCategory = null; document.getElementById('listTitle').scrollIntoView({behavior:'smooth'}); await updateUI(); }
async function handleSearch() { searchQuery = document.getElementById('searchInput').value.toLowerCase(); await updateUI(); }
async function clearAllFilters() { selectedFilterDate = null; selectedFilterCategory = null; searchQuery = ""; const s = document.getElementById('searchInput'); if(s) s.value = ""; await updateUI(); }
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
    const incomeBtn = document.getElementById('btnNewIncome');
    const incomeListContainer = document.getElementById('incomeListContainer');
    const expenseListContainer = document.getElementById('expenseListContainer');
    if (type === 'entrate') {
        if (incomeBtn) incomeBtn.style.display = 'block';
        if (incomeListContainer) { incomeListContainer.style.display = 'block'; await renderIncomeList(month); }
        if (expenseListContainer) expenseListContainer.style.display = 'none';
    } else {
        if (incomeBtn) incomeBtn.style.display = 'none';
        if (incomeListContainer) incomeListContainer.style.display = 'none';
        if (expenseListContainer) { expenseListContainer.style.display = 'block'; await renderExpenseList(type, month); }
    }
    overlay.classList.add('active');
    document.body.classList.add('sheet-open');
}

async function getIncomesForMonth(month) {
    const all = await db.income.toArray();
    return all.filter(i => {
        const refMonth = i.date ? i.date.slice(0, 7) : i.month;
        return refMonth === month;
    });
}

async function renderIncomeList(month) {
    const container = document.getElementById('incomeListContainer');
    if (!container) return;
    const incomes = (await getIncomesForMonth(month))
        .sort((a, b) => {
            const dateA = a.date || a.month + '-01';
            const dateB = b.date || b.month + '-01';
            return dateA.localeCompare(dateB);
        });
    if (incomes.length === 0) {
        container.innerHTML = '<div class="income-list-empty">Nessuna entrata registrata per questo mese.</div>';
        return;
    }
    container.innerHTML = '';
    incomes.forEach(inc => {
        const row = document.createElement('div');
        row.className = 'income-row';
        const dateStr = inc.date ? inc.date.split('-').reverse().slice(0,2).join('/') : inc.month.split('-').reverse().join('/');
        row.innerHTML = `
            <div class="income-row-left">
                <span class="income-row-desc">💰 ${inc.desc}</span>
                <span class="income-row-date">${dateStr}</span>
            </div>
            <span class="income-row-amount">+${fmtEPlain(inc.amount)}</span>
            <button class="income-row-del" data-id="${inc.id}" title="Elimina">✕</button>
        `;
        row.querySelector('.income-row-del').addEventListener('click', async () => {
            if (confirm('Eliminare questa entrata?')) {
                await deleteEntry('income', inc.id);
                await renderIncomeList(month);
            }
        });
        container.appendChild(row);
    });
}

async function renderExpenseList(type, month) {
    const container = document.getElementById('expenseListContainer');
    if (!container) return;
    const all = (await db.expenses.toArray()).filter(e => (e.date || e.month).slice(0, 7) === month);
    const isSostenuto = type === 'sostenuto';
    const expenses = all.filter(e => isSostenuto ? (e.actual || 0) > 0 : (e.planned || 0) > 0)
        .sort((a, b) => {
            const dateA = a.date || a.month + '-01';
            const dateB = b.date || b.month + '-01';
            return dateA.localeCompare(dateB);
        });
    if (expenses.length === 0) {
        container.innerHTML = '<div class="income-list-empty">Nessuna spesa registrata per questo mese.</div>';
        return;
    }
    const amountColor = isSostenuto ? 'var(--sostenuto)' : 'var(--previsto)';
    container.innerHTML = '';
    expenses.forEach(exp => {
        const row = document.createElement('div');
        row.className = 'income-row';
        const dateStr = exp.date ? exp.date.split('-').reverse().slice(0,2).join('/') : exp.month.split('-').reverse().join('/');
        const isSettled = exp.settled === true;
        row.innerHTML = `
            <div class="income-row-left">
                <span class="income-row-desc">${getCatIcon(exp.category)} ${exp.category}${isSettled ? '<span class="settled-badge">Saldata</span>' : ''} · ${exp.desc}</span>
                <span class="income-row-date">${dateStr}</span>
            </div>
            <span class="income-row-amount" style="color:${amountColor}">-${fmtEPlain(isSostenuto ? exp.actual : exp.planned)}</span>
            <button class="income-row-del" data-id="${exp.id}" title="Elimina">✕</button>
        `;
        row.querySelector('.income-row-del').addEventListener('click', async (ev) => {
            ev.stopPropagation();
            if (confirm('Eliminare questa spesa?')) {
                await deleteEntry('expense', exp.id);
                await renderExpenseList(type, month);
            }
        });
        row.style.cursor = 'pointer';
        row.addEventListener('click', (e) => {
            if (e.target.closest('button')) return;
            editExpense(exp.id);
        });
        container.appendChild(row);
    });
}
function closeRendicontoPopup(event) {
    event.preventDefault();
    event.stopPropagation();
    document.getElementById('popup-rendiconto').classList.remove('active');
    document.body.classList.remove('sheet-open');
}

async function buildRendicontoRows(type, month, prevMonth) {
    if (type === 'entrate') {
        const currentIncome = await getIncomesForMonth(month);
        const prevIncome = await getIncomesForMonth(prevMonth);
        const currentTotal = currentIncome.reduce((sum, item) => sum + item.amount, 0);
        const previousTotal = prevIncome.reduce((sum, item) => sum + item.amount, 0);
        return [{ label: 'Entrate', currentValue: currentTotal, previousValue: previousTotal, color: '#10b981' }];
    }
    if (type === 'previsto') {
        const allExpenses = await db.expenses.toArray();
        const currentExpenses = allExpenses.filter(e => (e.date || e.month).slice(0, 7) === month);
        const prevExpenses = allExpenses.filter(e => (e.date || e.month).slice(0, 7) === prevMonth);
        const currentTotal = currentExpenses.reduce((sum, item) => sum + (item.planned || 0), 0);
        const previousTotal = prevExpenses.reduce((sum, item) => sum + (item.planned || 0), 0);
        return [{ label: 'Spese Previste', currentValue: currentTotal, previousValue: previousTotal, color: '#f97316' }];
    }
    const allExpenses = await db.expenses.toArray();
    const currentExpenses = allExpenses.filter(e => (e.date || e.month).slice(0, 7) === month);
    const prevExpenses = allExpenses.filter(e => (e.date || e.month).slice(0, 7) === prevMonth);
    const currentTotal = currentExpenses.reduce((sum, item) => sum + (item.actual || 0), 0);
    const previousTotal = prevExpenses.reduce((sum, item) => sum + (item.actual || 0), 0);
    return [{ label: 'Spese Sostenute', currentValue: currentTotal, previousValue: previousTotal, color: '#ef4444' }];
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

// =====================================================================
// INVESTIMENTI & ASSET
// =====================================================================
const ASSET_TYPES = {
    immobili: { icon: '🏠', label: 'Immobili', color: '#0d9488' },
    trading_crypto: { icon: '📈', label: 'Trading/Crypto', color: '#8b5cf6' },
    salvadanai: { icon: '🐷', label: 'Salva-Danai', color: '#f59e0b' },
    side_business: { icon: '🚀', label: 'Side Business', color: '#3b82f6' }
};
const MOVEMENT_TYPE_LABELS = {
    deposit: '💰 Deposito',
    withdrawal: '💸 Prelievo',
    profit: '📈 Profitto',
    expense: '🔧 Spesa'
};
let currentInvestments = [];
let selectedInvestId = null;
let selectedInvestType = null;

async function loadInvestments() {
    try {
        currentInvestments = await db.investments.toArray();
    } catch (e) {
        console.warn('[Invest] Errore caricamento:', e);
        currentInvestments = [];
    }
}

async function getInvestMovements(investId) {
    try {
        return await db.investmentMovements.where('investmentId').equals(investId).toArray();
    } catch (e) {
        console.warn('[Invest] Errore movimenti:', e);
        return [];
    }
}

function calcInvestStats(asset, movements) {
    const deposits = movements.filter(m => m.type === 'deposit' || m.type === 'profit').reduce((s, m) => s + m.amount, 0);
    const withdrawals = movements.filter(m => m.type === 'withdrawal' || m.type === 'expense').reduce((s, m) => s + m.amount, 0);
    const currentValue = deposits - withdrawals;
    const totalInvested = (asset.initialCapital || 0) + movements.filter(m => m.type === 'deposit').reduce((s, m) => s + m.amount, 0);
    const totalProfits = movements.filter(m => m.type === 'profit').reduce((s, m) => s + m.amount, 0);
    const roi = totalInvested > 0 ? (totalProfits / totalInvested) * 100 : 0;
    return { currentValue, totalInvested, totalProfits, roi };
}

async function renderInvestments() {
    await loadInvestments();
    const grid = document.getElementById('investAssetGrid');
    const desktopList = document.getElementById('investAssetListDesktop');
    if (!grid && !desktopList) return;
    const allMovements = [];
    for (const asset of currentInvestments) {
        const movs = await getInvestMovements(asset.id);
        allMovements.push({ asset, movements: movs });
    }
    // Hero stats
    let totalValue = 0, totalRoiWeighted = 0, totalInvestedWeighted = 0;
    const now = new Date();
    const oneMonthAgo = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
    let monthlyCashflow = 0;
    for (const { asset, movements } of allMovements) {
        const stats = calcInvestStats(asset, movements);
        totalValue += stats.currentValue;
        if (stats.totalInvested > 0) {
            totalRoiWeighted += stats.roi * stats.totalInvested;
            totalInvestedWeighted += stats.totalInvested;
        }
        // Cashflow: last 30 days profits - expenses
        const recent = movements.filter(m => new Date(m.date) >= oneMonthAgo);
        const recentIn = recent.filter(m => m.type === 'profit').reduce((s, m) => s + m.amount, 0);
        const recentOut = recent.filter(m => m.type === 'expense').reduce((s, m) => s + m.amount, 0);
        monthlyCashflow += recentIn - recentOut;
    }
    const globalRoi = totalInvestedWeighted > 0 ? (totalRoiWeighted / totalInvestedWeighted) : 0;
    document.getElementById('investTotalValue').textContent = fmtEPlain(totalValue, 0);
    document.getElementById('investMonthlyCashflow').textContent = (monthlyCashflow >= 0 ? '+' : '') + fmtEPlain(monthlyCashflow, 0);
    document.getElementById('investGlobalRoi').textContent = (globalRoi >= 0 ? '+' : '') + globalRoi.toFixed(1) + '%';

    const renderCard = (asset, movements) => {
        const info = ASSET_TYPES[asset.type] || { icon: '💎', label: asset.type, color: '#64748b' };
        const stats = calcInvestStats(asset, movements);
        const roiColor = stats.roi >= 0 ? '#10b981' : '#ef4444';
        const isGoal = asset.type === 'salvadanai' && asset.targetAmount > 0;
        const pct = isGoal ? Math.min(100, Math.max(0, (stats.currentValue / asset.targetAmount) * 100)) : 0;
        return `
            <div class="invest-asset-card" data-id="${asset.id}" style="cursor:pointer;">
                <div class="invest-card-left" style="background:${info.color}22;border-radius:12px;width:44px;height:44px;display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0;">
                    ${info.icon}
                </div>
                <div class="invest-card-center" style="flex:1;min-width:0;">
                    <div class="invest-card-name">${asset.name}</div>
                    <div class="invest-card-type">${info.label}</div>
                    ${isGoal ? `
                        <div class="invest-progress-track">
                            <div class="invest-progress-bar" style="width:${pct}%;background:${info.color};"></div>
                        </div>
                        <div class="invest-progress-label">${fmtEPlain(stats.currentValue,0)} / ${fmtEPlain(asset.targetAmount,0)}</div>
                    ` : ''}
                </div>
                <div class="invest-card-right" style="text-align:right;flex-shrink:0;">
                    <div class="invest-card-value">${fmtEPlain(stats.currentValue,0)}</div>
                    <div class="invest-card-roi" style="color:${roiColor};">${stats.roi >= 0 ? '+' : ''}${stats.roi.toFixed(1)}%</div>
                </div>
            </div>
        `;
    };
    const html = allMovements.map(({ asset, movements }) => renderCard(asset, movements)).join('');
    const empty = '<div class="invest-empty">Nessun asset. Premi "+" per crearne uno.</div>';
    if (grid) {
        grid.innerHTML = html || empty;
        grid.querySelectorAll('.invest-asset-card').forEach(el => {
            el.addEventListener('click', () => openInvestAssetPopup(parseInt(el.dataset.id)));
        });
    }
    if (desktopList) {
        desktopList.innerHTML = html || empty;
        desktopList.querySelectorAll('.invest-asset-card').forEach(el => {
            el.addEventListener('click', () => openInvestAssetPopup(parseInt(el.dataset.id)));
        });
    }
}

function selectInvestType(btn) {
    document.querySelectorAll('.invest-type-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedInvestType = btn.dataset.type;
    const targetInput = document.getElementById('investNewTarget');
    if (targetInput) {
        targetInput.style.display = selectedInvestType === 'salvadanai' ? 'block' : 'none';
        if (selectedInvestType !== 'salvadanai') targetInput.value = '';
    }
}

function openInvestAddSheet() {
    selectedInvestType = null;
    document.querySelectorAll('.invest-type-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('investNewName').value = '';
    const targetInput = document.getElementById('investNewTarget');
    if (targetInput) { targetInput.style.display = 'none'; targetInput.value = ''; }
    const initialCapitalInput = document.getElementById('investNewInitialCapital');
    if (initialCapitalInput) { initialCapitalInput.value = ''; }
    document.getElementById('investAddPopup').classList.add('active');
    document.body.classList.add('sheet-open');
}

function closeInvestAddPopup(event) {
    if (event && event.target !== event.currentTarget) return;
    document.getElementById('investAddPopup').classList.remove('active');
    document.body.classList.remove('sheet-open');
}

async function saveNewInvestment() {
    const name = document.getElementById('investNewName').value.trim();
    if (!name || !selectedInvestType) {
        showToast('Seleziona un tipo e inserisci un nome.', true);
        return;
    }
    const targetInput = document.getElementById('investNewTarget');
    const targetAmount = selectedInvestType === 'salvadanai' ? (parseFloat(targetInput?.value) || 0) : 0;
    const initialCapital = parseFloat(document.getElementById('investNewInitialCapital').value) || 0;
    const asset = { type: selectedInvestType, name, targetAmount, initialCapital, createdAt: Date.now() };
    try {
        await db.investments.put(asset);
        closeInvestAddPopup();
        await renderInvestments();
        showToast('Asset creato!', false);
    } catch (e) {
        console.error('[Invest] Errore salvataggio:', e);
        showToast('Errore salvataggio asset', true);
    }
}

function editInvestInitialCapital(assetId) {
    const asset = currentInvestments.find(a => a.id === assetId);
    if (!asset) return;
    const newVal = prompt('Capitale Investito Iniziale (€):', asset.initialCapital || '0');
    if (newVal === null) return;
    const parsed = parseFloat(newVal.replace(',', '.'));
    if (isNaN(parsed) || parsed < 0) { showToast('Inserisci un valore valido', true); return; }
    asset.initialCapital = parsed;
    db.investments.put(asset).then(() => {
        renderInvestAssetDetail(asset);
        renderInvestments();
        showToast('Capitale iniziale aggiornato', false);
    }).catch(e => {
        console.error('[Invest] Errore aggiornamento:', e);
        showToast('Errore aggiornamento', true);
    });
}

function openInvestAssetPopup(id) {
    const asset = currentInvestments.find(a => a.id === id);
    if (!asset) return;
    selectedInvestId = id;
    const info = ASSET_TYPES[asset.type] || { icon: '💎', label: asset.type, color: '#64748b' };
    document.getElementById('investPopupTitle').textContent = `${info.icon} ${asset.name}`;
    document.getElementById('investMovementForm').style.display = 'none';
    document.getElementById('investAddPopup').classList.remove('active');
    document.getElementById('investAssetPopup').classList.add('active');
    document.body.classList.add('sheet-open');
    renderInvestAssetDetail(asset);
}

function closeInvestAssetPopup(event) {
    if (event && event.target !== event.currentTarget) return;
    document.getElementById('investAssetPopup').classList.remove('active');
    document.body.classList.remove('sheet-open');
    selectedInvestId = null;
}

async function renderInvestAssetDetail(asset) {
    const movements = await getInvestMovements(asset.id);
    const stats = calcInvestStats(asset, movements);
    const info = ASSET_TYPES[asset.type] || { icon: '💎', label: asset.type, color: '#64748b' };
    const roiColor = stats.roi >= 0 ? '#10b981' : '#ef4444';
    const isGoal = asset.type === 'salvadanai' && asset.targetAmount > 0;
    const pct = isGoal ? Math.min(100, Math.max(0, (stats.currentValue / asset.targetAmount) * 100)) : 0;

    document.getElementById('investPopupSummary').innerHTML = `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
            <div class="invest-stat-box">
                <span class="invest-stat-label">Valore Attuale</span>
                <span class="invest-stat-value">${fmtEPlain(stats.currentValue,0)}</span>
            </div>
            <div class="invest-stat-box">
                <span class="invest-stat-label">Investito <span style="cursor:pointer;font-size:12px;color:#8b5cf6;" onclick="editInvestInitialCapital(${asset.id})" title="Modifica capitale iniziale">✏️</span></span>
                <span class="invest-stat-value">${fmtEPlain(stats.totalInvested,0)}</span>
            </div>
            <div class="invest-stat-box">
                <span class="invest-stat-label">Profitto</span>
                <span class="invest-stat-value" style="color:${roiColor};">${fmtEPlain(stats.totalProfits,0)}</span>
            </div>
            <div class="invest-stat-box">
                <span class="invest-stat-label">ROI</span>
                <span class="invest-stat-value" style="color:${roiColor};">${stats.roi >= 0 ? '+' : ''}${stats.roi.toFixed(1)}%</span>
            </div>
        </div>
        ${isGoal ? `
            <div style="margin-top:8px;">
                <div class="invest-progress-track" style="height:10px;">
                    <div class="invest-progress-bar" style="width:${pct}%;background:${info.color};height:100%;"></div>
                </div>
                <div style="font-size:11px;color:#64748b;text-align:center;margin-top:4px;">${fmtEPlain(stats.currentValue,0)} / ${fmtEPlain(asset.targetAmount,0)} (${pct.toFixed(0)}%)</div>
            </div>
        ` : ''}
    `;

    // Render movements
    const list = document.getElementById('investMovementsList');
    if (movements.length === 0) {
        list.innerHTML = '<div class="invest-empty" style="padding:12px;">Nessun movimento registrato.</div>';
        return;
    }
    movements.sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
    list.innerHTML = movements.map(m => {
        const sign = (m.type === 'deposit' || m.type === 'profit') ? '+' : '-';
        const color = (m.type === 'deposit' || m.type === 'profit') ? '#10b981' : '#ef4444';
        const dateStr = m.date ? m.date.split('-').reverse().slice(0, 2).join('/') : '';
        return `
            <div class="invest-mov-row">
                <div class="invest-mov-left">
                    <span class="invest-mov-type">${MOVEMENT_TYPE_LABELS[m.type] || m.type}</span>
                    <span class="invest-mov-date">${dateStr}${m.desc ? ' · ' + m.desc : ''}</span>
                </div>
                <span class="invest-mov-amount" style="color:${color};">${sign}${fmtEPlain(Math.abs(m.amount))}</span>
            </div>
        `;
    }).join('');
}

function openInvestMovementForm() {
    const form = document.getElementById('investMovementForm');
    form.style.display = 'flex';
    document.getElementById('investMovAmount').value = '';
    document.getElementById('investMovType').value = 'deposit';
    document.getElementById('investMovDate').value = new Date().toISOString().slice(0, 10);
    document.getElementById('investMovDesc').value = '';
}

function closeInvestMovementForm() {
    document.getElementById('investMovementForm').style.display = 'none';
}

async function saveInvestMovement() {
    if (!selectedInvestId) return;
    const amount = parseFloat(document.getElementById('investMovAmount').value) || 0;
    if (amount <= 0) { showToast('Inserisci un importo maggiore di zero', true); return; }
    const type = document.getElementById('investMovType').value;
    const date = document.getElementById('investMovDate').value || new Date().toISOString().slice(0, 10);
    const desc = document.getElementById('investMovDesc').value.trim() || '';
    const mov = { investmentId: selectedInvestId, date, type, amount, desc };
    try {
        await db.investmentMovements.put(mov);
        closeInvestMovementForm();
        const asset = currentInvestments.find(a => a.id === selectedInvestId);
        if (asset) await renderInvestAssetDetail(asset);
        await renderInvestments();
        showToast('Movimento registrato', false);
    } catch (e) {
        console.error('[Invest] Errore movimento:', e);
        showToast('Errore salvataggio movimento', true);
    }
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

let archiveModalCharts = [];

function closeArchiveModal(event) {
    if (event && event.target !== event.currentTarget) return;
    archiveModalCharts.forEach(c => c.destroy());
    archiveModalCharts = [];
    const modal = document.getElementById('archiveModal');
    if (modal) { modal.classList.remove('active'); document.body.classList.remove('sheet-open'); }
}

// =====================================================================
// SETTINGS POPUPS (Grid Cards → Modal)
// =====================================================================
function openSettingsPopup(name) {
    const popup = document.getElementById('popup-' + name);
    if (popup) { popup.classList.add('active'); document.body.classList.add('sheet-open'); }
}
function closePopup(name, event) {
    if (event && event.target !== event.currentTarget) return;
    const popup = document.getElementById('popup-' + name);
    if (popup) { popup.classList.remove('active'); document.body.classList.remove('sheet-open'); }
}

// =====================================================================
// RIPETIZIONI (Recurring Expenses Management)
// =====================================================================
async function renderRipetizioni() {
    const container = document.getElementById('ripetizioniList');
    if (!container) return;
    try {
        const allRaw = await db.expenses.toArray();
        console.log('[Ripetizioni] Raw DB expenses sample:', allRaw.slice(0, 5));
        const all = allRaw.filter(exp => exp && (exp.recurringGroupId || exp.isRecurring));
        const groups = new Map();
        for (const exp of all) {
            const gid = exp.recurringGroupId || `legacy_${(exp.desc||'')}_${(exp.planned||exp.actual||0)}_${(exp.category||'')}`;
            if (!groups.has(gid)) groups.set(gid, []);
            groups.get(gid).push(exp);
        }
        const now = new Date();
        const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        let html = '';
        for (const [gid, exps] of groups) {
            if (!exps || exps.length === 0) continue;
            const months = exps.map(e => e.month).filter(Boolean).sort();
            const maxMonth = months[months.length - 1];
            if (!maxMonth || maxMonth < currentMonth) continue;
            const first = exps[0];
            if (!first) continue;
            const nome = first.desc || 'Spese';
            const importo = first.planned || first.actual || 0;
            const endRaw = first.recurringEndMonth || '';
            const durata = endRaw ? endRaw.slice(0, 7).replace('-', '/') : 'Senza scadenza';
            const safeGid = typeof gid === 'number' ? gid : gid.replace(/'/g, "\\'");
            html += `<div class="ripetizione-row">
                <div class="ripetizione-info">
                    <span class="ripetizione-nome">${nome.replace(/[<>&"']/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'})[c])}</span>
                    <span class="ripetizione-importo">${importo.toFixed(2)}€/mese</span>
                    <span class="ripetizione-durata">${durata === 'Senza scadenza' ? 'Senza scadenza' : 'Fino a: ' + durata}</span>
                </div>
                <button class="ripetizione-delete" title="Elimina ripetizione futura" onclick="deleteRecurringGroup('${safeGid}')">🗑️</button>
            </div>`;
        }
        container.innerHTML = html || '<div class="ripetizioni-empty">Nessuna spesa ricorrente attiva</div>';
    } catch (err) {
        console.error('[Ripetizioni] Error rendering:', err);
        container.innerHTML = '<div class="ripetizioni-empty">Errore nel caricamento dei dati</div>';
    }
}

async function deleteRecurringGroup(groupId) {
    if (!confirm('Eliminare le ripetizioni future di questo gruppo? Le spese passate e già saldate rimarranno invariate.')) return;
    try {
        const allRaw = await db.expenses.toArray();
        const all = allRaw.filter(exp => exp && exp.recurringGroupId == groupId);
        const now = new Date();
        const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        let removed = 0;
        for (const exp of all) {
            let shouldDelete = false;
            if (exp.month > currentMonth) shouldDelete = true;
            else if (exp.month === currentMonth && exp.actual === 0) shouldDelete = true;
            if (shouldDelete) {
                await db.expenses.delete(exp.id);
                const idx = currentData.expenses.findIndex(e => e.id === exp.id);
                if (idx !== -1) currentData.expenses.splice(idx, 1);
                removed++;
            }
        }
        if (removed > 0) {
            showToast(`Ripetizione cancellata (${removed} spese future rimosse)`, false);
            await renderRipetizioni();
            await updateUI();
        } else {
            showToast('Nessuna spesa futura da eliminare', true);
        }
    } catch (err) {
        console.error('[Ripetizioni] Error deleting group:', err);
        showToast('Errore durante la cancellazione', true);
    }
}

// Hook: refresh ripetizioni list when popup opens
document.addEventListener('click', (e) => {
    const card = e.target.closest('.settings-card[data-popup="ripetizioni"]');
    if (card) setTimeout(renderRipetizioni, 50);
});

// =====================================================================
// POPUP RICERCA
// =====================================================================
function openSearchPopup() {
    const popup = document.getElementById('searchPopup');
    if (!popup) return;
    popup.classList.add('active');
    document.body.classList.add('sheet-open');
    document.getElementById('searchPopupInput').value = '';
    document.getElementById('searchResultsList').innerHTML = '<div class="income-list-empty">Digita per cercare...</div>';
    document.getElementById('searchPeriodSelect').value = 'current';
    document.getElementById('searchCustomMonth').style.display = 'none';
    document.getElementById('searchPopupInput').focus();
}

function closeSearchPopup(event) {
    if (event && event.target !== event.currentTarget) return;
    const popup = document.getElementById('searchPopup');
    if (popup) { popup.classList.remove('active'); document.body.classList.remove('sheet-open'); }
}

function toggleSearchCustomMonth() {
    const sel = document.getElementById('searchPeriodSelect');
    const customInput = document.getElementById('searchCustomMonth');
    if (!sel || !customInput) return;
    customInput.style.display = sel.value === 'custom' ? 'block' : 'none';
    if (sel.value === 'custom' && !customInput.value) {
        customInput.value = document.getElementById('currentMonth').value;
    }
    filterSearchResults();
}

async function filterSearchResults() {
    const query = document.getElementById('searchPopupInput').value.trim().toLowerCase();
    const period = document.getElementById('searchPeriodSelect').value;
    const resultsList = document.getElementById('searchResultsList');
    if (!resultsList) return;

    if (!query) {
        resultsList.innerHTML = '<div class="income-list-empty">Digita per cercare...</div>';
        return;
    }

    let expenses = [];
    let incomes = [];

    if (period === 'current') {
        const _month = document.getElementById('currentMonth').value;
        expenses = currentData.expenses;
        incomes = await getIncomesForMonth(_month);
    } else if (period === 'all') {
        expenses = await db.expenses.toArray();
        incomes = await db.income.toArray();
    } else if (period === 'custom') {
        const m = document.getElementById('searchCustomMonth').value;
        if (!m) { resultsList.innerHTML = '<div class="income-list-empty">Seleziona un mese.</div>'; return; }
        expenses = await db.expenses.where('month').equals(m).toArray();
        incomes = await db.income.where('month').equals(m).toArray();
    }

    const filteredExp = expenses.filter(e =>
        (e.desc || '').toLowerCase().includes(query) ||
        (e.category || '').toLowerCase().includes(query) ||
        (e.date || '').includes(query)
    );
    const filteredInc = incomes.filter(i =>
        (i.desc || '').toLowerCase().includes(query) ||
        (i.date || '').includes(query)
    );

    if (filteredExp.length === 0 && filteredInc.length === 0) {
        resultsList.innerHTML = '<div class="income-list-empty">Nessun risultato trovato.</div>';
        return;
    }

    let html = '';
    filteredInc.forEach(inc => {
        const fd = inc.date ? inc.date.split('-').reverse().slice(0,2).join('/') : '';
        html += `<div class="income-row">
            <div class="income-row-left">
                <span class="income-row-desc">💰 ${inc.desc}</span>
                <span class="income-row-date">${fd}</span>
            </div>
            <span class="income-row-amount">+${fmtEPlain(inc.amount)}</span>
        </div>`;
    });
    filteredExp.forEach(exp => {
        const fd = exp.date ? exp.date.split('-').reverse().slice(0,2).join('/') : '';
        const catIcon = getCatIcon(exp.category);
        const sharedTxt = exp.sharedPercentage > 0 ? ` (${exp.sharedPercentage}%)` : '';
        html += `<div class="income-row">
            <div class="income-row-left">
                <span class="income-row-desc">${catIcon} ${exp.category}${sharedTxt} · ${exp.desc || ''}</span>
                <span class="income-row-date">${fd}</span>
            </div>
            <span class="income-row-amount" style="color:var(--sostenuto);font-weight:600;">${exp.actual > 0 ? fmtEPlain(exp.actual) : fmtEPlain(exp.planned)}</span>
        </div>`;
    });
    resultsList.innerHTML = html;
}

// =====================================================================
// POPUP I.A. MESE
// =====================================================================
function openIaMonthPopup() {
    const popup = document.getElementById('iaMonthPopup');
    if (!popup) return;
    popup.classList.add('active');
    document.body.classList.add('sheet-open');
    const respBox = document.getElementById('iaMonthResponse');
    if (respBox) { respBox.style.display = 'none'; respBox.innerText = ''; }
}

function closeIaMonthPopup(event) {
    if (event && event.target !== event.currentTarget) return;
    const popup = document.getElementById('iaMonthPopup');
    if (popup) { popup.classList.remove('active'); document.body.classList.remove('sheet-open'); }
}

// =====================================================================
// POPUP SPESE CONDIVISE
// =====================================================================
function openCondivisePopup() {
    const popup = document.getElementById('popup-spese-condivise');
    if (!popup) return;
    popup.classList.add('active');
    document.body.classList.add('sheet-open');
    switchCondiviseTab('saldi');
}

function closeCondivisePopup(event) {
    if (event && event.target !== event.currentTarget) return;
    const popup = document.getElementById('popup-spese-condivise');
    if (popup) { popup.classList.remove('active'); document.body.classList.remove('sheet-open'); }
}

function switchCondiviseTab(tab) {
    document.querySelectorAll('.condivise-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    document.querySelectorAll('.condivise-tab-content').forEach(c => c.classList.toggle('active', c.id === 'condiviseTab' + tab.charAt(0).toUpperCase() + tab.slice(1)));
    if (tab === 'saldi') renderSaldiTab();
    else renderGruppiTab();
}

async function renderSaldiTab() {
    const container = document.getElementById('condiviseTabSaldi');
    if (!container) return;
    const splits = await db.sharedExpenseSplits.toArray();
    const pendingSplits = splits.filter(s => !s.settled);
    
    let html = '<div class="condivise-add-person"><input type="text" id="newPersonQuickInput" class="sheet-input" placeholder="➕ Nuova persona..."><button class="btn-small" id="btnQuickAddPerson">Aggiungi</button></div>';
    
    if (pendingSplits.length === 0) {
        html += '<div class="condivise-empty">✅ Nessun debito/credito in sospeso</div>';
    } else {
        const balances = {};
        for (const split of pendingSplits) {
            if (!balances[split.personId]) {
                const person = people.find(p => p.id === split.personId);
                balances[split.personId] = { name: person ? person.name : 'Sconosciuto', amount: 0 };
            }
            balances[split.personId].amount += split.amount;
        }
        html += '<div class="condivise-list">';
        for (const pid of Object.keys(balances)) {
            const b = balances[pid];
            const isOwed = b.amount > 0;
            html += `
                <div class="saldo-row ${isOwed ? 'saldo-dovuto' : 'saldo-debito'}" data-pid="${pid}">
                    <div class="saldo-info">
                        <span class="saldo-name">${b.name}</span>
                        <span class="saldo-detail">${isOwed ? 'ti deve' : 'le devi'}</span>
                    </div>
                    <span class="saldo-amount ${isOwed ? 'saldo-positive' : 'saldo-negative'}">${isOwed ? '+' : '-'}${fmtE(Math.abs(b.amount))}</span>
                    <button class="btn-salda" data-pid="${pid}">Salda</button>
                </div>
            `;
        }
        html += '</div>';
    }
    container.innerHTML = html;
    
    container.querySelectorAll('.saldo-row').forEach(row => {
        row.addEventListener('click', async (e) => {
            if (e.target.classList.contains('btn-salda')) return;
            const pid = parseInt(row.dataset.pid);
            await showPersonDetail(pid);
        });
    });
    container.querySelectorAll('.btn-salda').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const pid = parseInt(btn.dataset.pid);
            await settleBalance(pid);
        });
    });
    const quickAddBtn = document.getElementById('btnQuickAddPerson');
    const quickAddInput = document.getElementById('newPersonQuickInput');
    if (quickAddBtn && quickAddInput) {
        quickAddBtn.addEventListener('click', async () => {
            const name = quickAddInput.value.trim();
            if (name) { await saveNewPerson(name); quickAddInput.value = ''; renderSaldiTab(); }
        });
        quickAddInput.addEventListener('keydown', async (e) => {
            if (e.key === 'Enter') { quickAddBtn.click(); }
        });
    }
}

async function renderGruppiTab() {
    const container = document.getElementById('condiviseTabGruppi');
    if (!container) return;
    
    let html = '<div class="condivise-add-group"><input type="text" id="newGroupQuickInput" class="sheet-input" placeholder="➕ Nuovo gruppo..."><button class="btn-small" id="btnQuickAddGroup">Crea</button></div>';
    
    if (groups.length === 0) {
        html += '<div class="condivise-empty">📭 Nessun gruppo ancora. Creane uno per spese di gruppo (es. "Viaggio a Parigi").</div>';
    } else {
        html += '<div class="condivise-list">';
        const splits = await db.sharedExpenseSplits.toArray();
        for (const g of groups) {
            const members = groupMembers.filter(m => m.groupId === g.id);
            const memberNames = members.map(m => {
                const p = people.find(pp => pp.id === m.personId);
                return p ? p.name : '?';
            }).join(', ');
            const groupSplits = splits.filter(s => s.groupId === g.id && !s.settled);
            const totalPool = groupSplits.reduce((sum, s) => sum + s.amount, 0);
            html += `
                <div class="gruppo-card" data-gid="${g.id}">
                    <div class="gruppo-header">
                        <span class="gruppo-name">👥 ${g.name}</span>
                        <span class="gruppo-total">💰 ${fmtE(totalPool)}</span>
                    </div>
                    <div class="gruppo-members">${memberNames || 'Nessun membro'}</div>
                    <div class="gruppo-expenses" id="gruppoExpenses_${g.id}" style="display:none;"></div>
                </div>
            `;
        }
        html += '</div>';
    }
    container.innerHTML = html;
    
    container.querySelectorAll('.gruppo-card').forEach(card => {
        card.addEventListener('click', async () => {
            const gid = parseInt(card.dataset.gid);
            await showGroupDetail(gid);
        });
    });
    
    const quickAddBtn = document.getElementById('btnQuickAddGroup');
    const quickAddInput = document.getElementById('newGroupQuickInput');
    if (quickAddBtn && quickAddInput) {
        quickAddBtn.addEventListener('click', async () => {
            const name = quickAddInput.value.trim();
            if (name) { await saveNewGroup(name); quickAddInput.value = ''; renderGruppiTab(); }
        });
        quickAddInput.addEventListener('keydown', async (e) => {
            if (e.key === 'Enter') { quickAddBtn.click(); }
        });
    }
}

async function saveNewGroup(name) {
    const group = { id: genId(), name, description: '', createdAt: Date.now() };
    await db.groups.put(group);
    groups.push(group);
    showToast('👥 Gruppo "' + name + '" creato', false);
}

// ===== LEDGER — VISTA DETTAGLIO PERSONA / GRUPPO =====
function backToCondiviseSummary() {
    document.getElementById('condiviseDetailView').style.display = 'none';
    document.querySelector('.condivise-tabs').style.display = 'flex';
    document.getElementById('condiviseBody').style.display = 'flex';
    document.querySelectorAll('.condivise-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === 'saldi'));
    document.querySelectorAll('.condivise-tab-content').forEach(c => c.classList.remove('active'));
    document.getElementById('condiviseTabSaldi').classList.add('active');
    renderSaldiTab();
}

async function addPersonToGroup(groupId, personId) {
    if (groupMembers.some(m => m.groupId === groupId && m.personId === personId)) {
        showToast('Persona già nel gruppo', true);
        return;
    }
    const member = { id: genId(), groupId, personId };
    await db.groupMembers.put(member);
    groupMembers.push(member);
    showToast('✅ Persona aggiunta al gruppo', false);
    showGroupDetail(groupId);
}

async function showPersonDetail(personId) {
    const p = people.find(pp => pp.id === personId);
    if (!p) return;
    const allSplits = await db.sharedExpenseSplits.where('personId').equals(personId).toArray();
    allSplits.sort((a, b) => b.createdAt - a.createdAt);
    
    let balance = 0;
    for (const s of allSplits) {
        if (s.paidBy === 'me') balance += s.amount;
        else if (s.paidBy === 'them') balance -= s.amount;
    }
    
    document.querySelector('.condivise-tabs').style.display = 'none';
    document.getElementById('condiviseBody').style.display = 'none';
    const detailView = document.getElementById('condiviseDetailView');
    detailView.style.display = 'flex';
    
    const isOwed = balance >= 0;
    document.getElementById('condiviseDetailHeader').innerHTML = `
        <div class="detail-header-name">${p.name}</div>
        <div class="detail-header-balance ${isOwed ? 'saldo-positive' : 'saldo-negative'}">
            ${isOwed ? 'Ti deve ' + fmtE(balance) : 'Le devi ' + fmtE(Math.abs(balance))}
        </div>
    `;
    
    let html = '<div class="ledger-list">';
    for (const s of allSplits) {
        const exp = await db.expenses.get(s.expenseId);
        const dateStr = exp ? (exp.date || '').split('-').reverse().slice(0,2).join('/') : '';
        const desc = exp ? exp.desc : 'Spesa eliminata';
        const isCredit = s.paidBy === 'me';
        const isSettled = s.settled;
        html += `
            <div class="ledger-row ${isSettled ? 'ledger-settled' : ''}">
                <div class="ledger-row-left">
                    <span class="ledger-date">${dateStr}</span>
                    <span class="ledger-desc">${desc}</span>
                    <span class="ledger-type">${isCredit ? '💰 credito' : '💳 debito'}</span>
                </div>
                <div class="ledger-row-right">
                    <span class="ledger-amount ${isCredit ? 'saldo-positive' : 'saldo-negative'}">${isCredit ? '+' : '-'}${fmtE(s.amount)}</span>
                    <span class="ledger-status ${isSettled ? 'ledger-status-paid' : 'ledger-status-pending'}">${isSettled ? '✅ Saldata' : '⏳ Da saldare'}</span>
                </div>
            </div>
        `;
    }
    html += '</div>';
    document.getElementById('condiviseDetailLedger').innerHTML = html;
    
    const backBtn = document.getElementById('btnBackCondiviseDetail');
    if (backBtn) {
        backBtn.onclick = backToCondiviseSummary;
    }
}

async function showGroupDetail(groupId) {
    const g = groups.find(gg => gg.id === groupId);
    if (!g) return;
    const members = groupMembers.filter(m => m.groupId === groupId);
    const memberNames = members.map(m => { const pp = people.find(p => p.id === m.personId); return pp ? pp.name : '?'; }).join(', ');
    const allSplits = await db.sharedExpenseSplits.toArray();
    const groupSplits = allSplits.filter(s => s.groupId === groupId);
    groupSplits.sort((a, b) => b.createdAt - a.createdAt);
    
    let totalPool = 0;
    for (const s of groupSplits) {
        if (!s.settled) totalPool += s.amount;
    }
    
    document.querySelector('.condivise-tabs').style.display = 'none';
    document.getElementById('condiviseBody').style.display = 'none';
    const detailView = document.getElementById('condiviseDetailView');
    detailView.style.display = 'flex';
    
    const nonMembers = people.filter(p => !members.some(m => m.personId === p.id));
    
    document.getElementById('condiviseDetailHeader').innerHTML = `
        <div class="detail-header-name">👥 ${g.name}</div>
        <div class="detail-header-members">
            Membri: ${memberNames || '<span style="color:#f59e0b">Nessun membro</span>'}
            <div class="group-add-member" style="display:flex;gap:6px;margin-top:6px;align-items:center;">
                <select id="groupAddPersonSelect" class="sheet-input" style="flex:1;font-size:13px;padding:6px 8px;">
                    <option value="">➕ Aggiungi persona...</option>
                    ${nonMembers.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
                </select>
                <button id="btnGroupAddPerson" class="btn-small" style="flex-shrink:0;">Aggiungi</button>
            </div>
        </div>
        <div class="detail-header-balance saldo-positive">Cassa comune: ${fmtE(totalPool)}</div>
    `;
    
    const addBtn = document.getElementById('btnGroupAddPerson');
    const addSelect = document.getElementById('groupAddPersonSelect');
    if (addBtn && addSelect) {
        addBtn.onclick = async () => {
            const pid = parseInt(addSelect.value);
            if (!pid) { showToast('Seleziona una persona', true); return; }
            await addPersonToGroup(groupId, pid);
        };
    }
    
    let html = '<div class="ledger-list">';
    for (const s of groupSplits) {
        const exp = await db.expenses.get(s.expenseId);
        const dateStr = exp ? (exp.date || '').split('-').reverse().slice(0,2).join('/') : '';
        const desc = exp ? exp.desc : 'Spesa eliminata';
        const person = people.find(p => p.id === s.personId);
        const pName = person ? person.name : '?';
        const isCredit = s.paidBy === 'me';
        const isSettled = s.settled;
        html += `
            <div class="ledger-row ${isSettled ? 'ledger-settled' : ''}">
                <div class="ledger-row-left">
                    <span class="ledger-date">${dateStr}</span>
                    <span class="ledger-desc">${desc}</span>
                    <span class="ledger-type">${pName} · ${isCredit ? 'credito' : 'debito'}</span>
                </div>
                <div class="ledger-row-right">
                    <span class="ledger-amount ${isCredit ? 'saldo-positive' : 'saldo-negative'}">${isCredit ? '+' : '-'}${fmtE(s.amount)}</span>
                    <span class="ledger-status ${isSettled ? 'ledger-status-paid' : 'ledger-status-pending'}">${isSettled ? '✅ Saldata' : '⏳ Da saldare'}</span>
                </div>
            </div>
        `;
    }
    html += '</div>';
    document.getElementById('condiviseDetailLedger').innerHTML = html;
    
    const backBtn = document.getElementById('btnBackCondiviseDetail');
    if (backBtn) {
        backBtn.onclick = backToCondiviseSummary;
    }
}

async function settleBalance(personId) {
    const splits = await db.sharedExpenseSplits.toArray();
    const pending = splits.filter(s => s.personId === personId && !s.settled);
    if (pending.length === 0) { showToast('Nessun debito da saldare', true); return; }
    const person = people.find(p => p.id === personId);
    if (!person) { showToast('Persona non trovata', true); return; }
    
    const credits = pending.filter(s => s.paidBy === 'me');
    const debts = pending.filter(s => s.paidBy === 'them');
    const totalCredit = credits.reduce((sum, s) => sum + s.amount, 0);
    const totalDebt = debts.reduce((sum, s) => sum + s.amount, 0);
    const month = document.getElementById('currentMonth').value;
    
    if (totalCredit > 0 && totalDebt === 0) {
        // CREDITO: l'altro mi deve → sottraggo dall'actual della spesa originale
        if (!confirm(`💰 ${person.name} ti deve ${fmtE(totalCredit)}. Saldare?`)) return;
        for (const s of credits) {
            const exp = await db.expenses.get(s.expenseId);
            if (exp) {
                exp.actual = Math.max(0, (exp.actual || 0) - s.amount);
                await db.expenses.put(exp);
            }
            s.settled = true; s.isPaid = true;
            await db.sharedExpenseSplits.put(s);
        }
        await updateUI();
        showToast('✅ Saldo con ' + person.name + ' completato', false);
    } else if (totalDebt > 0 && totalCredit === 0) {
        // DEBITO: devo io → converto spese previste in sostenute
        if (!confirm(`💳 Devi ${fmtE(totalDebt)} a ${person.name}. Saldare le spese?`)) return;
        for (const s of debts) {
            const exp = await db.expenses.get(s.expenseId);
            if (exp && exp.planned > 0 && exp.actual === 0) {
                exp.actual = exp.planned;
                exp.planned = 0;
                await db.expenses.put(exp);
            }
            s.settled = true; s.isPaid = true;
            await db.sharedExpenseSplits.put(s);
        }
        await updateUI();
        showToast('✅ Debito verso ' + person.name + ' saldato', false);
    } else {
        // MISTO: crediti e debiti con la stessa persona
        const net = totalCredit - totalDebt;
        const msg = net >= 0
            ? `💰 ${person.name} ti deve netto ${fmtE(net)}. Saldare?`
            : `💳 Devi netto ${fmtE(Math.abs(net))} a ${person.name}. Saldare?`;
        if (!confirm(msg)) return;
        for (const s of credits) {
            const exp = await db.expenses.get(s.expenseId);
            if (exp) { exp.actual = Math.max(0, (exp.actual || 0) - s.amount); await db.expenses.put(exp); }
            s.settled = true; s.isPaid = true;
            await db.sharedExpenseSplits.put(s);
        }
        for (const s of debts) {
            const exp = await db.expenses.get(s.expenseId);
            if (exp && exp.planned > 0 && exp.actual === 0) { exp.actual = exp.planned; exp.planned = 0; await db.expenses.put(exp); }
            s.settled = true; s.isPaid = true;
            await db.sharedExpenseSplits.put(s);
        }
        await updateUI();
        showToast('✅ Saldo con ' + person.name + ' completato', false);
    }
    renderSaldiTab();
}

async function runIaMonthAnalysis() {
    const currentMonth = document.getElementById('currentMonth').value;
    if (!currentMonth) { showToast('Nessun mese selezionato', true); return; }

    const respBox = document.getElementById('iaMonthResponse');
    const btn = document.getElementById('btnIaMonthAnalysis');
    if (!respBox) return;

    const incomes = await getIncomesForMonth(currentMonth);
    const expenses = await db.expenses.where('month').equals(currentMonth).toArray();
    const totalIncome = incomes.reduce((s, i) => s + i.amount, 0);
    const totalActual = expenses.reduce((s, e) => s + e.actual, 0);
    const totalPlanned = expenses.reduce((s, e) => s + e.planned, 0);
    const savings = totalIncome - totalActual;
    const catSums = {};
    expenses.forEach(e => { catSums[e.category] = (catSums[e.category] || 0) + e.actual; });
    const catLines = Object.entries(catSums)
        .sort((a, b) => b[1] - a[1])
        .map(([cat, val]) => `  - ${cat}: ${fmtEPlain(val)}`).join('\n');
    const pendingCount = expenses.filter(e => e.planned > 0 && e.actual === 0).length;

    const dataText = [
        `Mese: ${currentMonth}`,
        `Entrate totali: ${fmtEPlain(totalIncome)}`,
        `Spese sostenute: ${fmtEPlain(totalActual)}`,
        `Spese previste: ${fmtEPlain(totalPlanned)}`,
        `Risparmio netto: ${fmtEPlain(savings)}`,
        `Budget rimasto: ${fmtEPlain(totalPlanned - totalActual)}`,
        `Uscite in attesa di pagamento: ${pendingCount}`,
        `\nDettaglio spese per categoria:\n${catLines || '  (nessuna spesa)'}`,
        `\nEntrate del mese:\n${incomes.map(i => `  - ${i.desc}: ${fmtEPlain(i.amount)}`).join('\n') || '  (nessuna entrata)'}`
    ].join('\n');

    const prompt = `Agisci come un consulente finanziario. Lingua: Italiano. Analizza i dati del mese corrente. ${dataText}Fornisci un resoconto conciso (max 5 righe) su: 1) stato di salute del mese, 2) categoria più critica, 3) consiglio pratico per migliorare.`;

    await callAIEndpoint(prompt, 'iaMonthResponse', 'btnIaMonthAnalysis');

    // Salva automaticamente nelle note IA del mese
    if (respBox && respBox.innerText && !respBox.innerText.startsWith('❌') && !respBox.innerText.startsWith('🤖')) {
        const iaNotesField = document.getElementById('iaNotes');
        if (iaNotesField) {
            iaNotesField.value = respBox.innerText;
            await saveNotes();
        }
    }
}

async function renderArchiveModalContent() {
    archiveModalCharts.forEach(c => c.destroy());
    archiveModalCharts = [];
    const container = document.getElementById('archiveModalBody');
    if (!container) return;
    let months = await db.months.toArray();
    if (months.length === 0) {
        container.innerHTML = '<div style="text-align:center;color:#94a3b8;padding:30px 0;font-size:13px;">Nessun mese archiviato.</div>';
        return;
    }
    months.sort((a,b) => b.month.localeCompare(a.month));
    container.innerHTML = '';
    for (const m of months) {
        const sec = document.createElement('div');
        sec.className = 'archive-month-section';
        const monthLabel = m.month.split('-').reverse().join('/');
        const savings = (m.totalIncome || 0) - (m.totalActual || 0);
        sec.innerHTML = `
            <div class="archive-month-header">${monthLabel}</div>
            <div class="archive-month-chart-wrap"><canvas></canvas></div>
            <div class="archive-month-data">
                <div class="history-card">
                    <div class="history-card-left">
                        <div class="history-card-month">${monthLabel}</div>
                        <div class="history-card-savings">Risparmio: <span class="history-card-savings-val ${savings>=0?'positive':'negative'}">${fmtN(savings)}</span></div>
                    </div>
                    <div class="history-card-right">
                        <span class="history-card-income">+${fmtN(m.totalIncome||0)}</span>
                        <span class="history-card-spent">-${fmtN(m.totalActual||0)}</span>
                    </div>
                </div>
            </div>
        `;
        container.appendChild(sec);
        const canvas = sec.querySelector('canvas');
        const ctx = canvas.getContext('2d');
        const chart = new Chart(ctx, {
            type:'bar',
            data:{labels:['Entrate','Budget','Speso'],datasets:[{data:[m.totalIncome||0,m.totalPlanned||0,m.totalActual||0],backgroundColor:['#10b981','#f97316','#ef4444'],borderRadius:4}]},
            options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{enabled:false}},scales:{x:{grid:{display:false},ticks:{font:{size:11}}},y:{beginAtZero:true,grid:{color:'rgba(0,0,0,0.05)'},ticks:{font:{size:10}}}}}
        });
        archiveModalCharts.push(chart);
    }
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

    const historyHub = document.getElementById('historyActionHub');
    if (historyHub) {
        historyHub.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-action]');
            if (!btn) return;
            if (btn.dataset.action === 'ia-analisi') openIaModal();
            else if (btn.dataset.action === 'archivio') openArchiveModal();
        });
    }

    const meseActions = document.getElementById('mese-action-hub');
    if (meseActions) {
        meseActions.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-action]');
            if (!btn) return;
            if (btn.dataset.action === 'search') openSearchPopup();
            else if (btn.dataset.action === 'ia') openIaMonthPopup();
            else if (btn.dataset.action === 'condivise') openCondivisePopup();
        });
    }
    
    // Condivise tabs
    const condiviseTabs = document.querySelector('#popup-spese-condivise .condivise-tabs');
    if (condiviseTabs) {
        condiviseTabs.addEventListener('click', (e) => {
            const tab = e.target.closest('.condivise-tab');
            if (tab) switchCondiviseTab(tab.dataset.tab);
        });
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

        settings: await db.settings.toArray(),
        syncState: await db.syncState.toArray(),
        people: await db.people.toArray(),
        groups: await db.groups.toArray(),
        groupMembers: await db.groupMembers.toArray(),
        sharedExpenseSplits: await db.sharedExpenseSplits.toArray()
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
                await db.people.clear(); await db.groups.clear(); await db.groupMembers.clear(); await db.sharedExpenseSplits.clear();
                await db.categories.bulkPut(data.categories);
                if (data.annual_deadlines) await db.annualDeadlines.bulkPut(data.annual_deadlines);
                if (data.income) await db.income.bulkPut(data.income);
                if (data.expenses) await db.expenses.bulkPut(data.expenses);
                if (data.months) await db.months.bulkPut(data.months);
                if (data.people) await db.people.bulkPut(data.people);
                if (data.groups) await db.groups.bulkPut(data.groups);
                if (data.groupMembers) await db.groupMembers.bulkPut(data.groupMembers);
                if (data.sharedExpenseSplits) await db.sharedExpenseSplits.bulkPut(data.sharedExpenseSplits);
                alert("✅ Ripristino completato!");
                await initCategories(); await loadAnnualDeadlines(); await loadPeopleGroups(); await loadMonthData(); checkDatabaseHealth();
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



