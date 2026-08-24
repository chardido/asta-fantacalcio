import type {
  AdattatoreSorgenteListone,
  AdattatoreSorgenteStatistiche,
} from "@asta/adapters";
import type {
  PubblicazioneSnapshotAtomica,
  StatoFreschezzaPersistito,
  TentativoIngestioneDaRegistrare,
} from "@asta/db";
import type {
  RispostaListoneGrezza,
  RispostaStatisticheGrezza,
} from "@asta/contracts";
import { describe, expect, it, vi } from "vitest";

import { accoppiaIdentita } from "./risolutore-identita.js";
import { PipelineIngestione } from "./pipeline-ingestione.js";

const ISTANTE = new Date("2026-03-10T05:00:00.000Z");

function rispostaListone(
  giocatori: RispostaListoneGrezza["giocatori"] = [
    {
      identificativoGiocatore: "10",
      nome: "Mario Rossi",
      squadra: "Roma",
      ruoloClassic: "A",
      ruoliMantra: ["Pc"],
      quotazione: 24,
    },
  ],
): RispostaListoneGrezza {
  return {
    nomeSorgente: "listone-test",
    stagione: "2026/2027",
    giocatori,
  };
}

function rispostaStatistiche(): RispostaStatisticheGrezza {
  return {
    nomeSorgente: "statistiche-test",
    stagione: "2025/2026",
    giocatori: [
      {
        identificativoSorgente: "api-10",
        nome: "Mario Rossi",
        squadra: "Roma",
        statFantacalcio: {
          mediaVotoMilli: 6300,
          fantamediaMilli: 7100,
          presenze: 30,
          gol: 12,
          assist: 4,
        },
        statTattiche: {
          tiri: 60,
          tiriNelloSpecchio: 30,
        },
      },
    ],
  };
}

function creaScenario(opzioni?: {
  readonly listone?: RispostaListoneGrezza;
  readonly erroreStatistiche?: Error;
  readonly lockAcquisito?: boolean;
  readonly freschezze?: readonly StatoFreschezzaPersistito[];
}) {
  const listoneRisposta = opzioni?.listone ?? rispostaListone();
  const listone: AdattatoreSorgenteListone = {
    nome: listoneRisposta.nomeSorgente,
    limiti: { richiesteMassime: 1, finestraMs: 86_400_000 },
    recupera: vi.fn(async () => listoneRisposta),
  };
  const statisticheRisposta = rispostaStatistiche();
  const statistiche: AdattatoreSorgenteStatistiche = {
    nome: statisticheRisposta.nomeSorgente,
    limiti: { richiesteMassime: 100, finestraMs: 86_400_000 },
    recupera: vi.fn(async () => {
      if (opzioni?.erroreStatistiche) throw opzioni.erroreStatistiche;
      return statisticheRisposta;
    }),
  };
  const tentativi: TentativoIngestioneDaRegistrare[] = [];
  const pubblicazioni: PubblicazioneSnapshotAtomica[] = [];
  const freschezze = new Map(
    (opzioni?.freschezze ?? []).map((stato) => [
      `${stato.nomeSorgente}|${stato.stagione}`,
      stato,
    ]),
  );
  const acquisisciLock = vi.fn(async () => opzioni?.lockAcquisito ?? true);
  const rilasciaLock = vi.fn(async () => undefined);

  const pipeline = new PipelineIngestione(
    {
      stagioneListone: "2026/2027",
      stagioneStatistiche: "2025/2026",
    },
    {
      listone,
      statistiche,
      limitatore: {
        esegui: async (_sorgente, _stagione, operazione) =>
          operazione(new AbortController().signal),
      },
      risolutoreIdentita: {
        accoppia: async (rispostaListone_, rispostaStatistiche_) =>
          accoppiaIdentita(rispostaListone_, rispostaStatistiche_, []),
      },
      freschezza: {
        trova: async (nomeSorgente, stagione) =>
          freschezze.get(`${nomeSorgente}|${stagione}`) ?? null,
      },
      ingestione: {
        acquisisciLock,
        rilasciaLock,
        registraTentativo: async (tentativo) => {
          tentativi.push(tentativo);
          return {
            nomeSorgente: tentativo.nomeSorgente,
            stagione: tentativo.stagione,
            ultimoSuccessoIl:
              tentativo.esito === "successo" ? tentativo.terminatoIl : null,
            ultimoTentativoIl: tentativo.terminatoIl,
            ultimoEsito: tentativo.esito,
            dettaglioErrore: tentativo.dettaglioErrore,
            numGiocatoriAcquisiti: tentativo.numGiocatoriAcquisiti,
            budgetToken: 0,
            prossimoTentativoNonPrimaDi: null,
            aggiornatoIl: tentativo.terminatoIl,
          };
        },
        pubblicaSnapshot: async (pubblicazione) => {
          pubblicazioni.push(pubblicazione);
          return {
            id: "00000000-0000-4000-8000-000000000001",
            ...pubblicazione.snapshot,
            stato: "consultabile",
            creatoIl: pubblicazione.pubblicatoIl,
            giocatori: pubblicazione.giocatori.map((giocatore) => ({
              ...giocatore,
              snapshotId: "00000000-0000-4000-8000-000000000001",
            })),
          };
        },
      },
      ora: () => new Date(ISTANTE),
      creaIdentificativoEsecuzione: () =>
        "00000000-0000-4000-8000-000000000099",
    },
  );

  return {
    pipeline,
    listone,
    statistiche,
    tentativi,
    pubblicazioni,
    acquisisciLock,
    rilasciaLock,
  };
}

