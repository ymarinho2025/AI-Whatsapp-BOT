require("dotenv").config();

const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const Message = require("./messages");
const { perguntar } = require("./api/chat");

const {
  buscarOuCriarCliente,
  salvarMensagem,
  buscarHistorico,
} = require("./src/memory");

const TEMPO_INATIVIDADE = 5 * 60 * 1000;

const client = new Client({
  authStrategy: new LocalAuth({
    clientId: "bot-rodrigo",
  }),
  puppeteer: {
    headless: true,
    executablePath: "/usr/bin/google-chrome",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
    ],
  },
});

const userState = {};
const estadoAnterior = {};
const timers = {};
const atendimentoHumano = {};

client.on("qr", (qr) => {
  console.log("Escaneie o QR Code:");
  qrcode.generate(qr, { small: true });
});

client.once("ready", () => {
  console.log("Bot is ready!");
});

client.on("authenticated", () => {
  console.log("WhatsApp autenticado com sucesso.");
});

client.on("auth_failure", (msg) => {
  console.error("Falha na autenticação:", msg);
});

client.on("loading_screen", (percent, message) => {
  console.log("Carregando:", percent, message);
});

client.on("disconnected", (reason) => {
  console.log("Bot desconectado:", reason);
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function chatPermitido(chatId) {
  if (!chatId) return false;
  if (chatId === "status@broadcast") return false;
  if (chatId.endsWith("@g.us")) return false;
  if (chatId.endsWith("@broadcast")) return false;
  if (chatId.endsWith("@c.us")) return true;
  if (chatId.endsWith("@lid")) return true;
  return false;
}

function limparTimer(chatId) {
  if (timers[chatId]) {
    timers[chatId].forEach(clearTimeout);
    delete timers[chatId];
  }
}

async function enviarMenu(chatId) {
  userState[chatId] = "menu";
  delete estadoAnterior[chatId];
  limparTimer(chatId);

  return client.sendMessage(chatId, Message.getMessage(10));
}

async function encerrarAtendimento(
  chatId,
  motivo = "✅ Atendimento encerrado."
) {
  limparTimer(chatId);

  userState[chatId] = "avaliando_atendimento";
  delete estadoAnterior[chatId];

  await client.sendMessage(chatId, motivo);

  await sleep(1000);

  return client.sendMessage(
    chatId,
    `👋 Avalie o atendimento de 1 a 5

1️⃣ - Muito ruim
2️⃣ - Ruim
3️⃣ - Satisfatório
4️⃣ - Bom
5️⃣ - Muito Bom`
  );
}

function iniciarTimer(chatId) {
  limparTimer(chatId);

  timers[chatId] = [
    setTimeout(async () => {
      if (
        userState[chatId] === "triagem_juridica" ||
        userState[chatId] === "confirmar_encerramento"
      ) {
        await client.sendMessage(
          chatId,
          "⏳ Atendimento será encerrado em 4 minutos por inatividade."
        );
      }
    }, 60 * 1000),

    setTimeout(async () => {
      if (
        userState[chatId] === "triagem_juridica" ||
        userState[chatId] === "confirmar_encerramento"
      ) {
        await client.sendMessage(
          chatId,
          "⏳ Atendimento será encerrado em 3 minutos por inatividade."
        );
      }
    }, 2 * 60 * 1000),

    setTimeout(async () => {
      if (
        userState[chatId] === "triagem_juridica" ||
        userState[chatId] === "confirmar_encerramento"
      ) {
        await client.sendMessage(
          chatId,
          "⏳ Atendimento será encerrado em 2 minutos por inatividade."
        );
      }
    }, 3 * 60 * 1000),

    setTimeout(async () => {
      if (
        userState[chatId] === "triagem_juridica" ||
        userState[chatId] === "confirmar_encerramento"
      ) {
        await client.sendMessage(
          chatId,
          "⏳ Atendimento será encerrado em 1 minuto por inatividade."
        );
      }
    }, 4 * 60 * 1000),

    setTimeout(async () => {
      try {
        if (
          userState[chatId] === "triagem_juridica" ||
          userState[chatId] === "confirmar_encerramento"
        ) {
          await encerrarAtendimento(
            chatId,
            "⏳ Atendimento encerrado por inatividade."
          );
        }
      } catch (error) {
        console.error("Erro no timer:", error);
      }
    }, TEMPO_INATIVIDADE),
  ];
}

function respostaPositiva(texto) {
  return [
    "sim",
    "s",
    "pode",
    "pode encerrar",
    "encerra",
    "encerrar",
    "ok",
    "beleza",
    "perfeito",
    "tudo certo",
    "pode sim",
  ].includes(texto);
}

function respostaNegativa(texto) {
  return [
    "não",
    "nao",
    "n",
    "ainda não",
    "ainda nao",
    "não ainda",
    "nao ainda",
  ].includes(texto);
}

function mensagemDeDespedida(texto) {
  return [
    "obrigado",
    "obrigada",
    "muito obrigado",
    "muito obrigada",
    "valeu",
    "tchau",
    "até mais",
    "ate mais",
    "falou",
    "era isso",
    "só isso",
    "so isso",
  ].some((item) => texto.includes(item));
}

client.on("message", async (msg) => {
  try {
    console.log("CHEGOU MENSAGEM:", {
      from: msg.from,
      to: msg.to,
      fromMe: msg.fromMe,
      type: msg.type,
      body: msg.body,
    });

    if (msg.fromMe) return;

    const chatId = msg.from;

    if (!chatPermitido(chatId)) {
      console.log("Chat ignorado:", chatId);
      return;
    }

    const chat = await msg.getChat();

    if (chat.isGroup || chat.isStatus || chat.isBroadcast) return;

    if (atendimentoHumano[chatId]) {
      console.log("Atendimento humano ativo:", chatId);
      return;
    }

    const body = (msg.body || "").trim();
    const bodyLower = body.toLowerCase();

    if (!body) return;

    if (bodyLower === "sair" || bodyLower === "encerrar") {
      return encerrarAtendimento(chatId);
    }

    if (bodyLower === "menu") {
      return enviarMenu(chatId);
    }

    if (!userState[chatId]) {
      return enviarMenu(chatId);
    }

    if (userState[chatId] === "avaliando_atendimento") {
      const nota = body.trim();

      if (!["1", "2", "3", "4", "5"].includes(nota)) {
        return client.sendMessage(
          chatId,
          "Por favor, avalie o atendimento de 1 a 5."
        );
      }

      console.log(`Avaliação recebida de ${chatId}: ${nota}`);

      delete userState[chatId];
      delete estadoAnterior[chatId];
      limparTimer(chatId);

      return client.sendMessage(
        chatId,
        "✅ Obrigado pela avaliação! Atendimento finalizado."
      );
    }

    if (userState[chatId] === "confirmar_encerramento") {
      iniciarTimer(chatId);

      if (respostaPositiva(bodyLower)) {
        return encerrarAtendimento(
          chatId,
          "✅ Perfeito. Atendimento encerrado."
        );
      }

      if (respostaNegativa(bodyLower)) {
        userState[chatId] =
          estadoAnterior[chatId] || "triagem_juridica";

        delete estadoAnterior[chatId];

        await client.sendMessage(
          chatId,
          "Tudo bem. Pode mandar sua próxima dúvida."
        );

        iniciarTimer(chatId);
        return;
      }

      await client.sendMessage(
        chatId,
        "Você deseja encerrar o atendimento? Responda com SIM ou NÃO."
      );

      iniciarTimer(chatId);
      return;
    }

    if (userState[chatId] === "menu") {
      if (body === "1") {
        await client.sendMessage(chatId, Message.getMessage(1));
        await sleep(800);
        return client.sendMessage(chatId, Message.getMessage(10));
      }

      if (body === "2") {
        userState[chatId] = "triagem_juridica";

        await client.sendMessage(chatId, Message.getMessage(2));

        iniciarTimer(chatId);
        return;
      }

      if (body === "3") {
        await client.sendMessage(chatId, Message.getMessage(3));
        await sleep(800);
        return client.sendMessage(chatId, Message.getMessage(10));
      }

      if (body === "4") {
        await client.sendMessage(chatId, Message.getMessage(4));
        return;
      }

      if (body === "5") {
        await client.sendMessage(chatId, Message.getMessage(5));
        return;
      }

      if (body === "6") {
        await client.sendMessage(chatId, Message.getMessage(6));
        return;
      }

      return enviarMenu(chatId);
    }

    if (userState[chatId] === "triagem_juridica") {
      iniciarTimer(chatId);

      if (mensagemDeDespedida(bodyLower)) {
        estadoAnterior[chatId] = userState[chatId];

        userState[chatId] = "confirmar_encerramento";

        await client.sendMessage(
          chatId,
          "Posso encerrar o atendimento ou posso ajudar com algo mais?"
        );

        iniciarTimer(chatId);
        return;
      }

      await client.sendSeen(chatId);

      const cliente = await buscarOuCriarCliente(chatId);

      await salvarMensagem(cliente.id, "user", body);

      const historico = await buscarHistorico(cliente.id, 10);

      let respostaBruta = await perguntar(
        body,
        historico,
        cliente.memoria || ""
      );

      if (!respostaBruta) {
        respostaBruta =
          "Entendi. Pode me informar seu nome, cidade e um resumo do problema para eu encaminhar ao advogado Rodrigo Marinho?";
      }

      const deveEncerrar =
        respostaBruta.includes("[ENCERRAR_TRIAGEM]");

      const respostaLimpa = respostaBruta
        .replace("[ENCERRAR_TRIAGEM]", "")
        .trim();

      await salvarMensagem(cliente.id, "assistant", respostaLimpa);

      await client.sendMessage(chatId, respostaLimpa);

      if (deveEncerrar) {
        estadoAnterior[chatId] = userState[chatId];

        userState[chatId] = "confirmar_encerramento";

        await sleep(1000);

        await client.sendMessage(
          chatId,
          "Posso encerrar o atendimento ou posso ajudar com algo mais?"
        );

        iniciarTimer(chatId);
        return;
      }

      iniciarTimer(chatId);
      return;
    }

    return enviarMenu(chatId);
  } catch (error) {
    console.error("Erro no atendimento:", error);

    if (msg?.from && chatPermitido(msg.from)) {
      return client.sendMessage(
        msg.from,
        "Tive uma falha técnica no atendimento automático. Vou encaminhar sua mensagem para análise do escritório."
      );
    }
  }
});

client.on("message_create", async (msg) => {
  try {
    if (!msg.fromMe) return;

    const chatId = msg.to || msg.from;

    if (!chatPermitido(chatId)) return;

    const body = (msg.body || "").trim().toLowerCase();

    if (body === "atendimento automatico finalizado") {
      atendimentoHumano[chatId] = true;

      limparTimer(chatId);

      userState[chatId] = "humano";

      console.log("Atendimento humano ativado para:", chatId);
      return;
    }

    if (body === "atendimento automatico iniciado") {
      atendimentoHumano[chatId] = false;

      limparTimer(chatId);

      userState[chatId] = "menu";

      await client.sendMessage(chatId, Message.getMessage(10));

      console.log("Bot reativado para:", chatId);
      return;
    }

    if (body === "encerrar atendimento") {
      return encerrarAtendimento(chatId);
    }
  } catch (error) {
    console.error("Erro ao controlar atendimento:", error);
  }
});

client.initialize();