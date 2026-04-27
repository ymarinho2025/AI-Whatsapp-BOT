/**
 * honorarios.js
 * Módulo de busca local no JSON de honorários da OAB/RS.
 * Importe este módulo no chat.js para que a Bella consulte
 * os valores sem precisar acessar a internet.
 *
 * Uso no chat.js:
 *   const { buscarHonorarios, resumoHonorarios } = require("./honorarios");
 */

const fs   = require("fs");
const path = require("path");

const CAMINHO_JSON = path.join(__dirname, "honorarios-oabrs.json");

// ─── Cache em memória (carrega uma vez) ───────────────────────────────────────
let _cache = null;

function carregarJSON() {
  if (_cache) return _cache;

  if (!fs.existsSync(CAMINHO_JSON)) {
    throw new Error(
      `Arquivo de honorários não encontrado: ${CAMINHO_JSON}\n` +
      `Execute primeiro: node gerar-json-oabrs.js`
    );
  }

  _cache = JSON.parse(fs.readFileSync(CAMINHO_JSON, "utf-8"));
  return _cache;
}

// ─── Normalização para busca ──────────────────────────────────────────────────
function normalizar(texto) {
  return String(texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove acentos
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function score(item, termos) {
  const alvo = normalizar(item.descricao + " " + (item.categoria || "") + " " + (item.subgrupo || ""));
  let pontos = 0;
  termos.forEach((t) => {
    if (alvo.includes(t)) pontos += t.length; // palavras maiores valem mais
  });
  return pontos;
}

// ─── API pública ──────────────────────────────────────────────────────────────

/**
 * Busca itens de honorários por palavras-chave.
 *
 * @param {string} consulta  - Ex: "inventário", "trabalhista", "habeas corpus"
 * @param {number} limite    - Quantidade máxima de resultados (padrão: 5)
 * @returns {object}         - { meta, resultados, texto }
 */
function buscarHonorarios(consulta, limite = 5) {
  const dados   = carregarJSON();
  const termos  = normalizar(consulta).split(" ").filter((t) => t.length > 2);

  if (termos.length === 0) {
    return {
      meta:       dados.meta,
      resultados: [],
      texto:      "Consulta muito curta. Informe o tipo de serviço ou área jurídica.",
    };
  }

  const ranqueados = dados.indice
    .map((item) => ({ item, pontos: score(item, termos) }))
    .filter((r) => r.pontos > 0)
    .sort((a, b) => b.pontos - a.pontos)
    .slice(0, limite)
    .map((r) => r.item);

  // ── Formata texto legível para a IA ─────────────────────────────────────────
  let texto;

  if (ranqueados.length === 0) {
    texto =
      `Não encontrei um valor específico para "${consulta}" na tabela da OAB/RS. ` +
      `Os honorários serão informados após análise, observando os parâmetros éticos da OAB/RS. ` +
      `Fonte: ${dados.meta.fonte}`;
  } else {
    const linhas = ranqueados.map((r) => {
      const valor      = r.valor?.bruto || "—";
      const percentual = r.percentual   || "";
      const categoria  = r.categoria    ? `[${r.categoria}]` : "";
      const obs        = r.observacao   ? ` (${r.observacao})` : "";
      return `• ${r.descricao}: ${valor}${percentual ? " / " + percentual : ""}${obs} ${categoria}`;
    });

    texto =
      `Valores de referência da tabela OAB/RS para "${consulta}":\n` +
      linhas.join("\n") +
      `\n\nFonte oficial: ${dados.meta.fonte}` +
      `\nAtualização: ${new Date(dados.meta.coletadoEm).toLocaleDateString("pt-BR")}`;
  }

  return {
    meta: {
      totalItens:      dados.meta.totalItens,
      coletadoEm:     dados.meta.coletadoEm,
      fonte:           dados.meta.fonte,
    },
    resultados: ranqueados,
    texto,
  };
}

/**
 * Retorna um resumo geral da tabela (categorias disponíveis).
 * Útil para que a IA saiba quais áreas existem.
 *
 * @returns {string}
 */
function resumoHonorarios() {
  const dados = carregarJSON();
  const cats  = dados.categorias.map((c) => `• ${c.categoria} (${c.itens.length} serviços)`);
  return (
    `Tabela de Honorários OAB/RS — ${dados.meta.totalItens} serviços em ${dados.meta.totalCategorias} categorias:\n` +
    cats.join("\n") +
    `\nFonte: ${dados.meta.fonte}`
  );
}

/**
 * Retorna todo o índice plano (uso avançado).
 * @returns {Array}
 */
function todosItens() {
  return carregarJSON().indice;
}

module.exports = { buscarHonorarios, resumoHonorarios, todosItens };
