// =====================================================================
// 1. CONFIGURAZIONE
// =====================================================================
const SUPABASE_URL = 'https://bkvludpqlwtntswzrhpm.supabase.co';
const SUPABASE_KEY = 'sb_publishable_bPVweV54mHiYuQSTZd7e-A_2DGbZr-j';
const supabase = (typeof window.supabase !== 'undefined' && typeof window.supabase.createClient === 'function')
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY)
    : null;

const OLLAMA_URL = 'http://localhost:11434/api/generate';
const OLLAMA_TAGS_URL = 'http://localhost:11434/api/tags';
const DB_NAME = 'BilancioDB';

// =====================================================================
// 2. DATABASE
// =====================================================================
const db = new Dexie(DB_NAME);
db.version(1).stores({
    months:          'month',
    income:          'id, month',
    expenses:        'id, month, date, category',
    annualDeadlines: 'id, month',
    categories:      'name',
    settings:        'key'
});
db.version(2).stores({
    savingsGoals: 'id, name, targetAmount, createdAt'
}).upgrade(tx => {});
db.version(3).stores({
    syncState: 'id'
}).upgrade(tx => {});

// =====================================================================
// 3. STATO
// =====================================================================
let currentUser = null;
let realtimeChannel = null;
let userCategories = [];
let categoryIconMap = {};
let currentData = { income: [], expenses: [] };
let annualDeadlines = [];
let selectedFilterDate = null;
let selectedFilterCategory = null;
let searchQuery = '';
let categoryToEdit = null;
let chartB = null;
let chartC = null;
let historyBarChart = null;
let tradingChart = null;
let startCycleDay = 23;
let deferredPrompt = null;

// =====================================================================
// 4. COSTANTI DATI
// =====================================================================
const DEFAULT_CATEGORIES = [
    { name: 'Alimentari', icon: '🍔' },
    { name: 'Igiene e Pulizia', icon: '🧴' },
    { name: 'Carburante Auto', icon: '🚗' },
    { name: 'Carburante Moto', icon: '🏍️' },
    { name: 'Sanitarie', icon: '🏥' },
    { name: 'Bolletta Acqua', icon: '💧' },
    { name: 'Bolletta Luce', icon: '💡' },
    { name: 'Bolletta Gas', icon: '🔥' },
    { name: 'Bolletta Rifiuti', icon: '♻️' },
    { name: 'Bolletta Condominio', icon: '🏢' },
    { name: 'Bolletta Telefonia', icon: '📱' },
    { name: 'Mutuo', icon: '🏠' },
    { name: 'Tasse Auto (Assicurazione/Bollo)', icon: '🚗' },
    { name: 'Tasse Moto (Assicurazione/Bollo)', icon: '🏍️' },
    { name: 'Manutenzioni Programmate', icon: '🔧' },
    { name: 'Imprevisti e Svago', icon: '🎉' },
    { name: 'Formazione', icon: '📚' },
    { name: 'Abbigliamento', icon: '👕' },
    { name: 'Varie', icon: '📦' }
];

const ICON_OPTIONS = ['🏠', '🚗', '🍔', '🛍️', '🏥', '✈️', '📈', '📄'];
const TAB_TITLES = {
    'current-month-tab': 'Mese',
    'history-tab': 'Storico',
    'future-tab': 'Futuro',
    'settings-tab': 'Impostazioni'
};

// =====================================================================
// 5. UTILITÀ GENERALI
// =====================================================================
function $(id) {
    return document.getElementById(id);
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, char => ({
        '&': '&',
        '<': '<',
        '>': '>',
        "'": '&#39;',
        '"': '"'
    }[char]));
}

function fmtE(n) {
    const value = Number(n) || 0;
    const rounded = Math.round(value);
    return `${value < 0 ? '-' : ''}${Math.abs(rounded).toLocaleString('it-IT')} €`;
}

function fmtEPlain(n) {
    const value = Number(n) || 0;
    const rounded = Math.round(value);
    return `${value < 0 ? '-' : ''}${Math.abs(rounded).toLocaleString('it-IT')} €`;
}

function fmtN(n) {
    return fmtE(n);
}

function getDeviceId() {
    let id = localStorage.getItem('app_device_id');
    if (!id) {
        id = `dev_${Math.random().toString(36).substring(2, 10)}_${Date.now().toString(36)}`;
        localStorage.setItem('app_device_id', id);
    }
    return id;
}

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

function isCloudReady() {
    return !!supabase && !!currentUser;
}

async function safeCloudCall(label, fn) {
    if (!isCloudReady()) return;
    try {
        await fn();
    } catch (err) {
        console.warn(`[SUPABASE] ${label} fallita, proseguo in locale.`, err);
    }
}

// =====================================================================
// 6. PWA / SERVICE WORKER
// =====================================================================
function initPWA() {
    window.addEventListener('beforeinstallprompt', (event) => {
        event.preventDefault();
        deferredPrompt = event;
        const btn = $('btnInstallApp');
        if (btn) btn.style.display = 'block';
    });
}

function setupServiceWorkerUpdates() {
    if (!('serviceWorker' in navigator)) return;

    const reloadOnControllerChange = () => {
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (window.__swReloading) return;
            window.__swReloading = true;
            console.log('[PWA] Nuovo service worker attivo, ricarico.');
            window.location.reload();
        });
    };

    const registerAndUpdate = async () => {
        try {
            const registration = await navigator.serviceWorker.register('./service-worker.js');
            console.log('[PWA] Service Worker registrato:', registration.scope);
            await registration.update();
            return registration;
        } catch (err) {
            console.warn('[PWA] Service Worker non registrato:', err);
            return null;
        }
    };

    window.addEventListener('load', async () => {
        const reg = await registerAndUpdate();
        reloadOnControllerChange();
        if (reg) {
            reg.onupdatefound = () => {
                const installingWorker = reg.installing;
                if (!installingWorker) return;
                installingWorker.onstatechange = () => {
                    if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        console.log('[PWA] Aggiornamento rilevato, ricarico.');
                        window.location.reload();
                    }
                };
            };
        }
    });

    document.addEventListener('visibilitychange', async () => {
        if (document.visibilityState === 'visible') {
            const registration = await navigator.serviceWorker.getRegistration();
            if (registration) await registration.update();
        }
    });
}

async function installPWA() {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
            const btn = $('btnInstallApp');
            if (btn) btn.style.display = 'none';
        }
        deferredPrompt = null;
    } else {
        alert('Per installare l\'app, usa il menu del browser e seleziona "Aggiungi a Home" o "Installa app".');
    }
}

// =====================================================================
// 7. AUTH SUPABASE
// =====================================================================
function openAuthModal() {
    const modal = $('modal-auth') || $('authModal');
    if (!modal) return;
    modal.classList.remove('hidden');
    modal.classList.add('active');
}

function closeAuthModal(event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    const modal = $('modal-auth') || $('authModal');
    if (!modal) return;
    modal.classList.remove('active');
    modal.classList.add('hidden');
}

async function signInWithGoogle() {
    if (!supabase) {
        alert('Supabase non disponibile. Proseguo in locale.');
        return;
    }
    try {
        await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo: window.location.origin }
        });
    } catch (err) {
        console.warn('[SUPABASE] Google login fallito, proseguo in locale.', err);
        alert('Login Google non disponibile. Proseguo in locale.');
    }
}

async function signInWithEmail() {
    if (!supabase) {
        alert('Supabase non disponibile. Proseguo in locale.');
        return;
    }
    const email = $('authEmail').value.trim();
    const password = $('authPassword').value;
    if (!email || !password) return alert('Inserisci email e password');
    try {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        closeAuthModal();
        showToast('Login effettuato!', false);
    } catch (err) {
        alert('Errore login: ' + err.message);
    }
}

async function signUpWithEmail() {
    if (!supabase) {
        alert('Supabase non disponibile. Proseguo in locale.');
        return;
    }
    const email = $('authEmail').value.trim();
    const password = $('authPassword').value;
    if (!email || !password) return alert('Inserisci email e password');
    try {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        closeAuthModal();
        alert('Controlla la tua email per confermare la registrazione!');
    } catch (err) {
        alert('Errore registrazione: ' + err.message);
    }
}

async function signOut() {
    if (supabase) {
        try {
            await supabase.auth.signOut();
        } catch (err) {
            console.warn('[SUPABASE] Logout fallito.', err);
        }
    }
    currentUser = null;
    realtimeChannel = null;
    updateAuthUI();
    localStorage.removeItem('supabase_first_sync_done');
}

function updateAuthUI() {
    const headerBtn = $('btn-open-auth') || $('btnAuthAction');
    const statusText = $('authStatusText');
    const settingsBtn = $('btn-settings-auth') || $('btnSettingsAuth');

    if (headerBtn) {
        if (currentUser) {
            headerBtn.innerText = 'Disconnetti';
            headerBtn.onclick = signOut;
        } else {
            headerBtn.innerText = 'Accedi / Registrati';
            headerBtn.onclick = openAuthModal;
        }
    }

    if (statusText) statusText.style.display = currentUser ? 'block' : 'none';
    if (settingsBtn) settingsBtn.style.display = currentUser ? 'none' : 'block';
}

async function setupSupabaseAuth() {
    if (!supabase) {
        console.warn('[SUPABASE] Libreria non caricata. App locale attiva.');
        updateAuthUI();
        return;
    }

    try {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        currentUser = data?.session?.user || null;

        if (currentUser && !localStorage.getItem('supabase_first_sync_done')) {
            await syncLocalToSupabaseFirstTime();
            localStorage.setItem('supabase_first_sync_done', 'true');
        }

        updateAuthUI();

        if (currentUser) {
            await subscribeSupabaseRealtime();
        }

        supabase.auth.onAuthStateChange(async (_event, session) => {
            currentUser = session?.user || null;
            updateAuthUI();
            if (currentUser) {
                await subscribeSupabaseRealtime();
                if (!localStorage.getItem('supabase_first_sync_done')) {
                    await syncLocalToSupabaseFirstTime();
                    localStorage.setItem('supabase_first_sync_done', 'true');
                }
            } else {
                realtimeChannel = null;
            }
        });
    } catch (err) {
        console.warn('[SUPABASE] Sessione non recuperata. App locale attiva.', err);
        currentUser = null;
        updateAuthUI();
    }
}

