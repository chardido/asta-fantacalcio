"use client";

import type { VoceRegistro } from "@asta/contracts";
import { type DBSchema, type IDBPDatabase, openDB } from "idb";
import { useStore } from "zustand";
import { createStore, type StoreApi } from "zustand/vanilla";

export const CAPIENZA_MASSIMA_CODA_LOCALE = 50;
export const DURATA_MINIMA_CONSERVAZIONE_MS = 24 * 60 * 60 * 1_000;
export const MESSAGGIO_CODA_LOCALE_PIENA =
  "La coda locale è piena: sono già presenti 50 operazioni non inviate.";

const NOME_DATABASE_PREDEFINITO = "asta-fantacalcio-coda-locale";
const VERSIONE_DATABASE = 1;
const STORE_OPERAZIONI = "operazioni";
const INDICE_CHIAVE_IDEMPOTENZA = "per_chiave_idempotenza";

export type StatoOperazioneCoda =
  | "in_attesa"
  | "in_invio"
  | "non_inviata"
  | "in_conflitto";

export interface ConflittoOperazioneCoda {
  readonly versioneServer: VoceRegistro;
}

export interface OperazioneCodaLocale {
  readonly chiaveIdempotenza: string;
  readonly sessioneAstaId: string;
  readonly tipo: "registra_acquisto";
  readonly dati: Readonly<Record<string, unknown>>;
  readonly tentativi: number;
  readonly stato: StatoOperazioneCoda;
  readonly conflitto?: ConflittoOperazioneCoda;
  readonly creataIl: number;
  readonly conservaFinoAlmenoA: number;
}

export interface NuovaOperazioneCodaLocale {
  readonly chiaveIdempotenza: string;
  readonly sessioneAstaId: string;
  readonly tipo: "registra_acquisto";
  readonly dati: Readonly<Record<string, unknown>>;
}

export type AggiornamentoOperazione = Partial<
  Pick<OperazioneCodaLocale, "conflitto" | "dati" | "tentativi" | "stato">
>;

interface OperazionePersistita extends OperazioneCodaLocale {
  readonly ordine?: number;
}

interface DatabaseCodaLocale extends DBSchema {
  operazioni: {
    key: number;
    value: OperazionePersistita;
    indexes: { per_chiave_idempotenza: string };
  };
}

export type EsitoAccodamento =
  | { readonly tipo: "accodata"; readonly operazione: OperazioneCodaLocale }
  | { readonly tipo: "gia_presente"; readonly operazione: OperazioneCodaLocale };

export interface ArchivioCodaLocale {
  elenca(): Promise<readonly OperazioneCodaLocale[]>;
  accoda(operazione: OperazioneCodaLocale): Promise<EsitoAccodamento>;
  aggiorna(
    chiaveIdempotenza: string,
    aggiornamento: AggiornamentoOperazione,
  ): Promise<OperazioneCodaLocale | null>;
  rimuovi(chiaveIdempotenza: string): Promise<boolean>;
  svuota(): Promise<void>;
  chiudi(): Promise<void>;
}

export class ErroreCodaLocalePiena extends Error {
  readonly codice = "CODA_LOCALE_PIENA";
  readonly limite = CAPIENZA_MASSIMA_CODA_LOCALE;

  constructor() {
    super(MESSAGGIO_CODA_LOCALE_PIENA);
    this.name = "ErroreCodaLocalePiena";
  }
}

export function creaOperazioneCodaLocale(
  nuovaOperazione: NuovaOperazioneCodaLocale,
  creataIl = Date.now(),
): OperazioneCodaLocale {
  if (!Number.isInteger(creataIl) || creataIl < 0) {
    throw new RangeError("L'istante di creazione deve essere un intero non negativo.");
  }

  return validaOperazione({
    ...nuovaOperazione,
    tentativi: 0,
    stato: "in_attesa",
    creataIl,
    conservaFinoAlmenoA: creataIl + DURATA_MINIMA_CONSERVAZIONE_MS,
  });
}

function validaOperazione(
  operazione: OperazioneCodaLocale,
): OperazioneCodaLocale {
  if (operazione.chiaveIdempotenza.trim().length === 0) {
    throw new RangeError("La chiave di idempotenza è obbligatoria.");
  }
  if (operazione.sessioneAstaId.trim().length === 0) {
    throw new RangeError("L'identificativo della sessione d'asta è obbligatorio.");
  }
  if (!Number.isInteger(operazione.tentativi) || operazione.tentativi < 0) {
    throw new RangeError("Il numero di tentativi deve essere un intero non negativo.");
  }
  if (!Number.isInteger(operazione.creataIl) || operazione.creataIl < 0) {
    throw new RangeError("L'istante di creazione deve essere un intero non negativo.");
  }
  if (
    !Number.isInteger(operazione.conservaFinoAlmenoA) ||
    operazione.conservaFinoAlmenoA - operazione.creataIl <
      DURATA_MINIMA_CONSERVAZIONE_MS
  ) {
    throw new RangeError("L'operazione deve essere conservata per almeno 24 ore.");
  }

  return operazione;
}

function senzaOrdine(
  operazione: OperazionePersistita,
): OperazioneCodaLocale {
  const { ordine: _ordine, ...operazionePubblica } = operazione;
  return operazionePubblica;
}

