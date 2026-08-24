import ExcelJS from "exceljs";
import { describe, expect, it, vi } from "vitest";

import {
  AdattatoreListoneQuotazioniUfficiali,
  LIMITI_LISTONE_QUOTAZIONI_UFFICIALI,
  risolviUrlFileQuotazioniUfficiali,
  USER_AGENT_LISTONE_QUOTAZIONI_UFFICIALI,
} from "./adattatore-listone-quotazioni-ufficiali.js";

async function creaXlsx(
  fogli: readonly {
    readonly nome: string;
    readonly righe: readonly (readonly (string | number | null)[])[];
  }[],
): Promise<Buffer> {
  const cartella = new ExcelJS.Workbook();
  for (const definizione of fogli) {
    const foglio = cartella.addWorksheet(definizione.nome);
    for (const riga of definizione.righe) foglio.addRow([...riga]);
  }
  return Buffer.from(await cartella.xlsx.writeBuffer());
}

function rispostaRobots(contenuto = "User-agent: *\nAllow: /"): Response {
  return new Response(contenuto, {
    status: 200,
    headers: { "content-type": "text/plain" },
  });
}

// **Validates: Requirements 4.1, 4.4**
describe("AdattatoreListoneQuotazioniUfficiali", () => {
  it("recupera l'XLSX consentito da robots.txt e traduce ruoli Classic e Mantra nel DTO canonico", async () => {
    const xlsx = await creaXlsx([
      {
        nome: "Quotazioni",
        righe: [
          ["Quotazioni ufficiali"],
          ["Id", "R", "RM", "Nome", "Squadra", "Qt.A"],
          [101, "A", "Pc;A", "Mario Rossi", "ROM", 25],
          [102, "P", "Por", "Luca Bianchi", "MIL", 8],
        ],
      },
    ]);
    const richieste: { url: string; headers: Headers }[] = [];
    const recuperaHttp = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      richieste.push({ url, headers: new Headers(init?.headers) });
      return url.endsWith("/robots.txt")
        ? rispostaRobots()
        : new Response(xlsx, {
            status: 200,
            headers: {
              "content-type":
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            },
          });
    });
    const adattatore = new AdattatoreListoneQuotazioniUfficiali({
      urlFile: "https://dati.example/listone.xlsx",
      recuperaHttp,
    });

    await expect(
      adattatore.recupera("2025/2026", new AbortController().signal),
    ).resolves.toEqual({
      nomeSorgente: adattatore.nome,
      stagione: "2025/2026",
      giocatori: [
        {
          identificativoGiocatore: "101",
          nome: "Mario Rossi",
          squadra: "ROM",
          ruoloClassic: "A",
          ruoliMantra: ["Pc", "A"],
          quotazione: 25,
        },
        {
          identificativoGiocatore: "102",
          nome: "Luca Bianchi",
          squadra: "MIL",
          ruoloClassic: "P",
          ruoliMantra: ["Por"],
          quotazione: 8,
        },
      ],
    });
    expect(adattatore.limiti).toEqual(
      LIMITI_LISTONE_QUOTAZIONI_UFFICIALI,
    );
    expect(richieste.map(({ url }) => url)).toEqual([
      "https://dati.example/robots.txt",
      "https://dati.example/listone.xlsx",
    ]);
    expect(
      richieste.every(
        ({ headers }) =>
          headers.get("user-agent") ===
          USER_AGENT_LISTONE_QUOTAZIONI_UFFICIALI,
      ),
    ).toBe(true);
  });

  it("unisce fogli Classic e Mantra separati per identificativo preferendo la quotazione Classic", async () => {
    const xlsx = await creaXlsx([
      {
        nome: "Classic",
        righe: [
          ["Id", "R", "Nome", "Squadra", "QA Classic"],
          ["7", "C", "Andrea Verdi", "INT", 18],
        ],
      },
      {
        nome: "Mantra",
        righe: [
          ["Id", "RM", "Nome", "Squadra", "QA Mantra"],
          ["7", "M;C", "Andrea Verdi", "INT", 17],
        ],
      },
    ]);
    const recuperaHttp = vi.fn(async (input: string | URL | Request) =>
      String(input).endsWith("/robots.txt")
        ? rispostaRobots()
        : new Response(xlsx, {
            headers: {
              "content-type":
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            },
          }),
    );

    const risultato = await new AdattatoreListoneQuotazioniUfficiali({
      urlFile: "https://dati.example/quotazioni",
      recuperaHttp,
    }).recupera("2025-26", new AbortController().signal);

    expect(risultato.giocatori).toEqual([
      {
        identificativoGiocatore: "7",
        nome: "Andrea Verdi",
        squadra: "INT",
        ruoloClassic: "C",
        ruoliMantra: ["M", "C"],
        quotazione: 18,
      },
    ]);
  });

  it("interpreta anche il formato CSV pubblicato, inclusi separatore e campi tra virgolette", async () => {
    const csv = [
      "Id;R;RM;Nome;Squadra;Qt.A",
      '9;D;"Dc;Ds";"De Luca, Marco";NAP;"12,0"',
    ].join("\r\n");
    const recuperaHttp = vi.fn(async (input: string | URL | Request) =>
      String(input).endsWith("/robots.txt")
        ? rispostaRobots()
        : new Response(csv, {
            headers: { "content-type": "text/csv; charset=utf-8" },
          }),
    );

    await expect(
      new AdattatoreListoneQuotazioniUfficiali({
        urlFile: "https://dati.example/listone.csv",
        recuperaHttp,
      }).recupera("2025/2026", new AbortController().signal),
    ).resolves.toEqual({
      nomeSorgente: "listone-quotazioni-ufficiali",
      stagione: "2025/2026",
      giocatori: [
        {
          identificativoGiocatore: "9",
          nome: "De Luca, Marco",
          squadra: "NAP",
          ruoloClassic: "D",
          ruoliMantra: ["Dc", "Ds"],
          quotazione: 12,
        },
      ],
    });
  });

  it("non scarica il file quando robots.txt nega il percorso", async () => {
    const recuperaHttp = vi.fn(async () =>
      rispostaRobots("User-agent: *\nDisallow: /privato/\nAllow: /pubblico/"),
    );
    const adattatore = new AdattatoreListoneQuotazioniUfficiali({
      urlFile: "https://dati.example/privato/listone.xlsx",
      recuperaHttp,
    });

    await expect(
      adattatore.recupera("2025/2026", new AbortController().signal),
    ).rejects.toMatchObject({ codice: "accesso_negato_robots" });
    expect(recuperaHttp).toHaveBeenCalledTimes(1);
  });

  it("classifica limite di frequenza, formato inatteso e risposte oltre il limite", async () => {
    const casi = [
      {
        risposta: new Response(null, { status: 429 }),
        codice: "limite_frequenza",
      },
      {
        risposta: new Response("<html>errore</html>", {
          headers: { "content-type": "text/html" },
        }),
        codice: "formato_non_supportato",
      },
      {
        risposta: new Response("troppo grande", {
          headers: {
            "content-type": "text/csv",
            "content-length": "100",
          },
        }),
        codice: "risposta_troppo_grande",
      },
    ] as const;

    for (const caso of casi) {
      const recuperaHttp = vi
        .fn()
        .mockResolvedValueOnce(rispostaRobots())
        .mockResolvedValueOnce(caso.risposta);
      await expect(
        new AdattatoreListoneQuotazioniUfficiali({
          urlFile: "https://dati.example/listone",
          dimensioneMassimaByte: 20,
          recuperaHttp,
        }).recupera("2025/2026", new AbortController().signal),
      ).rejects.toMatchObject({ codice: caso.codice });
    }
  });

  it("rispetta un segnale gia annullato senza effettuare richieste", async () => {
    const recuperaHttp = vi.fn();
    const controller = new AbortController();
    controller.abort(new Error("annullato dal worker"));

    await expect(
      new AdattatoreListoneQuotazioniUfficiali({ recuperaHttp }).recupera(
        "2025/2026",
        controller.signal,
      ),
    ).rejects.toThrow("annullato dal worker");
    expect(recuperaHttp).not.toHaveBeenCalled();
  });
});

// **Validates: Requirements 4.1**
describe("risolviUrlFileQuotazioniUfficiali", () => {
  it("risolve le forme di stagione supportate e rifiuta anni non consecutivi", () => {
    expect(risolviUrlFileQuotazioniUfficiali("2025/2026").href).toBe(
      "https://www.fantacalcio.it/api/v1/Excel/prices/20/1",
    );
    expect(risolviUrlFileQuotazioniUfficiali("2024-25").href).toBe(
      "https://www.fantacalcio.it/api/v1/Excel/prices/19/1",
    );
    expect(() => risolviUrlFileQuotazioniUfficiali("2025/2027")).toThrow(
      expect.objectContaining({ codice: "stagione_non_valida" }),
    );
  });
});
