import type { ConfigurazioneAsta, VoceRegistro } from "@asta/contracts";
import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import {
  PrismaGestoreTransazioniRegistro,
  PrismaRepositoryAliasGiocatori,
  PrismaRepositoryAvversari,
  PrismaRepositoryConsultazioniScheda,
  PrismaRepositoryFreschezza,
  PrismaRepositoryObiettivi,
  PrismaRepositoryRegistro,
  PrismaRepositorySessioniAsta,
  PrismaRepositorySessioniAuth,
  PrismaRepositorySnapshot,
  PrismaRepositoryUtenti,
  creaRepositories,
} from "./repositories.js";

const istante = new Date("2026-03-10T12:00:00.000Z");
const configurazione: ConfigurazioneAsta = {
  nome: "Asta principale",
  tipoAsta: "chiamata",
  modalitaGioco: "classic",
  numeroPartecipanti: 8,
  creditiIniziali: 500,
  modificatoreDifesa: false,
  composizioneRosa: { P: 3, D: 8, C: 8, A: 6 },
  quoteReparto: { POR: 8, DIF: 20, CEN: 32, ATT: 40 },
  pesiValutazione: {
    quotazione: 30,
    budgetReparto: 25,
    budgetTotale: 15,
    slotResidui: 10,
    statistiche: 20,
    audacia: 20,
  },
};

const rigaSessione = {
  id: "00000000-0000-4000-8000-000000000002",
  utenteId: "00000000-0000-4000-8000-000000000001",
  stagioneListone: "2025-26",
  stato: "in_corso" as const,
  nome: configurazione.nome,
  tipoAsta: configurazione.tipoAsta,
  modalitaGioco: configurazione.modalitaGioco,
  numeroPartecipanti: configurazione.numeroPartecipanti,
  creditiIniziali: configurazione.creditiIniziali,
  modificatoreDifesa: configurazione.modificatoreDifesa,
  composizioneRosa: configurazione.composizioneRosa,
  quoteReparto: configurazione.quoteReparto,
  pesiValutazione: configurazione.pesiValutazione,
  avvisiInformativiAttivi: true,
  creatoIl: istante,
  aggiornatoIl: istante,
};

const statFantacalcio = {
  mediaVotoMilli: 6250,
  fantamediaMilli: 7100,
  presenze: 30,
  gol: 8,
  assist: 5,
  ammonizioni: 3,
  espulsioni: 0,
  rigoriParati: 0,
  rigoriSbagliati: 1,
  autogol: 0,
  stagione: "2024-25",
} as const;

const statTattiche = {
  macroReparto: "ATT" as const,
  gol: 8,
  tiri: 52,
  tiriNelloSpecchio: 26,
  golAttesiMilli: null,
  stagione: "2024-25",
};

const rigaGiocatore = {
  snapshotId: "00000000-0000-4000-8000-000000000010",
  identificativoGiocatore: "player-1",
  nome: "Mario Rossi",
  nomeRicerca: "mario rossi",
  squadra: "Roma",
  ruoloClassic: "A",
  ruoliMantra: ["Pc"],
  quotazione: 25,
  statFantacalcio,
  statTattiche,
};

const rigaSnapshot = {
  id: rigaGiocatore.snapshotId,
  stagioneListone: "2025-26",
  stagioneStatistiche: "2024-25",
  stato: "consultabile" as const,
  creatoIl: istante,
  numGiocatori: 1,
  nomeSorgenteListone: "Listone",
  nomeSorgenteStatistiche: "Statistiche",
  hashContenuto: "a".repeat(64),
  giocatori: [rigaGiocatore],
};

function prismaMock(overrides: Record<string, unknown>): PrismaClient {
  return overrides as unknown as PrismaClient;
}