export function creaArchivioCodaLocale(
  nomeDatabase = NOME_DATABASE_PREDEFINITO,
): ArchivioCodaLocale {
  let apertura: Promise<IDBPDatabase<DatabaseCodaLocale>> | undefined;

  const apri = (): Promise<IDBPDatabase<DatabaseCodaLocale>> => {
    apertura ??= openDB<DatabaseCodaLocale>(nomeDatabase, VERSIONE_DATABASE, {
      upgrade(database) {
        const store = database.createObjectStore(STORE_OPERAZIONI, {
          keyPath: "ordine",
          autoIncrement: true,
        });
        store.createIndex(
          INDICE_CHIAVE_IDEMPOTENZA,
          "chiaveIdempotenza",
          { unique: true },
        );
      },
    });
    return apertura;
  };

  return {
    async elenca() {
      const database = await apri();
      const operazioni = await database.getAll(STORE_OPERAZIONI);
      return operazioni.map(senzaOrdine);
    },

    async accoda(operazione) {
      const operazioneValida = validaOperazione(operazione);
      const database = await apri();
      const transazione = database.transaction(STORE_OPERAZIONI, "readwrite");
      const store = transazione.objectStore(STORE_OPERAZIONI);
      const indice = store.index(INDICE_CHIAVE_IDEMPOTENZA);
      const esistente = await indice.get(operazioneValida.chiaveIdempotenza);

      if (esistente !== undefined) {
        await transazione.done;
        return { tipo: "gia_presente", operazione: senzaOrdine(esistente) };
      }

      if ((await store.count()) >= CAPIENZA_MASSIMA_CODA_LOCALE) {
        await transazione.done;
        throw new ErroreCodaLocalePiena();
      }

      await store.add(operazioneValida);
      await transazione.done;
      return { tipo: "accodata", operazione: operazioneValida };
    },

    async aggiorna(chiaveIdempotenza, aggiornamento) {
      const database = await apri();
      const transazione = database.transaction(STORE_OPERAZIONI, "readwrite");
      const store = transazione.objectStore(STORE_OPERAZIONI);
      const indice = store.index(INDICE_CHIAVE_IDEMPOTENZA);
      const esistente = await indice.get(chiaveIdempotenza);

      if (esistente === undefined) {
        await transazione.done;
        return null;
      }

      const aggiornata = validaOperazione({ ...esistente, ...aggiornamento });
      await store.put(aggiornata);
      await transazione.done;
      return senzaOrdine(aggiornata);
    },

    async rimuovi(chiaveIdempotenza) {
      const database = await apri();
      const transazione = database.transaction(STORE_OPERAZIONI, "readwrite");
      const store = transazione.objectStore(STORE_OPERAZIONI);
      const chiave = await store
        .index(INDICE_CHIAVE_IDEMPOTENZA)
        .getKey(chiaveIdempotenza);

      if (chiave === undefined) {
        await transazione.done;
        return false;
      }

      await store.delete(chiave);
      await transazione.done;
      return true;
    },

    async svuota() {
      const database = await apri();
      await database.clear(STORE_OPERAZIONI);
    },

    async chiudi() {
      if (apertura === undefined) return;
      const database = await apertura;
      database.close();
      apertura = undefined;
    },
  };
}

export interface StatoCodaLocale {
  readonly operazioni: readonly OperazioneCodaLocale[];
  readonly inizializzata: boolean;
  carica(): Promise<void>;
  accoda(operazione: OperazioneCodaLocale): Promise<EsitoAccodamento>;
  aggiorna(
    chiaveIdempotenza: string,
    aggiornamento: AggiornamentoOperazione,
  ): Promise<void>;
  rimuovi(chiaveIdempotenza: string): Promise<void>;
  svuota(): Promise<void>;
}

/**
 * Store separato dalla cache TanStack Query. Ogni mutazione aggiorna prima
 * IndexedDB e solo dopo la proiezione Zustand, così un errore non può far
 * divergere la coda persistita da quella mostrata nell'interfaccia.
 */
export function creaStoreCodaLocale(
  archivio: ArchivioCodaLocale = creaArchivioCodaLocale(),
): StoreApi<StatoCodaLocale> {
  return createStore<StatoCodaLocale>((set) => ({
    operazioni: [],
    inizializzata: false,

    carica: async () => {
      const operazioni = await archivio.elenca();
      set({ operazioni, inizializzata: true });
    },

    accoda: async (operazione) => {
      const esito = await archivio.accoda(operazione);
      set((stato) => {
        const giaPresente = stato.operazioni.some(
          (corrente) =>
            corrente.chiaveIdempotenza ===
            esito.operazione.chiaveIdempotenza,
        );
        return giaPresente
          ? stato
          : { operazioni: [...stato.operazioni, esito.operazione] };
      });
      return esito;
    },

    aggiorna: async (chiaveIdempotenza, aggiornamento) => {
      const aggiornata = await archivio.aggiorna(
        chiaveIdempotenza,
        aggiornamento,
      );
      if (aggiornata === null) return;
      set((stato) => ({
        operazioni: stato.operazioni.map((operazione) =>
          operazione.chiaveIdempotenza === chiaveIdempotenza
            ? aggiornata
            : operazione,
        ),
      }));
    },

    rimuovi: async (chiaveIdempotenza) => {
      const rimossa = await archivio.rimuovi(chiaveIdempotenza);
      if (!rimossa) return;
      set((stato) => ({
        operazioni: stato.operazioni.filter(
          (operazione) => operazione.chiaveIdempotenza !== chiaveIdempotenza,
        ),
      }));
    },

    svuota: async () => {
      await archivio.svuota();
      set({ operazioni: [] });
    },
  }));
}

export const storeCodaLocale = creaStoreCodaLocale();

export function useCodaLocale<T>(
  selettore: (stato: StatoCodaLocale) => T,
): T {
  return useStore(storeCodaLocale, selettore);
}
