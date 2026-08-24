import "fake-indexeddb/auto";

import { QueryClient } from "@tanstack/react-query";
import { deleteDB } from "idb";
import { describe, expect, it, vi } from "vitest";

import {
  creaArchivioCodaLocale,
  creaOperazioneCodaLocale,
  creaStoreCodaLocale,
  type OperazioneCodaLocale,
} from "./coda-locale-store.js";
import {
  DURATA_CACHE_MS,
  DURATA_DATI_FRESCHI_MS,
  chiaveQuerySessione,
  creaQueryClient,
  queryAppartieneASessione,
} from "./query-client.js";
import { avviaRiconciliazioneSessione } from "./riconciliazione-eventi.js";

const SESSIONE = "00000000-0000-4000-8000-000000000001";

function operazione(chiave: string): OperazioneCodaLocale {
  return creaOperazioneCodaLocale(
    {
      chiaveIdempotenza: chiave,
      sessioneAstaId: SESSIONE,
      tipo: "registra_acquisto",
      dati: { identificativoGiocatore: "player-1", prezzoAcquisto: 10 },
    },
    1_000,
  );
}

class SorgenteEventiFinta {
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  readonly close = vi.fn();
  private readonly gestori = new Map<string, (evento: { data: string }) => void>();

  addEventListener(
    tipo: "iniziale" | "registro",
    ricevi: (evento: { data: string }) => void,
  ): void {
    this.gestori.set(tipo, ricevi);
  }

  emetti(tipo: "iniziale" | "registro", dati: object): void {
    this.gestori.get(tipo)?.({ data: JSON.stringify(dati) });
  }
}

describe("configurazione TanStack Query", () => {
  it("configura cache, freschezza e retry coerenti per query e mutazioni", () => {
    const client = creaQueryClient();
    expect(client.getDefaultOptions()).toMatchObject({
      queries: {
        staleTime: DURATA_DATI_FRESCHI_MS,
        gcTime: DURATA_CACHE_MS,
        retry: 1,
        refetchOnWindowFocus: true,
      },
      mutations: { retry: false },
    });
  });

  it("riconosce chiavi HTTP e chiavi tRPC mediante l'input di sessione", () => {
    expect(queryAppartieneASessione(chiaveQuerySessione(SESSIONE, "stato"), SESSIONE)).toBe(true);
    expect(
      queryAppartieneASessione(
        [["registro", "elenca"], { input: { sessioneAstaId: SESSIONE }, type: "query" }],
        SESSIONE,
      ),
    ).toBe(true);
    expect(queryAppartieneASessione(["sessione", "altra"], SESSIONE)).toBe(false);
  });
});

describe("store Zustand della coda", () => {
  it("mantiene ordine e idempotenza e aggiorna/rimuove senza coinvolgere la cache", async () => {
    const nomeDatabase = "test-stato-client-coda";
    await deleteDB(nomeDatabase);
    const archivio = creaArchivioCodaLocale(nomeDatabase);
    const store = creaStoreCodaLocale(archivio);
    const queryClient = new QueryClient();
    queryClient.setQueryData(chiaveQuerySessione(SESSIONE, "stato"), { budget: 500 });

    await store.getState().accoda(operazione("op-1"));
    await store.getState().accoda(operazione("op-1"));
    await store.getState().accoda(operazione("op-2"));
    await store.getState().aggiorna("op-1", { tentativi: 1, stato: "in_invio" });

    expect(store.getState().operazioni).toEqual([
      { ...operazione("op-1"), tentativi: 1, stato: "in_invio" },
      operazione("op-2"),
    ]);
    expect(queryClient.getQueryData(chiaveQuerySessione(SESSIONE, "stato"))).toEqual({ budget: 500 });

    await store.getState().rimuovi("op-1");
    expect(store.getState().operazioni).toEqual([operazione("op-2")]);
    await store.getState().svuota();
    expect(store.getState().operazioni).toEqual([]);

    await archivio.chiudi();
    await deleteDB(nomeDatabase);
  });
});

describe("riconciliazione SSE della cache", () => {
  it("invalida solo la sessione interessata e ignora eventi duplicati", async () => {
    const queryClient = new QueryClient();
    const altraSessione = "00000000-0000-4000-8000-000000000002";
    const chiaveSessione = chiaveQuerySessione(SESSIONE, "stato");
    const chiaveAltra = chiaveQuerySessione(altraSessione, "stato");
    queryClient.setQueryData(chiaveSessione, { budget: 500 });
    queryClient.setQueryData(chiaveAltra, { budget: 400 });
    const sorgente = new SorgenteEventiFinta();

    const ferma = avviaRiconciliazioneSessione({
      queryClient,
      sessioneAstaId: SESSIONE,
      creaSorgenteEventi: () => sorgente,
    });

    sorgente.emetti("registro", { ordinale: 4 });
    await vi.waitFor(() => {
      expect(queryClient.getQueryState(chiaveSessione)?.isInvalidated).toBe(true);
    });
    expect(queryClient.getQueryState(chiaveAltra)?.isInvalidated).toBe(false);

    queryClient.getQueryCache().find({ queryKey: chiaveSessione })?.setState({
      ...queryClient.getQueryState(chiaveSessione)!,
      isInvalidated: false,
    });
    sorgente.emetti("registro", { ordinale: 4 });
    await Promise.resolve();
    expect(queryClient.getQueryState(chiaveSessione)?.isInvalidated).toBe(false);

    ferma();
    expect(sorgente.close).toHaveBeenCalledOnce();
  });

  it("attiva il polling di delta su errore e lo ferma alla riapertura", async () => {
    const queryClient = new QueryClient();
    const chiave = chiaveQuerySessione(SESSIONE, "registro");
    queryClient.setQueryData(chiave, []);
    const sorgente = new SorgenteEventiFinta();
    const recuperaDelta = vi.fn().mockResolvedValue({ ordinaleCorrente: 7 });
    let azionePolling: (() => void) | null = null;
    const cancellaIntervallo = vi.fn();

    const ferma = avviaRiconciliazioneSessione({
      queryClient,
      sessioneAstaId: SESSIONE,
      creaSorgenteEventi: () => sorgente,
      recuperaDelta,
      impostaIntervallo: (azione, millisecondi) => {
        expect(millisecondi).toBe(5_000);
        azionePolling = azione;
        return 123 as unknown as ReturnType<typeof setInterval>;
      },
      cancellaIntervallo,
    });

    sorgente.onerror?.();
    await vi.waitFor(() => expect(recuperaDelta).toHaveBeenCalledWith(
      `/api/sessioni/${SESSIONE}/registro?dopoOrdinale=0`,
    ));
    await vi.waitFor(() => {
      expect(queryClient.getQueryState(chiave)?.isInvalidated).toBe(true);
    });
    expect(azionePolling).not.toBeNull();

    sorgente.onopen?.();
    expect(cancellaIntervallo).toHaveBeenCalledOnce();
    ferma();
  });
});
