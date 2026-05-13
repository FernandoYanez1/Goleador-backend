const express = require("express");
const cors = require("cors");
const pool = require("./database.js");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;

// 1. ROTAS BÁSICAS E AUTENTICAÇÃO
app.get("/", (req, res) => {
  res.json({ mensagem: "Backend Goleador VIP rodando no PostgreSQL!" });
});

app.post("/cadastro", async (req, res) => {
  const { nome, email, cpf, telefone, senha } = req.body;
  try {
    const query = `INSERT INTO users (nome, email, cpf, telefone, senha) VALUES ($1, $2, $3, $4, $5) RETURNING id`;
    const result = await pool.query(query, [nome, email, cpf, telefone, senha]);
    res.status(201).json({ mensagem: "Usuário cadastrado com sucesso!", id_usuario: result.rows[0].id });
  } catch (err) {
    res.status(400).json({ erro: "E-mail ou CPF já utilizado." });
  }
});

app.post("/login", async (req, res) => {
  const { email, senha } = req.body;
  try {
    const result = await pool.query(`SELECT * FROM users WHERE email = $1 AND senha = $2`, [email, senha]);
    if (result.rows.length > 0) {
      const row = result.rows[0];
      res.status(200).json({ mensagem: "Login realizado!", usuario: { id: row.id, nome: row.nome, email: row.email, role: row.role }});
    } else {
      res.status(401).json({ erro: "E-mail ou senha incorretos." });
    }
  } catch (err) {
    res.status(500).json({ erro: "Erro interno no servidor." });
  }
});