describe("repository sessioni d'asta: confini JSONB", () => {
  it("valida e conserva invariata la configurazione in scrittura e lettura", async () => {
    const create = vi.fn().mockResolvedValue(rigaSessione);
    const repository = new PrismaRepositorySessioniAsta(
      prismaMock({ sessioneAsta: { create } }),
    );

    const salvata = await repository.crea({
      utenteId: rigaSessione.utenteId,
      stagioneListone: rigaSessione.stagioneListone,
      configurazione,
    });

    expect(salvata.configurazione).toEqual(configurazione);
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        composizioneRosa: configurazione.composizioneRosa,
        quoteReparto: configurazione.quoteReparto,
        pesiValutazione: configurazione.pesiValutazione,
      }),
    });
  });

  it("rifiuta con Zod una configurazione JSONB non valida prima della scrittura", async () => {
    const create = vi.fn();
    const repository = new PrismaRepositorySessioniAsta(
      prismaMock({ sessioneAsta: { create } }),
    );
    const nonValida = {
      ...configurazione,
      quoteReparto: { ...configurazione.quoteReparto, ATT: 39 },
    } as ConfigurazioneAsta;

    await expect(
      repository.crea({
        utenteId: rigaSessione.utenteId,
        stagioneListone: rigaSessione.stagioneListone,
        configurazione: nonValida,
      }),
    ).rejects.toMatchObject({ name: "ZodError" });
    expect(create).not.toHaveBeenCalled();
  });

  it("rifiuta con Zod JSONB corrotti letti dal database", async () => {
    const findUnique = vi.fn().mockResolvedValue({
      ...rigaSessione,
      composizioneRosa: { ...configurazione.composizioneRosa, P: 0 },
    });
    const repository = new PrismaRepositorySessioniAsta(
      prismaMock({ sessioneAsta: { findUnique } }),
    );

    await expect(repository.trovaPerId(rigaSessione.id)).rejects.toMatchObject({
      name: "ZodError",
    });
  });

  it("applica conteggio, controllo nome e creazione nella stessa transazione serializzata per utente", async () => {
    const queryRaw = vi.fn().mockResolvedValue([{ id: rigaSessione.utenteId }]);
    const count = vi.fn().mockResolvedValue(3);
    const findMany = vi.fn().mockResolvedValue([{ nome: "Asta principale" }]);
    const create = vi.fn().mockResolvedValue({
      ...rigaSessione,
      nome: "Asta principale - copia",
    });
    const transaction = {
      $queryRaw: queryRaw,
      sessioneAsta: { count, findMany, create },
    };
    const $transaction = vi
      .fn()
      .mockImplementation((operazione: (tx: typeof transaction) => unknown) =>
        operazione(transaction),
      );
    const repository = new PrismaRepositorySessioniAsta(
      prismaMock({ $transaction }),
    );

    const esito = await repository.creaEntroLimite(
      {
        utenteId: rigaSessione.utenteId,
        stagioneListone: rigaSessione.stagioneListone,
        configurazione,
      },
      50,
      ["Asta principale", "Asta principale - copia"],
    );

    expect(esito).toMatchObject({
      ok: true,
      sessione: { configurazione: { nome: "Asta principale - copia" } },
    });
    expect($transaction).toHaveBeenCalledOnce();
    expect(queryRaw).toHaveBeenCalledOnce();
    expect(queryRaw).toHaveBeenCalledBefore(count);
    expect(count).toHaveBeenCalledBefore(findMany);
    expect(findMany).toHaveBeenCalledBefore(create);
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        utenteId: rigaSessione.utenteId,
        nome: "Asta principale - copia",
      }),
    });
  });

  it("non inserisce quando il conteggio transazionale ha raggiunto il limite", async () => {
    const queryRaw = vi.fn().mockResolvedValue([{ id: rigaSessione.utenteId }]);
    const count = vi.fn().mockResolvedValue(50);
    const findMany = vi.fn();
    const create = vi.fn();
    const transaction = {
      $queryRaw: queryRaw,
      sessioneAsta: { count, findMany, create },
    };
    const $transaction = vi
      .fn()
      .mockImplementation((operazione: (tx: typeof transaction) => unknown) =>
        operazione(transaction),
      );
    const repository = new PrismaRepositorySessioniAsta(
      prismaMock({ $transaction }),
    );

    await expect(
      repository.creaEntroLimite(
        {
          utenteId: rigaSessione.utenteId,
          stagioneListone: rigaSessione.stagioneListone,
          configurazione,
        },
        50,
        [configurazione.nome],
      ),
    ).resolves.toEqual({ ok: false, motivo: "limite_sessioni" });
    expect(findMany).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });
});

