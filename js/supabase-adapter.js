// Supabase Dexie Adapter
const supabaseUrl = 'https://bkviudppelulwufzhrat.supabase.co';
const supabaseKey = 'sb_publishable_bPVweV54mHiYuQSTZd7e-A_2DGbZr-j';
const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);
window.supabaseClient = supabaseClient;

// Global user state for the adapter
window.supabaseUser = null;

// =====================================================================
// OUTBOX: dati non sincronizzabili (rete/colonne mancanti) vengono
// accodati in localStorage e ritentati al login / su evento 'online'.
// Nulla viene mai perso in silenzio.
// =====================================================================
function outboxKey(tableName) { return 'eb_outbox_' + tableName; }
function readOutbox(tableName) {
    try { return JSON.parse(localStorage.getItem(outboxKey(tableName)) || '[]') || []; }
    catch (e) { return []; }
}
function writeOutbox(tableName, items) {
    try { localStorage.setItem(outboxKey(tableName), JSON.stringify(items)); } catch (e) {}
}
function clearOutbox(tableName) {
    try { localStorage.removeItem(outboxKey(tableName)); } catch (e) {}
    console.log('[OUTBOX] ' + tableName + ': cleared');
}
function clearAllOutboxes() {
    for (const t of Object.keys(DB_ACCESSOR)) {
        clearOutbox(t);
    }
    console.log('[OUTBOX] Tutte le code outbox pulite');
}
window.readOutbox = readOutbox;
window.writeOutbox = writeOutbox;
window.flushOutbox = flushOutbox;
window.clearOutbox = clearOutbox;
window.clearAllOutboxes = clearAllOutboxes;

function enqueueOutbox(tableName, item) {
    const queue = readOutbox(tableName);
    const pk = item && item.__id ? String(item.__id) : String(item && item.id ? item.id : Date.now());
    // Deduplication: replace existing item with same primary key, otherwise append
    const existingIdx = queue.findIndex(i => i && String(i.__id || i.id || Date.now()) === pk);
    if (existingIdx >= 0) {
        queue[existingIdx] = item;
    } else {
        queue.push(item);
    }
    writeOutbox(tableName, queue);
    console.log('[OUTBOX] ' + tableName + ': ' + (existingIdx >= 0 ? 'aggiornato' : 'aggiunto') + ' voce (coda ' + queue.length + ')');
    if (typeof showToast === 'function') showToast('⚠️ Salvataggio offline: dati in coda', true);
}
const DB_ACCESSOR = {
    sync_state: 'syncState', settings: 'settings', categories: 'categories',
    months: 'months', income: 'income', expenses: 'expenses',
    annual_deadlines: 'annualDeadlines', savings_goals: 'savingsGoals',
    investments: 'investments', investment_movements: 'investmentMovements',
    people: 'people', groups: 'groups', group_invites: 'groupInvites',
    group_members: 'groupMembers', shared_expense_splits: 'sharedExpenseSplits',
    shared_expenses: 'sharedExpenses', shared_expense_participants: 'sharedExpenseParticipants',
    shared_debts: 'sharedDebts'
};
async function flushOutbox() {
    if (!window.supabaseUser) return;
    let isFlushing = false;
    for (const tableName of Object.keys(DB_ACCESSOR)) {
        if (isFlushing) break;
        const queue = readOutbox(tableName);
        if (!queue.length) continue;
        const table = window.db[DB_ACCESSOR[tableName]];
        const failed = [];
        for (const item of queue) {
            if (isFlushing) break;
            let retryCount = (item && item.__retries) ? Number(item.__retries) : 0;
            const error = (item && item.__update)
                ? await table._update(item.__id, item.__changes)
                : await table._upsert(item);
            if (error) {
                retryCount++;
                // Se fallisce ripetutamente (>= 3 tentativi), quarantena invece di re-infinito retry
                if (retryCount >= 3) {
                    // Sposta in quarantena locale per rimuoverlo dalla coda attiva
                    const qKey = 'eb_outbox_quarantine_' + tableName;
                    let qQueue = [];
                    try { qQueue = JSON.parse(localStorage.getItem(qKey) || '[]') || []; } catch (e) { qQueue = []; }
                    // Aggiungi metadati di fallimento se non presenti
                    const failedItem = { ...item, __retries: retryCount, __failed: true };
                    qQueue.push(failedItem);
                    writeOutbox(tableName, queue.filter(i => i !== item));
                    writeOutbox(qKey, qQueue);
                    console.warn('[OUTBOX] ' + tableName + ': elemento quarantena dopo ' + retryCount + ' fallimenti', failedItem);
                } else {
                    // Altrimenti incrementa il contatore e rimette in coda
                    const updatedItem = { ...item, __retries: retryCount };
                    failed.push(updatedItem);
                }
            } else {
                // Successo: resetta il contatore retry se era stato marcato
                if (item && item.__retries) {
                    const qKey = 'eb_outbox_quarantine_' + tableName;
                    let qQueue = [];
                    try { qQueue = JSON.parse(localStorage.getItem(qKey) || '[]') || []; } catch (e) { qQueue = []; }
                    writeOutbox(qKey, qQueue.filter(i => i !== item));
                }
                failed.push(item);
            }
        }
        writeOutbox(tableName, failed);
        console.log('[OUTBOX] ' + tableName + ': flush (' + (queue.length - failed.length) + ' ok, ' + failed.length + ' ancora in coda/quarantena)');
    }
}
window.addEventListener('online', flushOutbox);