// 2. GESTÃO DE RODADAS E JOGOS
app.post("/rodadas", async (req, res) => {
  try {
    const result = await pool.query(`INSERT INTO rodadas (nome, status) VALUES ($1, 'aberta') RETURNING id`, [req.body.nome]);
    res.status(201).json({ mensagem: "Rodada criada!", id: result.rows[0].id });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

app.get("/rodadas", async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM rodadas ORDER BY id DESC`);
    res.status(200).json(result.rows);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

app.put("/rodadas/:id/finalizar", async (req, res) => {
  try {
    await pool.query(`UPDATE rodadas SET status = 'finalizada' WHERE id = $1`, [req.params.id]);
    res.json({ mensagem: "Rodada finalizada!" });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

app.put("/rodadas/:id/reabrir", async (req, res) => {
  try {
    await pool.query(`UPDATE rodadas SET status = 'aberta' WHERE id = $1`, [req.params.id]);
    res.json({ mensagem: "Rodada reaberta!" });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

app.post("/cadastrar-jogo", async (req, res) => {
  const { rodada_id, time_casa, time_visitante, sigla_casa, sigla_visitante, logo_casa, logo_visitante, data_hora } = req.body;
  try {
    const query = `INSERT INTO matches (rodada_id, time_casa, time_visitante, sigla_casa, sigla_visitante, logo_casa, logo_visitante, data_hora) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`;
    await pool.query(query, [rodada_id, time_casa, time_visitante, sigla_casa, sigla_visitante, logo_casa, logo_visitante, data_hora]);
    res.status(201).json({ mensagem: "Jogo cadastrado na rodada!" });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

app.get("/jogos", async (req, res) => {
  const { rodada_id } = req.query;
  try {
    let query = `SELECT m.*, r.nome as rodada_nome, r.status as rodada_status FROM matches m JOIN rodadas r ON m.rodada_id = r.id`;
    let result;
    if (rodada_id) {
      query += ` WHERE m.rodada_id = $1`;
      result = await pool.query(query, [rodada_id]);
    } else {
      result = await pool.query(query);
    }
    res.status(200).json(result.rows);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

app.delete('/deletar-jogo/:id', async (req, res) => {
  try {
    await pool.query(`DELETE FROM matches WHERE id = $1`, [req.params.id]);
    res.status(200).json({ mensagem: "Jogo e palpites vinculados excluídos!" });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// 3. CARTELAS E APOSTAS
app.post("/apostar", async (req, res) => {
  const { usuario_id, rodada_id, apostas } = req.body;
  if (!apostas || !Array.isArray(apostas)) return res.status(400).json({ erro: "Dados inválidos." });

  try {
    // 1. Cria a cartela
    const resultCartela = await pool.query(`INSERT INTO cartelas (usuario_id, rodada_id, status_pagamento) VALUES ($1, $2, 'pendente') RETURNING id`, [usuario_id, rodada_id]);
    const cartela_id = resultCartela.rows[0].id;
    
    // 2. Prepara a query dos palpites
    const queryPalpite = `INSERT INTO predictions (cartela_id, match_id, palpite_casa, palpite_visitante, pontos_ganhos) VALUES ($1, $2, $3, $4, 0)`;
    
    // 3. O TRUQUE NINJA: Cria um "caminhão" (Promise.all) e manda todos os jogos ao mesmo tempo para o banco
    const promessas = apostas.map(aposta => 
      pool.query(queryPalpite, [cartela_id, aposta.match_id, aposta.palpite_casa, aposta.palpite_visitante])
    );
    
    // Aguarda todos os jogos serem salvos simultaneamente
    await Promise.all(promessas);

    res.status(201).json({ mensagem: "Cartela gerada com sucesso!", cartela_id });
  } catch (err) {
    res.status(500).json({ erro: "Erro ao salvar os palpites da cartela." });
  }
});

app.get("/meus-palpites/:usuario_id", async (req, res) => {
  try {
    const query = `
      SELECT c.id as cartela_id, c.status_pagamento, c.data_criacao, r.nome as rodada_nome, r.status as rodada_status,
             p.id as palpite_id, p.palpite_casa, p.palpite_visitante, p.pontos_ganhos,
             m.time_casa, m.time_visitante, m.logo_casa, m.logo_visitante, m.gols_casa, m.gols_visitante
      FROM cartelas c
      JOIN rodadas r ON c.rodada_id = r.id
      JOIN predictions p ON c.id = p.cartela_id
      JOIN matches m ON p.match_id = m.id
      WHERE c.usuario_id = $1
      ORDER BY c.id DESC, m.data_hora ASC
    `;
    const result = await pool.query(query, [req.params.usuario_id]);
    
    const cartelasAgrupadas = result.rows.reduce((acc, row) => {
      let cartela = acc.find((c) => c.cartela_id === row.cartela_id);
      if (!cartela) {
        cartela = {
          cartela_id: row.cartela_id, rodada_nome: row.rodada_nome, rodada_status: row.rodada_status,
          status_pagamento: row.status_pagamento, data_criacao: row.data_criacao, total_pontos: 0, palpites: []
        };
        acc.push(cartela);
      }
      cartela.total_pontos += (row.pontos_ganhos || 0);
      cartela.palpites.push({
        time_casa: row.time_casa, time_visitante: row.time_visitante, logo_casa: row.logo_casa, logo_visitante: row.logo_visitante,
        palpite_casa: row.palpite_casa, palpite_visitante: row.palpite_visitante, gols_casa: row.gols_casa, gols_visitante: row.gols_visitante, pontos_ganhos: row.pontos_ganhos
      });
      return acc;
    }, []);

    res.status(200).json(cartelasAgrupadas);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// 4. ADMINISTRAÇÃO E PROCESSAMENTO
app.get("/admin/cartelas", async (req, res) => {
  try {
    const query = `
      SELECT c.id, c.status_pagamento, c.data_criacao, u.nome as usuario_nome, r.nome as rodada_nome
      FROM cartelas c JOIN users u ON c.usuario_id = u.id JOIN rodadas r ON c.rodada_id = r.id ORDER BY c.id DESC
    `;
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

app.put("/aprovar-pagamento/:cartela_id", async (req, res) => {
  try {
    await pool.query(`UPDATE cartelas SET status_pagamento = $1 WHERE id = $2`, [req.body.status, req.params.cartela_id]);
    res.json({ mensagem: `Cartela atualizada!` });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

app.delete("/deletar-cartela/:id", async (req, res) => {
  try {
    await pool.query(`DELETE FROM cartelas WHERE id = $1`, [req.params.id]);
    res.json({ mensagem: "Cartela excluída!" });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

app.post("/finalizar-jogo", async (req, res) => {
  const { match_id, gols_casa, gols_visitante } = req.body;
  const realCasa = Number(gols_casa);
  const realVisitante = Number(gols_visitante);

  try {
    const query = `SELECT p.* FROM predictions p JOIN cartelas c ON p.cartela_id = c.id WHERE p.match_id = $1 AND c.status_pagamento = 'aprovado'`;
    const result = await pool.query(query, [match_id]);

    for (let p of result.rows) {
      const palpiteCasa = Number(p.palpite_casa);
      const palpiteVisitante = Number(p.palpite_visitante);
      let pontosNovos = 0;
      
      const vencedorReal = realCasa > realVisitante ? 'casa' : (realVisitante > realCasa ? 'visitante' : 'empate');
      const vencedorPalpite = palpiteCasa > palpiteVisitante ? 'casa' : (palpiteVisitante > palpiteCasa ? 'visitante' : 'empate');
      const acertouResultado = vencedorReal === vencedorPalpite;
      const acertouPlacarExato = (palpiteCasa === realCasa) && (palpiteVisitante === realVisitante);
      const acertouGolsCasa = palpiteCasa === realCasa;
      const acertouGolsVisitante = palpiteVisitante === realVisitante;
      const acertouGolsExatosPartida = (palpiteCasa + palpiteVisitante) === (realCasa + realVisitante);

      if (acertouPlacarExato) pontosNovos = 15;
      else if (acertouResultado) {
          if (vencedorReal === 'casa' || vencedorReal === 'visitante') {
              if (acertouGolsCasa || acertouGolsVisitante) pontosNovos = 10; 
              else pontosNovos = 8;
          } else pontosNovos = 8;
      } 
      else if (acertouGolsExatosPartida) pontosNovos = 3;
      else pontosNovos = 0;

      await pool.query(`UPDATE predictions SET pontos_ganhos = $1 WHERE id = $2`, [pontosNovos, p.id]);
    }
    await pool.query(`UPDATE matches SET gols_casa = $1, gols_visitante = $2 WHERE id = $3`, [realCasa, realVisitante, match_id]);
    res.json({ mensagem: "Resultado salvo!" });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

app.get("/ranking", async (req, res) => {
  try {
    const query = `
      SELECT c.id as cartela_id, u.id as usuario_id, u.nome, 
             COALESCE(SUM(p.pontos_ganhos), 0) as pontuacao_total
      FROM cartelas c
      JOIN users u ON c.usuario_id = u.id
      LEFT JOIN predictions p ON c.id = p.cartela_id
      WHERE c.status_pagamento = 'aprovado'
      GROUP BY c.id, u.id, u.nome
      ORDER BY pontuacao_total DESC, c.id ASC
    `;
    const result = await pool.query(query);
    res.status(200).json(result.rows);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

app.get("/auditoria", async (req, res) => {
  try {
    const query = `
      SELECT u.nome as usuario_nome, c.id as cartela_id, c.status_pagamento,
             m.time_casa, m.time_visitante, p.palpite_casa, p.palpite_visitante
      FROM predictions p JOIN cartelas c ON p.cartela_id = c.id JOIN users u ON c.usuario_id = u.id JOIN matches m ON p.match_id = m.id
      ORDER BY u.nome ASC, c.id ASC, m.data_hora ASC
    `;
    const result = await pool.query(query);
    res.status(200).json(result.rows);
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor rodando com PostgreSQL na porta ${PORT}`);
});