describe("repository consultazioni scheda", () => {
  it("registra sessione, giocatore e istante senza alterare i dati", async () => {
    const consultazione = {
      id: "00000000-0000-4000-8000-000000000020",
      sessioneAstaId: rigaSessione.id,
      identificativoGiocatore: "player-1",
      istante,
    };
    const create = vi.fn().mockResolvedValue(consultazione);
    const repository = new PrismaRepositoryConsultazioniScheda(
      prismaMock({ consultazioneScheda: { create } }),
    );

    await expect(
      repository.registra({
        sessioneAstaId: rigaSessione.id,
        identificativoGiocatore: "player-1",
        istante,
      }),
    ).resolves.toEqual(consultazione);
    expect(create).toHaveBeenCalledWith({
      data: {
        sessioneAstaId: rigaSessione.id,
        identificativoGiocatore: "player-1",
        istante,
      },
    });
  });
});

describe("repository snapshot: confini JSONB", () => {
  it("legge lo snapshot corrente esclusivamente attraverso il puntatore pubblicato", async () => {
    const findUnique = vi.fn().mockResolvedValue({ snapshot: rigaSnapshot });
    const repository = new PrismaRepositorySnapshot(
      prismaMock({ pubblicazioneSnapshot: { findUnique } }),
    );

    await expect(repository.trovaPubblicato("2025-26")).resolves.toEqual(
      expect.objectContaining({
        id: rigaSnapshot.id,
        stato: "consultabile",
        giocatori: expect.arrayContaining([
          expect.objectContaining({ identificativoGiocatore: "player-1" }),
        ]),
      }),
    );
    expect(findUnique).toHaveBeenCalledWith({
      where: { stagioneListone: "2025-26" },
      include: { snapshot: { include: { giocatori: true } } },
    });
  });

  it("non espone uno snapshot in costruzione anche se il puntatore fosse incoerente", async () => {
    const repository = new PrismaRepositorySnapshot(
      prismaMock({
        pubblicazioneSnapshot: {
          findUnique: vi.fn().mockResolvedValue({
            snapshot: { ...rigaSnapshot, stato: "in_costruzione" },
          }),
        },
      }),
    );

    await expect(repository.trovaPubblicato("2025-26")).resolves.toBeNull();
  });

  it("valida statistiche in scrittura e in lettura senza alterarle", async () => {
    const createMany = vi.fn().mockResolvedValue({ count: 1 });
    const findUnique = vi.fn().mockResolvedValue(rigaSnapshot);
    const repository = new PrismaRepositorySnapshot(
      prismaMock({
        giocatoreSnapshot: { createMany },
        snapshotDati: { findUnique },
      }),
    );

    await repository.aggiungiGiocatori(rigaSnapshot.id, [
      {
        ...rigaGiocatore,
        ruoloClassic: "A",
        ruoliMantra: ["Pc"],
      },
    ]);
    const letto = await repository.trovaPerId(rigaSnapshot.id);

    expect(createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          statFantacalcio,
          statTattiche,
        }),
      ],
    });
    expect(letto?.giocatori[0]?.statFantacalcio).toEqual(statFantacalcio);
    expect(letto?.giocatori[0]?.statTattiche).toEqual(statTattiche);
  });

  it("rifiuta statistiche non intere sia prima della scrittura sia dopo la lettura", async () => {
    const createMany = vi.fn();
    const repositoryScrittura = new PrismaRepositorySnapshot(
      prismaMock({ giocatoreSnapshot: { createMany } }),
    );
    const giocatoreNonValido = {
      ...rigaGiocatore,
      ruoloClassic: "A" as const,
      ruoliMantra: ["Pc" as const],
      statFantacalcio: { ...statFantacalcio, presenze: 1.5 },
    };

    await expect(
      repositoryScrittura.aggiungiGiocatori(rigaSnapshot.id, [
        giocatoreNonValido,
      ]),
    ).rejects.toMatchObject({ name: "ZodError" });
    expect(createMany).not.toHaveBeenCalled();

    const repositoryLettura = new PrismaRepositorySnapshot(
      prismaMock({
        snapshotDati: {
          findUnique: vi.fn().mockResolvedValue({
            ...rigaSnapshot,
            giocatori: [
              {
                ...rigaGiocatore,
                statTattiche: { ...statTattiche, tiri: -1 },
              },
            ],
          }),
        },
      }),
    );
    await expect(
      repositoryLettura.trovaPerId(rigaSnapshot.id),
    ).rejects.toMatchObject({ name: "ZodError" });
  });

  it("preserva il round-trip delle statistiche per un insieme generato di valori validi", async () => {
    for (let indice = 0; indice < 50; indice += 1) {
      const statisticheGenerate = {
        ...statFantacalcio,
        mediaVotoMilli: indice % 3 === 0 ? null : 5000 + indice,
        presenze: indice,
        gol: indice % 20,
      };
      const giocatoreGenerato = {
        ...rigaGiocatore,
        statFantacalcio: statisticheGenerate,
      };
      const createMany = vi.fn().mockResolvedValue({ count: 1 });
      const findUnique = vi.fn().mockResolvedValue({
        ...rigaSnapshot,
        giocatori: [giocatoreGenerato],
      });
      const repository = new PrismaRepositorySnapshot(
        prismaMock({
          giocatoreSnapshot: { createMany },
          snapshotDati: { findUnique },
        }),
      );

      await repository.aggiungiGiocatori(rigaSnapshot.id, [
        {
          ...giocatoreGenerato,
          ruoloClassic: "A",
          ruoliMantra: ["Pc"],
        },
      ]);
      const letto = await repository.trovaPerId(rigaSnapshot.id);
      expect(letto?.giocatori[0]?.statFantacalcio).toEqual(
        statisticheGenerate,
      );
    }
  });
});