async function subscribeSupabaseRealtime() {
    if (!isCloudReady() || realtimeChannel) return;
    try {
        realtimeChannel = supabase
            .channel(`local-sync-${currentUser.id}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'income' }, () => loadMonthData())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, () => loadMonthData())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'categories' }, () => initCategories())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'annual_deadlines' }, () => loadAnnualDeadlines())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'months' }, () => loadMonthData())
            .subscribe();
    } catch (err) {
        console.warn('[SUPABASE] Realtime non attivo, solo locale.', err);
    }
}

async function syncLocalToSupabaseFirstTime() {
    if (!isCloudReady()) return;
    try {
        const categories = await db.categories.toArray();
        const months = await db.months.toArray();
        const incomes = await db.income.toArray();
        const expenses = await db.expenses.toArray();
        const deadlines = await db.annualDeadlines.toArray();
        const savingsGoals = await db.savingsGoals.toArray();
        const settings = await db.settings.toArray();

        if (categories.length) await supabase.from('categories').upsert(categories.map(c => ({ name: c.name, icon: c.icon || '🏷️', user_id: currentUser.id })));
        if (months.length) await supabase.from('months').upsert(months.map(m => ({ month: m.month, total_income: m.totalIncome, total_planned: m.totalPlanned, total_actual: m.totalActual, notes: m.notes || '', ia_notes: m.iaNotes || '', user_id: currentUser.id })));
        if (incomes.length) await supabase.from('income').upsert(incomes.map(i => ({ id: i.id, month: i.month, descrizione: i.desc, amount: i.amount, user_id: currentUser.id })));
        if (expenses.length) await supabase.from('expenses').upsert(expenses.map(e => ({ id: e.id, month: e.month, date: e.date, category: e.category, descrizione: e.desc, planned: e.planned, actual: e.actual, shared_percentage: e.sharedPercentage || 0, user_id: currentUser.id })));
        if (deadlines.length) await supabase.from('annual_deadlines').upsert(deadlines.map(d => ({ id: d.id, month: d.month, day: d.day || '', descrizione: d.desc, amount: d.amount, is_paid: !!d.isPaid, user_id: currentUser.id })));
        if (savingsGoals.length) await supabase.from('savings_goals').upsert(savingsGoals.map(s => ({ id: s.id, name: s.name, target_amount: s.targetAmount, importo_accumulato: s.importo_accumulato || 0, created_at: s.createdAt, user_id: currentUser.id })));
        if (settings.length) await supabase.from('settings').upsert(settings.map(s => ({ id: s.key, key: s.key, value: s.value, user_id: currentUser.id })));

        const versionState = await db.syncState.get('versionData');
        await supabase.from('sync_state').upsert({
            id: 'versionData',
            counter: (versionState?.counter || 0) + 1,
            device_id: getDeviceId(),
            lastUpdated: Date.now(),
            user_id: currentUser.id
        });

        showToast('✅ Primo backup su Cloud completato', false);
    } catch (err) {
        console.warn('[SUPABASE] Primo backup fallito, dati locali intatti.', err);
    }
}

// =====================================================================
// 8. INIZIALIZZAZIONE UI
// =====================================================================
function setupInitialUI() {
    startCycleDay = parseInt(localStorage.getItem('global_start_cycle_day')) || 23;
    const startDay = $('startCycleDay');
    if (startDay) startDay.value = startCycleDay;

    const now = new Date();
    let initYear = now.getFullYear();
    let initMonth = now.getMonth() + 1;
    if (now.getDate() >= startCycleDay) {
        initMonth += 1;
        if (initMonth > 12) {
            initMonth = 1;
            initYear += 1;
        }
    }
    const monthValue = `${initYear}-${String(initMonth).padStart(2, '0')}`;
    const currentMonth = $('currentMonth');
    const annDeadlineMonth = $('annDeadlineMonth');
    if (currentMonth) currentMonth.value = monthValue;
    if (annDeadlineMonth) annDeadlineMonth.value = monthValue;

    const expDate = $('expDate');
    if (expDate) expDate.value = now.toISOString().slice(0, 10);

    const provider = localStorage.getItem('ia_provider');
    const providerSelect = $('iaProviderSelect');
    if (provider && providerSelect) providerSelect.value = provider;

    const geminiKey = localStorage.getItem('gemini_api_key');
    const geminiInput = $('geminiApiKeyInput');
    if (geminiKey && geminiInput) geminiInput.value = geminiKey;

    renderIconOptions();
}

function renderIconOptions() {
    const select = $('newCatIcon');
    if (!select) return;
    select.innerHTML = '';
    ICON_OPTIONS.forEach((icon, index) => {
        const option = document.createElement('option');
        option.value = icon;
        option.innerText = icon;
        if (icon === '🏷️' || index === 0) option.selected = true;
        select.appendChild(option);
    });
}

async function initApp() {
    await migrateFromLocalStorage();
    await initCategories();
    await loadAnnualDeadlines();
    await loadMonthData();
    toggleIaProviderFields();
    checkDatabaseHealth();
    initPWA();

    const pushToggle = $('pushNotifToggle');
    if (localStorage.getItem('push_notifications_enabled') === 'true' && pushToggle) {
        pushToggle.checked = true;
        checkPushNotifications();
    }
}

async function migrateFromLocalStorage() {
    let hasData = false;
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith('bilancio_v2_') || key === 'user_categories' || key === 'annual_deadlines')) {
            hasData = true;
            break;
        }
    }
    if (!hasData) return;

    console.log('🔄 Migrazione dati da localStorage a IndexedDB...');
    try {
        const cats = localStorage.getItem('user_categories');
        if (cats) {
            await db.categories.bulkPut(JSON.parse(cats).map(c => ({ name: c, icon: getCategoryDefaultIcon(c) })));
        } else {
            await db.categories.bulkPut(DEFAULT_CATEGORIES);
        }

        const deadlines = localStorage.getItem('annual_deadlines');
        if (deadlines) {
            const parsed = JSON.parse(deadlines);
            await db.annualDeadlines.bulkPut(parsed.map(d => ({
                id: d.id,
                month: d.month,
                day: d.day || '',
                desc: d.desc,
                amount: d.amount,
                isPaid: !!d.isPaid
            })));
        }

        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (!key || !key.startsWith('bilancio_v2_')) continue;
            const monthStr = key.replace('bilancio_v2_', '');
            const data = JSON.parse(localStorage.getItem(key) || '{}');
            const tIncome = data.income ? data.income.reduce((sum, item) => sum + Number(item.amount || 0), 0) : 0;
            const tPlanned = data.expenses ? data.expenses.reduce((sum, item) => sum + Number(item.planned || 0), 0) : 0;
            const tActual = data.expenses ? data.expenses.reduce((sum, item) => sum + Number(item.actual || 0), 0) : 0;

            await db.months.put({
                month: monthStr,
                totalIncome: tIncome,
                totalPlanned: tPlanned,
                totalActual: tActual,
                notes: data.notes || '',
                iaNotes: data.iaNotes || ''
            });
            if (data.income?.length) await db.income.bulkPut(data.income.map(inc => ({ id: inc.id, month: monthStr, desc: inc.desc, amount: inc.amount })));
            if (data.expenses?.length) await db.expenses.bulkPut(data.expenses.map(e => ({
                id: e.id,
                month: monthStr,
                date: e.date,
                category: e.category,
                desc: e.desc,
                planned: e.planned,
                actual: e.actual,
                sharedPercentage: e.sharedPercentage || 0
            })));
        }

        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && (key.startsWith('bilancio_v2_') || key === 'user_categories' || key === 'annual_deadlines')) keysToRemove.push(key);
        }
        keysToRemove.forEach(key => localStorage.removeItem(key));
        console.log('✅ Migrazione completata.');
    } catch (err) {
        console.warn('[MIGRATION] Errore migrazione, proseguo con DB esistente.', err);
    }
}

// =====================================================================
// 9. NAVIGAZIONE TAB
// =====================================================================
function updateActivePageSubtitle(tabId) {
    const subtitle = $('activePageSubtitle');
    if (subtitle) subtitle.textContent = TAB_TITLES[tabId] || 'Dashboard';
}

function switchTab(tabId, buttonEl) {
    document.querySelectorAll('.tab-content').forEach(panel => {
        panel.classList.remove('active');
        panel.classList.add('hidden');
    });
    document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));

    const target = $(tabId);
    if (!target) return;

    target.classList.remove('hidden');
    target.classList.add('active');
    if (buttonEl) buttonEl.classList.add('active');

    updateActivePageSubtitle(tabId);
    if (tabId === 'history-tab') {
        renderGlobalHistory();
        renderTradingChart();
    }
    if (tabId === 'future-tab') {
        renderFutureProjections();
        renderSavingsGoals();
        renderAnnualDeadlines();
    }
    window.scrollTo(0, 0);
}

function scrollToAddExpense() {
    switchTab('current-month-tab', $('tab-btn-current'));
    setTimeout(() => {
        const card = $('addExpenseCard');
        if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
}

// =====================================================================
// 10. HELPER: toggleSection (mancava!)
// =====================================================================
function toggleSection(id, headerEl) {
    const content = $(id);
    if (!content) return;
    const isOpen = content.classList.toggle('show');
    if (headerEl) headerEl.classList.toggle('show', isOpen);
}

// =====================================================================
// 11. CICLO / MESE
// =====================================================================
function getMonthRange(monthStr) {
    const year = parseInt(monthStr.split('-')[0], 10);
    const month = parseInt(monthStr.split('-')[1], 10);
    const startMonth = month - 1;
    let startYear = year;
    const realStartMonth = startMonth === 0 ? 12 : startMonth;
    if (startMonth === 0) startYear -= 1;

    const endDay = startCycleDay - 1;
    if (endDay === 0) {
        const prevMonthDays = new Date(year, month - 1, 0).getDate();
        return {
            start: new Date(startYear, realStartMonth - 1, 1),
            end: new Date(startYear, realStartMonth - 1, prevMonthDays)
        };
    }
    return {
        start: new Date(startYear, realStartMonth - 1, startCycleDay),
        end: new Date(year, month - 1, endDay)
    };
}

function changeStartCycleDay() {
    const input = $('startCycleDay');
    const val = parseInt(input.value, 10);
    if (Number.isNaN(val) || val < 1 || val > 28) {
        alert('Inserisci un giorno tra 1 e 28.');
        input.value = startCycleDay;
        return;
    }
    startCycleDay = val;
    localStorage.setItem('global_start_cycle_day', String(startCycleDay));
    loadMonthData();
}

async function checkDatabaseHealth() {
    const count = await db.months.count();
    const box = $('recoveryAlertBox');
    if (box) box.style.display = (count === 0 && annualDeadlines.length === 0) ? 'block' : 'none';
}

// =====================================================================
// 12. CATEGORIE
// =====================================================================
function getCategoryDefaultIcon(name) {
    const found = DEFAULT_CATEGORIES.find(cat => cat.name === name);
    return found ? found.icon : '🏷️';
}

async function initCategories() {
    const storedCats = await db.categories.toArray();
    if (storedCats.length > 0) {
        userCategories = storedCats.map(c => c.name);
        categoryIconMap = {};
        storedCats.forEach(c => { categoryIconMap[c.name] = c.icon || getCategoryDefaultIcon(c.name); });
    } else {
        userCategories = DEFAULT_CATEGORIES.map(c => c.name);
        categoryIconMap = {};
        DEFAULT_CATEGORIES.forEach(c => { categoryIconMap[c.name] = c.icon; });
        await db.categories.bulkPut(DEFAULT_CATEGORIES);
    }
    renderCategoriesDropdown();
}

function getCatIcon(catName) {
    return categoryIconMap[catName] || getCategoryDefaultIcon(catName);
}

function renderCategoriesDropdown() {
    const select = $('expenseCategory');
    const adminList = $('categoriesAdminList');
    if (!select || !adminList) return;

    select.innerHTML = '';
    adminList.innerHTML = '';
    [...userCategories].sort((a, b) => a.localeCompare(b)).forEach(cat => {
        const icon = getCatIcon(cat);

        const opt = document.createElement('option');
        opt.value = cat;
        opt.innerText = `${icon} ${cat}`;
        select.appendChild(opt);

        const tag = document.createElement('span');
        tag.className = 'cat-tag';
        tag.innerHTML = `<span>${icon} ${escapeHtml(cat)}</span>`;

        const editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.innerText = '✏️';
        editBtn.addEventListener('click', () => editCategory(cat));

        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.innerText = '×';
        deleteBtn.addEventListener('click', () => deleteCategory(cat));

        tag.appendChild(editBtn);
        tag.appendChild(deleteBtn);
        adminList.appendChild(tag);
    });
}

function editCategory(cat) {
    const nameInput = $('newCatName');
    const iconSelect = $('newCatIcon');
    const saveBtn = $('btnSaveCategory');
    if (!nameInput || !iconSelect || !saveBtn) return;

    categoryToEdit = cat;
    nameInput.value = cat;
    iconSelect.value = getCatIcon(cat);
    saveBtn.innerText = 'Salva';
    saveBtn.style.background = '#f59e0b';
}

async function saveCategory() {
    const input = $('newCatName');
    const iconSelect = $('newCatIcon');
    const saveBtn = $('btnSaveCategory');
    if (!input || !iconSelect || !saveBtn) return;

    const name = input.value.trim();
    if (!name) return;
    const icon = iconSelect.value || '🏷️';

    if (categoryToEdit) {
        const oldName = categoryToEdit;
        if (name !== oldName && userCategories.includes(name)) {
            alert('Categoria già esistente.');
            return;
        }
        if (name !== oldName) {
            const allExpenses = await db.expenses.where('category').equals(oldName).toArray();
            for (const expense of allExpenses) await db.expenses.update(expense.id, { category: name });
            currentData.expenses.forEach(e => { if (e.category === oldName) e.category = name; });
            userCategories = userCategories.filter(c => c !== oldName);
            delete categoryIconMap[oldName];
            await db.categories.delete(oldName);
        }
        if (!userCategories.includes(name)) userCategories.push(name);
        categoryIconMap[name] = icon;
        await db.categories.put({ name, icon });
        categoryToEdit = null;
        saveBtn.innerText = 'Aggiungi';
        saveBtn.style.background = 'var(--accent)';
    } else {
        if (userCategories.includes(name)) return;
        userCategories.push(name);
        categoryIconMap[name] = icon;
        await db.categories.put({ name, icon });
    }

    input.value = '';
    await renderCategoriesDropdown();
    renderImportCheckboxList();
    await updateUI();
    await safeCloudCall('salvataggio categoria', syncLocalToSupabaseFirstTime);
}

async function deleteCategory(cat) {
    if (!confirm(`Eliminare "${cat}"?`)) return;
    userCategories = userCategories.filter(c => c !== cat);
    delete categoryIconMap[cat];
    await db.categories.delete(cat);
    await renderCategoriesDropdown();
    renderImportCheckboxList();
    await updateUI();
    await safeCloudCall('eliminazione categoria', syncLocalToSupabaseFirstTime);
}

function renderImportCheckboxList() {
    const container = $('importCategoriesList');
    if (!container) return;
    container.innerHTML = '';
    const autoChecked = ['Alimentari', 'Carburante Auto', 'Mutuo', 'Bolletta Luce', 'Varie'];
    [...userCategories].sort((a, b) => a.localeCompare(b)).forEach(cat => {
        const label = document.createElement('label');
        label.className = 'import-checkbox-item';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = cat;
        checkbox.checked = autoChecked.includes(cat);
        label.appendChild(checkbox);
        label.appendChild(document.createTextNode(` ${getCatIcon(cat)} ${cat}`));
        container.appendChild(label);
    });
}

// =====================================================================
// 13. DATI MESE
// =====================================================================
async function loadMonthData() {
    const monthInput = $('currentMonth');
    const month = monthInput?.value;
    if (!month) return;

    const incomes = await db.income.where('month').equals(month).toArray();
    const expenses = await db.expenses.where('month').equals(month).toArray();
    currentData = { income: incomes, expenses };

    const mData = await db.months.get(month);
    const userNotes = $('userNotes');
    const iaNotes = $('iaNotes');
    if (userNotes) userNotes.value = mData?.notes || '';
    if (iaNotes) iaNotes.value = mData?.iaNotes || '';

    clearAllFilters(false);
    checkAnnualAlertForCurrentMonth();
    renderImportCheckboxList();
    await updateUI();
}

async function addIncome() {
    const month = $('currentMonth').value;
    const desc = $('incDesc').value.trim() || 'Entrata';
    const amount = Number($('incAmount').value) || 0;
    if (amount <= 0) return;

    const inc = { id: Date.now(), month, desc, amount };
    currentData.income.push(inc);
    await db.income.put(inc);

    $('incDesc').value = '';
    $('incAmount').value = '';
    await updateUI();
    await checkDatabaseHealth();
    await safeCloudCall('backup entrata', syncLocalToSupabaseFirstTime);
}

async function addExpense() {
    const month = $('currentMonth').value;
    const date = $('expDate').value;
    const cat = $('expenseCategory').value;
    const desc = $('expDesc').value.trim() || 'Spesa';
    let planned = Number($('expPlanned').value) || 0;
    let actual = Number($('expActual').value) || 0;
    const shared = Number($('expShared').value) || 0;

    if (planned === 0 && actual === 0) return;
    if (shared > 0 && shared < 100) {
        planned *= shared / 100;
        actual *= shared / 100;
    }

    const exp = { id: Date.now(), month, date, category: cat, desc, planned, actual, sharedPercentage: shared };
    currentData.expenses.push(exp);
    await db.expenses.put(exp);

    $('expDesc').value = '';
    $('expPlanned').value = '';
    $('expActual').value = '';
    $('expShared').value = '';
    await updateUI();
    await checkDatabaseHealth();
    await safeCloudCall('backup spesa', syncLocalToSupabaseFirstTime);
}

async function payExpense(id) {
    const exp = currentData.expenses.find(item => item.id === id);
    if (!exp) return;
    const val = prompt('Importo effettivo pagato (€):', fmtEPlain(exp.planned).replace(' €', ''));
    if (val === null) return;
    const paid = Number(val.replace(',', '.'));
    if (!Number.isNaN(paid)) {
        exp.actual = paid;
        await db.expenses.update(id, { actual: paid });
        await updateUI();
        await safeCloudCall('pagamento spesa', syncLocalToSupabaseFirstTime);
    }
}

async function deleteEntry(type, id) {
    if (type === 'income') {
        currentData.income = currentData.income.filter(item => item.id !== id);
        await db.income.delete(id);
        await safeCloudCall('delete entrata cloud', () => supabase.from('income').delete().eq('id', id));
    } else {
        currentData.expenses = currentData.expenses.filter(item => item.id !== id);
        await db.expenses.delete(id);
        await safeCloudCall('delete spesa cloud', () => supabase.from('expenses').delete().eq('id', id));
    }
    await updateUI();
    await checkDatabaseHealth();
}

async function copyFromPreviousMonth() {
    const currentMonthVal = $('currentMonth').value;
    const [yearRaw, monthRaw] = currentMonthVal.split('-').map(Number);
    let year = yearRaw;
    let month = monthRaw - 1;
    if (month === 0) {
        month = 12;
        year -= 1;
    }
    const prevMonthStr = `${year}-${String(month).padStart(2, '0')}`;
    const prevExpenses = await db.expenses.where('month').equals(prevMonthStr).toArray();
    if (!prevExpenses.length) {
        alert('Nessun dato nel ciclo precedente.');
        return;
    }

    const selected = [...document.querySelectorAll('#importCategoriesList input[type="checkbox"]')]
        .filter(cb => cb.checked)
        .map(cb => cb.value);
    if (!selected.length) {
        alert('Seleziona almeno una categoria.');
        return;
    }

    const range = getMonthRange(currentMonthVal);
    let count = 0;
    for (const exp of prevExpenses) {
        if (selected.includes(exp.category) && !currentData.expenses.some(item => item.category === exp.category)) {
            const newExp = {
                id: Date.now() + count,
                month: currentMonthVal,
                date: range.start.toISOString().slice(0, 10),
                category: exp.category,
                desc: 'Stima ereditata',
                planned: exp.planned || exp.actual,
                actual: 0,
                sharedPercentage: 0
            };
            currentData.expenses.push(newExp);
            await db.expenses.put(newExp);
            count += 1;
        }
    }
    await updateUI();
    await checkDatabaseHealth();
    alert(`${count} voci ereditate.`);
    await safeCloudCall('backup stime', syncLocalToSupabaseFirstTime);
}

// =====================================================================
// 14. NOTE
// =====================================================================
async function saveNotes() {
    const month = $('currentMonth').value;
    const notes = $('userNotes').value;
    const iaNotes = $('iaNotes').value;
    const existing = await db.months.get(month);
    await db.months.put({
        month,
        totalIncome: existing?.totalIncome || 0,
        totalPlanned: existing?.totalPlanned || 0,
        totalActual: existing?.totalActual || 0,
        notes,
        iaNotes
    });
    await safeCloudCall('salvataggio note', syncLocalToSupabaseFirstTime);
}

// =====================================================================
// 15. SCADENZARIO
// =====================================================================
async function loadAnnualDeadlines() {
    annualDeadlines = await db.annualDeadlines.toArray();
    await renderAnnualDeadlines();
    checkAnnualAlertForCurrentMonth();
}

async function addAnnualDeadline() {
    const month = $('annDeadlineMonth').value;
    const day = $('annDeadlineDay').value;
    const desc = $('annDeadlineDesc').value.trim();
    const amount = Number($('annDeadlineAmount').value) || 0;
    if (!month || !desc || amount <= 0) {
        alert('Compila mese, descrizione e importo.');
        return;
    }
    await db.annualDeadlines.put({ id: Date.now(), month, day, desc, amount, isPaid: false });
    $('annDeadlineDesc').value = '';
    $('annDeadlineAmount').value = '';
    $('annDeadlineDay').value = '';
    await loadAnnualDeadlines();
    await safeCloudCall('backup scadenza', syncLocalToSupabaseFirstTime);
}

async function deleteAnnualDeadline(id) {
    if (!confirm('Eliminare questa scadenza?')) return;
    await db.annualDeadlines.delete(id);
    await safeCloudCall('delete scadenza cloud', () => supabase.from('annual_deadlines').delete().eq('id', id));
    await loadAnnualDeadlines();
}

async function toggleDeadlinePaid(id, isPaid) {
    await db.annualDeadlines.update(id, { isPaid });
    await loadAnnualDeadlines();
    await safeCloudCall('stato scadenza', syncLocalToSupabaseFirstTime);
}

async function renderAnnualDeadlines() {
    const container = $('annualDeadlinesList');
    if (!container) return;
    container.innerHTML = '';
    if (!annualDeadlines.length) {
        container.innerHTML = '<p style="color:#94a3b8;font-size:13px;text-align:center;padding:20px;">Nessuna scadenza inserita.</p>';
        return;
    }

    annualDeadlines.sort((a, b) => {
        const da = new Date(`${a.month}-${a.day ? String(a.day).padStart(2, '0') : '01'}`);
        const dbDate = new Date(`${b.month}-${b.day ? String(b.day).padStart(2, '0') : '01'}`);
        return da - dbDate;
    });

    const today = new Date();
    annualDeadlines.forEach(item => {
        const row = document.createElement('div');
        row.className = 'item-row';
        const deadlineDate = new Date(`${item.month}-${item.day ? String(item.day).padStart(2, '0') : '01'}`);
        const isPast = !item.isPaid && deadlineDate < today;
        const formattedMonth = item.month.split('-').reverse().join('/') + (item.day ? ` (g.${item.day})` : '');
        if (isPast) row.style.cssText = 'background:#fee2e2;border-left:4px solid #ef4444;padding-left:10px;border-radius:6px;';
        if (item.isPaid) row.style.opacity = '0.65';

        row.innerHTML = `
            <span class="item-name">${item.isPaid ? '✅' : isPast ? '🚨' : '⏰'} <strong>${escapeHtml(item.desc)}</strong><span class="item-meta">${formattedMonth}</span></span>
            <span class="item-vals">
                <span style="color:var(--previsto);font-weight:bold;font-size:13px;">${fmtE(item.amount)}</span>
                ${!item.isPaid ? `<button class="btn-action btn-pay" type="button">Pagato</button>` : `<button class="btn-action" type="button" style="background:#64748b;">Annulla</button>`}
                <button class="btn-del" type="button">✕</button>
            </span>`;

        const actionBtn = row.querySelector('.btn-action');
        actionBtn.addEventListener('click', () => toggleDeadlinePaid(item.id, !item.isPaid));
        row.querySelector('.btn-del').addEventListener('click', () => deleteAnnualDeadline(item.id));
        container.appendChild(row);
    });

    if (localStorage.getItem('push_notifications_enabled') === 'true') checkPushNotifications();
}

function checkAnnualAlertForCurrentMonth() {
    const currentMonthVal = $('currentMonth')?.value;
    const alertBox = $('annualMonthAlert');
    if (!currentMonthVal || !alertBox) return;
    const match = (annualDeadlines || []).filter(d => d.month === currentMonthVal && !d.isPaid);
    if (match.length > 0) {
        alertBox.innerHTML = `🔔 <strong>Scadenze annuali da pagare questo mese:</strong><ul style="margin:6px 0 0 18px;">${match.map(d => `<li>${escapeHtml(d.desc)}${d.day ? ' (g.' + d.day + ')' : ''}: <strong>${fmtE(d.amount)}</strong></li>`).join('')}</ul>`;
        alertBox.style.display = 'block';
    } else {
        alertBox.style.display = 'none';
    }
}

// =====================================================================
// 16. UI PRINCIPALE
// =====================================================================
async function updateUI() {
    const totalIncome = currentData.income.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const totalPlanned = currentData.expenses.reduce((sum, item) => sum + Number(item.planned || 0), 0);
    const totalActual = currentData.expenses.reduce((sum, item) => sum + Number(item.actual || 0), 0);

    const sumEntrate = $('sumEntrate');
    const sumPrevisto = $('sumPrevisto');
    const sumSostenuto = $('sumSostenuto');
    if (sumEntrate) sumEntrate.innerText = fmtE(totalIncome);
    if (sumPrevisto) sumPrevisto.innerText = fmtE(totalPlanned);
    if (sumSostenuto) sumSostenuto.innerText = fmtE(totalActual);

    const netSavings = totalIncome - totalActual;
    const savingsPercent = totalIncome > 0 ? ((netSavings / totalIncome) * 100).toFixed(1) : '0';
    const month = $('currentMonth').value;
    const existingMonth = await db.months.get(month);
    await db.months.put({
        month,
        totalIncome,
        totalPlanned,
        totalActual,
        notes: existingMonth?.notes || '',
        iaNotes: existingMonth?.iaNotes || ''
    });
    await safeCloudCall('salvataggio mese', syncLocalToSupabaseFirstTime);

    const pending = currentData.expenses.filter(e => e.planned > 0 && e.actual === 0).length;
    const alertBox = $('deadlineAlert');
    if (alertBox) {
        alertBox.innerText = pending > 0 ? `⏳ ${pending} uscite pianificate in attesa di saldo.` : '';
        alertBox.style.display = pending > 0 ? 'block' : 'none';
    }

    const catSums = {};
    userCategories.forEach(cat => { catSums[cat] = { planned: 0, actual: 0 }; });
    currentData.expenses.forEach(exp => {
        if (catSums[exp.category]) {
            catSums[exp.category].planned += exp.planned || 0;
            catSums[exp.category].actual += exp.actual || 0;
        }
    });

    const tableBody = $('overviewTableBody');
    if (tableBody) {
        tableBody.innerHTML = '';
        [...userCategories].sort((a, b) => a.localeCompare(b)).forEach(cat => {
            const pVal = catSums[cat].planned;
            const aVal = catSums[cat].actual;
            const diff = pVal - aVal;
            if (pVal <= 0 && aVal <= 0) return;
            const diffClass = diff >= 0 ? 'diff-plus' : 'diff-minus';
            const diffText = `${diff >= 0 ? '+' : ''}${fmtE(diff)}`;
            const row = document.createElement('div');
            row.className = 'flat-row';
            if (selectedFilterCategory === cat) row.classList.add('selected');
            row.onclick = () => filterByCategory(cat);
            row.innerHTML = `
                <div class="flat-left">
                    <div class="flat-icon">${getCatIcon(cat)}</div>
                    <div class="flat-title-group">
                        <span class="flat-title">${escapeHtml(cat)}</span>
                        <span class="flat-subtitle val-previsto">${fmtE(pVal)}</span>
                    </div>
                </div>
                <div class="flat-right">
                    <span class="flat-actual val-sostenuto">${fmtE(aVal)}</span>
                    <span class="flat-margin ${diffClass}">${diffText}</span>
                </div>`;
            tableBody.appendChild(row);
        });
    }

    const tableFoot = $('overviewTableFoot');
    if (tableFoot) {
        tableFoot.innerHTML = '';
        const savingsDiv = document.createElement('div');
        savingsDiv.className = 'flat-footer-row';
        savingsDiv.innerHTML = `
            <div class="flat-footer-title">💰 RISPARMIO NETTO <span class="savings-badge">${savingsPercent}%</span></div>
            <div class="flat-footer-actual">${fmtE(netSavings)}</div>`;
        tableFoot.appendChild(savingsDiv);
    }

    renderCalendar();

    const btnClear = $('btnClearAllFilters');
    if (btnClear) btnClear.style.display = (selectedFilterDate || selectedFilterCategory || searchQuery !== '') ? 'inline-block' : 'none';

    renderEntriesList();
    renderCharts(totalIncome, totalPlanned, totalActual, catSums);
}

function renderCalendar() {
    const grid = $('calendarGrid');
    const monthVal = $('currentMonth')?.value;
    if (!grid || !monthVal) return;
    grid.innerHTML = '';
    ['L', 'M', 'M', 'G', 'V', 'S', 'D'].forEach(day => {
        const header = document.createElement('div');
        header.className = 'calendar-day-header';
        header.innerText = day;
        grid.appendChild(header);
    });

    const range = getMonthRange(monthVal);
    const firstDayIndex = (range.start.getDay() + 6) % 7;
    for (let i = 0; i < firstDayIndex; i++) {
        const empty = document.createElement('div');
        empty.className = 'calendar-day empty';
        grid.appendChild(empty);
    }

    const cursor = new Date(range.start);
    while (cursor <= range.end) {
        const ds = cursor.toISOString().slice(0, 10);
        const dayNum = cursor.getDate();
        const hasPlanned = currentData.expenses.some(e => e.date === ds && e.planned > 0);
        const hasDeadline = annualDeadlines.some(a => a.month === monthVal && (!a.day || Number(a.day) === dayNum) && !a.isPaid);
        const dayEl = document.createElement('div');
        dayEl.className = `calendar-day${hasPlanned || hasDeadline ? ' has-deadline' : ''}${selectedFilterDate === ds ? ' selected' : ''}`;
        dayEl.innerHTML = `${cursor.getDate()}<span>${cursor.getMonth() + 1}/${cursor.getFullYear().toString().slice(-2)}</span>`;
        dayEl.onclick = () => filterByDate(ds);
        grid.appendChild(dayEl);
        cursor.setDate(cursor.getDate() + 1);
    }
}

function filterByCategory(cat) {
    selectedFilterCategory = cat;
    selectedFilterDate = null;
    $('listTitle').scrollIntoView({ behavior: 'smooth' });
    updateUI();
}

function filterByDate(date) {
    selectedFilterDate = date;
    selectedFilterCategory = null;
    $('listTitle').scrollIntoView({ behavior: 'smooth' });
    updateUI();
}

function handleSearch() {
    searchQuery = $('searchInput').value.toLowerCase();
    updateUI();
}

function clearAllFilters(update = true) {
    selectedFilterDate = null;
    selectedFilterCategory = null;
    searchQuery = '';
    const input = $('searchInput');
    if (input) input.value = '';
    if (update) updateUI();
}

function renderEntriesList() {
    const listContainer = $('entriesList');
    if (!listContainer) return;
    listContainer.innerHTML = '';

    if (!selectedFilterDate && !selectedFilterCategory && searchQuery === '') {
        currentData.income.forEach(inc => {
            const row = document.createElement('div');
            row.className = 'item-row';
            row.innerHTML = `<span class="item-name">💰 <strong>${escapeHtml(inc.desc)}</strong></span><span class="item-vals"><span style="color:var(--entrate);font-weight:bold;">+${fmtE(inc.amount)}</span><button class="btn-del" type="button">✕</button></span>`;
            row.querySelector('.btn-del').addEventListener('click', () => deleteEntry('income', inc.id));
            listContainer.appendChild(row);
        });
    }

    let filteredExpenses = [...currentData.expenses];
    if (selectedFilterDate) filteredExpenses = filteredExpenses.filter(e => e.date === selectedFilterDate);
    if (selectedFilterCategory) filteredExpenses = filteredExpenses.filter(e => e.category === selectedFilterCategory);
    if (searchQuery !== '') filteredExpenses = filteredExpenses.filter(e => `${e.desc} ${e.category} ${e.date}`.toLowerCase().includes(searchQuery));
    filteredExpenses.sort((a, b) => new Date(b.date) - new Date(a.date));

    filteredExpenses.forEach(exp => {
        const isPending = exp.planned > 0 && exp.actual === 0;
        const fd = exp.date.split('-').reverse().slice(0, 2).join('/');
        const sharedTxt = exp.sharedPercentage > 0 ? ` <span style="font-size:9px;color:#3b82f6;">(${exp.sharedPercentage}%)</span>` : '';
        const row = document.createElement('div');
        row.className = 'item-row';
        row.innerHTML = `
            <span class="item-name">${isPending ? '⏳ ' : ''}${getCatIcon(exp.category)} <strong>${escapeHtml(exp.category)}</strong>${sharedTxt}<span class="item-meta">${fd} · ${escapeHtml(exp.desc)}</span></span>
            <span class="item-vals">
                <div><span class="val-s">${exp.actual > 0 ? fmtE(exp.actual) : 'Da pagare'}</span></div>
                ${isPending ? `<button class="btn-action btn-pay" type="button">Paga</button>` : ''}
                <button class="btn-del" type="button">✕</button>
            </span>`;
        const payBtn = row.querySelector('.btn-pay');
        if (payBtn) payBtn.addEventListener('click', () => payExpense(exp.id));
        row.querySelector('.btn-del').addEventListener('click', () => deleteEntry('expense', exp.id));
        listContainer.appendChild(row);
    });
}

function renderCharts(totalIncome, totalPlanned, totalActual, catSums) {
    try {
        if (chartB) chartB.destroy();
        chartB = new Chart($('budgetChart').getContext('2d'), {
            type: 'bar',
            data: {
                labels: ['Entrate', 'Spese Previste', 'Spese Sostenute'],
                datasets: [{
                    data: [totalIncome, totalPlanned, totalActual],
                    backgroundColor: ['#10b981', '#ff9800', '#e53935'],
                    borderRadius: 6
                }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
        });

        if (chartC) chartC.destroy();
        const activeCats = Object.keys(catSums).filter(cat => catSums[cat].actual > 0);
        chartC = new Chart($('categoryChart').getContext('2d'), {
            type: 'doughnut',
            data: {
                labels: activeCats,
                datasets: [{
                    data: activeCats.map(cat => catSums[cat].actual),
                    backgroundColor: ['#3b82f6', '#8b5cf6', '#475569', '#0d9488', '#10b981', '#ff9800', '#f97316', '#e53935']
                }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { boxWidth: 8, font: { size: 9 } } } } }
        });
    } catch (err) {
        console.warn('[CHART] Chart non disponibile.', err);
    }
}

// =====================================================================
// 17. RENDICONTO
// =====================================================================
async function openRendicontoPopup(type) {
    const month = $('currentMonth').value;
    if (!month) return;
    const prevMonth = getPreviousMonthStrings(month, 1)[0];
    const rows = await buildRendicontoRows(type, month, prevMonth);
    const barsContainer = $('popupBars');
    const title = $('popupTitle');
    const subtitle = $('popupSubtitle');
    const overlay = $('popup-rendiconto');

    const currentTitle = type === 'entrate' ? 'Entrate' : type === 'previsto' ? 'Spese Previste' : 'Spese Sostenute';
    if (title) title.innerText = 'Panoramica del mese corrente';
    if (subtitle) subtitle.innerText = `${currentTitle} · ${month.split('-').reverse().join('/')} vs ${prevMonth.split('-').reverse().join('/')}`;

    if (barsContainer) {
        if (!rows.length) {
            barsContainer.innerHTML = '<div style="font-size:13px;color:#64748b;padding:18px 0;text-align:center;">Nessun dato disponibile per questa panoramica.</div>';
        } else {
            const maxValue = Math.max(...rows.map(row => Math.max(row.currentValue, row.previousValue)), 1);
            barsContainer.innerHTML = rows.map(row => {
                const currentPct = Math.round((row.currentValue / maxValue) * 100);
                const previousPct = Math.round((row.previousValue / maxValue) * 100);
                const variation = row.previousValue === 0 ? (row.currentValue === 0 ? '0%' : '+100%') : `${row.currentValue === row.previousValue ? '0%' : (row.currentValue > row.previousValue ? '+' : '') + Math.round(((row.currentValue - row.previousValue) / row.previousValue) * 100)}%`;
                const previousLeft = `${Math.min(100, previousPct)}%`;
                const zebraHtml = previousPct > currentPct ? `<div class="popup-bar-zebra" style="left:${currentPct}%; width:${Math.min(100, previousPct - currentPct)}%;"></div>` : '';
                return `
                    <div class="popup-bar-row">
                        <div class="popup-bar-title"><span>${escapeHtml(row.label)}</span><span>${variation}</span></div>
                        <div class="popup-bar-visual">
                            <div class="popup-bar-fill" style="width:${Math.min(100, currentPct)}%; background:${row.color};"></div>
                            ${zebraHtml}
                            <div class="popup-bar-previous" style="left:${previousLeft};"></div>
                        </div>
                        <div class="popup-bar-meta"><span>${fmtEPlain(row.currentValue)}</span><span>Prev: ${fmtEPlain(row.previousValue)}</span></div>
                    </div>`;
            }).join('') + '<div class="popup-legend">La linea o la zebratura rappresentano il mese scorso.</div>';
        }
    }
    if (overlay) overlay.classList.add('active');
}

function renderRendiconto(type) {
    openRendicontoPopup(type);
}

function closeRendicontoPopup(event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    const overlay = $('popup-rendiconto');
    if (overlay) overlay.classList.remove('active');
}

async function buildRendicontoRows(type, month, prevMonth) {
    const currentMap = {};
    const previousMap = {};
    if (type === 'entrate') {
        const currentIncome = await db.income.where('month').equals(month).toArray();
        const prevIncome = await db.income.where('month').equals(prevMonth).toArray();
        return [{
            label: 'Entrate',
            currentValue: currentIncome.reduce((sum, item) => sum + Number(item.amount || 0), 0),
            previousValue: prevIncome.reduce((sum, item) => sum + Number(item.amount || 0), 0),
            color: '#10b981'
        }];
    }

    const currentExpenses = await db.expenses.where('month').equals(month).toArray();
    const prevExpenses = await db.expenses.where('month').equals(prevMonth).toArray();
    const field = type === 'previsto' ? 'planned' : 'actual';
    currentExpenses.forEach(item => {
        if ((item[field] || 0) > 0) currentMap[item.category] = (currentMap[item.category] || 0) + Number(item[field] || 0);
    });
    prevExpenses.forEach(item => {
        if ((item[field] || 0) > 0) previousMap[item.category] = (previousMap[item.category] || 0) + Number(item[field] || 0);
    });

    return Object.keys(currentMap).map(key => ({
        label: key,
        currentValue: currentMap[key] || 0,
        previousValue: previousMap[key] || 0,
        color: type === 'previsto' ? '#ff9800' : '#e53935'
    })).filter(row => row.currentValue > 0 || row.previousValue > 0)
      .sort((a, b) => b.currentValue - a.currentValue || b.previousValue - a.previousValue);
}

// =====================================================================
// 18. STORICO / SALVADANAI / PROIEZIONI
// =====================================================================
async function renderRecordsHub(monthsArray) {
    if (!monthsArray.length) return;
    const bestMonth = monthsArray.reduce((prev, curr) => (curr.totalIncome - curr.totalActual) > (prev.totalIncome - prev.totalActual) ? curr : prev);
    const bestMonthEl = $('recordBestMonth');
    if (bestMonthEl) bestMonthEl.innerHTML = `${bestMonth.month.split('-').reverse().join('/')}<br>${fmtE(bestMonth.totalIncome - bestMonth.totalActual)}`;

    const allExpenses = await db.expenses.toArray();
    if (allExpenses.length > 0) {
        const maxExp = allExpenses.reduce((prev, curr) => Number(curr.actual || 0) > Number(prev.actual || 0) ? curr : prev);
        const highestExpEl = $('recordHighestExp');
        if (highestExpEl) highestExpEl.innerHTML = `${fmtE(maxExp.actual)}<br>${escapeHtml(maxExp.category)}`;

        const catSums = {};
        allExpenses.forEach(e => { catSums[e.category] = (catSums[e.category] || 0) + Number(e.actual || 0); });
        const worstCat = Object.entries(catSums).reduce((prev, curr) => curr[1] > prev[1] ? curr : prev);
        const worstCatEl = $('recordWorstCat');
        if (worstCatEl) worstCatEl.innerHTML = `${escapeHtml(worstCat[0])}<br>${fmtE(worstCat[1])}`;
    }
}

async function renderSavingsGoals() {
    const goals = await db.savingsGoals.toArray();
    const container = $('savingsGoalsList');
    const depositSelect = $('depositSavingsSelect');
    if (!container) return;
    container.innerHTML = '';
    if (!goals.length) {
        container.innerHTML = '<p style="color:#94a3b8;font-size:12px;">Nessun salvadanaio creato.</p>';
        if (depositSelect) {
            depositSelect.innerHTML = '<option value="">Nessun salvadanaio disponibile</option>';
            depositSelect.disabled = true;
        }
        return;
    }
    if (depositSelect) {
        depositSelect.disabled = false;
        depositSelect.innerHTML = goals.map(g => `<option value="${g.id}">${escapeHtml(g.name)}</option>`).join('');
    }
    goals.forEach(g => {
        const accumulated = Number(g.importo_accumulato || 0);
        const target = Number(g.targetAmount || 0);
        const pct = target > 0 ? Math.min(100, Math.max(0, (accumulated / target) * 100)) : 0;
        const complete = pct >= 100;
        const item = document.createElement('div');
        item.style.cssText = 'background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px;margin-bottom:10px;';
        item.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;width:100%;gap:12px;margin-bottom:10px;flex-wrap:wrap;">
                <div style="font-weight:bold;">${escapeHtml(g.name)} ${complete ? '🎉' : ''}</div>
                <div style="display:flex;align-items:center;gap:8px;">
                    <span style="font-size:13px;color:#64748b;">${fmtE(accumulated)} / ${fmtE(target)}</span>
                    <button class="btn-del" type="button" style="font-size:12px;padding:2px 6px;">✕</button>
                </div>
            </div>
            <div style="height:12px;background:#e2e8f0;border-radius:10px;overflow:hidden;margin-bottom:8px;">
                <div style="width:${pct}%;height:100%;background:${complete ? '#10b981' : '#3b82f6'};"></div>
            </div>
            <div style="font-size:13px;color:#334155;">Avanzamento: <strong>${pct.toFixed(1)}%</strong></div>`;
        item.querySelector('.btn-del').addEventListener('click', () => deleteSavingsGoal(g.id));
        container.appendChild(item);
    });
}

