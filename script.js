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
    'investimenti-tab': 'Investimenti',
    'future-tab': 'Futuro',
    'settings-tab': 'Impostazioni'
};

// Responsive helper
function isDesktop() { return window.innerWidth >= 768; }

// Dexie rimosso, usiamo l'adapter window.db in supabase-adapter.js

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
    await syncSharedDebts();
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
            if (data.investments) await db.investments.bulkPut(data.investments);
            if (data.investmentMovements) await db.investmentMovements.bulkPut(data.investmentMovements);
            
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
const FA_ICON_MAP = {
    Alimentari: 'fa-basket-shopping', "Bolletta Acqua": 'fa-droplet', "Bolletta Condominio": 'fa-building',
    "Bolletta Gas": 'fa-fire', "Bolletta Luce": 'fa-bolt', "Bolletta Rifiuti": 'fa-trash',
    "Bolletta Telefonia": 'fa-phone', "Igiene e Pulizia": 'fa-pump-soap', Mutuo: 'fa-house-chimney',
    "Carburante Auto": 'fa-gas-pump', "Carburante Moto": 'fa-motorcycle', Manutenzioni: 'fa-screwdriver-wrench',
    "Tasse Auto": 'fa-file-invoice-dollar', "Tasse Moto": 'fa-file-invoice-dollar', Abbigliamento: 'fa-shirt',
    Cane: 'fa-paw', Formazione: 'fa-book-open', "Imprevisti e Svago": 'fa-champagne-glasses',
    Sanitarie: 'fa-briefcase-medical', Varie: 'fa-box'
};
const MACRO_FA = { casa_utenze: 'fa-house', veicoli: 'fa-car', spese_svago: 'fa-cart-shopping' };
function faIconFor(cat, macro) {
    return FA_ICON_MAP[cat] || MACRO_FA[macro] || 'fa-tag';
}
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
let analysisPeriod = '6m';
let customRange = null;
let aiInsightPending = false;
let anomalyTimer = null;

 // ===== BOTTOM SHEET SLIDER STATE =====
 let sheetCurrentMacroGroup = null; // Tracks which macro group opened the sheet

 // ===== SPESE CONDIVISE STATE =====
 let people = [];
 let groups = [];
 let groupMembers = [];

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

// Tema cromatico per il bottom sheet delle macro-categorie
const MACRO_THEME = {
    casa_utenze: { accent: '#2a9d8f', tint: 'rgba(42,157,143,0.12)', border: 'rgba(42,157,143,0.30)' },
    veicoli: { accent: '#7bc043', tint: 'rgba(123,192,67,0.12)', border: 'rgba(123,192,67,0.30)' },
    spese_svago: { accent: '#6f42c1', tint: 'rgba(111,66,193,0.12)', border: 'rgba(111,66,193,0.30)' }
};

// Inizializzazione valori UI
const dateNow = new Date();
let initYear = dateNow.getFullYear(), initMonth = dateNow.getMonth() + 1;
document.getElementById('currentMonth').value = `${initYear}-${String(initMonth).padStart(2,'0')}`;
const initMonthVal = `${initYear}-${String(initMonth).padStart(2,'0')}`;
if (document.getElementById('futureCalMonthM')) document.getElementById('futureCalMonthM').value = initMonthVal;
document.getElementById('expDate').value = dateNow.toISOString().slice(0,10);
const iaProviderEl = document.getElementById('iaProviderSelect');
if (iaProviderEl && localStorage.getItem('ia_provider')) iaProviderEl.value = localStorage.getItem('ia_provider');
const geminiKeyEl = document.getElementById('geminiApiKeyInput');
if (geminiKeyEl && localStorage.getItem('gemini_api_key')) geminiKeyEl.value = localStorage.getItem('gemini_api_key');

// Aggiorna il display del mese nella pillola
function updateMonthDisplay() {
    const monthInput = document.getElementById('currentMonth');
    const display = document.getElementById('currentMonthDisplay');
    const heroDisplay = document.getElementById('heroMonthDisplay');
    if (!monthInput || !display) return;
    const [year, month] = monthInput.value.split('-');
    const monthNames = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
    const monthName = monthNames[parseInt(month, 10) - 1] || '';
    const label = `${monthName} ${year}`;
    display.textContent = label;
    if (heroDisplay) heroDisplay.textContent = label;
}

// Aggiorna il display del mese quando cambia la selezione
function setupMonthNavigation() {
    const pill = document.getElementById('monthSelectorPill');
    const input = document.getElementById('currentMonth');
    const prevBtn = document.getElementById('btnPrevMonth');
    const nextBtn = document.getElementById('btnNextMonth');
    if (!pill || !input) return;

    const openPicker = () => {
        if (typeof input.showPicker === 'function') { try { input.showPicker(); } catch (e) { input.click(); } }
        else input.click();
    };
    pill.addEventListener('click', (e) => { if (e.target.closest('.month-arrow')) return; openPicker(); });
    pill.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPicker(); } });
    const heroPill = document.getElementById('heroMonthPill');
    if (heroPill) {
        heroPill.addEventListener('click', (e) => { e.stopPropagation(); openPicker(); });
        heroPill.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPicker(); } });
    }

    const shiftMonth = (delta) => {
        const [y, m] = input.value.split('-').map(Number);
        const d = new Date(y, m - 1 + delta, 1);
        input.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        updateMonthDisplay();
        loadMonthData();
    };
    if (prevBtn) prevBtn.addEventListener('click', (e) => { e.stopPropagation(); shiftMonth(-1); });
    if (nextBtn) nextBtn.addEventListener('click', (e) => { e.stopPropagation(); shiftMonth(1); });
}

// =====================================================================
// ACCESSIBILITA' MODAL/SHEET: Esc, focus trap, ripristino focus
// =====================================================================
function setupModalAccessibility() {
    let lastFocus = null;
    const SHEET_MAP = { sheetOverlay: 'bottomSheet', incomeSheetOverlay: 'incomeBottomSheet', futureSheetOverlay: 'futureBottomSheet' };

    function currentOverlay() {
        return document.querySelector('.popup-overlay.active, #sheetOverlay.open, #incomeSheetOverlay.open, #futureSheetOverlay.open');
    }

    function focusScope() {
        const overlay = currentOverlay();
        if (!overlay) return document.querySelector('#bottomSheet.open, #incomeBottomSheet.open, #futureBottomSheet.open');
        if (overlay.classList.contains('popup-overlay')) return overlay;
        const sheetId = SHEET_MAP[overlay.id];
        return sheetId ? document.getElementById(sheetId) : overlay;
    }

    function firstFocusable(root) {
        if (!root) return null;
        const el = root.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        return el;
    }

    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        const open = currentOverlay();
        if (!open) return;
        e.preventDefault();
        if (open.classList.contains('popup-overlay')) {
            const btn = open.querySelector('.popup-close');
            if (btn) btn.click();
        } else {
            open.click();
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Tab') return;
        const scope = focusScope();
        if (!scope) return;
        const focusables = scope.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (!focusables.length) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });

    const mo = new MutationObserver(() => {
        const open = currentOverlay();
        if (open) {
            if (open.dataset.a11yFocused === '1') return;
            open.dataset.a11yFocused = '1';
            const target = firstFocusable(focusScope());
            if (target) { lastFocus = document.activeElement; target.focus(); }
        } else {
            document.querySelectorAll('.popup-overlay, #sheetOverlay, #incomeSheetOverlay, #futureSheetOverlay, #bottomSheet, #incomeBottomSheet, #futureBottomSheet')
                .forEach(el => delete el.dataset.a11yFocused);
            if (lastFocus && lastFocus.focus && document.activeElement === document.body) lastFocus.focus();
            lastFocus = null;
        }
    });
    mo.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] });
}

// =====================================================================
// TABLIST A11Y: frecce + Home/End + aria-selected
// =====================================================================
function setupTablistA11y() {
    document.querySelectorAll('[role="tablist"]').forEach(tablist => {
        const tabs = Array.from(tablist.querySelectorAll('button'));
        if (!tabs.length) return;
        tabs.forEach(t => t.setAttribute('role', 'tab'));
        const sync = () => tabs.forEach(t => t.setAttribute('aria-selected', t.classList.contains('active') ? 'true' : 'false'));
        sync();
        tablist.addEventListener('click', sync);
        tablist.addEventListener('keydown', (e) => {
            const idx = tabs.indexOf(document.activeElement);
            if (idx === -1) return;
            let next = null;
            if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = tabs[(idx + 1) % tabs.length];
            else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = tabs[(idx - 1 + tabs.length) % tabs.length];
            else if (e.key === 'Home') next = tabs[0];
            else if (e.key === 'End') next = tabs[tabs.length - 1];
            if (next) { e.preventDefault(); next.focus(); next.click(); }
        });
    });
}

// =====================================================================
// INLINE ACTIONS — delegation (CSP: zero onclick inline, 2026-08-19)
// =====================================================================
function setupInlineActions() {
    document.addEventListener('click', (e) => {
        const el = e.target.closest('[data-act], [data-act-close], [data-act-stop]');
        if (!el) return;
        if (el.dataset.actStop) return;
        let fn;
        if (el.dataset.actClose) {
            fn = window[el.dataset.actClose];
            if (typeof fn === 'function') fn();
            return;
        }
        fn = window[el.dataset.act];
        if (typeof fn !== 'function') return;
        let args = [];
        try { if (el.dataset.args) args = JSON.parse(el.dataset.args); } catch { args = []; }
        if (el.dataset.var) args.push(window[el.dataset.var]);
        if (el.dataset.el) args.push(el);
        fn(...args);
    });
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        if (e.target.closest('button, input, select, textarea, a[href]')) return;
        const el = e.target.closest('[role="button"][tabindex]');
        if (!el) return;
        e.preventDefault();
        el.click();
    });
    document.querySelectorAll('[data-ai-refresh]').forEach((b) => {
        b.addEventListener('click', (e) => { e.stopPropagation(); generateInsightCard(true); });
    });
    document.querySelectorAll('[data-import-trigger]').forEach((b) => {
        b.addEventListener('click', () => { document.getElementById('importFileInput')?.click(); });
    });
}

document.addEventListener('DOMContentLoaded', () => {
    const monthInputEl = document.getElementById('currentMonth');
    if (monthInputEl) {
        monthInputEl.addEventListener('change', updateMonthDisplay);
    }
    setupMonthNavigation();
    setupAnalysisPeriodSelector();
    setupModalAccessibility();
    setupTablistA11y();
    setupInlineActions();
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
    populateFreeModelSelect();
    initPWA();
    // Aggiorna il display del mese nella pillola all'avvio
    updateMonthDisplay();
    renderRipetizioni();
    await loadPeopleGroups();
    await ensureCurrentUserPerson();
    await migrateSharedExpensesV2();
    setupSharedToggle();
    setupSharedPanelDesktop();
    handleJoinGroupFromUrl();
    await syncSharedDebts();
    window.addEventListener('online', syncSharedDebts);
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
function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(c => { c.classList.remove('active'); c.classList.add('hidden'); });
    document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.querySelectorAll('.top-nav-link').forEach(l => l.classList.remove('active'));
    const target = document.getElementById(tabId);
    target.classList.remove('hidden');
    target.classList.add('active');
    document.querySelectorAll('#settings-tab .popup-overlay.active').forEach(p => p.classList.remove('active'));
    document.body.classList.remove('sheet-open', 'popup-open');
    const topLink = document.querySelector(`.top-nav-link[data-tab="${tabId}"]`);
    if (topLink) topLink.classList.add('active');
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
    if (tabId === 'history-tab') {
        if (window.innerWidth < 768) { renderAnalisiMobile(); }
        else { renderGlobalHistory(); renderTradingChart(); initChartToggle(); }
    }
    if (tabId === 'future-tab') { updateFutureDashboard(); renderSavingsGoals(); }
    if (tabId === 'investimenti-tab') { renderInvestments(); }
    if (tabId !== 'history-tab') stopAnomalyCarousel();
    const customPopup = document.getElementById('customRangePopup');
    if (customPopup) customPopup.classList.remove('active');
    window.scrollTo(0, 0);
}

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
let editingExpenseId = null;

function openTransactionSheet(categoryName) {
    console.log("Card cliccata:", categoryName);
    sheetSelectedCategory = categoryName;
    sheetTransactionType = 'actual';
    const overlay = document.getElementById('sheetOverlay');
    const sheet = document.getElementById('bottomSheet');
    const title = document.getElementById('selected-category-title');
    const amountInput = document.getElementById('amountInput');
    const sheetDate = document.getElementById('sheetDate');
    const toggleOptions = document.querySelectorAll('.toggle-option');
    
if (overlay && sheet && title) {
        title.textContent = categoryName;
        document.body.classList.add('sheet-open');
        document.body.style.overflow = 'hidden';
        overlay.classList.add('open');
        sheet.classList.add('open');
        
        // Reset inputs
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
        document.body.style.overflow = '';
        overlay.classList.remove('open');
        sheet.classList.remove('open');
        sheet.style.transform = '';
        sheet.classList.remove('dragging');
    }
    sheetSelectedCategory = null;
    sheetTransactionType = 'actual';
    sheetCurrentMacroGroup = null;
    editingExpenseId = null;
    clearReceiptPreview();

    // Reset title color from macro theme
    const sheetTitleEl = document.getElementById('selected-category-title');
    if (sheetTitleEl) sheetTitleEl.style.color = '';

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
    const shPersonSelect = document.getElementById('sharedPersonSelect');
    if (shToggle) shToggle.checked = false;
    if (shPanel) shPanel.classList.remove('active');
    if (shPersonSelect) shPersonSelect.value = '';
    const shDetailFields = document.getElementById('sharedDetailFields');
    if (shDetailFields) shDetailFields.innerHTML = '';
    resetSharedSplitState();
}

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
    const sheetDate = document.getElementById('sheetDate');
    const sheetNote = document.getElementById('sheetNote');
    const toggleOptions = document.querySelectorAll('.toggle-option');

    if (!overlay || !sheet) return;

    document.body.classList.add('sheet-open');
    document.body.style.overflow = 'hidden';
    overlay.classList.add('open');
    sheet.classList.add('open');

    // Slide directly to input view, hide back button (category not changeable in edit)
    if (slider) slider.style.transform = 'translateX(-100%)';
    if (backBtn) backBtn.style.display = 'none';

    if (sheetTitle) sheetTitle.textContent = exp.category;

    // Pre-fill amount
    const amount = exp.planned || exp.actual || 0;
    const amountInput = document.getElementById('amountInput');
    if (amountInput) amountInput.value = amount.toFixed(2).replace('.', ',');

    // Pre-fill date
    if (sheetDate && exp.date) {
        sheetDate.value = exp.date;
    }

    // Pre-fill note
    if (sheetNote && exp.desc) {
        sheetNote.value = exp.desc;
    }

    // Set toggle type
    toggleOptions.forEach(opt => {
        opt.classList.toggle('active', opt.dataset.type === sheetTransactionType);
    });

    // Reset recurring + shared toggles in edit mode
    const recToggle = document.getElementById('recurringToggle');
    const recContainer = document.getElementById('recurringUntilContainer');
    const recUntil = document.getElementById('recurringUntil');
    if (recToggle) recToggle.checked = false;
    if (recContainer) recContainer.classList.remove('active');
    if (recUntil) recUntil.value = '';
    const shToggle = document.getElementById('sharedToggle');
    const shPanel = document.getElementById('sharedPanel');
    if (shToggle) shToggle.checked = false;
    if (shPanel) shPanel.classList.remove('active');

    sheetCurrentMacroGroup = null;
}

// =====================================================================
// BOTTOM SHEET NUOVA ENTRATA
// =====================================================================
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
        document.body.style.overflow = '';
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
        const rendicontoPopup = document.getElementById('popup-rendiconto');
        if (rendicontoPopup && rendicontoPopup.classList.contains('active')) {
            await renderIncomeList(document.getElementById('currentMonth').value);
        }
        showToast('Entrata aggiunta', false);
    } catch (err) {
        console.error('[DB] Error adding income from sheet:', err);
        showToast('Errore salvataggio', true);
        currentData.income.pop();
    }
}

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
        if (clone.month === document.getElementById('currentMonth')?.value) currentData.expenses.push(clone);
        await db.expenses.put(clone);
    }
}

