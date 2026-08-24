import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it } from "vitest";

import {
  AdattatoreListoneFileLocale,
  LIMITI_LISTONE_FILE_LOCALE,
} from "./adattatore-listone-file-locale.js";
import type {
  AdattatoreSorgenteListone,
  AdattatoreSorgenteStatistiche,
} from "./sorgenti.js";

const cartelleTemporanee: string[] = [];

async function creaFile(contenuto: unknown): Promise<string> {
  const cartella = await mkdtemp(join(tmpdir(), "asta-listone-"));
  cartelleTemporanee.push(cartella);
  const percorso = join(cartella, "listone.json");
  await writeFile(percorso, JSON.stringify(contenuto), "utf8");
  return percorso;
}

afterEach(async () => {
  await Promise.all(
    cartelleTemporanee.splice(0).map((cartella) =>
      rm(cartella, { recursive: true, force: true }),
    ),
  );
});

// **Validates: Requirements 4.1, 4.4, 4.5**
describe("contratti degli adattatori", () => {
  it("espongono lo stesso confine nome/limiti/recupera per listone e statistiche", () => {
    const listone: AdattatoreSorgenteListone = {
      nome: "listone-test",
      limiti: { richiesteMassime: 1, finestraMs: 1_000 },
      async recupera(stagione) {
        return { nomeSorgente: this.nome, stagione, giocatori: [] };
      },
    };
    const statistiche: AdattatoreSorgenteStatistiche = {
      nome: "statistiche-test",
      limiti: { richiesteMassime: 10, finestraMs: 60_000 },
      async recupera(stagione) {
        return { nomeSorgente: this.nome, stagione, giocatori: [] };
      },
    };

    expect(listone.nome).toBe("listone-test");
    expect(statistiche.limiti.richiesteMassime).toBe(10);
  });
});

// **Validates: Requirements 4.1, 4.4, 4.5**
describe("AdattatoreListoneFileLocale", () => {
  it("legge un DTO canonico dal filesystem e identifica la sorgente locale", async () => {
    const percorso = await creaFile({
      nomeSorgente: "metadato-nel-file",
      stagione: "2026/2027",
      giocatori: [
        {
          identificativoGiocatore: "10",
          nome: "Mario Rossi",
          squadra: "Squadra",
          ruoloClassic: "A",
          ruoliMantra: ["Pc"],
          quotazione: 25,
        },
      ],
    });
    const adattatore = new AdattatoreListoneFileLocale(percorso);

    await expect(
      adattatore.recupera("2026/2027", new AbortController().signal),
    ).resolves.toEqual({
      nomeSorgente: adattatore.nome,
      stagione: "2026/2027",
      giocatori: [
        {
          identificativoGiocatore: "10",
          nome: "Mario Rossi",
          squadra: "Squadra",
          ruoloClassic: "A",
          ruoliMantra: ["Pc"],
          quotazione: 25,
        },
      ],
    });
    expect(adattatore.limiti).toEqual(LIMITI_LISTONE_FILE_LOCALE);
  });

  it("accetta un array canonico di giocatori e aggiunge i metadati dell'adattatore", async () => {
    const giocatori = [
      {
        identificativoGiocatore: "1",
        nome: "Portiere Uno",
        squadra: "Squadra",
        ruoloClassic: "P",
        ruoliMantra: ["Por"],
        quotazione: 8,
      },
    ];
    const percorso = await creaFile(giocatori);
    const adattatore = new AdattatoreListoneFileLocale({
      percorsoFile: percorso,
      nome: "listone-operatore",
    });

    await expect(
      adattatore.recupera("2026/2027", new AbortController().signal),
    ).resolves.toEqual({
      nomeSorgente: "listone-operatore",
      stagione: "2026/2027",
      giocatori,
    });
  });

  it("rifiuta una stagione diversa e un formato con campi specifici del provider", async () => {
    const percorsoStagione = await creaFile({
      nomeSorgente: "locale",
      stagione: "2025/2026",
      giocatori: [],
    });
    const percorsoFormato = await creaFile({
      nomeSorgente: "locale",
      stagione: "2026/2027",
      giocatori: [],
      payloadProvider: {},
    });

    await expect(
      new AdattatoreListoneFileLocale(percorsoStagione).recupera(
        "2026/2027",
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({
      codice: "stagione_non_corrispondente",
    });
    await expect(
      new AdattatoreListoneFileLocale(percorsoFormato).recupera(
        "2026/2027",
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({
      codice: "formato_non_valido",
    });
  });

  it("rifiuta JSON illeggibile e file inesistenti con errori operativi distinti", async () => {
    const cartella = await mkdtemp(join(tmpdir(), "asta-listone-"));
    cartelleTemporanee.push(cartella);
    const nonValido = join(cartella, "non-valido.json");
    await writeFile(nonValido, "{", "utf8");

    await expect(
      new AdattatoreListoneFileLocale(nonValido).recupera(
        "2026/2027",
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({
      codice: "json_non_valido",
    });
    await expect(
      new AdattatoreListoneFileLocale(join(cartella, "assente.json")).recupera(
        "2026/2027",
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({
      codice: "file_non_accessibile",
    });
  });

  it("rispetta un segnale di annullamento gia attivo senza leggere il file", async () => {
    const controller = new AbortController();
    controller.abort(new Error("annullato dal worker"));

    await expect(
      new AdattatoreListoneFileLocale("/percorso/non-usato.json").recupera(
        "2026/2027",
        controller.signal,
      ),
    ).rejects.toThrow("annullato dal worker");
  });
});