async function addSavingsGoal() {
    const nameEl = $('sgName');
    const amountEl = $('sgAmount');
    if (!nameEl || !amountEl) return;
    const name = nameEl.value.trim();
    const amount = Number(amountEl.value) || 0;
    if (!name || amount <= 0) {
        alert('Inserisci un nome e un target valido.');
        return;
    }
    const id = Date.now();
    await db.savingsGoals.put({ id, name, targetAmount: amount, importo_accumulato: 0, createdAt: Date.now() });
    nameEl.value = '';
    amountEl.value = '';
    await renderSavingsGoals();
    await safeCloudCall('backup salvadanaio', syncLocalToSupabaseFirstTime);
}

async function deleteSavingsGoal(id) {
    if (!confirm('Eliminare questo obiettivo?')) return;
    await db.savingsGoals.delete(id);
    await safeCloudCall('delete salvadanaio cloud', () => supabase.from('savings_goals').delete().eq('id', id));
    await renderSavingsGoals();
}

async function depositToSavingsGoal() {
    const select = $('depositSavingsSelect');
    const amountInput = $('depositAmount');
    if (!select || !amountInput) return;
    const id = Number(select.value);
    const amount = Number(amountInput.value) || 0;
    if (!id || amount <= 0) {
        alert('Inserisci un importo valido da depositare.');
        return;
    }
    const goal = await db.savingsGoals.get(id);
    if (!goal) {
        alert('Salvadanaio non trovato.');
        return;
    }
    await db.savingsGoals.update(id, { importo_accumulato: (Number(goal.importo_accumulato || 0) + amount) });
    amountInput.value = '';
    await renderSavingsGoals();
    await safeCloudCall('deposito salvadanaio', syncLocalToSupabaseFirstTime);
}

