import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

import {
  chromium,
  expect,
  test,
  type BrowserContext,
  type Locator,
  type Page,
} from "@playwright/test";

const eseguibileDocker = [
  "/usr/local/bin/docker",
  "/opt/homebrew/bin/docker",
  "/usr/bin/docker",
  String.raw`C:\Program Files\Docker\Docker\resources\bin\docker.exe`,
].find((percorso) => existsSync(percorso));
const ambienteCompleto =
  eseguibileDocker !== undefined &&
  spawnSync(eseguibileDocker, ["info"], { stdio: "ignore" }).status === 0 &&
  existsSync(chromium.executablePath());
const VIEWPORT = [360, 768, 1024, 1920] as const;
const ALTEZZA_VIEWPORT = 900;
const NOME_DATABASE_CODA = "asta-fantacalcio-coda-locale";

async function creaSessione(
  page: Page,
  suffisso: string,
): Promise<string> {
  await page.goto("/registrati");
  await page.getByLabel("Email").fill(`mobile.${suffisso}@example.com`);
  await page
    .getByRole("textbox", { name: "Password", exact: true })
    .fill("Password-E2E-123!");
  await page.getByRole("button", { name: "Registrati" }).click();

  await expect(
    page.getByRole("heading", { name: "Le tue sessioni d'asta" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Crea sessione" }).click();
  await page.getByLabel("Nome della sessione").fill(`Asta ${suffisso}`);
  await page.getByLabel("Stagione del listone").fill("e2e-2026");
  await page.getByRole("button", { name: "Continua" }).click();

  for (const reparto of [
    "Portieri",
    "Difensori",
    "Centrocampisti",
    "Attaccanti",
  ]) {
    await page.getByLabel(reparto, { exact: true }).fill("1");
  }
  await page.getByRole("button", { name: "Continua" }).click();
  await page.getByRole("button", { name: "Continua" }).click();
  await page.getByRole("button", { name: "Continua" }).click();
  await page.getByRole("button", { name: "Salva configurazione" }).click();

  await expect(page).toHaveURL(/\/sessioni\/[0-9a-f-]+\/configurazione$/);
  const sessioneAstaId = page.url().match(/\/sessioni\/([^/]+)/)?.[1];
  expect(sessioneAstaId).toBeTruthy();
  await page.goto(`/sessioni/${sessioneAstaId}`);
  await expect(
    page.getByRole("heading", { name: "Dashboard asta" }),
  ).toBeVisible();
  return sessioneAstaId!;
}

async function apriScheda(
  page: Page,
  ricerca: string,
  nomeGiocatore: string,
): Promise<Locator> {
  const campo = page.getByRole("combobox", {
    name: "Cerca giocatore",
    exact: true,
  });
  await campo.fill(ricerca);
  await page.getByRole("option", { name: nomeGiocatore }).click();
  const dialogo = page.getByRole("dialog", { name: nomeGiocatore });
  await expect(dialogo).toBeVisible();
  await expect(dialogo.getByLabel("Prezzo di acquisto")).toBeVisible();
  return dialogo;
}

async function chiudiScheda(page: Page, dialogo: Locator): Promise<void> {
  await page.keyboard.press("Escape");
  await expect(dialogo).toBeHidden();
}

async function verificaAssenzaScorrimentoOrizzontale(
  page: Page,
): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    )
    .toBe(true);
}

async function verificaBersagliInterattivi(
  area: Locator,
  larghezzaViewport: number,
): Promise<void> {
  const violazioni = await area.evaluate((radice, larghezza) => {
    const selettore = [
      "button",
      "a[href]",
      "input:not([type='hidden'])",
      "select",
      "textarea",
      "[role='button']",
      "[role='combobox']",
    ].join(",");
    const elementi = [...new Set(radice.querySelectorAll<HTMLElement>(selettore))];

    return elementi.flatMap((elemento) => {
      const stile = getComputedStyle(elemento);
      const rettangolo = elemento.getBoundingClientRect();
      if (
        stile.display === "none" ||
        stile.visibility === "hidden" ||
        rettangolo.width === 0 ||
        rettangolo.height === 0
      ) {
        return [];
      }

      const etichettaDiretta = elemento.closest("label");
      const id = elemento.getAttribute("id");
      const etichettePerId =
        id === null
          ? []
          : [...document.querySelectorAll<HTMLElement>(`label[for="${CSS.escape(id)}"]`)];
      const candidati = [elemento, etichettaDiretta, ...etichettePerId].filter(
        (candidato): candidato is HTMLElement => candidato !== null,
      );
      const bersaglio = candidati
        .map((candidato) => candidato.getBoundingClientRect())
        .sort((a, b) => b.width * b.height - a.width * a.height)[0]!;
      const descrizione =
        elemento.getAttribute("aria-label") ??
        elemento.getAttribute("name") ??
        elemento.textContent?.trim() ??
        elemento.tagName;
      const problemi: string[] = [];
      if (bersaglio.width < 44 || bersaglio.height < 44) {
        problemi.push(
          `${descrizione}: ${Math.round(bersaglio.width)}x${Math.round(bersaglio.height)}`,
        );
      }
      if (bersaglio.left < 0 || bersaglio.right > larghezza) {
        problemi.push(
          `${descrizione}: fuori viewport (${Math.round(bersaglio.left)}..${Math.round(bersaglio.right)})`,
        );
      }
      return problemi;
    });
  }, larghezzaViewport);

  expect(violazioni).toEqual([]);
}

async function numeroOperazioniIndexedDb(page: Page): Promise<number> {
  return page.evaluate(
    ({ nomeDatabase }) =>
      new Promise<number>((resolve, reject) => {
        const richiesta = indexedDB.open(nomeDatabase);
        richiesta.onerror = () => reject(richiesta.error);
        richiesta.onsuccess = () => {
          const database = richiesta.result;
          const transazione = database.transaction("operazioni", "readonly");
          const conteggio = transazione.objectStore("operazioni").count();
          conteggio.onerror = () => reject(conteggio.error);
          conteggio.onsuccess = () => {
            database.close();
            resolve(conteggio.result);
          };
        };
      }),
    { nomeDatabase: NOME_DATABASE_CODA },
  );
}

async function accodaAcquistoOffline(
  contesto: BrowserContext,
  page: Page,
  dialogo: Locator,
  prezzo: string,
): Promise<void> {
  await contesto.setOffline(true);
  await dialogo.getByLabel("Prezzo di acquisto").fill(prezzo);
  await dialogo.getByRole("button", { name: "Conferma acquisto" }).click();
  await expect(page.getByText("Acquisto in attesa", { exact: true })).toBeVisible();
}

// **Validates: Requirements 12.1, 12.2**
test.describe("responsive", () => {
  test.skip(
    !ambienteCompleto,
    "Richiede Docker, PostgreSQL Testcontainers e Chromium Playwright.",
  );

  test("ricerca, scheda e registrazione restano utilizzabili nei viewport supportati", async ({
    page,
  }) => {
    await creaSessione(page, "responsive");

    for (const larghezza of VIEWPORT) {
      await page.setViewportSize({ width: larghezza, height: ALTEZZA_VIEWPORT });
      await verificaAssenzaScorrimentoOrizzontale(page);

      const ricerca = page.getByRole("region", { name: "Ricerca giocatori" });
      await verificaBersagliInterattivi(ricerca, larghezza);
      const dialogo = await apriScheda(page, "Attaccante", "Attaccante E2E");

      await verificaAssenzaScorrimentoOrizzontale(page);
      await verificaBersagliInterattivi(dialogo, larghezza);
      await expect(dialogo.getByText("Registra acquisto", { exact: true })).toBeVisible();
      await chiudiScheda(page, dialogo);
    }
  });
});

// **Validates: Requirements 12.3, 12.4**
test.describe("coda offline", () => {
  test.skip(
    !ambienteCompleto,
    "Richiede Docker, PostgreSQL Testcontainers e Chromium Playwright.",
  );

  test("conserva fino a 50 acquisti e rifiuta il cinquantunesimo senza alterare la coda", async ({
    context,
    page,
  }) => {
    await creaSessione(page, "coda-piena");
    const dialogo = await apriScheda(page, "Portiere", "Portiere E2E");
    await context.setOffline(true);

    for (let indice = 1; indice <= 50; indice += 1) {
      await dialogo.getByRole("button", { name: "Conferma acquisto" }).click();
      await expect(
        page.getByLabel(`${indice} operazioni in attesa di invio`),
      ).toBeVisible();
    }

    await expect.poll(() => numeroOperazioniIndexedDb(page)).toBe(50);
    await dialogo.getByRole("button", { name: "Conferma acquisto" }).click();
    await expect(
      dialogo.getByText(
        "La coda locale è piena: sono già presenti 50 operazioni non inviate.",
      ),
    ).toBeVisible();
    await expect.poll(() => numeroOperazioniIndexedDb(page)).toBe(50);
  });

  // **Validates: Requirements 12.3, 12.5, 12.6**
  test("reinvia un acquisto al ritorno online e lo rimuove da IndexedDB", async ({
    context,
    page,
  }) => {
    await creaSessione(page, "reinvio");
    const dialogo = await apriScheda(page, "Portiere", "Portiere E2E");
    await accodaAcquistoOffline(context, page, dialogo, "10");
    await expect(page.getByLabel("1 operazioni in attesa di invio")).toBeVisible();
    await expect.poll(() => numeroOperazioniIndexedDb(page)).toBe(1);

    await context.setOffline(false);
    await expect
      .poll(() => numeroOperazioniIndexedDb(page), { timeout: 20_000 })
      .toBe(0);
    await expect(page.getByLabel("1 operazioni in attesa di invio")).toBeHidden();
    await expect(
      dialogo.getByRole("button", { name: "Conferma acquisto" }),
    ).toBeHidden();
  });

  // **Validates: Requirements 12.8, 12.9**
  test("mantiene entrambe le versioni e risolve un conflitto scegliendo il server", async ({
    browser,
    context,
    page,
  }) => {
    const sessioneAstaId = await creaSessione(page, "conflitto");
    const dialogoLocale = await apriScheda(
      page,
      "Difensore",
      "Difensore E2E",
    );
    await context.setOffline(true);

    const statoAutenticato = await context.storageState();
    const contestoServer = await browser.newContext({ storageState: statoAutenticato });
    const paginaServer = await contestoServer.newPage();
    try {
      await paginaServer.goto(`/sessioni/${sessioneAstaId}`);
      const dialogoServer = await apriScheda(
        paginaServer,
        "Difensore",
        "Difensore E2E",
      );
      await dialogoServer.getByLabel("Prezzo di acquisto").fill("20");
      await dialogoServer
        .getByRole("button", { name: "Conferma acquisto" })
        .click();
      await expect(
        dialogoServer.getByRole("button", { name: "Conferma acquisto" }),
      ).toBeHidden();

      await dialogoLocale.getByLabel("Prezzo di acquisto").fill("30");
      await dialogoLocale
        .getByRole("button", { name: "Conferma acquisto" })
        .click();
      await expect(page.getByLabel("1 operazioni in attesa di invio")).toBeVisible();
      await expect.poll(() => numeroOperazioniIndexedDb(page)).toBe(1);

      await context.setOffline(false);
      const conflitto = page.getByRole("dialog", {
        name: "Conflitto per Difensore E2E",
      });
      await expect(conflitto).toBeVisible({ timeout: 20_000 });
      await expect(conflitto.getByText("Prezzo: 30", { exact: true })).toBeVisible();
      await expect(conflitto.getByText("Prezzo: 20", { exact: true })).toBeVisible();
      await expect(page.getByLabel("1 operazioni in attesa di invio")).toBeVisible();
      await expect.poll(() => numeroOperazioniIndexedDb(page)).toBe(1);

      await conflitto.getByRole("button", { name: "Conserva server" }).click();
      await expect(conflitto).toBeHidden();
      await expect.poll(() => numeroOperazioniIndexedDb(page)).toBe(0);
      await expect(page.getByLabel("1 operazioni in attesa di invio")).toBeHidden();

      await page.goto(`/sessioni/${sessioneAstaId}/rosa`);
      const rigaDifensore = page
        .getByRole("row")
        .filter({ hasText: "Difensore E2E" });
      await expect(rigaDifensore).toContainText("20");
      await expect(rigaDifensore).not.toContainText("30");
    } finally {
      await contestoServer.close();
    }
  });
});
