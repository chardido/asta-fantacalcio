import type {
  RispostaListoneGrezza,
  RispostaStatisticheGrezza,
  VoceStatisticheGrezza,
} from "@asta/contracts";
import type {
  AliasGiocatorePersistito,
  RepositoryAliasGiocatori,
} from "@asta/db";
import { normalizzaDati } from "@asta/domain";
import * as fc from "fast-check";
import { describe, expect, it, vi } from "vitest";

import {
  RisolutoreIdentita,
  accoppiaIdentita,
  identificativoGiocatoreListone,
  normalizzaNomeIdentita,
  normalizzaSquadraIdentita,
} from "./risolutore-identita.js";

const listoneBase: RispostaListoneGrezza = {
  nomeSorgente: "Listone ufficiale",
  stagione: "2025-26",
  giocatori: [
    {
      identificativoGiocatore: "barella-23",
      nome: "Nicolò Barella",
      squadra: "Inter",
      ruoloClassic: "C",
      ruoliMantra: ["C"],
      quotazione: 24,
    },
    {
      identificativoGiocatore: "",
      nome: "Mario Rossi",
      squadra: "Roma",
      ruoloClassic: "A",
      ruoliMantra: ["Pc"],
      quotazione: 10,
    },
    {
      identificativoGiocatore: "senza-statistiche",
      nome: "Luca Bianchi",
      squadra: "Milan",
      ruoloClassic: "D",
      ruoliMantra: ["Dc"],
      quotazione: 8,
    },
  ],
};

function statistica(
  modifiche: Partial<VoceStatisticheGrezza> = {},
): VoceStatisticheGrezza {
  return {
    identificativoSorgente: "api-23",
    nome: "Barella, NICOLO",
    squadra: "INTER",
    statFantacalcio: { presenze: 30, assist: 7 },
    statTattiche: { passaggiChiave: 42 },
    ...modifiche,
  };
}

const statisticheBase: RispostaStatisticheGrezza = {
  nomeSorgente: "API-Football",
  stagione: "2024-25",
  giocatori: [
    statistica(),
    statistica({
      identificativoSorgente: "api-rossi",
      nome: "Rossi Mario",
      squadra: "Roma",
      statFantacalcio: { gol: 5 },
    }),
    statistica({
      identificativoSorgente: "api-sconosciuto",
      nome: "Giocatore Sconosciuto",
      squadra: "Torino",
    }),
  ],
};

describe("RisolutoreIdentita", () => {
  it("accoppia per nome e squadra normalizzati e conserva gli identificativi del listone", () => {
    const risultato = accoppiaIdentita(listoneBase, statisticheBase, []);
    const idRossi = risultato.listone.giocatori[1]?.identificativoGiocatore;

    expect(risultato.accoppiati.get("barella-23")).toMatchObject({
      identificativoSorgente: "api-23",
      nome: "Nicolò Barella",
      squadra: "Inter",
    });
    expect(idRossi).toMatch(/^[a-f0-9]{16}$/u);
    expect(risultato.accoppiati.get(idRossi ?? "")).toMatchObject({
      nome: "Mario Rossi",
      squadra: "Roma",
    });
    expect(risultato.nonRisolti).toEqual([
      expect.objectContaining({ identificativoSorgente: "api-sconosciuto" }),
    ]);
  });

  it("usa un alias persistito prima del confronto testuale", () => {
    const statistiche: RispostaStatisticheGrezza = {
      ...statisticheBase,
      giocatori: [
        statistica({
          identificativoSorgente: "api-99",
          nome: "Nome Provider Differente",
          squadra: "Internazionale Milano",
        }),
      ],
    };

    const risultato = accoppiaIdentita(listoneBase, statistiche, [
      {
        nomeSorgente: "API-Football",
        identificativoSorgente: "api-99",
        identificativoGiocatore: "barella-23",
      },
    ]);

    expect(risultato.accoppiati.get("barella-23")).toMatchObject({
      nome: "Nicolò Barella",
      squadra: "Inter",
    });
    expect(risultato.nonRisolti).toEqual([]);
  });

  it("non sceglie arbitrariamente fra identità ambigue", () => {
    const duplicato = {
      ...listoneBase.giocatori[0]!,
      identificativoGiocatore: "barella-duplicato",
    };
    const risultato = accoppiaIdentita(
      { ...listoneBase, giocatori: [listoneBase.giocatori[0]!, duplicato] },
      { ...statisticheBase, giocatori: [statistica()] },
      [],
    );

    expect(risultato.accoppiati.size).toBe(0);
    expect(risultato.nonRisolti).toHaveLength(1);
    expect(risultato.aliasDaSalvare[0]?.identificativoGiocatore).toBeNull();
  });

  it("lascia nel listone i giocatori non accoppiati con statistiche non disponibili", () => {
    const risolto = accoppiaIdentita(listoneBase, statisticheBase, []);
    const normalizzato = normalizzaDati(risolto.listone, risolto.statistiche);

    expect(normalizzato.ok).toBe(true);
    if (!normalizzato.ok) return;
    const senzaStatistiche = normalizzato.valore.giocatori.find(
      (giocatore) =>
        giocatore.identificativoGiocatore === "senza-statistiche",
    );
    expect(senzaStatistiche?.statFantacalcio.presenze).toBeNull();
    expect(senzaStatistiche?.statTattiche).toEqual([
      expect.objectContaining({
        macroReparto: "DIF",
        contrasti: null,
        stagione: "2024-25",
      }),
    ]);
  });

  it("carica e aggiorna gli alias tramite il repository persistente", async () => {
    const aliasPersistito: AliasGiocatorePersistito = {
      id: "alias-1",
      nomeSorgente: "API-Football",
      identificativoSorgente: "api-99",
      nomeNormalizzato: "differente nome provider",
      squadraNormalizzata: "internazionale milano",
      identificativoGiocatore: "barella-23",
      creatoIl: new Date("2026-03-10T12:00:00.000Z"),
      aggiornatoIl: new Date("2026-03-10T12:00:00.000Z"),
    };
    const elencaPerSorgente = vi.fn().mockResolvedValue([aliasPersistito]);
    const salva = vi.fn().mockImplementation(async (input) => ({
      ...aliasPersistito,
      ...input,
    }));
    const repository = {
      elencaPerSorgente,
      salva,
    } satisfies RepositoryAliasGiocatori;
    const risolutore = new RisolutoreIdentita(repository);
    const inputStatistiche: RispostaStatisticheGrezza = {
      ...statisticheBase,
      giocatori: [
        statistica({
          identificativoSorgente: "api-99",
          nome: "Nome Provider Differente",
          squadra: "Internazionale Milano",
        }),
      ],
    };

    const risultato = await risolutore.accoppia(listoneBase, inputStatistiche);

    expect(elencaPerSorgente).toHaveBeenCalledWith("API-Football");
    expect(salva).toHaveBeenCalledWith(
      expect.objectContaining({
        identificativoSorgente: "api-99",
        identificativoGiocatore: "barella-23",
      }),
    );
    expect(risultato.accoppiati.has("barella-23")).toBe(true);
  });
});

