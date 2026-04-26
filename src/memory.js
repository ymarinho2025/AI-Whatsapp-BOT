const pool = require("./db");

async function buscarOuCriarCliente(whatsappId) {
  const existente = await pool.query(
    "SELECT * FROM clientes WHERE whatsapp_id = $1",
    [whatsappId]
  );

  if (existente.rows.length > 0) {
    return existente.rows[0];
  }

  const novo = await pool.query(
    "INSERT INTO clientes (whatsapp_id, memoria) VALUES ($1, $2) RETURNING *",
    [whatsappId, ""]
  );

  return novo.rows[0];
}

async function salvarMensagem(clienteId, role, conteudo) {
  await pool.query(
    "INSERT INTO mensagens (cliente_id, role, conteudo) VALUES ($1, $2, $3)",
    [clienteId, role, conteudo]
  );
}

async function buscarHistorico(clienteId, limite = 10) {
  const result = await pool.query(
    `
    SELECT role, conteudo
    FROM mensagens
    WHERE cliente_id = $1
    ORDER BY created_at DESC
    LIMIT $2
    `,
    [clienteId, limite]
  );

  return result.rows.reverse().map((msg) => ({
    role: msg.role,
    content: msg.conteudo
  }));
}

async function atualizarMemoria(clienteId, memoria) {
  await pool.query(
    `
    UPDATE clientes
    SET memoria = $1, updated_at = NOW()
    WHERE id = $2
    `,
    [memoria, clienteId]
  );
}

module.exports = {
  buscarOuCriarCliente,
  salvarMensagem,
  buscarHistorico,
  atualizarMemoria
};