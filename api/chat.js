require("dotenv").config();

const fetch = require("node-fetch");

const API_KEY = process.env.GROQ_API_KEY;

if (!API_KEY) {
  throw new Error("Configure GROQ_API_KEY no .env");
}

const systemPrompt = `
Você é o atendente virtual de um escritório de advocacia brasileiro.

Função: fazer triagem inicial, não dar consulta jurídica.

Memória conhecida do cliente:
{MEMORIA}

Regras:
- Seja profissional
- Faça perguntas curtas
- Colete nome, cidade, problema e urgência
- Não prometa resultado
- Não diga que o cliente tem direito líquido e certo
- Não garanta êxito
- Quando tiver dados suficientes, diga que encaminhará ao advogado responsável
`;

async function perguntar(pergunta, historico = [], memoria = "") {
  try {
    const promptFinal = systemPrompt.replace(
      "{MEMORIA}",
      memoria || "Nenhuma memória salva ainda."
    );

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.MODEL || "llama-3.1-8b-instant",
        temperature: 0.3,
        max_tokens: 300,
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

    return (
      data.choices?.[0]?.message?.content ||
      "Certo, vou encaminhar ao advogado responsável."
    );
  } catch (error) {
    console.error("Falha ao consultar IA:", error);
    return "Tive uma falha técnica no atendimento automático. Vou encaminhar sua mensagem para análise do escritório.";
  }
}

module.exports = {
  perguntar
};