describe("repository delle entità persistenti", () => {
  it("espone implementazioni concrete per tutti gli aggregati del task", () => {
    const repositories = creaRepositories(prismaMock({}));
    expect(repositories.utenti).toBeInstanceOf(PrismaRepositoryUtenti);
    expect(repositories.sessioniAuth).toBeInstanceOf(
      PrismaRepositorySessioniAuth,
    );
    expect(repositories.sessioniAsta).toBeInstanceOf(
      PrismaRepositorySessioniAsta,
    );
    expect(repositories.registro).toBeInstanceOf(PrismaRepositoryRegistro);
    expect(repositories.transazioniRegistro).toBeInstanceOf(
      PrismaGestoreTransazioniRegistro,
    );
    expect(repositories.avversari).toBeInstanceOf(PrismaRepositoryAvversari);
    expect(repositories.obiettivi).toBeInstanceOf(PrismaRepositoryObiettivi);
    expect(repositories.consultazioniScheda).toBeInstanceOf(
      PrismaRepositoryConsultazioniScheda,
    );
    expect(repositories.snapshot).toBeInstanceOf(PrismaRepositorySnapshot);
    expect(repositories.freschezza).toBeInstanceOf(
      PrismaRepositoryFreschezza,
    );
    expect(repositories.aliasGiocatori).toBeInstanceOf(
      PrismaRepositoryAliasGiocatori,
    );
  });

  it("mappa utenti, sessioni auth, avversari, obiettivi e freschezza", async () => {
    const utente = {
      id: rigaSessione.utenteId,
      emailNormalizzata: "mario@example.com",
      emailVisualizzata: "Mario@example.com",
      passwordHash: "hash",
      creatoIl: istante,
    };
    const sessioneAuth = {
      id: "00000000-0000-4000-8000-000000000003",
      utenteId: utente.id,
      tokenHash: "b".repeat(64),
      creatoIl: istante,
      ultimaAttivitaIl: istante,
      scadeIlAssoluto: new Date("2026-04-09T12:00:00.000Z"),
      revocataIl: null,
    };
    const avversario = {
      id: "00000000-0000-4000-8000-000000000004",
      sessioneAstaId: rigaSessione.id,
      nome: "Luca",
      creatoIl: istante,
      aggiornatoIl: istante,
    };
    const obiettivo = {
      id: "00000000-0000-4000-8000-000000000005",
      sessioneAstaId: rigaSessione.id,
      identificativoGiocatore: "player-1",
      nomeGiocatore: "Mario Rossi",
      reparto: "A",
      prezzoMassimoPersonale: 30,
      priorita: 1,
      nonRaggiungibile: false,
      creatoIl: istante,
      aggiornatoIl: istante,
    };
    const freschezza = {
      nomeSorgente: "Listone",
      stagione: "2025-26",
      ultimoSuccessoIl: istante,
      ultimoTentativoIl: istante,
      ultimoEsito: "successo" as const,
      dettaglioErrore: null,
      numGiocatoriAcquisiti: 500,
      budgetToken: 79,
      prossimoTentativoNonPrimaDi: null,
      aggiornatoIl: istante,
    };

    await expect(
      new PrismaRepositoryUtenti(
        prismaMock({ utente: { create: vi.fn().mockResolvedValue(utente) } }),
      ).crea({
        emailNormalizzata: utente.emailNormalizzata,
        emailVisualizzata: utente.emailVisualizzata,
        passwordHash: utente.passwordHash,
      }),
    ).resolves.toEqual(utente);
    await expect(
      new PrismaRepositorySessioniAuth(
        prismaMock({
          sessioneAuth: { create: vi.fn().mockResolvedValue(sessioneAuth) },
        }),
      ).crea({
        utenteId: utente.id,
        tokenHash: sessioneAuth.tokenHash,
        ultimaAttivitaIl: istante,
        scadeIlAssoluto: sessioneAuth.scadeIlAssoluto,
      }),
    ).resolves.toEqual(sessioneAuth);
    await expect(
      new PrismaRepositoryAvversari(
        prismaMock({
          avversario: { create: vi.fn().mockResolvedValue(avversario) },
        }),
      ).crea(rigaSessione.id, avversario.nome),
    ).resolves.toEqual(avversario);
    await expect(
      new PrismaRepositoryObiettivi(
        prismaMock({
          voceObiettivo: { create: vi.fn().mockResolvedValue(obiettivo) },
        }),
      ).crea({
        sessioneAstaId: rigaSessione.id,
        identificativoGiocatore: obiettivo.identificativoGiocatore,
        nomeGiocatore: obiettivo.nomeGiocatore,
        reparto: "A",
        prezzoMassimoPersonale: 30,
        priorita: 1,
      }),
    ).resolves.toEqual(obiettivo);
    await expect(
      new PrismaRepositoryFreschezza(
        prismaMock({
          statoFreschezza: { upsert: vi.fn().mockResolvedValue(freschezza) },
        }),
      ).salva(freschezza),
    ).resolves.toEqual(freschezza);
  });

  it("aggiorna solo i campi persistenti del limitatore di frequenza", async () => {
    const prossimoTentativo = new Date("2026-03-10T12:01:00.000Z");
    const aggiornatoIl = new Date("2026-03-10T12:00:00.000Z");
    const upsert = vi.fn().mockResolvedValue({
      nomeSorgente: "Listone",
      stagione: "2025-26",
      ultimoSuccessoIl: istante,
      ultimoTentativoIl: istante,
      ultimoEsito: "successo",
      dettaglioErrore: null,
      numGiocatoriAcquisiti: 500,
      budgetToken: 78,
      prossimoTentativoNonPrimaDi: prossimoTentativo,
      aggiornatoIl,
    });
    const repository = new PrismaRepositoryFreschezza(
      prismaMock({ statoFreschezza: { upsert } }),
    );

    await repository.salvaLimitazione({
      nomeSorgente: "Listone",
      stagione: "2025-26",
      budgetToken: 78,
      prossimoTentativoNonPrimaDi: prossimoTentativo,
      aggiornatoIl,
    });

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: {
          budgetToken: 78,
          prossimoTentativoNonPrimaDi: prossimoTentativo,
          aggiornatoIl,
        },
      }),
    );
  });

  it("valida le voci registro in ingresso e in uscita", async () => {
    const voce: VoceRegistro = {
      id: "00000000-0000-4000-8000-000000000006",
      sessioneAstaId: rigaSessione.id,
      ordinale: 1,
      identificativoGiocatore: "player-1",
      nomeGiocatore: "Mario Rossi",
      ruolo: "A",
      squadra: "Roma",
      repartoAssegnato: "A",
      macroReparto: "ATT",
      prezzoAcquisto: 20,
      assegnatarioTipo: "utente",
      avversarioId: null,
      annullataIl: null,
      chiaveIdempotenza: "10000000-0000-4000-8000-000000000001",
      giocatoreAssenteDatiCorrenti: false,
    };
    const create = vi.fn().mockResolvedValue({
      ...voce,
      annullataIl: null,
      creatoIl: istante,
      aggiornatoIl: istante,
    });
    const repository = new PrismaRepositoryRegistro(
      prismaMock({ voceRegistroAcquisti: { create } }),
    );

    await expect(repository.crea(voce)).resolves.toEqual(voce);
    await expect(
      repository.crea({ ...voce, prezzoAcquisto: 0 } as VoceRegistro),
    ).rejects.toMatchObject({ name: "ZodError" });
    expect(create).toHaveBeenCalledTimes(1);
  });
});

