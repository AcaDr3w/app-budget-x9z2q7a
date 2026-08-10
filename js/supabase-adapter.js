// Supabase Dexie Adapter
const supabaseUrl = 'https://bkviudppelulwufzhrat.supabase.co';
const supabaseKey = 'sb_publishable_bPVweV54mHiYuQSTZd7e-A_2DGbZr-j';
const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);
window.supabaseClient = supabaseClient;

// Global user state for the adapter
window.supabaseUser = null;

class SupabaseTable {
    constructor(tableName, primaryKey = 'id') {
        this.tableName = tableName;
        this.primaryKey = primaryKey;
    }
    
    _mapIn(item) {
        if (!item) return item;
        let mapped = { ...item };
        if (this.tableName === 'months' && mapped.month) {
            mapped.month_id = mapped.month;
            delete mapped.month;
        }
        if (this.tableName === 'categories' && mapped.name) {
            mapped.name = mapped.name; // name is unique
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
            income: ['id', 'month', 'desc', 'amount'],
            expenses: ['id', 'month', 'date', 'category', 'desc', 'planned', 'actual', 'sharedPercentage'],
            categories: ['name', 'macro', 'icon'],
            annual_deadlines: ['id', 'month', 'day', 'desc', 'amount', 'isPaid'],
            savings_goals: ['name', 'targetAmount', 'importo_accumulato', 'createdAt'],
            sync_state: ['id', 'counter', 'deviceId', 'lastUpdated'],
            settings: ['key', 'value']
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
        if (!window.supabaseUser) return [];
        const { data, error } = await supabaseClient.from(this.tableName).select('*').eq('user_id', window.supabaseUser.id);
        if (error) console.error(error);
        return (data || []).map(this._mapOut.bind(this));
    }

    async get(id) {
        if (!window.supabaseUser) return null;
        let query = supabaseClient.from(this.tableName).select('*').eq('user_id', window.supabaseUser.id);
        
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

    async put(item) {
        if (!window.supabaseUser) return;
        const payload = { ...this._mapIn(item), user_id: window.supabaseUser.id };
        const { error } = await supabaseClient.from(this.tableName).upsert(payload);
        if (error) console.warn('[DB] put fallito su ' + this.tableName + ':', error.message);
    }

    async update(id, changes) {
        if (!window.supabaseUser) return;
        const payload = this._mapIn(changes);
        let query = supabaseClient.from(this.tableName).update(payload).eq('user_id', window.supabaseUser.id);
        
        if (this.tableName === 'months') {
            query = query.eq('month_id', id);
        } else if (this.tableName === 'categories') {
            query = query.eq('name', id);
        } else {
            query = query.eq(this.primaryKey, id);
        }
        const { error } = await query;
        if (error) console.warn('[DB] update fallito su ' + this.tableName + ':', error.message);
    }

    async delete(id) {
        if (!window.supabaseUser) return;
        let query = supabaseClient.from(this.tableName).delete().eq('user_id', window.supabaseUser.id);
        
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
        const { error } = await supabaseClient.from(this.tableName).delete().eq('user_id', window.supabaseUser.id);
        if (error) console.error(error);
    }

    async count() {
        if (!window.supabaseUser) return 0;
        const { count, error } = await supabaseClient.from(this.tableName).select('*', { count: 'exact', head: true }).eq('user_id', window.supabaseUser.id);
        return count || 0;
    }

    async bulkPut(items) {
        if (!window.supabaseUser || !items.length) return;
        const payload = items.map(i => ({ ...this._mapIn(i), user_id: window.supabaseUser.id }));
        const { error } = await supabaseClient.from(this.tableName).upsert(payload);
        if (error) console.warn('[DB] bulkPut fallito su ' + this.tableName + ':', error.message);
    }

    async bulkDelete(ids) {
        if (!window.supabaseUser || !ids.length) return;
        const { error } = await supabaseClient.from(this.tableName).delete().in(this.primaryKey, ids).eq('user_id', window.supabaseUser.id);
        if (error) console.error(error);
    }

    where(field) {
        const self = this;
        return {
            equals: (val) => ({
                toArray: async () => {
                    if (!window.supabaseUser) return [];
                    let f = field;
                    if (self.tableName === 'months' && field === 'month') f = 'month_id';
                    
                    const { data, error } = await supabaseClient.from(self.tableName).select('*').eq(f, val).eq('user_id', window.supabaseUser.id);
                    if (error) console.error(error);
                    return (data || []).map(self._mapOut.bind(self));
                },
                primaryKeys: async () => {
                    if (!window.supabaseUser) return [];
                    let f = field;
                    if (self.tableName === 'months' && field === 'month') f = 'month_id';
                    
                    const { data, error } = await supabaseClient.from(self.tableName).select(self.primaryKey).eq(f, val).eq('user_id', window.supabaseUser.id);
                    if (error) console.error(error);
                    return data ? data.map(d => d[self.primaryKey]) : [];
                }
            }),
            anyOf: (arr) => ({
                toArray: async () => {
                    if (!window.supabaseUser || !arr.length) return [];
                    let f = field;
                    if (self.tableName === 'months' && field === 'month') f = 'month_id';
                    
                    const { data, error } = await supabaseClient.from(self.tableName).select('*').in(f, arr).eq('user_id', window.supabaseUser.id);
                    if (error) console.error(error);
                    return (data || []).map(self._mapOut.bind(self));
                }
            })
        };
    }

    orderBy(field) {
        const self = this;
        return {
            toArray: async () => {
                if (!window.supabaseUser) return [];
                let f = field;
                if (self.tableName === 'months' && field === 'month') f = 'month_id';
                
                const { data, error } = await supabaseClient.from(self.tableName).select('*').eq('user_id', window.supabaseUser.id).order(f);
                if (error) console.error(error);
                return (data || []).map(self._mapOut.bind(self));
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
    syncState: new SupabaseTable('sync_state', 'id')
};

// Autenticazione Auth Modal Logic
window.addEventListener('DOMContentLoaded', () => {
    supabaseClient.auth.onAuthStateChange((event, session) => {
        if (session) {
            window.supabaseUser = session.user;
            document.getElementById('authModal').style.display = 'none';
            document.getElementById('mainAppWrapper').style.display = 'block';
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