async function renderGlobalHistory() {
    const months = await db.months.toArray();
    await renderRecordsHub(months);
    const hd = months.map(m => ({
        month: m.month,
        income: m.totalIncome,
        planned: m.totalPlanned,
        actual: m.totalActual,
        savings: m.totalIncome - m.totalActual
    })).sort((a, b) => a.month.localeCompare(b.month));

    const tbody = $('historyTableBody');
    if (tbody) {
        tbody.innerHTML = '';
        if (!hd.length) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#94a3b8;padding:20px;">Nessun dato storico.</td></tr>';
        } else {
            hd.forEach(d => {
                const tr = document.createElement('tr');
                tr.innerHTML = `<td><strong>${d.month.split('-').reverse().join('/')}</strong></td><td class="text-right">${fmtN(d.income)}</td><td class="text-right" style="color:var(--previsto);">${fmtN(d.planned)}</td><td class="text-right" style="color:var(--sostenuto);font-weight:bold;">${fmtN(d.actual)}</td><td class="text-right ${d.savings >= 0 ? 'diff-plus' : 'diff-minus'}">${fmtN(d.savings)}</td>`;
                tbody.appendChild(tr);
            });
        }
    }

    try {
        if (historyBarChart) historyBarChart.destroy();
        const filtered = hd.slice(-6);
        historyBarChart = new Chart($('historyBarChart').getContext('2d'), {
            type: 'bar',
            data: {
                labels: filtered.map(d => d.month.split('-').reverse().join('/')),
                datasets: [
                    { label: 'Entrate', data: filtered.map(d => d.income), backgroundColor: '#10b981', borderRadius: 4 },
                    { label: 'Budget Previsto', data: filtered.map(d => d.planned), backgroundColor: '#ff9800', borderRadius: 4 },
                    { label: 'Spesa Effettiva', data: filtered.map(d => d.actual), backgroundColor: '#e53935', borderRadius: 4 }
                ]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top' } }, scales: { x: { grid: { display: false } }, y: { grid: { color: 'rgba(0,0,0,0.05)' } } } }
        });
    } catch (err) {
        console.warn('[CHART] Storico non disponibile.', err);
    }
}

