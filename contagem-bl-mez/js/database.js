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
    
    // Chaves de armazenamento local (apenas para contagens)
    KEYS: {
        CONTAGENS: 'blmez_contagens',
        PENDING: 'blmez_pending_contagens',
        BASE_META: 'blmez_base_meta' // Apenas metadados, não os produtos
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
        
        console.log('🔄 Buscando produtos do Supabase...');
        const { data, error } = await this.supabase.from('produtos').select('*');
        
        if (error) {
            console.error('Erro ao buscar produtos:', error);
            throw error;
        }
        
        console.log(`✅ ${data.length} produtos carregados`);
        return data;
    },
    
    // Contar total de produtos (mais leve)
    async countProdutos() {
        if (!this.supabase) return 0;
        const { count, error } = await this.supabase.from('produtos').select('*', { count: 'exact', head: true });
        if (error) return 0;
        return count;
    },
    
    // Limpar tabela de produtos
    async clearProdutos() {
        if (!this.supabase) return;
        console.log('🧹 Limpando tabela de produtos...');
        const { error } = await this.supabase.from('produtos').delete().neq('id', 0);
        if (error) throw new Error('Erro ao limpar base: ' + error.message);
    },
    
    // Inserir produtos em lote
    async insertProdutosBatch(produtosArray, onProgress = null) {
        if (!this.supabase) throw new Error('Supabase não configurado');
        
        const batchSize = 500;
        const total = produtosArray.length;
        
        for (let i = 0; i < total; i += batchSize) {
            const batch = produtosArray.slice(i, i + batchSize);
            
            const { error } = await this.supabase.from('produtos').insert(batch);
            
            if (error) {
                console.error(`Erro no lote ${i}-${i+batchSize}:`, error);
                throw new Error(`Erro ao inserir lote: ${error.message}`);
            }
            
            // Progresso
            if (onProgress) {
                const progresso = Math.round(((i + batch.length) / total) * 100);
                onProgress(progresso);
            }
            
            // Pequena pausa para não sobrecarregar
            await new Promise(r => setTimeout(r, 100));
        }
        
        console.log(`✅ ${total} produtos inseridos`);
        return true;
    },
    
    // Substituir toda a base de produtos
    async replaceProdutos(produtosArray, onProgress = null) {
        if (!this.supabase) throw new Error('Supabase não configurado');
        
        // 1. Limpar tabela existente
        await this.clearProdutos();
        
        // 2. Inserir novos produtos
        await this.insertProdutosBatch(produtosArray, onProgress);
        
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
        return data || [];
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
    
    // Excluir uma contagem
    async deleteContagem(id) {
        if (!this.supabase) return;
        const { error } = await this.supabase.from('contagens').delete().eq('id', id);
        if (error) throw error;
    },
    
    // ============ METADADOS (leves, cabem no localStorage) ============
    
    // Salvar metadados da base
    saveBaseMeta(meta) {
        try {
            localStorage.setItem(this.KEYS.BASE_META, JSON.stringify(meta));
        } catch (e) {
            // Ignorar erro se não couber
        }
    },
    
    // Carregar metadados da base
    loadBaseMeta() {
        try {
            const data = localStorage.getItem(this.KEYS.BASE_META);
            return data ? JSON.parse(data) : null;
        } catch (e) {
            return null;
        }
    }
};