// =====================================================================
// SHARED EXPENSES V2 - Helpers & state
// =====================================================================
function genId() {
    return Date.now() * 1000 + Math.floor(Math.random() * 1000);
}
function generateInviteToken() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let out = '';
    for (let i = 0; i < 16; i++) out += chars.charAt(Math.floor(Math.random() * chars.length));
    return out;
}
function getInitials(name) {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
function getAvatarColor(name) {
    const palette = ['#ef4444','#f97316','#f59e0b','#84cc16','#10b981','#06b6d4','#3b82f6','#8b5cf6','#d946ef','#f43f5e'];
    let hash = 0;
    for (let i = 0; i < (name || '').length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return palette[Math.abs(hash) % palette.length];
}
async function ensureCurrentUserPerson() {
    if (!window.supabaseUser) return null;
    const user = window.supabaseUser;
    let p = people.find(pp => pp.user_id === user.id);
    if (p) return p;
    const email = user.email || '';
    const name = email.split('@')[0] || 'Me';
    p = { id: genId(), name, email, user_id: user.id, createdAt: Date.now() };
    await db.people.put(p);
    people.push(p);
    return p;
}
function parseAmountInput(raw) {
    const val = parseFloat(String(raw || '').trim().replace(',', '.'));
    return isFinite(val) && val >= 0 ? val : 0;
}

// =====================================================================
// SPESE CONDIVISE - Data Layer
// =====================================================================
async function loadPeopleGroups() {
    try {
        const mergeById = (cloud, outbox, pk) => {
            const byId = new Map();
            for (const c of cloud) byId.set(c[pk], c);
            for (const o of outbox) if (o && o[pk] != null && !byId.has(o[pk])) byId.set(o[pk], o);
            return [...byId.values()];
        };
        const outboxPeople = (typeof window.readOutbox === 'function') ? window.readOutbox('people') : [];
        const outboxGroups = (typeof window.readOutbox === 'function') ? window.readOutbox('groups') : [];
        const outboxMembers = (typeof window.readOutbox === 'function') ? window.readOutbox('group_members') : [];
        people = mergeById(await db.people.toArray(), outboxPeople, 'id');
        groups = mergeById(await db.groups.toArray(), outboxGroups, 'id');
        groupMembers = mergeById(await db.groupMembers.toArray(), outboxMembers, 'id');
        if (window.supabaseUser) {
            for (const p of people) {
                if (!p.user_id) {
                    p.user_id = window.supabaseUser.id;
                    await db.people.put(p);
                }
            }
        }
    } catch (err) {
        console.error('[DB] Errore caricamento persone/gruppi:', err);
        people = []; groups = []; groupMembers = [];
    }
}

async function migrateSharedExpensesV2() {
    const migrated = await db.settings.get('sharedExpensesV2Migrated');
    if (migrated && migrated.value) return;
    try {
        const oldSplits = await db.sharedExpenseSplits.toArray();
        if (!oldSplits.length) {
            await db.settings.put({ key: 'sharedExpensesV2Migrated', value: '1' });
            return;
        }
        const byExpense = {};
        for (const s of oldSplits) {
            byExpense[s.expenseId] = byExpense[s.expenseId] || [];
            byExpense[s.expenseId].push(s);
        }
        for (const expenseId of Object.keys(byExpense)) {
            const splits = byExpense[expenseId];
            const exp = await db.expenses.get(parseInt(expenseId));
            const totalAmount = splits.reduce((sum, s) => sum + (s.amount || 0), 0);
            const representative = splits[0];
            const sharedExpenseId = genId();
            await db.sharedExpenses.put({
                id: sharedExpenseId,
                expense_id: parseInt(expenseId),
                group_id: representative.groupId || null,
                total_amount: totalAmount,
                split_method: representative.splitType === 'equal' ? 'equal' : 'exact',
                created_by: window.supabaseUser ? window.supabaseUser.id : null,
                created_at: representative.createdAt || Date.now()
            });
            for (const s of splits) {
                const p = people.find(pp => pp.id === s.personId);
                await db.sharedExpenseParticipants.put({
                    id: genId(),
                    shared_expense_id: sharedExpenseId,
                    person_id: s.personId,
                    participant_name: p ? p.name : 'Sconosciuto',
                    share_amount: s.amount || 0,
                    paid_amount: s.paidBy === 'me' ? totalAmount : 0,
                    split_value: null,
                    created_at: s.createdAt || Date.now()
                });
            }
        }
        await db.settings.put({ key: 'sharedExpensesV2Migrated', value: '1' });
        showToast('Spese condivise migrate al nuovo formato', false);
    } catch (err) {
        console.error('[Migration] Errore migrazione spese condivise:', err);
    }
}

async function createPerson(name, email) {
    const cleanName = (name || '').trim();
    const cleanEmail = (email || '').trim().toLowerCase();
    if (!cleanName) { showToast('Inserisci un nome', true); return null; }
    let userId = null;
    if (cleanEmail && window.supabaseUser && window.supabaseUser.email === cleanEmail) {
        userId = window.supabaseUser.id;
    }
    const person = { id: genId(), name: cleanName, email: cleanEmail, user_id: userId, createdAt: Date.now() };
    await db.people.put(person);
    people.push(person);
    populateSharedPersonSelect(document.getElementById('sharedPersonSelect'));
    populateSharedPersonSelect(document.getElementById('sharedPersonDesktop'));
    showToast('👤 ' + cleanName + ' aggiunto', false);
    return person;
}

async function createGroup(name, description) {
    const cleanName = (name || '').trim();
    if (!cleanName) { showToast('Inserisci un nome gruppo', true); return null; }
    const group = {
        id: genId(),
        name: cleanName,
        description: (description || '').trim(),
        invite_token: generateInviteToken(),
        created_by: window.supabaseUser ? window.supabaseUser.id : null,
        createdAt: Date.now()
    };
    await db.groups.put(group);
    groups.push(group);
    const me = await ensureCurrentUserPerson();
    if (me) await addPersonToGroup(group.id, me.id);
    showToast('Gruppo "' + cleanName + '" creato', false);
    return group;
}

function getGroupInviteLink(group) {
    if (!group || !group.invite_token) return '';
    return window.location.origin + window.location.pathname + '?join_group=' + encodeURIComponent(group.invite_token);
}

async function joinGroupByToken(token) {
    if (!window.supabaseUser) { showToast('Accedi per unirti a un gruppo', true); return null; }
    try {
        const me = await ensureCurrentUserPerson();
        const memberName = me ? me.name : null;
        const { data, error } = await supabaseClient.rpc('join_group_with_token', { p_token: token, p_member_name: memberName });
        if (error) { showToast(error.message || 'Invito non valido', true); return null; }
        const groupId = data && data[0] ? data[0].group_id : null;
        if (!groupId) { showToast('Invito non valido', true); return null; }
        await loadPeopleGroups();
        const existingByUser = groupMembers.find(m => m.groupId === groupId && m.user_id === window.supabaseUser.id);
        if (existingByUser) {
            if (me && !existingByUser.personId) {
                existingByUser.personId = me.id;
                existingByUser.member_name = me.name;
                await db.groupMembers.put(existingByUser);
            }
        } else if (me) {
            await addPersonToGroup(groupId, me.id);
        }
        showToast('Ti sei unito al gruppo', false);
        return groupId;
    } catch (err) {
        console.error('[Groups] Errore join:', err);
        showToast('Errore nell\'unione al gruppo', true);
        return null;
    }
}

function getGroupMembersWithPeople(groupId) {
    return groupMembers
        .filter(m => m.groupId === groupId)
        .map(m => {
            const p = people.find(pp => pp.id === m.personId) || people.find(pp => pp.user_id === m.user_id);
            return {
                ...m,
                person: p || { name: m.member_name || 'Sconosciuto' }
            };
        });
}

async function loadSharedExpenseParticipants(sharedExpenseId) {
    return db.sharedExpenseParticipants.where('shared_expense_id').equals(sharedExpenseId).toArray();
}

async function loadSharedExpensesForPerson(personId) {
    const participants = await db.sharedExpenseParticipants.where('person_id').equals(personId).toArray();
    const ids = [...new Set(participants.map(p => p.shared_expense_id))];
    const out = [];
    for (const id of ids) {
        const se = await db.sharedExpenses.get(id);
        if (se) out.push(se);
    }
    return out;
}

async function calculateBalances() {
    const participants = await db.sharedExpenseParticipants.toArray();
    const me = await ensureCurrentUserPerson();
    const map = {};
    for (const part of participants) {
        if (part.settled) continue;
        if (!map[part.person_id]) {
            const p = people.find(pp => pp.id === part.person_id);
            map[part.person_id] = {
                id: part.person_id,
                name: p ? p.name : (part.participant_name || 'Sconosciuto'),
                user_id: p ? p.user_id : null,
                paid: 0,
                share: 0
            };
        }
        map[part.person_id].paid += part.paid_amount || 0;
        map[part.person_id].share += part.share_amount || 0;
    }
    const result = Object.values(map).map(p => ({ ...p, net: p.paid - p.share })).sort((a, b) => b.net - a.net);
    return { me, list: result };
}

async function calculateGroupBalances(groupId) {
    const shared = (await db.sharedExpenses.toArray()).filter(se => se.group_id === groupId);
    const map = {};
    for (const se of shared) {
        const parts = await loadSharedExpenseParticipants(se.id);
        for (const part of parts) {
            if (part.settled) continue;
            if (!map[part.person_id]) {
                const p = people.find(pp => pp.id === part.person_id);
                map[part.person_id] = {
                    id: part.person_id,
                    name: p ? p.name : (part.participant_name || 'Sconosciuto'),
                    paid: 0,
                    share: 0
                };
            }
            map[part.person_id].paid += part.paid_amount || 0;
            map[part.person_id].share += part.share_amount || 0;
        }
    }
    return Object.values(map).map(p => ({ ...p, net: p.paid - p.share })).sort((a, b) => b.net - a.net);
}

function getSimplifiedDebts(balances) {
    const creditors = balances.filter(b => b.net > 0.001).sort((a, b) => b.net - a.net);
    const debtors = balances.filter(b => b.net < -0.001).sort((a, b) => a.net - b.net);
    const txs = [];
    let i = 0, j = 0;
    while (i < debtors.length && j < creditors.length) {
        const debt = Math.abs(debtors[i].net);
        const credit = creditors[j].net;
        const amount = Math.min(debt, credit);
        if (amount > 0.001) {
            txs.push({ from: debtors[i], to: creditors[j], amount });
        }
        debtors[i].net += amount;
        creditors[j].net -= amount;
        if (Math.abs(debtors[i].net) < 0.001) i++;
        if (Math.abs(creditors[j].net) < 0.001) j++;
    }
    return txs;
}

async function saveSharedExpenseV2(expenseId, totalAmount, groupId, participantRecords, splitMethod) {
    const sharedExpenseId = genId();
    await db.sharedExpenses.put({
        id: sharedExpenseId,
        expense_id: expenseId,
        group_id: groupId || null,
        total_amount: totalAmount,
        split_method: splitMethod || 'equal',
        created_by: window.supabaseUser ? window.supabaseUser.id : null,
        created_at: Date.now()
    });
    for (const r of participantRecords) {
        const p = people.find(pp => pp.id === r.personId);
        await db.sharedExpenseParticipants.put({
            id: genId(),
            shared_expense_id: sharedExpenseId,
            person_id: r.personId,
            participant_name: p ? p.name : (r.name || 'Sconosciuto'),
            share_amount: r.shareAmount,
            paid_amount: r.paidAmount,
            split_value: r.splitValue != null ? r.splitValue : null,
            settled: false,
            created_at: Date.now()
        });
    }
    await pushSharedDebts(sharedExpenseId, groupId, participantRecords);
}

async function pushSharedDebts(sharedExpenseId, groupId, participantRecords) {
    if (!window.supabaseUser) return;
    const meId = getSharedMeId();
    const payerRec = participantRecords.find(r => r.paidAmount > 0);
    const payerP = payerRec ? people.find(pp => pp.id === payerRec.personId) : null;
    const payerUid = payerP ? (payerP.user_id || (groupId ? ((groupMembers.find(m => m.groupId === groupId && m.personId === payerRec.personId) || {}).user_id || '') : '')) : '';
    if (!payerUid) return;
    const now = Date.now();
    for (const r of participantRecords) {
        if (r.personId === (payerRec ? payerRec.personId : null)) continue;
        const owed = Math.round((r.shareAmount - (r.paidAmount || 0)) * 100) / 100;
        if (owed <= 0) continue;
        const p = people.find(pp => pp.id === r.personId);
        if (!p) continue;
        const uid = p.user_id || (groupId ? ((groupMembers.find(m => m.groupId === groupId && m.personId === r.personId) || {}).user_id || '') : '');
        if (!uid || uid === payerUid) continue;
        await db.sharedDebts.put({
            id: genId(),
            creditor_user_id: payerUid,
            debtor_user_id: uid,
            creditor_name: payerP ? payerP.name : 'Io',
            debtor_name: p.name,
            amount: owed,
            description: '',
            category: '',
            expense_id: String(sharedExpenseId),
            status: 'open',
            created_at: now
        });
    }
}

async function syncSharedDebts() {
    if (!window.supabaseUser) return;
    const uid = window.supabaseUser.id;
    try {
        const debts = await db.sharedDebts.toArray();
        const openForMe = debts.filter(d => d.status === 'open' && d.debtor_user_id === uid);
        if (openForMe.length) {
            const month = document.getElementById('currentMonth')?.value;
            const all = await db.expenses.toArray();
            // Cleanup legacy: duplicati materializzati prima della colonna debtId
            // (senza debtId il dedupe falliva e ogni apertura ricreava le spese)
            const legacyDupes = all.filter(e =>
                !e.debtId && e.month === month &&
                (e.desc || '').startsWith('Da saldare a') &&
                e.planned > 0 && !e.actual && !e.settled
            );
            for (const e of legacyDupes) await db.expenses.delete(e.id);
            currentData.expenses = currentData.expenses.filter(e =>
                e.debtId || !(e.desc || '').startsWith('Da saldare a')
            );
            // Pulisce anche l'outbox da materializzazioni legacy (offline)
            if (typeof window.writeOutbox === 'function') {
                const legacyIds = new Set(legacyDupes.map(e => String(e.id)));
                const queue = (window.readOutbox('expenses') || []).filter(item =>
                    !legacyIds.has(String(item && item.id))
                );
                window.writeOutbox('expenses', queue);
            }
            const existing = new Set((await db.expenses.toArray()).map(e => e.debtId ? String(e.debtId) : null).filter(Boolean));
            for (const d of openForMe) {
                if (existing.has(String(d.id))) continue;
                if (!month) continue;
                const exp = {
                    id: genId(),
                    month,
                    date: new Date().toISOString().slice(0, 10),
                    category: d.category || 'Spese Condivise',
                    desc: 'Da saldare a ' + (d.creditor_name || '…'),
                    planned: Number(d.amount) || 0,
                    actual: 0,
                    sharedPercentage: 0,
                    debtId: String(d.id)
                };
                await db.expenses.put(exp);
                currentData.expenses.push(exp);
                existing.add(String(d.id));
            }
            await updateUI();
            showToast('💸 ' + openForMe.length + ' debito/i da saldare aggiunti', false);
        }
        const settledForMe = debts.filter(d => d.creditor_user_id === uid && d.status === 'settled' && d.expense_id);
        for (const d of settledForMe) {
            const debtorP = people.find(pp => pp.user_id === d.debtor_user_id);
            if (!debtorP) continue;
            const parts = await db.sharedExpenseParticipants.toArray();
            for (const part of parts) {
                if (String(part.shared_expense_id) === String(d.expense_id) && part.person_id === debtorP.id && !part.settled) {
                    part.settled = true;
                    await db.sharedExpenseParticipants.put(part);
                    showToast('✅ ' + (d.debtor_name || 'Un amico') + ' ha saldato il debito', false);
                }
            }
        }
    } catch (err) {
        console.warn('[SyncDebts] errore:', err);
    }
}

async function markDebtSettled(debtId) {
    if (!debtId) return;
    const debts = await db.sharedDebts.toArray();
    const d = debts.find(x => String(x.id) === String(debtId));
    if (!d || d.status === 'settled') return;
    await db.sharedDebts.update(d.id, { status: 'settled' });
}

async function copyInviteLink(groupId) {
    const g = groups.find(gg => gg.id === groupId);
    if (!g || !g.invite_token) return;
    const link = getGroupInviteLink(g);
    try {
        await navigator.clipboard.writeText(link);
        showToast('Link invito copiato!', false);
    } catch (e) {
        showToast('Link: ' + link, false);
    }
}

async function handleJoinGroupFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('join_group');
    if (!token) return;
    const groupId = await joinGroupByToken(token);
    if (groupId) {
        params.delete('join_group');
        const newUrl = window.location.pathname + (params.toString() ? '?' + params.toString() : '');
        window.history.replaceState({}, '', newUrl);
        openCondivisePopup();
        switchCondiviseTab('gruppi');
        showGroupDetail(groupId);
    }
}

// ===== SPESE CONDIVISE - Pannello split condiviso (mobile + desktop) =====
let sharedSplitState = { participants: [], method: 'equal', groupId: null, payerId: null, preset: 'p1', advanced: false, groupMeta: null };

function populateSharedPersonSelect(selEl) {
    if (!selEl) return;
    selEl.innerHTML = '<option value="">Aggiungi persona o gruppo...</option>';
    const me = people.find(pp => pp.user_id === (window.supabaseUser ? window.supabaseUser.id : null));
    if (me) {
        const opt = document.createElement('option');
        opt.value = 'me';
        opt.textContent = '👤 Io (' + me.name + ')';
        selEl.appendChild(opt);
    }
    people.forEach(p => {
        if (me && p.id === me.id) return;
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.name;
        selEl.appendChild(opt);
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
        selEl.appendChild(og);
    }
}

function resetSharedSplitState() {
    sharedSplitState = { participants: [], method: 'equal', groupId: null, payerId: null, preset: 'p1', advanced: false, groupMeta: null };
}

async function addSharedParticipant(selEl) {
    const val = selEl ? selEl.value : '';
    if (!val) return;
    selEl.value = '';
    if (val === 'me') {
        const me = await ensureCurrentUserPerson();
        if (me && !sharedSplitState.participants.some(p => p.personId === me.id)) {
            sharedSplitState.participants.push({ personId: me.id, name: me.name, value: null, active: true });
        }
        sharedSplitState.groupMeta = null;
    } else if (val.startsWith('g_')) {
        const gid = parseInt(val.replace('g_', ''));
        sharedSplitState.groupId = gid;
        const members = getGroupMembersWithPeople(gid);
        const g = groups.find(gg => gg.id === gid);
        sharedSplitState.groupMeta = { label: g ? g.name : 'Gruppo', memberIds: members.map(m => (m.person ? m.person.id : m.personId)).filter(Boolean) };
        for (const m of members) {
            const pid = m.person ? m.person.id : m.personId;
            if (pid && !sharedSplitState.participants.some(p => p.personId === pid)) {
                sharedSplitState.participants.push({ personId: pid, name: m.person ? m.person.name : (m.member_name || 'Sconosciuto'), value: null, active: true });
            }
        }
    } else {
        const pid = parseInt(val);
        const p = people.find(pp => pp.id === pid);
        if (p && !sharedSplitState.participants.some(x => x.personId === pid)) {
            sharedSplitState.participants.push({ personId: pid, name: p.name, value: null, active: true });
        }
        sharedSplitState.groupMeta = null;
    }
    const meId = getSharedMeId();
    if (sharedSplitState.payerId && !sharedSplitState.participants.some(p => p.personId === sharedSplitState.payerId)) {
        sharedSplitState.payerId = null;
    }
    if (!sharedSplitState.payerId && meId && sharedSplitState.participants.some(p => p.personId === meId)) {
        sharedSplitState.payerId = meId;
    }
}

function removeSharedParticipant(pid) {
    sharedSplitState.participants = sharedSplitState.participants.filter(p => p.personId !== pid);
    if (!sharedSplitState.participants.length) sharedSplitState.groupMeta = null;
    const meId = getSharedMeId();
    if (sharedSplitState.payerId === pid) sharedSplitState.payerId = null;
    if (!sharedSplitState.payerId && meId && sharedSplitState.participants.some(p => p.personId === meId)) {
        sharedSplitState.payerId = meId;
    }
}

function getSharedMeId() {
    const me = people.find(pp => pp.user_id === (window.supabaseUser ? window.supabaseUser.id : null));
    return me ? me.id : null;
}

function getSharedPayer(state) {
    const meId = getSharedMeId();
    const pid = state.payerId || meId;
    return state.participants.find(p => p.personId === pid) || state.participants[0] || null;
}

function avatarColorFor(name) {
    let h = 0;
    const s = name || '?';
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
    return 'hsl(' + h + ', 55%, 45%)';
}

function computeSharedSplits(state, total) {
    const parts = state.participants.filter(p => p.active);
    if (!parts.length) return { error: 'Aggiungi almeno un partecipante' };
    const n = parts.length;
    const round2 = v => Math.round(v * 100) / 100;
    let shares = [], splitValues = null, method = state.method;
    if (method === 'equal') {
        const base = round2(total / n);
        for (let i = 0; i < n; i++) shares.push(i === n - 1 ? round2(total - base * (n - 1)) : base);
    } else if (method === 'percentage') {
        const vals = parts.map(p => parseFloat(p.value) || 0);
        const sum = vals.reduce((a, b) => a + b, 0);
        if (Math.abs(sum - 100) > 0.01) return { error: 'Le percentuali devono sommare 100 (ora ' + round2(sum) + ')' };
        for (let i = 0; i < n; i++) shares.push(round2(total * vals[i] / 100));
        splitValues = vals;
    } else if (method === 'exact') {
        const vals = parts.map(p => parseFloat(p.value) || 0);
        const sum = vals.reduce((a, b) => a + b, 0);
        if (Math.abs(sum - total) > 0.01) return { error: 'Gli importi devono sommare il totale (' + fmtE(total) + ')' };
        shares = vals.map(round2);
        splitValues = vals;
    } else if (method === 'shares') {
        const qs = parts.map(p => parseFloat(p.value) || 0);
        const sumQ = qs.reduce((a, b) => a + b, 0);
        if (sumQ <= 0) return { error: 'Inserisci quote positive' };
        for (let i = 0; i < n; i++) shares.push(round2(total * qs[i] / sumQ));
        splitValues = qs;
    } else {
        return { error: 'Metodo di split non valido' };
    }
    const payer = getSharedPayer(state);
    const payerId = payer ? payer.personId : null;
    const records = parts.map((p, i) => ({
        personId: p.personId,
        name: p.name,
        shareAmount: round2(shares[i]),
        paidAmount: p.personId === payerId ? round2(total) : 0,
        splitValue: splitValues ? round2(splitValues[i]) : null
    }));
    const sumShare = records.reduce((a, r) => a + r.shareAmount, 0);
    if (Math.abs(sumShare - total) > 0.005 && records.length) {
        records[records.length - 1].shareAmount = round2(records[records.length - 1].shareAmount + (total - sumShare));
    }
    return { records, splitMethod: method };
}

function derivePreset() {
    const meId = getSharedMeId();
    if (sharedSplitState.advanced) { sharedSplitState.preset = 'custom'; return; }
    const hasOther = sharedSplitState.participants.some(p => p.active && p.personId !== meId);
    if (sharedSplitState.payerId === meId) {
        sharedSplitState.preset = sharedSplitState.method === 'equal' ? 'p1' : (hasOther ? 'p2' : 'custom');
    } else {
        sharedSplitState.preset = sharedSplitState.method === 'equal' ? 'p3' : (hasOther ? 'p4' : 'custom');
    }
}

function applyPreset(preset, forceActive) {
    const meId = getSharedMeId();
    const others = sharedSplitState.participants.filter(p => p.active && p.personId !== meId);
    const setActive = forceActive !== false;
    sharedSplitState.advanced = false;
    sharedSplitState.preset = preset;
    if (preset === 'p1') {
        sharedSplitState.payerId = meId;
        sharedSplitState.method = 'equal';
        sharedSplitState.participants.forEach(p => { if (setActive) p.active = true; p.value = null; });
    } else if (preset === 'p2') {
        sharedSplitState.payerId = meId;
        sharedSplitState.method = 'percentage';
        const k = Math.max(1, others.length);
        sharedSplitState.participants.forEach(p => {
            if (setActive) p.active = true;
            p.value = p.personId === meId ? 0 : Math.round(100 / k * 100) / 100;
        });
    } else if (preset === 'p3') {
        const friend = others[0];
        if (!friend) return;
        sharedSplitState.payerId = friend.personId;
        sharedSplitState.method = 'equal';
        sharedSplitState.participants.forEach(p => { if (setActive) p.active = true; p.value = null; });
    } else if (preset === 'p4') {
        const friend = others[0];
        if (!friend) return;
        sharedSplitState.payerId = friend.personId;
        sharedSplitState.method = 'percentage';
        sharedSplitState.participants.forEach(p => {
            if (setActive) p.active = true;
            p.value = p.personId === meId ? 100 : 0;
        });
    }
}

function renderPresets(desktop) {
    const grid = document.getElementById(desktop ? 'sharedPresetsDesktop' : 'sharedPresets');
    if (!grid) return;
    const meId = getSharedMeId();
    const others = sharedSplitState.participants.filter(p => p.active && p.personId !== meId);
    let label = '…';
    if (sharedSplitState.groupMeta && sharedSplitState.groupMeta.memberIds.length) {
        const othersInGroup = others.every(o => sharedSplitState.groupMeta.memberIds.includes(o.personId));
        if (othersInGroup && others.length) label = sharedSplitState.groupMeta.label;
        else if (others.length === 1) label = others[0].name;
        else if (others.length > 1) label = others[0].name + ' e altri ' + (others.length - 1);
    } else if (others.length === 1) {
        label = others[0].name;
    } else if (others.length > 1) {
        label = others[0].name + ' e altri ' + (others.length - 1);
    }
    derivePreset();
    grid.querySelectorAll('.preset-card').forEach(card => {
        const p = card.dataset.preset;
        const hasOther = others.length > 0;
        const disabled = (p === 'p2' || p === 'p3' || p === 'p4') ? !hasOther : sharedSplitState.participants.length === 0;
        card.classList.toggle('disabled', disabled);
        card.classList.toggle('active', !disabled && p === sharedSplitState.preset);
        const b = card.querySelector('.preset-friend');
        if (b) b.textContent = label;
    });
}

function autoFixSplitValues(state, total) {
    const parts = state.participants.filter(p => p.active);
    if (parts.length < 2) return;
    const round2 = v => Math.round(v * 100) / 100;
    if (state.method === 'percentage') {
        const vals = parts.map(p => parseFloat(p.value) || 0);
        const sum = vals.reduce((a, b) => a + b, 0);
        if (Math.abs(sum - 100) > 0.01) {
            const others = vals.slice(0, -1).reduce((a, b) => a + b, 0);
            const last = round2(100 - others);
            if (last < 0) return;
            parts[parts.length - 1].value = last;
        }
    } else if (state.method === 'exact') {
        const vals = parts.map(p => parseFloat(p.value) || 0);
        const sum = vals.reduce((a, b) => a + b, 0);
        if (Math.abs(sum - total) > 0.01) {
            const others = vals.slice(0, -1).reduce((a, b) => a + b, 0);
            const last = round2(total - others);
            if (last < 0) return;
            parts[parts.length - 1].value = last;
        }
    }
}

function renderSplitEditor(containerId, total) {
    const c = document.getElementById(containerId);
    if (!c) return;
    const isDesktop = containerId === 'sharedDetailFieldsDesktop';
    if (!sharedSplitState.participants.length) {
        c.innerHTML = '<div class="shared-hint">🤝 Aggiungi chi partecipa alla spesa</div>';
        return;
    }
    const advanced = sharedSplitState.advanced;
    const meId = getSharedMeId();
    const payer = getSharedPayer(sharedSplitState);
    const payerId = payer ? payer.personId : null;
    let html = '';
    if (advanced) {
        html += `
            <div class="adv-method-toggle">
                <button type="button" class="adv-method-btn ${sharedSplitState.method === 'percentage' ? 'active' : ''}" data-adv="percentage">%</button>
                <button type="button" class="adv-method-btn ${sharedSplitState.method === 'exact' ? 'active' : ''}" data-adv="exact">€</button>
            </div>
            <div class="payer-chip-row">
                <span class="payer-chip-label">Paga</span>
                <button type="button" class="payer-chip ${!payerId || payerId === meId ? 'active' : ''}" data-payer="me">👤 Tu</button>
                ${sharedSplitState.participants.filter(p => p.personId !== meId && p.active).map(p =>
                    `<button type="button" class="payer-chip ${payerId === p.personId ? 'active' : ''}" data-payer="${p.personId}">${p.name}</button>`
                ).join('')}
            </div>
        `;
    }
    const res = computeSharedSplits(sharedSplitState, total);
    const sharesByPid = {};
    if (res && !res.error) for (const r of res.records) sharesByPid[r.personId] = r.shareAmount;
    sharedSplitState.participants.forEach(p => {
        const isPayer = payer && payer.personId === p.personId;
        let quotaField;
        if (advanced) {
            quotaField = `<input type="number" inputmode="decimal" class="participant-value" data-pid="${p.personId}" step="0.01" min="0" value="${p.value != null ? p.value : ''}" placeholder="${sharedSplitState.method === 'percentage' ? '%' : '€'}">`;
        } else {
            const share = sharesByPid[p.personId];
            quotaField = `<span class="participant-share">${share != null ? fmtE(share) : '—'}</span>`;
        }
        html += `
            <div class="participant-row ${p.active ? '' : 'excluded'}">
                <input type="checkbox" class="participant-check" data-pid="${p.personId}" ${p.active ? 'checked' : ''} aria-label="Includi ${p.name}">
                <span class="participant-avatar" style="background:${avatarColorFor(p.name)}">${getInitials(p.name)}</span>
                <span class="participant-name">${p.name}</span>
                ${isPayer ? '<span class="participant-payer-tag">paga</span>' : ''}
                ${quotaField}
                <button type="button" class="participant-remove" data-pid="${p.personId}" title="Rimuovi" aria-label="Rimuovi ${p.name}">✕</button>
            </div>`;
    });
    html += `<div class="shared-remainder" id="${containerId}-remainder"></div>`;
    c.innerHTML = html;
    const updateRemainder = () => {
        const badge = document.getElementById(containerId + '-remainder');
        if (!badge) return;
        const r = computeSharedSplits(sharedSplitState, total);
        if (r.error) {
            badge.textContent = '⚠️ ' + r.error;
            badge.classList.remove('ok');
            badge.classList.add('warn');
            return;
        }
        badge.classList.remove('warn');
        badge.classList.add('ok');
        if (advanced) {
            const payerName = payer ? payer.name : '…';
            badge.textContent = 'Rimanente: ' + fmtE(0) + ' · Paga ' + (payerName);
        } else {
            const activeCount = sharedSplitState.participants.filter(p => p.active).length;
            badge.textContent = 'Paga ' + (payer ? payer.name : '…') + ' · ' + activeCount + ' partecipanti';
        }
    };
    c.querySelectorAll('.participant-check').forEach(cb => {
        cb.addEventListener('change', () => {
            const p = sharedSplitState.participants.find(x => x.personId === parseInt(cb.dataset.pid));
            if (!p) return;
            const payerNow = getSharedPayer(sharedSplitState);
            if (payerNow && payerNow.personId === p.personId && !cb.checked) {
                showToast('Il pagatore non può essere escluso', true);
                cb.checked = true;
                return;
            }
            const meIdNow = getSharedMeId();
            const othersAfter = sharedSplitState.participants.filter(x =>
                (x === p ? cb.checked : x.active) && x.personId !== meIdNow
            );
            if (!cb.checked && !othersAfter.length && (sharedSplitState.preset === 'p2' || sharedSplitState.preset === 'p4')) {
                showToast('Serve almeno un altro partecipante', true);
                cb.checked = true;
                return;
            }
            p.active = cb.checked;
            if (!sharedSplitState.advanced && (sharedSplitState.preset === 'p2' || sharedSplitState.preset === 'p4')) {
                applyPreset(sharedSplitState.preset, false);
            }
            refreshSharedPanelUI(isDesktop ? 'sharedParticipantsDesktop' : 'sharedParticipants');
        });
    });
    c.querySelectorAll('.participant-value').forEach(inp => {
        inp.addEventListener('focus', (e) => {
            const el = e.target;
            requestAnimationFrame(() => el.select());
        });
        inp.addEventListener('input', () => {
            const p = sharedSplitState.participants.find(x => x.personId === parseInt(inp.dataset.pid));
            if (p) p.value = parseFloat(inp.value) || 0;
            updateRemainder();
        });
        inp.addEventListener('blur', () => {
            autoFixSplitValues(sharedSplitState, total);
            refreshSharedPanelUI(isDesktop ? 'sharedParticipantsDesktop' : 'sharedParticipants');
        });
    });
    c.querySelectorAll('.participant-remove').forEach(btn => {
        btn.addEventListener('click', () => {
            removeSharedParticipant(parseInt(btn.dataset.pid));
            refreshSharedPanelUI(isDesktop ? 'sharedParticipantsDesktop' : 'sharedParticipants');
        });
    });
    c.querySelectorAll('.adv-method-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            sharedSplitState.method = btn.dataset.adv;
            sharedSplitState.preset = 'custom';
            refreshSharedPanelUI(isDesktop ? 'sharedParticipantsDesktop' : 'sharedParticipants');
        });
    });
    c.querySelectorAll('.payer-chip').forEach(btn => {
        btn.addEventListener('click', () => {
            sharedSplitState.payerId = btn.dataset.payer === 'me' ? null : parseInt(btn.dataset.payer);
            sharedSplitState.preset = 'custom';
            refreshSharedPanelUI(isDesktop ? 'sharedParticipantsDesktop' : 'sharedParticipants');
        });
    });
    updateRemainder();
}

function refreshSharedPanelUI(chipsId) {
    const isDesktop = chipsId === 'sharedParticipantsDesktop';
    const total = isDesktop ? getDesktopSharedTotal() : getSheetAmount();
    renderSplitEditor(isDesktop ? 'sharedDetailFieldsDesktop' : 'sharedDetailFields', total);
    renderPresets(isDesktop);
    ['btnAdvancedSplit', 'btnAdvancedSplitDesktop'].forEach(id => {
        const b = document.getElementById(id);
        if (b) b.textContent = sharedSplitState.advanced ? '← Torna ai preset' : '⚙️ Personalizza quote (% / €)';
    });
}

