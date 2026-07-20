// ============================================================
// APP.JS - Lógica principal da aplicação
// Versão otimizada para bases grandes (sem localStorage de produtos)
// ============================================================

(function() {
    'use strict';
    
    // Verificar acesso
    const currentUser = Auth.checkAccess();
    if (!currentUser) return;
    
    const isMaster = Auth.isMaster();
    
    // Atalhos DOM
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);
    
    // Elementos da UI
    const userNameDisplay = $('#userNameDisplay');
    const masterBadge = $('#masterBadge');
    const hamburgerBtn = $('#hamburgerBtn');
    const menuDropdown = $('#menuDropdown');
    const tabHistoricoBtn = $('#tabHistoricoBtn');
    const importZone = $('#importZone');
    const fileInput = $('#fileInput');
    const progressBar = $('#progressBar');
    const progressFill = $('#progressFill');
    const importInfo = $('#importInfo');
    const inputRua = $('#rua');
    const inputFaixa = $('#faixa');
    const inputCodigo = $('#codigo');
    const inputDescricao = $('#descricao');
    const inputEmbalagem = $('#embalagem');
    const inputQuantidade = $('#quantidade');
    const inputObservacoes = $('#observacoes');
    const btnSalvar = $('#btnSalvar');
    const btnNovaContagem = $('#btnNovaContagem');
    const btnCamera = $('#btnCamera');
    const statItens = $('#statItens');
    const statPaletes = $('#statPaletes');
    const statProdutos = $('#statProdutos');
    const statUltima = $('#statUltima');
    const tabelaHistorico = $('#tabelaHistorico');
    const nenhumRegistro = $('#nenhumRegistro');
    const filtroRua = $('#filtroRua');
    const filtroFaixa = $('#filtroFaixa');
    const filtroCodigo = $('#filtroCodigo');
    const filtroDescricao = $('#filtroDescricao');
    const modalDuplicidade = $('#modalDuplicidade');
    const msgDuplicidade = $('#msgDuplicidade');
    const modalCamera = $('#modalCamera');
    const cameraVideo = $('#cameraVideo');
    const btnFecharCamera = $('#btnFecharCamera');
    const btnCameraContinuo = $('#btnCameraContinuo');
    const modoCameraLabel = $('#modoCameraLabel');
    
    // ============ ESTADO DA APLICAÇÃO ============
    const state = {
        // Produtos ficam APENAS em memória (não no localStorage)
        produtosMapCodAcesso: new Map(),
        produtosMapSeqProduto: new Map(),
        baseMeta: null,
        
        // Contagens (leves, cabem no localStorage)
        contagensLocal: [],
        pendingContagens: [],
        
        // UI
        sortColumn: null,
        sortDirection: 'asc',
        resolvendoDuplicidade: null,
        isLoading: false
    };
    
    // ============ INICIALIZAÇÃO ============
    async function init() {
        // Exibir nome do usuário
        userNameDisplay.textContent = `👤 ${currentUser.nome}`;
        
        // Badge de master
        if (isMaster) {
            masterBadge.style.display = 'inline';
            tabHistoricoBtn.style.display = 'inline-block';
        }
        
        // Inicializar Supabase
        const dbOk = Database.init();
        console.log(dbOk ? '✅ Supabase conectado' : '⚠️ Supabase offline');
        
        // Carregar contagens do localStorage
        loadContagens();
        
        // Tentar carregar produtos do Supabase
        if (Database.supabase) {
            await carregarProdutosDoSupabase();
        }
        
        // Carregar metadados salvos
        carregarMetadados();
        
        // Renderizar
        renderizarHistorico();
        atualizarEstatisticas();
        atualizarInfoImportacao();
        
        // Sincronizar contagens pendentes
        if (Database.supabase && navigator.onLine) {
            await syncPendingContagens();
        }
        
        // Dark mode
        const darkPref = localStorage.getItem('blmez_darkmode');
        if (darkPref === '1') {
            document.body.classList.add('dark-mode');
            const darkBtn = $('#menuDarkMode');
            if (darkBtn) darkBtn.textContent = '☀️ Modo Claro';
        }
        
        // Foco inicial
        inputRua.focus();
        
        console.log('🚀 Contagem BL_MEZ pronta!');
        console.log(`   Produtos em memória: ${state.produtosMapCodAcesso.size}`);
        console.log(`   Contagens: ${state.contagensLocal.length}`);
    }
    
    // ============ CARREGAR PRODUTOS DO SUPABASE ============
    async function carregarProdutosDoSupabase() {
        if (!Database.supabase) return;
        
        try {
            Utils.showToast('🔄 Carregando base do Supabase...', 'success');
            
            const produtos = await Database.fetchProdutos();
            
            if (produtos && produtos.length > 0) {
                // Construir índices em memória
                state.produtosMapCodAcesso.clear();
                state.produtosMapSeqProduto.clear();
                
                for (const p of produtos) {
                    const embFormatada = p.embalagem && p.qtdembalagem 
                        ? `${p.embalagem} x ${p.qtdembalagem}` 
                        : (p.embalagem || p.qtdembalagem || '');
                    
                    const produto = {
                        seqProduto: p.seqproduto,
                        descCompleta: p.desccompleta,
                        codAcesso: p.codacesso,
                        embalagem: p.embalagem,
                        qtdEmbalagem: p.qtdembalagem,
                        embalagemFormatada: embFormatada
                    };
                    
                    if (p.codacesso) state.produtosMapCodAcesso.set(p.codacesso, produto);
                    if (p.seqproduto) state.produtosMapSeqProduto.set(p.seqproduto, produto);
                }
                
                state.baseMeta = {
                    nomeArquivo: 'Supabase',
                    totalRegistros: produtos.length,
                    dataHoraImportacao: new Date().toISOString()
                };
                
                atualizarInfoImportacao();
                console.log(`✅ ${produtos.length} produtos carregados do Supabase`);
            }
        } catch (err) {
            console.error('Erro ao carregar produtos:', err);
            Utils.showToast('⚠️ Não foi possível carregar a base do Supabase', 'error');
        }
    }
    
    // ============ METADADOS (leves) ============
    function salvarMetadados() {
        if (state.baseMeta) {
            Database.saveBaseMeta(state.baseMeta);
        }
    }
    
    function carregarMetadados() {
        const meta = Database.loadBaseMeta();
        if (meta && !state.baseMeta) {
            state.baseMeta = meta;
        }
    }
    
    // ============ CONTAGENS (LOCAL) ============
    function loadContagens() {
        try {
            const data = localStorage.getItem(Database.KEYS.CONTAGENS);
            state.contagensLocal = data ? JSON.parse(data) : [];
            const pending = localStorage.getItem(Database.KEYS.PENDING);
            state.pendingContagens = pending ? JSON.parse(pending) : [];
        } catch (e) {
            state.contagensLocal = [];
            state.pendingContagens = [];
        }
    }
    
    function saveContagens() {
        try {
            localStorage.setItem(Database.KEYS.CONTAGENS, JSON.stringify(state.contagensLocal));
            localStorage.setItem(Database.KEYS.PENDING, JSON.stringify(state.pendingContagens));
        } catch (e) {
            console.warn('Erro ao salvar contagens:', e);
        }
    }
    
    // ============ IMPORTAÇÃO DE BASE ============
    async function importarBase(conteudo, nomeArquivo) {
        if (state.isLoading) {
            Utils.showToast('⚠️ Já existe uma importação em andamento.', 'error');
            return;
        }
        
        state.isLoading = true;
        progressBar.classList.add('active');
        progressFill.style.width = '0%';
        
        try {
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
            
            if (primeiraCols.length < 9) {
                throw new Error('Arquivo precisa ter pelo menos 9 colunas (até coluna I).');
            }
            
            Utils.showToast(`📂 Processando ${linhas.length - inicioDados} linhas...`, 'success');
            
            // Limpar índices em memória
            state.produtosMapCodAcesso.clear();
            state.produtosMapSeqProduto.clear();
            
            // Array para envio ao Supabase
            const produtosParaSupabase = [];
            
            // Processar linhas
            for (let i = inicioDados; i < linhas.length; i++) {
                const cols = linhas[i].split(delimitador);
                if (cols.length < 9) continue;
                
                const seqProduto = (cols[1] || '').trim();
                const descCompleta = (cols[2] || '').trim();
                const codAcesso = (cols[3] || '').trim();
                const embalagem = (cols[7] || '').trim();
                const qtdEmbalagem = (cols[8] || '').trim();
                
                if (!codAcesso && !seqProduto) continue;
                
                const embFormatada = embalagem && qtdEmbalagem 
                    ? `${embalagem} x ${qtdEmbalagem}` 
                    : (embalagem || qtdEmbalagem || '');
                
                const produto = { 
                    seqProduto, descCompleta, codAcesso, 
                    embalagem, qtdEmbalagem, embalagemFormatada: embFormatada 
                };
                
                // Adicionar aos índices em memória
                if (codAcesso) state.produtosMapCodAcesso.set(codAcesso, produto);
                if (seqProduto) state.produtosMapSeqProduto.set(seqProduto, produto);
                
                // Preparar para Supabase
                produtosParaSupabase.push({
                    seqproduto: seqProduto,
                    desccompleta: descCompleta,
                    codacesso: codAcesso,
                    embalagem: embalagem,
                    qtdembalagem: qtdEmbalagem
                });
            }
            
            // Atualizar metadados
            state.baseMeta = {
                nomeArquivo,
                totalRegistros: state.produtosMapCodAcesso.size,
                dataHoraImportacao: new Date().toISOString()
            };
            
            salvarMetadados();
            atualizarInfoImportacao();
            
            // Enviar para o Supabase (substituindo a base existente)
            if (Database.supabase && navigator.onLine) {
                try {
                    Utils.showToast('☁️ Enviando para Supabase...', 'success');
                    
                    await Database.replaceProdutos(produtosParaSupabase, (progresso) => {
                        progressFill.style.width = progresso + '%';
                    });
                    
                    Utils.showToast('✅ Base enviada para o Supabase!', 'success');
                } catch (err) {
                    console.error('Erro ao enviar para Supabase:', err);
                    Utils.showToast('⚠️ Base carregada localmente, mas falha ao enviar: ' + err.message, 'error');
                }
            } else {
                Utils.showToast('⚠️ Offline - base carregada apenas em memória.', 'error');
            }
            
            Utils.showToast(`✅ ${state.produtosMapCodAcesso.size} produtos importados!`, 'success');
            
        } catch (err) {
            console.error('Erro na importação:', err);
            Utils.showToast('❌ Erro: ' + err.message, 'error');
        } finally {
            state.isLoading = false;
            progressBar.classList.remove('active');
            progressFill.style.width = '0%';
        }
    }
    
    function atualizarInfoImportacao() {
        if (!importInfo) return;
        
        if (!state.baseMeta || state.produtosMapCodAcesso.size === 0) {
            importInfo.innerHTML = '<span style="color:#999;">Nenhuma base carregada. Importe um arquivo TXT.</span>';
            return;
        }
        
        const dh = state.baseMeta.dataHoraImportacao 
            ? Utils.formatDataHora(state.baseMeta.dataHoraImportacao) 
            : { data: '--', hora: '--' };
        
        importInfo.innerHTML = `
            <span class="badge">📄 ${Utils.escapeHTML(state.baseMeta.nomeArquivo || 'Base')}</span>
            <span class="badge">📊 ${state.produtosMapCodAcesso.size.toLocaleString('pt-BR')} registros</span>
            <span>📅 ${dh.data} ${dh.hora}</span>
            ${Database.supabase ? '<span class="badge">☁️ Supabase</span>' : '<span class="badge-warning">📱 Local</span>'}
        `;
    }
    
    // ============ PESQUISA DE PRODUTOS ============
    function pesquisarProduto(codigo) {
        if (!codigo || codigo.trim() === '') return null;
        const cod = codigo.trim();
        
        // Busca exata
        if (state.produtosMapCodAcesso.has(cod)) return state.produtosMapCodAcesso.get(cod);
        if (state.produtosMapSeqProduto.has(cod)) return state.produtosMapSeqProduto.get(cod);
        
        // Busca parcial (começa com)
        for (const [key, val] of state.produtosMapCodAcesso) {
            if (key.startsWith(cod)) return val;
        }
        for (const [key, val] of state.produtosMapSeqProduto) {
            if (key.startsWith(cod)) return val;
        }
        
        return null;
    }
    
    // ============ SALVAR CONTAGEM ============
    async function salvarContagem(contagem) {
        // Verificar duplicidade
        const existente = state.contagensLocal.findIndex(c =>
            c.rua === contagem.rua && 
            c.faixa === contagem.faixa && 
            c.codigo === contagem.codigo
        );
        
        if (existente >= 0) {
            return new Promise((resolve) => {
                state.resolvendoDuplicidade = (opcao) => {
                    state.resolvendoDuplicidade = null;
                    
                    if (opcao === 'editar') {
                        state.contagensLocal[existente] = { 
                            ...contagem, 
                            synced: false, 
                            localId: state.contagensLocal[existente].localId 
                        };
                    } else if (opcao === 'somar') {
                        state.contagensLocal[existente].quantidade += contagem.quantidade;
                        state.contagensLocal[existente].observacoes = contagem.observacoes || state.contagensLocal[existente].observacoes;
                        state.contagensLocal[existente].synced = false;
                    }
                    
                    saveContagens();
                    renderizarHistorico();
                    atualizarEstatisticas();
                    resolve(opcao);
                };
                
                msgDuplicidade.innerHTML = `
                    <strong>Rua:</strong> ${Utils.escapeHTML(state.contagensLocal[existente].rua)} |
                    <strong>Faixa:</strong> ${state.contagensLocal[existente].faixa}<br>
                    <strong>Código:</strong> ${Utils.escapeHTML(state.contagensLocal[existente].codigo)}<br>
                    <strong>Qtd atual:</strong> ${state.contagensLocal[existente].quantidade} |
                    <strong>Nova:</strong> ${contagem.quantidade}
                `;
                modalDuplicidade.style.display = 'flex';
            });
        }
        
        // Nova contagem
        state.contagensLocal.push(contagem);
        state.pendingContagens.push(contagem);
        saveContagens();
        
        // Tentar sincronizar
        if (Database.supabase && navigator.onLine) {
            await syncPendingContagens();
        }
        
        return 'novo';
    }
    
    async function syncPendingContagens() {
        if (!Database.supabase || state.pendingContagens.length === 0) return;
        
        let sincronizados = 0;
        
        for (const cont of [...state.pendingContagens]) {
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
                state.pendingContagens = state.pendingContagens.filter(c => c.localId !== cont.localId);
                sincronizados++;
            } catch (err) {
                console.error('Erro ao sincronizar contagem:', err);
            }
        }
        
        if (sincronizados > 0) {
            saveContagens();
            renderizarHistorico();
            atualizarEstatisticas();
            Utils.showToast(`✅ ${sincronizados} contagens sincronizadas!`, 'success');
        }
    }
    
    // ============ RENDERIZAÇÃO ============
    function getHistoricoFiltrado() {
        let lista = [...state.contagensLocal];
        
        // Aplicar filtros
        if (filtroRua && filtroRua.value.trim()) {
            const f = filtroRua.value.toLowerCase().trim();
            lista = lista.filter(c => c.rua.toLowerCase().includes(f));
        }
        if (filtroFaixa && filtroFaixa.value.trim()) {
            const f = filtroFaixa.value.toLowerCase().trim();
            lista = lista.filter(c => String(c.faixa).includes(f));
        }
        if (filtroCodigo && filtroCodigo.value.trim()) {
            const f = filtroCodigo.value.toLowerCase().trim();
            lista = lista.filter(c => c.codigo.toLowerCase().includes(f));
        }
        if (filtroDescricao && filtroDescricao.value.trim()) {
            const f = filtroDescricao.value.toLowerCase().trim();
            lista = lista.filter(c => c.descricao.toLowerCase().includes(f));
        }
        
        // Ordenar
        if (state.sortColumn) {
            lista.sort((a, b) => {
                let va = a[state.sortColumn];
                let vb = b[state.sortColumn];
                if (typeof va === 'string') va = va.toLowerCase();
                if (typeof vb === 'string') vb = vb.toLowerCase();
                return state.sortDirection === 'asc' ? (va < vb ? -1 : 1) : (va > vb ? -1 : 1);
            });
        } else {
            lista.sort((a, b) => new Date(b.dataISO || 0) - new Date(a.dataISO || 0));
        }
        
        return lista;
    }
    
    function renderizarHistorico() {
        if (!tabelaHistorico) return;
        
        const lista = getHistoricoFiltrado();
        tabelaHistorico.innerHTML = '';
        
        if (lista.length === 0) {
            if (nenhumRegistro) nenhumRegistro.style.display = 'block';
        } else {
            if (nenhumRegistro) nenhumRegistro.style.display = 'none';
            
            lista.forEach(c => {
                const syncedIcon = c.synced ? '☁️' : '📱';
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${Utils.escapeHTML(c.rua)}</td>
                    <td>${c.faixa}</td>
                    <td>${Utils.escapeHTML(c.codigo)} ${syncedIcon}</td>
                    <td>${Utils.escapeHTML(c.descricao)}</td>
                    <td>${Utils.escapeHTML(c.embalagem)}</td>
                    <td><strong>${c.quantidade}</strong></td>
                    <td>${c.data || '--'}</td>
                    <td>${c.hora || '--'}</td>
                    <td>
                        <button class="btn btn-outline btn-sm btn-editar" data-id="${c.localId}">✏️</button>
                        <button class="btn btn-danger-text btn-sm btn-excluir" data-id="${c.localId}">🗑️</button>
                    </td>
                `;
                tabelaHistorico.appendChild(tr);
            });
            
            // Eventos dos botões
            tabelaHistorico.querySelectorAll('.btn-editar').forEach(btn => {
                btn.addEventListener('click', () => {
                    const idx = state.contagensLocal.findIndex(c => c.localId === btn.dataset.id);
                    if (idx >= 0) editarContagem(idx);
                });
            });
            
            tabelaHistorico.querySelectorAll('.btn-excluir').forEach(btn => {
                btn.addEventListener('click', () => {
                    const idx = state.contagensLocal.findIndex(c => c.localId === btn.dataset.id);
                    if (idx >= 0) excluirContagem(idx);
                });
            });
        }
        
        // Atualizar ícones de ordenação
        $$('thead th[data-sort]').forEach(th => {
            const icon = th.querySelector('.sort-icon');
            if (icon) {
                icon.textContent = th.dataset.sort === state.sortColumn 
                    ? (state.sortDirection === 'asc' ? '▲' : '▼') 
                    : '';
            }
        });
    }
    
    function editarContagem(index) {
        const c = state.contagensLocal[index];
        inputRua.value = c.rua;
        inputFaixa.value = c.faixa;
        inputCodigo.value = c.codigo;
        inputDescricao.value = c.descricao;
        inputEmbalagem.value = c.embalagem;
        inputQuantidade.value = c.quantidade;
        inputObservacoes.value = c.observacoes || '';
        
        // Remover a contagem antiga
        state.contagensLocal.splice(index, 1);
        state.pendingContagens = state.pendingContagens.filter(p => p.localId !== c.localId);
        saveContagens();
        renderizarHistorico();
        atualizarEstatisticas();
        
        // Mudar para aba de contagem
        document.querySelector('[data-tab="contagem"]').click();
        Utils.showToast('Contagem carregada para edição. Faça as alterações e salve.', 'success');
    }
    
    async function excluirContagem(index) {
        if (!confirm('Deseja realmente excluir esta contagem?')) return;
        
        const c = state.contagensLocal[index];
        
        // Excluir do Supabase se estiver sincronizado
        if (c.supabase_id && Database.supabase) {
            try {
                await Database.deleteContagem(c.supabase_id);
            } catch (err) {
                console.error('Erro ao excluir do Supabase:', err);
            }
        }
        
        state.contagensLocal.splice(index, 1);
        state.pendingContagens = state.pendingContagens.filter(p => p.localId !== c.localId);
        saveContagens();
        renderizarHistorico();
        atualizarEstatisticas();
        Utils.showToast('Contagem excluída.', 'success');
    }
    
    function atualizarEstatisticas() {
        if (statItens) statItens.textContent = state.contagensLocal.length.toLocaleString('pt-BR');
        if (statPaletes) statPaletes.textContent = state.contagensLocal.reduce((s, c) => s + (c.quantidade || 0), 0).toLocaleString('pt-BR');
        if (statProdutos) statProdutos.textContent = new Set(state.contagensLocal.map(c => c.codigo)).size.toLocaleString('pt-BR');
        if (statUltima && state.contagensLocal.length > 0) {
            const u = state.contagensLocal[state.contagensLocal.length - 1];
            statUltima.textContent = `${u.data || '--'} ${u.hora || '--'}`;
        }
    }
    
    // ============ EVENT LISTENERS ============
    
    // Menu hamburguer
    hamburgerBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        menuDropdown.classList.toggle('show');
        hamburgerBtn.classList.toggle('active');
    });
    
    document.addEventListener('click', () => {
        menuDropdown.classList.remove('show');
        hamburgerBtn.classList.remove('active');
    });
    
    menuDropdown.addEventListener('click', (e) => e.stopPropagation());
    
    // Itens do menu
    $('#menuDarkMode').addEventListener('click', () => {
        document.body.classList.toggle('dark-mode');
        const isDark = document.body.classList.contains('dark-mode');
        localStorage.setItem('blmez_darkmode', isDark ? '1' : '0');
        $('#menuDarkMode').textContent = isDark ? '☀️ Modo Claro' : '🌓 Modo Escuro';
        menuDropdown.classList.remove('show');
    });
    
    $('#menuSync').addEventListener('click', async () => {
        menuDropdown.classList.remove('show');
        if (!Database.supabase) {
            Utils.showToast('Supabase não configurado.', 'error');
            return;
        }
        await syncPendingContagens();
        if (state.pendingContagens.length === 0) {
            Utils.showToast('✅ Tudo sincronizado!', 'success');
        }
    });
    
    $('#menuBackup').addEventListener('click', () => {
        menuDropdown.classList.remove('show');
        if (state.contagensLocal.length === 0) {
            Utils.showToast('Nenhum dado para backup.', 'error');
            return;
        }
        const json = JSON.stringify(state.contagensLocal, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        Utils.downloadBlob(blob, `backup_blmez_${new Date().toISOString().slice(0,10)}.json`);
        Utils.showToast('Backup realizado!', 'success');
    });
    
    $('#menuRestore').addEventListener('click', () => {
        menuDropdown.classList.remove('show');
        $('#restoreFileInput').click();
    });
    
    $('#restoreFileInput').addEventListener('change', (e) => {
        if (e.target.files[0]) {
            const reader = new FileReader();
            reader.onload = (ev) => {
                try {
                    const dados = JSON.parse(ev.target.result);
                    if (!Array.isArray(dados)) throw new Error('Formato inválido');
                    if (confirm(`Restaurar ${dados.length} registros? Isso substituirá o histórico atual.`)) {
                        state.contagensLocal = dados;
                        state.pendingContagens = dados.filter(c => !c.synced);
                        saveContagens();
                        renderizarHistorico();
                        atualizarEstatisticas();
                        Utils.showToast(`✅ ${dados.length} registros restaurados!`, 'success');
                    }
                } catch (err) {
                    Utils.showToast('Arquivo inválido.', 'error');
                }
            };
            reader.readAsText(e.target.files[0]);
            e.target.value = '';
        }
    });
    
    $('#menuLogout').addEventListener('click', () => {
        if (confirm('Deseja realmente sair?')) {
            Auth.logout();
        }
    });
    
    // Abas
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;
            
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            const tabContent = document.getElementById('tab' + tab.charAt(0).toUpperCase() + tab.slice(1));
            if (tabContent) tabContent.classList.add('active');
            
            if (tab === 'historico') renderizarHistorico();
        });
    });
    
    // Importação
    importZone.addEventListener('click', () => fileInput.click());
    
    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = async (ev) => {
            await importarBase(ev.target.result, file.name);
        };
        reader.readAsText(file);
        fileInput.value = '';
    });
    
    // Drag and drop
    importZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        importZone.classList.add('drag-over');
    });
    
    importZone.addEventListener('dragleave', () => {
        importZone.classList.remove('drag-over');
    });
    
    importZone.addEventListener('drop', async (e) => {
        e.preventDefault();
        importZone.classList.remove('drag-over');
        const file = e.dataTransfer.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = async (ev) => {
            await importarBase(ev.target.result, file.name);
        };
        reader.readAsText(file);
    });
    
    // Pesquisa de código
    function pesquisarEAtualizarCampos(codigo) {
        if (!codigo || codigo.trim() === '') {
            inputDescricao.value = '';
            inputEmbalagem.value = '';
            return;
        }
        
        if (state.produtosMapCodAcesso.size === 0) {
            Utils.showToast('⚠️ Nenhuma base carregada. Importe um arquivo TXT primeiro.', 'error');
            return;
        }
        
        const produto = pesquisarProduto(codigo);
        
        if (produto) {
            inputDescricao.value = produto.descCompleta;
            inputEmbalagem.value = produto.embalagemFormatada;
            inputCodigo.classList.add('input-success');
            inputDescricao.classList.add('input-success');
            inputEmbalagem.classList.add('input-success');
            setTimeout(() => {
                inputCodigo.classList.remove('input-success');
                inputDescricao.classList.remove('input-success');
                inputEmbalagem.classList.remove('input-success');
            }, 1500);
            Utils.playBeep();
            Utils.vibrate(40);
        } else {
            inputDescricao.value = '';
            inputEmbalagem.value = '';
            inputCodigo.classList.add('input-error');
            setTimeout(() => inputCodigo.classList.remove('input-error'), 1500);
            Utils.showToast('❌ Produto não encontrado na base.', 'error');
        }
    }
    
    inputCodigo.addEventListener('change', () => {
        pesquisarEAtualizarCampos(inputCodigo.value);
    });
    
    inputCodigo.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            pesquisarEAtualizarCampos(inputCodigo.value);
            if (inputDescricao.value) {
                inputQuantidade.focus();
                inputQuantidade.select();
            }
        }
    });
    
    inputCodigo.addEventListener('blur', () => {
        if (inputCodigo.value.trim()) {
            pesquisarEAtualizarCampos(inputCodigo.value);
        }
    });
    
    // Salvar contagem
    btnSalvar.addEventListener('click', async () => {
        const rua = inputRua.value.trim();
        const faixaStr = inputFaixa.value.trim();
        const codigo = inputCodigo.value.trim();
        const descricao = inputDescricao.value.trim();
        const embalagem = inputEmbalagem.value.trim();
        const quantidade = parseInt(inputQuantidade.value) || 0;
        const observacoes = inputObservacoes.value.trim();
        
        // Validações
        if (!rua) { Utils.showToast('⚠️ Informe a Rua.', 'error'); inputRua.focus(); return; }
        if (!faixaStr) { Utils.showToast('⚠️ Informe a Faixa.', 'error'); inputFaixa.focus(); return; }
        if (!codigo) { Utils.showToast('⚠️ Informe o Código.', 'error'); inputCodigo.focus(); return; }
        if (!descricao) { Utils.showToast('⚠️ Produto não encontrado na base.', 'error'); return; }
        if (quantidade <= 0) { Utils.showToast('⚠️ Quantidade deve ser maior que zero.', 'error'); inputQuantidade.focus(); return; }
        
        const faixa = parseInt(faixaStr);
        const dh = Utils.formatDataHora(new Date());
        
        const contagem = {
            localId: Utils.generateId(),
            rua,
            faixa,
            codigo,
            descricao,
            embalagem,
            quantidade,
            observacoes,
            data: dh.data,
            hora: dh.hora,
            dataISO: dh.iso,
            synced: false,
            usuario: currentUser.usuario,
            usuarioNome: currentUser.nome
        };
        
        const resultado = await salvarContagem(contagem);
        
        if (resultado === 'novo') {
            Utils.showToast('✅ Contagem salva com sucesso!', 'success');
            limparFormulario();
        } else if (resultado === 'editar') {
            Utils.showToast('✅ Contagem atualizada!', 'success');
            limparFormulario();
        } else if (resultado === 'somar') {
            Utils.showToast('✅ Quantidade somada!', 'success');
            limparFormulario();
        }
    });
    
    function limparFormulario() {
        inputRua.value = '';
        inputFaixa.value = '';
        inputCodigo.value = '';
        inputDescricao.value = '';
        inputEmbalagem.value = '';
        inputQuantidade.value = '1';
        inputObservacoes.value = '';
        inputCodigo.classList.remove('input-success', 'input-error');
        inputDescricao.classList.remove('input-success');
        inputEmbalagem.classList.remove('input-success');
        inputRua.focus();
    }
    
    btnNovaContagem.addEventListener('click', limparFormulario);
    
    // Câmera
    btnCamera.addEventListener('click', () => {
        if (Camera.isOpen) {
            Camera.close();
            modalCamera.style.display = 'none';
        } else {
            modalCamera.style.display = 'flex';
            Camera.open(cameraVideo, (codigo) => {
                inputCodigo.value = codigo;
                pesquisarEAtualizarCampos(codigo);
                if (!Camera.continuousMode) {
                    modalCamera.style.display = 'none';
                }
            });
        }
    });
    
    btnFecharCamera.addEventListener('click', () => {
        Camera.close();
        modalCamera.style.display = 'none';
    });
    
    btnCameraContinuo.addEventListener('click', () => {
        const isCont = Camera.toggleContinuous();
        modoCameraLabel.textContent = isCont ? 'LIGADO' : 'DESLIGADO';
        btnCameraContinuo.style.background = isCont ? 'var(--green)' : '';
        btnCameraContinuo.style.color = isCont ? 'white' : '';
    });
    
    modalCamera.addEventListener('click', (e) => {
        if (e.target === modalCamera) {
            Camera.close();
            modalCamera.style.display = 'none';
        }
    });
    
    // Modal duplicidade
    $('#btnEditarExistente').addEventListener('click', () => {
        modalDuplicidade.style.display = 'none';
        if (state.resolvendoDuplicidade) state.resolvendoDuplicidade('editar');
    });
    
    $('#btnSomarQuantidade').addEventListener('click', () => {
        modalDuplicidade.style.display = 'none';
        if (state.resolvendoDuplicidade) state.resolvendoDuplicidade('somar');
    });
    
    $('#btnCancelarDuplicidade').addEventListener('click', () => {
        modalDuplicidade.style.display = 'none';
        if (state.resolvendoDuplicidade) state.resolvendoDuplicidade('cancelar');
    });
    
    modalDuplicidade.addEventListener('click', (e) => {
        if (e.target === modalDuplicidade) {
            modalDuplicidade.style.display = 'none';
            if (state.resolvendoDuplicidade) state.resolvendoDuplicidade('cancelar');
        }
    });
    
    // Exportação (apenas master)
    function getDadosExportacao() {
        return getHistoricoFiltrado().map(c => ({
            Rua: c.rua,
            Faixa: c.faixa,
            Código: c.codigo,
            Descrição: c.descricao,
            Embalagem: c.embalagem,
            Quantidade: c.quantidade,
            Data: c.data || '',
            Hora: c.hora || '',
            Observações: c.observacoes || '',
            Usuário: c.usuarioNome || ''
        }));
    }
    
    $('#btnExportCSV').addEventListener('click', () => {
        if (!isMaster) {
            Utils.showToast('Acesso restrito ao administrador.', 'error');
            return;
        }
        const dados = getDadosExportacao();
        if (dados.length === 0) {
            Utils.showToast('Nenhum dado para exportar.', 'error');
            return;
        }
        const cabecalho = ['Rua', 'Faixa', 'Código', 'Descrição', 'Embalagem', 'Quantidade', 'Data', 'Hora', 'Observações', 'Usuário'];
        const linhas = [cabecalho.join(';')];
        dados.forEach(d => {
            linhas.push(Object.values(d).map(v => `"${String(v).replace(/"/g, '""')}"`).join(';'));
        });
        const csv = '\uFEFF' + linhas.join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        Utils.downloadBlob(blob, `contagem_blmez_${new Date().toISOString().slice(0,10)}.csv`);
        Utils.showToast('CSV exportado!', 'success');
    });
    
    $('#btnExportExcel').addEventListener('click', () => {
        if (!isMaster) {
            Utils.showToast('Acesso restrito ao administrador.', 'error');
            return;
        }
        const dados = getDadosExportacao();
        if (dados.length === 0) {
            Utils.showToast('Nenhum dado para exportar.', 'error');
            return;
        }
        if (typeof XLSX === 'undefined') {
            Utils.showToast('Biblioteca SheetJS não carregada.', 'error');
            return;
        }
        const ws = XLSX.utils.json_to_sheet(dados);
        ws['!cols'] = [
            { wch: 8 }, { wch: 8 }, { wch: 20 }, { wch: 40 },
            { wch: 15 }, { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 25 }, { wch: 20 }
        ];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Contagens');
        XLSX.writeFile(wb, `contagem_blmez_${new Date().toISOString().slice(0,10)}.xlsx`);
        Utils.showToast('Excel exportado!', 'success');
    });
    
    // Filtros
    [filtroRua, filtroFaixa, filtroCodigo, filtroDescricao].forEach(input => {
        if (input) input.addEventListener('input', renderizarHistorico);
    });
    
    // Ordenação
    $$('thead th[data-sort]').forEach(th => {
        th.addEventListener('click', () => {
            const col = th.dataset.sort;
            if (state.sortColumn === col) {
                state.sortDirection = state.sortDirection === 'asc' ? 'desc' : 'asc';
            } else {
                state.sortColumn = col;
                state.sortDirection = 'asc';
            }
            renderizarHistorico();
        });
    });
    
    // Atalhos de teclado
    document.addEventListener('keydown', (e) => {
        // ESC = limpar formulário ou fechar modais
        if (e.key === 'Escape') {
            if (Camera.isOpen) {
                Camera.close();
                modalCamera.style.display = 'none';
            }
            if (modalDuplicidade.style.display === 'flex') {
                modalDuplicidade.style.display = 'none';
            }
            if (document.activeElement && document.activeElement.closest('#tabContagem')) {
                limparFormulario();
            }
        }
        
        // Ctrl+Enter = salvar
        if (e.ctrlKey && e.key === 'Enter') {
            e.preventDefault();
            btnSalvar.click();
        }
        
        // Enter no campo quantidade = salvar
        if (e.key === 'Enter' && document.activeElement === inputQuantidade) {
            e.preventDefault();
            btnSalvar.click();
        }
    });
    
    // Online/Offline
    window.addEventListener('online', async () => {
        Utils.showToast('🌐 Conexão restaurada!', 'success');
        if (Database.supabase) {
            await syncPendingContagens();
            if (state.produtosMapCodAcesso.size === 0) {
                await carregarProdutosDoSupabase();
            }
        }
    });
    
    window.addEventListener('offline', () => {
        Utils.showToast('📱 Modo offline. Dados salvos localmente.', 'warning');
    });
    
    // ============ INICIAR APLICAÇÃO ============
    init();
    
})();