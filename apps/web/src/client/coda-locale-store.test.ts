import "fake-indexeddb/auto";

import { deleteDB } from "idb";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  CAPIENZA_MASSIMA_CODA_LOCALE,
  DURATA_MINIMA_CONSERVAZIONE_MS,
  ErroreCodaLocalePiena,
  MESSAGGIO_CODA_LOCALE_PIENA,
  creaArchivioCodaLocale,
  creaOperazioneCodaLocale,
  creaStoreCodaLocale,
  type ArchivioCodaLocale,
  type OperazioneCodaLocale,
} from "./coda-locale-store.js";

const SESSIONE = "00000000-0000-4000-8000-000000000001";

let archivi: ArchivioCodaLocale[];
let databaseCreati: string[];

beforeEach(() => {
  archivi = [];
  databaseCreati = [];
});

afterEach(async () => {
  await Promise.all(archivi.map((archivio) => archivio.chiudi()));
  await Promise.all(databaseCreati.map((nome) => deleteDB(nome)));
});

function nuovoArchivio(nome: string): ArchivioCodaLocale {
  const archivio = creaArchivioCodaLocale(nome);
  archivi.push(archivio);
  if (!databaseCreati.includes(nome)) databaseCreati.push(nome);
  return archivio;
}

function operazione(indice: number, creataIl = 1_000): OperazioneCodaLocale {
  return creaOperazioneCodaLocale(
    {
      chiaveIdempotenza: `operazione-${indice}`,
      sessioneAstaId: SESSIONE,
      tipo: "registra_acquisto",
      dati: {
        identificativoGiocatore: `giocatore-${indice}`,
        prezzoAcquisto: indice + 1,
      },
    },
    creataIl,
  );
}

describe("Coda_Locale IndexedDB", () => {
  it("ripristina ordine, tentativi e stato dopo la riapertura e garantisce almeno 24 ore", async () => {
    const nomeDatabase = "test-coda-locale-persistenza";
    const primoArchivio = nuovoArchivio(nomeDatabase);
    const primoStore = creaStoreCodaLocale(primoArchivio);
    const prima = operazione(1, 5_000);
    const seconda = operazione(2, 6_000);

    await primoStore.getState().accoda(prima);
    await primoStore.getState().accoda(seconda);
    await primoStore
      .getState()
      .aggiorna(prima.chiaveIdempotenza, { tentativi: 3, stato: "in_invio" });
    await primoArchivio.chiudi();

    const secondoArchivio = nuovoArchivio(nomeDatabase);
    const secondoStore = creaStoreCodaLocale(secondoArchivio);
    await secondoStore.getState().carica();

    expect(secondoStore.getState().inizializzata).toBe(true);
    expect(secondoStore.getState().operazioni).toEqual([
      { ...prima, tentativi: 3, stato: "in_invio" },
      seconda,
    ]);
    for (const voce of secondoStore.getState().operazioni) {
      expect(voce.conservaFinoAlmenoA - voce.creataIl).toBeGreaterThanOrEqual(
        DURATA_MINIMA_CONSERVAZIONE_MS,
      );
    }
  });

  it("rende idempotente il reinserimento della stessa chiave anche a coda piena", async () => {
    const archivio = nuovoArchivio("test-coda-locale-idempotenza");
    const store = creaStoreCodaLocale(archivio);

    for (let indice = 0; indice < CAPIENZA_MASSIMA_CODA_LOCALE; indice += 1) {
      await store.getState().accoda(operazione(indice));
    }

    const esito = await store.getState().accoda(operazione(0));

    expect(esito.tipo).toBe("gia_presente");
    expect(store.getState().operazioni).toHaveLength(
      CAPIENZA_MASSIMA_CODA_LOCALE,
    );
    expect(await archivio.elenca()).toHaveLength(
      CAPIENZA_MASSIMA_CODA_LOCALE,
    );
  });

  it("rifiuta la cinquantunesima operazione con messaggio esplicito senza mutare la coda", async () => {
    const archivio = nuovoArchivio("test-coda-locale-capienza");
    const store = creaStoreCodaLocale(archivio);

    for (let indice = 0; indice < CAPIENZA_MASSIMA_CODA_LOCALE; indice += 1) {
      await store.getState().accoda(operazione(indice));
    }
    const statoPrimaDelRifiuto = [...store.getState().operazioni];

    const tentativo = store
      .getState()
      .accoda(operazione(CAPIENZA_MASSIMA_CODA_LOCALE));

    await expect(tentativo).rejects.toBeInstanceOf(ErroreCodaLocalePiena);
    await expect(
      store
        .getState()
        .accoda(operazione(CAPIENZA_MASSIMA_CODA_LOCALE)),
    ).rejects.toMatchObject({
      codice: "CODA_LOCALE_PIENA",
      limite: CAPIENZA_MASSIMA_CODA_LOCALE,
      message: MESSAGGIO_CODA_LOCALE_PIENA,
    });
    expect(store.getState().operazioni).toEqual(statoPrimaDelRifiuto);
    expect(await archivio.elenca()).toEqual(statoPrimaDelRifiuto);
  });
});