function setupSharedToggle() {
    const toggle = document.getElementById('sharedToggle');
    const panel = document.getElementById('sharedPanel');
    if (toggle && panel) {
        toggle.addEventListener('change', async () => {
            panel.classList.toggle('active', toggle.checked);
            if (toggle.checked) {
                resetSharedSplitState();
                populateSharedPersonSelect(document.getElementById('sharedPersonSelect'));
                const me = await ensureCurrentUserPerson();
                if (me) sharedSplitState.participants.push({ personId: me.id, name: me.name, value: null, active: true });
                refreshSharedPanelUI('sharedParticipants');
            }
        });
    }
    const grid = document.getElementById('sharedPresets');
    if (grid) {
        grid.addEventListener('click', (e) => {
            const card = e.target.closest('.preset-card');
            if (!card || card.classList.contains('disabled')) return;
            applyPreset(card.dataset.preset);
            refreshSharedPanelUI('sharedParticipants');
        });
    }
    const advBtn = document.getElementById('btnAdvancedSplit');
    if (advBtn) {
        advBtn.addEventListener('click', () => {
            sharedSplitState.advanced = !sharedSplitState.advanced;
            if (sharedSplitState.advanced) {
                if (sharedSplitState.method === 'equal') sharedSplitState.method = 'percentage';
                sharedSplitState.preset = 'custom';
            } else {
                sharedSplitState.method = 'equal';
            }
            refreshSharedPanelUI('sharedParticipants');
        });
    }
    const sel = document.getElementById('sharedPersonSelect');
    if (sel) sel.addEventListener('change', async () => { await addSharedParticipant(sel); refreshSharedPanelUI('sharedParticipants'); });
    const newPersonBtn = document.getElementById('btnNewPerson');
    if (newPersonBtn) {
        newPersonBtn.addEventListener('click', () => {
            const name = prompt('Nome della persona:');
            if (name && name.trim()) saveNewPerson(name.trim());
        });
    }
}

async function saveNewPerson(name) {
    return createPerson(name, '');
}

// =====================================================================
// SPESE CONDIVISE - Pannello desktop (parity bottom sheet)
// =====================================================================
function setupSharedPanelDesktop() {
    const toggle = document.getElementById('sharedToggleDesktop');
    const panel = document.getElementById('sharedPanelDesktop');
    if (toggle && panel) {
        toggle.addEventListener('change', async () => {
            panel.classList.toggle('active', toggle.checked);
            if (toggle.checked) {
                resetSharedSplitState();
                populateSharedPersonSelect(document.getElementById('sharedPersonDesktop'));
                const me = await ensureCurrentUserPerson();
                if (me) sharedSplitState.participants.push({ personId: me.id, name: me.name, value: null, active: true });
                refreshSharedPanelUI('sharedParticipantsDesktop');
            }
        });
    }
    const grid = document.getElementById('sharedPresetsDesktop');
    if (grid) {
        grid.addEventListener('click', (e) => {
            const card = e.target.closest('.preset-card');
            if (!card || card.classList.contains('disabled')) return;
            applyPreset(card.dataset.preset);
            refreshSharedPanelUI('sharedParticipantsDesktop');
        });
    }
    const advBtn = document.getElementById('btnAdvancedSplitDesktop');
    if (advBtn) {
        advBtn.addEventListener('click', () => {
            sharedSplitState.advanced = !sharedSplitState.advanced;
            if (sharedSplitState.advanced) {
                if (sharedSplitState.method === 'equal') sharedSplitState.method = 'percentage';
                sharedSplitState.preset = 'custom';
            } else {
                sharedSplitState.method = 'equal';
            }
            refreshSharedPanelUI('sharedParticipantsDesktop');
        });
    }
    const selDesktop = document.getElementById('sharedPersonDesktop');
    if (selDesktop) selDesktop.addEventListener('change', async () => {
        await addSharedParticipant(selDesktop);
        refreshSharedPanelUI('sharedParticipantsDesktop');
    });
    document.getElementById('btnNewPersonDesktop')?.addEventListener('click', async () => {
        const name = prompt('Nome della persona:');
        if (name && name.trim()) {
            const person = { id: genId(), name, createdAt: Date.now() };
            await db.people.put(person);
            people.push(person);
            populateSharedPersonSelect(document.getElementById('sharedPersonDesktop'));
            showToast('👤 ' + name + ' aggiunto', false);
        }
    });
    ['expActual', 'expPlanned'].forEach(id => {
        document.getElementById(id)?.addEventListener('focus', (e) => {
            const el = e.target;
            requestAnimationFrame(() => el.select());
        });
        document.getElementById(id)?.addEventListener('input', () => {
            const panel = document.getElementById('sharedPanelDesktop');
            if (panel && panel.classList.contains('active')) refreshSharedPanelUI('sharedParticipantsDesktop');
        });
    });
}

function getDesktopSharedTotal() {
    const a = parseFloat(document.getElementById('expActual').value) || 0;
    const p = parseFloat(document.getElementById('expPlanned').value) || 0;
    return a || p;
}

function setExpenseTypePill(el) {
    document.querySelectorAll('.form-advanced [data-exp-type]').forEach(p => p.classList.toggle('active', p === el));
    const type = el.dataset.expType;
    const stima = document.getElementById('expPlanned');
    const pagato = document.getElementById('expActual');
    if (stima) stima.style.borderColor = type === 'planned' ? '#f59e0b' : '';
    if (pagato) pagato.style.borderColor = type === 'actual' ? '#ef4444' : '';
}

function getSheetAmount() {
    const raw = (document.getElementById('amountInput')?.value || '').trim().replace(',', '.');
    const val = parseFloat(raw);
    return isFinite(val) && val > 0 ? val : 0;
}

async function saveSharedSplitsV2(expenseId, totalAmount, state) {
    const res = computeSharedSplits(state, totalAmount);
    if (res.error) return { error: res.error };
    await saveSharedExpenseV2(expenseId, totalAmount, state.groupId, res.records, res.splitMethod);
    return { ok: true };
}

// =====================================================================
// SPESE CONDIVISE - Popup Saldi & Gruppi
// =====================================================================
async function openCondivisePopup() {
    await loadPeopleGroups();
    const popup = document.getElementById('popup-spese-condivise');
    if (!popup) return;
    popup.classList.add('active');
    document.body.classList.add('popup-open');
    switchCondiviseTab('amici');
    await Promise.all([renderFriendsTab(), renderGroupsTab()]);
}

function closeCondivisePopup(event) {
    if (event && event.target !== event.currentTarget) return;
    const popup = document.getElementById('popup-spese-condivise');
    if (popup) { popup.classList.remove('active'); document.body.classList.remove('popup-open'); }
}

function switchCondiviseTab(tab) {
    document.querySelectorAll('.condivise-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    document.querySelectorAll('.condivise-tab-content').forEach(c => c.classList.toggle('active', c.id === 'condiviseTab' + tab.charAt(0).toUpperCase() + tab.slice(1)));
    if (tab === 'amici') renderFriendsTab();
    else renderGroupsTab();
}

async function renderFriendsTab() {
    const container = document.getElementById('condiviseTabAmici');
    if (!container) return;
    const meId = getSharedMeId();
    const participants = await db.sharedExpenseParticipants.toArray();
    const netByPerson = {};
    for (const pr of participants) {
        if (pr.settled) continue;
        const pid = Number(pr.person_id);
        const paid = Number(pr.paid_amount) || 0;
        const share = Number(pr.share_amount) || 0;
        netByPerson[pid] = Math.round(((netByPerson[pid] || 0) + paid - share) * 100) / 100;
    }
    const friends = people.filter(p => p.id !== meId);

    let html = `
        <div class="condivise-search-add">
            <input type="text" id="newPersonQuickInput" class="sheet-input" placeholder="Nome o email...">
            <button class="btn-add-solid" id="btnQuickAddPerson">+ Aggiungi</button>
        </div>
    `;

    if (friends.length === 0) {
        html += '<div class="condivise-empty">🎉 Nessun amico ancora. Aggiungine uno per iniziare.</div>';
    } else {
        html += '<div class="condivise-list">';
        for (const p of friends) {
            const color = getAvatarColor(p.name);
            const initials = getInitials(p.name);
            const net = netByPerson[p.id] || 0;
            const badgeClass = net > 0.001 ? 'negative' : (net < -0.001 ? 'positive' : 'neutral');
            const badgeText = net > 0.001 ? 'Devi ' + fmtE(net) : (net < -0.001 ? 'Ti deve ' + fmtE(Math.abs(net)) : 'In pari (0,00 €)');
            html += `
                <div class="friend-row" data-pid="${p.id}">
                    <div class="friend-avatar" style="background:${color}">${initials}</div>
                    <div class="friend-info">
                        <span class="friend-name">${p.name}</span>
                        ${p.email ? `<span class="friend-sub">${p.email}</span>` : ''}
                        <span class="friend-badge ${badgeClass}">${badgeText}</span>
                    </div>
                    ${Math.abs(net) > 0.001 ? `<button class="btn-settle" data-pid="${p.id}">Salda</button>` : ''}
                    <span class="row-chevron"><i class="fas fa-chevron-right"></i></span>
                </div>
            `;
        }
        html += '</div>';
    }
    container.innerHTML = html;

    container.querySelectorAll('.friend-row').forEach(row => {
        row.addEventListener('click', async (e) => {
            if (e.target.closest('.btn-settle')) return;
            const pid = parseInt(row.dataset.pid);
            await showFriendDetail(pid);
        });
    });
    container.querySelectorAll('.btn-settle').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const pid = parseInt(btn.dataset.pid);
            await settleFriendBalance(pid);
        });
    });
    const quickAddBtn = document.getElementById('btnQuickAddPerson');
    const quickAddInput = document.getElementById('newPersonQuickInput');
    if (quickAddBtn && quickAddInput) {
        quickAddBtn.addEventListener('click', async () => {
            const raw = quickAddInput.value.trim();
            if (!raw) return;
            const [name, email] = raw.includes('@') ? [raw, raw] : [raw, ''];
            await createPerson(name, email);
            quickAddInput.value = '';
            renderFriendsTab();
        });
        quickAddInput.addEventListener('keydown', async (e) => { if (e.key === 'Enter') quickAddBtn.click(); });
    }
}

async function renderGroupsTab() {
    const container = document.getElementById('condiviseTabGruppi');
    if (!container) return;

    let html = `
        <div class="condivise-search-add">
            <input type="text" id="newGroupQuickInput" class="sheet-input" placeholder="Nome gruppo...">
            <button class="btn-add-solid" id="btnQuickAddGroup">+ Crea</button>
        </div>
    `;

    if (groups.length === 0) {
        html += '<div class="condivise-empty">📂 Nessun gruppo ancora. Creane uno per spese condivise.</div>';
    } else {
        html += '<div class="condivise-list">';
        const meId = getSharedMeId();
        for (const g of groups) {
            try {
                const members = getGroupMembersWithPeople(g.id);
                const balances = await calculateGroupBalances(g.id);
                const meB = balances.find(b => b.id === meId);
                const myNet = meB ? meB.net : 0;
                const badgeClass = myNet > 0.001 ? 'positive' : (myNet < -0.001 ? 'negative' : 'neutral');
                const badgeText = myNet > 0.001 ? 'In credito di ' + fmtE(myNet) : (myNet < -0.001 ? 'In debito di ' + fmtE(Math.abs(myNet)) : 'In pari');
                html += `
                    <div class="group-card" data-gid="${g.id}">
                        <div class="group-avatar"><i class="fas fa-users"></i></div>
                        <div class="group-info">
                            <span class="group-name">${g.name}</span>
                            <span class="group-members">${members.length} partecipanti</span>
                            <span class="friend-badge ${badgeClass}">${badgeText}</span>
                        </div>
                        <button class="btn-copy-link" data-gid="${g.id}" title="Copia link invito"><i class="fas fa-link"></i></button>
                        <span class="row-chevron"><i class="fas fa-chevron-right"></i></span>
                    </div>
                `;
            } catch (err) {
                console.warn('[Gruppi] errore rendering gruppo ' + g.id + ':', err);
            }
        }
        html += '</div>';
    }
    try {
        container.innerHTML = html;
    } catch (err) {
        console.warn('[Gruppi] errore rendering lista:', err);
        container.innerHTML = '<div class="condivise-empty">⚠️ Errore caricamento gruppi</div>';
    }

    container.querySelectorAll('.group-card').forEach(card => {
        card.addEventListener('click', async (e) => {
            if (e.target.closest('.btn-copy-link')) return;
            const gid = parseInt(card.dataset.gid);
            await showGroupDetail(gid);
        });
    });
    container.querySelectorAll('.btn-copy-link').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const gid = parseInt(btn.dataset.gid);
            await copyInviteLink(gid);
        });
    });

    const quickAddBtn = document.getElementById('btnQuickAddGroup');
    const quickAddInput = document.getElementById('newGroupQuickInput');
    if (quickAddBtn && quickAddInput) {
        quickAddBtn.addEventListener('click', async () => {
            const name = quickAddInput.value.trim();
            if (name) {
                const g = await createGroup(name);
                quickAddInput.value = '';
                renderGroupsTab();
                if (g) await showGroupDetail(g.id);
            }
        });
        quickAddInput.addEventListener('keydown', async (e) => { if (e.key === 'Enter') quickAddBtn.click(); });
    }
}

async function settleGroupExpenseShare(sharedExpenseId) {
    const meId = getSharedMeId();
    if (!meId) return;
    const parts = (await loadSharedExpenseParticipants(sharedExpenseId)).filter(x => x.person_id === meId && !x.settled);
    if (!parts.length) { showToast('Nessuna quota da saldare', true); return; }
    const ok = await showConfirmDialog(
        'Salda la tua quota?',
        parts.length + ' voce/i verranno marcate come saldate.'
    );
    if (!ok) return;
    for (const part of parts) {
        part.settled = true;
        await db.sharedExpenseParticipants.put(part);
    }
    showToast('✅ Quota saldata', false);
    const se = await db.sharedExpenses.get(sharedExpenseId);
    if (se && se.group_id) showGroupDetail(se.group_id); else renderGroupsTab();
}

// ===== LEDGER - VISTA DETTAGLIO PERSONA / GRUPPO =====
function backToCondiviseSummary() {
    document.getElementById('condiviseDetailView').style.display = 'none';
    document.querySelector('.condivise-tabs').style.display = 'flex';
    document.getElementById('condiviseBody').style.display = 'flex';
    document.querySelectorAll('.condivise-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === 'amici'));
    document.querySelectorAll('.condivise-tab-content').forEach(c => c.classList.remove('active'));
    document.getElementById('condiviseTabAmici').classList.add('active');
    renderFriendsTab();
}

async function addPersonToGroup(groupId, personId) {
    if (groupMembers.some(m => m.groupId === groupId && m.personId === personId)) {
        showToast('Persona già nel gruppo', true);
        return;
    }
    const p = people.find(pp => pp.id === personId);
    const member = { id: genId(), groupId, personId, member_name: p ? p.name : null };
    await db.groupMembers.put(member);
    groupMembers.push(member);
    showToast('🙌 Persona aggiunta al gruppo', false);
    showGroupDetail(groupId);
}

async function showFriendDetail(personId) {
    let p = people.find(pp => pp.id === personId);
    const participants = await db.sharedExpenseParticipants.where('person_id').equals(personId).toArray();
    participants.sort((a, b) => b.created_at - a.created_at);
    if (!p && participants.length) {
        p = { id: personId, name: participants[0].participant_name || 'Sconosciuto' };
    }
    if (!p) return;
    let paid = 0, share = 0;
    for (const part of participants) {
        if (part.settled) continue;
        paid += part.paid_amount; share += part.share_amount;
    }
    const net = paid - share;

    document.querySelector('.condivise-tabs').style.display = 'none';
    document.getElementById('condiviseBody').style.display = 'none';
    const detailView = document.getElementById('condiviseDetailView');
    detailView.style.display = 'flex';

    const color = getAvatarColor(p.name);
    const statusClass = net > 0.001 ? 'saldo-negative' : (net < -0.001 ? 'saldo-positive' : 'saldo-neutral');
    document.getElementById('condiviseDetailHeader').innerHTML = `
        <div class="detail-avatar-large" style="background:${color}">${getInitials(p.name)}</div>
        <div class="detail-header-name">${p.name}</div>
        <div class="detail-header-balance ${statusClass}">
            ${net > 0.001 ? 'Le devi ' + fmtE(net) : (net < -0.001 ? 'Ti deve ' + fmtE(Math.abs(net)) : 'In pari')}
        </div>
        ${Math.abs(net) > 0.001 ? `<button class="btn-settle-large" data-pid="${p.id}">Salda debito</button>` : ''}
    `;

    let html = '<div class="ledger-list">';
    for (const part of participants) {
        const se = await db.sharedExpenses.get(part.shared_expense_id);
        const exp = se ? await db.expenses.get(se.expense_id) : null;
        const dateStr = exp ? (exp.date || '').split('-').reverse().slice(0,2).join('/') : '';
        const desc = exp ? exp.desc : 'Spesa eliminata';
        const diff = part.paid_amount - part.share_amount;
        html += `
            <div class="ledger-row ${part.settled ? 'ledger-settled' : ''}">
                <div class="ledger-row-left">
                    <span class="ledger-date">${dateStr}</span>
                    <span class="ledger-desc">${desc}</span>
                    <span class="ledger-type">${part.settled ? '✅ Saldata' : '⏳ Da saldare'}</span>
                </div>
                <div class="ledger-row-right">
                    <span class="ledger-amount ${diff < 0 ? 'saldo-positive' : (diff > 0 ? 'saldo-negative' : '')}">${diff < 0 ? '+' : (diff > 0 ? '-' : '')}${fmtE(Math.abs(diff))}</span>
                </div>
            </div>
        `;
    }
    html += '</div>';
    document.getElementById('condiviseDetailLedger').innerHTML = html;

    detailView.querySelector('.btn-settle-large')?.addEventListener('click', () => settleFriendBalance(personId));
    const backBtn = document.getElementById('btnBackCondiviseDetail');
    if (backBtn) backBtn.onclick = backToCondiviseSummary;
}

async function showGroupDetail(groupId) {
    const g = groups.find(gg => gg.id === groupId);
    if (!g) return;
    const members = getGroupMembersWithPeople(groupId);
    const balances = await calculateGroupBalances(groupId);
    const debts = getSimplifiedDebts(balances);
    const meId = getSharedMeId();

    document.querySelector('.condivise-tabs').style.display = 'none';
    document.getElementById('condiviseBody').style.display = 'none';
    const detailView = document.getElementById('condiviseDetailView');
    detailView.style.display = 'flex';

    const nonMembers = people.filter(p => !members.some(m => m.personId === p.id) && p.id !== meId);
    const link = getGroupInviteLink(g);
    const creator = g.created_by
        ? (g.created_by === window.supabaseUser?.id ? 'te' : (people.find(p => p.user_id === g.created_by)?.name || 'qualcuno'))
        : null;

    document.getElementById('condiviseDetailHeader').innerHTML = `
        <div class="detail-avatar-large" style="background:#8b5cf6"><i class="fas fa-users"></i></div>
        <div class="detail-header-name">${g.name}</div>
        <div class="detail-header-members">${creator ? 'Creato da ' + creator + ' · ' : ''}${members.length} partecipanti</div>
        <div class="group-invite-box">
            <input type="text" id="groupInviteLink" class="sheet-input" value="${link}" readonly>
            <button class="btn-copy-link" data-gid="${g.id}" title="Copia link invito"><i class="fas fa-copy"></i></button>
        </div>
        <div class="group-add-member">
            <input type="text" id="groupAddPersonInput" class="sheet-input" list="groupAddPersonList" placeholder="Aggiungi persona esistente..." autocomplete="off">
            <datalist id="groupAddPersonList">
                ${nonMembers.map(p => `<option value="${p.name}">`).join('')}
            </datalist>
            <button id="btnGroupAddPerson" class="btn-add-solid">+ Aggiungi al Gruppo</button>
        </div>
    `;

    detailView.querySelector('.btn-copy-link')?.addEventListener('click', () => copyInviteLink(g.id));
    const addBtn = document.getElementById('btnGroupAddPerson');
    const addInput = document.getElementById('groupAddPersonInput');
    if (addBtn && addInput) {
        const addByName = async () => {
            const name = addInput.value.trim();
            if (!name) { showToast('Scrivi il nome di una persona', true); return; }
            const person = people.find(p => p.name.toLowerCase() === name.toLowerCase());
            if (!person) { showToast('Nessuna persona con questo nome. Aggiungila dalla scheda Amici', true); return; }
            if (members.some(m => m.personId === person.id)) { showToast('Persona già nel gruppo', true); return; }
            await addPersonToGroup(groupId, person.id);
            addInput.value = '';
        };
        addBtn.addEventListener('click', addByName);
        addInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addByName(); } });
    }

    let html = '';

    html += '<div class="detail-section-title">👥 Partecipanti</div>';
    if (members.length) {
        html += '<div class="detail-section">';
        const balanceById = {};
        for (const b of balances) balanceById[b.id] = b.net;
        for (const m of members) {
            const isAdmin = g.created_by && m.user_id === g.created_by;
            const isMe = m.personId === meId;
            const name = m.person ? (isMe ? 'Tu' : m.person.name) : '?';
            const mb = balanceById[m.personId] || 0;
            const balText = mb > 0.001 ? 'In credito di ' + fmtE(mb) : (mb < -0.001 ? 'In debito di ' + fmtE(Math.abs(mb)) : 'In pari');
            html += `
                <div class="member-row">
                    <div class="friend-avatar" style="background:${getAvatarColor(name)}">${getInitials(name)}</div>
                    <div class="friend-info">
                        <span class="friend-name">${name}</span>
                        <span class="member-role">${isAdmin ? 'Admin' : 'Membro'}</span>
                    </div>
                    <span class="member-balance ${mb > 0.001 ? 'bal-positive' : (mb < -0.001 ? 'bal-negative' : 'bal-neutral')}">${balText}</span>
                </div>
            `;
        }
        html += '</div>';
    } else {
        html += '<div class="condivise-empty">👥 Nessun membro ancora. Invita qualcuno con il link.</div>';
    }

    html += '<div class="detail-section-title">📌 Riepilogo Debiti</div>';
    if (debts.length) {
        html += '<div class="detail-section debts-section">';
        for (const tx of debts) {
            const fromName = tx.from.id === meId ? 'Tu' : tx.from.name;
            const toName = tx.to.id === meId ? 'Tu' : tx.to.name;
            html += `
                <div class="debt-row">
                    <span>${fromName} deve ${fmtE(tx.amount)} a ${toName}</span>
                </div>
            `;
        }
        html += '</div>';
    } else {
        html += '<div class="condivise-empty">✨ Nessun debito in sospeso</div>';
    }

    html += '<div class="detail-section-title">🧾 Spese del Gruppo</div>';
    const shared = (await db.sharedExpenses.toArray()).filter(se => se.group_id === groupId).sort((a, b) => b.created_at - a.created_at);
    if (shared.length) {
        html += '<div class="detail-section">';
        for (const se of shared) {
            const exp = await db.expenses.get(se.expense_id);
            const dateStr = exp ? (exp.date || '').split('-').reverse().slice(0,2).join('/') : '';
            const myParts = (await loadSharedExpenseParticipants(se.id)).filter(x => x.person_id === meId);
            const pending = myParts.some(x => !x.settled);
            html += `
                <div class="ledger-row ${pending ? '' : 'ledger-settled'}">
                    <div class="ledger-row-left">
                        <span class="ledger-date">${dateStr}</span>
                        <span class="ledger-desc">${exp ? exp.desc : 'Spesa'}</span>
                        <span class="ledger-type">${se.split_method} · ${fmtE(se.total_amount)}</span>
                    </div>
                    ${pending ? `<button class="ledger-settle-btn" data-seid="${se.id}">Salda quota</button>` : '<span class="ledger-settled">✅ Saldata</span>'}
                </div>
            `;
        }
        html += '</div>';
    } else {
        html += '<div class="condivise-empty">🧾 Nessuna spesa in questo gruppo</div>';
    }
    document.getElementById('condiviseDetailLedger').innerHTML = html;

    detailView.querySelectorAll('.ledger-settle-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const seid = parseInt(btn.dataset.seid);
            await settleGroupExpenseShare(seid);
        });
    });

    const backBtn = document.getElementById('btnBackCondiviseDetail');
    if (backBtn) backBtn.onclick = backToCondiviseSummary;
}

async function settleFriendBalance(personId) {
    const person = people.find(p => p.id === personId);
    if (!person) return;
    const participants = await db.sharedExpenseParticipants.where('person_id').equals(personId).toArray();
    const pending = participants.filter(p => !p.settled);
    if (!pending.length) { showToast('Nessun debito da saldare', true); return; }
    let paid = 0, share = 0;
    for (const p of pending) { paid += Number(p.paid_amount) || 0; share += Number(p.share_amount) || 0; }
    const net = Math.round((paid - share) * 100) / 100;
    const abs = Math.abs(net);
    if (abs < 0.001) { showToast('Nessun debito da saldare', true); return; }
    const owesMe = net < 0;
    const val = await showPromptDialog({
        title: owesMe ? 'Saldi con ' + person.name : 'Paghi ' + person.name,
        message: owesMe
            ? 'Ti deve ' + fmtE(abs) + ' €. Quanto ti salda?'
            : 'Devi ' + fmtE(abs) + ' € a ' + person.name + '. Quanto vuoi pagare?',
        defaultValue: fmtEPlain(abs),
        placeholder: 'Importo in €',
        okLabel: 'Salda'
    });
    if (val == null) return;
    const amount = Math.round((parseFloat(String(val).replace(',', '.')) || 0) * 100) / 100;
    if (amount <= 0) { showToast('Importo non valido', true); return; }
    if (amount > abs + 0.001) { showToast('Importo maggiore del debito (' + fmtE(abs) + ' €)', true); return; }
    await settleParticipantPortion(personId, pending, amount);
    const full = abs - amount < 0.001;
    showToast(full ? '✅ Conto saldato con ' + person.name : '✅ Saldati ' + fmtE(amount) + ' €', false);
    renderFriendsTab();
}

