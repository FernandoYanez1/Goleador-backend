const express = require("express");
const cors = require("cors");
const db = require("./database.js");

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;

// ==========================================
// 1. ROTAS BÁSICAS E AUTENTICAÇÃO
// ==========================================

app.get("/", (req, res) => {
  res.json({ mensagem: "Backend Goleador VIP rodando com Cartelas e Rodadas!" });
});

app.post("/cadastro", (req, res) => {
  const { nome, email, cpf, telefone, senha } = req.body;
  const query = `INSERT INTO users (nome, email, cpf, telefone, senha) VALUES (?, ?, ?, ?, ?)`;

  db.run(query, [nome, email, cpf, telefone, senha], function (err) {
    if (err) return res.status(400).json({ erro: "E-mail ou CPF já utilizado." });
    res.status(201).json({ mensagem: "Usuário cadastrado com sucesso!", id_usuario: this.lastID });
  });
});

app.post("/login", (req, res) => {
  const { email, senha } = req.body;
  db.get(`SELECT * FROM users WHERE email = ? AND senha = ?`, [email, senha], (err, row) => {
    if (err) return res.status(500).json({ erro: "Erro interno no servidor." });
    if (row) {
      res.status(200).json({
        mensagem: "Login realizado!",
        usuario: { id: row.id, nome: row.nome, email: row.email, role: row.role },
      });
    } else {
      res.status(401).json({ erro: "E-mail ou senha incorretos." });
    }
  });
});

// ==========================================
// 2. GESTÃO DE RODADAS E JOGOS
// ==========================================

// Criar nova rodada (Admin)
app.post("/rodadas", (req, res) => {
  const { nome } = req.body;
  db.run(`INSERT INTO rodadas (nome, status) VALUES (?, 'aberta')`, [nome], function(err) {
    if (err) return res.status(500).json({ erro: err.message });
    res.status(201).json({ mensagem: "Rodada criada!", id: this.lastID });
  });
});

// Listar todas as rodadas
app.get("/rodadas", (req, res) => {
  db.all(`SELECT * FROM rodadas ORDER BY id DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ erro: err.message });
    res.status(200).json(rows);
  });
});

// Finalizar Rodada (Admin)
app.put("/rodadas/:id/finalizar", (req, res) => {
  db.run(`UPDATE rodadas SET status = 'finalizada' WHERE id = ?`, [req.params.id], (err) => {
    if (err) return res.status(500).json({ erro: err.message });
    res.json({ mensagem: "Rodada finalizada! Enviada para o histórico." });
  });
});

// Reabrir Rodada (Admin)
app.put("/rodadas/:id/reabrir", (req, res) => {
  db.run(`UPDATE rodadas SET status = 'aberta' WHERE id = ?`, [req.params.id], (err) => {
    if (err) return res.status(500).json({ erro: err.message });
    res.json({ mensagem: "Rodada reaberta! Apostas liberadas." });
  });
});

// Cadastrar jogo vinculado a uma rodada
app.post("/cadastrar-jogo", (req, res) => {
  const { rodada_id, time_casa, time_visitante, sigla_casa, sigla_visitante, logo_casa, logo_visitante, data_hora } = req.body;
  const query = `INSERT INTO matches (rodada_id, time_casa, time_visitante, sigla_casa, sigla_visitante, logo_casa, logo_visitante, data_hora) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
  db.run(query, [rodada_id, time_casa, time_visitante, sigla_casa, sigla_visitante, logo_casa, logo_visitante, data_hora], (err) => {
      if (err) return res.status(500).json({ erro: err.message });
      res.status(201).json({ mensagem: "Jogo cadastrado na rodada!" });
  });
});

// Listar jogos (pode filtrar por rodada se passar ?rodada_id=X na URL)
app.get("/jogos", (req, res) => {
  const { rodada_id } = req.query;
  let query = `SELECT m.*, r.nome as rodada_nome, r.status as rodada_status FROM matches m JOIN rodadas r ON m.rodada_id = r.id`;
  let params = [];

  if (rodada_id) {
    query += ` WHERE m.rodada_id = ?`;
    params.push(rodada_id);
  }

  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ erro: err.message });
    res.status(200).json(rows);
  });
});

