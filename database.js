const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('./bolao.db', (err) => {
    if (err) {
        console.error('Erro ao abrir o banco de dados', err.message);
    } else {
        console.log('Conectado ao banco de dados SQLite.');
    }
});

db.serialize(() => {
    // 1. Tabela de Usuários
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        cpf TEXT UNIQUE NOT NULL,
        telefone TEXT,
        senha TEXT NOT NULL,
        pontuacao_total INTEGER DEFAULT 0,
        pago INTEGER DEFAULT 0 -- <-- NOVA COLUNA AQUI
    )`);

    // 2. Tabela de Jogos (AGORA COM SIGLAS E LOGOS)
    db.run(`CREATE TABLE IF NOT EXISTS matches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        time_casa TEXT NOT NULL,
        time_visitante TEXT NOT NULL,
        sigla_casa TEXT,
        sigla_visitante TEXT,
        logo_casa TEXT,
        logo_visitante TEXT,
        gols_casa INTEGER,
        gols_visitante INTEGER,
        data_hora TEXT,
        estadio TEXT
    )`);

    // 3. Tabela de Palpites
    db.run(`CREATE TABLE IF NOT EXISTS predictions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        usuario_id INTEGER,
        match_id INTEGER,
        palpite_casa INTEGER NOT NULL,
        palpite_visitante INTEGER NOT NULL,
        pontos_ganhos INTEGER DEFAULT 0,
        FOREIGN KEY (usuario_id) REFERENCES users(id),
        FOREIGN KEY (match_id) REFERENCES matches(id)
    )`);
});

module.exports = db;