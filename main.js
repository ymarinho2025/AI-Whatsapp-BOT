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

client.on("message", async (msg) => {
  try {
    if (msg.fromMe) return;

    const chatId = msg.from;
    const rawBody = msg.body || "";
    const body = rawBody.trim();
    const bodyLower = body.toLowerCase();

    if (!body) return;

    if (bodyLower === "menu" || !userState[chatId]) {
      userState[chatId] = "menu";
      return client.sendMessage(chatId, Message.getMessage(10));
    }

    if (bodyLower === "sair" || bodyLower === "encerrar") {
      userState[chatId] = "menu";
      return client.sendMessage(chatId, Message.getMessage(8));
    }

    if (userState[chatId] === "menu") {
      if (body === "2") {
        userState[chatId] = "triagem_juridica";
        return client.sendMessage(chatId, Message.getMessage(2));
      }

      return client.sendMessage(chatId, Message.getMessage(body));
    }

    if (userState[chatId] === "triagem_juridica") {
      await client.sendSeen(chatId);

      const cliente = await buscarOuCriarCliente(chatId);

      await salvarMensagem(cliente.id, "user", body);

      const historico = await buscarHistorico(cliente.id, 10);

      const resposta = await perguntar(
        body,
        historico,
        cliente.memoria || ""
      );

      await salvarMensagem(cliente.id, "assistant", resposta);

      return client.sendMessage(chatId, resposta);
    }
  } catch (error) {
    console.error("Erro no atendimento:", error);

    return client.sendMessage(
      msg.from,
      "Tive uma falha técnica no atendimento automático. Vou encaminhar sua mensagem para análise do escritório."
    );
  }
});

client.on("message_create", async (msg) => {
  try {
    if (!msg.fromMe) return;

    const chatId = msg.to;
    const body = (msg.body || "").trim().toLowerCase();

    if (body === "encerrar atendimento") {
      userState[chatId] = "menu";

      await client.sendMessage(chatId, Message.getMessage(7));
      await sleep(1500);
      return client.sendMessage(chatId, Message.getMessage(10));
    }
  } catch (error) {
    console.error("Erro ao reativar atendimento:", error);
  }
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

client.initialize();