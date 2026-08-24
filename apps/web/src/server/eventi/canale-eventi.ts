import type { VoceRegistro } from "@asta/contracts";
import type { RepositoryRegistro } from "@asta/db";

export const INTERVALLO_KEEP_ALIVE_MS = 25_000;
export const INTERVALLO_POLLING_MS = 5_000;

const codificatore = new TextEncoder();
const IDENTIFICATIVO_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface SottoscrizioneEventi {
  chiudi(): Promise<void>;
}

export interface TrasportoEventiSessione {
  sottoscrivi(
    sessioneAstaId: string,
    ricevi: (ordinale: number) => void,
    errore: (causa: Error) => void,
  ): Promise<SottoscrizioneEventi>;
}

export interface DipendenzeCanaleEventi {
  readonly caricaSessionePropria: (sessioneAstaId: string) => Promise<unknown>;
  readonly registro: Pick<RepositoryRegistro, "elencaPerSessione">;
  readonly trasporto: TrasportoEventiSessione;
  readonly intervalloKeepAliveMs?: number;
}

export interface DeltaRegistro {
  readonly dopoOrdinale: number;
  readonly ordinaleCorrente: number;
  readonly voci: readonly VoceRegistro[];
}

export class ErroreInputCanaleEventi extends Error {
  override readonly name = "ErroreInputCanaleEventi";

  constructor(
    readonly campo: "sessioneAstaId" | "dopoOrdinale" | "Last-Event-ID",
    readonly valore: unknown,
    messaggio: string,
  ) {
    super(messaggio);
  }
}

function ordinaleNonNegativo(
  valore: string | number | null,
  campo: "dopoOrdinale" | "Last-Event-ID",
): number | null {
  if (valore === null || valore === "") return null;
  const numero = typeof valore === "number" ? valore : Number(valore);
  if (
    !Number.isSafeInteger(numero) ||
    numero < 0 ||
    (typeof valore === "string" && !/^\d+$/.test(valore))
  ) {
    throw new ErroreInputCanaleEventi(
      campo,
      valore,
      `${campo} deve essere un intero non negativo.`,
    );
  }
  return numero;
}

function validaSessioneAstaId(sessioneAstaId: string): void {
  if (!IDENTIFICATIVO_UUID.test(sessioneAstaId)) {
    throw new ErroreInputCanaleEventi(
      "sessioneAstaId",
      sessioneAstaId,
      "sessioneAstaId deve essere un UUID valido.",
    );
  }
}

function massimoOrdinale(voci: readonly VoceRegistro[]): number {
  return voci.reduce(
    (massimo, voce) => Math.max(massimo, voce.ordinale),
    0,
  );
}

function messaggioSse(
  evento: "iniziale" | "registro",
  id: number,
  dati: Readonly<Record<string, number>>,
): Uint8Array {
  return codificatore.encode(
    `event: ${evento}\nid: ${id}\ndata: ${JSON.stringify(dati)}\n\n`,
  );
}

/**
 * Canale applicativo SSE. La guardia viene sempre eseguita prima dell'apertura
 * della connessione LISTEN; il registro rimane la fonte autorevole per resume e
 * polling, mentre le notifiche trasportano soltanto l'ordinale mutato.
 */
export class CanaleEventi {
  private readonly intervalloKeepAliveMs: number;

  constructor(private readonly dipendenze: DipendenzeCanaleEventi) {
    this.intervalloKeepAliveMs =
      dipendenze.intervalloKeepAliveMs ?? INTERVALLO_KEEP_ALIVE_MS;
    if (
      !Number.isInteger(this.intervalloKeepAliveMs) ||
      this.intervalloKeepAliveMs < 1
    ) {
      throw new RangeError("L'intervallo di keep-alive deve essere positivo.");
    }
  }

  async delta(
    sessioneAstaId: string,
    dopoOrdinaleInput: string | number | null,
  ): Promise<DeltaRegistro> {
    validaSessioneAstaId(sessioneAstaId);
    const dopoOrdinale =
      ordinaleNonNegativo(dopoOrdinaleInput, "dopoOrdinale") ?? 0;
    await this.dipendenze.caricaSessionePropria(sessioneAstaId);
    const registro = await this.dipendenze.registro.elencaPerSessione(
      sessioneAstaId,
    );

    return {
      dopoOrdinale,
      ordinaleCorrente: massimoOrdinale(registro),
      voci: registro.filter((voce) => voce.ordinale > dopoOrdinale),
    };
  }

  async apri(
    sessioneAstaId: string,
    ultimoEventoInput: string | null,
    segnale: AbortSignal,
  ): Promise<Response> {
    validaSessioneAstaId(sessioneAstaId);
    const ultimoEvento = ordinaleNonNegativo(
      ultimoEventoInput,
      "Last-Event-ID",
    );
    await this.dipendenze.caricaSessionePropria(sessioneAstaId);

    let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
    let errorePendente: Error | null = null;
    const eventiPendenti: number[] = [];
    const sottoscrizione = await this.dipendenze.trasporto.sottoscrivi(
      sessioneAstaId,
      (ordinale) => {
        if (controller === null) {
          eventiPendenti.push(ordinale);
          return;
        }
        controller.enqueue(
          messaggioSse("registro", ordinale, { ordinale }),
        );
      },
      (causa) => {
        if (controller === null) {
          errorePendente = causa;
          return;
        }
        controller.error(causa);
      },
    );

    let registro: readonly VoceRegistro[];
    try {
      registro = await this.dipendenze.registro.elencaPerSessione(
        sessioneAstaId,
      );
    } catch (error_) {
      await sottoscrizione.chiudi();
      throw error_;
    }

    const ordinaleCorrente = massimoOrdinale(registro);
    const eventiRecuperati =
      ultimoEvento === null
        ? []
        : registro.filter((voce) => voce.ordinale > ultimoEvento);
    let intervallo: ReturnType<typeof setInterval> | null = null;
    let chiusa = false;

    const chiudi = async (): Promise<void> => {
      if (chiusa) return;
      chiusa = true;
      if (intervallo !== null) clearInterval(intervallo);
      segnale.removeEventListener("abort", interrompi);
      await sottoscrizione.chiudi();
    };
    const interrompi = (): void => {
      void chiudi();
    };

    const stream = new ReadableStream<Uint8Array>({
      start: (controllore) => {
        controller = controllore;
        controllore.enqueue(
          codificatore.encode(`retry: ${INTERVALLO_POLLING_MS}\n\n`),
        );
        for (const voce of eventiRecuperati) {
          controllore.enqueue(
            messaggioSse("registro", voce.ordinale, {
              ordinale: voce.ordinale,
            }),
          );
        }
        controllore.enqueue(
          messaggioSse("iniziale", ordinaleCorrente, {
            ordinaleCorrente,
          }),
        );
        for (const ordinale of eventiPendenti) {
          controllore.enqueue(
            messaggioSse("registro", ordinale, { ordinale }),
          );
        }
        if (errorePendente !== null) {
          controllore.error(errorePendente);
          void chiudi();
          return;
        }
        intervallo = setInterval(() => {
          controllore.enqueue(codificatore.encode(": keep-alive\n\n"));
        }, this.intervalloKeepAliveMs);
        segnale.addEventListener("abort", interrompi, { once: true });
        if (segnale.aborted) interrompi();
      },
      cancel: chiudi,
    });

    return new Response(stream, {
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate",
        Connection: "keep-alive",
        "Content-Type": "text/event-stream; charset=utf-8",
        "X-Accel-Buffering": "no",
        "X-Polling-Interval-Ms": String(INTERVALLO_POLLING_MS),
      },
    });
  }
}
