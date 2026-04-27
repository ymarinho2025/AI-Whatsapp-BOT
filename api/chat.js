require("dotenv").config();

const fs = require("fs");
const path = require("path");
const fetch = require("node-fetch");

const API_KEY = process.env.GROQ_API_KEY;

if (!API_KEY) {
  throw new Error("Configure GROQ_API_KEY no .env");
}

const caminhoJson = path.join(__dirname, "..", "honorarios-oabrs.json");

function carregarHonorarios() {
  try {
    const raw = fs.readFileSync(caminhoJson, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    console.error("Erro ao ler honorarios-oabrs.json:", error);
    return null;
  }
}

function buscarHonorarios(pergunta) {
  const tabela = carregarHonorarios();

  if (!tabela || !Array.isArray(tabela.secoes)) {
    return "Tabela de honorários não carregada.";
  }

  const termos = pergunta
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/\s+/)
    .filter(p => p.length >= 4);

  const resultados = [];

  for (const secao of tabela.secoes) {
    for (const linha of secao.linhas || []) {
      const linhaNormalizada = linha
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");

      const achou = termos.some(termo => linhaNormalizada.includes(termo));

      if (achou && linha.includes("R$")) {
        resultados.push(`${secao.titulo}\n${linha}`);
      }
    }
  }

  if (resultados.length === 0) {
    return "Não encontrei um item específico na tabela local. Informe melhor o tipo de serviço jurídico.";
  }

  return resultados.slice(0, 5).join("\n\n");
}

const systemPrompt = `
Você é Felipe, atendente virtual do escritório do advogado Rodrigo Marinho.

Função:
- Fazer triagem inicial.
- Não dar consulta jurídica definitiva.
- Não prometer resultado.
- Não garantir êxito.
- Não dizer que o cliente tem direito líquido e certo.
- Não dizer que o advogado já analisou o caso.
- Não dizer que já ajuizou ação.
- Fazer perguntas curtas para entender o caso.

Honorários:
- Quando o cliente perguntar sobre honorários, use apenas a tabela local da OAB/RS fornecida no prompt.
- Informe que são valores referenciais da tabela da OAB/RS.
- Explique que o valor final depende da análise do advogado Rodrigo Marinho.
- Nunca invente valores.
- Nunca diga que consultou site externo em tempo real.

Memória conhecida do cliente:
{MEMORIA}

Tabela local da OAB/RS relacionada à pergunta:
{HONORARIOS}

Regras de atendimento:
- Seja profissional, cordial e objetivo.
- Faça análise jurídica inicial, sem consulta definitiva.
- Colete, quando possível:
  1. Nome
  2. Cidade/Estado
  3. Tipo de problema
  4. Urgência
  5. Se possui documentos ou comprovantes

Regra de encerramento:
Quando o cliente já tiver explicado minimamente o caso e aceitar o encaminhamento ao advogado Rodrigo Marinho, finalize com uma mensagem natural e coloque exatamente no final:

[ENCERRAR_TRIAGEM]

Não explique o marcador.
`;

async function perguntar(pergunta, historico = [], memoria = "") {
  try {
    const honorariosEncontrados = buscarHonorarios(pergunta);

    const promptFinal = systemPrompt
      .replace("{MEMORIA}", memoria || "Nenhuma memória salva ainda.")
      .replace("{HONORARIOS}", honorariosEncontrados);

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.MODEL || "llama-3.1-8b-instant",
        temperature: 0.2,
        max_tokens: 400,
        messages: [
          { role: "system", content: promptFinal },
          ...historico,
          { role: "user", content: pergunta }
        ]
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Erro da IA:", data);
      return "Não consegui consultar o assistente agora. Vou encaminhar sua mensagem para análise do advogado.";
    }

    return data.choices?.[0]?.message?.content || "Certo, vou encaminhar ao advogado responsável.";
  } catch (error) {
    console.error("Falha ao consultar IA:", error);
    return "Tive uma falha técnica no atendimento automático. Vou encaminhar sua mensagem para análise do escritório. [ENCERRAR_TRIAGEM]";
  }
}

module.exports = {
  perguntar
};