async function renderTradingChart() {
    const months = await db.months.toArray();
    const hd = months.map(m => ({ month: m.month, income: m.totalIncome, planned: m.totalPlanned, actual: m.totalActual }))
        .sort((a, b) => a.month.localeCompare(b.month));
    const filtered = hd.slice(-6);

    try {
        if (tradingChart) tradingChart.destroy();
        tradingChart = new Chart($('annualTradingChart').getContext('2d'), {
            type: 'line',
            data: {
                labels: filtered.map(d => d.month.split('-').reverse().join('/')),
                datasets: [
                    { label: 'Entrate', data: filtered.map(d => d.income), borderColor: '#10b981', backgroundColor: 'transparent', borderWidth: 3, tension: 0.2, pointRadius: 4 },
                    { label: 'Budget', data: filtered.map(d => d.planned), borderColor: '#ff9800', backgroundColor: 'transparent', borderWidth: 2, borderDash: [5, 5], tension: 0.2, pointRadius: 2 },
                    { label: 'Speso', data: filtered.map(d => d.actual), borderColor: '#e53935', backgroundColor: 'transparent', borderWidth: 3, tension: 0.1, pointRadius: 4 }
                ]
            },
            options: { responsive: true, maintainAspectRatio: false, scales: { x: { grid: { color: 'rgba(0,0,0,0.04)' } }, y: { grid: { color: 'rgba(0,0,0,0.04)' } } }, plugins: { legend: { position: 'top', labels: { font: { weight: 'bold' } } } } }
        });
    } catch (err) {
        console.warn('[CHART] Trading non disponibile.', err);
    }
}