class SupabaseTable {
    constructor(tableName, primaryKey = 'id', noUserId = false) {
        this.tableName = tableName;
        this.primaryKey = primaryKey;
        this.noUserId = noUserId;
    }

    _pk() {
        if (this.tableName === 'months') return 'month_id';
        if (this.tableName === 'categories') return 'name';
        return this.primaryKey;
    }

    _mergeOutbox(rows, filter) {
        const queue = readOutbox(this.tableName);
        if (!queue.length) return rows;
        const pk = this._pk();
        const byId = new Map(rows.map(r => [String(r[pk]), r]));
        for (const item of queue) {
            if (filter && !filter(item)) continue;
            if (item && item.__update) {
                const existing = byId.get(String(item.__id));
                if (existing) Object.assign(existing, item.__changes);
            } else if (item && item[pk] != null) {
                byId.set(String(item[pk]), item);
            }
        }
        return Array.from(byId.values());
    }

    _uidEq(query) {
        if (this.noUserId) return query;
        return query.eq('user_id', window.supabaseUser.id);
    }
    
    _mapIn(item) {
        if (!item) return item;
        let mapped = { ...item };
        if (this.tableName === 'months' && mapped.month) {
            mapped.month_id = mapped.month;
            delete mapped.month;
        }
        const allowed = this._allowedColumns();
        if (allowed) {
            mapped = Object.fromEntries(Object.entries(mapped).filter(([k]) => allowed.includes(k)));
        }
        return mapped;
    }

    _allowedColumns() {
        const map = {
            months: ['month_id', 'totalIncome', 'totalPlanned', 'totalActual', 'notes', 'iaNotes'],
            income: ['id', 'month', 'desc', 'amount', 'date'],
            expenses: ['id', 'month', 'date', 'category', 'desc', 'planned', 'actual', 'sharedPercentage', 'isShared', 'sharedPayer', 'settled', 'debtId'],
            categories: ['name', 'macro', 'icon'],
            annual_deadlines: ['id', 'month', 'day', 'desc', 'amount', 'isPaid', 'recurring', 'endMonth', 'category'],
            savings_goals: ['name', 'targetAmount', 'importo_accumulato', 'createdAt'],
            sync_state: ['id', 'counter', 'deviceId', 'lastUpdated'],
            settings: ['key', 'value'],
            investments: ['id', 'type', 'name', 'targetAmount', 'initialCapital', 'createdAt'],
            investment_movements: ['id', 'investmentId', 'date', 'type', 'amount', 'desc'],
            people: ['id', 'name', 'user_id', 'email', 'createdAt'],
            groups: ['id', 'name', 'description', 'invite_token', 'created_by', 'createdAt'],
            group_members: ['id', 'groupId', 'personId', 'user_id', 'member_name'],
            group_invites: ['id', 'group_id', 'token', 'email', 'used_by', 'used_at', 'created_at'],
            shared_expense_splits: ['id', 'expenseId', 'personId', 'groupId', 'amount', 'splitType', 'paidBy', 'isPaid', 'settled', 'createdAt'],
            shared_expenses: ['id', 'expense_id', 'group_id', 'total_amount', 'split_method', 'created_by', 'created_at'],
            shared_expense_participants: ['id', 'shared_expense_id', 'person_id', 'participant_name', 'share_amount', 'paid_amount', 'split_value', 'settled', 'created_at'],
            shared_debts: ['id', 'creditor_user_id', 'debtor_user_id', 'creditor_name', 'debtor_name', 'amount', 'description', 'category', 'expense_id', 'status', 'created_at'],
            receipt_jobs: ['id', 'user_id', 'expense_id', 'status', 'importo', 'negozio', 'data_scontrino', 'categoria_suggerita', 'error', 'created_at', 'updated_at']
        };
        return map[this.tableName] || null;
    }

