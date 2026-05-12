const express = require("express");
const cors = require("cors");
const db = require("./database.js");

const app = express();

app.use(cors());
app.use(express.json());

const PORT = 3001;

// 1. Rota de teste
app.get("/", (req, res) => {
  res.json({ mensagem: "Backend do bolão rodando 100%!" });
});

// 2. Rota para listar os jogos
app.get("/jogos", (req, res) => {
  const query = `SELECT * FROM matches`;
  db.all(query, [], (err, rows) => {
    if (err) return res.status(500).json({ erro: err.message });
    res.status(200).json(rows);
  });
});

// 3. Rota de Cadastro
app.post("/cadastro", (req, res) => {
  const { nome, email, cpf, telefone, senha } = req.body;
  const query = `INSERT INTO users (nome, email, cpf, telefone, senha) VALUES (?, ?, ?, ?, ?)`;

  db.run(query, [nome, email, cpf, telefone, senha], function (err) {
    if (err) {
      console.error(err.message);
      return res
        .status(400)
        .json({ erro: "Erro ao cadastrar. E-mail ou CPF já utilizado." });
    }
    res.status(201).json({
      mensagem: "Usuário cadastrado com sucesso!",
      id_usuario: this.lastID,
    });
  });
});

// 4. Rota de Login
app.post("/login", (req, res) => {
  const { email, senha } = req.body;
  const query = `SELECT * FROM users WHERE email = ? AND senha = ?`;

  db.get(query, [email, senha], (err, row) => {
    if (err) return res.status(500).json({ erro: "Erro interno no servidor." });

    if (row) {
      res.status(200).json({
        mensagem: "Login realizado com sucesso!",
        usuario: {
          id: row.id,
          nome: row.nome,
          email: row.email,
          pontuacao_total: row.pontuacao_total,
        },
      });
    } else {
      res.status(401).json({ erro: "E-mail ou senha incorretos." });
    }
  });
});

// 5. Rota para Salvar Apostas
app.post("/apostar", (req, res) => {
  const { apostas } = req.body;

  if (!apostas || !Array.isArray(apostas)) {
    return res.status(400).json({ erro: "Dados inválidos." });
  }

  const query = `INSERT INTO predictions (usuario_id, match_id, palpite_casa, palpite_visitante) VALUES (?, ?, ?, ?)`;

  const promises = apostas.map((aposta) => {
    return new Promise((resolve, reject) => {
      db.run(
        query,
        [
          aposta.usuario_id,
          aposta.match_id,
          aposta.palpite_casa,
          aposta.palpite_visitante,
        ],
        (err) => {
          if (err) reject(err);
          else resolve();
        },
      );
    });
  });

  Promise.all(promises)
    .then(() =>
      res.status(201).json({ mensagem: "Apostas salvas com sucesso!" }),
    )
    .catch((err) => {
      console.error(err);
      res.status(500).json({ erro: "Erro ao salvar uma ou mais apostas." });
    });
});

// 6. LISTAR PALPITES DE UM USUÁRIO ESPECÍFICO (PARA A TELA 'MEUS PALPITES')
app.get("/meus-palpites/:usuario_id", (req, res) => {
  const { usuario_id } = req.params;

  const query = `
        SELECT 
            p.id, 
            p.palpite_casa, 
            p.palpite_visitante, 
            p.pontos_ganhos,
            m.time_casa, 
            m.time_visitante, 
            m.sigla_casa, 
            m.sigla_visitante, 
            m.logo_casa, 
            m.logo_visitante, 
            m.data_hora,
            m.gols_casa AS resultado_real_casa,
            m.gols_visitante AS resultado_real_visitante
        FROM predictions p
        JOIN matches m ON p.match_id = m.id
        WHERE p.usuario_id = ?
    `;

  db.all(query, [usuario_id], (err, rows) => {
    if (err) return res.status(500).json({ erro: err.message });
    res.status(200).json(rows);
  });
});