// **Validates: Requirements 8.3, 8.4**
describe("repository avversari: creazione atomica entro limite", () => {
  it("serializza nome, conteggio e inserimento con il lock della sessione", async () => {
    const riga = {
      id: "00000000-0000-4000-8000-000000000004",
      sessioneAstaId: rigaSessione.id,
      nome: "Luca",
      creatoIl: istante,
      aggiornatoIl: istante,
    };
    const queryRaw = vi.fn().mockResolvedValue([{ id: rigaSessione.id }]);
    const findUnique = vi.fn().mockResolvedValue(null);
    const count = vi.fn().mockResolvedValue(18);
    const create = vi.fn().mockResolvedValue(riga);
    const transaction = {
      $queryRaw: queryRaw,
      avversario: { findUnique, count, create },
    };
    const $transaction = vi
      .fn()
      .mockImplementation((operazione: (tx: typeof transaction) => unknown) =>
        operazione(transaction),
      );
    const repository = new PrismaRepositoryAvversari(
      prismaMock({ $transaction }),
    );

    await expect(
      repository.creaEntroLimite(rigaSessione.id, "Luca", 19),
    ).resolves.toEqual({ ok: true, avversario: riga });
    expect(queryRaw).toHaveBeenCalledBefore(findUnique);
    expect(findUnique).toHaveBeenCalledBefore(count);
    expect(count).toHaveBeenCalledBefore(create);
  });

  it("rifiuta nome duplicato prima del conteggio e mantiene lo stato invariato", async () => {
    const queryRaw = vi.fn().mockResolvedValue([{ id: rigaSessione.id }]);
    const findUnique = vi.fn().mockResolvedValue({ id: "avversario-1" });
    const count = vi.fn();
    const create = vi.fn();
    const transaction = {
      $queryRaw: queryRaw,
      avversario: { findUnique, count, create },
    };
    const $transaction = vi
      .fn()
      .mockImplementation((operazione: (tx: typeof transaction) => unknown) =>
        operazione(transaction),
      );
    const repository = new PrismaRepositoryAvversari(
      prismaMock({ $transaction }),
    );

    await expect(
      repository.creaEntroLimite(rigaSessione.id, "Luca", 19),
    ).resolves.toEqual({ ok: false, motivo: "nome_duplicato" });
    expect(count).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });
});

