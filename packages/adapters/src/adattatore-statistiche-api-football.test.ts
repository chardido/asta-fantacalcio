import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";

import {
  AdattatoreStatisticheApiFootball,
  annoApiFootballDaStagione,
  LIMITI_STATISTICHE_API_FOOTBALL,
} from "./adattatore-statistiche-api-football.js";

function rispostaApi(
  response: readonly unknown[],
  paginaCorrente = 1,
  pagineTotali = 1,
): Response {
  return Response.json({
    get: "test",
    parameters: {},
    errors: [],
    results: response.length,
    paging: { current: paginaCorrente, total: pagineTotali },
    response,
  });
}

function giocatoreProvider(
  id: number,
  nome: string,
  teamId: number,
  leagueId: number,
  statistiche: Readonly<Record<string, unknown>>,
): unknown {
  return {
    player: { id, name: nome },
    statistics: [
      {
        team: { id: teamId, name: `Squadra ${teamId}` },
        league: { id: leagueId },
        ...statistiche,
      },
    ],
  };
}

// **Validates: Requirements 4.1, 4.4, 4.12**
describe("AdattatoreStatisticheApiFootball", () => {
  it("acquisisce a lotti per squadra, segue la paginazione e produce soltanto il DTO canonico", async () => {
    const richieste: { readonly url: URL; readonly headers: Headers }[] = [];
    const recuperaHttp = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      richieste.push({ url, headers: new Headers(init?.headers) });

      if (url.pathname === "/teams") {
        return rispostaApi([
          { team: { id: 10, name: "Roma" } },
          { team: { id: 20, name: "Inter" } },
        ]);
      }
      if (url.searchParams.get("team") === "10" && url.searchParams.get("page") === "1") {
        return rispostaApi(
          [
            giocatoreProvider(101, "Mario Rossi", 10, 135, {
              games: { appearences: 31 },
              shots: { total: 45, on: 20 },
              goals: { total: 12, conceded: 0, assists: 7, saves: 4 },
              passes: { key: 33, accuracy: "87.3%" },
              tackles: { total: 18 },
              duels: { won: 51 },
              cards: { yellow: 4, yellowred: 1, red: 2 },
              penalty: { missed: 1, saved: 2 },
            }),
          ],
          1,
          2,
        );
      }
      if (url.searchParams.get("team") === "10" && url.searchParams.get("page") === "2") {
        return rispostaApi(
          [{ player: { id: 102, name: "Luca Bianchi" }, statistics: [] }],
          2,
          2,
        );
      }
      return rispostaApi([
        giocatoreProvider(201, "Andrea Verdi", 20, 135, {
          games: { appearences: 0 },
          goals: { total: 0, assists: 0 },
          cards: { yellow: 0, yellowred: 0, red: 0 },
        }),
      ]);
    });
    const adattatore = new AdattatoreStatisticheApiFootball({
      chiaveApi: "segreto-worker",
      recuperaHttp,
    });

    await expect(
      adattatore.recupera("2025/2026", new AbortController().signal),
    ).resolves.toEqual({
      nomeSorgente: "api-football",
      stagione: "2025/2026",
      giocatori: [
        {
          identificativoSorgente: "101",
          nome: "Mario Rossi",
          squadra: "Roma",
          statFantacalcio: {
            presenze: 31,
            gol: 12,
            assist: 7,
            ammonizioni: 4,
            espulsioni: 3,
            rigoriParati: 2,
            rigoriSbagliati: 1,
          },
          statTattiche: {
            parate: 4,
            golSubiti: 0,
            duelliDifensiviVinti: 51,
            contrasti: 18,
            precisionePassaggiMilli: 873,
            passaggiChiave: 33,
            tiri: 45,
            tiriNelloSpecchio: 20,
          },
        },
        {
          identificativoSorgente: "102",
          nome: "Luca Bianchi",
          squadra: "Roma",
          statFantacalcio: {},
          statTattiche: {},
        },
        {
          identificativoSorgente: "201",
          nome: "Andrea Verdi",
          squadra: "Inter",
          statFantacalcio: {
            presenze: 0,
            gol: 0,
            assist: 0,
            ammonizioni: 0,
            espulsioni: 0,
          },
          statTattiche: {},
        },
      ],
    });

    expect(adattatore.limiti).toEqual(LIMITI_STATISTICHE_API_FOOTBALL);
    expect(richieste.map(({ url }) => `${url.pathname}?${url.searchParams}`)).toEqual([
      "/teams?league=135&season=2025",
      "/players?league=135&season=2025&team=10&page=1",
      "/players?league=135&season=2025&team=10&page=2",
      "/players?league=135&season=2025&team=20&page=1",
    ]);
    expect(
      richieste.every(
        ({ headers }) => headers.get("x-apisports-key") === "segreto-worker",
      ),
    ).toBe(true);
  });

  it("lascia assenti media voto, fantamedia, autogol, clean sheet e gol attesi non forniti dal provider", async () => {
    const recuperaHttp = vi
      .fn()
      .mockResolvedValueOnce(rispostaApi([{ team: { id: 10, name: "Roma" } }]))
      .mockResolvedValueOnce(
        rispostaApi([
          giocatoreProvider(101, "Mario Rossi", 10, 135, {
            games: { appearences: 1 },
          }),
        ]),
      );

    const risultato = await new AdattatoreStatisticheApiFootball({
      chiaveApi: "segreto",
      recuperaHttp,
    }).recupera("2025", new AbortController().signal);

    expect(risultato.giocatori[0]).toEqual({
      identificativoSorgente: "101",
      nome: "Mario Rossi",
      squadra: "Roma",
      statFantacalcio: { presenze: 1 },
      statTattiche: {},
    });
  });

  it("classifica il limite HTTP e quello dichiarato nel payload senza esporre la chiave", async () => {
    const casi = [
      new Response(null, { status: 429 }),
      Response.json({
        errors: { rateLimit: "Too many requests" },
        response: [],
      }),
    ];

    for (const risposta of casi) {
      const recuperaHttp = vi.fn().mockResolvedValueOnce(risposta);
      const operazione = new AdattatoreStatisticheApiFootball({
        chiaveApi: "chiave-che-non-deve-apparire",
        recuperaHttp,
      }).recupera("2025", new AbortController().signal);

      await expect(operazione).rejects.toMatchObject({ codice: "limite_frequenza" });
      await expect(operazione).rejects.not.toThrow(/chiave-che-non-deve-apparire/);
    }
  });

  it("rifiuta risposte strutturalmente invalide e conteggi non interi", async () => {
    const risposte = [
      Response.json({ errors: [], response: {} }),
      rispostaApi([{ team: { id: 10, name: "Roma" } }]),
      rispostaApi([
        giocatoreProvider(101, "Mario Rossi", 10, 135, {
          games: { appearences: 1.5 },
        }),
      ]),
    ];
    const recuperaHttp = vi.fn().mockImplementation(async () => risposte.shift());
    const adattatore = new AdattatoreStatisticheApiFootball({
      chiaveApi: "segreto",
      recuperaHttp,
    });

    await expect(
      adattatore.recupera("2025", new AbortController().signal),
    ).rejects.toMatchObject({ codice: "risposta_non_valida" });

    const recuperaConteggioInvalido = vi
      .fn()
      .mockResolvedValueOnce(rispostaApi([{ team: { id: 10, name: "Roma" } }]))
      .mockResolvedValueOnce(
        rispostaApi([
          giocatoreProvider(101, "Mario Rossi", 10, 135, {
            games: { appearences: 1.5 },
          }),
        ]),
      );
    await expect(
      new AdattatoreStatisticheApiFootball({
        chiaveApi: "segreto",
        recuperaHttp: recuperaConteggioInvalido,
      }).recupera("2025", new AbortController().signal),
    ).rejects.toMatchObject({ codice: "risposta_non_valida" });
  });

  it("rispetta un segnale gia annullato senza effettuare richieste", async () => {
    const recuperaHttp = vi.fn();
    const controller = new AbortController();
    controller.abort(new Error("annullato dal worker"));

    await expect(
      new AdattatoreStatisticheApiFootball({
        chiaveApi: "segreto",
        recuperaHttp,
      }).recupera("2025", controller.signal),
    ).rejects.toThrow("annullato dal worker");
    expect(recuperaHttp).not.toHaveBeenCalled();
  });
});

// **Validates: Requirements 4.1**
describe("annoApiFootballDaStagione", () => {
  it("accetta le forme applicative previste e rifiuta intervalli non consecutivi", () => {
    expect(annoApiFootballDaStagione("2025/2026")).toBe(2025);
    expect(annoApiFootballDaStagione("2025-26")).toBe(2025);
    expect(annoApiFootballDaStagione("2025")).toBe(2025);
    expect(() => annoApiFootballDaStagione("2025/2027")).toThrow(
      expect.objectContaining({ codice: "stagione_non_valida" }),
    );
  });

  it("mantiene l'anno iniziale per ogni stagione consecutiva rappresentabile", () => {
    fc.assert(
      fc.property(fc.integer({ min: 2000, max: 2098 }), (anno) => {
        expect(annoApiFootballDaStagione(`${anno}/${anno + 1}`)).toBe(anno);
        expect(annoApiFootballDaStagione(`${anno}-${String(anno + 1).slice(-2)}`)).toBe(
          anno,
        );
      }),
      { numRuns: 99, seed: 11_003 },
    );
  });
});
