const express = require("express");
const cors = require("cors");
const pool = require("./database.js");
const { MercadoPagoConfig, Payment } = require('mercadopago');
const bcrypt = require('bcrypt');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;
const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });

app.get("/", (req, res) => {
    res.json({ mensagem: "Backend Goleador VIP rodando no PostgreSQL com MP!" });
});

// ==========================================
// 1. AUTENTICAÇÃO E USUÁRIOS
// ==========================================
app.post("/cadastro", async (req, res) => {
    const { nome, email, cpf, telefone, senha } = req.body;
    try {
        const senhaCriptografada = await bcrypt.hash(senha, 10);
        const query = `INSERT INTO users (nome, email, cpf, telefone, senha) VALUES ($1, $2, $3, $4, $5) RETURNING id`;
        const result = await pool.query(query, [nome, email, cpf, telefone, senhaCriptografada]);
        res.status(201).json({ mensagem: "Usuário cadastrado com sucesso!", id_usuario: result.rows[0].id });
    } catch (err) {
        res.status(400).json({ erro: "E-mail ou CPF já utilizado." });
    }
});

app.post("/login", async (req, res) => {
    const { email, senha } = req.body;
    try {
        const result = await pool.query(`SELECT * FROM users WHERE email = $1`, [email]);
        if (result.rows.length > 0) {
            const row = result.rows[0];
            const senhaValida = await bcrypt.compare(senha, row.senha);
            if (senhaValida) {
                res.status(200).json({ mensagem: "Login realizado!", usuario: { id: row.id, nome: row.nome, email: row.email, role: row.role }});
            } else {
                res.status(401).json({ erro: "E-mail ou senha incorretos." });
            }
        } else {
            res.status(401).json({ erro: "E-mail ou senha incorretos." });
        }
    } catch (err) {
        res.status(500).json({ erro: "Erro interno no servidor." });
    }
});

app.put("/resetar-senha", async (req, res) => {
    const { email, cpf, novaSenha } = req.body;
    try {
        const userCheck = await pool.query(`SELECT id FROM users WHERE email = $1 AND cpf = $2`, [email, cpf]);
        if (userCheck.rows.length === 0) return res.status(400).json({ erro: "E-mail ou CPF incorretos. Verifique os dados e tente novamente." });
        
        const senhaCriptografada = await bcrypt.hash(novaSenha, 10);
        await pool.query(`UPDATE users SET senha = $1 WHERE id = $2`, [senhaCriptografada, userCheck.rows[0].id]);
        res.status(200).json({ mensagem: "Senha alterada com sucesso! Você já pode fazer login." });
    } catch (err) {
        res.status(500).json({ erro: "Erro ao tentar redefinir a senha no servidor." });
    }
});

// ==========================================
// 2. PAÍSES E SELEÇÕES (TEAMS)
// ==========================================
app.post("/teams", async (req, res) => {

    const {
        nome,
        sigla,
        bandeira,
        pais,
        cor_primaria,
        cor_secundaria
    } = req.body;

    try {

        const query = `
            INSERT INTO teams (
                nome,
                sigla,
                bandeira,
                pais,
                cor_primaria,
                cor_secundaria
            )
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id
        `;

        const result = await pool.query(query, [
            nome,
            sigla.toUpperCase(),
            bandeira,
            pais || null,
            cor_primaria || null,
            cor_secundaria || null
        ]);

        res.status(201).json({
            mensagem: "Time cadastrado com sucesso!",
            id: result.rows[0].id
        });

    } catch (err) {

        res.status(400).json({
            erro: "Erro ao cadastrar time."
        });

    }
});

app.get("/teams", async (req, res) => {
    try {
        const result = await pool.query(`SELECT * FROM teams ORDER BY nome ASC`);
        res.status(200).json(result.rows);
    } catch (err) {
        res.status(500).json({ erro: "Erro ao buscar a lista de seleções no servidor." });
    }
});

// ==========================================
// 3. GESTÃO DE RODADAS E JOGOS
// ==========================================
app.post("/rodadas", async (req, res) => {
    try {
        const { nome, preco, tipo } = req.body;
        const precoReal = preco || 20.00;
        const tipoReal = tipo || 'placares';
        const result = await pool.query(`INSERT INTO rodadas (nome, status, preco, tipo) VALUES ($1, 'rascunho', $2, $3) RETURNING id`, [nome, precoReal, tipoReal]);
        res.status(201).json({ mensagem: "Rodada criada como rascunho!", id: result.rows[0].id });
    } catch (err) {
        res.status(500).json({ erro: err.message });
    }
});

// Lista Pública: Só mostra o que NÃO for arquivado
app.get("/rodadas", async (req, res) => {
    try {
        const result = await pool.query(`SELECT * FROM rodadas WHERE status != 'arquivada' ORDER BY id DESC`);
        res.status(200).json(result.rows);
    } catch (err) {
        res.status(500).json({ erro: err.message });
    }
});

