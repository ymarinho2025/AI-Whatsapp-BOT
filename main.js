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

const TEMPO_INATIVIDADE = 120000; // 120 segundos

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
const timersInatividade = {};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function limparTimer(chatId) {
  if (timersInatividade[chatId]) {
    clearTimeout(timersInatividade[chatId]);
    delete timersInatividade[chatId];
  }
}

function iniciarTimerInatividade(chatId) {
  limparTimer(chatId);

  timersInatividade[chatId] = setTimeout(async () => {
    try {
      if (userState[chatId] === "triagem_juridica") {
        userState[chatId] = "menu";

        await client.sendMessage(
          chatId,
          "⏳ Atendimento encerrado por inatividade. Como não houve resposta em 120 segundos, estou finalizando esta triagem por aqui."
        );

        await sleep(1000);

        await client.sendMessage(chatId, Message.getMessage(10));
      }
    } catch (error) {
      console.error("Erro ao encerrar por inatividade:", error);
    }
  }, TEMPO_INATIVIDADE);
}

  function chatPermitido(chatId) {
  if (!chatId) return false;

  // 🚫 bloqueia status
  if (chatId === "status@broadcast") return false;

  // 🚫 bloqueia grupos
  if (chatId.endsWith("@g.us")) return false;

  // ✅ permite apenas conversa privada
  if (chatId.endsWith("@c.us")) return true;

  return false;
}

  client.on("message", async (msg) => {
    try {
      if (msg.fromMe) return;

      const chatId = msg.from;

      if (!chatPermitido(chatId)) {
        console.log("Mensagem ignorada de origem não permitida:", chatId);
        return;
      }

      const chat = await msg.getChat();

      if (chat.isStatus || chat.isBroadcast) {
        console.log("Status/Broadcast ignorado:", chatId);
        return;
      }

    const body = (msg.body || "").trim();
    const bodyLower = body.toLowerCase();

    if (!body) return;

    // Sempre que o cliente responder, reinicia o timer
    if (userState[chatId] === "triagem_juridica") {
      iniciarTimerInatividade(chatId);
    }

    if (bodyLower === "menu" || !userState[chatId]) {
      limparTimer(chatId);
      userState[chatId] = "menu";
      return client.sendMessage(chatId, Message.getMessage(10));
    }

    if (bodyLower === "sair" || bodyLower === "encerrar") {
      limparTimer(chatId);
      userState[chatId] = "menu";
      return client.sendMessage(chatId, Message.getMessage(8));
    }

    if (userState[chatId] === "menu") {
      if (body === "2") {
        userState[chatId] = "triagem_juridica";

        await client.sendMessage(chatId, Message.getMessage(2));

        iniciarTimerInatividade(chatId);
        return;
      }

      return client.sendMessage(chatId, Message.getMessage(body));
    }

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

      iniciarTimerInatividade(chatId);
      return;
    }
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

    const chatId = msg.to;

    if (!chatPermitido(chatId)) return;

    const body = (msg.body || "").trim().toLowerCase();

    if (body === "encerrar atendimento") {
      limparTimer(chatId);
      userState[chatId] = "menu";

      await client.sendMessage(chatId, Message.getMessage(7));
      await sleep(1500);
      return client.sendMessage(chatId, Message.getMessage(10));
    }
  } catch (error) {
    console.error("Erro ao reativar atendimento:", error);
  }
});

client.initialize();