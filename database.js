const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('./bolao.db', (err) => {
  if (err) console.error('Erro ao conectar ao banco de dados:', err.message);
  else console.log('Conectado ao banco de dados SQLite.');
});

db.serialize(() => {
  // 1. Tabela de Usuários
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    senha TEXT NOT NULL,
    cpf TEXT,
    telefone TEXT,
    role TEXT DEFAULT 'user'
  )`);

  // 2. Tabela de Rodadas
  db.run(`CREATE TABLE IF NOT EXISTS rodadas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    status TEXT DEFAULT 'aberta'
  )`);

  // 3. Tabela de Partidas (Atualizada com gols oficiais e rodada)
  db.run(`CREATE TABLE IF NOT EXISTS matches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rodada_id INTEGER NOT NULL,
    time_casa TEXT NOT NULL,
    time_visitante TEXT NOT NULL,
    sigla_casa TEXT,
    sigla_visitante TEXT,
    logo_casa TEXT,
    logo_visitante TEXT,
    gols_casa INTEGER,
    gols_visitante INTEGER,
    data_hora TEXT,
    FOREIGN KEY (rodada_id) REFERENCES rodadas(id)
  )`);

  // 4. Tabela de Cartelas (Para múltiplas apostas)
  db.run(`CREATE TABLE IF NOT EXISTS cartelas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id INTEGER NOT NULL,
    rodada_id INTEGER NOT NULL,
    status_pagamento TEXT DEFAULT 'pendente',
    data_criacao DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (usuario_id) REFERENCES users(id),
    FOREIGN KEY (rodada_id) REFERENCES rodadas(id)
  )`);

  // 5. Tabela de Palpites (Atualizada com pontos_ganhos e cartela_id)
  db.run(`CREATE TABLE IF NOT EXISTS predictions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cartela_id INTEGER NOT NULL,
    match_id INTEGER NOT NULL,
    palpite_casa INTEGER NOT NULL,
    palpite_visitante INTEGER NOT NULL,
    pontos_ganhos INTEGER DEFAULT 0,
    FOREIGN KEY (cartela_id) REFERENCES cartelas(id),
    FOREIGN KEY (match_id) REFERENCES matches(id)
  )`);
});

module.exports = db;