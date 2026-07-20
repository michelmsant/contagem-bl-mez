const Auth = {
    STORAGE_KEY: 'blmez_current_user',
    USERS_KEY: 'blmez_users',
    
    MASTER_USER: {
        nome: 'Michel Marcelo',
        usuario: '5461448',
        senha: '5461448',
        role: 'master',
        dataCriacao: new Date().toISOString()
    },
    
    init() {
        let users = this.getAllUsers();
        const masterExists = users.find(u => u.usuario === this.MASTER_USER.usuario);
        if (!masterExists) {
            users.push(this.MASTER_USER);
            this.saveUsers(users);
        }
    },
    
    getAllUsers() {
        const data = localStorage.getItem(this.USERS_KEY);
        return data ? JSON.parse(data) : [];
    },
    
    saveUsers(users) {
        localStorage.setItem(this.USERS_KEY, JSON.stringify(users));
    },
    
    cadastrar(nome, usuario, senha) {
        const users = this.getAllUsers();
        if (!nome || nome.trim().length < 3) return { sucesso: false, mensagem: 'Nome deve ter pelo menos 3 caracteres.' };
        if (!usuario || usuario.trim().length < 4) return { sucesso: false, mensagem: 'Usuário deve ter pelo menos 4 caracteres.' };
        if (!senha || senha.trim().length < 4) return { sucesso: false, mensagem: 'Senha deve ter pelo menos 4 caracteres.' };
        if (users.find(u => u.usuario === usuario.trim())) return { sucesso: false, mensagem: 'Usuário já existe.' };
        
        users.push({
            nome: nome.trim(),
            usuario: usuario.trim(),
            senha: senha.trim(),
            role: 'user',
            dataCriacao: new Date().toISOString()
        });
        this.saveUsers(users);
        return { sucesso: true, mensagem: 'Cadastro realizado com sucesso!' };
    },
    
    login(usuario, senha) {
        const users = this.getAllUsers();
        const user = users.find(u => u.usuario === usuario.trim() && u.senha === senha.trim());
        if (!user) return { sucesso: false, mensagem: 'Usuário ou senha incorretos.' };
        
        const sessionData = {
            nome: user.nome,
            usuario: user.usuario,
            role: user.role,
            loginTime: new Date().toISOString()
        };
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(sessionData));
        return { sucesso: true, mensagem: `Bem-vindo, ${user.nome}!`, user: sessionData };
    },
    
    logout() {
        localStorage.removeItem(this.STORAGE_KEY);
        window.location.href = 'index.html';
    },
    
    isLoggedIn() {
        const session = localStorage.getItem(this.STORAGE_KEY);
        return session ? JSON.parse(session) : null;
    },
    
    isMaster() {
        const user = this.isLoggedIn();
        return user && user.role === 'master';
    },
    
    getCurrentUser() {
        return this.isLoggedIn();
    },
    
    checkAccess() {
        const user = this.isLoggedIn();
        if (!user) {
            window.location.href = 'index.html';
            return null;
        }
        return user;
    }
};

Auth.init();