require("dotenv").config();

const pool = require("./db");

async function migrate() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS clientes (
        id SERIAL PRIMARY KEY,
        whatsapp_id VARCHAR(100) UNIQUE NOT NULL,
        nome VARCHAR(255),
        cidade VARCHAR(255),
        memoria TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS mensagens (
        id SERIAL PRIMARY KEY,
        cliente_id INTEGER REFERENCES clientes(id) ON DELETE CASCADE,
        role VARCHAR(20) NOT NULL,
        conteudo TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    console.log("✅ Tabelas criadas/verificadas com sucesso no NeonDB.");
  } catch (error) {
    console.error("❌ Erro ao executar migrate:", error);
  } finally {
    await pool.end();
  }
}

migrate();