// 7. SALVAR RESULTADO E CALCULAR PONTOS (100% à prova de falhas de tipo)
app.post("/finalizar-jogo", (req, res) => {
    const { match_id, gols_casa, gols_visitante } = req.body;

    // Força os gols oficiais a serem Números puros
    const realCasa = Number(gols_casa);
    const realVisitante = Number(gols_visitante);

    db.all(`SELECT * FROM predictions WHERE match_id = ?`, [match_id], (err, palpites) => {
        if (err) return res.status(500).json({ erro: err.message });

        palpites.forEach((p) => {
            // Força os palpites a serem Números puros
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

            // APLICANDO AS REGRAS DA TABELA
            if (acertouPlacarExato) {
                pontosNovos = 15;
            } 
            else if (acertouResultado) {
                if (vencedorReal === 'casa' || vencedorReal === 'visitante') {
                    // Acertou os gols de UM dos times (Vencedor ou Perdedor)
                    if (acertouGolsCasa || acertouGolsVisitante) pontosNovos = 10; 
                    else pontosNovos = 8; // Só o resultado
                } else {
                    pontosNovos = 8; // Empate sem placar exato
                }
            } 
            else if (acertouGolsExatosPartida) {
                pontosNovos = 3;
            } 
            else {
                pontosNovos = 0;
            }

            // Atualiza os pontos da aposta e depois faz a "Auto-Cura" do usuário
            db.run(`UPDATE predictions SET pontos_ganhos = ? WHERE id = ?`, [pontosNovos, p.id], () => {
                // Soma TODOS os pontos do usuário do zero para nunca mais haver divergência
                db.get(`SELECT SUM(pontos_ganhos) as total FROM predictions WHERE usuario_id = ?`, [p.usuario_id], (err, row) => {
                    const pontuacaoCorrigida = row ? (row.total || 0) : 0;
                    db.run(`UPDATE users SET pontuacao_total = ? WHERE id = ?`, [pontuacaoCorrigida, p.usuario_id]);
                });
            });
        });

        // Salva os gols oficiais na partida
        db.run(`UPDATE matches SET gols_casa = ?, gols_visitante = ? WHERE id = ?`, 
            [realCasa, realVisitante, match_id], (err) => {
            if (err) return res.status(500).json({ erro: err.message });
            res.json({ mensagem: "Resultado salvo e regras de pontuação aplicadas!" });
        });
    });
});

// ROTA: DESFAZER O RESULTADO DE UM JOGO (Também com auto-cura)
app.post("/desfazer-resultado", (req, res) => {
    const { match_id } = req.body;

    db.all(`SELECT id, usuario_id FROM predictions WHERE match_id = ?`, [match_id], (err, palpites) => {
        if (err) return res.status(500).json({ erro: err.message });

        palpites.forEach(p => {
            // Zera os pontos da aposta desfeita e recalcula o total do usuário
            db.run(`UPDATE predictions SET pontos_ganhos = 0 WHERE id = ?`, [p.id], () => {
                db.get(`SELECT SUM(pontos_ganhos) as total FROM predictions WHERE usuario_id = ?`, [p.usuario_id], (err, row) => {
                    const pontuacaoCorrigida = row ? (row.total || 0) : 0;
                    db.run(`UPDATE users SET pontuacao_total = ? WHERE id = ?`, [pontuacaoCorrigida, p.usuario_id]);
                });
            });
        });

        db.run(`UPDATE matches SET gols_casa = NULL, gols_visitante = NULL WHERE id = ?`, [match_id], (err) => {
            if (err) return res.status(500).json({ erro: err.message });
            res.json({ mensagem: "Placar excluído e pontos revertidos!" });
        });
    });
});

