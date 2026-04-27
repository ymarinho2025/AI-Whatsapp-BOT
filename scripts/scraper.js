const puppeteer = require("puppeteer");
const fs = require("fs");

const URL = "https://www2.oabrs.org.br/honorarios/";

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

(async () => {
  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  const page = await browser.newPage();

  await page.setViewport({ width: 1366, height: 768 });

  console.log("1/5 - Abrindo site...");
  await page.goto(URL, {
    waitUntil: "networkidle2",
    timeout: 60000
  });

  console.log("2/5 - Aguardando cards...");
  await page.waitForSelector(".table-card-dropdown", { timeout: 30000 });

  const totalCards = await page.$$eval(".table-card-dropdown", els => els.length);
  console.log(`Cards encontrados: ${totalCards}`);

  const resultado = [];

  for (let i = 0; i < totalCards; i++) {
    console.log(`Abrindo card ${i + 1}/${totalCards}...`);

    const cards = await page.$$(".table-card-dropdown");
    const card = cards[i];

    await card.evaluate(el => el.scrollIntoView({ behavior: "instant", block: "center" }));
    await sleep(700);

    await card.click();
    await sleep(1500);

    const dados = await page.evaluate((index) => {
      const cards = Array.from(document.querySelectorAll(".table-card-dropdown"));
      const card = cards[index];

      if (!card) return null;

      const texto = card.innerText
        .replace(/\n{3,}/g, "\n\n")
        .trim();

      const linhas = texto
        .split("\n")
        .map(l => l.trim())
        .filter(Boolean);

      const titulo = linhas[0] || `Tabela ${index + 1}`;

      return {
        numero: index + 1,
        titulo,
        textoCompleto: texto,
        linhas
      };
    }, i);

    if (dados && dados.textoCompleto) {
      resultado.push(dados);
    }
  }

  const saida = {
    fonte: URL,
    geradoEm: new Date().toISOString(),
    totalSecoes: resultado.length,
    secoes: resultado
  };

  fs.writeFileSync(
    "honorarios-oabrs.json",
    JSON.stringify(saida, null, 2),
    "utf8"
  );

  console.log("✅ JSON gerado com sucesso!");
  console.log(`📌 Seções: ${resultado.length}`);

  await browser.close();
})();