import type {
  EsitoIngestione,
  RepositoryFreschezza,
  StatoFreschezzaPersistito,
  StatoLimitazioneFrequenzaDaSalvare,
} from "@asta/db";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  BACKOFF_MASSIMO_MS,
  ErroreBudgetTokenEsaurito,
  ErroreChiamataRinviata,
  ErroreTimeoutSorgente,
  LimitatoreFrequenza,
  TIMEOUT_RICHIESTA_MS,
} from "./limitatore-frequenza.js";

class RepositoryFreschezzaMemoria
  implements Pick<RepositoryFreschezza, "trova" | "salvaLimitazione">
{
  readonly stati = new Map<string, StatoFreschezzaPersistito>();

  async trova(
    nomeSorgente: string,
    stagione: string,
  ): Promise<StatoFreschezzaPersistito | null> {
    return this.stati.get(`${nomeSorgente}|${stagione}`) ?? null;
  }

  async salvaLimitazione(
    input: StatoLimitazioneFrequenzaDaSalvare,
  ): Promise<StatoFreschezzaPersistito> {
    const chiave = `${input.nomeSorgente}|${input.stagione}`;
    const precedente = this.stati.get(chiave);
    const stato: StatoFreschezzaPersistito = {
      nomeSorgente: input.nomeSorgente,
      stagione: input.stagione,
      ultimoSuccessoIl: precedente?.ultimoSuccessoIl ?? null,
      ultimoTentativoIl: precedente?.ultimoTentativoIl ?? input.aggiornatoIl,
      ultimoEsito: precedente?.ultimoEsito ?? ("errore" satisfies EsitoIngestione),
      dettaglioErrore: precedente?.dettaglioErrore ?? null,
      numGiocatoriAcquisiti: precedente?.numGiocatoriAcquisiti ?? null,
      budgetToken: input.budgetToken,
      prossimoTentativoNonPrimaDi: input.prossimoTentativoNonPrimaDi,
      aggiornatoIl: input.aggiornatoIl,
    };
    this.stati.set(chiave, stato);
    return stato;
  }
}

const sorgente = {
  nome: "api-football",
  limiti: { richiesteMassime: 2, finestraMs: 60_000 },
} as const;

function erroreLimite(): Error & { readonly codice: "limite_frequenza" } {
  return Object.assign(new Error("429"), { codice: "limite_frequenza" as const });
}