// 8. CADASTRAR NOVO JOGO
app.post("/cadastrar-jogo", (req, res) => {
  const { time_casa, time_visitante, sigla_casa, sigla_visitante, logo_casa, logo_visitante, data_hora } = req.body;
  const query = `INSERT INTO matches (time_casa, time_visitante, sigla_casa, sigla_visitante, logo_casa, logo_visitante, data_hora) VALUES (?, ?, ?, ?, ?, ?, ?)`;
  db.run(query, [time_casa, time_visitante, sigla_casa, sigla_visitante, logo_casa, logo_visitante, data_hora], (err) => {
      if (err) return res.status(500).json({ erro: err.message });
      res.status(201).json({ mensagem: "Jogo cadastrado com sucesso!" });
  });
});

// 9. LISTAR USUÁRIOS COM PALPITES (AGRUPADO PARA O ADMIN)
app.get('/todos-palpites', (req, res) => {
    const sql = `
        SELECT 
            u.id as usuario_id, 
            u.nome as nome_usuario, 
            u.email,
            u.pago, -- <-- ADICIONADO AQUI
            COUNT(p.id) as total_palpites
        FROM users u
        LEFT JOIN predictions p ON u.id = p.usuario_id
        GROUP BY u.id
        ORDER BY u.nome ASC`;
    
    db.all(sql, [], (err, rows) => {
        if (err) return res.status(500).json([]); 
        res.json(rows);
    });
});

// 10. DELETAR TODOS OS PALPITES DE UM USUÁRIO
app.delete('/deletar-palpites-usuario/:usuario_id', (req, res) => {
    const { usuario_id } = req.params;
    db.run('DELETE FROM predictions WHERE usuario_id = ?', [usuario_id], function(err) {
        if (err) return res.status(500).json({ erro: err.message });
        res.json({ mensagem: "Todos os palpites excluídos", quantidade: this.changes });
    });
});

// 11. DELETAR JOGO
app.delete('/deletar-jogo/:id', (req, res) => {
  const { id } = req.params;
  db.run(`DELETE FROM matches WHERE id = ?`, [id], (err) => {
      if (err) return res.status(500).json({ erro: err.message });
      db.run(`DELETE FROM predictions WHERE match_id = ?`, [id]);
      res.status(200).json({ mensagem: "Jogo excluído!" });
  });
});

// 12. CONTROLE DE RODADA
let dataLimiteGlobal = null; 
app.post('/config/prazo', (req, res) => {
  dataLimiteGlobal = req.body.prazo;
  res.json({ mensagem: "Prazo atualizado!", prazo: dataLimiteGlobal });
});
app.get('/config/prazo', (req, res) => {
  res.json({ prazo: dataLimiteGlobal });
});

// 13. RANKING
app.get("/ranking", (req, res) => {
  const query = `SELECT id, nome, pontuacao_total, pago FROM users ORDER BY pontuacao_total DESC`;
  db.all(query, [], (err, rows) => {
    if (err) return res.status(500).json({ erro: err.message });
    res.status(200).json(rows);
  });
});

// --- APROVAR OU CANCELAR PAGAMENTO DO USUÁRIO ---
app.put('/aprovar-pagamento/:id', (req, res) => {
    const { pago } = req.body;
    db.run('UPDATE users SET pago = ? WHERE id = ?', [pago ? 1 : 0, req.params.id], (err) => {
        if (err) return res.status(500).json({ erro: err.message });
        res.json({ mensagem: "Status de pagamento atualizado!" });
    });
});

// --- ROTA DE AUDITORIA (GERAÇÃO DE PDF) ---
app.get("/auditoria", (req, res) => {
    const query = `
        SELECT 
            u.nome as usuario_nome,
            m.time_casa, m.time_visitante,
            p.palpite_casa, p.palpite_visitante
        FROM predictions p
        JOIN users u ON p.usuario_id = u.id
        JOIN matches m ON p.match_id = m.id
        ORDER BY u.nome ASC, m.data_hora ASC
    `;
    db.all(query, [], (err, rows) => {
        if (err) return res.status(500).json({ erro: err.message });
        res.status(200).json(rows);
    });
});

app.listen(PORT, () => {
  console.log(`Servidor rodando com sucesso na porta ${PORT}`);
});