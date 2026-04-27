require("dotenv").config();

const fetch = require("node-fetch");

const API_KEY = process.env.GROQ_API_KEY;

if (!API_KEY) {
  console.error("Configure GROQ_API_KEY no .env");
  process.exit(1);
}

const perguntasDeTeste = [
  "Olá, quero fazer um processo.",
  "Meu nome é Carlos. Comprei um produto pela internet e não entregaram.",
  "Foi em Canoas RS e já faz 20 dias.",
  "Tenho comprovantes. O que faço?"
];

const systemPrompt = `
Você é o atendente virtual de um escritório de advocacia brasileiro.

Função: fazer triagem inicial, não dar consulta jurídica.

- Seja profissional
- Faça perguntas curtas
- Colete nome, cidade, problema e urgência
- Não prometa resultado
- No final diga que vai encaminhar ao advogado
`;

async function perguntar(pergunta, historico) {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.MODEL || "llama-3.1-8b-instant",
      temperature: 0.3,
      max_tokens: 300,
      messages: [
        { role: "system", content: systemPrompt },
        ...historico,
        { role: "user", content: pergunta }
      ]
    })
  });

  const data = await response.json();

  if (!response.ok) {
    console.error("Erro:", data);
    process.exit(1);
  }

  return data.choices?.[0]?.message?.content || "Erro na resposta.";
}

async function testar() {
  const historico = [];

  for (const pergunta of perguntasDeTeste) {
    console.log("\nCLIENTE:", pergunta);

    const resposta = await perguntar(pergunta, historico);

    console.log("IA:", resposta);

    historico.push({ role: "user", content: pergunta });
    historico.push({ role: "assistant", content: resposta });
  }
}

testar();