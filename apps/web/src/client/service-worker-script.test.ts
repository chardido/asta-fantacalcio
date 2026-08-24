import { readFileSync } from "node:fs";
import vm from "node:vm";

import { describe, expect, it, vi } from "vitest";

const ORIGINE = "https://asta.example";

function chiaveCache(richiesta: RequestInfo | URL): string {
  if (typeof richiesta === "string") return new URL(richiesta, ORIGINE).href;
  if (richiesta instanceof URL) return richiesta.href;
  return richiesta.url;
}

class CacheMemoria {
  readonly risposte = new Map<string, Response>();

  async match(richiesta: RequestInfo | URL): Promise<Response | undefined> {
    return this.risposte.get(chiaveCache(richiesta))?.clone();
  }

  async put(richiesta: RequestInfo | URL, risposta: Response): Promise<void> {
    this.risposte.set(chiaveCache(richiesta), risposta.clone());
  }

  async delete(richiesta: RequestInfo | URL): Promise<boolean> {
    return this.risposte.delete(chiaveCache(richiesta));
  }
}

interface EventoFetchWorker {
  readonly request: Request;
  respondWith(risposta: Promise<Response>): void;
}

function caricaWorker(fetchMock: ReturnType<typeof vi.fn>) {
  const gestori = new Map<string, (evento: EventoFetchWorker) => void>();
  const cache = new Map<string, CacheMemoria>();
  const caches = {
    open: async (nome: string) => {
      const corrente = cache.get(nome) ?? new CacheMemoria();
      cache.set(nome, corrente);
      return corrente;
    },
    keys: async () => [...cache.keys()],
    delete: async (nome: string) => cache.delete(nome),
  };
  const self = {
    location: { origin: ORIGINE },
    clients: { claim: async () => undefined },
    skipWaiting: async () => undefined,
    addEventListener: (tipo: string, gestore: (evento: EventoFetchWorker) => void) => {
      gestori.set(tipo, gestore);
    },
  };

  const script = readFileSync(new URL("../../public/sw.js", import.meta.url), "utf8");
  vm.runInNewContext(script, {
    caches,
    fetch: fetchMock,
    Headers,
    Request,
    Response,
    self,
    Set,
    URL,
  });

  return { gestori };
}

async function eseguiFetch(
  gestore: (evento: EventoFetchWorker) => void,
  richiesta: Request,
): Promise<Response | undefined> {
  let risposta: Promise<Response> | undefined;
  gestore({
    request: richiesta,
    respondWith: (valore: Promise<Response>) => {
      risposta = valore;
    },
  });
  return risposta;
}

// **Validates: Requirements 12.2, 12.3**
describe("strategie cache del Service Worker", () => {
  it("memorizza l'indice per URL e lo restituisce quando la rete non è disponibile", async () => {
    const corpo = JSON.stringify({ snapshotId: "snapshot-1", giocatori: [] });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(corpo, {
          headers: { ETag: '"hash-snapshot"', "Content-Type": "application/json" },
        }),
      )
      .mockRejectedValueOnce(new Error("offline"));
    const { gestori } = caricaWorker(fetchMock);
    const richiesta = new Request(
      `${ORIGINE}/api/snapshot/corrente/indice?sessioneAstaId=sessione-1`,
      { credentials: "same-origin" },
    );
    const gestoreFetch = gestori.get("fetch");
    expect(gestoreFetch).toBeDefined();

    const online = await eseguiFetch(gestoreFetch!, richiesta);
    await expect(online?.text()).resolves.toBe(corpo);

    const offline = await eseguiFetch(gestoreFetch!, richiesta);
    await expect(offline?.text()).resolves.toBe(corpo);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const richiestaRivalidata = fetchMock.mock.calls[1]?.[0] as Request;
    expect(richiestaRivalidata.headers.get("if-none-match")).toBe('"hash-snapshot"');
  });

  it("non intercetta mutazioni", async () => {
    const fetchMock = vi.fn();
    const { gestori } = caricaWorker(fetchMock);
    const gestoreFetch = gestori.get("fetch");
    let intercettata = false;

    gestoreFetch?.({
      request: new Request(`${ORIGINE}/api/registro`, { method: "POST" }),
      respondWith: () => {
        intercettata = true;
      },
    });

    expect(intercettata).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