app.delete('/deletar-jogo/:id', (req, res) => {
  db.run(`DELETE FROM matches WHERE id = ?`, [req.params.id], (err) => {
      if (err) return res.status(500).json({ erro: err.message });
      db.run(`DELETE FROM predictions WHERE match_id = ?`, [req.params.id]);
      res.status(200).json({ mensagem: "Jogo e palpites vinculados excluídos!" });
  });
});

// ==========================================
// 3. CARTELAS E APOSTAS (O NOVO CORAÇÃO DO SISTEMA)
// ==========================================

// Usuário envia palpites (Gera uma Cartela)
app.post("/apostar", (req, res) => {
  const { usuario_id, rodada_id, apostas } = req.body;

  if (!apostas || !Array.isArray(apostas)) return res.status(400).json({ erro: "Dados inválidos." });

  // 1. Cria a cartela pendente
  db.run(`INSERT INTO cartelas (usuario_id, rodada_id, status_pagamento) VALUES (?, ?, 'pendente')`, [usuario_id, rodada_id], function(err) {
    if (err) return res.status(500).json({ erro: "Erro ao criar cartela." });
    
    const cartela_id = this.lastID;
    const queryPalpite = `INSERT INTO predictions (cartela_id, match_id, palpite_casa, palpite_visitante, pontos_ganhos) VALUES (?, ?, ?, ?, 0)`;
    
    // 2. Salva todos os palpites vinculados a esta cartela
    const promises = apostas.map((aposta) => {
      return new Promise((resolve, reject) => {
        db.run(queryPalpite, [cartela_id, aposta.match_id, aposta.palpite_casa, aposta.palpite_visitante], (err) => {
          if (err) reject(err); else resolve();
        });
      });
    });

    Promise.all(promises)
      .then(() => res.status(201).json({ mensagem: "Cartela gerada com sucesso! Aguardando pagamento.", cartela_id }))
      .catch((err) => res.status(500).json({ erro: "Erro ao salvar os palpites da cartela." }));
  });
});

// Listar todas as cartelas de um usuário (Histórico e Ativas)
app.get("/meus-palpites/:usuario_id", (req, res) => {
  const { usuario_id } = req.params;
  const query = `
    SELECT 
      c.id as cartela_id, c.status_pagamento, c.data_criacao,
      r.nome as rodada_nome, r.status as rodada_status,
      p.id as palpite_id, p.palpite_casa, p.palpite_visitante, p.pontos_ganhos,
      m.time_casa, m.time_visitante, m.logo_casa, m.logo_visitante, m.gols_casa, m.gols_visitante
    FROM cartelas c
    JOIN rodadas r ON c.rodada_id = r.id
    JOIN predictions p ON c.id = p.cartela_id
    JOIN matches m ON p.match_id = m.id
    WHERE c.usuario_id = ?
    ORDER BY c.id DESC, m.data_hora ASC
  `;

  db.all(query, [usuario_id], (err, rows) => {
    if (err) return res.status(500).json({ erro: err.message });
    
    // Agrupa os palpites por cartela para o frontend exibir mais fácil
    const cartelasAgrupadas = rows.reduce((acc, row) => {
      let cartela = acc.find(c => c.cartela_id === row.cartela_id);
      if (!cartela) {
        cartela = {
          cartela_id: row.cartela_id, rodada_nome: row.rodada_nome, rodada_status: row.rodada_status,
          status_pagamento: row.status_pagamento, data_criacao: row.data_criacao,
          total_pontos: 0, palpites: []
        };
        acc.push(cartela);
      }
      cartela.total_pontos += (row.pontos_ganhos || 0);
      cartela.palpites.push({
        time_casa: row.time_casa, time_visitante: row.time_visitante,
        logo_casa: row.logo_casa, logo_visitante: row.logo_visitante,
        palpite_casa: row.palpite_casa, palpite_visitante: row.palpite_visitante,
        gols_casa: row.gols_casa, gols_visitante: row.gols_visitante, pontos_ganhos: row.pontos_ganhos
      });
      return acc;
    }, []);

    res.status(200).json(cartelasAgrupadas);
  });
});

// ==========================================
// 4. ADMINISTRAÇÃO E PAGAMENTOS
// ==========================================

