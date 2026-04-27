const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");

const URL = "https://www2.oabrs.org.br/honorarios/";
const OUTPUT = path.join(__dirname, "..", "honorarios-oabrs.json");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  let browser;

  try {
    browser = await puppeteer.launch({
      headless: "new", // 🔥 modo invisível moderno
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });

    const page = await browser.newPage();

    await page.goto(URL, {
      waitUntil: "domcontentloaded",
      timeout: 60000
    });

    // 🔥 espera o Vue renderizar
    await sleep(5000);

    // 🔥 abre TODOS acordeões automaticamente
    await page.evaluate(() => {
      document.querySelectorAll("button").forEach((btn) => {
        try {
          if (
            btn.innerText.match(/^\d+\./) || // tipo "4. ATIVIDADES..."
            btn.className.includes("card") ||
            btn.getAttribute("data-toggle") === "collapse"
          ) {
            btn.click();
          }
        } catch {}
      });
    });

    await sleep(3000);

    // 🔥 coleta correta baseada nas classes reais
    const data = await page.evaluate(() => {
      function limpar(t) {
        return String(t || "")
          .replace(/\s+/g, " ")
          .replace(/\u00a0/g, " ")
          .trim();
      }

      const itens = [];

      document.querySelectorAll("table tbody tr").forEach((tr) => {
        const numero = limpar(tr.querySelector("td:first-child")?.innerText);

        const descricao =
          limpar(tr.querySelector(".table-texto")?.innerText) ||
          limpar(tr.children[1]?.innerText);

        const valor =
          limpar(tr.querySelector(".table-valor")?.innerText) ||
          limpar(tr.children[2]?.innerText);

        const percentual =
          limpar(tr.querySelector(".table-percentual")?.innerText) ||
          limpar(tr.children[3]?.innerText);

        if (descricao && valor && valor.includes("R$")) {
          itens.push({
            numero,
            descricao,
            valor,
            percentual
          });
        }
      });

      return itens;
    });

    const json = {
      fonte: URL,
      origem: "OAB/RS - Tabela de honorários",
      coletadoEm: new Date().toISOString(),
      total: data.length,
      itens: data
    };

    fs.writeFileSync(OUTPUT, JSON.stringify(json, null, 2));

    console.log("✅ SUCESSO!");
    console.log("Itens:", data.length);
    console.log("Arquivo:", OUTPUT);

  } catch (err) {
    console.error("❌ ERRO:", err.message);
  } finally {
    if (browser) await browser.close();
  }
}

run();