function freschezzaRecente(
  nomeSorgente: string,
  stagione: string,
): StatoFreschezzaPersistito {
  return {
    nomeSorgente,
    stagione,
    ultimoSuccessoIl: ISTANTE,
    ultimoTentativoIl: new Date(ISTANTE.getTime() - 60_000),
    ultimoEsito: "successo",
    dettaglioErrore: null,
    numGiocatoriAcquisiti: 1,
    budgetToken: 1,
    prossimoTentativoNonPrimaDi: null,
    aggiornatoIl: ISTANTE,
  };
}

describe("PipelineIngestione", () => {
  it("pubblica uno snapshot completo con i due successi nella stessa operazione atomica", async () => {
    const scenario = creaScenario();

    const esito = await scenario.pipeline.esegui();

    expect(esito).toEqual({
      stato: "pubblicato",
      snapshotId: "00000000-0000-4000-8000-000000000001",
      numGiocatori: 1,
    });
    expect(scenario.pubblicazioni).toHaveLength(1);
    expect(scenario.pubblicazioni[0]).toMatchObject({
      snapshot: {
        stato: "in_costruzione",
        stagioneListone: "2026/2027",
        numGiocatori: 1,
      },
      acquisizioni: [
        { nomeSorgente: "listone-test", esito: "successo" },
        { nomeSorgente: "statistiche-test", esito: "successo" },
      ],
    });
    expect(scenario.pubblicazioni[0]?.snapshot.hashContenuto).toMatch(
      /^[a-f0-9]{64}$/,
    );
    expect(scenario.tentativi).toEqual([]);
    expect(scenario.rilasciaLock).toHaveBeenCalledOnce();
  });

  it("tenta entrambi i canali e non tocca gli snapshot quando uno fallisce", async () => {
    const scenario = creaScenario({
      erroreStatistiche: new Error("provider non disponibile"),
    });

    const esito = await scenario.pipeline.esegui();

    expect(esito).toEqual({ stato: "fallito", esiti: ["successo", "errore"] });
    expect(scenario.listone.recupera).toHaveBeenCalledOnce();
    expect(scenario.statistiche.recupera).toHaveBeenCalledOnce();
    expect(scenario.pubblicazioni).toEqual([]);
    expect(scenario.tentativi.map((tentativo) => tentativo.esito)).toEqual([
      "successo",
      "errore",
    ]);
  });

  it("rifiuta un listone vuoto scrivendo soltanto esiti di freschezza negativi", async () => {
    const scenario = creaScenario({ listone: rispostaListone([]) });

    const esito = await scenario.pipeline.esegui();

    expect(esito).toEqual({
      stato: "fallito",
      esiti: ["dati_non_validi", "dati_non_validi"],
    });
    expect(scenario.pubblicazioni).toEqual([]);
    expect(scenario.tentativi).toHaveLength(2);
  });

  it("non esegue la pipeline se entrambi i canali hanno un tentativo recente", async () => {
    const scenario = creaScenario({
      freschezze: [
        freschezzaRecente("listone-test", "2026/2027"),
        freschezzaRecente("statistiche-test", "2025/2026"),
      ],
    });

    await expect(scenario.pipeline.eseguiSeNecessario()).resolves.toEqual({
      stato: "non_necessario",
    });
    expect(scenario.acquisisciLock).not.toHaveBeenCalled();
  });

  it("non chiama le sorgenti quando un altro worker possiede il lock", async () => {
    const scenario = creaScenario({ lockAcquisito: false });

    await expect(scenario.pipeline.esegui()).resolves.toEqual({
      stato: "lock_non_acquisito",
    });
    expect(scenario.listone.recupera).not.toHaveBeenCalled();
    expect(scenario.statistiche.recupera).not.toHaveBeenCalled();
    expect(scenario.rilasciaLock).not.toHaveBeenCalled();
  });
});