async function settleParticipantPortion(personId, pendingRecords, amount) {
    const round2 = v => Math.round(v * 100) / 100;
    let remaining = amount;
    const affectedExpenseIds = new Set();
    for (const rec of pendingRecords.sort((a, b) => (a.created_at || 0) - (b.created_at || 0))) {
        if (remaining <= 0.001) break;
        const recShare = Number(rec.share_amount) || 0;
        const recPaid = Number(rec.paid_amount) || 0;
        const debt = recShare - recPaid;
        if (Math.abs(debt) < 0.001) continue;
        affectedExpenseIds.add(String(rec.shared_expense_id));
        const taken = Math.min(remaining, Math.abs(debt));
        remaining = Math.round((remaining - taken) * 100) / 100;
        if (taken >= Math.abs(debt) - 0.001) {
            rec.settled = true;
            await db.sharedExpenseParticipants.put(rec);
        } else if (debt > 0) {
            rec.share_amount = round2(recShare - taken);
            await db.sharedExpenseParticipants.put(rec);
            await db.sharedExpenseParticipants.put({
                id: genId(),
                shared_expense_id: rec.shared_expense_id,
                person_id: personId,
                participant_name: rec.participant_name,
                share_amount: taken,
                paid_amount: 0,
                split_value: rec.split_value != null ? rec.split_value : null,
                settled: true,
                created_at: Date.now()
            });
        } else {
            rec.paid_amount = round2(recPaid - taken);
            await db.sharedExpenseParticipants.put(rec);
            await db.sharedExpenseParticipants.put({
                id: genId(),
                shared_expense_id: rec.shared_expense_id,
                person_id: personId,
                participant_name: rec.participant_name,
                share_amount: 0,
                paid_amount: taken,
                split_value: rec.split_value != null ? rec.split_value : null,
                settled: true,
                created_at: Date.now()
            });
        }
    }
    const friend = people.find(pp => pp.id === personId);
    const friendUid = friend ? friend.user_id : null;
    if (friendUid && affectedExpenseIds.size) {
        try {
            const debts = await db.sharedDebts.toArray();
            const mine = debts.filter(d =>
                affectedExpenseIds.has(String(d.expense_id)) &&
                (d.debtor_user_id === friendUid || d.creditor_user_id === friendUid) &&
                d.status !== 'settled'
            );
            let rem = amount;
            for (const d of mine) {
                const amt = Number(d.amount) || 0;
                const take = Math.min(rem, amt);
                rem = Math.round((rem - take) * 100) / 100;
                const next = round2(amt - take);
                await db.sharedDebts.update(d.id, { amount: next, status: next <= 0 ? 'settled' : d.status });
            }
        } catch (e) { console.error('[DB] sync shared_debts nel saldo:', e); }
    }
}
// =====================================================================
// RIPETIZIONI (Recurring Expenses Management)
// =====================================================================
async function renderRipetizioni() {
    const container = document.getElementById('ripetizioniList');
    if (!container) return;
    try {
        const allRaw = await db.expenses.toArray();
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
                <button class="ripetizione-delete" title="Elimina ripetizione futura" data-act="deleteRecurringGroup" data-args='["${safeGid}"]'>🗑️</button>
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

// =====================================================================
// BOTTOM SHEET WITH MACRO/MICRO CATEGORIES (ORIGINAL GRID INJECTION)
// =====================================================================
async function openBottomSheetFromMacro(macroGroup) {
    sheetCurrentMacroGroup = macroGroup;
    const overlay = document.getElementById('sheetOverlay');
    const sheet = document.getElementById('bottomSheet');
    
    if (!overlay || !sheet) return;
    
    // Applica il tema cromatico della macro al bottom sheet
    const theme = MACRO_THEME[macroGroup];
    if (theme) {
        sheet.style.setProperty('--macro-accent', theme.accent);
        sheet.style.setProperty('--macro-tint', theme.tint);
        sheet.style.setProperty('--macro-border', theme.border);
    }
    
    document.body.classList.add('sheet-open');
    document.body.style.overflow = 'hidden';
    overlay.classList.add('open');
    sheet.classList.add('open');
    
    // Render micro categories in the grid
    renderMicroCategoriesGrid(macroGroup);
    await renderMacroBudgetBadge(macroGroup);
    renderMacroRecentSpese(macroGroup);
    
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
    if (sheetTitle && theme) sheetTitle.style.color = theme.accent;
}

async function getCategoryForecasts() {
    const f = {};
    currentData.expenses.forEach(e => {
        if (e.planned > 0) f[e.category] = (f[e.category] || 0) + e.planned;
    });
    const prevMonth = getPreviousMonthStrings(document.getElementById('currentMonth').value, 1)[0];
    if (prevMonth) {
        const prev = await db.expenses.where('month').equals(prevMonth).toArray();
        prev.forEach(e => {
            if (!f[e.category] && e.actual > 0) f[e.category] = (f[e.category] || 0) + e.actual;
        });
    }
    return f;
}

async function renderMacroBudgetBadge(macroGroup) {
    const container = document.getElementById('macroSheetSubheader');
    if (!container) return;
    
    const cats = userMacroCategories[macroGroup] || [];
    const catSet = new Set(cats);
    let actual = 0;
    currentData.expenses.forEach(e => {
        if (catSet.has(e.category)) actual += e.actual;
    });
    
    const forecasts = await getCategoryForecasts();
    let previsti = 0;
    cats.forEach(c => { previsti += forecasts[c] || 0; });
    
    const pct = previsti > 0 ? Math.min(100, (actual / previsti) * 100) : 0;
    const barColor = previsti > 0
        ? (actual > previsti ? '#ef4444' : (pct >= 80 ? '#f59e0b' : ''))
        : '';
    
    container.style.display = 'block';
    container.innerHTML = `
        <div class="macro-budget-badge">
            <span class="badge-label">Speso: <b>${fmtEPlain(actual, 0)}</b> su ${fmtEPlain(previsti, 0)} previsti</span>
            <div class="badge-progress"><div class="badge-progress-bar" style="width: ${pct}%;${barColor ? ' background-color:' + barColor + ';' : ''}"></div></div>
        </div>
    `;
}

function renderMacroRecentSpese(macroGroup) {
    const container = document.getElementById('macroSheetRecent');
    if (!container) return;
    
    const cats = userMacroCategories[macroGroup] || [];
    const catSet = new Set(cats);
    const recent = currentData.expenses
        .filter(e => catSet.has(e.category))
        .map(e => ({ exp: e, amount: (e.actual || 0) > 0 ? e.actual : e.planned }))
        .filter(r => r.amount > 0)
        .sort((a, b) => {
            const da = a.exp.date || a.exp.month + '-01';
            const db = b.exp.date || b.exp.month + '-01';
            return db.localeCompare(da) || b.exp.id - a.exp.id;
        })
        .slice(0, 5);
    
    if (recent.length === 0) { container.style.display = 'none'; container.innerHTML = ''; return; }
    
    container.style.display = 'block';
    container.innerHTML = '<div class="macro-recent-title">Ultime spese</div><div class="macro-recent-list">' +
        recent.map(r => {
            const exp = r.exp;
            const dateStr = exp.date ? exp.date.split('-').reverse().slice(0, 2).join('/') : exp.month.split('-').reverse().slice(0, 2).join('/');
            return `
                <div class="macro-recent-row">
                    <div class="macro-recent-icon"><i class="fas ${getFaIcon(exp.category)}"></i></div>
                    <div class="macro-recent-main">
                        <div class="macro-recent-cat">${exp.category}</div>
                        ${exp.desc ? `<div class="macro-recent-desc">${exp.desc}</div>` : ''}
                    </div>
                    <span class="macro-recent-date">${dateStr}</span>
                    <span class="macro-recent-amount">${fmtEPlain(r.amount, 0)}</span>
                </div>
            `;
        }).join('') + '</div>';
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
    
    const theme = MACRO_THEME[macroGroup];
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
        let barColor = theme ? theme.accent : '#2a9d8f';
        if (pVal > 0) {
            perc = Math.min((aVal / pVal) * 100, 100);
            if (perc >= 100) barColor = '#ef4444';
            else if (perc > 70) barColor = '#f59e0b';
        }
        
        const card = document.createElement('div');
        card.className = 'bottom-sheet-cat-card';
        card.dataset.id = cat;
        card.innerHTML = `
            <div class="cat-icon-wrap">
                <i class="fas ${faIcon}"></i>
            </div>
            <span class="cat-name">${cat}</span>
            <span class="cat-speso">${fmtEPlain(aVal, 0)}</span>
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

    // Hide budget banner (only visible on category selection screen)
    const subheader = document.getElementById('macroSheetSubheader');
    if (subheader) subheader.style.display = 'none';
    
    // Update title
    const sheetTitle = document.getElementById('selected-category-title');
    if (sheetTitle) sheetTitle.textContent = categoryName;
    if (sheetTitle) sheetTitle.style.color = '';
    
    // Reset inputs
    const amountInput = document.getElementById('amountInput');
    const sheetDate = document.getElementById('sheetDate');
    const toggleOptions = document.querySelectorAll('.toggle-option');
    
    if (amountInput) amountInput.value = '';
    if (sheetDate) sheetDate.value = new Date().toISOString().slice(0, 10);
    clearReceiptPreview();
    
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
    
    const backTheme = sheetCurrentMacroGroup ? MACRO_THEME[sheetCurrentMacroGroup] : null;
    if (sheetTitle && backTheme) sheetTitle.style.color = backTheme.accent;

    // Restore budget banner on category selection screen
    const subheader = document.getElementById('macroSheetSubheader');
    if (subheader && sheetCurrentMacroGroup) subheader.style.display = '';
    
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

// Swipe-to-dismiss per bottom sheet (pointer events: touch + mouse)
function setupSheetSwipe(sheetId, closeFn) {
    const sheet = document.getElementById(sheetId);
    if (!sheet) return;
    const dragTargets = [
        sheet.querySelector('.drag-handle-wrapper'),
        sheet.querySelector('.bottom-sheet-header')
    ].filter(Boolean);
    if (dragTargets.length === 0) return;

    let startY = 0;
    let deltaY = 0;
    let dragging = false;

    const onStart = (e) => {
        if (!sheet.classList.contains('open') || e.button > 0) return;
        dragging = true;
        startY = e.clientY;
        deltaY = 0;
        sheet.classList.add('dragging');
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) { /* noop */ }
    };

    const onMove = (e) => {
        if (!dragging) return;
        deltaY = e.clientY - startY;
        if (deltaY < 0) deltaY = 0;
        sheet.style.transform = `translate3d(0, ${deltaY}px, 0)`;
        e.preventDefault();
    };

    const onEnd = () => {
        if (!dragging) return;
        dragging = false;
        const threshold = Math.min(120, sheet.offsetHeight * 0.35);
        sheet.classList.remove('dragging');
        sheet.style.transform = '';
        if (deltaY > threshold) {
            closeFn();
        }
        deltaY = 0;
    };

    dragTargets.forEach(el => {
        el.addEventListener('pointerdown', onStart);
        el.addEventListener('pointermove', onMove);
        el.addEventListener('pointerup', onEnd);
        el.addEventListener('pointercancel', onEnd);
    });
}

// Initialize swipe handlers when DOM ready
document.addEventListener('DOMContentLoaded', () => {
    setupSheetSwipe('bottomSheet', closeTransactionSheet);
    setupSheetSwipe('incomeBottomSheet', closeIncomeSheet);
    setupSheetSwipe('futureBottomSheet', closeFutureSheet);
});

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
    const sheetDate = document.getElementById('sheetDate');
    const sheetNote = document.getElementById('sheetNote');
    const saveBtn = document.getElementById('saveTransactionBtn');
    
    const amount = getSheetAmount();
    
    if (amount <= 0) {
        alert('Inserisci un importo maggiore di zero');
        return;
    }
    
    const date = sheetDate?.value || new Date().toISOString().slice(0, 10);
    const note = sheetNote?.value.trim() || '';

    if (editingExpenseId) {
        // EDIT MODE
        const originalIdx = currentData.expenses.findIndex(e => e.id === editingExpenseId);
        if (originalIdx === -1) { editingExpenseId = null; return; }

        const originalExp = currentData.expenses[originalIdx];
        const originalType = originalExp.planned > 0 && originalExp.actual === 0 ? 'planned' : 'actual';
        const newType = sheetTransactionType;
        const editMonth = date.slice(0, 7);

        if (originalType === newType) {
            // CASO A: same type - update in place
            originalExp.month = editMonth;
            originalExp.date = date;
            originalExp.category = sheetSelectedCategory;
            originalExp.desc = note || 'Aggiunto da mobile';
            originalExp.planned = newType === 'planned' ? amount : 0;
            originalExp.actual = newType === 'actual' ? amount : 0;
            currentData.expenses[originalIdx] = originalExp;
            await db.expenses.put(originalExp);
        } else {
            // CASO B: type changed - keep original untouched, create new clone
            if (originalType === 'planned' && newType === 'actual') {
                originalExp.settled = true;
                await db.expenses.put(originalExp);
            }
            const cloneExp = {
                id: Date.now(),
                month: editMonth,
                date: date,
                category: sheetSelectedCategory,
                desc: note || 'Aggiunto da mobile',
                planned: newType === 'planned' ? amount : 0,
                actual: newType === 'actual' ? amount : 0,
                sharedPercentage: 0
            };
            currentData.expenses.push(cloneExp);
            await db.expenses.put(cloneExp);
        }

        editingExpenseId = null;
        closeTransactionSheet();
        await updateUI();
        showToast('Spesa aggiornata', false);
        return;
    }

    const sharedToggle = document.getElementById('sharedToggle');
    const isShared = sharedToggle?.checked;

    let myPart = amount;
    let otherPart = 0;
    let sharedPct = 0;
    let splitRes = null;

    if (isShared) {
        autoFixSplitValues(sharedSplitState, amount);
        splitRes = computeSharedSplits(sharedSplitState, amount);
        if (splitRes.error) {
            showToast(splitRes.error, true);
            return;
        }
        const meId = getSharedMeId();
        const meRec = splitRes.records.find(r => r.personId === meId) || splitRes.records[0];
        myPart = meRec ? meRec.shareAmount : amount;
        otherPart = Math.max(0, amount - myPart);
        sharedPct = amount > 0 ? Math.round(myPart / amount * 100) : 0;
    }

    let exp;
    if (isShared && splitRes) {
        const meId = getSharedMeId();
        const meRec = splitRes.records.find(r => r.personId === meId) || splitRes.records[0];
        const mePaid = meRec ? meRec.paidAmount : 0;
        exp = {
            id: Date.now(),
            month, date,
            category: sheetSelectedCategory,
            desc: note || 'Aggiunto da mobile',
            planned: myPart,
            actual: sheetTransactionType === 'actual' && mePaid > 0 ? Math.min(mePaid, myPart) : 0,
            sharedPercentage: sharedPct,
            isShared: true,
            sharedPayer: mePaid > 0 ? 'me' : 'them',
            sharedPersonId: splitRes.records.length === 2 ? (splitRes.records.find(r => r.personId !== meId) || {}).personId : undefined,
            sharedGroupId: sharedSplitState.groupId || undefined
        };
    } else {
        exp = {
            id: Date.now(),
            month, date,
            category: sheetSelectedCategory,
            desc: note || 'Aggiunto da mobile',
            planned: sheetTransactionType === 'planned' ? amount : 0,
            actual: sheetTransactionType === 'actual' ? amount : 0,
            sharedPercentage: 0
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

        // Link dello scontrino in analisi alla spesa appena salvata
        if (receiptJobId) {
            await db.receiptJobs.update(receiptJobId, { expense_id: exp.id, updated_at: Date.now() });
        }

        currentData.expenses.push(exp);
        await db.expenses.put(exp);

        if (isShared && splitRes && splitRes.records.some(r => r.personId !== getSharedMeId())) {
            const r = await saveSharedSplitsV2(exp.id, amount, sharedSplitState);
            if (r.error) {
                currentData.expenses.pop();
                showToast(r.error, true);
                return;
            }
        }

        if (isRecurring) {
            await saveRecurringClones(exp, recUntilEl?.value || '', exp.recurringGroupId);
        }

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

    // Amount input: select all on focus + live refresh of split preview
    const amountInput = document.getElementById('amountInput');
    if (amountInput) {
        amountInput.addEventListener('focus', (e) => e.target.select());
        amountInput.addEventListener('input', () => {
            const panel = document.getElementById('sharedPanel');
            if (panel && panel.classList.contains('active')) refreshSharedPanelUI('sharedParticipants');
        });
    }

    // Note actions: foto scontrino (camera / allegato) -> Vision IA -> importo
    setupReceiptNoteActions();
})();

// ===== RICEVUTE: FOTO SCONTRINO -> ANALISI ASINCRONA -> CONFERMA =====
let receiptPending = false;      // upload in corso nello sheet
let receiptObjectUrl = null;     // preview temporanea
let receiptJobId = null;         // job attivo legato allo sheet aperto
let receiptPollTimer = null;     // polling notifiche (10s)
let receiptBannerJob = null;     // job mostrato nella barra di conferma
let receiptNotified = {};        // jobId -> true (evita notifiche doppie)

function setupReceiptNoteActions() {
    const camBtn = document.getElementById('btnNoteCamera');
    const attachBtn = document.getElementById('btnNoteAttach');
    const camInput = document.getElementById('receiptCamInput');
    const attachInput = document.getElementById('receiptAttachInput');
    if (camBtn && camInput) camBtn.addEventListener('click', () => { if (!receiptPending) camInput.click(); });
    if (attachBtn && attachInput) attachBtn.addEventListener('click', () => { if (!receiptPending) attachInput.click(); });
    if (camInput) camInput.addEventListener('change', () => handleReceiptFile(camInput.files && camInput.files[0], camInput));
    if (attachInput) attachInput.addEventListener('change', () => handleReceiptFile(attachInput.files && attachInput.files[0], attachInput));
    const clearBtn = document.getElementById('receiptPreviewClear');
    if (clearBtn) clearBtn.addEventListener('click', clearReceiptPreview);

    // Barra di conferma importo scontrino
    const confirmBtn = document.getElementById('receiptConfirmBtn');
    const dismissBtn = document.getElementById('receiptConfirmDismiss');
    if (confirmBtn) confirmBtn.addEventListener('click', () => {
        const job = receiptBannerJob;
        if (!job) return;
        hideReceiptBanner();
        if (job.status === 'done') {
            confirmReceiptJob(job);
        } else {
            delete receiptNotified[job.id];
            invokeProcessReceipt(job.id);
            showToast('Nuova analisi avviata', false);
        }
    });
    if (dismissBtn) dismissBtn.addEventListener('click', () => {
        if (receiptBannerJob) localStorage.setItem('eb_receipt_ignored_' + receiptBannerJob.id, '1');
        hideReceiptBanner();
    });

    // Polling: cerca job pendenti non ancora notificati
    startReceiptPolling();
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') { checkReceiptJobs(); startReceiptPolling(); }
    });
}

function clearReceiptPreview() {
    // Se lo sheet si chiude senza salvare, elimina il job orfano + foto (mai persistite)
    if (receiptJobId && window.supabaseUser) {
        const jobId = receiptJobId;
        receiptJobId = null;
        (async () => {
            try {
                const jobs = await db.receiptJobs.toArray();
                const job = jobs.find(j => j.id === jobId);
                if (job && !job.expense_id) {
                    await db.receiptJobs.delete(jobId);
                    await supabaseClient.storage.from('receipts').remove([window.supabaseUser.id + '/' + jobId + '.jpg']);
                }
            } catch (e) { console.warn('[RICEVUTE] cleanup job:', e); }
        })();
    }
    receiptJobId = null;
    const wrap = document.getElementById('receiptPreviewWrap');
    const img = document.getElementById('receiptPreview');
    if (img) img.removeAttribute('src');
    if (wrap) wrap.style.display = 'none';
    if (receiptObjectUrl) { URL.revokeObjectURL(receiptObjectUrl); receiptObjectUrl = null; }
    receiptPending = false;
}

async function handleReceiptFile(file, input) {
    if (input) input.value = '';
    if (!file) return;
    if (receiptPending) return;
    if (!/^image\//.test(file.type)) { showToast('Seleziona un\'immagine', true); return; }
    if (file.size > 10 * 1024 * 1024) { showToast('Immagine troppo grande (max 10 MB)', true); return; }

    const wrap = document.getElementById('receiptPreviewWrap');
    const img = document.getElementById('receiptPreview');
    const status = document.getElementById('receiptPreviewStatus');
    if (!wrap || !img || !status) return;

    try {
        const dataUri = await downscaleReceiptImage(file);
        if (receiptObjectUrl) URL.revokeObjectURL(receiptObjectUrl);
        receiptObjectUrl = URL.createObjectURL(file);
        img.src = receiptObjectUrl;
        wrap.style.display = 'flex';
        status.textContent = 'In analisi in background…';
        await startReceiptJob(dataUri);
    } catch (err) {
        showToast('Errore lettura immagine: ' + err.message, true);
        clearReceiptPreview();
    }
}

function downscaleReceiptImage(file) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const imgEl = new Image();
        imgEl.onload = () => {
            try {
                const MAX = 1280;
                const scale = Math.min(1, MAX / Math.max(imgEl.width, imgEl.height));
                const w = Math.max(1, Math.round(imgEl.width * scale));
                const h = Math.max(1, Math.round(imgEl.height * scale));
                const canvas = document.createElement('canvas');
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext('2d');
                if (!ctx) throw new Error('canvas non disponibile');
                ctx.drawImage(imgEl, 0, 0, w, h);
                resolve(canvas.toDataURL('image/jpeg', 0.75));
            } catch (e) {
                reject(e);
            } finally {
                URL.revokeObjectURL(url);
            }
        };
        imgEl.onerror = () => { URL.revokeObjectURL(url); reject(new Error('immagine non leggibile')); };
        imgEl.src = url;
    });
}

// Avvia il job: upload foto nello storage + riga receipt_jobs + invocazione
// fire-and-forget di process-receipt (nessuna attesa nello sheet)
async function startReceiptJob(dataUri) {
    receiptPending = true;
    try {
        const uid = window.supabaseUser ? window.supabaseUser.id : null;
        if (!uid) { showToast('Devi essere autenticato per analizzare lo scontrino', true); return; }
        const jobId = genId();
        const path = uid + '/' + jobId + '.jpg';
        const blob = await (await fetch(dataUri)).blob();
        const { error: upErr } = await supabaseClient.storage.from('receipts').upload(path, blob, { contentType: 'image/jpeg', upsert: false });
        if (upErr) throw upErr;
        await db.receiptJobs.put({
            id: jobId,
            user_id: uid,
            expense_id: null,
            status: 'pending',
            created_at: Date.now(),
            updated_at: Date.now()
        });
        receiptJobId = jobId;
        invokeProcessReceipt(jobId);
        showToast('Scontrino in analisi in background', false);
    } catch (err) {
        receiptJobId = null;
        showToast('Errore upload scontrino: ' + err.message, true);
        clearReceiptPreview();
    } finally {
        receiptPending = false;
    }
}

async function invokeProcessReceipt(jobId) {
    try {
        await window.supabaseClient.functions.invoke('process-receipt', { body: { jobId } });
    } catch (err) {
        console.warn('[RICEVUTE] process-receipt fallita (il polling ripeterà):', err.message);
    }
}

function startReceiptPolling() {
    if (receiptPollTimer) return;
    checkReceiptJobs();
    receiptPollTimer = setInterval(checkReceiptJobs, 10000);
}

async function checkReceiptJobs() {
    if (!window.supabaseUser) return;
    let jobs = [];
    try { jobs = await db.receiptJobs.toArray(); } catch (e) { return; }
    for (const j of jobs) {
        const ts = j.updated_at || j.created_at || 0;
        if (j.status === 'processing' && ts && Date.now() - ts > 120000) {
            invokeProcessReceipt(j.id); // self-healing: job rimasto in processing
        }
        if ((j.status === 'done' || j.status === 'failed') && !receiptNotified[j.id] && !localStorage.getItem('eb_receipt_ignored_' + j.id)) {
            receiptNotified[j.id] = true;
            notifyReceiptJob(j);
        }
    }
}

function notifyReceiptJob(job) {
    showReceiptBanner(job);
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        const body = job.status === 'done'
            ? (job.importo != null ? 'Importo: ' + fmtEPlain(job.importo, 2) + '. Tocca per confermare la spesa.' : 'Scontrino analizzato, ma importo non rilevato.')
            : 'Analisi non riuscita. Tocca per riprovare.';
        const n = new Notification('🧾 Scontrino analizzato', {
            body,
            icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 192 192'><rect width='192' height='192' rx='24' fill='%231e293b'/><text y='120' x='96' font-size='100' text-anchor='middle'>🧾</text></svg>"
        });
        n.onclick = () => { window.focus(); if (job.status === 'done') confirmReceiptJob(job); };
    }
}

function showReceiptBanner(job) {
    receiptBannerJob = job;
    const bar = document.getElementById('receiptConfirmBar');
    const msg = document.getElementById('receiptConfirmMsg');
    const confirmBtn = document.getElementById('receiptConfirmBtn');
    if (!bar || !msg || !confirmBtn) return;
    if (job.status === 'done') {
        msg.textContent = job.importo != null ? ('🧾 Importo scontrino: ' + fmtEPlain(job.importo, 2)) : '🧾 Scontrino analizzato (importo non rilevato)';
        confirmBtn.textContent = 'Conferma spesa';
    } else {
        msg.textContent = '⚠️ Analisi scontrino non riuscita';
        confirmBtn.textContent = 'Riprova';
    }
    bar.style.display = 'flex';
}

function hideReceiptBanner() {
    receiptBannerJob = null;
    const bar = document.getElementById('receiptConfirmBar');
    if (bar) bar.style.display = 'none';
}

async function confirmReceiptJob(job) {
    hideReceiptBanner();
    if (job.expense_id) {
        // Consuma il job: la foto non serve più
        try {
            await db.receiptJobs.delete(job.id);
            if (window.supabaseUser) await supabaseClient.storage.from('receipts').remove([window.supabaseUser.id + '/' + job.id + '.jpg']);
        } catch (e) { console.warn('[RICEVUTE] cleanup job confermato:', e); }
        editExpense(Number(job.expense_id));
        if (job.importo != null) {
            const amountInput = document.getElementById('amountInput');
            if (amountInput) amountInput.value = (Math.round(job.importo * 100) / 100).toFixed(2).replace('.', ',');
        }
        if (job.negozio) {
            const noteEl = document.getElementById('sheetNote');
            if (noteEl && !noteEl.value.trim()) noteEl.value = job.negozio;
        }
    } else {
        showToast('Spesa non trovata per questo scontrino', true);
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

// Initialize future tab bottom sheet (action hub, overlay, swipe-to-close)
document.addEventListener('DOMContentLoaded', () => {
    const dlFormWrap = document.getElementById('dlFormWrap-d');
    if (dlFormWrap) dlFormWrap.innerHTML = plannerFormHTML('d');
    const actionHub = document.getElementById('futureActionHub');
    if (actionHub) {
        actionHub.querySelectorAll('[data-action]').forEach(btn => {
            btn.addEventListener('click', () => {
                const action = btn.getAttribute('data-action');
                if (action === 'simula') toggleFutureSimRow();
                else if (action === 'scadenze') openFutureSheet('scadenze');
                else if (action === 'ia') openFutureSheet('ia');
            });
        });
    }
    const futureOverlay = document.getElementById('futureSheetOverlay');
    if (futureOverlay) futureOverlay.addEventListener('click', closeFutureSheet);
    const futureSheet = document.getElementById('futureBottomSheet');
    if (futureSheet) futureSheet.addEventListener('click', (e) => e.stopPropagation());
    setupFutureSwipeToClose();
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

// =====================================================================
// EMOJI PICKER (categorie impostazioni)
// =====================================================================
(function setupEmojiPicker() {
    const pickerBtn = document.getElementById('emojiPickerBtn');
    const emojiInput = document.getElementById('emojiInput');
    if (!pickerBtn || !emojiInput) return;
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
})();

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
            categoryIconMap[name] = chosenEmoji || categoryIconMap[name] || MACRO_ICON[macro] || '🍀';
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
            categoryIconMap[name] = chosenEmoji && chosenEmoji !== '🍀' ? chosenEmoji : (MACRO_ICON[macro] || '🍀');
            await db.categories.put({name, macro, icon: categoryIconMap[name]});
        }
        rebuildUserCategories();
        saveMacroToLocalStorage();
        await updateGlobalVersion();
        input.value = '';
        renderCategoriesDropdown();
        renderCategorySettings();
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
    updateUI();
}

// =====================================================================
// ADD / DELETE ENTRIES
// =====================================================================
async function addIncome() {
    const month = document.getElementById('currentMonth').value;
    const date = document.getElementById('incDate').value || new Date().toISOString().slice(0, 10);
    const desc = document.getElementById('incDesc').value.trim() || "Entrata";
    const amount = parseFloat(document.getElementById('incAmount').value) || 0;
    if (amount <= 0) { showToast('Inserisci un importo maggiore di zero', true); return; }
    let inc = {id: Date.now(), month, date, desc, amount};
    currentData.income.push(inc); await db.income.put(inc);
    document.getElementById('incDate').value = '';
    document.getElementById('incDesc').value = ''; document.getElementById('incAmount').value = '';
    updateUI(); checkDatabaseHealth();
}
async function addExpense() {
    const month = document.getElementById('currentMonth').value;
    const date = document.getElementById('expDate').value || new Date().toISOString().slice(0, 10);
    const cat = document.getElementById('expenseCategory').value;
    const desc = document.getElementById('expDesc').value.trim() || "Spesa";
    let planned = parseFloat(document.getElementById('expPlanned').value) || 0;
    let actual = parseFloat(document.getElementById('expActual').value) || 0;
    let shared = parseFloat(document.getElementById('expShared').value) || 0;
    if (planned === 0 && actual === 0) { showToast('Inserisci Stima o Pagato', true); return; }

    // Split con persona (parity col bottom sheet mobile)
    const sharedToggle = document.getElementById('sharedToggleDesktop');
    const isShared = sharedToggle?.checked;
    const total = actual > 0 ? actual : planned;
    let myPart = 0, otherPart = 0, sharedPct = 0, splitRes = null;
    if (isShared) {
        autoFixSplitValues(sharedSplitState, total);
        splitRes = computeSharedSplits(sharedSplitState, total);
        if (splitRes.error) { showToast(splitRes.error, true); return; }
        const meId = getSharedMeId();
        const meRec = splitRes.records.find(r => r.personId === meId) || splitRes.records[0];
        myPart = meRec ? meRec.shareAmount : total;
        otherPart = Math.max(0, total - myPart);
        sharedPct = total > 0 ? Math.round(myPart / total * 100) : 0;
    }

    if (isShared && splitRes) {
        const meId = getSharedMeId();
        const meRec = splitRes.records.find(r => r.personId === meId) || splitRes.records[0];
        const mePaid = meRec ? meRec.paidAmount : 0;
        planned = myPart;
        actual = actual > 0 && mePaid > 0 ? Math.min(mePaid, myPart) : 0;
        shared = sharedPct;
    } else if (shared > 0 && shared <= 100) {
        planned = Math.round(planned * shared / 100 * 100) / 100;
        actual = Math.round(actual * shared / 100 * 100) / 100;
    }

    let exp = {
        id: Date.now(), month, date, category: cat, desc, planned, actual,
        sharedPercentage: shared,
        isShared: isShared ? true : undefined,
        sharedPayer: isShared ? (splitRes && splitRes.records.some(r => r.paidAmount > 0 && r.personId === getSharedMeId()) ? 'me' : 'them') : undefined,
        sharedPersonId: isShared && splitRes ? (splitRes.records.length === 2 ? (splitRes.records.find(r => r.personId !== getSharedMeId()) || {}).personId : undefined) : undefined,
        sharedGroupId: isShared ? (sharedSplitState.groupId || undefined) : undefined
    };

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

        if (isShared && splitRes && splitRes.records.some(r => r.personId !== getSharedMeId())) {
            const r = await saveSharedSplitsV2(exp.id, total, sharedSplitState);
            if (r.error) {
                currentData.expenses = currentData.expenses.filter(e => e.id !== exp.id);
                showToast(r.error, true);
                return;
            }
        }

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
        if (recUntilDesktop) recUntilDesktop.value = '';
        resetExpenseAdvancedForm();
        updateUI();
        checkDatabaseHealth();
    } catch (err) {
        console.error('[DB] Errore salvataggio spesa:', err);
        currentData.expenses = currentData.expenses.filter(e => e.id !== exp.id);
        showToast('Errore nel salvare la spesa', true);
    }
}

function resetExpenseAdvancedForm() {
    const toggle = document.getElementById('sharedToggleDesktop');
    const panel = document.getElementById('sharedPanelDesktop');
    const sel = document.getElementById('sharedPersonDesktop');
    const fields = document.getElementById('sharedDetailFieldsDesktop');
    if (toggle) toggle.checked = false;
    if (panel) panel.classList.remove('active');
    if (sel) sel.value = '';
    if (fields) fields.innerHTML = '';
    resetSharedSplitState();
}
async function payExpense(id) {
    const exp = currentData.expenses.find(i => i.id === id); if (!exp) return;
    const val = prompt("Importo effettivo pagato (€):", exp.planned.toFixed(2));
    if (val !== null) {
        const p = parseFloat(val.replace(',','.')); if (!isNaN(p)) { exp.actual = p; exp.settled = true; await db.expenses.update(id, {actual: p, settled: true}); if (exp.debtId) await markDebtSettled(exp.debtId); updateUI(); }
    }
}
async function deleteEntry(type, id) {
    if (type === 'income') { currentData.income = currentData.income.filter(i => i.id !== id); await db.income.delete(id); }
    else { currentData.expenses = currentData.expenses.filter(i => i.id !== id); await db.expenses.delete(id); }
    updateUI(); checkDatabaseHealth();
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
// SCADENZARIO ANNUALE & PIANIFICATORE
// =====================================================================
async function loadAnnualDeadlines() {
    annualDeadlines = await db.annualDeadlines.toArray();
    renderDeadlineListFor('d');
    checkAnnualAlertForCurrentMonth();
    if (localStorage.getItem('push_notifications_enabled') === 'true') checkPushNotifications();
}
async function deleteAnnualDeadline(id) {
    if (confirm("Eliminare questa scadenza?")) {
        await db.annualDeadlines.delete(id);
        await updateGlobalVersion();
        annualDeadlines = await db.annualDeadlines.toArray();
        renderDeadlineListFor('d'); renderDeadlineListFor('s');
        checkAnnualAlertForCurrentMonth();
        updateFutureDashboard();
    }
}
async function toggleDeadlinePaid(id, isPaid) {
    await db.annualDeadlines.update(id, {isPaid});
    await updateGlobalVersion();
    annualDeadlines = await db.annualDeadlines.toArray();
    renderDeadlineListFor('d'); renderDeadlineListFor('s');
    checkAnnualAlertForCurrentMonth();
    updateFutureDashboard();
}
function renderAnnualDeadlines() {
    renderDeadlineListFor('d');
}
function checkAnnualAlertForCurrentMonth() {
    const currentMonthVal = document.getElementById('currentMonth').value;
    const alertBox = document.getElementById('annualMonthAlert'); if (!alertBox) return;
    const match = (annualDeadlines||[]).filter(d => !d.isPaid && (d.month === currentMonthVal || (d.recurring && d.month <= currentMonthVal && currentMonthVal <= (d.endMonth || d.month))));
    if (match.length > 0) {
        let txt = `🔔 <strong>Scadenze annuali da pagare questo mese:</strong><ul style="margin:6px 0 0 18px;">`;
        match.forEach(d => { txt += `<li>${d.desc}${d.day ? ' (g.'+d.day+')' : ''}${d.recurring ? ' (ricorrente)' : ''}: <strong>${fmtE(d.amount)}</strong></li>`; });
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
// GRIGLIA CATEGORIE DESKTOP (gauge a semicerchio)
// =====================================================================
function renderCategoryGridDesktop(catSums) {
    const grid = document.getElementById('categoryGridDesktop');
    if (!grid) return;

    grid.innerHTML = '';
    const sorted = [...userCategories].sort();

    sorted.forEach(cat => {
        const pVal = catSums[cat]?.planned || 0;
        const aVal = catSums[cat]?.actual || 0;
        const hasActivity = pVal > 0 || aVal > 0;
        const over = pVal > 0 && aVal > pVal;

        let status = 'ok';
        if (!hasActivity) status = 'empty';
        else if (over) status = 'over';
        else if (pVal > 0 && aVal / pVal > 0.8) status = 'warning';

        const pct = pVal > 0 ? Math.min(100, Math.round((aVal / pVal) * 100)) : (aVal > 0 ? 100 : 0);
        const color = status === 'over' ? '#ef4444' : status === 'warning' ? '#f59e0b' : '#10b981';
        const isSelected = selectedFilterCategory === cat;

        const card = document.createElement('button');
        card.type = 'button';
        card.className = `cat-grid-card status-${status}`;
        if (isSelected) card.classList.add('selected');
        card.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
        card.dataset.category = cat;

        card.innerHTML = `
            <span class="cat-arc-wrap">
                ${gaugeArcSVG(pct, color)}
                <span class="cat-arc-icon">${getCatIcon(cat)}</span>
            </span>
            <span class="cat-grid-name" title="${cat}">${cat}</span>
            <span class="cat-grid-vals">${hasActivity ? fmtE(aVal) : '—'} <span style="color:#94a3b8;">/</span> <b class="${over ? 'over-budget' : ''}">${hasActivity ? fmtE(pVal) : '—'}</b></span>
            ${over ? `<span class="cat-grid-diff diff-minus">⚠ Sforato di ${fmtE(aVal - pVal)}</span>` : ''}
        `;
        card.onclick = () => filterByCategory(cat);
        grid.appendChild(card);
    });
}

function gaugeArcSVG(pct, color) {
    const LEN = 125.66; // π * raggio 40 (semicirconferenza)
    const dash = Math.max(0, Math.min(100, pct)) / 100 * LEN;
    return `<svg class="cat-arc" viewBox="0 0 100 50" aria-hidden="true">
        <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" stroke="#eef2f7" stroke-width="9"/>
        <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" stroke="${color}" stroke-width="9" stroke-linecap="butt" stroke-dasharray="${dash.toFixed(2)} ${LEN.toFixed(2)}"/>
    </svg>`;
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
    const heroEntrateEl = document.getElementById('heroEntrateTotal');
    const heroPrevisteEl = document.getElementById('heroSpesePreviste');
    const heroSpeseEl = document.getElementById('heroSpeseSostenute');
    if (heroEntrateEl) heroEntrateEl.innerText = fmtE(totalIncome, 0);
    if (heroSpeseEl) heroSpeseEl.innerText = fmtE(totalActual, 0);
    if (heroPrevisteEl) {
        const forecasts = await getCategoryForecasts();
        let forecastTotal = 0;
        Object.values(forecasts).forEach(v => { forecastTotal += v; });
        heroPrevisteEl.innerText = fmtE(forecastTotal, 0);
    }
    renderMacroCards();
    renderHeroInsight();

    const month = document.getElementById('currentMonth').value;
    let mData = await db.months.get(month);
    await db.months.put({month, totalIncome, totalPlanned, totalActual, notes: mData?.notes||"", iaNotes: mData?.iaNotes||""});
    await updateGlobalVersion();

    // Sommario categorie - la griglia desktop legge gli stessi dati
    let catSums = {}; userCategories.forEach(c => catSums[c] = {planned:0, actual:0});
    currentData.expenses.forEach(exp => { if (catSums[exp.category]) { catSums[exp.category].planned += exp.planned; catSums[exp.category].actual += exp.actual; } });

    // Griglia categorie con arco SVG (desktop)
    renderCategoryGridDesktop(catSums);

    // Render griglia categorie per mobile
    renderCategoryGrid(catSums);

    renderCalendar();

    const btnClear = document.getElementById('btnClearAllFilters');
    // Lista voci (render isolato: la ricerca aggiorna solo la lista, non tutto il mese)
    renderEntriesList();

    // Grafici (solo con modal IA aperto; canvas nascosti = dimensione 0 per Chart.js)
    if (document.getElementById('iaNotesModal')?.classList.contains('active')) {
        renderDashboardCharts(totalIncome, totalPlanned, totalActual, catSums);
    }
}

function renderEntriesList() {
    const btnClear = document.getElementById('btnClearAllFilters');
    if (btnClear) btnClear.style.display = (selectedFilterDate || selectedFilterCategory || searchQuery !== "") ? 'inline-block' : 'none';

    const listContainer = document.getElementById('entriesList');
    if (!listContainer) return;
    listContainer.innerHTML = '';
    if (!selectedFilterDate && !selectedFilterCategory && searchQuery === "") {
        currentData.income.forEach(inc => {
            const incDate = inc.date ? inc.date.split('-').reverse().slice(0,2).join('/') : '–';
            const row = document.createElement('div'); row.className = 'item-row';
            row.innerHTML = `
                <span class="reg-left">
                    <span class="reg-dot" style="background:rgba(16,185,129,0.14);">💰</span>
                    <span class="reg-main">
                        <span class="reg-title"><strong>${inc.desc}</strong></span>
                        <span class="item-meta">${incDate}</span>
                    </span>
                </span>
                <span class="item-vals">
                    <div><span class="val-s" style="color:var(--entrate);font-weight:bold;">+${fmtE(inc.amount)}</span></div>
                    <div class="reg-actions"><button class="btn-del" data-act="deleteEntry" data-args='["income",${inc.id}]'>✕</button></div>
                </span>`;
            listContainer.appendChild(row);
        });
    }
    let filteredExp = currentData.expenses;
    if (selectedFilterDate) filteredExp = filteredExp.filter(e => e.date === selectedFilterDate);
    if (selectedFilterCategory) filteredExp = filteredExp.filter(e => e.category === selectedFilterCategory);
    if (searchQuery !== "") filteredExp = filteredExp.filter(e => (e.desc || '').toLowerCase().includes(searchQuery) || e.category.toLowerCase().includes(searchQuery) || (e.date || '').includes(searchQuery));
    filteredExp.sort((a,b) => (b.date || '').localeCompare(a.date || ''));
    if (filteredExp.length === 0 && currentData.expenses.length === 0 && currentData.income.length === 0) {
        listContainer.innerHTML = '<div class="comp-hint" style="text-align:center;padding:14px 0;">Nessuna voce per questo mese. Inserisci la prima spesa o entrata.</div>';
    }
    filteredExp.forEach(exp => {
        const isPending = exp.planned > 0 && exp.actual === 0;
        const isSettled = exp.settled === true;
        const fd = exp.date ? exp.date.split('-').reverse().slice(0,2).join('/') : '–';
        const sharedTxt = exp.sharedPercentage > 0 ? `<span class="reg-shared-pill">${exp.sharedPercentage}%</span>` : '';
        const row = document.createElement('div'); row.className = 'item-row';
        row.innerHTML = `
            <span class="reg-left">
                <span class="reg-dot" style="background:${getCategoryCardBg(exp.category)}">${getCatIcon(exp.category)}</span>
                <span class="reg-main">
                    <span class="reg-title">${exp.category}${isSettled ? '<span class="settled-badge">✓ Saldata</span>' : ''}${sharedTxt}</span>
                    <span class="item-meta">${fd} · ${exp.desc || 'senza nota'}</span>
                </span>
            </span>
            <span class="item-vals">
                <div>
                    ${exp.planned > 0 ? `<span class="val-p">Stima: ${fmtE(exp.planned)}</span>` : ''}
                    <span class="val-s ${isPending ? 'val-pending' : ''}">${exp.actual > 0 ? fmtE(exp.actual) : (isPending ? '⏳ Da pagare' : '—')}</span>
                </div>
                <div class="reg-actions">
                    ${isPending ? `<button class="btn-action btn-pay" data-act="payExpense" data-args='[${exp.id}]'>Paga</button>` : ''}
                    <button class="btn-del" data-act="deleteEntry" data-args='["expense",${exp.id}]'>🗑</button>
                </div>
            </span>`;
        row.style.cursor = 'pointer';
        row.addEventListener('click', (e) => {
            if (e.target.closest('button')) return;
            editExpense(exp.id);
        });
        listContainer.appendChild(row);
    });
}

async function renderDashboardCharts(totalIncome, totalPlanned, totalActual, catSums) {
    await ensureChartJs();
    const budgetCnv = document.getElementById('budgetChart');
    const categoryCnv = document.getElementById('categoryChart');
    if (!budgetCnv || !categoryCnv) return;
    if (chartB) chartB.destroy();
    chartB = new Chart(budgetCnv.getContext('2d'), {
        type:'bar', data:{labels:['Entrate','Spese Previste','Spese Sostenute'],datasets:[{data:[totalIncome,totalPlanned,totalActual],backgroundColor:['#10b981','#f97316','#ef4444'],borderRadius:6}]},
        options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},animation:{duration:0}}
    });
    if (chartC) chartC.destroy();
    const activeCats = Object.keys(catSums).filter(c => catSums[c].actual > 0);
    chartC = new Chart(categoryCnv.getContext('2d'), {
        type:'doughnut', data:{labels:activeCats,datasets:[{data:activeCats.map(c => catSums[c].actual),backgroundColor:['#3b82f6','#8b5cf6','#475569','#0d9488','#10b981','#f59e0b','#f97316','#ef4444']}]},
        options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom',labels:{boxWidth:8,font:{size:9}}}},animation:{duration:0}}
    });
}

// =====================================================================
// CALENDARIO
// =====================================================================
function renderCalendar() {
    const grid = document.getElementById('calendarGridCompact') || document.getElementById('calendarGrid');
    if (!grid) return; grid.innerHTML = '';
    const monthVal = document.getElementById('currentMonth').value; if (!monthVal) return;
    const range = getMonthRange(monthVal);
    const plannedDates = new Set();
    currentData.expenses.forEach(e => { if (e.planned > 0) plannedDates.add(e.date); });
    const deadlineDates = new Set();
    let monthWideDeadline = false;
    annualDeadlines.forEach(a => {
        if (a.isPaid) return;
        if (a.month === monthVal && !a.day) monthWideDeadline = true;
        else if (a.month === monthVal && a.day) deadlineDates.add(a.month + '-' + String(a.day).padStart(2, '0'));
    });
    const recurringDeadline = annualDeadlines.some(a => !a.isPaid && a.recurring && a.month <= monthVal && monthVal <= (a.endMonth || a.month));
    ['L','M','M','G','V','S','D'].forEach(d => { let h = document.createElement('div'); h.className = 'calendar-day-header'; h.innerText = d; grid.appendChild(h); });
    let firstDayIndex = (range.start.getDay()+6)%7;
    for (let i=0; i<firstDayIndex; i++) { let e = document.createElement('div'); e.className = 'calendar-day empty'; grid.appendChild(e); }
    let cursor = new Date(range.start);
    while (cursor <= range.end) {
        const ds = cursor.toISOString().slice(0,10);
        const hasPlanned = plannedDates.has(ds);
        const hasDeadline = monthWideDeadline || deadlineDates.has(ds) || recurringDeadline;
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
function scrollToRegistry() {
    const card = document.getElementById('entriesCard');
    const panel = card ? card.closest('.layout-column') : null;
    if (panel && isDesktop()) panel.scrollTo({ top: 0, behavior: 'smooth' });
    else document.getElementById('listTitle')?.scrollIntoView({ behavior: 'smooth' });
}
function filterByCategory(cat) { selectedFilterCategory = cat; selectedFilterDate = null; scrollToRegistry(); updateUI(); }
function filterByDate(ds) { selectedFilterDate = ds; selectedFilterCategory = null; scrollToRegistry(); updateUI(); }
let searchDebounceTimer = null;
function handleSearch() {
    searchQuery = document.getElementById('searchInput').value.toLowerCase();
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(renderEntriesList, 150);
}
function clearAllFilters() { selectedFilterDate = null; selectedFilterCategory = null; searchQuery = ""; const s = document.getElementById('searchInput'); if(s) s.value = ""; updateUI(); }
function switchFormTab(name) {
    const cap = name.charAt(0).toUpperCase() + name.slice(1);
    document.querySelectorAll('.layout-column.left-panel .form-tab').forEach(t => t.classList.toggle('active', t.dataset.formtab === name));
    document.querySelectorAll('.layout-column.left-panel .form-pane').forEach(p => p.classList.toggle('active', p.id === 'formPane' + cap));
}
function toggleSection(id, el) { document.getElementById(id).classList.toggle('show'); el.classList.toggle('active'); }

// =====================================================================
// RENDICONTO - Liste Entrate / Spese nel popup
// =====================================================================
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
            <button class="income-row-del" data-id="${inc.id}" title="Elimina">🗑</button>
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
            <button class="income-row-del" data-id="${exp.id}" title="Elimina">🗑</button>
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

// =====================================================================
// POPUP RICERCA (mobile)
// =====================================================================
function openSearchPopup() {
    const popup = document.getElementById('searchPopup');
    if (!popup) return;
    popup.classList.add('active');
    document.body.classList.add('popup-open');
    const input = document.getElementById('searchPopupInput');
    if (input) input.value = '';
    searchDatasetCache = null;
    const resultsList = document.getElementById('searchResultsList');
    if (resultsList) resultsList.innerHTML = '<div class="income-list-empty">Digita per cercare...</div>';
    const periodSelect = document.getElementById('searchPeriodSelect');
    if (periodSelect) periodSelect.value = 'current';
    const customInput = document.getElementById('searchCustomMonth');
    if (customInput) customInput.style.display = 'none';
    if (input) input.focus();
}

function closeSearchPopup(event) {
    if (event && event.target !== event.currentTarget) return;
    const popup = document.getElementById('searchPopup');
    if (popup) { popup.classList.remove('active'); document.body.classList.remove('popup-open'); }
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

// Ricerca mobile: debounce 150ms + cache dataset per periodo (niente scan DB a ogni tasto)
let searchFilterTimer = null;
let searchDatasetCache = null;

async function filterSearchResults() {
    clearTimeout(searchFilterTimer);
    searchFilterTimer = setTimeout(() => runSearchFilter(), 150);
}

async function runSearchFilter() {
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
        const key = 'current:' + _month;
        if (!searchDatasetCache || searchDatasetCache.key !== key) {
            searchDatasetCache = { key, expenses: currentData.expenses, incomes: await getIncomesForMonth(_month) };
        }
        expenses = searchDatasetCache.expenses;
        incomes = searchDatasetCache.incomes;
    } else if (period === 'all') {
        if (!searchDatasetCache || searchDatasetCache.key !== 'all') {
            searchDatasetCache = { key: 'all', expenses: await db.expenses.toArray(), incomes: await db.income.toArray() };
        }
        expenses = searchDatasetCache.expenses;
        incomes = searchDatasetCache.incomes;
    } else if (period === 'custom') {
        const m = document.getElementById('searchCustomMonth').value;
        if (!m) { resultsList.innerHTML = '<div class="income-list-empty">Seleziona un mese.</div>'; return; }
        const key = 'custom:' + m;
        if (!searchDatasetCache || searchDatasetCache.key !== key) {
            searchDatasetCache = { key, expenses: await db.expenses.where('month').equals(m).toArray(), incomes: await db.income.where('month').equals(m).toArray() };
        }
        expenses = searchDatasetCache.expenses;
        incomes = searchDatasetCache.incomes;
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
    document.body.classList.add('popup-open');
    const respBox = document.getElementById('iaMonthResponse');
    if (respBox) { respBox.style.display = 'none'; respBox.innerText = ''; }
}

function closeIaMonthPopup(event) {
    if (event && event.target !== event.currentTarget) return;
    const popup = document.getElementById('iaMonthPopup');
    if (popup) { popup.classList.remove('active'); document.body.classList.remove('popup-open'); }
}

// =====================================================================
// MODAL IA & NOTE MESE (DESKTOP)
// =====================================================================
function openIaNotesModal() {
    const modal = document.getElementById('iaNotesModal');
    if (!modal) return;
    modal.classList.add('active');
    document.body.classList.add('popup-open');
    const currentMonth = document.getElementById('currentMonth').value;
    if (currentMonth) {
        const totals = { income: 0, planned: 0, actual: 0 };
        currentData.income.forEach(i => { totals.income += i.amount; });
        currentData.expenses.forEach(e => { totals.planned += e.planned; totals.actual += e.actual; });
        const catSums = {};
        userCategories.forEach(c => catSums[c] = { planned: 0, actual: 0 });
        currentData.expenses.forEach(exp => { if (catSums[exp.category]) { catSums[exp.category].planned += exp.planned; catSums[exp.category].actual += exp.actual; } });
        renderDashboardCharts(totals.income, totals.planned, totals.actual, catSums);
    }
}

function closeIaNotesModal(event) {
    if (event && event.target !== event.currentTarget) return;
    const modal = document.getElementById('iaNotesModal');
    if (modal) { modal.classList.remove('active'); document.body.classList.remove('popup-open'); }
}

// =====================================================================
// SETTINGS POPUPS (griglia a pulsanti → popup per sezione)
// =====================================================================
function openSettingsPopup(name) {
    const pop = document.getElementById('settingsPopup-' + name);
    if (!pop) return;
    pop.classList.add('active');
    document.body.classList.add('popup-open');
}
function closeSettingsPopup(event) {
    if (event && event.target !== event.currentTarget) return;
    document.querySelectorAll('#settings-tab .popup-overlay.active').forEach(p => p.classList.remove('active'));
    document.body.classList.remove('popup-open');
}

// Wiring tabs forms (pannello sinistro) + modal IA (desktop)
(function () {
    const wireTabs = (tabsSel, panesSel, key) => {
        const tabs = document.querySelectorAll(tabsSel);
        if (!tabs.length) return;
        tabs.forEach(tab => tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            const cap = tab.dataset[key].charAt(0).toUpperCase() + tab.dataset[key].slice(1);
            document.querySelectorAll(panesSel).forEach(p => p.classList.toggle('active', p.id === key + cap));
        }));
    };
    wireTabs('.layout-column.left-panel .form-tab', '.layout-column.left-panel .form-pane', 'formPane');
    wireTabs('.ia-notes-tabs .form-tab', '.ia-notes-pane', 'iaPane');
})();

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

    // Dati mese precedente per il confronto
    const prevMonth = getPreviousMonthStrings(currentMonth, 1)[0];
    let prevIncomeTot = 0, prevActualTot = 0, prevPlannedTot = 0;
    if (prevMonth) {
        const prevIncomes = await getIncomesForMonth(prevMonth);
        const prevExpenses = await db.expenses.where('month').equals(prevMonth).toArray();
        prevIncomeTot = prevIncomes.reduce((s, i) => s + i.amount, 0);
        prevActualTot = prevExpenses.reduce((s, e) => s + e.actual, 0);
        prevPlannedTot = prevExpenses.reduce((s, e) => s + e.planned, 0);
    }
    const pctDiff = (base, cur) => base > 0 ? Math.round(((cur - base) / base) * 100) : null;
    const fmtDiff = (d) => d === null ? 'n/d' : (d >= 0 ? '+' : '') + d + '%';
    const incDiff = pctDiff(prevIncomeTot, totalIncome);
    const actDiff = pctDiff(prevActualTot, totalActual);
    const plaDiff = pctDiff(prevPlannedTot, totalPlanned);

    const dataText = [
        `Mese: ${currentMonth}`,
        `Entrate totali: ${fmtEPlain(totalIncome)}`,
        `Spese sostenute: ${fmtEPlain(totalActual)}`,
        `Spese previste: ${fmtEPlain(totalPlanned)}`,
        `Risparmio netto: ${fmtEPlain(savings)}`,
        `Budget rimasto: ${fmtEPlain(totalPlanned - totalActual)}`,
        `Uscite in attesa di pagamento: ${pendingCount}`,
        `\nDettaglio spese per categoria:\n${catLines || '  (nessuna spesa)'}`,
        `\nEntrate del mese:\n${incomes.map(i => `  - ${i.desc}: ${fmtEPlain(i.amount)}`).join('\n') || '  (nessuna entrata)'}`,
        prevMonth ? [
            `\nDati mese precedente (${prevMonth}):`,
            `  Entrate: ${fmtEPlain(prevIncomeTot)} (variazione vs mese corrente: ${fmtDiff(incDiff)})`,
            `  Spese sostenute: ${fmtEPlain(prevActualTot)} (variazione: ${fmtDiff(actDiff)})`,
            `  Spese previste: ${fmtEPlain(prevPlannedTot)} (variazione: ${fmtDiff(plaDiff)})`
        ].join('\n') : '  (nessun mese precedente disponibile)'
    ].join('\n');

    const prompt = `Agisci come un consulente finanziario. Lingua: Italiano. Analizza i dati del mese corrente e confrontali con il mese precedente. ${dataText}Fornisci un resoconto conciso (max 6 righe) su: 1) stato di salute del mese, 2) categoria più critica, 3) confronto col mese precedente (miglioramenti/peggioramenti evidenziati dai dati), 4) consiglio pratico per migliorare.`;

    await callAIEndpoint(prompt, 'iaMonthResponse', 'btnIaMonthAnalysis');

    if (respBox && respBox.innerText && !respBox.innerText.startsWith('❌') && !respBox.innerText.startsWith('🤖')) {
        const iaNotesField = document.getElementById('iaNotes');
        if (iaNotesField) {
            iaNotesField.value = respBox.innerText;
            await saveNotes();
        }
    }
}

// =====================================================================
// ACTION HUB MESE
// =====================================================================
(function setupMeseActionHub() {
    const meseActions = document.getElementById('mese-action-hub');
    if (!meseActions) return;
    meseActions.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        if (btn.dataset.action === 'search') openSearchPopup();
        else if (btn.dataset.action === 'ia') openIaMonthPopup();
        else if (btn.dataset.action === 'condivise') openCondivisePopup();
    });
})();

// =====================================================================
// MACRO CARDS MOBILE: glass micro-grid (2x3) + progress bar (speso/budget)
// =====================================================================
const MACRO_CARD_META = {
    casa_utenze: { title: 'Casa e Utenze', icon: 'fas fa-home' },
    veicoli: { title: 'Veicoli', icon: 'fas fa-car' },
    spese_svago: { title: 'Spese e Svago', icon: 'fas fa-shopping-cart' }
};

function renderMacroCards() {
    for (const [macro, meta] of Object.entries(MACRO_CARD_META)) {
        const grid = document.getElementById('microGrid-' + macro);
        const fill = document.getElementById('progressFill-' + macro);
        const label = document.getElementById('budgetLabel-' + macro);
        const cats = userMacroCategories[macro] || [];
        const catSet = new Set(cats);
        let planned = 0, actual = 0;
        currentData.expenses.forEach(e => {
            if (catSet.has(e.category)) { planned += e.planned; actual += e.actual; }
        });

        if (grid) {
            grid.innerHTML = '';
            grid.className = 'card-micro-grid';
            if (cats.length === 0) {
                grid.innerHTML = '<div class="micro-empty">✏️ Aggiungi categorie</div>';
            } else {
                cats.slice(0, 5).forEach(cat => {
                    const cell = document.createElement('div');
                    cell.className = 'micro-cell';
                    cell.innerHTML = `<i class="fas ${faIconFor(cat, macro)}"></i>`;
                    grid.appendChild(cell);
                });
                if (cats.length > 5) {
                    const more = document.createElement('div');
                    more.className = 'micro-more';
                    more.innerHTML = '⋯';
                    grid.appendChild(more);
                }
            }
        }

        const pct = planned > 0 ? Math.min(100, (actual / planned) * 100) : 0;
        if (fill) {
            fill.classList.remove('fill-warn', 'fill-over');
            if (planned > 0 && actual > planned) fill.classList.add('fill-over');
            else if (pct >= 80) fill.classList.add('fill-warn');
            fill.style.width = pct + '%';
        }
        if (label) label.textContent = `Budget ${meta.title}: ${fmtEPlain(actual, 0)} / ${fmtEPlain(planned, 0)}`;
    }
}

// =====================================================================
// AI DAILY INSIGHT: insight locale nella hero card (rotazione automatica)
// =====================================================================
let heroInsightTimer = null;
let heroInsightResumeT = null;
let heroInsightFadeT = null;
let heroInsightSlides = [];
let heroInsightIndex = 0;
let heroInsightEventsWired = false;

async function renderHeroInsight() {
    const pill = document.getElementById('heroInsightPill');
    const textEl = document.querySelector('#heroInsightPill .hero-insight-text');
    if (!pill || !textEl) return;

    const month = document.getElementById('currentMonth').value;
    if (!month) { textEl.textContent = 'Seleziona un mese per vedere gli insight'; return; }

    const [y, m] = month.split('-').map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    const today = new Date();
    const isCurrent = today.getFullYear() === y && (today.getMonth() + 1) === m;
    const daysElapsed = isCurrent ? Math.min(today.getDate(), daysInMonth) : daysInMonth;

    const totalIncome = currentData.income.reduce((s, i) => s + i.amount, 0);
    const catActual = {};
    const catPlanned = {};
    currentData.expenses.forEach(e => {
        catActual[e.category] = (catActual[e.category] || 0) + e.actual;
        catPlanned[e.category] = (catPlanned[e.category] || 0) + e.planned;
    });

    let prevExpenses = [];
    try {
        const prevMonth = getPreviousMonthStrings(month, 1)[0];
        if (prevMonth) prevExpenses = await db.expenses.where('month').equals(prevMonth).toArray();
    } catch (e) { prevExpenses = []; }
    const prevCatActual = {};
    prevExpenses.forEach(e => { prevCatActual[e.category] = (prevCatActual[e.category] || 0) + e.actual; });

    const macroStats = {};
    for (const [macro, cats] of Object.entries(userMacroCategories)) {
        macroStats[macro] = { actual: 0, planned: 0 };
        cats.forEach(c => {
            macroStats[macro].actual += catActual[c] || 0;
            macroStats[macro].planned += catPlanned[c] || 0;
        });
    }

    const slides = [];

    // Regola 1: categoria più migliorata vs mese scorso
    let bestCat = null, bestDelta = 0;
    for (const [cat, cur] of Object.entries(catActual)) {
        const prev = prevCatActual[cat] || 0;
        if (prev > cur && (prev - cur) > bestDelta) { bestDelta = prev - cur; bestCat = cat; }
    }
    if (bestCat && bestDelta >= 1) {
        slides.push(`🎉 Oggi sei stato bravo con ${bestCat}! Risparmiati ${fmtEPlain(Math.round(bestDelta), 0)}`);
    }

    // Regola 2: media giornaliera della macro più attiva
    let bestMacro = null, bestAvg = 0;
    for (const [macro, st] of Object.entries(macroStats)) {
        const avg = st.actual / Math.max(1, daysElapsed);
        if (avg > bestAvg) { bestAvg = avg; bestMacro = macro; }
    }
    if (bestMacro && bestAvg > 0) {
        const title = MACRO_CARD_META[bestMacro] ? MACRO_CARD_META[bestMacro].title : bestMacro;
        slides.push(`📅 Spesa per ${title} media: ${fmtEPlain(Math.round(bestAvg), 0)}/giorno`);
    }

    // Regola 3: proiezione lineare di risparmio a fine mese
    if (totalIncome > 0 || Object.keys(catActual).length > 0) {
        const remaining = daysInMonth - daysElapsed;
        const totalActual = Object.values(catActual).reduce((s, v) => s + v, 0);
        const projSpese = totalActual + (daysElapsed > 0 ? (totalActual / daysElapsed) * remaining : 0);
        const projSavings = Math.round(totalIncome - projSpese);
        if (projSavings >= 0) slides.push(`🚀 Se continui così, a fine mese avrai +${fmtEPlain(projSavings, 0)}`);
        else slides.push(`⚠️ Al ritmo attuale, a fine mese ti mancheranno ${fmtEPlain(Math.abs(projSavings), 0)}`);
    }

    // Regola 4: macro che ha superato il budget
    let overMacro = null, overAmt = 0;
    for (const [macro, st] of Object.entries(macroStats)) {
        if (st.planned > 0 && st.actual > st.planned && (st.actual - st.planned) > overAmt) {
            overAmt = st.actual - st.planned; overMacro = macro;
        }
    }
    if (overMacro) {
        const title = MACRO_CARD_META[overMacro] ? MACRO_CARD_META[overMacro].title : overMacro;
        slides.push(`🔥 ${title} ha superato il budget di ${fmtEPlain(Math.round(overAmt), 0)}`);
    }

    // Regola 5: onboarding se nessun dato
    if (slides.length === 0) {
        slides.push('🤖 Inizia a registrare spese ed entrate: ogni giorno avrai insight personali!');
        slides.push('💡 Il budget si costruisce spesa dopo spesa: parti dalle spese fisse.');
    }

    heroInsightSlides = slides;
    heroInsightIndex = 0;
    textEl.textContent = slides[0];
    wireHeroInsightEvents();
    startHeroInsightLoop();
}

function wireHeroInsightEvents() {
    const pill = document.getElementById('heroInsightPill');
    if (!pill || heroInsightEventsWired) return;
    heroInsightEventsWired = true;
    pill.addEventListener('click', () => { nextHeroInsight(); scheduleHeroInsightResume(); });
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) stopHeroInsightLoop(); else startHeroInsightLoop();
    });
}

function showHeroInsight(i) {
    const textEl = document.querySelector('#heroInsightPill .hero-insight-text');
    if (!textEl || !heroInsightSlides.length) return;
    heroInsightIndex = ((i % heroInsightSlides.length) + heroInsightSlides.length) % heroInsightSlides.length;
    if (heroInsightFadeT) clearTimeout(heroInsightFadeT);
    textEl.style.opacity = '0';
    heroInsightFadeT = setTimeout(() => {
        textEl.textContent = heroInsightSlides[heroInsightIndex];
        textEl.style.opacity = '1';
        heroInsightFadeT = null;
    }, 250);
}

function nextHeroInsight() { showHeroInsight(heroInsightIndex + 1); }

function startHeroInsightLoop() {
    stopHeroInsightLoop();
    if (document.hidden || heroInsightSlides.length < 2) return;
    heroInsightTimer = setInterval(() => nextHeroInsight(), 4000);
}

function stopHeroInsightLoop() {
    if (heroInsightTimer) { clearInterval(heroInsightTimer); heroInsightTimer = null; }
}

function scheduleHeroInsightResume() {
    if (heroInsightResumeT) clearTimeout(heroInsightResumeT);
    heroInsightResumeT = setTimeout(startHeroInsightLoop, 6000);
}

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
    document.body.classList.add('popup-open');
}

function closeRendicontoPopup(event) {
    event.preventDefault();
    event.stopPropagation();
    document.getElementById('popup-rendiconto').classList.remove('active');
    document.body.classList.remove('popup-open');
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
        depositSelect.innerHTML = goals.map(g => `<option value="${g.name}">${g.name}</option>`).join('');
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
                    <button data-act="deleteSavingsGoal" data-args='["${encodeURIComponent(g.name)}"]' title="Elimina" class="btn-ghost-del lg">
                        🗑️
                    </button>
                </div>
            </div>
            <div style="height: 12px; background: #e2e8f0; border-radius: 10px; overflow:hidden; margin-bottom:8px;">
                <div style="width: ${pct}%; height: 100%; background: ${isComplete ? '#10b981' : '#3b82f6'}; transition: width 0.3s;"></div>
            </div>
            <div style="display:flex; justify-content:space-between; align-items:center; gap: 10px; font-size:13px; color:#334155;">
                <span>Avanzamento: <strong>${pct.toFixed(1)}%</strong></span>
                ${isComplete ? '<span style="color:var(--success-text); font-weight:700;">Obiettivo raggiunto</span>' : ''}
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
    if (!name || amount <= 0) { showToast('Inserisci un nome e un target valido.', true); return; }
    await db.savingsGoals.put({name, targetAmount: amount, importo_accumulato: 0, createdAt: Date.now()});
    await updateGlobalVersion();
    nameEl.value = ''; amountEl.value = '';
    renderSavingsGoals();
}
async function deleteSavingsGoal(name) {
    if (typeof name === 'string') name = decodeURIComponent(name);
    const confirmed = await showConfirmDialog({ title: 'Elimina salvadanaio', message: 'Eliminare questo obiettivo?', okLabel: 'Elimina', cancelLabel: 'Annulla', danger: true });
    if (!confirmed) return;
    await db.savingsGoals.delete(name);
    await updateGlobalVersion();
    renderSavingsGoals();
}

async function depositToSavingsGoal() {
    const select = document.getElementById('depositSavingsSelect');
    const amountInput = document.getElementById('depositAmount');
    if (!select || !amountInput) return;
    const name = select.value;
    const amount = parseFloat(amountInput.value) || 0;
    if (!name || amount <= 0) { showToast('Inserisci un importo valido da depositare.', true); return; }
    const goal = await db.savingsGoals.get(name);
    if (!goal) { showToast('Salvadanaio non trovato.', true); return; }
    const newTotal = (goal.importo_accumulato || 0) + amount;
    await db.savingsGoals.update(name, {importo_accumulato: newTotal});
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

function genId() {
    return Date.now() * 1000 + Math.floor(Math.random() * 1000);
}

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
    const initial = asset.initialCapital || 0;
    const deposits = movements.filter(m => m.type === 'deposit').reduce((s, m) => s + m.amount, 0);
    const withdrawals = movements.filter(m => m.type === 'withdrawal').reduce((s, m) => s + m.amount, 0);
    const profits = movements.filter(m => m.type === 'profit').reduce((s, m) => s + m.amount, 0);
    const expenses = movements.filter(m => m.type === 'expense').reduce((s, m) => s + m.amount, 0);
    const totalInvested = initial + deposits - withdrawals;
    const totalProfits = profits - expenses;
    const currentValue = totalInvested + totalProfits;
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
    const heroValue = document.getElementById('investTotalValue');
    if (heroValue) heroValue.textContent = fmtEPlain(totalValue, 0);
    const heroCashflow = document.getElementById('investMonthlyCashflow');
    if (heroCashflow) heroCashflow.textContent = (monthlyCashflow >= 0 ? '+' : '') + fmtEPlain(monthlyCashflow, 0);
    const heroRoi = document.getElementById('investGlobalRoi');
    if (heroRoi) heroRoi.textContent = (globalRoi >= 0 ? '+' : '') + globalRoi.toFixed(1) + '%';

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
    document.body.classList.add('popup-open');
}

function closeInvestAddPopup(event) {
    if (event && event.target !== event.currentTarget) return;
    document.getElementById('investAddPopup').classList.remove('active');
    document.body.classList.remove('popup-open');
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
    const asset = { id: genId(), type: selectedInvestType, name, targetAmount, initialCapital, createdAt: Date.now() };
    try {
        await db.investments.put(asset);
        await updateGlobalVersion();
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
    showPromptDialog({
        title: 'Capitale Investito Iniziale',
        message: 'Importo in € (virgola o punto decimale):',
        defaultValue: String(asset.initialCapital || '0'),
        placeholder: 'Es. 5000',
        okLabel: 'Salva',
        cancelLabel: 'Annulla'
    }).then(newVal => {
        if (newVal === null) return;
        const parsed = parseFloat(String(newVal).replace(',', '.'));
        if (isNaN(parsed) || parsed < 0) { showToast('Inserisci un valore valido', true); return; }
        asset.initialCapital = parsed;
        db.investments.put(asset).then(() => {
            updateGlobalVersion();
            renderInvestAssetDetail(asset);
            renderInvestments();
            showToast('Capitale iniziale aggiornato', false);
        }).catch(e => {
            console.error('[Invest] Errore aggiornamento:', e);
            showToast('Errore aggiornamento', true);
        });
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
    document.body.classList.add('popup-open');
    renderInvestAssetDetail(asset);
}

function closeInvestAssetPopup(event) {
    if (event && event.target !== event.currentTarget) return;
    document.getElementById('investAssetPopup').classList.remove('active');
    document.body.classList.remove('popup-open');
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
                <span class="invest-stat-label">Investito <span style="cursor:pointer;font-size:12px;color:#8b5cf6;" data-act="editInvestInitialCapital" data-args='[${asset.id}]' title="Modifica capitale iniziale">✏️</span></span>
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
                <button data-act="deleteInvestMovement" data-args='[${m.id}]' title="Elimina movimento" class="btn-ghost-del">🗑️</button>
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
    const mov = { id: genId(), investmentId: selectedInvestId, date, type, amount, desc };
    try {
        await db.investmentMovements.put(mov);
        await updateGlobalVersion();
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

async function deleteInvestMovement(movId) {
    const confirmed = await showConfirmDialog({ title: 'Elimina movimento', message: 'Eliminare questo movimento?', okLabel: 'Elimina', cancelLabel: 'Annulla', danger: true });
    if (!confirmed) return;
    try {
        await db.investmentMovements.delete(movId);
        await updateGlobalVersion();
        const asset = currentInvestments.find(a => a.id === selectedInvestId);
        if (asset) await renderInvestAssetDetail(asset);
        await renderInvestments();
        showToast('Movimento eliminato', false);
    } catch (e) {
        console.error('[Invest] Errore eliminazione movimento:', e);
        showToast('Errore eliminazione movimento', true);
    }
}

async function deleteInvestAsset(assetId) {
    const asset = currentInvestments.find(a => a.id === assetId);
    if (!asset) return;
    const confirmed = await showConfirmDialog({ title: 'Elimina asset', message: `Eliminare "${asset.name}" e tutti i suoi movimenti?`, okLabel: 'Elimina', cancelLabel: 'Annulla', danger: true });
    if (!confirmed) return;
    try {
        const movIds = await db.investmentMovements.where('investmentId').equals(assetId).primaryKeys();
        if (movIds && movIds.length) await db.investmentMovements.bulkDelete(movIds);
        await db.investments.delete(assetId);
        await updateGlobalVersion();
        closeInvestAssetPopup();
        await renderInvestments();
        showToast('Asset eliminato', false);
    } catch (e) {
        console.error('[Invest] Errore eliminazione asset:', e);
        showToast('Errore eliminazione asset', true);
    }
}

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
    if (modal) modal.classList.add('active');
}

function closeIaModal(event) {
    if (event && event.target !== event.currentTarget) return;
    const modal = document.getElementById('iaModal');
    if (modal) modal.classList.remove('active');
}

async function openArchiveModal() {
    await renderArchiveModalContent();
    const modal = document.getElementById('archiveModal');
    if (modal) modal.classList.add('active');
}

function closeArchiveModal(event) {
    if (event && event.target !== event.currentTarget) return;
    const modal = document.getElementById('archiveModal');
    if (modal) modal.classList.remove('active');
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
    await ensureChartJs();
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
        options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'top',labels:{font:{size:10},boxWidth:8,boxHeight:8,padding:8}},tooltip:{bodyFont:{size:11},titleFont:{size:11}}},scales:{x:{grid:{display:false},ticks:{font:{size:10}}},y:{grid:{color:'rgba(0,0,0,0.05)'},ticks:{font:{size:10}}}},animation:{duration:0}}
    });
}

// =====================================================================
// GRAFICO TRADING
// =====================================================================
async function renderTradingChart() {
    await ensureChartJs();
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
        options:{responsive:true,maintainAspectRatio:false,scales:{x:{grid:{color:'rgba(0,0,0,0.04)'},ticks:{font:{size:10}}},y:{grid:{color:'rgba(0,0,0,0.04)'},ticks:{font:{size:10}}}},plugins:{legend:{position:'top',labels:{font:{size:10,weight:'bold'},boxWidth:8,boxHeight:8,padding:8}},tooltip:{bodyFont:{size:11},titleFont:{size:11}}},animation:{duration:0}}
    });
}

// =====================================================================
// ANALISI MOBILE — SINGLE SCREEN: periodi, trend, sparklines
// =====================================================================
function getAnalysisAnchorMonth() {
    const input = document.getElementById('currentMonth');
    if (input && input.value) return input.value;
    return null;
}

function lastNMonthsList(endMonth, n) {
    const [y, m] = endMonth.split('-').map(Number);
    const list = [];
    for (let i = 0; i < n; i++) {
        const d = new Date(y, m - 1 - i, 1);
        list.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    return list;
}

function filterMonthsByPeriod(months) {
    if (!months || !months.length) return [];
    const sorted = [...months].sort((a, b) => a.month.localeCompare(b.month));
    const anchor = getAnalysisAnchorMonth() || sorted[sorted.length - 1].month;
    if (analysisPeriod === 'year') {
        const year = anchor.split('-')[0];
        return sorted.filter(m => m.month.startsWith(year));
    }
    if (analysisPeriod === 'custom') {
        if (!customRange) return [];
        return sorted.filter(m => m.month >= customRange[0] && m.month <= customRange[1]);
    }
    const count = analysisPeriod === '3m' ? 3 : 6;
    const set = new Set(lastNMonthsList(anchor, count));
    return sorted.filter(m => set.has(m.month));
}

function shiftMonth(month, delta) {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function getPeriodCalendarMonths() {
    const anchor = getAnalysisAnchorMonth() || new Date().toISOString().slice(0, 7);
    if (analysisPeriod === 'year') {
        const y = anchor.split('-')[0];
        const list = [];
        for (let i = 1; i <= 12; i++) list.push(`${y}-${String(i).padStart(2, '0')}`);
        return list;
    }
    if (analysisPeriod === 'custom') {
        if (!customRange) return [];
        const list = [];
        let m = customRange[0];
        while (m <= customRange[1]) { list.push(m); m = shiftMonth(m, 1); }
        return list;
    }
    const count = analysisPeriod === '3m' ? 3 : 6;
    return lastNMonthsList(anchor, count);
}

function getBaselineCalendarMonths(periodMonths) {
    if (!periodMonths.length) return [];
    return lastNMonthsList(shiftMonth(periodMonths[0], -1), periodMonths.length);
}

function sparklineSVG(values, total) {
    const w = 100, h = 40;
    const color = total > 0 ? '#ef4444' : '#10b981';
    if (!values.length || values.every(v => v === 0)) {
        return `<svg class="sparkline-svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><line x1="0" y1="${h / 2}" x2="${w}" y2="${h / 2}" stroke="#cbd5e1" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>`;
    }
    const max = Math.max(...values);
    const pts = values.map((v, i) => [i * (w / Math.max(values.length - 1, 1)), h - 4 - (v / max) * (h - 8)]);
    const at = (i) => pts[Math.max(0, Math.min(pts.length - 1, i))];
    let d = `M ${pts[0][0].toFixed(2)},${pts[0][1].toFixed(2)}`;
    for (let i = 0; i < pts.length - 1; i++) {
        const p0 = at(i - 1), p1 = pts[i], p2 = pts[i + 1], p3 = at(i + 2);
        const cp1x = p1[0] + (p2[0] - p0[0]) / 5;
        const cp1y = p1[1] + (p2[1] - p0[1]) / 5;
        const cp2x = p2[0] - (p3[0] - p1[0]) / 5;
        const cp2y = p2[1] - (p3[1] - p1[1]) / 5;
        d += ` C ${cp1x.toFixed(2)},${cp1y.toFixed(2)} ${cp2x.toFixed(2)},${cp2y.toFixed(2)} ${p2[0].toFixed(2)},${p2[1].toFixed(2)}`;
    }
    const last = pts[pts.length - 1];
    const fill = `${d} L ${last[0].toFixed(2)},${h} L 0,${h} Z`;
    return `<svg class="sparkline-svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><path d="${fill}" fill="${color}" fill-opacity="0.12"/><path d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>`;
}