// Lista Admin: Mostra TUDO
app.get("/admin/rodadas-todas", async (req, res) => {
    try {
        const result = await pool.query(`SELECT * FROM rodadas ORDER BY id DESC`);
        res.status(200).json(result.rows);
    } catch (err) {
        res.status(500).json({ erro: err.message });
    }
});

app.put("/rodadas/:id/status", async (req, res) => {
    try {
        await pool.query(`UPDATE rodadas SET status = $1 WHERE id = $2`, [req.body.status, req.params.id]);
        res.json({ mensagem: `Status atualizado para ${req.body.status}!` });
    } catch (err) {
        res.status(500).json({ erro: err.message });
    }
});

// ==========================================
// NOVO FLUXO DE STATUS DAS RODADAS
// ==========================================

// Abrir Rodada
app.put("/rodadas/:id/abrir", async (req, res) => {
    try {
        await pool.query(
            `UPDATE rodadas 
             SET status = 'aberta'
             WHERE id = $1`,
            [req.params.id]
        );

        res.json({
            sucesso: true,
            mensagem: "Rodada aberta com sucesso!"
        });
    } catch (err) {
        res.status(500).json({ erro: err.message });
    }
});

// Pausar Rodada
app.put("/rodadas/:id/pausar", async (req, res) => {
    try {
        await pool.query(
            `UPDATE rodadas 
             SET status = 'pausada'
             WHERE id = $1`,
            [req.params.id]
        );

        res.json({
            sucesso: true,
            mensagem: "Apostas pausadas!"
        });
    } catch (err) {
        res.status(500).json({ erro: err.message });
    }
});

// Reabrir Rodada
app.put("/rodadas/:id/reabrir", async (req, res) => {
    try {
        await pool.query(
            `UPDATE rodadas 
             SET status = 'aberta'
             WHERE id = $1`,
            [req.params.id]
        );

        res.json({
            sucesso: true,
            mensagem: "Apostas reabertas!"
        });
    } catch (err) {
        res.status(500).json({ erro: err.message });
    }
});

// Encerrar Rodada
app.put("/rodadas/:id/encerrar", async (req, res) => {
    try {
        await pool.query(
            `UPDATE rodadas 
             SET 
                status = 'encerrada',
                encerrada_em = NOW()
             WHERE id = $1`,
            [req.params.id]
        );

        res.json({
            sucesso: true,
            mensagem: "Rodada encerrada!"
        });
    } catch (err) {
        res.status(500).json({ erro: err.message });
    }
});

// Arquivar Rodada
app.put("/rodadas/:id/arquivar", async (req, res) => {
    try {
        await pool.query(
            `UPDATE rodadas 
             SET status = 'arquivada'
             WHERE id = $1`,
            [req.params.id]
        );

        res.json({
            sucesso: true,
            mensagem: "Rodada arquivada!"
        });
    } catch (err) {
        res.status(500).json({ erro: err.message });
    }
});

app.put('/admin/definir-ranking', async (req, res) => {
    const { rodada_id, fixado = true } = req.body;

    try {
        await pool.query(
            `
            UPDATE rodadas
            SET fixado_ranking = $1
            WHERE id = $2
            `,
            [fixado, rodada_id]
        );

        res.status(200).json({
            sucesso: true,
            mensagem: fixado
                ? "Ranking fixado!"
                : "Ranking removido!"
        });

    } catch (error) {
        res.status(500).json({
            erro: "Erro ao atualizar ranking."
        });
    }
});

// Buscar rankings fixados
app.get('/rankings-fixados', async (req, res) => {
    try {

        const result = await pool.query(`
            SELECT *
            FROM rodadas
            WHERE fixado_ranking = true
              AND status != 'arquivada'
            ORDER BY ordem_ranking ASC, id DESC
        `);

        res.status(200).json(result.rows);

    } catch (err) {
        res.status(500).json({
            erro: err.message
        });
    }
});