describe("proprietà del RisolutoreIdentita", () => {
  /** Validates: Requirements 4.16 */
  it("accoppia ogni variazione cosmetica e riordinamento dei termini mantenendo l'id listone", () => {
    const parola = fc.stringMatching(/^[a-z]{1,10}$/u);
    fc.assert(
      fc.property(
        fc.uniqueArray(parola, { minLength: 1, maxLength: 4 }),
        parola,
        fc.stringMatching(/^[a-z0-9-]{1,20}$/u),
        (termini, squadra, identificativo) => {
          const nomeListone = termini.join(" ");
          const nomeStatistiche = [...termini]
            .reverse()
            .map((termine) => termine.toUpperCase())
            .join(", ");
          const listone: RispostaListoneGrezza = {
            nomeSorgente: "listone",
            stagione: "2025-26",
            giocatori: [
              {
                identificativoGiocatore: identificativo,
                nome: nomeListone,
                squadra,
                ruoloClassic: "C",
                ruoliMantra: ["C"],
                quotazione: 1,
              },
            ],
          };
          const statistiche: RispostaStatisticheGrezza = {
            nomeSorgente: "statistiche",
            stagione: "2024-25",
            giocatori: [
              {
                identificativoSorgente: "provider-id",
                nome: nomeStatistiche,
                squadra: squadra.toUpperCase(),
                statFantacalcio: {},
                statTattiche: {},
              },
            ],
          };

          const risultato = accoppiaIdentita(listone, statistiche, []);
          expect(risultato.accoppiati.has(identificativo)).toBe(true);
        },
      ),
    );
  });

  /** Validates: Requirements 4.16 */
  it("genera un fallback SHA-1 deterministico di 16 caratteri quando manca l'id listone", () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), (nome, squadra) => {
        const giocatore = {
          identificativoGiocatore: "",
          nome,
          squadra,
        };
        const primo = identificativoGiocatoreListone(giocatore);
        const secondo = identificativoGiocatoreListone(giocatore);
        expect(primo).toBe(secondo);
        expect(primo).toMatch(/^[a-f0-9]{16}$/u);
      }),
    );
  });

  /** Validates: Requirements 4.12 */
  it("la normalizzazione dell'identità è idempotente", () => {
    fc.assert(
      fc.property(fc.string(), (testo) => {
        const nome = normalizzaNomeIdentita(testo);
        const squadra = normalizzaSquadraIdentita(testo);
        expect(normalizzaNomeIdentita(nome)).toBe(nome);
        expect(normalizzaSquadraIdentita(squadra)).toBe(squadra);
      }),
    );
  });
});