async function renderAnalisiMobile() {
    const carousel = document.getElementById('anomalyCarousel');
    const avgVal = document.getElementById('trendAvgValue');
    const avgDelta = document.getElementById('trendAvgDelta');
    const topVal = document.getElementById('trendTopCatValue');
    const topDelta = document.getElementById('trendTopCatDelta');
    if (!carousel || !avgVal || !avgDelta || !topVal || !topDelta) return;

    const insightKey = getInsightPeriodKey();
    const cachedInsight = loadInsightCache(insightKey);
    if (cachedInsight) renderInsightBanner(cachedInsight);
    else resetInsightBanner();

    const periodMonths = getPeriodCalendarMonths();
    if (!periodMonths.length) {
        avgVal.textContent = '–';
        avgDelta.textContent = '';
        avgDelta.className = 'trend-delta trend-flat';
        topVal.textContent = '–';
        topDelta.textContent = 'Nessun dato nel periodo';
        topDelta.className = 'trend-delta trend-flat';
        renderAnomalyCarousel([]);
        await renderSavingsSummary(new Set(), 0, 0);
        const diffVal = document.getElementById('budgetDiffValue');
        const diffDelta = document.getElementById('budgetDiffDelta');
        if (diffVal) diffVal.textContent = '–';
        if (diffDelta) { diffDelta.textContent = ''; diffDelta.className = 'trend-delta trend-flat'; }
        return;
    }

    const periodSet = new Set(periodMonths);
    const expenses = await db.expenses.where('month').anyOf(periodMonths).toArray();
    const baseMonths = getBaselineCalendarMonths(periodMonths);
    const baseExpenses = await db.expenses.where('month').anyOf(baseMonths).toArray();
    const isFixed = (e) => !!(e.isRecurring || e.recurringGroupId || /(mutuo|affitto|bollett|tass|luce|gas|acqua|telefon|internet|canone|assicuraz)/i.test(e.category || ''));
    const sum = (arr) => arr.reduce((s, v) => s + v, 0);
    const monthRows = (await db.months.toArray()).filter(m => periodSet.has(m.month));

    // — Trend card: media uscite (metà vs prima metà finestra) —
    const byMonth = {};
    periodMonths.forEach(m => { byMonth[m] = 0; });
    expenses.forEach(e => { if (e.actual > 0) byMonth[e.month] = (byMonth[e.month] || 0) + e.actual; });
    const spentList = periodMonths.map(k => byMonth[k]);
    const half = Math.max(1, Math.floor(spentList.length / 2));
    const avg = sum(spentList) / spentList.length;
    const firstAvg = sum(spentList.slice(0, half)) / half;
    const lastAvg = sum(spentList.slice(spentList.length - half)) / half;
    const deltaPct = firstAvg > 0 ? ((lastAvg - firstAvg) / firstAvg) * 100 : 0;

    avgVal.textContent = fmtEPlain(avg, 0);
    if (Math.abs(deltaPct) < 1) {
        avgDelta.textContent = '→ stabile';
        avgDelta.className = 'trend-delta trend-flat';
    } else if (deltaPct > 0) {
        avgDelta.innerHTML = '<span class="trend-arrow">▲</span> +' + deltaPct.toFixed(0) + '%';
        avgDelta.className = 'trend-delta trend-up';
    } else {
        avgDelta.innerHTML = '<span class="trend-arrow">▼</span> -' + Math.abs(deltaPct).toFixed(0) + '%';
        avgDelta.className = 'trend-delta trend-down';
    }

    // — Top categoria in crescita (escluso fisse) —
    const catMonth = {};
    const catBase = {};
    expenses.forEach(e => {
        if (e.actual <= 0 || isFixed(e)) return;
        catMonth[e.category] = catMonth[e.category] || {};
        catMonth[e.category][e.month] = (catMonth[e.category][e.month] || 0) + e.actual;
    });
    baseExpenses.forEach(e => {
        if (e.actual <= 0 || isFixed(e)) return;
        catBase[e.category] = catBase[e.category] || {};
        catBase[e.category][e.month] = (catBase[e.category][e.month] || 0) + e.actual;
    });
    let bestCat = null, bestPct = -Infinity;
    Object.keys(catMonth).forEach(cat => {
        const vals = periodMonths.map(m => catMonth[cat][m] || 0);
        const f = sum(vals.slice(0, half)) / half;
        const l = sum(vals.slice(vals.length - half)) / half;
        const pct = f > 0 ? ((l - f) / f) * 100 : (l > 0 ? 100 : 0);
        if (pct > bestPct) { bestCat = cat; bestPct = pct; }
    });
    if (bestCat && bestPct > 1) {
        topVal.textContent = bestCat;
        topDelta.innerHTML = '<span class="trend-arrow">▲</span> +' + bestPct.toFixed(0) + '%';
        topDelta.className = 'trend-delta trend-up';
    } else {
        topVal.textContent = '–';
        topDelta.textContent = 'Nessuna crescita';
        topDelta.className = 'trend-delta trend-flat';
    }

    // — Carousel anomalie: |delta%| più alto vs periodo precedente (escluse fisse) —
    const anomalies = [];
    Object.keys(catMonth).forEach(cat => {
        const vals = periodMonths.map(m => catMonth[cat][m] || 0);
        const totP = sum(vals);
        const baseVals = baseMonths.map(m => (catBase[cat] || {})[m] || 0);
        const totB = sum(baseVals);
        const avgP = totP / periodMonths.length;
        const avgB = totB / baseMonths.length;
        const delta = avgB > 0 ? ((avgP - avgB) / avgB) * 100 : (avgP > 0 ? 100 : 0);
        if (Math.abs(delta) >= 1) anomalies.push({ cat, delta, vals, total: totP });
    });
    anomalies.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    renderAnomalyCarousel(anomalies.slice(0, 3));

    // — Card Risparmi & Investimenti (tasso accantonamento + cashflow netto) —
    await renderSavingsSummary(periodSet, sum(spentList));

    // — Scostamento dal Budget (piano vs effettivo nel periodo) —
    const plannedSum = monthRows.reduce((s, m) => s + (m.totalPlanned || 0), 0);
    const actualSum = monthRows.reduce((s, m) => s + (m.totalActual || 0), 0);
    const diffEl = document.getElementById('budgetDiffValue');
    const diffDelta = document.getElementById('budgetDiffDelta');
    if (diffEl && diffDelta) {
        if (!monthRows.length) {
            diffEl.textContent = '–';
            diffDelta.textContent = '';
            diffDelta.className = 'trend-delta trend-flat';
        } else {
            const budgetDiff = actualSum - plannedSum;
            const budgetPct = plannedSum > 0 ? (budgetDiff / plannedSum) * 100 : 0;
            diffEl.textContent = (budgetDiff > 0 ? '+' : '') + fmtEPlain(budgetDiff, 0);
            if (Math.abs(budgetPct) < 1) {
                diffDelta.textContent = '= In linea col budget';
                diffDelta.className = 'trend-delta trend-flat';
            } else if (budgetPct > 0) {
                diffDelta.innerHTML = '<span class="trend-arrow">▲</span> +' + budgetPct.toFixed(0) + '% vs Previsto';
                diffDelta.className = 'trend-delta trend-up';
            } else {
                diffDelta.innerHTML = '<span class="trend-arrow">▼</span> -' + Math.abs(budgetPct).toFixed(0) + '% vs Previsto';
                diffDelta.className = 'trend-delta trend-down';
            }
        }
    }
}