async function renderFutureProjections(isSimulated = false) {
    const simAmount = isSimulated ? (Number($('simulatedExpense').value) || 0) : 0;
    const months = await db.months.toArray();
    const numMonths = months.length;
    const totalIncome = months.reduce((sum, m) => sum + Number(m.totalIncome || 0), 0);
    const totalActual = months.reduce((sum, m) => sum + Number(m.totalActual || 0), 0);
    const avgIncome = numMonths > 0 ? totalIncome / numMonths : 0;
    const avgActual = numMonths > 0 ? (totalActual / numMonths) + simAmount : simAmount;
    const avgSavings = avgIncome - avgActual;

    const warnBox = $('futureAccuracyWarning');
    const avgBox = $('futureAvgBox');
    const listContainer = $('futureProjectionsList');

    if (numMonths === 0) {
        if (warnBox) {
            warnBox.innerHTML = '⚠️ <strong>Nessun dato registrato.</strong> Inizia ad inserire entrate e spese per ottenere le proiezioni.';
            warnBox.style.display = 'block';
        }
        if (listContainer) listContainer.innerHTML = '<div style="text-align:center;color:#94a3b8;padding:20px;">Inserisci dati per attivare le proiezioni.</div>';
        return;
    }
    if (numMonths < 3) {
        if (warnBox) {
            warnBox.innerHTML = `⚠️ <strong>Precisione limitata:</strong> I calcoli si basano su ${numMonths} mese${numMonths > 1 ? 'i' : ''}. Con più dati storici le proiezioni a lungo termine saranno molto più accurate.`;
            warnBox.style.display = 'block';
        }
    } else if (warnBox) {
        warnBox.style.display = 'none';
    }

    if (avgBox) avgBox.innerHTML = `<strong>Base di calcolo:</strong> ${numMonths} mes${numMonths === 1 ? 'e' : 'i'} archiviati · Media entrate: <strong>${fmtE(avgIncome)}/mese</strong> · Media uscite: <strong>${fmtE(avgActual)}/mese</strong> · Risparmio medio: <strong style="color:${avgSavings >= 0 ? '#10b981' : '#e53935'}">${fmtE(avgSavings)}/mese</strong>`;
    if (listContainer) {
        listContainer.innerHTML = '';
        [
            { label: '3 Mesi', m: 3 },
            { label: '6 Mesi', m: 6 },
            { label: '1 Anno', m: 12 },
            { label: '2 Anni', m: 24 },
            { label: '5 Anni', m: 60 },
            { label: '10 Anni', m: 120 }
        ].forEach(period => {
            const estSavings = avgSavings * period.m;
            const row = document.createElement('div');
            row.style.cssText = `display:flex;justify-content:space-between;align-items:center;padding:14px;background:var(--panel);border-radius:12px;border:1px solid #e2e8f0;border-left:4px solid ${estSavings >= 0 ? '#10b981' : '#e53935'};`;
            row.innerHTML = `<span style="font-weight:bold;font-size:14px;color:var(--primary);">${period.label}</span><span class="text-right" style="font-size:16px;">${fmtE(estSavings)}</span>`;
            listContainer.appendChild(row);
        });
    }
}

function resetFutureSimulation() {
    const input = $('simulatedExpense');
    if (input) input.value = '';
    renderFutureProjections();
}

// =====================================================================
// 19. IA
// =====================================================================
function toggleIaProviderFields() {
    const provider = $('iaProviderSelect').value;
    localStorage.setItem('ia_provider', provider);
    const ollamaG = $('ollamaModelGroup');
    const geminiG = $('geminiKeyGroup');
    const badge = $('iaProviderBadge');
    const hint = $('iaStatusHint');

    if (provider === 'browser-gemini') {
        ollamaG.style.display = 'none';
        geminiG.style.display = 'none';
        badge.innerText = 'Gemini Nano';
        hint.innerText = '✨ IA locale integrata nel browser (se abilitata).';
    } else if (provider === 'gemini') {
        ollamaG.style.display = 'none';
        geminiG.style.display = 'flex';
        badge.innerText = 'Gemini Cloud';
        hint.innerText = '☁️ Connessione Cloud a Google Gemini.';
    } else {
        ollamaG.style.display = 'flex';
        geminiG.style.display = 'none';
        badge.innerText = 'Ollama';
        checkLocalLLM();
    }
}