// **Validates: Requirements 11.1, 11.2**
describe("repository obiettivi: creazione atomica entro limite", () => {
  const input = {
    sessioneAstaId: rigaSessione.id,
    identificativoGiocatore: "player-obiettivo",
    nomeGiocatore: "Mario Rossi",
    reparto: "A" as const,
    prezzoMassimoPersonale: null,
    priorita: 99,
    nonRaggiungibile: false,
  };
  const riga = {
    id: "00000000-0000-4000-8000-000000000005",
    ...input,
    creatoIl: istante,
    aggiornatoIl: istante,
  };

  it("serializza controllo unicità, conteggio e inserimento con il lock della sessione", async () => {
    const queryRaw = vi.fn().mockResolvedValue([{ id: rigaSessione.id }]);
    const findUnique = vi.fn().mockResolvedValue(null);
    const count = vi.fn().mockResolvedValue(199);
    const create = vi.fn().mockResolvedValue(riga);
    const transaction = {
      $queryRaw: queryRaw,
      voceObiettivo: { findUnique, count, create },
    };
    const $transaction = vi
      .fn()
      .mockImplementation((operazione: (tx: typeof transaction) => unknown) =>
        operazione(transaction),
      );
    const repository = new PrismaRepositoryObiettivi(
      prismaMock({ $transaction }),
    );

    await expect(repository.creaEntroLimite(input, 200)).resolves.toEqual({
      ok: true,
      obiettivo: riga,
    });
    expect(queryRaw).toHaveBeenCalledBefore(findUnique);
    expect(findUnique).toHaveBeenCalledBefore(count);
    expect(count).toHaveBeenCalledBefore(create);
  });

  it("rifiuta un duplicato prima del conteggio e senza inserire", async () => {
    const queryRaw = vi.fn().mockResolvedValue([{ id: rigaSessione.id }]);
    const findUnique = vi.fn().mockResolvedValue({ id: riga.id });
    const count = vi.fn();
    const create = vi.fn();
    const transaction = {
      $queryRaw: queryRaw,
      voceObiettivo: { findUnique, count, create },
    };
    const $transaction = vi
      .fn()
      .mockImplementation((operazione: (tx: typeof transaction) => unknown) =>
        operazione(transaction),
      );
    const repository = new PrismaRepositoryObiettivi(
      prismaMock({ $transaction }),
    );

    await expect(repository.creaEntroLimite(input, 200)).resolves.toEqual({
      ok: false,
      motivo: "obiettivo_duplicato",
    });
    expect(count).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it("rifiuta il duecentesimo successivo senza inserire", async () => {
    const queryRaw = vi.fn().mockResolvedValue([{ id: rigaSessione.id }]);
    const findUnique = vi.fn().mockResolvedValue(null);
    const count = vi.fn().mockResolvedValue(200);
    const create = vi.fn();
    const transaction = {
      $queryRaw: queryRaw,
      voceObiettivo: { findUnique, count, create },
    };
    const $transaction = vi
      .fn()
      .mockImplementation((operazione: (tx: typeof transaction) => unknown) =>
        operazione(transaction),
      );
    const repository = new PrismaRepositoryObiettivi(
      prismaMock({ $transaction }),
    );

    await expect(repository.creaEntroLimite(input, 200)).resolves.toEqual({
      ok: false,
      motivo: "limite_obiettivi",
    });
    expect(create).not.toHaveBeenCalled();
  });
});

// **Validates: Requirements 4.16, 4.17**
describe("pubblicazione snapshot: riassociazione del registro", () => {
  it("riassocia per identificativo nella stessa transazione modificando soltanto il contrassegno di assenza", async () => {
    const { snapshotId: _snapshotId, ...giocatore } = {
      ...rigaGiocatore,
      ruoloClassic: "A" as const,
      ruoliMantra: ["Pc" as const],
    };
    const createSnapshot = vi.fn().mockResolvedValue({
      ...rigaSnapshot,
      stato: "in_costruzione",
      giocatori: undefined,
    });
    const createManyGiocatori = vi.fn().mockResolvedValue({ count: 1 });
    const countGiocatori = vi.fn().mockResolvedValue(1);
    const superaSnapshotPrecedente = vi.fn().mockResolvedValue({ count: 1 });
    const pubblicaSnapshot = vi.fn().mockResolvedValue({
      ...rigaSnapshot,
      stato: "consultabile",
      giocatori: undefined,
    });
    const aggiornaPuntatore = vi.fn().mockResolvedValue({});
    const riassociaVoci = vi
      .fn()
      .mockResolvedValueOnce({ count: 2 })
      .mockResolvedValueOnce({ count: 1 });
    const trovaSnapshotPubblicato = vi.fn().mockResolvedValue(rigaSnapshot);
    const transazione = {
      snapshotDati: {
        create: createSnapshot,
        updateMany: superaSnapshotPrecedente,
        update: pubblicaSnapshot,
        findUniqueOrThrow: trovaSnapshotPubblicato,
      },
      giocatoreSnapshot: {
        createMany: createManyGiocatori,
        count: countGiocatori,
      },
      pubblicazioneSnapshot: { upsert: aggiornaPuntatore },
      voceRegistroAcquisti: { updateMany: riassociaVoci },
      statoFreschezza: { upsert: vi.fn() },
      esecuzioneIngestione: { create: vi.fn() },
    };
    const $transaction = vi
      .fn()
      .mockImplementation(
        (operazione: (tx: typeof transazione) => Promise<unknown>) =>
          operazione(transazione),
      );
    const repository = creaRepositories(prismaMock({ $transaction })).ingestione;

    const risultato = await repository.pubblicaSnapshot({
      snapshot: {
        stagioneListone: rigaSnapshot.stagioneListone,
        stagioneStatistiche: rigaSnapshot.stagioneStatistiche,
        stato: "in_costruzione",
        numGiocatori: 1,
        nomeSorgenteListone: rigaSnapshot.nomeSorgenteListone,
        nomeSorgenteStatistiche: rigaSnapshot.nomeSorgenteStatistiche,
        hashContenuto: rigaSnapshot.hashContenuto,
      },
      giocatori: [giocatore],
      pubblicatoIl: istante,
      acquisizioni: [],
    });

    expect(risultato).toEqual(rigaSnapshot);
    expect($transaction).toHaveBeenCalledOnce();
    expect(aggiornaPuntatore).toHaveBeenCalledBefore(riassociaVoci);
    expect(riassociaVoci).toHaveBeenNthCalledWith(1, {
      where: {
        sessioneAsta: { stagioneListone: "2025-26" },
        identificativoGiocatore: { notIn: ["player-1"] },
        giocatoreAssenteDatiCorrenti: false,
      },
      data: { giocatoreAssenteDatiCorrenti: true },
    });
    expect(riassociaVoci).toHaveBeenNthCalledWith(2, {
      where: {
        sessioneAsta: { stagioneListone: "2025-26" },
        identificativoGiocatore: { in: ["player-1"] },
        giocatoreAssenteDatiCorrenti: true,
      },
      data: { giocatoreAssenteDatiCorrenti: false },
    });
  });
});