async function renderSavingsSummary(periodSet, spendTot) {
    const rateEl = document.getElementById('savRateValue');
    const cfEl = document.getElementById('savCashflowValue');
    const barEl = document.getElementById('savTargetBar');
    const labelEl = document.getElementById('savTargetLabel');
    if (!rateEl || !cfEl || !barEl || !labelEl) return;
    let incomeTot = 0, depTot = 0;
    try {
        const incomes = await db.income.toArray();
        incomes.forEach(i => { if (periodSet.has(i.month)) incomeTot += i.amount || 0; });
        const movs = await db.investmentMovements.toArray();
        movs.forEach(m => {
            if (m.type === 'deposit' && m.date && periodSet.has(m.date.slice(0, 7))) depTot += m.amount || 0;
        });
    } catch (e) {}
    if (!periodSet.size) {
        rateEl.textContent = '–';
        cfEl.textContent = '–';
        cfEl.classList.remove('positive', 'negative');
        barEl.style.width = '0%';
        barEl.classList.remove('on-target');
        labelEl.textContent = 'Nessun dato nel periodo';
        return;
    }
    const target = parseFloat(localStorage.getItem('eb_savings_target_pct')) || 20;
    const tasso = incomeTot > 0 ? Math.round((depTot / incomeTot) * 100) : (depTot > 0 ? 100 : 0);
    rateEl.textContent = `${tasso}% del reddito`;
    const cf = incomeTot - (spendTot || 0);
    cfEl.textContent = (cf > 0 ? '+' : '') + fmtEPlain(cf, 0);
    cfEl.classList.toggle('positive', cf >= 0);
    cfEl.classList.toggle('negative', cf < 0);
    const fill = Math.min(100, Math.max(0, (tasso / target) * 100));
    barEl.style.width = fill + '%';
    barEl.classList.toggle('on-target', tasso >= target);
    labelEl.textContent = tasso >= target ? `Target ${target}% · In linea` : (tasso > 0 ? `Target ${target}% · Sotto target` : `Target ${target}% · Nessun accantonamento`);
}

