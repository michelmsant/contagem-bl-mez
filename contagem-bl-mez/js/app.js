// ============================================================
// APP.JS - Lógica principal da aplicação
// ============================================================

const App = {
    // Estado global
    produtosMapCodAcesso: new Map(),
    produtosMapSeqProduto: new Map(),
    baseMeta: null,
    contagensLocal: [],
    pendingContagens: [],
    sortColumn: null,
    sortDirection: 'asc',
    resolvendoDuplicidade: null,
    
    // Índices das colunas no TXT
    COLUMNS: {
        SEQPRODUTO: 1,
        DESCCOMPLETA: 2,
        CODACESSO: 3,
        EMBALAGEM: 7,
        QTDEMBALAGEM: 8
    },
    
    // Inicialização
    init() {
        this.loadContagens();
        this.loadProdutosCache();
        this.setupEventListeners();
        this.renderizarHistorico();
        this.atualizarEstatisticas();
        
        // Sincronizar se online
        if (Database.supabase && navigator.onLine) {
            this.syncData();
        }
    },
    
    // Event listeners
    setupEventListeners() {
        // Será preenchido no arquivo principal
    },
    
    // Importação de base
    async importarBase(conteudo, nomeArquivo) {
        const linhas = conteudo.split(/\r?\n/).filter(l => l.trim() !== '');
        if (linhas.length === 0) throw new Error('Arquivo vazio.');
        
        // Detectar delimitador
        const delimitadores = ['\t', ';', ','];
        let delimitador = '\t';
        let maxCols = 0;
        
        for (const d of delimitadores) {
            const cols = linhas[0].split(d).length;
            if (cols > maxCols) { maxCols = cols; delimitador = d; }
        }
        
        const primeiraCols = linhas[0].split(delimitador);
        const pareceCabecalho = primeiraCols.some(c => /seqproduto|codacesso/i.test(c.trim()));
        const inicioDados = pareceCabecalho ? 1 : 0;
        
        this.produtosMapCodAcesso.clear();
        this.produtosMapSeqProduto.clear();
        
        const produtosParaSupabase = [];
        
        for (let i = inicioDados; i < linhas.length; i++) {
            const cols = linhas[i].split(delimitador);
            if (cols.length < 9) continue;
            
            const seqProduto = (cols[this.COLUMNS.SEQPRODUTO] || '').trim();
            const descCompleta = (cols[this.COLUMNS.DESCCOMPLETA] || '').trim();
            const codAcesso = (cols[this.COLUMNS.CODACESSO] || '').trim();
            const embalagem = (cols[this.COLUMNS.EMBALAGEM] || '').trim();
            const qtdEmbalagem = (cols[this.COLUMNS.QTDEMBALAGEM] || '').trim();
            
            if (!codAcesso && !seqProduto) continue;
            
            const embFormatada = embalagem && qtdEmbalagem ? `${embalagem} x ${qtdEmbalagem}` : (embalagem || qtdEmbalagem || '');
            
            const produto = { seqProduto, descCompleta, codAcesso, embalagem, qtdEmbalagem, embalagemFormatada: embFormatada };
            
            if (codAcesso) this.produtosMapCodAcesso.set(codAcesso, produto);
            if (seqProduto) this.produtosMapSeqProduto.set(seqProduto, produto);
            
            produtosParaSupabase.push({
                seqproduto: seqProduto,
                desccompleta: descCompleta,
                codacesso: codAcesso,
                embalagem,
                qtdembalagem: qtdEmbalagem
            });
        }
        
        this.baseMeta = {
            nomeArquivo,
            totalRegistros: this.produtosMapCodAcesso.size,
            dataHoraImportacao: new Date().toISOString()
        };
        
        // Cache local
        this.saveProdutosCache();
        
        // Upload Supabase
        if (Database.supabase && navigator.onLine) {
            try {
                await Database.uploadProdutos(produtosParaSupabase);
                Utils.showToast('✅ Base enviada para o Supabase!', 'success');
            } catch (err) {
                Utils.showToast('⚠️ Base salva localmente. Erro ao enviar: ' + err.message, 'warning');
            }
        }
        
        return this.baseMeta;
    },
    
    // Pesquisa de produtos
    pesquisarProduto(codigo) {
        if (!codigo || codigo.trim() === '') return null;
        const cod = codigo.trim();
        
        if (this.produtosMapCodAcesso.has(cod)) return this.produtosMapCodAcesso.get(cod);
        if (this.produtosMapSeqProduto.has(cod)) return this.produtosMapSeqProduto.get(cod);
        
        for (const [key, val] of this.produtosMapCodAcesso) {
            if (key.startsWith(cod)) return val;
        }
        
        return null;
    },
    
    // Cache de produtos
    saveProdutosCache() {
        const cache = {
            produtos: Array.from(this.produtosMapCodAcesso.entries()),
            meta: this.baseMeta
        };
        localStorage.setItem(Database.KEYS.PRODUTOS_CACHE, JSON.stringify(cache));
    },
    
    loadProdutosCache() {
        const cache = localStorage.getItem(Database.KEYS.PRODUTOS_CACHE);
        if (cache) {
            try {
                const parsed = JSON.parse(cache);
                this.produtosMapCodAcesso = new Map(parsed.produtos);
                this.baseMeta = parsed.meta;
            } catch (e) {}
        }
    },
    
    // Contagens
    loadContagens() {
        const data = localStorage.getItem(Database.KEYS.CONTAGENS);
        this.contagensLocal = data ? JSON.parse(data) : [];
        
        const pending = localStorage.getItem(Database.KEYS.PENDING);
        this.pendingContagens = pending ? JSON.parse(pending) : [];
    },
    
    saveContagens() {
        localStorage.setItem(Database.KEYS.CONTAGENS, JSON.stringify(this.contagensLocal));
        localStorage.setItem(Database.KEYS.PENDING, JSON.stringify(this.pendingContagens));
    },
    
    async salvarContagem(contagem) {
        // Verificar duplicidade
        const existente = this.contagensLocal.findIndex(c =>
            c.rua === contagem.rua && c.faixa === contagem.faixa && c.codigo === contagem.codigo
        );
        
        if (existente >= 0) {
            return new Promise((resolve) => {
                this.resolvendoDuplicidade = (opcao) => {
                    if (opcao === 'editar') {
                        this.contagensLocal[existente] = { ...contagem, synced: false };
                    } else if (opcao === 'somar') {
                        this.contagensLocal[existente].quantidade += contagem.quantidade;
                        this.contagensLocal[existente].synced = false;
                    }
                    this.saveContagens();
                    resolve(opcao);
                };
            });
        }
        
        this.contagensLocal.push(contagem);
        this.pendingContagens.push(contagem);
        this.saveContagens();
        
        // Sincronizar
        if (Database.supabase && navigator.onLine) {
            await this.syncPendingContagens();
        }
        
        return 'novo';
    },
    
    async syncPendingContagens() {
        if (!Database.supabase || this.pendingContagens.length === 0) return;
        
        for (const cont of [...this.pendingContagens]) {
            try {
                const result = await Database.saveContagem({
                    rua: cont.rua,
                    faixa: cont.faixa,
                    codigo: cont.codigo,
                    descricao: cont.descricao,
                    embalagem: cont.embalagem,
                    quantidade: cont.quantidade,
                    observacoes: cont.observacoes || '',
                    data: cont.data,
                    hora: cont.hora
                });
                
                cont.synced = true;
                cont.supabase_id = result.id;
                this.pendingContagens = this.pendingContagens.filter(c => c.localId !== cont.localId);
            } catch (err) {
                console.error('Erro ao sincronizar:', err);
            }
        }
        
        this.saveContagens();
    },
    
    async syncData() {
        if (!Database.supabase) return;
        
        // Buscar contagens remotas
        try {
            const remotas = await Database.fetchContagens();
            const remoteMapped = remotas.map(c => ({
                localId: 'remote_' + c.id,
                supabase_id: c.id,
                rua: c.rua,
                faixa: c.faixa,
                codigo: c.codigo,
                descricao: c.descricao,
                embalagem: c.embalagem,
                quantidade: c.quantidade,
                observacoes: c.observacoes || '',
                data: c.data,
                hora: c.hora,
                dataISO: c.created_at,
                synced: true
            }));
            
            // Mesclar
            const merged = [...remoteMapped];
            for (const local of this.contagensLocal) {
                if (!local.synced) merged.push(local);
            }
            
            this.contagensLocal = merged;
            this.saveContagens();
        } catch (err) {
            console.error('Erro ao sincronizar:', err);
        }
        
        // Sincronizar pendentes
        await this.syncPendingContagens();
        
        this.renderizarHistorico();
        this.atualizarEstatisticas();
    },
    
    // Renderização
    getHistoricoFiltrado(filtros = {}) {
        let lista = [...this.contagensLocal];
        
        if (filtros.rua) lista = lista.filter(c => c.rua.toLowerCase().includes(filtros.rua));
        if (filtros.faixa) lista = lista.filter(c => String(c.faixa).includes(filtros.faixa));
        if (filtros.codigo) lista = lista.filter(c => c.codigo.toLowerCase().includes(filtros.codigo));
        if (filtros.descricao) lista = lista.filter(c => c.descricao.toLowerCase().includes(filtros.descricao));
        
        if (this.sortColumn) {
            lista.sort((a, b) => {
                let valA = a[this.sortColumn];
                let valB = b[this.sortColumn];
                if (typeof valA === 'string') valA = valA.toLowerCase();
                if (typeof valB === 'string') valB = valB.toLowerCase();
                return this.sortDirection === 'asc' ? (valA < valB ? -1 : 1) : (valA > valB ? -1 : 1);
            });
        } else {
            lista.sort((a, b) => new Date(b.dataISO || 0) - new Date(a.dataISO || 0));
        }
        
        return lista;
    },
    
    renderizarHistorico() {
        // Será implementado no HTML principal
    },
    
    atualizarEstatisticas() {
        // Será implementado no HTML principal
    }
};