    _mapOut(item) {
        if (!item) return item;
        let mapped = { ...item };
        if (this.tableName === 'months' && mapped.month_id) {
            mapped.month = mapped.month_id;
            delete mapped.month_id;
        }
        return mapped;
    }

    async toArray() {
        if (!window.supabaseUser) return this._mergeOutbox([]);
        const { data, error } = await this._uidEq(supabaseClient.from(this.tableName).select('*'));
        if (error) console.error(error);
        return this._mergeOutbox((data || []).map(this._mapOut.bind(this)));
    }

    async get(id) {
        const outboxHit = readOutbox(this.tableName).find(i => i && !i.__update && String(i[this._pk()]) === String(id));
        if (outboxHit) return this._mapOut(outboxHit);
        if (!window.supabaseUser) return null;
        let query = this._uidEq(supabaseClient.from(this.tableName).select('*'));
        
        if (this.tableName === 'months') {
            query = query.eq('month_id', id);
        } else if (this.tableName === 'categories') {
            query = query.eq('name', id);
        } else {
            query = query.eq(this.primaryKey, id);
        }

        const { data, error } = await query.maybeSingle();
        return this._mapOut(data || null);
    }

    async _upsert(item) {
        if (!window.supabaseUser) return { message: 'utente non autenticato' };
        let payload = { ...this._mapIn(item) };
        payload = Object.fromEntries(Object.entries(payload).filter(([, v]) => v != null));
        if (!this.noUserId) payload.user_id = window.supabaseUser.id;
        const { error } = await supabaseClient.from(this.tableName).upsert(payload);
        return error;
    }

    async put(item) {
        const error = await this._upsert(item);
        if (error) {
            console.warn('[DB] put fallito su ' + this.tableName + ':', error.message);
            enqueueOutbox(this.tableName, item);
        }
    }

    async _update(id, changes) {
        if (!window.supabaseUser) return { message: 'utente non autenticato' };
        let payload = this._mapIn(changes);
        payload = Object.fromEntries(Object.entries(payload).filter(([, v]) => v != null));
        let query = this._uidEq(supabaseClient.from(this.tableName).update(payload));
        
        if (this.tableName === 'months') {
            query = query.eq('month_id', id);
        } else if (this.tableName === 'categories') {
            query = query.eq('name', id);
        } else {
            query = query.eq(this.primaryKey, id);
        }
        const { error } = await query;
        return error;
    }

    async update(id, changes) {
        const error = await this._update(id, changes);
        if (error) {
            console.warn('[DB] update fallito su ' + this.tableName + ':', error.message);
            enqueueOutbox(this.tableName, { __update: true, __id: id, __changes: changes });
        }
    }

    async delete(id) {
        if (!window.supabaseUser) return;
        let query = this._uidEq(supabaseClient.from(this.tableName).delete());
        
        if (this.tableName === 'months') {
            query = query.eq('month_id', id);
        } else if (this.tableName === 'categories') {
            query = query.eq('name', id);
        } else {
            query = query.eq(this.primaryKey, id);
        }
        const { error } = await query;
        if (error) console.error(error);
    }

    async clear() {
        if (!window.supabaseUser) return;
        const { error } = await this._uidEq(supabaseClient.from(this.tableName).delete());
        if (error) console.error(error);
    }

    async count() {
        if (!window.supabaseUser) return 0;
        const { count, error } = await this._uidEq(supabaseClient.from(this.tableName).select('*', { count: 'exact', head: true }));
        return count || 0;
    }

    async bulkPut(items) {
        for (const item of items) {
            const error = await this._upsert(item);
            if (error) {
                console.warn('[DB] bulkPut fallito su ' + this.tableName + ':', error.message);
                enqueueOutbox(this.tableName, item);
            }
        }
    }

    async bulkDelete(ids) {
        if (!window.supabaseUser || !ids.length) return;
        const { error } = await this._uidEq(supabaseClient.from(this.tableName).delete().in(this.primaryKey, ids));
        if (error) console.error(error);
    }

