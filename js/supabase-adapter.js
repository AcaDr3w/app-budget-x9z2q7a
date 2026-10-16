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
    try { localStorage.removeItem('eb_outbox_quarantine_' + tableName); } catch (e) {}
    console.log('[OUTBOX] ' + tableName + ': cleared');
}
function dropFromOutbox(tableName, id) {
    const sid = String(id);
    const keep = (i) => {
        if (!i) return false;
        if (i.__id != null && String(i.__id) === sid) return false;
        if (i.id != null && String(i.id) === sid) return false;
        return true;
    };
    try {
        writeOutbox(tableName, readOutbox(tableName).filter(keep));
        const qKey = 'eb_outbox_quarantine_' + tableName;
        const q = JSON.parse(localStorage.getItem(qKey) || '[]') || [];
        localStorage.setItem(qKey, JSON.stringify(q.filter(keep)));
    } catch (e) { /* ignore */ }
}
function tombKey(tableName) { return 'eb_tomb_' + tableName; }
function readTomb(tableName) {
    try { return new Set(JSON.parse(localStorage.getItem(tombKey(tableName)) || '[]') || []); }
    catch (e) { return new Set(); }
}
function addTomb(tableName, id) {
    if (id == null) return;
    const s = readTomb(tableName);
    s.add(String(id));
    try { localStorage.setItem(tombKey(tableName), JSON.stringify([...s])); } catch (e) {}
}
function isTombstoned(tableName, id) {
    return id != null && readTomb(tableName).has(String(id));
}
function clearAllOutboxes() {
    for (const t of Object.keys(DB_ACCESSOR)) {
        clearOutbox(t);
    }
    console.log('[OUTBOX] Tutte le code outbox pulite');
}
function abortOutboxFlush() { outboxFlushGen++; }
window.readOutbox = readOutbox;
window.writeOutbox = writeOutbox;
window.flushOutbox = flushOutbox;
window.clearOutbox = clearOutbox;
window.clearAllOutboxes = clearAllOutboxes;
window.tombstone = addTomb;
window.isTombstoned = isTombstoned;
window.abortOutboxFlush = abortOutboxFlush;

function enqueueOutbox(tableName, item) {
    const pk = item && item.__id ? String(item.__id) : String(item && item.id ? item.id : Date.now());
    if (isTombstoned(tableName, pk)) return;
    const queue = readOutbox(tableName);
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
    shared_debts: 'sharedDebts', receipt_jobs: 'receiptJobs'
};
let outboxFlushGen = 0;
let outboxFlushBusy = false;
async function flushOutbox() {
    if (!window.supabaseUser || outboxFlushBusy) return;
    const gen = outboxFlushGen;
    outboxFlushBusy = true;
    try {
        for (const tableName of Object.keys(DB_ACCESSOR)) {
            if (gen !== outboxFlushGen) return;
            const queue = readOutbox(tableName);
            if (!queue.length) continue;
            const table = window.db[DB_ACCESSOR[tableName]];
            if (!table) continue;
            const failed = [];
            for (const item of queue) {
                if (gen !== outboxFlushGen) return;
                const itemId = item && (item.__id != null ? item.__id : item.id);
                if (itemId != null && isTombstoned(tableName, itemId)) continue;
                let retryCount = (item && item.__retries) ? Number(item.__retries) : 0;
                const error = (item && item.__update)
                    ? await table._update(item.__id, item.__changes)
                    : await table._upsert(item);
                if (error) {
                    retryCount++;
                    if (retryCount >= 3) {
                        const qKey = 'eb_outbox_quarantine_' + tableName;
                        let qQueue = [];
                        try { qQueue = JSON.parse(localStorage.getItem(qKey) || '[]') || []; } catch (e) { qQueue = []; }
                        qQueue.push({ ...item, __retries: retryCount, __failed: true });
                        try { localStorage.setItem(qKey, JSON.stringify(qQueue)); } catch (e) {}
                        console.warn('[OUTBOX] ' + tableName + ': elemento quarantena dopo ' + retryCount + ' fallimenti');
                    } else {
                        failed.push({ ...item, __retries: retryCount });
                    }
                }
                // Success leaves the item out of `failed` so it is dropped from the outbox.
            }
            if (gen !== outboxFlushGen) return;
            writeOutbox(tableName, failed);
            console.log('[OUTBOX] ' + tableName + ': flush (' + (queue.length - failed.length) + ' ok, ' + failed.length + ' ancora in coda)');
        }
    } finally {
        outboxFlushBusy = false;
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
        const pk = this._pk();
        const tombs = readTomb(this.tableName);
        const alive = (rows || []).filter(r => r && !tombs.has(String(r[pk])));
        const queue = readOutbox(this.tableName);
        if (!queue.length) return alive;
        const byId = new Map(alive.map(r => [String(r[pk]), r]));
        for (const item of queue) {
            if (filter && !filter(item)) continue;
            if (item && item.__update) {
                if (tombs.has(String(item.__id))) continue;
                const existing = byId.get(String(item.__id));
                if (existing) Object.assign(existing, item.__changes);
            } else if (item && item[pk] != null) {
                if (tombs.has(String(item[pk]))) continue;
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
        if (isTombstoned(this.tableName, id)) return null;
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
        const pk = this.tableName === 'months' ? 'month_id' : this.tableName === 'categories' ? 'name' : this.primaryKey;
        let lastError = null;
        for (const val of this._idVariants(id)) {
            const { error } = await this._uidEq(supabaseClient.from(this.tableName).update(payload)).eq(pk, val);
            if (!error) return null;
            lastError = error;
        }
        return lastError;
    }

    async update(id, changes) {
        const error = await this._update(id, changes);
        if (error) {
            console.warn('[DB] update fallito su ' + this.tableName + ':', error.message);
            enqueueOutbox(this.tableName, { __update: true, __id: id, __changes: changes });
        }
    }

    _idVariants(id) {
        const out = [id];
        if (id == null) return out;
        const s = String(id);
        if (s !== String(out[0])) out.push(s);
        else if (typeof id !== 'string') out.push(s);
        const n = Number(id);
        if (!Number.isNaN(n) && n !== id) out.push(n);
        return out;
    }

    async delete(id) {
        dropFromOutbox(this.tableName, id);
        addTomb(this.tableName, id);
        if (!window.supabaseUser) return;
        const pk = this.tableName === 'months' ? 'month_id' : this.tableName === 'categories' ? 'name' : this.primaryKey;
        for (const val of this._idVariants(id)) {
            const { error } = await this._uidEq(supabaseClient.from(this.tableName).delete()).eq(pk, val);
            if (error) console.error('[DB] delete fallito su ' + this.tableName + ':', error);
        }
    }

    async clear() {
        clearOutbox(this.tableName);
        if (!window.supabaseUser) return;
        const { error } = await this._uidEq(supabaseClient.from(this.tableName).delete());
        if (error) {
            console.error('[DB] clear fallito su ' + this.tableName + ':', error);
            const rows = await this.toArray();
            for (const row of rows) {
                const pk = this._pk();
                if (row && row[pk] != null) await this.delete(row[pk]);
            }
        }
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
        if (!ids || !ids.length) return;
        ids.forEach((id) => dropFromOutbox(this.tableName, id));
        if (!window.supabaseUser) return;
        const { error } = await this._uidEq(supabaseClient.from(this.tableName).delete().in(this.primaryKey, ids));
        if (error) {
            console.error(error);
            for (const id of ids) await this.delete(id);
        }
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
