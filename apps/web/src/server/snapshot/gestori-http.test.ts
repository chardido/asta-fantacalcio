import { describe, expect, it, vi } from "vitest";

import {
  gestisciDashboardSnapshot,
  gestisciIndiceSnapshot,
  gestisciSchedaGiocatoreSnapshot,
} from "./gestori-http";
import { ErroreConsultazioneSnapshot } from "./servizio-consultazione-snapshot";

const HASH = "b".repeat(64);
const INDICE = {
  snapshotId: "snapshot-1",
  hashContenuto: HASH,
  giocatori: [],
};

// **Validates: Requirements 4.2, 4.6, 4.10**
describe("gestisciIndiceSnapshot", () => {
  it("invia ETag dall'hash e una politica di cache con rivalidazione", async () => {
    const indice = vi.fn().mockResolvedValue(INDICE);
    const risposta = await gestisciIndiceSnapshot(
      new Request(
        "http://localhost/api/snapshot/corrente/indice?sessioneAstaId=sessione-1",
      ),
      { indice },
    );

    expect(risposta.status).toBe(200);
    expect(risposta.headers.get("etag")).toBe(`"${HASH}"`);
    expect(risposta.headers.get("cache-control")).toBe(
      "private, max-age=0, must-revalidate",
    );
    await expect(risposta.json()).resolves.toEqual(INDICE);
    expect(indice).toHaveBeenCalledWith("sessione-1");
  });

  it("risponde 304 senza corpo quando If-None-Match coincide", async () => {
    const indice = vi.fn().mockResolvedValue(INDICE);
    const risposta = await gestisciIndiceSnapshot(
      new Request(
        "http://localhost/api/snapshot/corrente/indice?sessioneAstaId=sessione-1",
        { headers: { "If-None-Match": `"${HASH}"` } },
      ),
      { indice },
    );

    expect(risposta.status).toBe(304);
    expect(risposta.headers.get("etag")).toBe(`"${HASH}"`);
    expect(await risposta.text()).toBe("");
  });

  it("rifiuta la richiesta priva della sessione senza interrogare il servizio", async () => {
    const indice = vi.fn();
    const risposta = await gestisciIndiceSnapshot(
      new Request("http://localhost/api/snapshot/corrente/indice"),
      { indice },
    );

    expect(risposta.status).toBe(400);
    await expect(risposta.json()).resolves.toMatchObject({
      codice: "sessione_asta_id_obbligatorio",
    });
    expect(indice).not.toHaveBeenCalled();
  });
});

// **Validates: Requirements 13.1, 13.3**
describe("gestisciDashboardSnapshot", () => {
  it("restituisce la proiezione con cache legata allo snapshot", async () => {
    const dati = {
      snapshotId: "snapshot-1",
      hashContenuto: HASH,
      giocatori: [],
    };
    const dashboard = vi.fn().mockResolvedValue(dati);
    const risposta = await gestisciDashboardSnapshot(
      new Request(
        "http://localhost/api/snapshot/corrente/dashboard?sessioneAstaId=sessione-1",
      ),
      { dashboard },
    );

    expect(risposta.status).toBe(200);
    expect(risposta.headers.get("etag")).toBe(`"${HASH}"`);
    expect(risposta.headers.get("cache-control")).toBe(
      "private, max-age=0, must-revalidate",
    );
    await expect(risposta.json()).resolves.toEqual(dati);
    expect(dashboard).toHaveBeenCalledWith("sessione-1");
  });
});

// **Validates: Requirements 5.8, 5.17, 5.18**
describe("gestisciSchedaGiocatoreSnapshot", () => {
  it("restituisce la scheda senza cache perché la lettura registra la consultazione", async () => {
    const schedaRestituita = {
      snapshotId: "snapshot-1",
      hashContenuto: HASH,
      giocatore: { id: "player-1" },
    };
    const scheda = vi.fn().mockResolvedValue(schedaRestituita);
    const risposta = await gestisciSchedaGiocatoreSnapshot(
      new Request(
        "http://localhost/api/snapshot/corrente/giocatori/player-1?sessioneAstaId=sessione-1",
      ),
      "player-1",
      { scheda },
    );

    expect(risposta.status).toBe(200);
    expect(risposta.headers.get("cache-control")).toBe("no-store");
    await expect(risposta.json()).resolves.toEqual(schedaRestituita);
    expect(scheda).toHaveBeenCalledWith("sessione-1", "player-1");
  });

  it("mappa gli errori applicativi senza perdere codice e stato", async () => {
    const scheda = vi.fn().mockRejectedValue(
      new ErroreConsultazioneSnapshot(
        404,
        "giocatore_non_disponibile",
        "Giocatore assente.",
      ),
    );
    const risposta = await gestisciSchedaGiocatoreSnapshot(
      new Request(
        "http://localhost/api/snapshot/corrente/giocatori/assente?sessioneAstaId=sessione-1",
      ),
      "assente",
      { scheda },
    );

    expect(risposta.status).toBe(404);
    await expect(risposta.json()).resolves.toEqual({
      codice: "giocatore_non_disponibile",
      messaggio: "Giocatore assente.",
    });
  });
});
