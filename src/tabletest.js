require("dotenv").config();

const pool = require("./db");

async function seed() {
  try {
    await pool.query(`
      INSERT INTO clientes (whatsapp_id, nome, cidade, memoria)
      VALUES
      (
        '5511999999999@c.us',
        'Carlos Silva',
        'Canoas/RS',
        'Cliente relata problema de direito do consumidor. Comprou produto online não entregue após 20 dias. Possui comprovantes.'
      ),
      (
        '5511988888888@c.us',
        'Ana Souza',
        'Curitiba/PR',
        'Cliente relata possível rescisão trabalhista irregular. Trabalhou 2 anos sem registro.'
      )
      ON CONFLICT (whatsapp_id) DO NOTHING;
    `);

    const cliente = await pool.query(
      "SELECT id FROM clientes WHERE whatsapp_id = $1",
      ["5511999999999@c.us"]
    );

    if (cliente.rows.length > 0) {
      const clienteId = cliente.rows[0].id;

      await pool.query(
        `
        INSERT INTO mensagens (cliente_id, role, conteudo)
        VALUES
        ($1, 'user', 'Olá, quero fazer um processo.'),
        ($1, 'assistant', 'Claro, posso te ajudar com a triagem. Qual é o seu nome?'),
        ($1, 'user', 'Carlos'),
        ($1, 'assistant', 'Obrigado, Carlos. Em qual cidade você está?'),
        ($1, 'user', 'Canoas RS'),
        ($1, 'assistant', 'Qual o problema que você está enfrentando?'),
        ($1, 'user', 'Comprei um produto e não entregaram'),
        ($1, 'assistant', 'Entendi. Vou encaminhar seu caso para análise do advogado.')
        `,
        [clienteId]
      );
    }

    console.log("✅ Dados de teste inseridos no NeonDB.");
  } catch (error) {
    console.error("❌ Erro ao inserir dados de teste:", error);
  } finally {
    await pool.end();
  }
}

seed();