function renderAnomalyCarousel(slides) {
    stopAnomalyCarousel();
    const box = document.getElementById('anomalyCarousel');
    if (!box) return;
    if (!slides || !slides.length) {
        box.innerHTML = `<div class="anomaly-header">Anomalie di Spesa</div>
            <div class="anomaly-window">
                <div class="anomaly-track">
                    <div class="anomaly-slide">
                        <span class="anomaly-cat" title="Nessuna anomalia rilevata">Nessuna anomalia rilevata</span>
                        <span class="anomaly-delta flat">Tutto nella norma nel periodo</span>
                    </div>
                </div>
            </div>
            <div class="anomaly-dots"><span class="anomaly-dot active"></span></div>`;
        setupAnomalySwipe(box);
        return;
    }
    box.innerHTML = `<div class="anomaly-header">Anomalie di Spesa</div>
        <div class="anomaly-window">
            <div class="anomaly-track">` + slides.map((s, i) => `
                <div class="anomaly-slide" aria-hidden="${i !== 0}">
                    <span class="anomaly-cat" title="${s.cat}">${s.cat}</span>
                    <span class="anomaly-delta ${s.delta > 0 ? 'up' : 'down'}">${s.delta > 0 ? '▲ +' : '▼ -'}${Math.abs(s.delta).toFixed(0)}% vs solito</span>
                    ${sparklineSVG(s.vals, s.total)}
                </div>`).join('') + `</div>
        </div>
        <div class="anomaly-dots">` + slides.map((s, i) => `
            <button type="button" class="anomaly-dot ${i === 0 ? 'active' : ''}" data-act="goAnomalySlide" data-args='[${i}]' aria-label="Anomalia ${i + 1}"></button>`).join('') + `</div>`;
    setupAnomalySwipe(box);
    if (slides.length > 1) {
        let idx = 0;
        anomalyTimer = setInterval(() => {
            idx = (idx + 1) % slides.length;
            moveAnomalyTo(box, idx);
        }, 3500);
    }
}

function moveAnomalyTo(box, i) {
    const track = box.querySelector('.anomaly-track');
    const slides = box.querySelectorAll('.anomaly-slide');
    const dots = box.querySelectorAll('.anomaly-dot');
    if (!track || !slides.length) return;
    track.style.transform = `translateX(-${i * 100}%)`;
    slides.forEach((el, j) => el.setAttribute('aria-hidden', j !== i));
    dots.forEach((d, j) => d.classList.toggle('active', j === i));
}

function goAnomalySlide(i) {
    stopAnomalyCarousel();
    const box = document.getElementById('anomalyCarousel');
    if (!box) return;
    const slides = box.querySelectorAll('.anomaly-slide');
    if (!slides.length) return;
    moveAnomalyTo(box, i);
    if (slides.length > 1) {
        let idx = i;
        anomalyTimer = setInterval(() => {
            idx = (idx + 1) % slides.length;
            moveAnomalyTo(box, idx);
        }, 3500);
    }
}

function setupAnomalySwipe(box) {
    if (!box || box.dataset.swipeBound) return;
    box.dataset.swipeBound = '1';
    const win = box.querySelector('.anomaly-window');
    const track = box.querySelector('.anomaly-track');
    if (!win || !track) return;
    let startX = null, curX = 0, dragging = false;
    win.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        startX = e.clientX;
        curX = 0;
        dragging = true;
        win.setPointerCapture(e.pointerId);
    });
    win.addEventListener('pointermove', (e) => {
        if (!dragging || startX === null) return;
        curX = e.clientX - startX;
        const slides = box.querySelectorAll('.anomaly-slide');
        const idx = Array.from(slides).findIndex(s => s.getAttribute('aria-hidden') === 'false');
        if (idx < 0) return;
        track.classList.add('dragging');
        track.style.transform = `translateX(calc(${-idx * 100}% + ${curX}px))`;
    });
    const endDrag = () => {
        if (!dragging) return;
        dragging = false;
        track.classList.remove('dragging');
        const slides = box.querySelectorAll('.anomaly-slide');
        let idx = Array.from(slides).findIndex(s => s.getAttribute('aria-hidden') === 'false');
        if (idx < 0) return;
        stopAnomalyCarousel();
        if (Math.abs(curX) > 50) {
            idx = curX < 0 ? Math.min(idx + 1, slides.length - 1) : Math.max(idx - 1, 0);
        }
        moveAnomalyTo(box, idx);
        if (slides.length > 1) {
            let i = idx;
            anomalyTimer = setInterval(() => {
                i = (i + 1) % slides.length;
                moveAnomalyTo(box, i);
            }, 3500);
        }
    };
    win.addEventListener('pointerup', endDrag);
    win.addEventListener('pointercancel', endDrag);
}

function stopAnomalyCarousel() {
    if (anomalyTimer) { clearInterval(anomalyTimer); anomalyTimer = null; }
}

function getInsightPeriodKey() {
    const anchor = getAnalysisAnchorMonth() || new Date().toISOString().slice(0, 7);
    if (analysisPeriod === 'custom' && customRange) return `custom_${customRange[0]}_${customRange[1]}`;
    return `${analysisPeriod}_${anchor}`;
}

function loadInsightCache(key) {
    try {
        const raw = localStorage.getItem('eb_analisi_ai_' + key);
        return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
}

function saveInsightCache(key, data) {
    try { localStorage.setItem('eb_analisi_ai_' + key, JSON.stringify(data)); } catch (e) {}
}

function parseAIJson(text) {
    let t = (text || '').trim();
    const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) t = fence[1].trim();
    const start = t.indexOf('{');
    const end = t.lastIndexOf('}');
    if (start !== -1 && end > start) {
        try { return JSON.parse(t.slice(start, end + 1)); } catch (e) {}
    }
    const firstSentence = (t.split(/[.!?]\s/)[0] || t).trim();
    return { analisi_completa: t, riassunto_telegrafico: firstSentence.slice(0, 120) };
}

function formatShortDate(ts) {
    const d = new Date(ts);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function renderInsightBanner(payload) {
    const text = document.getElementById('aiInsightText');
    const clone = document.getElementById('aiInsightTextClone');
    const dateEl = document.getElementById('aiInsightDate');
    if (text) text.textContent = payload.riassunto_telegrafico || '';
    if (clone) clone.textContent = payload.riassunto_telegrafico || '';
    if (dateEl) dateEl.textContent = payload.ts ? 'Aggiornato il ' + formatShortDate(payload.ts) : '';
}

function resetInsightBanner() {
    const text = document.getElementById('aiInsightText');
    const clone = document.getElementById('aiInsightTextClone');
    const dateEl = document.getElementById('aiInsightDate');
    if (text) text.textContent = 'Tocca per l\'analisi IA del periodo';
    if (clone) clone.textContent = '';
    if (dateEl) dateEl.textContent = '';
}

function onAiInsightCardTap() {
    openIaModal();
    const cached = loadInsightCache(getInsightPeriodKey());
    const respBox = document.getElementById('iaHistoryResponseModal');
    if (cached && respBox) { respBox.style.display = 'block'; respBox.innerText = cached.analisi_completa; }
    generateInsightCard();
}

async function generateInsightCard(force = false) {
    const aiText = document.getElementById('aiInsightText');
    const refreshBtn = document.getElementById('aiInsightRefresh');
    if (aiInsightPending) return;
    const key = getInsightPeriodKey();
    const cached = loadInsightCache(key);
    if (cached && !force) { renderInsightBanner(cached); return; }
    const months = filterMonthsByPeriod(await db.months.toArray());
    if (!months.length) {
        if (aiText) aiText.textContent = 'Nessun dato nel periodo selezionato.';
        return;
    }
    const dataText = months.map(m => {
        const savings = (m.totalIncome || 0) - (m.totalActual || 0);
        return `- ${m.month}: Entrate ${fmtE(m.totalIncome || 0)}, Uscite ${fmtE(m.totalActual || 0)}, Risparmio ${fmtE(savings)}`;
    }).join('\n');
    const systemPrompt = 'Sei un analista finanziario esperto. Rispondi SEMPRE in lingua italiana. Restituisci SOLO un oggetto JSON valido, senza testo aggiuntivo, con esattamente due chiavi: "analisi_completa" (testo lungo, discorsivo e dettagliato in italiano) e "riassunto_telegrafico" (una singola frase molto sintetica in italiano, es. "Spese in aumento del 10%. Attenzione al carburante. Risparmi stabili.").';
    const prompt = `Analizza questo periodo di ${months.length} mesi:\n${dataText}\nRispondi in italiano con il JSON richiesto.`;
    aiInsightPending = true;
    if (aiText) aiText.textContent = '🤖 Analisi in corso...';
    if (refreshBtn) refreshBtn.disabled = true;
    try {
        const content = await invokeAI(prompt, systemPrompt);
        const parsed = parseAIJson(content);
        const payload = {
            analisi_completa: parsed.analisi_completa || content,
            riassunto_telegrafico: parsed.riassunto_telegrafico || '',
            ts: Date.now()
        };
        saveInsightCache(key, payload);
        renderInsightBanner(payload);
        const respBox = document.getElementById('iaHistoryResponseModal');
        if (respBox) { respBox.style.display = 'block'; respBox.innerText = payload.analisi_completa; }
    } catch (err) {
        const msg = await extractFunctionError(err);
        if (aiText) aiText.textContent = '❌ Errore: ' + msg;
    } finally {
        aiInsightPending = false;
        if (refreshBtn) refreshBtn.disabled = false;
    }
}

function setupAnalysisPeriodSelector() {
    const sel = document.getElementById('analysisPeriod');
    if (!sel || sel.dataset.bound) return;
    sel.dataset.bound = '1';
    sel.addEventListener('change', () => {
        const prev = analysisPeriod;
        analysisPeriod = sel.value;
        if (analysisPeriod === 'custom') {
            sel.dataset.prevPeriod = prev;
            openCustomRangePopup();
        } else {
            renderAnalisiMobile();
        }
    });
}

function openCustomRangePopup() {
    const popup = document.getElementById('customRangePopup');
    if (!popup) return;
    const from = document.getElementById('customRangeFrom');
    const to = document.getElementById('customRangeTo');
    const end = getAnalysisAnchorMonth() || new Date().toISOString().slice(0, 7);
    if (from && to) {
        from.value = customRange ? customRange[0] : end.slice(0, 4) + '-01';
        to.value = customRange ? customRange[1] : end;
    }
    popup.classList.add('active');
    document.body.classList.add('popup-open');
}

function closeCustomRangePopup(event) {
    if (event && event.target !== event.currentTarget) return;
    const popup = document.getElementById('customRangePopup');
    if (!popup) return;
    popup.classList.remove('active');
    document.body.classList.remove('popup-open');
    if (!customRange) {
        const sel = document.getElementById('analysisPeriod');
        if (sel) {
            analysisPeriod = sel.dataset.prevPeriod || '6m';
            sel.value = analysisPeriod;
            renderAnalisiMobile();
        }
    }
}

function applyCustomRange() {
    const from = document.getElementById('customRangeFrom');
    const to = document.getElementById('customRangeTo');
    if (!from || !to) return;
    if (!from.value || !to.value) { showToast('Seleziona entrambi i mesi', true); return; }
    if (from.value > to.value) { showToast('Il mese di inizio precede quello di fine', true); return; }
    customRange = [from.value, to.value];
    const sel = document.getElementById('analysisPeriod');
    if (sel) sel.value = 'custom';
    closeCustomRangePopup();
    renderAnalisiMobile();
}

// =====================================================================
// PREVISIONI — Dashboard di proiezione finanziaria
// =====================================================================
let futureChart = null;
let futureSimAmount = 0;
let futureInvestGrowth = 4;
let lastProjectionBase = null;

function monthKey(offset) {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + offset);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function monthOffset(fromKey, toKey) {
    const [fy, fm] = String(fromKey).split('-').map(Number);
    const [ty, tm] = String(toKey).split('-').map(Number);
    return (ty - fy) * 12 + (tm - fm);
}
function fmtMonth(m) {
    if (!m) return '';
    const [y, mo] = String(m).split('-');
    return `${mo}/${y}`;
}

async function getProjectionBase() {
    const months = await db.months.toArray();
    const numMonths = months.length;
    const totalIncome = months.reduce((s, m) => s + (m.totalIncome || 0), 0);
    const totalActual = months.reduce((s, m) => s + (m.totalActual || 0), 0);
    let investBase = 0;
    try {
        for (const a of (currentInvestments || [])) {
            const movs = await getInvestMovements(a.id);
            investBase += calcInvestStats(a, movs).currentValue;
        }
    } catch (e) { console.warn('[Future] Invest base:', e); }
    return {
        numMonths,
        avgIncome: numMonths ? totalIncome / numMonths : 0,
        avgActual: numMonths ? totalActual / numMonths : 0,
        avgSavings: numMonths ? (totalIncome - totalActual) / numMonths : 0,
        investBase
    };
}

// Serie patrimonio personale: risparmio medio + aggiustamenti scadenze/rate
function buildProjectionSeries(base, simAmount) {
    const today = monthKey(0);
    const active = (annualDeadlines || []).filter(d => !d.isPaid);
    const adj = {};
    active.forEach(d => {
        if (!d.recurring) {
            const o = monthOffset(today, d.month);
            if (o >= 0 && o <= 120) adj[o] = (adj[o] || 0) - d.amount;
        } else {
            const s = monthOffset(today, d.month);
            const e = d.endMonth ? monthOffset(today, d.endMonth) : s;
            if (s <= 0) {
                // Rata già attiva: dopo la fine il risparmio torna libero (scalino visibile)
                if (e >= 0) for (let t = e + 1; t <= 120; t++) adj[t] = (adj[t] || 0) + d.amount;
            } else if (s <= 120) {
                for (let t = s; t <= Math.min(e, 120); t++) adj[t] = (adj[t] || 0) - d.amount;
            }
        }
    });
    const monthly = base.avgSavings + simAmount;
    const series = [];
    let val = 0;
    for (let t = 0; t <= 120; t++) { val += monthly + (adj[t] || 0); series.push(Math.max(0, val)); }
    return series;
}

function buildInvestSeries(base, growthPct) {
    const m = Math.max(0, growthPct || 0) / 100 / 12;
    const out = [];
    for (let t = 0; t <= 120; t++) out.push(Math.round(base.investBase * Math.pow(1 + m, t)));
    return out;
}

function futureChartLabels() {
    const out = [];
    for (let t = 0; t <= 120; t++) {
        if (t === 0) out.push('Oggi');
        else if (t % 12 === 0) out.push(`+${t / 12}a`);
        else out.push('');
    }
    return out;
}

async function renderFutureChart() {
    await ensureChartJs();
    const isMobile = window.innerWidth < 768;
    const canvas = document.getElementById(isMobile ? 'futureChartCanvas' : 'futureChartCanvasD');
    if (!canvas || canvas.offsetParent === null) return; // tab nascosto: render al cambio tab
    const base = lastProjectionBase;
    if (!base || base.numMonths === 0) return;
    if (futureChart) { futureChart.destroy(); futureChart = null; }
    const baseSeries = buildProjectionSeries(base, 0);
    const simSeries = futureSimAmount !== 0 ? buildProjectionSeries(base, futureSimAmount) : null;
    const invSeries = buildInvestSeries(base, futureInvestGrowth);
    const datasets = [
        { label: 'Patrimonio', data: baseSeries, borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.10)', borderWidth: 2, fill: true, tension: 0.35, pointRadius: 0 },
        { label: 'Investimenti', data: invSeries, borderColor: '#8b5cf6', backgroundColor: 'rgba(139,92,246,0.08)', borderWidth: 2, borderDash: [6, 4], fill: false, tension: 0.35, pointRadius: 0 }
    ];
    if (simSeries) {
        const positive = futureSimAmount > 0;
        datasets.splice(1, 0, {
            label: 'Simulazione',
            data: simSeries,
            borderColor: positive ? '#10b981' : '#ef4444',
            backgroundColor: positive ? 'rgba(16,185,129,0.10)' : 'rgba(239,68,68,0.10)',
            borderWidth: 3, fill: true, tension: 0.35, pointRadius: 0
        });
    }
    let maxVal = 0;
    [baseSeries, simSeries, invSeries].forEach(s => { if (s) maxVal = Math.max(maxVal, ...s); });
    futureChart = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: { labels: futureChartLabels(), datasets },
        options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: true, position: 'bottom', labels: { boxWidth: 12, boxHeight: 3, font: { size: 10 } } },
                tooltip: {
                    callbacks: {
                        title: (items) => {
                            const i = items[0].dataIndex;
                            return i === 0 ? 'Oggi' : (i % 12 === 0 ? `+${i / 12}a` : `+${i}m`);
                        },
                        label: (item) => ` ${item.dataset.label}: ${fmtEPlain(item.parsed.y, 0)}`
                    }
                }
            },
            scales: {
                x: { ticks: { autoSkip: true, maxTicksLimit: 8, font: { size: 9 } }, grid: { display: false } },
                y: {
                    suggestedMin: 0,
                    suggestedMax: Math.max(1000, Math.ceil(maxVal * 1.15)),
                    ticks: {
                        precision: 0,
                        maxTicksLimit: 4,
                        callback: (v) => { const r = Math.round(v); return (r === 0 ? '0' : r.toLocaleString('it-IT')) + ' €'; },
                        font: { size: 9 }
                    }
                }
            },
            animation: { duration: 0 }
        }
    });
}

