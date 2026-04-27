require("dotenv").config();

const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const Message = require("./messages");
const { perguntar } = require("./api/chat");

const {
  buscarOuCriarCliente,
  salvarMensagem,
  buscarHistorico
} = require("./src/memory");

const TEMPO_INATIVIDADE = 120000; // 120s

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true
  }
});

client.on("qr", (qr) => {
  qrcode.generate(qr, { small: true });
});

client.once("ready", () => {
  console.log("Bot is ready!");
});

const userState = {};
const timers = {};
const atendimentoHumano = {};

// ================= UTIL =================

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
          "⏳ Atendimento encerrado por inatividade (120s)."
        );

        await sleep(1000);
        await client.sendMessage(chatId, Message.getMessage(10));
      }
    } catch (e) {
      console.error("Erro timer:", e);
    }
  }, TEMPO_INATIVIDADE);
}

// ================= SEGURANÇA =================

function chatPermitido(chatId) {
  if (!chatId) return false;

  // 🚫 bloqueia status
  if (chatId === "status@broadcast") return false;

  // 🚫 bloqueia grupo
  if (chatId.endsWith("@g.us")) return false;

  // ✅ somente privado
  if (chatId.endsWith("@c.us")) return true;

  return false;
}

// ================= MENSAGENS =================

client.on("message", async (msg) => {
  try {
    if (msg.fromMe) return;

    const chatId = msg.from;

    if (!chatPermitido(chatId)) return;

    const chat = await msg.getChat();

    if (chat.isGroup || chat.isStatus || chat.isBroadcast) return;

    // 🚫 BLOQUEIO POR ATENDIMENTO HUMANO
    if (atendimentoHumano[chatId]) {
      console.log("Modo humano ativo:", chatId);
      return;
    }

    const body = (msg.body || "").trim();
    const bodyLower = body.toLowerCase();

    if (!body) return;

    // reinicia timer se estiver em atendimento
    if (userState[chatId] === "triagem_juridica") {
      iniciarTimer(chatId);
    }

    // MENU
    if (bodyLower === "menu" || !userState[chatId]) {
      limparTimer(chatId);
      userState[chatId] = "menu";
      return client.sendMessage(chatId, Message.getMessage(10));
    }

    // ENCERRAR
    if (bodyLower === "sair" || bodyLower === "encerrar") {
      limparTimer(chatId);
      userState[chatId] = "menu";
      return client.sendMessage(chatId, Message.getMessage(8));
    }

    // MENU AÇÕES
    if (userState[chatId] === "menu") {
      if (body === "2") {
        userState[chatId] = "triagem_juridica";

        await client.sendMessage(chatId, Message.getMessage(2));

        iniciarTimer(chatId);
        return;
      }

      return client.sendMessage(chatId, Message.getMessage(body));
    }

    // TRIAGEM
    if (userState[chatId] === "triagem_juridica") {
      await client.sendSeen(chatId);

      const cliente = await buscarOuCriarCliente(chatId);

      await salvarMensagem(cliente.id, "user", body);

      const historico = await buscarHistorico(cliente.id, 10);

      const respostaBruta = await perguntar(
        body,
        historico,
        cliente.memoria || ""
      );

      const deveEncerrar = respostaBruta.includes("[ENCERRAR_TRIAGEM]");

      const resposta = respostaBruta.replace("[ENCERRAR_TRIAGEM]", "").trim();

      await salvarMensagem(cliente.id, "assistant", resposta);

      await client.sendMessage(chatId, resposta);

      if (deveEncerrar) {
        limparTimer(chatId);
        userState[chatId] = "menu";

        await sleep(1500);

        await client.sendMessage(
          chatId,
          "✅ Atendimento encerrado. Caso encaminhado ao advogado."
        );

        await sleep(1500);

        return client.sendMessage(chatId, Message.getMessage(10));
      }

      iniciarTimer(chatId);
    }
  } catch (error) {
    console.error("Erro:", error);

    if (msg?.from && chatPermitido(msg.from)) {
      return client.sendMessage(
        msg.from,
        "Erro técnico. Sua mensagem será analisada manualmente."
      );
    }
  }
});

// ================= MODO HUMANO =================

client.on("message_create", async (msg) => {
  try {
    if (!msg.fromMe) return;

    const chatId = msg.to;

    if (!chatPermitido(chatId)) return;

    const body = (msg.body || "").trim().toLowerCase();

    // DESATIVAR BOT SOMENTE QUANDO VOCÊ DIGITAR ESTA FRASE
    if (body === "sou rodrigo marinho advogado") {
      atendimentoHumano[chatId] = true;
      limparTimer(chatId);
      userState[chatId] = "humano";

      console.log("Atendimento humano ativado para:", chatId);
      return;
    }

    // REATIVAR BOT SOMENTE QUANDO VOCÊ DIGITAR ESTA FRASE
    if (body === "encerrando seu atendimento") {
      atendimentoHumano[chatId] = false;
      limparTimer(chatId);
      userState[chatId] = "menu";

      await client.sendMessage(chatId, "✅ Atendimento automático reativado.");
      await client.sendMessage(chatId, Message.getMessage(10));

      console.log("Bot reativado para:", chatId);
      return;
    }

    // QUALQUER OUTRA MENSAGEM SUA NÃO MUDA O ESTADO DO BOT
    console.log("Mensagem manual enviada, mas sem alterar estado do bot:", chatId);
    return;

  } catch (error) {
    console.error("Erro modo humano:", error);
  }
});

client.initialize();