// Supabase Dexie Adapter
const supabaseUrl = 'https://bkviudppelulwufzhrat.supabase.co';
const supabaseKey = 'sb_publishable_bPVweV54mHiYuQSTZd7e-A_2DGbZr-j';
const supabase = window.supabase.createClient(supabaseUrl, supabaseKey);

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
        return mapped;
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
        const { data, error } = await supabase.from(this.tableName).select('*').eq('user_id', window.supabaseUser.id);
        if (error) console.error(error);
        return (data || []).map(this._mapOut.bind(this));
    }

    async get(id) {
        if (!window.supabaseUser) return null;
        let query = supabase.from(this.tableName).select('*').eq('user_id', window.supabaseUser.id);
        
        if (this.tableName === 'months') {
            query = query.eq('month_id', id);
        } else if (this.tableName === 'categories') {
            query = query.eq('name', id);
        } else {
            query = query.eq(this.primaryKey, id);
        }

        const { data, error } = await query.single();
        return this._mapOut(data || null);
    }

    async put(item) {
        if (!window.supabaseUser) return;
        const payload = { ...this._mapIn(item), user_id: window.supabaseUser.id };
        const { error } = await supabase.from(this.tableName).upsert(payload);
        if (error) console.error(error);
    }

    async update(id, changes) {
        if (!window.supabaseUser) return;
        const payload = this._mapIn(changes);
        let query = supabase.from(this.tableName).update(payload).eq('user_id', window.supabaseUser.id);
        
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

    async delete(id) {
        if (!window.supabaseUser) return;
        let query = supabase.from(this.tableName).delete().eq('user_id', window.supabaseUser.id);
        
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
        const { error } = await supabase.from(this.tableName).delete().eq('user_id', window.supabaseUser.id);
        if (error) console.error(error);
    }

    async count() {
        if (!window.supabaseUser) return 0;
        const { count, error } = await supabase.from(this.tableName).select('*', { count: 'exact', head: true }).eq('user_id', window.supabaseUser.id);
        return count || 0;
    }

    async bulkPut(items) {
        if (!window.supabaseUser || !items.length) return;
        const payload = items.map(i => ({ ...this._mapIn(i), user_id: window.supabaseUser.id }));
        const { error } = await supabase.from(this.tableName).upsert(payload);
        if (error) console.error(error);
    }

    async bulkDelete(ids) {
        if (!window.supabaseUser || !ids.length) return;
        const { error } = await supabase.from(this.tableName).delete().in(this.primaryKey, ids).eq('user_id', window.supabaseUser.id);
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
                    
                    const { data, error } = await supabase.from(self.tableName).select('*').eq(f, val).eq('user_id', window.supabaseUser.id);
                    if (error) console.error(error);
                    return (data || []).map(self._mapOut.bind(self));
                },
                primaryKeys: async () => {
                    if (!window.supabaseUser) return [];
                    let f = field;
                    if (self.tableName === 'months' && field === 'month') f = 'month_id';
                    
                    const { data, error } = await supabase.from(self.tableName).select(self.primaryKey).eq(f, val).eq('user_id', window.supabaseUser.id);
                    if (error) console.error(error);
                    return data ? data.map(d => d[self.primaryKey]) : [];
                }
            }),
            anyOf: (arr) => ({
                toArray: async () => {
                    if (!window.supabaseUser || !arr.length) return [];
                    let f = field;
                    if (self.tableName === 'months' && field === 'month') f = 'month_id';
                    
                    const { data, error } = await supabase.from(self.tableName).select('*').in(f, arr).eq('user_id', window.supabaseUser.id);
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
                
                const { data, error } = await supabase.from(self.tableName).select('*').eq('user_id', window.supabaseUser.id).order(f);
                if (error) console.error(error);
                return (data || []).map(self._mapOut.bind(self));
            }
        };
    }
}

// LocalStorage mock for tables not in Supabase (settings, savingsGoals, syncState)
class LocalMockTable {
    constructor(tableName) {
        this.tableName = tableName;
    }
    _getData() {
        return JSON.parse(localStorage.getItem('mock_' + this.tableName) || '[]');
    }
    _saveData(data) {
        localStorage.setItem('mock_' + this.tableName, JSON.stringify(data));
    }
    async toArray() { return this._getData(); }
    async get(id) { return this._getData().find(x => x.id === id || x.key === id || x.name === id) || null; }
    async put(item) { 
        let data = this._getData(); 
        let idx = data.findIndex(x => x.id === item.id || x.key === item.key || x.name === item.name);
        if(idx >= 0) data[idx] = item; else data.push(item);
        this._saveData(data);
    }
    async update(id, changes) {
        let data = this._getData(); 
        let idx = data.findIndex(x => x.id === id || x.key === id || x.name === id);
        if(idx >= 0) { data[idx] = { ...data[idx], ...changes }; this._saveData(data); }
    }
    async delete(id) {
        let data = this._getData(); 
        data = data.filter(x => x.id !== id && x.key !== id && x.name !== id);
        this._saveData(data);
    }
    async clear() { this._saveData([]); }
    async count() { return this._getData().length; }
    async bulkPut(items) { 
        let data = this._getData();
        items.forEach(item => {
            let idx = data.findIndex(x => x.id === item.id || x.key === item.key || x.name === item.name);
            if(idx >= 0) data[idx] = item; else data.push(item);
        });
        this._saveData(data);
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
    savingsGoals: new LocalMockTable('savingsGoals'),
    settings: new LocalMockTable('settings'),
    syncState: new LocalMockTable('syncState')
};

// Autenticazione Auth Modal Logic
window.addEventListener('DOMContentLoaded', () => {
    supabase.auth.onAuthStateChange((event, session) => {
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
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) msg.innerText = error.message;
};

window.handleSignup = async () => {
    const email = document.getElementById('authEmail').value;
    const password = document.getElementById('authPassword').value;
    const msg = document.getElementById('authMessage');
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) msg.innerText = error.message;
    else msg.innerText = "Controlla la tua email per confermare la registrazione!";
};
