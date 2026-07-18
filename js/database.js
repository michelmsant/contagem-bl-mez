// ============================================================
// DATABASE.JS - Conexão com Supabase e gerenciamento de dados
// ============================================================

const Database = {
    supabase: null,
    
    // Chaves de armazenamento local
    KEYS: {
        SETTINGS: 'blmez_supabase_settings',
        PRODUTOS_CACHE: 'blmez_produtos_cache',
        CONTAGENS: 'blmez_contagens',
        PENDING: 'blmez_pending_contagens'
    },
    
    // Inicializar conexão Supabase
    init() {
        const settings = this.getSettings();
        if (settings && settings.url && settings.key) {
            try {
                this.supabase = window.supabase.createClient(settings.url, settings.key);
                return true;
            } catch (e) {
                console.error('Erro ao conectar ao Supabase:', e);
                return false;
            }
        }
        return false;
    },
    
    // Configurações
    getSettings() {
        const data = localStorage.getItem(this.KEYS.SETTINGS);
        return data ? JSON.parse(data) : null;
    },
    
    saveSettings(url, key) {
        localStorage.setItem(this.KEYS.SETTINGS, JSON.stringify({ url, key }));
    },
    
    // Produtos
    async fetchProdutos() {
        if (!this.supabase) return null;
        const { data, error } = await this.supabase.from('produtos').select('*');
        if (error) throw error;
        return data;
    },
    
    async uploadProdutos(produtosArray) {
        if (!this.supabase) throw new Error('Supabase não configurado');
        
        // Limpar tabela
        await this.supabase.from('produtos').delete().neq('id', 0);
        
        // Inserir em lotes
        const batchSize = 500;
        for (let i = 0; i < produtosArray.length; i += batchSize) {
            const batch = produtosArray.slice(i, i + batchSize);
            const { error } = await this.supabase.from('produtos').insert(batch);
            if (error) throw error;
        }
    },
    
    // Contagens
    async fetchContagens() {
        if (!this.supabase) return [];
        const { data, error } = await this.supabase.from('contagens')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(5000);
        if (error) throw error;
        return data;
    },
    
    async saveContagem(contagem) {
        if (!this.supabase) return null;
        const { data, error } = await this.supabase.from('contagens')
            .insert([contagem])
            .select('id')
            .single();
        if (error) throw error;
        return data;
    },
    
    async deleteContagem(id) {
        if (!this.supabase) return;
        const { error } = await this.supabase.from('contagens').delete().eq('id', id);
        if (error) throw error;
    },
    
    async testConnection() {
        if (!this.supabase) return false;
        const { error } = await this.supabase.from('produtos').select('id', { count: 'exact', head: true });
        return !error;
    }
};