function saveGeminiKey() {
    localStorage.setItem('gemini_api_key', $('geminiApiKeyInput').value.trim());
}

async function checkLocalLLM() {
    const select = $('ollamaModelSelect');
    const hint = $('iaStatusHint');
    select.innerHTML = '<option value="">Caricamento...</option>';
    try {
        const response = await fetch(OLLAMA_TAGS_URL);
        if (!response.ok) throw new Error('Ollama non raggiungibile');
        const data = await response.json();
        select.innerHTML = '';
        if (data.models?.length > 0) {
            data.models.forEach(model => {
                const option = document.createElement('option');
                option.value = model.name;
                option.innerText = model.name;
                select.appendChild(option);
            });
            hint.innerHTML = '🟢 <strong>Ollama connesso!</strong> Modelli rilevati.';
            hint.style.color = 'green';
        } else {
            select.innerHTML = '<option value="">Nessun modello installato</option>';
            hint.innerText = '⚠️ Nessun modello. Esegui: ollama run llama3';
            hint.style.color = 'var(--warning)';
        }
    } catch (err) {
        select.innerHTML = '<option value="">Connessione fallita</option>';
        hint.innerHTML = '⚠️ Ollama non raggiungibile. Avvia con: OLLAMA_ORIGINS="*" ollama serve';
        hint.style.color = 'var(--danger)';
    }
}

async function callAIEndpoint(promptText, responseBoxId, btnId) {
    const provider = $('iaProviderSelect').value;
    const box = $(responseBoxId);
    const btn = $(btnId);
    box.style.display = 'block';
    box.innerText = '🤖 Elaborazione in corso...';
    if (btn) btn.disabled = true;

    try {
        if (provider === 'browser-gemini') {
            let session = null;
            if (typeof ai !== 'undefined' && ai.languageModel) session = await ai.languageModel.create();
            else if (typeof window.ai !== 'undefined' && window.ai.createTextSession) session = await window.ai.createTextSession();
            box.innerText = session ? await session.prompt(promptText) : '❌ Gemini Nano non disponibile su questo browser.';
        } else if (provider === 'gemini') {
            const apiKey = localStorage.getItem('gemini_api_key');
            if (!apiKey) {
                box.innerText = '❌ Chiave API Gemini mancante.';
                if (btn) btn.disabled = false;
                return;
            }
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro-latest:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: promptText }] }] })
            });
            const json = await response.json();
            box.innerText = json.candidates?.[0]?.content?.parts?.[0]?.text || '❌ Risposta IA non valida.';
        } else {
            const model = $('ollamaModelSelect').value;
            if (!model) {
                box.innerText = '❌ Nessun modello Ollama selezionato.';
                if (btn) btn.disabled = false;
                return;
            }
            const response = await fetch(OLLAMA_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ model, prompt: promptText, stream: false })
            });
            const json = await response.json();
            box.innerText = json.response || '❌ Nessuna risposta ricevuta.';
        }
    } catch (err) {
        box.innerText = '❌ Errore: ' + err.message;
    } finally {
        if (btn) btn.disabled = false;
    }
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
    const currentMonth = $('currentMonth').value;
    if (!currentMonth) {
        $('iaResponse').innerText = '❌ Mese corrente non selezionato.';
        return;
    }
    const prevMonths = getPreviousMonthStrings(currentMonth, 2);
    const categories = [...new Set(currentData.expenses.map(e => e.category))].sort();
    const historicalExpenses = await db.expenses.where('month').anyOf(prevMonths).toArray();
    const historyMap = {};
    historicalExpenses.forEach(e => {
        const key = `${e.category}|${e.month}`;
        historyMap[key] = (historyMap[key] || 0) + Number(e.actual || 0);
    });

    let dataText = `Dati:\n- Mese corrente: ${currentMonth}\n- Spese per categoria:\n`;
    categories.forEach(cat => {
        const currentTotal = currentData.expenses.filter(e => e.category === cat).reduce((sum, e) => sum + Number(e.actual || 0), 0);
        dataText += `  - ${cat}: corrente ${fmtE(currentTotal)}; ${prevMonths[0]} ${fmtE(historyMap[`${cat}|${prevMonths[0]}`] || 0)}; ${prevMonths[1]} ${fmtE(historyMap[`${cat}|${prevMonths[1]}`] || 0)}\n`;
    });

    const prompt = `Agisci come un consulente finanziario cinico e conciso. Lingua: Italiano. Analizza i seguenti dati di spesa del mese corrente e il confronto con i due mesi passati: ${dataText}Identifica le 2 categorie meno importanti dove l\'utente sta spendendo di più rispetto al solito o in assoluto. Scrivi un resoconto di massimo 3 frasi indicando quanto si potrebbe risparmiare e un consiglio pratico.`;
    await callAIEndpoint(prompt, 'iaResponse', 'btnAnalyseIA');
    $('iaNotes').value = $('iaResponse').innerText;
    await saveNotes();
}

async function runHistoryAnalysisIA() {
    const months = await db.months.orderBy('month').toArray();
    if (!months.length) {
        $('iaHistoryResponse').innerText = '❌ Nessun mese archiviato.';
        return;
    }
    let dataText = 'Dati:\n';
    months.forEach(m => {
        const savings = m.totalIncome - m.totalActual;
        dataText += `- ${m.month}: Entrate ${fmtE(m.totalIncome)}, Uscite ${fmtE(m.totalActual)}, Risparmio ${fmtE(savings)}\n`;
    });
    const prompt = `Agisci come un analista finanziario. Lingua: Italiano. Analizza questo storico plurimensile dei saldi: ${dataText}Fornisci un quadro generale sull\'andamento del patrimonio. Evidenzia se c\'è un mese record e scrivi una conclusione concisa.`;
    await callAIEndpoint(prompt, 'iaHistoryResponse', 'btnHistoryIA');
}

async function runFuturePredictionIA() {
    const months = await db.months.toArray();
    const numM = months.length;
    const totalIncome = months.reduce((sum, m) => sum + Number(m.totalIncome || 0), 0);
    const totalActual = months.reduce((sum, m) => sum + Number(m.totalActual || 0), 0);
    const avgSavings = numM > 0 ? (totalIncome - totalActual) / numM : 0;
    const projected1 = avgSavings * 12;
    const projected5 = avgSavings * 60;
    const projected10 = avgSavings * 120;
    const categoryTotals = {};
    currentData.expenses.forEach(e => { categoryTotals[e.category] = (categoryTotals[e.category] || 0) + Number(e.actual || 0); });
    const categoryLines = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([cat, val]) => `- ${cat}: ${fmtE(val)}/mese`).join('\n');
    const dataText = `Dati Proiezioni 10 anni:\n- Risparmio medio mensile: ${fmtE(avgSavings)}\n- Patrimonio stimato a 1 anno: ${fmtE(projected1)}\n- Patrimonio stimato a 5 anni: ${fmtE(projected5)}\n- Patrimonio stimato a 10 anni: ${fmtE(projected10)}\nCategorie di spesa attuali:\n${categoryLines}`;
    const prompt = `Agisci come un pianificatore finanziario lungimirante. Lingua: Italiano. Esamina questa proiezione matematica basata sui dati attuali: ${dataText}. Fai una considerazione critica sul risultato a lungo termine e indica quali categorie di spesa attuali potrebbero minacciarlo. Massimo 4 frasi.`;
    await callAIEndpoint(prompt, 'iaFutureResponse', 'btnFutureIA');
}

// =====================================================================
// 20. EXPORT / BACKUP / RESET
// =====================================================================
async function exportPDF() {
    if (typeof html2pdf === 'undefined') {
        alert('Libreria PDF non caricata. Riprova.');
        return;
    }
    const month = $('currentMonth').value;
    const fileName = prompt('Nome del file PDF:', `Report_${month}`);
    if (!fileName) return;

    const totalIncome = currentData.income.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const totalActual = currentData.expenses.reduce((sum, item) => sum + Number(item.actual || 0), 0);
    const net = totalIncome - totalActual;
    const sorted = [...currentData.expenses].sort((a, b) => a.category.localeCompare(b.category));
    const iaNotes = $('iaNotes').value;

    const htmlString = `
    <div style="padding:40px;background:white;color:#1e293b;font-family:Arial,sans-serif;font-size:13px;line-height:1.5;width:794px;">
        <div style="text-align:center;border-bottom:3px solid #3b82f6;padding-bottom:18px;margin-bottom:24px;">
            <h1 style="font-size:26px;margin:0;color:#1e293b;font-weight:800;">Resoconto Finanziario</h1>
            <h2 style="font-size:16px;color:#64748b;font-weight:400;margin-top:6px;">Periodo: ${month}</h2>
        </div>
        <div style="display:table;width:100%;margin-bottom:28px;background:#f8fafc;padding:16px;border-radius:10px;box-sizing:border-box;">
            <div style="display:table-cell;text-align:center;width:33%;"><div style="font-size:11px;font-weight:bold;color:#64748b;text-transform:uppercase;margin-bottom:6px;">Entrate Totali</div><div style="font-size:22px;font-weight:800;color:#10b981;">${fmtE(totalIncome)}</div></div>
            <div style="display:table-cell;text-align:center;width:33%;"><div style="font-size:11px;font-weight:bold;color:#64748b;text-transform:uppercase;margin-bottom:6px;">Spese Sostenute</div><div style="font-size:22px;font-weight:800;color:#e53935;">${fmtE(totalActual)}</div></div>
            <div style="display:table-cell;text-align:center;width:33%;"><div style="font-size:11px;font-weight:bold;color:#64748b;text-transform:uppercase;margin-bottom:6px;">Risparmio Netto</div><div style="font-size:22px;font-weight:800;color:${net >= 0 ? '#10b981' : '#e53935'};">${fmtE(net)}</div></div>
        </div>
        <h3 style="font-size:15px;border-bottom:1px solid #e2e8f0;padding-bottom:6px;margin-bottom:12px;color:#1e293b;">Dettaglio per Categoria</h3>
        <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:24px;">
            <thead><tr style="background:#f1f5f9;">
                <th style="padding:9px 12px;text-align:left;border-bottom:1px solid #cbd5e1;color:#334155;">Categoria</th>
                <th style="padding:9px 12px;text-align:left;border-bottom:1px solid #cbd5e1;color:#334155;">Note</th>
                <th style="padding:9px 12px;text-align:right;border-bottom:1px solid #cbd5e1;color:#334155;">Pianificato</th>
                <th style="padding:9px 12px;text-align:right;border-bottom:1px solid #cbd5e2e8f1;color:#334155;">Sostenuto</th>
            </tr></thead>
            <tbody>${sorted.map(exp => `<tr><td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;">${escapeHtml(exp.category)}</td><td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;color:#64748b;">${escapeHtml(exp.desc)}</td><td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;text-align:right;">${fmtE(exp.planned)}</td><td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;text-align:right;font-weight:bold;">${exp.actual > 0 ? fmtE(exp.actual) : 'Da pagare'}</td></tr>`).join('')}</tbody>
        </table>
        ${iaNotes.trim() ? `<div style="margin-bottom:24px;"><h3 style="font-size:14px;border-bottom:1px solid #e2e8f0;padding-bottom:6px;margin-bottom:10px;color:#8b5cf6;">Analisi I.A. del Mese</h3><div style="background:#fdfaff;border:1px solid #e9d5ff;padding:14px;border-radius:8px;font-size:12px;line-height:1.6;color:#581c87;white-space:pre-line;">${escapeHtml(iaNotes)}</div></div>` : ''}
    </div>`;

    const element = document.createElement('div');
    element.innerHTML = htmlString;
    html2pdf().set({
        margin: [10, 10, 10, 10],
        filename: `${fileName}.pdf`,
        image: { type: 'jpeg', quality: 0.95 },
        html2canvas: { scale: 2, useCORS: true, logging: false, windowWidth: 794 },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    }).from(element).save();
}

