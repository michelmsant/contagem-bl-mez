// ============================================================
// AUTH.JS - Sistema de autenticação e controle de acesso
// ============================================================

const Auth = {
    // Chave para localStorage
    STORAGE_KEY: 'blmez_current_user',
    USERS_KEY: 'blmez_users',
    
    // Usuário master pré-definido
    MASTER_USER: {
        nome: 'Michel Marcelo',
        usuario: '5461448',
        senha: '5461448',
        role: 'master',
        dataCriacao: new Date().toISOString()
    },
    
    // Inicializar sistema de usuários
    init() {
        // Carrega usuários salvos
        let users = this.getAllUsers();
        
        // Garante que o master sempre existe
        const masterExists = users.find(u => u.usuario === this.MASTER_USER.usuario);
        if (!masterExists) {
            users.push(this.MASTER_USER);
            this.saveUsers(users);
        }
    },
    
    // Obter todos os usuários
    getAllUsers() {
        const data = localStorage.getItem(this.USERS_KEY);
        return data ? JSON.parse(data) : [];
    },
    
    // Salvar usuários
    saveUsers(users) {
        localStorage.setItem(this.USERS_KEY, JSON.stringify(users));
    },
    
    // Cadastrar novo usuário
    cadastrar(nome, usuario, senha) {
        const users = this.getAllUsers();
        
        // Validações
        if (!nome || nome.trim().length < 3) {
            return { sucesso: false, mensagem: 'Nome deve ter pelo menos 3 caracteres.' };
        }
        if (!usuario || usuario.trim().length < 4) {
            return { sucesso: false, mensagem: 'Usuário deve ter pelo menos 4 caracteres.' };
        }
        if (!senha || senha.trim().length < 4) {
            return { sucesso: false, mensagem: 'Senha deve ter pelo menos 4 caracteres.' };
        }
        
        // Verificar se usuário já existe
        if (users.find(u => u.usuario === usuario.trim())) {
            return { sucesso: false, mensagem: 'Este nome de usuário já está em uso.' };
        }
        
        const novoUsuario = {
            nome: nome.trim(),
            usuario: usuario.trim(),
            senha: senha.trim(),
            role: 'user',
            dataCriacao: new Date().toISOString()
        };
        
        users.push(novoUsuario);
        this.saveUsers(users);
        
        return { sucesso: true, mensagem: 'Cadastro realizado com sucesso!' };
    },
    
    // Realizar login
    login(usuario, senha) {
        const users = this.getAllUsers();
        const user = users.find(u => u.usuario === usuario.trim() && u.senha === senha.trim());
        
        if (!user) {
            return { sucesso: false, mensagem: 'Usuário ou senha incorretos.' };
        }
        
        // Salvar sessão
        const sessionData = {
            nome: user.nome,
            usuario: user.usuario,
            role: user.role,
            loginTime: new Date().toISOString()
        };
        
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(sessionData));
        
        return { 
            sucesso: true, 
            mensagem: `Bem-vindo, ${user.nome}!`,
            user: sessionData
        };
    },
    
    // Logout
    logout() {
        localStorage.removeItem(this.STORAGE_KEY);
        window.location.href = 'index.html';
    },
    
    // Verificar se está logado
    isLoggedIn() {
        const session = localStorage.getItem(this.STORAGE_KEY);
        return session ? JSON.parse(session) : null;
    },
    
    // Verificar se é master
    isMaster() {
        const user = this.isLoggedIn();
        return user && user.role === 'master';
    },
    
    // Obter usuário atual
    getCurrentUser() {
        return this.isLoggedIn();
    },
    
    // Verificar acesso e redirecionar se necessário
    checkAccess() {
        const user = this.isLoggedIn();
        if (!user) {
            window.location.href = 'index.html';
            return null;
        }
        return user;
    }
};

// Inicializar ao carregar
Auth.init();