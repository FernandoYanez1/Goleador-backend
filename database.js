const { Pool } = require('pg');

// Conecta no Neon usando o link que você vai colocar no Render
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// === A MÁGICA PARA O SERVIDOR NÃO CRASHAR ===
// Se o Neon hibernar e cortar a conexão, o Node.js captura o erro aqui em vez de desligar o servidor
pool.on('error', (err, client) => {
  console.error('Erro no banco de dados (Neon dormindo/reiniciando):', err.message);
});
// ===========================================

pool.connect((err) => {
  if (err) console.error('Erro ao conectar ao PostgreSQL:', err.stack);
  else console.log('Conectado ao banco de dados PostgreSQL (Neon) com sucesso!');
});

const initDB = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        nome VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        senha VARCHAR(255) NOT NULL,
        cpf VARCHAR(20),
        telefone VARCHAR(20),
        role VARCHAR(50) DEFAULT 'user'
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS rodadas (
        id SERIAL PRIMARY KEY,
        nome VARCHAR(255) NOT NULL,
        status VARCHAR(50) DEFAULT 'aberta'
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS matches (
        id SERIAL PRIMARY KEY,
        rodada_id INTEGER NOT NULL REFERENCES rodadas(id) ON DELETE CASCADE,
        time_casa VARCHAR(255) NOT NULL,
        time_visitante VARCHAR(255) NOT NULL,
        sigla_casa VARCHAR(10),
        sigla_visitante VARCHAR(10),
        logo_casa TEXT,
        logo_visitante TEXT,
        gols_casa INTEGER,
        gols_visitante INTEGER,
        data_hora TIMESTAMP
      )
    `);

   await pool.query(`
      CREATE TABLE IF NOT EXISTS cartelas (
        id SERIAL PRIMARY KEY,
        usuario_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        rodada_id INTEGER NOT NULL REFERENCES rodadas(id) ON DELETE CASCADE,
        status_pagamento VARCHAR(50) DEFAULT 'pendente',
        metodo_pagamento VARCHAR(50) DEFAULT 'manual',
        data_criacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS predictions (
        id SERIAL PRIMARY KEY,
        cartela_id INTEGER NOT NULL REFERENCES cartelas(id) ON DELETE CASCADE,
        match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
        palpite_casa INTEGER NOT NULL,
        palpite_visitante INTEGER NOT NULL,
        pontos_ganhos INTEGER DEFAULT 0
      )
    `);
    console.log("Tabelas PostgreSQL verificadas/criadas com sucesso.");
  } catch (err) {
    console.error("Erro ao criar tabelas:", err);
  }
};

initDB();

module.exports = pool;