async function exportCSV() {
    const month = $('currentMonth').value;
    const fileName = prompt('Nome file CSV:', `bilancio_${month}`);
    if (!fileName) return;

    let csv = `Report: ${month}\n\nENTRATE\nCausale;Importo\n`;
    currentData.income.forEach(item => { csv += `"${item.desc}";"${Number(item.amount || 0).toFixed(2)}"\n`; });
    csv += '\nSPESE\nData;Categoria;Nota;Pianificato;Sostenuto\n';
    currentData.expenses.forEach(item => {
        csv += `"${item.date}";"${item.category}";"${item.desc}";"${Number(item.planned || 0).toFixed(2)}";"${Number(item.actual || 0).toFixed(2)}"\n`;
    });

    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${fileName}.csv`;
    link.click();
}

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
    const fileName = prompt('Nome file backup:', 'backup_bilancio.json');
    if (!fileName) return;
    const finalName = fileName.endsWith('.json') ? fileName : `${fileName}.json`;
    const blob = new Blob([await getCompiledBackupData()], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = finalName;
    link.click();
}

async function shareBackupJSON() {
    const json = await getCompiledBackupData();
    if (navigator.share) {
        try {
            const blob = new Blob([json], { type: 'application/json' });
            const file = new File([blob], 'backup_bilancio.json', { type: 'application/json' });
            if (navigator.canShare?.({ files: [file] })) {
                await navigator.share({ files: [file], title: 'Backup Bilancio' });
                return;
            }
        } catch (err) {
            console.warn(err);
        }
    }
    try {
        await navigator.clipboard.writeText(json);
        showToast('📋 Backup copiato negli appunti!', false);
    } catch {
        const blob = new Blob([json], { type: 'application/json' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'backup_bilancio.json';
        link.click();
    }
}

function importBackupJSON(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async loadEvent => {
        try {
            const data = JSON.parse(loadEvent.target.result);
            if (!data.categories || !data.months) {
                alert('File non valido o formato non riconosciuto.');
                return;
            }
            await db.categories.clear();
            await db.annualDeadlines.clear();
            await db.income.clear();
            await db.expenses.clear();
            await db.months.clear();
            await db.savingsGoals.clear();
            await db.syncState.clear();
            await db.settings.clear();
            await db.categories.bulkPut(data.categories);
            if (data.annual_deadlines) await db.annualDeadlines.bulkPut(data.annual_deadlines);
            if (data.income) await db.income.bulkPut(data.income);
            if (data.expenses) await db.expenses.bulkPut(data.expenses);
            if (data.months) await db.months.bulkPut(data.months);
            if (data.savingsGoals) await db.savingsGoals.bulkPut(data.savingsGoals);
            if (data.syncState) await db.syncState.bulkPut(data.syncState);
            if (data.settings) await db.settings.bulkPut(data.settings);
            alert('✅ Ripristino completato!');
            await initCategories();
            await loadAnnualDeadlines();
            await loadMonthData();
            await checkDatabaseHealth();
        } catch (err) {
            console.error(err);
            alert('❌ Errore nel leggere il file di backup.');
        }
    };
    reader.readAsText(file);
}

async function resetCurrentMonth() {
    if (!confirm('Sei sicuro di voler azzerare tutte le spese e le entrate di QUESTO mese?')) return;
    const month = $('currentMonth').value;
    const expKeys = await db.expenses.where('month').equals(month).primaryKeys();
    const incKeys = await db.income.where('month').equals(month).primaryKeys();
    await db.expenses.bulkDelete(expKeys);
    await db.income.bulkDelete(incKeys);
    await db.months.update(month, { totalIncome: 0, totalPlanned: 0, totalActual: 0 });
    currentData = { income: [], expenses: [] };
    await loadMonthData();
    alert('Mese resettato.');
    await safeCloudCall('reset mese', syncLocalToSupabaseFirstTime);
}

async function resetTotalDB() {
    if (!confirm('⚠️ ATTENZIONE: Vuoi azzerare l\'INTERO database? Perderai tutto lo storico.')) return;
    if (!confirm('Sei ASSOLUTAMENTE sicuro? Non si può tornare indietro senza un backup.')) return;
    await db.categories.clear();
    await db.annualDeadlines.clear();
    await db.income.clear();
    await db.expenses.clear();
    await db.months.clear();
    await db.savingsGoals.clear();
    await db.syncState.clear();
    await db.settings.clear();
    alert('Database azzerato.');
    location.reload();
}

// =====================================================================
// 21. NOTIFICHE
// =====================================================================
function togglePushNotifications() {
    const toggle = $('pushNotifToggle');
    if (toggle.checked) {
        if (!('Notification' in window)) {
            alert('Il tuo browser non supporta le notifiche push.');
            toggle.checked = false;
            return;
        }
        Notification.requestPermission().then(permission => {
            if (permission === 'granted') {
                localStorage.setItem('push_notifications_enabled', 'true');
                checkPushNotifications();
                alert('🔔 Notifiche attivate con successo!');
            } else {
                toggle.checked = false;
                localStorage.setItem('push_notifications_enabled', 'false');
                alert('Permesso negato per le notifiche.');
            }
        });
    } else {
        localStorage.setItem('push_notifications_enabled', 'false');
    }
}

function checkPushNotifications() {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const today = new Date();
    const alertDays = 1;
    annualDeadlines.forEach(item => {
        if (item.isPaid) return;
        const targetDate = new Date(`${item.month}-${item.day ? String(item.day).padStart(2, '0') : '01'}`);
        const diffTime = targetDate.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        const notifKey = `notif_sent_${item.id}_${item.month}`;
        if (diffDays >= 0 && diffDays <= alertDays && !localStorage.getItem(notifKey)) {
            new Notification('🔔 Scadenza in Arrivo', {
                body: `${item.desc} scade tra ${diffDays} giorn${diffDays === 1 ? 'o' : 'i'}. Importo: ${fmtEPlain(item.amount)}`,
                icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 192 192'><rect width='192' height='192' rx='24' fill='%231e293b'/><text y='120' x='96' font-size='100' text-anchor='middle'>📊</text></svg>"
            });
            localStorage.setItem(notifKey, 'true');
        }
    });
}

// =====================================================================
// 22. EVENT LISTENER UI - SOLO ALLA FINE
// =====================================================================
document.addEventListener('DOMContentLoaded', async () => {
    setupInitialUI();
    setupServiceWorkerUpdates();
    setupNavigationListeners();
    setupAuthModalListeners();
    setupFormListeners();

    try {
        await initApp();
    } catch (err) {
        console.error('[INIT] Errore avvio app, ma la navigazione resta attiva.', err);
    }

    setupSupabaseAuth().catch(err => {
        console.warn('[SUPABASE] Avvio cloud fallito. App locale attiva.', err);
    });
});

function setupNavigationListeners() {
    document.querySelectorAll('.tab-button[data-tab]').forEach(button => {
        button.addEventListener('click', () => switchTab(button.dataset.tab, button));
    });
    const addBtn = $('nav-btn-add');
    if (addBtn) addBtn.addEventListener('click', scrollToAddExpense);
}

function setupAuthModalListeners() {
    ['btn-open-auth', 'btn-settings-auth', 'btnAuthAction'].forEach(id => {
        const btn = $(id);
        if (btn) btn.addEventListener('click', openAuthModal);
    });

    const closeBtn = $('btn-close-auth');
    if (closeBtn) closeBtn.addEventListener('click', closeAuthModal);

    const modal = $('modal-auth') || $('authModal');
    if (modal) {
        modal.addEventListener('click', event => {
            if (event.target === modal) closeAuthModal(event);
        });
    }

    const googleBtn = $('btn-google-auth');
    if (googleBtn) googleBtn.addEventListener('click', signInWithGoogle);

    const signInBtn = $('btn-signin-email');
    if (signInBtn) signInBtn.addEventListener('click', signInWithEmail);

    const signUpBtn = $('btn-signup-email');
    if (signUpBtn) signUpBtn.addEventListener('click', signUpWithEmail);

    document.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
            closeAuthModal(event);
            closeRendicontoPopup(event);
        }
    });
}

function setupFormListeners() {
    const startDay = $('startCycleDay');
    if (startDay) startDay.addEventListener('change', changeStartCycleDay);

    const month = $('currentMonth');
    if (month) month.addEventListener('change', loadMonthData);

    const search = $('searchInput');
    if (search) search.addEventListener('input', handleSearch);

    const clearBtn = $('btnClearAllFilters');
    if (clearBtn) clearBtn.addEventListener('click', () => clearAllFilters());

    const provider = $('iaProviderSelect');
    if (provider) provider.addEventListener('change', toggleIaProviderFields);

    const geminiKey = $('geminiApiKeyInput');
    if (geminiKey) geminiKey.addEventListener('change', saveGeminiKey);

    const pushToggle = $('pushNotifToggle');
    if (pushToggle) pushToggle.addEventListener('change', togglePushNotifications);
}