function renderFutureBaseLine(base) {
    const elM = document.getElementById('futureBaseLine');
    const elD = document.getElementById('futureBaseLineD');
    if (!elM && !elD) return;
    if (base.numMonths === 0) {
        const msg = '⚠️ Inserisci dati mensili per attivare le proiezioni.';
        if (elM) elM.innerHTML = msg;
        if (elD) elD.innerHTML = msg;
        return;
    }
    const sign = base.avgSavings >= 0 ? '+' : '';
    const color = base.avgSavings >= 0 ? '#10b981' : '#ef4444';
    if (elM) elM.innerHTML = `Base attuale: <strong style="color:${color}">${sign}${fmtEPlain(base.avgSavings, 0)}/mese</strong> di risparmio netto · Investimenti: <strong>${fmtEPlain(base.investBase, 0)}</strong>`;
    if (elD) elD.innerHTML = `Base di calcolo: ${base.numMonths} mes${base.numMonths === 1 ? 'e' : 'i'} · Entrate <strong>${fmtE(base.avgIncome)}</strong>/mese · Uscite <strong>${fmtE(base.avgActual)}</strong>/mese · Risparmio netto <strong style="color:${color}">${sign}${fmtE(base.avgSavings)}</strong>/mese · Investimenti attuali <strong>${fmtE(base.investBase)}</strong>`;
}

function renderFutureMilestones(base) {
    if (!base || base.numMonths === 0) return;
    const periods = [{ label: '6 Mesi', m: 6 }, { label: '1 Anno', m: 12 }, { label: '5 Anni', m: 60 }, { label: '10 Anni', m: 120 }];
    const sim = buildProjectionSeries(base, futureSimAmount);
    const ref = buildProjectionSeries(base, 0);
    const html = periods.map(p => {
        const v = sim[p.m], r = ref[p.m];
        const delta = v - r;
        const tone = delta > 0 ? 'pos' : delta < 0 ? 'neg' : 'flat';
        return `<div class="future-milestone ${tone}">
            <span class="fm-label">${p.label}</span>
            <span class="fm-value">${fmtEPlain(v, 0)}</span>
            <span class="fm-delta">${delta === 0 ? '—' : (delta > 0 ? '+' : '') + fmtEPlain(delta, 0)}</span>
        </div>`;
    }).join('');
    const elD = document.getElementById('futureMilestonesD');
    const elM = document.getElementById('futureMilestonesM');
    if (elD) elD.innerHTML = html;
    if (elM) elM.innerHTML = html;
}

async function updateFutureDashboard() {
    const base = await getProjectionBase();
    lastProjectionBase = base;
    renderFutureBaseLine(base);
    renderFutureMilestones(base);
    await renderFutureChart();
    renderDeadlineListFor('d');
    renderDeadlineListFor('s');
}

function syncSimSlider() {
    ['', 'M'].forEach(s => {
        const el = document.getElementById('futureSimSlider' + s);
        if (el) el.value = futureSimAmount;
        const chip = document.getElementById('futureSimValue' + s);
        if (chip) {
            chip.textContent = (futureSimAmount > 0 ? '+' : '') + futureSimAmount + ' €/mese';
            chip.className = 'future-sim-chip ' + (futureSimAmount > 0 ? 'pos' : futureSimAmount < 0 ? 'neg' : '');
        }
    });
}
function onFutureSimInput(suffix) {
    const el = document.getElementById('futureSimSlider' + suffix);
    if (!el) return;
    futureSimAmount = parseFloat(el.value) || 0;
    syncSimSlider();
    updateFutureDashboard();
}
function resetFutureSimulation() {
    futureSimAmount = 0;
    syncSimSlider();
    updateFutureDashboard();
}
function onFutureInvestGrowthInput() {
    const elD = document.getElementById('futureInvestGrowth');
    const elM = document.getElementById('futureInvestGrowthM');
    const v = parseFloat((elD && elD.value !== '') ? elD.value : (elM ? elM.value : 4)) || 0;
    futureInvestGrowth = v;
    if (elD) elD.value = v;
    if (elM) elM.value = v;
    updateFutureDashboard();
}
function toggleFutureSimRow() {
    const row = document.getElementById('futureSimRow');
    if (!row) return;
    const hidden = row.classList.toggle('sim-hidden');
    const btn = document.querySelector('#futureActionHub [data-action="simula"]');
    if (btn) btn.textContent = hidden ? '⚡ Simula' : '⚡ Simulatore attivo';
}

// =====================================================================
// BOTTOM SHEET PREVISIONI (MOBILE)
// =====================================================================
function openFutureSheet(action) {
    const overlay = document.getElementById('futureSheetOverlay');
    const sheet = document.getElementById('futureBottomSheet');
    const title = document.getElementById('futureSheetTitle');
    const body = document.getElementById('futureSheetBody');
    if (!overlay || !sheet || !title || !body) return;

    if (action === 'scadenze') {
        title.textContent = '🗓️ Pianificatore Scadenze';
        body.innerHTML = `
            ${plannerFormHTML('s')}
            <div style="margin:16px 0 6px;font-size:12px;color:#64748b;">Scadenze registrate nell'anno:</div>
            <div id="dlList-s" class="dl-list-scroll"></div>`;
        renderDeadlineListFor('s');
    } else if (action === 'ia') {
        title.textContent = '🤖 Analisi IA Futura';
        body.innerHTML = `
            <p style="font-size:12px;color:#475569;margin-bottom:12px;">L'IA analizza la sostenibilità delle spese previste nei prossimi 12 mesi (scadenze e rate) rispetto al trend di risparmio.</p>
            <button class="btn-ia" id="btnFutureIASheet" data-act="runFuturePredictionIASheet">🤖 Genera Analisi Futura</button>
            <div id="iaFutureResponseSheet" class="ia-response-box"></div>`;
    } else { return; }

    document.body.classList.add('sheet-open');
    overlay.classList.add('open');
    sheet.classList.add('open');
}

function closeFutureSheet() {
    const overlay = document.getElementById('futureSheetOverlay');
    const sheet = document.getElementById('futureBottomSheet');
    if (overlay) overlay.classList.remove('open');
    if (sheet) {
        sheet.classList.remove('open');
        sheet.style.transform = '';
        sheet.classList.remove('dragging');
    }
    document.body.classList.remove('sheet-open');
}

function categoryOptionsHTML() {
    const cats = [...new Set([...(userCategories || []), 'Varie'])];
    return cats.map(c => `<option value="${c}">${getCatIcon(c)} ${c}</option>`).join('');
}
function plannerFormHTML(p) {
    return `
        <div class="dl-type-toggle">
            <button type="button" class="dl-type-btn active" data-dl-type="${p}" data-mode="single" data-act="setDeadlineMode" data-args='["${p}","single"]'>📅 Giorno Singolo</button>
            <button type="button" class="dl-type-btn" data-dl-type="${p}" data-mode="month" data-act="setDeadlineMode" data-args='["${p}","month"]'>📆 Intero Mese</button>
            <button type="button" class="dl-type-btn" data-dl-type="${p}" data-mode="recurring" data-act="setDeadlineMode" data-args='["${p}","recurring"]'>🔁 Ricorrente</button>
        </div>
        <div style="display:flex;flex-direction:column;gap:8px;margin-top:10px;">
            <input type="text" id="dlDesc-${p}" class="responsive-input" placeholder="Titolo spesa (es. Bollo Auto)">
            <div class="dl-inline-row">
                <input type="number" id="dlAmount-${p}" class="responsive-input" placeholder="Importo €" min="0" step="0.01">
                <select id="dlCat-${p}" class="responsive-input">${categoryOptionsHTML()}</select>
            </div>
            <div id="dlDateRow-${p}"><input type="date" id="dlDate-${p}" class="responsive-input"></div>
            <div id="dlMonthRow-${p}" style="display:none;"><input type="month" id="dlMonth-${p}" class="responsive-input" value="${monthKey(0)}"></div>
            <div id="dlRecRow-${p}" style="display:none;gap:8px;">
                <input type="month" id="dlStart-${p}" class="responsive-input" value="${monthKey(0)}">
                <input type="month" id="dlEnd-${p}" class="responsive-input">
            </div>
            <button class="btn-spesa" style="background:var(--warning);margin:0;" data-act="addDeadlinePlanner" data-args='["${p}"]'>+ Salva Scadenza</button>
        </div>`;
}
function setDeadlineMode(p, mode) {
    document.querySelectorAll(`[data-dl-type="${p}"]`).forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
    const dateRow = document.getElementById('dlDateRow-' + p);
    const monthRow = document.getElementById('dlMonthRow-' + p);
    const recRow = document.getElementById('dlRecRow-' + p);
    if (dateRow) dateRow.style.display = mode === 'single' ? 'block' : 'none';
    if (monthRow) monthRow.style.display = mode === 'month' ? 'block' : 'none';
    if (recRow) recRow.style.display = mode === 'recurring' ? 'flex' : 'none';
}
function addDeadlinePlanner(p) {
    const desc = document.getElementById('dlDesc-' + p).value.trim();
    const amount = parseFloat(document.getElementById('dlAmount-' + p).value) || 0;
    const catEl = document.getElementById('dlCat-' + p);
    const category = catEl ? catEl.value : 'Varie';
    const modeBtn = document.querySelector(`[data-dl-type="${p}"].active`);
    const mode = modeBtn ? modeBtn.dataset.mode : 'single';
    if (!desc || amount <= 0) { showToast('Compila titolo e importo', true); return; }
    const item = { id: Date.now(), month: monthKey(0), day: '', desc, amount, category, isPaid: false, recurring: false, endMonth: null };
    if (mode === 'recurring') {
        const start = document.getElementById('dlStart-' + p).value;
        const end = document.getElementById('dlEnd-' + p).value;
        if (!start || !end || end < start) { showToast('Seleziona mese inizio e fine validi', true); return; }
        item.recurring = true; item.month = start; item.endMonth = end;
    } else if (mode === 'month') {
        const mv = document.getElementById('dlMonth-' + p).value;
        if (!mv) { showToast('Seleziona il mese', true); return; }
        item.month = mv; item.day = '';
    } else {
        const date = document.getElementById('dlDate-' + p).value;
        if (!date) { showToast('Seleziona la data', true); return; }
        item.month = date.slice(0, 7);
        item.day = String(parseInt(date.slice(8, 10), 10));
    }
    db.annualDeadlines.put(item).then(async () => {
        await updateGlobalVersion();
        document.getElementById('dlDesc-' + p).value = '';
        document.getElementById('dlAmount-' + p).value = '';
        document.getElementById('dlDate-' + p).value = '';
        document.getElementById('dlMonth-' + p).value = monthKey(0);
        document.getElementById('dlEnd-' + p).value = '';
        annualDeadlines = await db.annualDeadlines.toArray();
        renderDeadlineListFor('d');
        renderDeadlineListFor('s');
        checkAnnualAlertForCurrentMonth();
        updateFutureDashboard();
        showToast('Scadenza salvata', false);
    });
}
function renderDeadlineListFor(p) {
    const container = document.getElementById(p === 'd' ? 'annualDeadlinesList' : 'dlList-' + p);
    if (!container) return;
    container.innerHTML = '';
    if (!annualDeadlines || annualDeadlines.length === 0) {
        container.innerHTML = `<p style="color:#94a3b8;font-size:13px;text-align:center;padding:16px;">Nessuna scadenza registrata.</p>`;
        return;
    }
    [...annualDeadlines].sort((a, b) => String(a.month + (a.day || '')).localeCompare(String(b.month + (b.day || '')))).forEach(item => {
        const when = item.recurring
            ? `ogni mese · ${fmtMonth(item.month)} → ${fmtMonth(item.endMonth || item.month)}`
            : (item.day ? `g. ${item.day} ${fmtMonth(item.month)}` : `${fmtMonth(item.month)} (mese)`);
        const cat = item.category || 'Varie';
        const icon = getCatIcon(cat);
        const card = document.createElement('div');
        card.className = 'dl-micro-card' + (item.isPaid ? ' paid' : '');
        card.innerHTML = `
            <span class="dl-micro-icon">${item.recurring ? '🔁' : icon}</span>
            <span class="dl-micro-main">
                <span class="dl-micro-title">${item.desc}</span>
                <span class="dl-micro-meta">${when} · ${cat}</span>
            </span>
            <span class="dl-micro-amount">${fmtE(item.amount)}</span>
            <span class="dl-micro-actions">
                <button class="dl-micro-btn" title="${item.isPaid ? 'Segna da pagare' : 'Segna pagata'}" data-act="toggleDeadlinePaid" data-args='[${item.id},${!item.isPaid}]'>${item.isPaid ? '↩' : '✓'}</button>
                <button class="dl-micro-btn del" title="Elimina" data-act="deleteAnnualDeadline" data-args='[${item.id}]'>✕</button>
            </span>`;
        container.appendChild(card);
    });
}
async function buildFutureIAPrompt() {
    const base = await getProjectionBase();
    const today = monthKey(0);
    const active = (annualDeadlines || []).filter(d => !d.isPaid);
    const perMonth = {};
    active.forEach(d => {
        if (d.recurring) {
            const s = Math.max(0, monthOffset(today, d.month));
            const e = Math.min(11, d.endMonth ? monthOffset(today, d.endMonth) : 11);
            for (let t = s; t <= e; t++) { const k = monthKey(t); perMonth[k] = (perMonth[k] || 0) + d.amount; }
        } else {
            const o = monthOffset(today, d.month);
            if (o >= 0 && o <= 11) perMonth[d.month] = (perMonth[d.month] || 0) + d.amount;
        }
    });
    const sim = buildProjectionSeries(base, futureSimAmount);
    const ref = buildProjectionSeries(base, 0);
    const monthlyLines = Object.keys(perMonth).sort().map(k => `  - ${fmtMonth(k)}: ${fmtEPlain(perMonth[k], 0)}`).join('\n') || '  - nessuna';
    return `Sei un consulente finanziario esperto. Analizza la sostenibilità delle spese programmate nei prossimi 12 mesi rispetto al trend di risparmio dell'utente.\nDati:\n- Risparmio medio storico: ${fmtEPlain(base.avgSavings, 0)}/mese su ${base.numMonths} mesi\n- Simulazione what-if attiva: ${futureSimAmount >= 0 ? '+' : ''}${futureSimAmount} €/mese\n- Spese programmate per mese (prossimi 12 mesi):\n${monthlyLines}\n- Proiezione patrimonio: 6 mesi ${fmtEPlain(sim[6], 0)} (base ${fmtEPlain(ref[6], 0)}), 1 anno ${fmtEPlain(sim[12], 0)} (base ${fmtEPlain(ref[12], 0)}), 5 anni ${fmtEPlain(sim[60], 0)}, 10 anni ${fmtEPlain(sim[120], 0)}\nRispondi in italiano, massimo 6 frasi, indicando: 1) se le spese previste sono sostenibili, 2) i mesi più critici, 3) un consiglio pratico per mantenere il trend di risparmio.`;
}
async function runFuturePredictionIASheet() {
    const prompt = await buildFutureIAPrompt();
    callAIEndpoint(prompt, 'iaFutureResponseSheet', 'btnFutureIASheet');
}

function setupFutureSwipeToClose() {
    const sheet = document.getElementById('futureBottomSheet');
    if (!sheet) return;
    let startY = 0;
    sheet.addEventListener('touchstart', (e) => {
        startY = e.touches[0].clientY;
    }, { passive: true });
    sheet.addEventListener('touchmove', (e) => {
        const deltaY = e.touches[0].clientY - startY;
        if (deltaY > 0) {
            sheet.style.transform = `translateY(${deltaY}px)`;
        }
    }, { passive: true });
    sheet.addEventListener('touchend', () => {
        const deltaY = parseFloat(sheet.style.transform?.replace('translateY(','').replace('px)','')) || 0;
        if (deltaY > 80) {
            closeFutureSheet();
        }
        sheet.style.transform = '';
    });
}

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
let freeModelsCache = null;

// Elenco dinamico dei modelli :free attualmente attivi su OpenRouter
async function fetchFreeModels() {
    if (freeModelsCache) return freeModelsCache;
    try {
        const res = await window.fetch('https://openrouter.ai/api/v1/models', { signal: AbortSignal.timeout(10000) });
        if (!res.ok) return null;
        const data = await res.json();
        const list = (data.data || [])
            .map(m => m.id)
            .filter(id => typeof id === 'string' && id.endsWith(':free'))
            .sort();
        freeModelsCache = list.length ? list : null;
    } catch (e) {
        console.warn('[IA] Fetch modelli free fallito:', e);
        freeModelsCache = null;
    }
    return freeModelsCache;
}

// Popola il dropdown con "Casuale (Free)" + modelli :free attivi
async function populateFreeModelSelect() {
    const select = document.getElementById('openrouter-model-select');
    if (!select) return;
    const prevValue = select.value;
    const models = await fetchFreeModels();
    const options = '<option value="random">🎲 Casuale (Free)</option>' +
        (models ? models.map(m => `<option value="${m}">${m}</option>`).join('') : '');
    select.innerHTML = options;
    if (prevValue && models && models.includes(prevValue)) {
        select.value = prevValue;
    } else if (models && models.length > 0) {
        select.value = models[0];
    }
}

// Risolve il valore del select: "random" sceglie un modello :free a caso
async function resolveAIModel(model) {
    if (model === 'random') {
        const models = await fetchFreeModels();
        if (models && models.length) return models[Math.floor(Math.random() * models.length)];
        return 'random'; // il server gestisce il caso random
    }
    return model;
}

async function invokeAI(promptText, systemPrompt) {
    const modelSelect = document.getElementById('openrouter-model-select');
    const selected = modelSelect && modelSelect.value ? modelSelect.value : undefined;
    const model = await resolveAIModel(selected);
    const messages = [];
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
    messages.push({ role: 'user', content: promptText });
    const { data, error } = await window.supabaseClient.functions.invoke('chat-openrouter', {
        body: { model, messages }
    });
    if (error) throw error;
    return data.content;
}

async function callAIEndpoint(promptText, responseBoxId, btnId, systemPrompt) {
    const errorBox = document.getElementById('hub-ia-error-box');
    const box = document.getElementById(responseBoxId);
    const btn = document.getElementById(btnId);
    
    if (box) { box.style.display = 'block'; box.innerText = '🤖 Elaborazione in corso...'; }
    if (btn) btn.disabled = true;
    if (errorBox) errorBox.style.display = 'none';

    try {
        const content = await invokeAI(promptText, systemPrompt);
        if (box) box.innerText = content;
    } catch(err) {
        const msg = await extractFunctionError(err);
        if (box) box.innerText = "❌ Errore: " + msg;
        if (errorBox) { errorBox.textContent = "Errore: " + msg; errorBox.style.display = 'block'; }
    }
    finally { if (btn) btn.disabled = false; }
}

// Estrae il messaggio reale da un errore di invoke Edge Function
// (FunctionsHttpError espone err.context = Response con status e body)
async function extractFunctionError(err) {
    if (err && err.context && typeof err.context.text === 'function') {
        try {
            const status = err.context.status || '?';
            const body = await err.context.text();
            return `Status ${status}: ${body || err.message}`;
        } catch (e) {}
    }
    return err && err.message ? err.message : String(err);
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

    if (!engineSelect || !modelSelect) {
        console.error("Elementi non trovati nel DOM!");
        return;
    }

    const engine = engineSelect.value;
    const model = modelSelect.value;

    if (engine === 'openrouter') {
        try {
            document.getElementById('btn-analisi-strategica').textContent = "Elaborazione in corso...";
            document.getElementById('btn-analisi-strategica').disabled = true;

            const resolvedModel = await resolveAIModel(model);
            const { data, error } = await window.supabaseClient.functions.invoke('chat-openrouter', {
                body: { model: resolvedModel, messages: [{ role: 'user', content: promptTesto }] }
            });
            if (error) throw error;

            document.getElementById('iaNotes').value = data.content; 
            await saveNotes();

        } catch (err) {
            if(errorBox) {
                errorBox.textContent = "Errore: " + await extractFunctionError(err);
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
    const prompt = await buildFutureIAPrompt();
    await callAIEndpoint(prompt, 'iaFutureResponse', 'btnFutureIA');
}

// =====================================================================
// CHART.JS — CARICAMENTO LAZY (solo al primo grafico creato)
// =====================================================================
let chartJsPromise = null;
function ensureChartJs() {
    if (window.Chart) return Promise.resolve();
    if (!chartJsPromise) {
        chartJsPromise = new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js';
            s.onload = resolve;
            s.onerror = () => reject(new Error('Impossibile caricare Chart.js'));
            document.head.appendChild(s);
        });
    }
    return chartJsPromise;
}

// =====================================================================
// EXPORT PDF - FIX DEFINITIVO
// =====================================================================
function ensureHtml2Pdf() {
    if (window.html2pdf) return Promise.resolve();
    return new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
        s.onload = resolve;
        s.onerror = () => reject(new Error('Impossibile caricare la libreria PDF'));
        document.head.appendChild(s);
    });
}

async function exportPDF() {
    await ensureHtml2Pdf();
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
        syncState: await db.syncState.toArray(),
        investments: await db.investments.toArray(),
        investmentMovements: await db.investmentMovements.toArray(),
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
                await db.categories.bulkPut(data.categories);
                if (data.annual_deadlines) await db.annualDeadlines.bulkPut(data.annual_deadlines);
                if (data.income) await db.income.bulkPut(data.income);
                if (data.expenses) await db.expenses.bulkPut(data.expenses);
                if (data.months) await db.months.bulkPut(data.months);
                if (data.investments) await db.investments.bulkPut(data.investments);
                if (data.investmentMovements) await db.investmentMovements.bulkPut(data.investmentMovements);
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
// initApp() is now called by Supabase Auth listener in supabase-adapter.js

// Re-render calendario on window resize (solo visuale: nessuna scrittura DB/sync)
let resizeTimer;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => renderCalendar(), 250);
});