app.post("/cadastrar-jogo", async (req, res) => {

    const {
        rodada_id,
        time_casa_id,
        time_visitante_id,
        data_hora
    } = req.body;

    try {

        const timeCasa = await pool.query(
            `SELECT * FROM teams WHERE id = $1`,
            [time_casa_id]
        );

        const timeVisitante = await pool.query(
            `SELECT * FROM teams WHERE id = $1`,
            [time_visitante_id]
        );

        if (
            timeCasa.rows.length === 0 ||
            timeVisitante.rows.length === 0
        ) {
            return res.status(400).json({
                erro: "Times inválidos."
            });
        }

        const casa = timeCasa.rows[0];
        const visitante = timeVisitante.rows[0];

        const query = `
            INSERT INTO matches (
                rodada_id,

                time_casa_id,
                time_visitante_id,

                time_casa,
                time_visitante,

                sigla_casa,
                sigla_visitante,

                logo_casa,
                logo_visitante,

                data_hora,
                status
            )
            VALUES (
                $1,
                $2,
                $3,
                $4,
                $5,
                $6,
                $7,
                $8,
                $9,
                $10,
                'agendado'
            )
        `;

        await pool.query(query, [
            rodada_id,

            casa.id,
            visitante.id,

            casa.nome,
            visitante.nome,

            casa.sigla,
            visitante.sigla,

            casa.bandeira,
            visitante.bandeira,

            data_hora
        ]);

        res.status(201).json({
            sucesso: true,
            mensagem: "Jogo cadastrado!"
        });

    } catch (err) {

        res.status(500).json({
            erro: err.message
        });

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

// ==========================================
// 4. APOSTAS E PAGAMENTOS (MERCADO PAGO)
// ==========================================
app.post("/apostar", async (req, res) => {
    const { usuario_id, rodada_id, apostas, palpite_campeao } = req.body;
    
    if ((!apostas || !Array.isArray(apostas)) && !palpite_campeao) return res.status(400).json({ erro: "Dados inválidos." });

    try {
        const userResult = await pool.query(`SELECT nome, email, cpf FROM users WHERE id = $1`, [usuario_id]);
        const userData = userResult.rows[0];

        const rodadaResult = await pool.query(`SELECT nome, preco, tipo FROM rodadas WHERE id = $1`, [rodada_id]);
        const rodadaData = rodadaResult.rows[0];
        const precoRodada = Number(rodadaData.preco) || 20.00;

        const numResult = await pool.query(`SELECT COALESCE(MAX(numero_bilhete), 0) + 1 AS prox FROM cartelas WHERE rodada_id = $1`, [rodada_id]);
        const numero_bilhete = numResult.rows[0].prox;

        const resultCartela = await pool.query(
            `INSERT INTO cartelas (usuario_id, rodada_id, status_pagamento, metodo_pagamento, numero_bilhete) VALUES ($1, $2, 'pendente', 'mercadopago', $3) RETURNING id`, 
            [usuario_id, rodada_id, numero_bilhete]
        );
        const cartela_id = resultCartela.rows[0].id;
        
        if (rodadaData.tipo === 'campeao' && palpite_campeao) {
            await pool.query(`INSERT INTO predictions (cartela_id, palpite_texto, pontos_ganhos) VALUES ($1, $2, 0)`, [cartela_id, palpite_campeao]);
        } else {
            const queryPalpite = `INSERT INTO predictions (cartela_id, match_id, palpite_casa, palpite_visitante, pontos_ganhos) VALUES ($1, $2, $3, $4, 0)`;
            const promessas = apostas.map(aposta => pool.query(queryPalpite, [cartela_id, aposta.match_id, aposta.palpite_casa, aposta.palpite_visitante]));
            await Promise.all(promessas);
        }

        const payment = new Payment(client);
        const pixResponse = await payment.create({
            body: {
                transaction_amount: precoRodada,
                description: `Cartela #${numero_bilhete} (${rodadaData.nome}) - Goleador VIP`,
                payment_method_id: 'pix',
                payer: {
                    email: userData.email,
                    first_name: userData.nome,
                    identification: { type: 'CPF', number: userData.cpf || '00000000000' }
                },
                external_reference: cartela_id.toString(), 
                notification_url: `${process.env.BACKEND_URL}/webhook/mercadopago` 
            }
        });

        res.status(201).json({ 
            mensagem: "Cartela e PIX gerados com sucesso!", 
            cartela_id,
            pix_copia_cola: pixResponse.point_of_interaction.transaction_data.qr_code,
            qr_code_base64: pixResponse.point_of_interaction.transaction_data.qr_code_base64
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ erro: "Erro ao gerar a cartela ou PIX." });
    }
});

app.post("/webhook/mercadopago", async (req, res) => {
    const { action, data } = req.body;
    if (action === "payment.updated" || action === "payment.created") {
        try {
            const paymentId = data.id;
            const paymentInfo = await new Payment(client).get({ id: paymentId });
            if (paymentInfo.status === "approved") {
                const cartelaId = paymentInfo.external_reference;
                await pool.query(`UPDATE cartelas SET status_pagamento = 'aprovado' WHERE id = $1`, [cartelaId]);
            }
        } catch (err) {
            console.error("Erro no Webhook do MP:", err);
        }
    }
    res.status(200).send("OK");
});

// ==========================================
// 5. PAINEL ADMIN E CONSULTAS
// ==========================================
app.get("/admin/cartelas", async (req, res) => {
    try {
        const query = `SELECT c.id, c.numero_bilhete, c.status_pagamento, c.metodo_pagamento, c.data_criacao, u.nome as usuario_nome, r.nome as rodada_nome FROM cartelas c JOIN users u ON c.usuario_id = u.id JOIN rodadas r ON c.rodada_id = r.id ORDER BY c.id DESC`;
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

app.get("/meus-palpites/:usuario_id", async (req, res) => {
    try {
        const query = `
            SELECT c.id as cartela_id, c.numero_bilhete, c.status_pagamento, c.data_criacao, r.nome as rodada_nome, r.status as rodada_status, r.tipo as rodada_tipo,
                   p.id as palpite_id, p.palpite_casa, p.palpite_visitante, p.pontos_ganhos, p.palpite_texto,
                   m.time_casa, m.time_visitante, m.logo_casa, m.logo_visitante, m.gols_casa, m.gols_visitante, m.data_hora
            FROM cartelas c
            JOIN rodadas r ON c.rodada_id = r.id
            JOIN predictions p ON c.id = p.cartela_id
            LEFT JOIN matches m ON p.match_id = m.id
            WHERE c.usuario_id = $1 AND r.status != 'arquivada'
            ORDER BY c.id DESC, m.data_hora ASC
        `;
        const result = await pool.query(query, [req.params.usuario_id]);
        
        const cartelasAgrupadas = result.rows.reduce((acc, row) => {
            let cartela = acc.find((c) => c.cartela_id === row.cartela_id);
            if (!cartela) {
                cartela = {
                    cartela_id: row.cartela_id, numero_bilhete: row.numero_bilhete, rodada_nome: row.rodada_nome, rodada_status: row.rodada_status,
                    rodada_tipo: row.rodada_tipo, status_pagamento: row.status_pagamento, data_criacao: row.data_criacao, total_pontos: 0, palpites: []
                };
                acc.push(cartela);
            }
            cartela.total_pontos += (row.pontos_ganhos || 0);
            cartela.palpites.push({
                time_casa: row.time_casa, time_visitante: row.time_visitante, logo_casa: row.logo_casa, logo_visitante: row.logo_visitante,
                palpite_casa: row.palpite_casa, palpite_visitante: row.palpite_visitante, gols_casa: row.gols_casa, gols_visitante: row.gols_visitante, 
                palpite_texto: row.palpite_texto, pontos_ganhos: row.pontos_ganhos, data_hora: row.data_hora
            });
            return acc;
        }, []);

        res.status(200).json(cartelasAgrupadas);
    } catch (err) {
        res.status(500).json({ erro: err.message });
    }
});

app.get("/ranking", async (req, res) => {
    try {
        const query = `
            SELECT c.id as cartela_id, c.numero_bilhete, c.rodada_id, u.id as usuario_id, u.nome, COALESCE(SUM(p.pontos_ganhos), 0) as pontuacao_total
            FROM cartelas c JOIN users u ON c.usuario_id = u.id LEFT JOIN predictions p ON c.id = p.cartela_id JOIN rodadas r ON c.rodada_id = r.id
            WHERE c.status_pagamento = 'aprovado' AND r.status != 'arquivada'
            GROUP BY c.id, c.numero_bilhete, c.rodada_id, u.id, u.nome 
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
            SELECT u.nome as usuario_nome, c.id as cartela_id, c.numero_bilhete, c.status_pagamento, m.time_casa, m.time_visitante, p.palpite_casa, p.palpite_visitante, p.palpite_texto
            FROM predictions p JOIN cartelas c ON p.cartela_id = c.id JOIN users u ON c.usuario_id = u.id LEFT JOIN matches m ON p.match_id = m.id JOIN rodadas r ON c.rodada_id = r.id
            WHERE r.status != 'arquivada'
            ORDER BY u.nome ASC, c.numero_bilhete ASC, m.data_hora ASC
        `;
        const result = await pool.query(query);
        res.status(200).json(result.rows);
    } catch (err) {
        res.status(500).json({ erro: err.message });
    }
});

// ==========================================
// 6. CAMPEÃO OFICIAL DA COPA
// ==========================================

app.put('/admin/definir-campeao', async (req, res) => {

    const { rodada_id, campeao } = req.body;

    try {

        await pool.query(`
            UPDATE rodadas
            SET campeao_oficial = $1
            WHERE id = $2
        `, [campeao, rodada_id]);

        // dá 1000 pontos pra quem acertou
        await pool.query(`
            UPDATE predictions p
            SET pontos_ganhos = 1000
            FROM cartelas c
            WHERE p.cartela_id = c.id
            AND c.rodada_id = $1
            AND p.palpite_texto = $2
        `, [rodada_id, campeao]);

        res.json({
            sucesso: true,
            mensagem: 'Campeão definido!'
        });

    } catch (err) {

        console.error(err);

        res.status(500).json({
            erro: 'Erro ao definir campeão.'
        });

    }
});

app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});