    where(field) {
        const self = this;
        return {
            equals: (val) => ({
                toArray: async () => {
                    if (!window.supabaseUser) return self._mergeOutbox([], item => item != null && String(item[field]) === String(val));
                    let f = field;
                    if (self.tableName === 'months' && field === 'month') f = 'month_id';
                    
                    const { data, error } = await self._uidEq(supabaseClient.from(self.tableName).select('*').eq(f, val));
                    if (error) console.error(error);
                    return self._mergeOutbox((data || []).map(self._mapOut.bind(self)), item => item != null && String(item[field]) === String(val));
                },
                primaryKeys: async () => {
                    if (!window.supabaseUser) return [];
                    let f = field;
                    if (self.tableName === 'months' && field === 'month') f = 'month_id';
                    
                    const { data, error } = await self._uidEq(supabaseClient.from(self.tableName).select(self.primaryKey).eq(f, val));
                    if (error) console.error(error);
                    return data ? data.map(d => d[self.primaryKey]) : [];
                }
            }),
            anyOf: (arr) => ({
                toArray: async () => {
                    if (!window.supabaseUser || !arr.length) return self._mergeOutbox([], item => item != null && arr.some(a => String(item[field]) === String(a)));
                    let f = field;
                    if (self.tableName === 'months' && field === 'month') f = 'month_id';
                    
                    const { data, error } = await self._uidEq(supabaseClient.from(self.tableName).select('*').in(f, arr));
                    if (error) console.error(error);
                    return self._mergeOutbox((data || []).map(self._mapOut.bind(self)), item => item != null && arr.some(a => String(item[field]) === String(a)));
                }
            })
        };
    }

    orderBy(field) {
        const self = this;
        return {
            toArray: async () => {
                if (!window.supabaseUser) return self._mergeOutbox([]);
                let f = field;
                if (self.tableName === 'months' && field === 'month') f = 'month_id';
                
                const { data, error } = await self._uidEq(supabaseClient.from(self.tableName).select('*').order(f));
                if (error) console.error(error);
                return self._mergeOutbox((data || []).map(self._mapOut.bind(self)));
            }
        };
    }
}

// Settings: record {key, value}; i record legacy con name/id vengono normalizzati su key
class SettingTable extends SupabaseTable {
    _mapIn(item) {
        if (!item) return item;
        const norm = { key: item.key || item.name || item.id, value: item.value != null ? item.value : '' };
        return super._mapIn(norm);
    }
}

window.db = {
    version: () => ({ stores: () => ({ upgrade: () => {} }) }),
    open: async () => {},
    categories: new SupabaseTable('categories', 'id'),
    annualDeadlines: new SupabaseTable('annual_deadlines', 'id'),
    months: new SupabaseTable('months', 'month_id'),
    income: new SupabaseTable('income', 'id'),
    expenses: new SupabaseTable('expenses', 'id'),
    savingsGoals: new SupabaseTable('savings_goals', 'name'),
    settings: new SettingTable('settings', 'key'),
    syncState: new SupabaseTable('sync_state', 'id'),
    investments: new SupabaseTable('investments', 'id'),
    investmentMovements: new SupabaseTable('investment_movements', 'id'),
    people: new SupabaseTable('people', 'id'),
    groups: new SupabaseTable('groups', 'id'),
    groupInvites: new SupabaseTable('group_invites', 'id'),
    groupMembers: new SupabaseTable('group_members', 'id'),
    sharedExpenseSplits: new SupabaseTable('shared_expense_splits', 'id'),
    sharedExpenses: new SupabaseTable('shared_expenses', 'id', true),
    sharedExpenseParticipants: new SupabaseTable('shared_expense_participants', 'id', true),
    sharedDebts: new SupabaseTable('shared_debts', 'id', true),
    receiptJobs: new SupabaseTable('receipt_jobs', 'id')
};

// Autenticazione Auth Modal Logic
window.addEventListener('DOMContentLoaded', () => {
    supabaseClient.auth.onAuthStateChange((event, session) => {
        if (session) {
            window.supabaseUser = session.user;
            document.getElementById('authModal').style.display = 'none';
            document.getElementById('mainAppWrapper').style.display = 'block';
            flushOutbox();
            if (window.initApp) {
                if (!window.appInitialized) {
                    window.appInitialized = true;
                    initApp(); 
                }
            }
        } else {
            window.supabaseUser = null;
            document.getElementById('authModal').style.display = 'flex';
            document.getElementById('mainAppWrapper').style.display = 'none';
        }
    });
});

window.handleLogin = async () => {
    const email = document.getElementById('authEmail').value;
    const password = document.getElementById('authPassword').value;
    const msg = document.getElementById('authMessage');
    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) msg.innerText = error.message;
};

window.handleSignup = async () => {
    const email = document.getElementById('authEmail').value;
    const password = document.getElementById('authPassword').value;
    const msg = document.getElementById('authMessage');
    const { error } = await supabaseClient.auth.signUp({ email, password });
    if (error) msg.innerText = error.message;
    else msg.innerText = "Controlla la tua email per confermare la registrazione!";
};
