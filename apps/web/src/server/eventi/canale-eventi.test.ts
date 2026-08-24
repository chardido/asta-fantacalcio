import type { VoceRegistro } from "@asta/contracts";
import { describe, expect, it, vi } from "vitest";

import {
  CanaleEventi,
  type SottoscrizioneEventi,
  type TrasportoEventiSessione,
} from "./canale-eventi.js";

const ID_SESSIONE = "00000000-0000-4000-8000-000000000001";

function voce(ordinale: number): VoceRegistro {
  return {
    id: `00000000-0000-4000-8000-${String(ordinale).padStart(12, "0")}`,
    sessioneAstaId: ID_SESSIONE,
    ordinale,
    identificativoGiocatore: `player-${ordinale}`,
    nomeGiocatore: `Giocatore ${ordinale}`,
    ruolo: "D",
    squadra: "Roma",
    repartoAssegnato: "D",
    macroReparto: "DIF",
    prezzoAcquisto: 10,
    assegnatarioTipo: "utente",
    avversarioId: null,
    annullataIl: null,
    chiaveIdempotenza: `10000000-0000-4000-8000-${String(ordinale).padStart(12, "0")}`,
    giocatoreAssenteDatiCorrenti: false,
  };
}

class TrasportoMemoria implements TrasportoEventiSessione {
  readonly chiudi = vi.fn<SottoscrizioneEventi["chiudi"]>().mockResolvedValue();
  ricevi: ((ordinale: number) => void) | null = null;
  errore: ((causa: Error) => void) | null = null;

  async sottoscrivi(
    _sessioneAstaId: string,
    ricevi: (ordinale: number) => void,
    errore: (causa: Error) => void,
  ): Promise<SottoscrizioneEventi> {
    this.ricevi = ricevi;
    this.errore = errore;
    return { chiudi: this.chiudi };
  }

  pubblica(ordinale: number): void {
    this.ricevi?.(ordinale);
  }
}

async function leggiFinoA(
  lettore: ReadableStreamDefaultReader<Uint8Array>,
  testoAtteso: string,
): Promise<string> {
  const decodificatore = new TextDecoder();
  let testo = "";
  while (!testo.includes(testoAtteso)) {
    const risultato = await lettore.read();
    if (risultato.done) break;
    testo += decodificatore.decode(risultato.value, { stream: true });
  }
  return testo;
}

function scenario(registro: readonly VoceRegistro[] = []) {
  const ordine: string[] = [];
  const trasporto = new TrasportoMemoria();
  const caricaSessionePropria = vi.fn(async () => {
    ordine.push("guardia");
    return {};
  });
  const sottoscriviOriginale = trasporto.sottoscrivi.bind(trasporto);
  vi.spyOn(trasporto, "sottoscrivi").mockImplementation(async (...argomenti) => {
    ordine.push("listen");
    return sottoscriviOriginale(...argomenti);
  });
  const elencaPerSessione = vi.fn(async () => {
    ordine.push("registro");
    return registro;
  });
  return {
    canale: new CanaleEventi({
      caricaSessionePropria,
      registro: { elencaPerSessione },
      trasporto,
      intervalloKeepAliveMs: 10_000,
    }),
    caricaSessionePropria,
    ordine,
    trasporto,
  };
}

// **Validates: Requirements 7.2, 7.13**
describe("CanaleEventi SSE", () => {
  it("verifica la proprietà prima di LISTEN e invia ordinale iniziale, retry e notifiche live", async () => {
    const corrente = voce(3);
    const corrente2 = voce(4);
    const contesto = scenario([corrente, corrente2]);
    const annullamento = new AbortController();

    const risposta = await contesto.canale.apri(
      ID_SESSIONE,
      null,
      annullamento.signal,
    );
    const lettore = risposta.body?.getReader();
    expect(lettore).toBeDefined();
    if (lettore === undefined) return;

    const iniziale = await leggiFinoA(lettore, 'data: {"ordinaleCorrente":4}');
    expect(contesto.ordine).toEqual(["guardia", "listen", "registro"]);
    expect(risposta.headers.get("content-type")).toContain("text/event-stream");
    expect(risposta.headers.get("x-polling-interval-ms")).toBe("5000");
    expect(iniziale).toContain("retry: 5000");
    expect(iniziale).toContain("event: iniziale\nid: 4");

    contesto.trasporto.pubblica(4);
    const live = await leggiFinoA(lettore, 'data: {"ordinale":4}');
    expect(live).toContain("event: registro\nid: 4");

    await lettore.cancel();
    expect(contesto.trasporto.chiudi).toHaveBeenCalledOnce();
  });

  it("usa Last-Event-ID per recuperare gli ordinali persi prima dell'evento iniziale corrente", async () => {
    const contesto = scenario([voce(1), voce(2), voce(3)]);
    const risposta = await contesto.canale.apri(
      ID_SESSIONE,
      "1",
      new AbortController().signal,
    );
    const lettore = risposta.body?.getReader();
    expect(lettore).toBeDefined();
    if (lettore === undefined) return;

    const testo = await leggiFinoA(lettore, 'data: {"ordinaleCorrente":3}');
    expect(testo).toContain('event: registro\nid: 2\ndata: {"ordinale":2}');
    expect(testo).toContain('event: registro\nid: 3\ndata: {"ordinale":3}');
    expect(testo.indexOf("event: registro")).toBeLessThan(
      testo.indexOf("event: iniziale"),
    );
    await lettore.cancel();
  });

  it("espone il delta dopoOrdinale ordinato e protetto dalla stessa guardia", async () => {
    const contesto = scenario([voce(1), voce(2), voce(3)]);

    await expect(contesto.canale.delta(ID_SESSIONE, "1")).resolves.toEqual({
      dopoOrdinale: 1,
      ordinaleCorrente: 3,
      voci: [voce(2), voce(3)],
    });
    expect(contesto.caricaSessionePropria).toHaveBeenCalledWith(ID_SESSIONE);
  });

  it("non apre LISTEN quando la guardia di proprietà rifiuta la connessione", async () => {
    const contesto = scenario();
    contesto.caricaSessionePropria.mockRejectedValueOnce(
      new Error("sessione non disponibile"),
    );

    await expect(
      contesto.canale.apri(
        ID_SESSIONE,
        null,
        new AbortController().signal,
      ),
    ).rejects.toThrow("sessione non disponibile");
    expect(contesto.trasporto.sottoscrivi).not.toHaveBeenCalled();
  });
});
