import type { VoceRegistro } from "@asta/contracts";
import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import type { VoceRegistroDaImportare } from "./repository-contracts.js";

import {
  ErroreUnicitaRegistro,
  PrismaGestoreTransazioniRegistro,
  PrismaRepositoryRegistro,
} from "./repositories.js";

const ID_SESSIONE = "00000000-0000-4000-8000-000000000001";

const voce: VoceRegistro = {
  id: "00000000-0000-4000-8000-000000000002",
  sessioneAstaId: ID_SESSIONE,
  ordinale: 1,
  identificativoGiocatore: "player-1",
  nomeGiocatore: "Mario Rossi",
  ruolo: "A",
  squadra: "Roma",
  repartoAssegnato: "A",
  macroReparto: "ATT",
  prezzoAcquisto: 30,
  assegnatarioTipo: "utente",
  avversarioId: null,
  annullataIl: null,
  chiaveIdempotenza: "00000000-0000-4000-8000-000000000003",
  giocatoreAssenteDatiCorrenti: false,
};

const rigaVoce = {
  ...voce,
  annullataIl: null,
  creatoIl: new Date("2026-03-12T10:00:00.000Z"),
  aggiornatoIl: new Date("2026-03-12T10:00:00.000Z"),
};

function prismaMock(overrides: Record<string, unknown>): PrismaClient {
  return overrides as unknown as PrismaClient;
}

// **Validates: Requirements 7.12, 7.16**
describe("PrismaGestoreTransazioniRegistro", () => {
  it("acquisisce il lock della sessione prima dell'operazione e applica il timeout di 5 secondi", async () => {
    const queryRaw = vi.fn().mockResolvedValue([{ id: ID_SESSIONE }]);
    const executeRaw = vi.fn().mockResolvedValue(1);
    const findMany = vi.fn().mockResolvedValue([rigaVoce]);
    const transaction = {
      $queryRaw: queryRaw,
      $executeRaw: executeRaw,
      voceRegistroAcquisti: { findMany },
    };
    const $transaction = vi.fn().mockImplementation(
      async (
        operazione: (tx: typeof transaction) => Promise<unknown>,
        _opzioni: unknown,
      ) => operazione(transaction),
    );
    const gestore = new PrismaGestoreTransazioniRegistro(
      prismaMock({ $transaction }),
    );

    const risultato = await gestore.esegui(
      ID_SESSIONE,
      async (registro) => {
        const voci = await registro.elencaPerSessione(ID_SESSIONE);
        await registro.notificaMutazione(1);
        return voci;
      },
      5_000,
    );

    expect(risultato).toEqual([voce]);
    expect(queryRaw).toHaveBeenCalledOnce();
    expect(queryRaw).toHaveBeenCalledBefore(findMany);
    expect(executeRaw).toHaveBeenCalledOnce();
    expect($transaction).toHaveBeenCalledWith(expect.any(Function), {
      timeout: 5_000,
      maxWait: 5_000,
    });
  });

  it("sostituisce registro e avversari nella stessa transazione bloccata", async () => {
    const ordine: string[] = [];
    const queryRaw = vi.fn().mockImplementation(async () => {
      ordine.push("lock");
      return [{ id: ID_SESSIONE }];
    });
    const deleteRegistro = vi.fn().mockImplementation(async () => {
      ordine.push("elimina-registro");
      return { count: 1 };
    });
    const deleteAvversari = vi.fn().mockImplementation(async () => {
      ordine.push("elimina-avversari");
      return { count: 1 };
    });
    const createManyAvversari = vi.fn().mockImplementation(async () => {
      ordine.push("crea-avversari");
      return { count: 1 };
    });
    const findManyAvversari = vi.fn().mockResolvedValue([
      { id: "00000000-0000-4000-8000-000000000010", nome: "Rivale" },
    ]);
    const createRegistro = vi.fn().mockImplementation(async ({ data }) => {
      ordine.push("crea-registro");
      return { ...rigaVoce, ...data };
    });
    const transaction = {
      $queryRaw: queryRaw,
      $executeRaw: vi.fn().mockResolvedValue(1),
      voceRegistroAcquisti: {
        deleteMany: deleteRegistro,
        create: createRegistro,
      },
      avversario: {
        deleteMany: deleteAvversari,
        createMany: createManyAvversari,
        findMany: findManyAvversari,
      },
    };
    const $transaction = vi.fn().mockImplementation(
      async (operazione: (tx: typeof transaction) => Promise<unknown>) =>
        operazione(transaction),
    );
    const gestore = new PrismaGestoreTransazioniRegistro(
      prismaMock({ $transaction }),
    );
    const importata = {
      ...voce,
      avversarioNome: "Rivale",
      assegnatarioTipo: "avversario",
      prezzoAcquisto: 12,
    } satisfies VoceRegistroDaImportare;

    const salvate = await gestore.esegui(
      ID_SESSIONE,
      (registro) => registro.sostituisciDaImportazione([importata]),
      5_000,
    );

    expect(salvate).toHaveLength(1);
    expect(deleteRegistro).toHaveBeenCalledWith({
      where: { sessioneAstaId: ID_SESSIONE },
    });
    expect(deleteAvversari).toHaveBeenCalledWith({
      where: { sessioneAstaId: ID_SESSIONE },
    });
    expect(createManyAvversari).toHaveBeenCalledWith({
      data: [{ sessioneAstaId: ID_SESSIONE, nome: "Rivale" }],
    });
    expect(createRegistro).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sessioneAstaId: ID_SESSIONE,
        avversarioId: "00000000-0000-4000-8000-000000000010",
      }),
    });
    expect(ordine).toEqual([
      "lock",
      "elimina-registro",
      "elimina-avversari",
      "crea-avversari",
      "crea-registro",
    ]);
  });
});

// **Validates: Requirements 7.6**
describe("PrismaRepositoryRegistro", () => {
  it("cerca la sola voce attiva del giocatore per arricchire il conflitto", async () => {
    const findFirst = vi.fn().mockResolvedValue(rigaVoce);
    const repository = new PrismaRepositoryRegistro(
      prismaMock({ voceRegistroAcquisti: { findFirst } }),
    );

    await expect(
      repository.trovaAttivaPerGiocatore(ID_SESSIONE, "player-1"),
    ).resolves.toEqual(voce);
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        sessioneAstaId: ID_SESSIONE,
        identificativoGiocatore: "player-1",
        annullataIl: null,
      },
    });
  });

  it("traduce P2002 in un errore stabile per il servizio applicativo", async () => {
    const errorePrisma = Object.assign(new Error("Unique constraint"), {
      code: "P2002",
    });
    const create = vi.fn().mockRejectedValue(errorePrisma);
    const repository = new PrismaRepositoryRegistro(
      prismaMock({ voceRegistroAcquisti: { create } }),
    );

    await expect(repository.crea(voce)).rejects.toBeInstanceOf(
      ErroreUnicitaRegistro,
    );
  });
});
