import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

import { chromium, expect, test, type Page } from "@playwright/test";

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

const giocatoriRosa = [
  { nome: "Portiere E2E", ricerca: "Portiere", prezzo: "10" },
  { nome: "Difensore E2E", ricerca: "Difensore", prezzo: "20" },
  { nome: "Centrocampista E2E", ricerca: "Centrocampista", prezzo: "30" },
  { nome: "Attaccante E2E", ricerca: "Attaccante", prezzo: "40" },
] as const;

async function acquistaGiocatore(
  page: Page,
  giocatore: (typeof giocatoriRosa)[number],
): Promise<void> {
  const ricerca = page.getByRole("combobox", {
    name: "Cerca giocatore",
    exact: true,
  });
  await ricerca.fill(giocatore.ricerca);
  await page.getByRole("option", { name: giocatore.nome }).click();

  const dialogo = page.getByRole("dialog", { name: giocatore.nome });
  await expect(dialogo).toBeVisible();
  await dialogo.getByLabel("Prezzo di acquisto").fill(giocatore.prezzo);
  await dialogo.getByRole("button", { name: "Conferma acquisto" }).click();
  await expect(
    dialogo.getByRole("button", { name: "Conferma acquisto" }),
  ).toBeHidden();
  await page.keyboard.press("Escape");
  await expect(dialogo).toBeHidden();
}

const testConAmbienteCompleto = ambienteCompleto ? test : test.skip;

// **Validates: Requirements 2.1, 7.1, 10.4, 13.1**
test.describe("percorso completo dell'asta", () => {
  testConAmbienteCompleto("dalla registrazione completa la rosa e annota un acquisto avversario", async ({
    page,
  }) => {
    await page.goto("/registrati");
    await page.getByLabel("Email").fill("allenatore.e2e@example.com");
    await page.getByRole("textbox", { name: "Password", exact: true }).fill("Password-E2E-123!");
    await page.getByRole("button", { name: "Registrati" }).click();

    await expect(
      page.getByRole("heading", { name: "Le tue sessioni d'asta" }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Crea sessione" }).click();

    await page.getByLabel("Nome della sessione").fill("Asta completa E2E");
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

    await expect(page).toHaveURL(
      /\/sessioni\/[0-9a-f-]+\/configurazione$/,
    );
    const sessioneAstaId = page.url().match(/\/sessioni\/([^/]+)/)?.[1];
    expect(sessioneAstaId).toBeTruthy();
    await page.goto(`/sessioni/${sessioneAstaId}`);

    await expect(
      page.getByRole("heading", { name: "Dashboard asta" }),
    ).toBeVisible();
    await expect(page.getByText("Portiere E2E", { exact: true })).toBeVisible();

    await page.getByRole("link", { name: "Avversari" }).click();
    await page.getByLabel("Nome avversario").fill("Rivale E2E");
    await page.getByRole("button", { name: "Aggiungi avversario" }).click();
    await expect(
      page.getByRole("cell", { name: "Rivale E2E", exact: true }),
    ).toBeVisible();

    await page
      .getByRole("combobox", { name: "Giocatore disponibile", exact: true })
      .fill("Riserva");
    await page
      .getByRole("option", { name: "Riserva Avversaria E2E" })
      .click();
    await page
      .getByRole("combobox", {
        name: "Avversario assegnatario",
        exact: true,
      })
      .click();
    await page.getByRole("option", { name: "Rivale E2E" }).click();
    await page.getByLabel("Prezzo di acquisto").fill("15");
    await page.getByRole("button", { name: "Registra annotazione" }).click();

    await expect(
      page.getByRole("row").filter({ hasText: "Riserva Avversaria E2E" }),
    ).toBeVisible();
    const rigaRivale = page
      .getByRole("row")
      .filter({ hasText: "Rivale E2E" })
      .filter({ hasText: "485" });
    await expect(rigaRivale).toContainText("15");
    await expect(rigaRivale).toContainText("485");

    await page.getByRole("link", { name: "Torna alla dashboard" }).click();
    for (const giocatore of giocatoriRosa) {
      await acquistaGiocatore(page, giocatore);
    }

    await page.getByRole("link", { name: "Visualizza rosa" }).click();
    await expect(
      page.getByRole("heading", { name: "Riepilogo finale" }),
    ).toBeVisible();
    await expect(page.getByText("Sessione completata", { exact: true })).toBeVisible();
    await expect(page.getByText("Rosa completata", { exact: true })).toBeVisible();
    await expect(
      page.getByText("Budget residuo complessivo: 400 crediti."),
    ).toBeVisible();

    for (const giocatore of giocatoriRosa) {
      await expect(
        page.getByRole("cell", { name: giocatore.nome, exact: true }),
      ).toBeVisible();
    }
  });
});
