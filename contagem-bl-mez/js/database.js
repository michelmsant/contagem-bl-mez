// ============================================================
// DATABASE.JS - Conexão com Supabase e gerenciamento de dados
// ============================================================

const Database = {
    supabase: null,
    
    // Configurações fixas do Supabase
    CONFIG: {
        url: 'https://qsfljxfhjpomrtznbzur.supabase.co',
        key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFzZmxqeGZoanBvbXJ0em5ienVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQzODI4MTYsImV4cCI6MjA5OTk1ODgxNn0.zR_N6WJCsc1HzAFjlfqEz6lVUutQLNDy8LTj8HIGAPd8'
    },
    
    // Chaves de armazenamento local
    KEYS: {
        PRODUTOS_CACHE: 'blmez_produtos_cache',
        CONTAGENS: 'blmez_contagens',
        PENDING: 'blmez_pending_contagens'
    },
    
    // Inicializar conexão Supabase automaticamente
    init() {
        try {
            this.supabase = window.supabase.createClient(this.CONFIG.url, this.CONFIG.key);
            console.log('✅ Supabase conectado automaticamente');
            return true;
        } catch (e) {
            console.error('❌ Erro ao conectar ao Supabase:', e);
            return false;
        }
    },
    
    // Testar conexão
    async testConnection() {
        if (!this.supabase) return false;
        try {
            const { error } = await this.supabase.from('produtos').select('id', { count: 'exact', head: true });
            return !error;
        } catch (e) {
            return false;
        }
    },
    
    // ============ PRODUTOS ============
    
    // Buscar todos os produtos do Supabase
    async fetchProdutos() {
        if (!this.supabase) return null;
        const { data, error } = await this.supabase.from('produtos').select('*');
        if (error) throw error;
        return data;
    },
    
    // Enviar produtos para o Supabase
    async uploadProdutos(produtosArray) {
        if (!this.supabase) throw new Error('Supabase não configurado');
        
        // Limpar tabela existente
        const { error: delErr } = await this.supabase.from('produtos').delete().neq('id', 0);
        if (delErr) throw new Error('Erro ao limpar base: ' + delErr.message);
        
        // Inserir em lotes de 500
        const batchSize = 500;
        for (let i = 0; i < produtosArray.length; i += batchSize) {
            const batch = produtosArray.slice(i, i + batchSize);
            const { error } = await this.supabase.from('produtos').insert(batch);
            if (error) throw new Error(`Erro ao inserir lote: ${error.message}`);
            
            // Pequena pausa para não sobrecarregar
            await new Promise(r => setTimeout(r, 50));
        }
        
        return true;
    },
    
    // ============ CONTAGENS ============
    
    // Buscar contagens do Supabase
    async fetchContagens() {
        if (!this.supabase) return [];
        const { data, error } = await this.supabase.from('contagens')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(5000);
        if (error) throw error;
        return data;
    },
    
    // Salvar uma contagem no Supabase
    async saveContagem(contagem) {
        if (!this.supabase) return null;
        const { data, error } = await this.supabase.from('contagens')
            .insert([contagem])
            .select('id')
            .single();
        if (error) throw error;
        return data;
    },
    
    // Atualizar uma contagem
    async updateContagem(id, contagem) {
        if (!this.supabase) return null;
        const { data, error } = await this.supabase.from('contagens')
            .update(contagem)
            .eq('id', id);
        if (error) throw error;
        return data;
    },
    
    // Excluir uma contagem
    async deleteContagem(id) {
        if (!this.supabase) return;
        const { error } = await this.supabase.from('contagens').delete().eq('id', id);
        if (error) throw error;
    }
};