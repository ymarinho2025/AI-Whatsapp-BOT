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

// ================= CONFIGURAÇÕES =================

const TEMPO_INATIVIDADE = 120000; // 120 segundos

const client = new Client({
  authStrategy: new LocalAuth({
    clientId: "bot-rodrigo",
  }),
  puppeteer: {
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-extensions",
      "--disable-gpu",
    ],
  },
});

// ================= ESTADOS =================

const userState = {};
const timers = {};
const atendimentoHumano = {};

// ================= EVENTOS INICIAIS =================

client.on("qr", (qr) => {
  console.log("Escaneie o QR Code:");
  qrcode.generate(qr, { small: true });
});

client.on("authenticated", () => {
  console.log("WhatsApp autenticado com sucesso.");
});

client.on("auth_failure", (msg) => {
  console.error("Falha na autenticação:", msg);
});

client.on("ready", () => {
  console.log("Bot is ready!");
});

client.on("loading_screen", (percent, message) => {
  console.log("Carregando:", percent, message);
});

client.on("disconnected", (reason) => {
  console.log("Bot desconectado:", reason);
});

// ================= FUNÇÕES AUXILIARES =================

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
    clearTimeout(timers[chatId]);
    delete timers[chatId];
  }
}

function iniciarTimer(chatId) {
  limparTimer(chatId);

  timers[chatId] = setTimeout(async () => {
    try {
      if (userState[chatId] === "triagem_juridica") {
        userState[chatId] = "menu";

        await client.sendMessage(
          chatId,
          "⏳ Atendimento encerrado por inatividade."
        );

        await sleep(1000);
        await client.sendMessage(chatId, Message.getMessage(10));
      }
    } catch (error) {
      console.error("Erro no timer:", error);
    }
  }, TEMPO_INATIVIDADE);
}

async function enviarMenu(chatId) {
  userState[chatId] = "menu";
  limparTimer(chatId);
  await client.sendMessage(chatId, Message.getMessage(10));
}

async function enviarOpcaoInvalida(chatId) {
  await client.sendMessage(chatId, Message.getMessage(0));
  await sleep(800);
  await client.sendMessage(chatId, Message.getMessage(10));
}

// ================= MENSAGENS RECEBIDAS =================

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

    if (chat.isGroup || chat.isStatus || chat.isBroadcast) {
      console.log("Grupo/status/broadcast ignorado:", chatId);
      return;
    }

    if (atendimentoHumano[chatId]) {
      console.log("Atendimento humano ativo:", chatId);
      return;
    }

    const body = (msg.body || "").trim();
    const bodyLower = body.toLowerCase();

    if (!body) {
      console.log("Mensagem vazia ignorada:", chatId);
      return;
    }

    if (bodyLower === "menu" || bodyLower === "iniciar" || bodyLower === "oi" || bodyLower === "olá" || bodyLower === "ola") {
      return enviarMenu(chatId);
    }

    if (bodyLower === "sair" || bodyLower === "encerrar") {
      limparTimer(chatId);
      userState[chatId] = "menu";
      return client.sendMessage(chatId, Message.getMessage(8));
    }

    if (!userState[chatId]) {
      return enviarMenu(chatId);
    }

    // ================= ESTADO: MENU =================

    if (userState[chatId] === "menu") {
      switch (body) {
        case "1":
          return client.sendMessage(chatId, Message.getMessage(1));

        case "2":
          userState[chatId] = "triagem_juridica";
          await client.sendMessage(chatId, Message.getMessage(2));
          iniciarTimer(chatId);
          return;

        case "3":
          return client.sendMessage(chatId, Message.getMessage(3));

        case "4":
          return client.sendMessage(chatId, Message.getMessage(4));

        case "5":
          return client.sendMessage(chatId, Message.getMessage(5));

        case "6":
          return client.sendMessage(chatId, Message.getMessage(6));

        default:
          return enviarOpcaoInvalida(chatId);
      }
    }

    // ================= ESTADO: TRIAGEM JURÍDICA =================

    if (userState[chatId] === "triagem_juridica") {
      iniciarTimer(chatId);

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

      const deveEncerrar = respostaBruta.includes("[ENCERRAR_TRIAGEM]");

      const respostaLimpa = respostaBruta
        .replace("[ENCERRAR_TRIAGEM]", "")
        .trim();

      await salvarMensagem(cliente.id, "assistant", respostaLimpa);

      await client.sendMessage(chatId, respostaLimpa);

      if (deveEncerrar) {
        limparTimer(chatId);
        userState[chatId] = "menu";

        await sleep(1500);

        await client.sendMessage(
          chatId,
          "✅ Estou encerrando seu atendimento por aqui. Seu caso será encaminhado para análise do advogado responsável."
        );

        await sleep(1500);

        return client.sendMessage(chatId, Message.getMessage(10));
      }

      iniciarTimer(chatId);
      return;
    }

    userState[chatId] = "menu";
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

// ================= MENSAGENS ENVIADAS PELO ESCRITÓRIO =================

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
      limparTimer(chatId);
      userState[chatId] = "menu";

      await client.sendMessage(chatId, Message.getMessage(7));
      await sleep(1500);
      return client.sendMessage(chatId, Message.getMessage(10));
    }
  } catch (error) {
    console.error("Erro ao controlar atendimento:", error);
  }
});

// ================= INICIAR BOT =================

client.initialize();