// Listar todas as cartelas para o Admin aprovar
app.get("/admin/cartelas", (req, res) => {
  const query = `
    SELECT c.id, c.status_pagamento, c.data_criacao, u.nome as usuario_nome, r.nome as rodada_nome
    FROM cartelas c
    JOIN users u ON c.usuario_id = u.id
    JOIN rodadas r ON c.rodada_id = r.id
    ORDER BY c.id DESC
  `;
  db.all(query, [], (err, rows) => {
    if (err) return res.status(500).json({ erro: err.message });
    res.json(rows);
  });
});

// Aprovar/Reprovar Cartela
app.put("/aprovar-pagamento/:cartela_id", (req, res) => {
  const { status } = req.body; // 'aprovado' ou 'pendente'
  db.run(`UPDATE cartelas SET status_pagamento = ? WHERE id = ?`, [status, req.params.cartela_id], (err) => {
    if (err) return res.status(500).json({ erro: err.message });
    res.json({ mensagem: `Cartela atualizada para: ${status}` });
  });
});

// ==========================================
// 5. PROCESSAMENTO DE RESULTADOS E PONTOS
// ==========================================

app.post("/finalizar-jogo", (req, res) => {
  const { match_id, gols_casa, gols_visitante } = req.body;
  const realCasa = Number(gols_casa);
  const realVisitante = Number(gols_visitante);

  // Seleciona palpites SOMENTE de cartelas aprovadas
  const query = `
    SELECT p.* FROM predictions p 
    JOIN cartelas c ON p.cartela_id = c.id 
    WHERE p.match_id = ? AND c.status_pagamento = 'aprovado'
  `;

  db.all(query, [match_id], (err, palpites) => {
      if (err) return res.status(500).json({ erro: err.message });

      palpites.forEach((p) => {
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

          db.run(`UPDATE predictions SET pontos_ganhos = ? WHERE id = ?`, [pontosNovos, p.id]);
      });

      db.run(`UPDATE matches SET gols_casa = ?, gols_visitante = ? WHERE id = ?`, [realCasa, realVisitante, match_id], (err) => {
          if (err) return res.status(500).json({ erro: err.message });
          res.json({ mensagem: "Resultado salvo e pontos distribuídos para cartelas aprovadas!" });
      });
  });
});

// ==========================================
// 6. RANKING DINÂMICO E AUDITORIA
// ==========================================

// Calcula o Ranking somando pontos apenas de cartelas aprovadas
app.get("/ranking", (req, res) => {
  const query = `
    SELECT u.id, u.nome, COALESCE(SUM(p.pontos_ganhos), 0) as pontuacao_total
    FROM users u
    LEFT JOIN cartelas c ON u.id = c.usuario_id AND c.status_pagamento = 'aprovado'
    LEFT JOIN predictions p ON c.id = p.cartela_id
    GROUP BY u.id
    ORDER BY pontuacao_total DESC
  `;
  db.all(query, [], (err, rows) => {
    if (err) return res.status(500).json({ erro: err.message });
    res.status(200).json(rows);
  });
});

app.get("/auditoria", (req, res) => {
  const query = `
      SELECT u.nome as usuario_nome, c.id as cartela_id, c.status_pagamento,
             m.time_casa, m.time_visitante, p.palpite_casa, p.palpite_visitante
      FROM predictions p
      JOIN cartelas c ON p.cartela_id = c.id
      JOIN users u ON c.usuario_id = u.id
      JOIN matches m ON p.match_id = m.id
      ORDER BY u.nome ASC, c.id ASC, m.data_hora ASC
  `;
  db.all(query, [], (err, rows) => {
      if (err) return res.status(500).json({ erro: err.message });
      res.status(200).json(rows);
  });
});

app.listen(PORT, () => {
  console.log(`Servidor rodando com sucesso na porta ${PORT}`);
});

// Excluir Cartela (Admin)
app.delete("/deletar-cartela/:id", (req, res) => {
  const { id } = req.params;
  // Primeiro deleta os palpites vinculados para não dar erro de banco de dados
  db.run(`DELETE FROM predictions WHERE cartela_id = ?`, [id], (err) => {
    if (err) return res.status(500).json({ erro: err.message });
    // Depois deleta a cartela
    db.run(`DELETE FROM cartelas WHERE id = ?`, [id], (err2) => {
      if (err2) return res.status(500).json({ erro: err2.message });
      res.json({ mensagem: "Cartela e palpites excluídos com sucesso!" });
    });
  });
});