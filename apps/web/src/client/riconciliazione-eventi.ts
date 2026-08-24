import type { QueryClient } from "@tanstack/react-query";

import { queryAppartieneASessione } from "./query-client";

export const INTERVALLO_POLLING_CLIENT_MS = 5_000;

interface EventoSse {
  readonly data: string;
}

interface SorgenteEventi {
  onopen: (() => void) | null;
  onerror: (() => void) | null;
  addEventListener(
    tipo: "iniziale" | "registro",
    ricevi: (evento: EventoSse) => void,
  ): void;
  close(): void;
}

interface DeltaRegistroClient {
  readonly ordinaleCorrente: number;
}

export interface DipendenzeRiconciliazione {
  readonly queryClient: QueryClient;
  readonly sessioneAstaId: string;
  readonly creaSorgenteEventi?: (url: string) => SorgenteEventi;
  readonly recuperaDelta?: (url: string) => Promise<DeltaRegistroClient>;
  readonly impostaIntervallo?: (
    azione: () => void,
    millisecondi: number,
  ) => ReturnType<typeof setInterval>;
  readonly cancellaIntervallo?: (id: ReturnType<typeof setInterval>) => void;
  readonly intervalloPollingMs?: number;
}

function creaSorgenteEventiBrowser(url: string): SorgenteEventi {
  const sorgente = new EventSource(url, { withCredentials: true });
  return {
    get onopen() {
      return sorgente.onopen as (() => void) | null;
    },
    set onopen(gestore) {
      sorgente.onopen = gestore;
    },
    get onerror() {
      return sorgente.onerror as (() => void) | null;
    },
    set onerror(gestore) {
      sorgente.onerror = gestore;
    },
    addEventListener(tipo, ricevi) {
      sorgente.addEventListener(tipo, (evento) => {
        ricevi({ data: (evento as MessageEvent<string>).data });
      });
    },
    close() {
      sorgente.close();
    },
  };
}

async function recuperaDeltaBrowser(url: string): Promise<DeltaRegistroClient> {
  const risposta = await fetch(url, {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });
  if (!risposta.ok) {
    throw new Error(`Recupero delta fallito con stato ${risposta.status}.`);
  }
  return (await risposta.json()) as DeltaRegistroClient;
}

function leggiOrdinale(data: string, campo: string): number | null {
  try {
    const valore = (JSON.parse(data) as Record<string, unknown>)[campo];
    return Number.isSafeInteger(valore) && Number(valore) >= 0
      ? Number(valore)
      : null;
  } catch {
    return null;
  }
}

/**
 * Collega la cache della singola sessione al canale SSE. Eventi duplicati o
 * malformati vengono ignorati; se lo stream cade, il delta autorevole viene
 * controllato ogni cinque secondi finché EventSource non si riapre.
 */
export function avviaRiconciliazioneSessione(
  dipendenze: DipendenzeRiconciliazione,
): () => void {
  const idCodificato = encodeURIComponent(dipendenze.sessioneAstaId);
  const urlBase = `/api/sessioni/${idCodificato}`;
  const creaSorgente =
    dipendenze.creaSorgenteEventi ?? creaSorgenteEventiBrowser;
  const recuperaDelta = dipendenze.recuperaDelta ?? recuperaDeltaBrowser;
  const impostaIntervallo =
    dipendenze.impostaIntervallo ?? ((azione, ms) => setInterval(azione, ms));
  const cancellaIntervallo =
    dipendenze.cancellaIntervallo ?? ((id) => clearInterval(id));
  const intervalloPolling =
    dipendenze.intervalloPollingMs ?? INTERVALLO_POLLING_CLIENT_MS;

  let ultimoOrdinale = 0;
  let intervallo: ReturnType<typeof setInterval> | null = null;
  let controlloInCorso = false;
  let chiusa = false;

  const invalidaCache = async (): Promise<void> => {
    await dipendenze.queryClient.invalidateQueries({
      predicate: (query) =>
        queryAppartieneASessione(
          query.queryKey,
          dipendenze.sessioneAstaId,
        ),
    });
  };

  const applicaOrdinale = (ordinale: number): void => {
    if (ordinale <= ultimoOrdinale || chiusa) return;
    ultimoOrdinale = ordinale;
    void invalidaCache();
  };

  const controllaDelta = async (): Promise<void> => {
    if (controlloInCorso || chiusa) return;
    controlloInCorso = true;
    try {
      const delta = await recuperaDelta(
        `${urlBase}/registro?dopoOrdinale=${ultimoOrdinale}`,
      );
      if (Number.isSafeInteger(delta.ordinaleCorrente)) {
        applicaOrdinale(delta.ordinaleCorrente);
      }
    } catch {
      // Il polling ritenta all'intervallo successivo; la cache resta utilizzabile.
    } finally {
      controlloInCorso = false;
    }
  };

  const fermaPolling = (): void => {
    if (intervallo === null) return;
    cancellaIntervallo(intervallo);
    intervallo = null;
  };

  const avviaPolling = (): void => {
    if (intervallo !== null || chiusa) return;
    void controllaDelta();
    intervallo = impostaIntervallo(() => {
      void controllaDelta();
    }, intervalloPolling);
  };

  const sorgente = creaSorgente(`${urlBase}/eventi`);
  sorgente.addEventListener("iniziale", (evento) => {
    const ordinale = leggiOrdinale(evento.data, "ordinaleCorrente");
    if (ordinale !== null) applicaOrdinale(ordinale);
  });
  sorgente.addEventListener("registro", (evento) => {
    const ordinale = leggiOrdinale(evento.data, "ordinale");
    if (ordinale !== null) applicaOrdinale(ordinale);
  });
  sorgente.onopen = fermaPolling;
  sorgente.onerror = avviaPolling;

  return () => {
    if (chiusa) return;
    chiusa = true;
    fermaPolling();
    sorgente.close();
  };
}
