const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");

const URL_OABRS = "https://www2.oabrs.org.br/honorarios/";
const OUTPUT = path.join(__dirname, "honorarios-oabrs.json");

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function limpar(texto) {
  return String(texto || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseValor(texto) {
  const bruto = limpar(texto);
  if (!bruto) return null;

  const match = bruto.match(/R\$\s*([\d.]+,\d{2})/);

  return {
    bruto,
    numerico: match
      ? Number(match[1].replace(/\./g, "").replace(",", "."))
      : null
  };
}

async function gerarJSON() {
  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  try {
    const page = await browser.newPage();

    await page.goto(URL_OABRS, {
      waitUntil: "networkidle2",
      timeout: 90000
    });

    await sleep(4000);

    await page.evaluate(async () => {
      const botoes = Array.from(document.querySelectorAll("button, .card, .accordion-button, [data-toggle='collapse']"));

      for (const botao of botoes) {
        try {
          botao.click();
          await new Promise(r => setTimeout(r, 300));
        } catch {}
      }
    });

    await sleep(5000);

    const dados = await page.evaluate(() => {
      function limparInterno(texto) {
        return String(texto || "")
          .replace(/\u00a0/g, " ")
          .replace(/\s+/g, " ")
          .trim();
      }

      function parseValorInterno(texto) {
        const bruto = limparInterno(texto);
        if (!bruto) return null;

        const match = bruto.match(/R\$\s*([\d.]+,\d{2})/);

        return {
          bruto,
          numerico: match
            ? Number(match[1].replace(/\./g, "").replace(",", "."))
            : null
        };
      }

      const categorias = [];
      const blocos = Array.from(document.querySelectorAll(".card, .accordion-item, section, article"));

      for (const bloco of blocos) {
        const tituloEl = bloco.querySelector("h1, h2, h3, h4, h5, .card-header, .accordion-header, button");
        const categoria = limparInterno(tituloEl?.innerText);

        const tabelas = Array.from(bloco.querySelectorAll("table"));
        if (!categoria || tabelas.length === 0) continue;

        const itens = [];

        for (const tabela of tabelas) {
          const linhas = Array.from(tabela.querySelectorAll("tbody tr, tr"));

          for (const tr of linhas) {
            const colunas = Array.from(tr.querySelectorAll("td"));
            if (colunas.length < 2) continue;

            const numero = limparInterno(colunas[0]?.innerText);
            const descricao = limparInterno(
              tr.querySelector(".table-texto")?.innerText ||
              colunas[1]?.innerText
            );

            const valorTexto = limparInterno(
              tr.querySelector(".table-valor")?.innerText ||
              colunas[2]?.innerText
            );

            const percentual = limparInterno(
              tr.querySelector(".table-percentual")?.innerText ||
              colunas[3]?.innerText
            );

            if (!descricao || descricao.toLowerCase().includes("descrição")) continue;

            itens.push({
              numero: numero || null,
              descricao,
              valor: parseValorInterno(valorTexto),
              percentual: percentual || null
            });
          }
        }

        if (itens.length > 0) {
          categorias.push({ categoria, itens });
        }
      }

      return categorias;
    });

    const indice = [];

    for (const categoria of dados) {
      for (const item of categoria.itens) {
        indice.push({
          categoria: categoria.categoria,
          numero: item.numero,
          descricao: item.descricao,
          valor: item.valor,
          percentual: item.percentual
        });
      }
    }

    if (indice.length === 0) {
      throw new Error("Nenhum item foi coletado. A estrutura do site pode ter mudado.");
    }

    const json = {
      meta: {
        titulo: "Tabela de Honorários OAB/RS",
        fonte: URL_OABRS,
        origem: "OAB do Rio Grande do Sul",
        coletadoEm: new Date().toISOString(),
        totalCategorias: dados.length,
        totalItens: indice.length,
        usoIA: "A IA deve consultar apenas este JSON local para valores de honorários."
      },
      categorias: dados,
      indice
    };

    fs.writeFileSync(OUTPUT, JSON.stringify(json, null, 2), "utf8");

    console.log("✅ JSON gerado com sucesso!");
    console.log("📄 Arquivo:", OUTPUT);
    console.log("📌 Categorias:", dados.length);
    console.log("📌 Itens:", indice.length);
  } finally {
    await browser.close();
  }
}

gerarJSON().catch(err => {
  console.error("❌ Erro ao gerar JSON:", err.message);
  process.exit(1);
});