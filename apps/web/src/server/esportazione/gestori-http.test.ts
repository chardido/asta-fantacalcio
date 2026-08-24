import { describe, expect, it, vi } from "vitest";

import { ErroreApplicativo } from "../trpc/errori";
import { gestisciEsportazione, gestisciImportazione } from "./gestori-http";

const FILE = {
  schema: "asta-fantacalcio-companion/export/v1",
  esportatoIl: "2026-08-01T10:30:00.000Z",
  configurazione: {},
  rosa: [],
  registro: [],
  firma: "a".repeat(64),
};

// **Validates: Requirements 10.5, 10.8**
describe("gestisciEsportazione", () => {
  it("restituisce un allegato JSON non memorizzabile in cache", async () => {
    const esporta = vi.fn().mockResolvedValue(FILE);

    const risposta = await gestisciEsportazione("sessione-1", { esporta });

    expect(risposta.status).toBe(200);
    expect(risposta.headers.get("content-type")).toContain("application/json");
    expect(risposta.headers.get("content-disposition")).toBe(
      'attachment; filename="asta-sessione-1.json"',
    );
    expect(risposta.headers.get("cache-control")).toBe("no-store");
    await expect(risposta.json()).resolves.toEqual(FILE);
  });

  it("espone codice e messaggio specifici quando l'export non si completa", async () => {
    const esporta = vi.fn().mockRejectedValue(
      new ErroreApplicativo(
        503,
        { codice: "esportazione_non_completata", dettagli: { ritentabile: true } },
        "L'esportazione non è stata completata. Riprova.",
      ),
    );

    const risposta = await gestisciEsportazione("sessione-1", { esporta });

    expect(risposta.status).toBe(503);
    await expect(risposta.json()).resolves.toMatchObject({
      codice: "esportazione_non_completata",
      messaggio: "L'esportazione non è stata completata. Riprova.",
      dettagli: { causa: { ritentabile: true } },
    });
  });
});

// **Validates: Requirements 10.9**
describe("gestisciImportazione", () => {
  it("inoltra il contenuto testuale e restituisce lo stato derivato importato", async () => {
    const importa = vi.fn().mockResolvedValue({
      numeroVociImportate: 2,
      budgetResiduo: 450,
    });
    const richiesta = new Request("http://localhost/api/sessioni/sessione-1/importazione", {
      method: "POST",
      body: JSON.stringify(FILE),
    });

    const risposta = await gestisciImportazione(
      richiesta,
      "sessione-1",
      { importa },
    );

    expect(risposta.status).toBe(200);
    expect(risposta.headers.get("cache-control")).toBe("no-store");
    expect(importa).toHaveBeenCalledWith("sessione-1", JSON.stringify(FILE));
    await expect(risposta.json()).resolves.toMatchObject({
      numeroVociImportate: 2,
      budgetResiduo: 450,
    });
  });

  it("restituisce il motivo descrittivo del rifiuto", async () => {
    const importa = vi.fn().mockRejectedValue(
      new ErroreApplicativo(
        400,
        {
          codice: "configurazione_divergente",
          campo: "configurazione.creditiIniziali",
          vincolo: "La configurazione deve coincidere.",
        },
        "Importazione rifiutata: configurazione_divergente.",
      ),
    );

    const risposta = await gestisciImportazione(
      new Request("http://localhost/importazione", { method: "POST", body: "{}" }),
      "sessione-1",
      { importa },
    );

    expect(risposta.status).toBe(400);
    await expect(risposta.json()).resolves.toMatchObject({
      codice: "configurazione_divergente",
      dettagli: {
        campo: "configurazione.creditiIniziali",
        vincolo: "La configurazione deve coincidere.",
      },
    });
  });
});