describe("LimitatoreFrequenza", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("persiste il consumo e non ripristina il bucket dopo un riavvio", async () => {
    const repository = new RepositoryFreschezzaMemoria();
    const istante = new Date("2026-03-10T05:00:00.000Z");
    const esegui = vi.fn(async () => "ok");

    await new LimitatoreFrequenza(repository, () => istante).esegui(
      sorgente,
      "2025-26",
      esegui,
    );
    await new LimitatoreFrequenza(repository, () => istante).esegui(
      sorgente,
      "2025-26",
      esegui,
    );

    await expect(
      new LimitatoreFrequenza(repository, () => istante).esegui(
        sorgente,
        "2025-26",
        esegui,
      ),
    ).rejects.toBeInstanceOf(ErroreBudgetTokenEsaurito);
    expect(esegui).toHaveBeenCalledTimes(2);
    expect((await repository.trova(sorgente.nome, "2025-26"))?.budgetToken).toBe(0);
  });

  it("ricarica i token trascorsa la quota temporale della finestra", async () => {
    const repository = new RepositoryFreschezzaMemoria();
    let istante = new Date("2026-03-10T05:00:00.000Z");
    const limitatore = new LimitatoreFrequenza(repository, () => istante);

    await limitatore.esegui(sorgente, "2025-26", async () => undefined);
    await limitatore.esegui(sorgente, "2025-26", async () => undefined);
    istante = new Date(istante.getTime() + 30_000);

    await expect(
      limitatore.esegui(sorgente, "2025-26", async () => "ricaricato"),
    ).resolves.toBe("ricaricato");
  });

  it("applica backoff crescente persistente e blocca le chiamate premature", async () => {
    const repository = new RepositoryFreschezzaMemoria();
    let istante = new Date("2026-03-10T05:00:00.000Z");
    const limitatore = new LimitatoreFrequenza(repository, () => istante);

    await expect(
      limitatore.esegui(sorgente, "2025-26", async () => {
        throw erroreLimite();
      }),
    ).rejects.toMatchObject({ codice: "limite_frequenza" });

    const primo = await repository.trova(sorgente.nome, "2025-26");
    expect(primo?.prossimoTentativoNonPrimaDi).toEqual(
      new Date(istante.getTime() + 60_000),
    );
    await expect(
      new LimitatoreFrequenza(repository, () => istante).esegui(
        sorgente,
        "2025-26",
        async () => undefined,
      ),
    ).rejects.toBeInstanceOf(ErroreChiamataRinviata);

    istante = new Date(istante.getTime() + 60_000);
    await expect(
      limitatore.esegui(sorgente, "2025-26", async () => {
        throw erroreLimite();
      }),
    ).rejects.toMatchObject({ codice: "limite_frequenza" });
    expect(
      (await repository.trova(sorgente.nome, "2025-26"))
        ?.prossimoTentativoNonPrimaDi,
    ).toEqual(new Date(istante.getTime() + 120_000));
  });

  it("azzera il backoff dopo la prima risposta riuscita", async () => {
    const repository = new RepositoryFreschezzaMemoria();
    let istante = new Date("2026-03-10T05:00:00.000Z");
    const limitatore = new LimitatoreFrequenza(repository, () => istante);

    await expect(
      limitatore.esegui(sorgente, "2025-26", async () => {
        throw erroreLimite();
      }),
    ).rejects.toBeDefined();
    istante = new Date(istante.getTime() + 60_000);
    await limitatore.esegui(sorgente, "2025-26", async () => "ok");

    expect(
      (await repository.trova(sorgente.nome, "2025-26"))
        ?.prossimoTentativoNonPrimaDi,
    ).toBeNull();
  });

  it("annulla la richiesta e termina con timeout dopo 30 secondi", async () => {
    vi.useFakeTimers();
    const repository = new RepositoryFreschezzaMemoria();
    const limitatore = new LimitatoreFrequenza(
      repository,
      () => new Date("2026-03-10T05:00:00.000Z"),
    );
    let segnaleRicevuto: AbortSignal | undefined;
    const chiamata = limitatore.esegui(sorgente, "2025-26", (segnale) => {
      segnaleRicevuto = segnale;
      return new Promise(() => undefined);
    });

    const esitoTimeout = expect(chiamata).rejects.toBeInstanceOf(
      ErroreTimeoutSorgente,
    );
    await vi.advanceTimersByTimeAsync(TIMEOUT_RICHIESTA_MS);

    await esitoTimeout;
    expect(segnaleRicevuto?.aborted).toBe(true);
    expect(segnaleRicevuto?.reason).toBeInstanceOf(ErroreTimeoutSorgente);
  });

  it("non supera mai il tetto massimo di backoff", async () => {
    const repository = new RepositoryFreschezzaMemoria();
    let istante = new Date("2026-03-10T05:00:00.000Z");
    const sorgenteAmpia = {
      nome: "listone",
      limiti: { richiesteMassime: 100, finestraMs: 1 },
    } as const;
    const limitatore = new LimitatoreFrequenza(repository, () => istante);

    for (let tentativo = 0; tentativo < 8; tentativo += 1) {
      await expect(
        limitatore.esegui(sorgenteAmpia, "2025-26", async () => {
          throw erroreLimite();
        }),
      ).rejects.toBeDefined();
      const prossimo = (await repository.trova("listone", "2025-26"))
        ?.prossimoTentativoNonPrimaDi;
      expect(prossimo).not.toBeNull();
      const attesa = (prossimo?.getTime() ?? 0) - istante.getTime();
      expect(attesa).toBeLessThanOrEqual(BACKOFF_MASSIMO_MS);
      istante = new Date(prossimo?.getTime() ?? istante.getTime());
    }
  });
});
