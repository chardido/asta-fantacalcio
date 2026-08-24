import { TRPCError } from "@trpc/server";
import { ZodError } from "zod";

import { ErroreHttpAccessoSessione } from "../sessioni/carica-sessione-propria";

export type StatoErroreApi = 400 | 401 | 404 | 409 | 503;

export interface DettagliErroreApplicativo {
  readonly codice: string;
  readonly campo?: string | null;
  readonly vincolo?: string | null;
  readonly valoriImmessi?: unknown;
  /** Dati specifici, per esempio la voce esistente in caso di conflitto. */
  readonly dettagli?: unknown;
}

export interface DatiErroreFormattato {
  readonly codice: string;
  readonly campo: string | null;
  readonly vincolo: string | null;
  readonly valoriImmessi: unknown;
  readonly dettagli: unknown;
}

/** Errore atteso dei servizi applicativi, traducibile senza perdere i dettagli utili alla UI. */
export class ErroreApplicativo extends Error {
  override readonly name = "ErroreApplicativo";

  constructor(
    readonly status: StatoErroreApi,
    readonly dati: DettagliErroreApplicativo,
    messaggio: string,
  ) {
    super(messaggio);
  }
}

const CODICE_TRPC_PER_STATUS = {
  400: "BAD_REQUEST",
  401: "UNAUTHORIZED",
  404: "NOT_FOUND",
  409: "CONFLICT",
  503: "SERVICE_UNAVAILABLE",
} as const;

const CODICE_API_PREDEFINITO = {
  BAD_REQUEST: "richiesta_non_valida",
  UNAUTHORIZED: "non_autenticato",
  NOT_FOUND: "risorsa_non_disponibile",
  CONFLICT: "conflitto_stato",
  SERVICE_UNAVAILABLE: "servizio_non_disponibile",
  INTERNAL_SERVER_ERROR: "errore_interno",
} as const;

const CHIAVI_SENSIBILI = /password|token|authorization|cookie|secret/i;

function causaAnnidata(errore: unknown): unknown {
  if (typeof errore !== "object" || errore === null || !("cause" in errore)) {
    return undefined;
  }
  return (errore as { readonly cause?: unknown }).cause;
}

function trovaCausa<T>(
  errore: unknown,
  riconosci: (valore: unknown) => valore is T,
): T | null {
  let corrente: unknown = errore;
  const visitati = new Set<unknown>();

  for (let profondita = 0; profondita < 6; profondita += 1) {
    if (riconosci(corrente)) {
      return corrente;
    }
    if (corrente === undefined || visitati.has(corrente)) {
      break;
    }
    visitati.add(corrente);
    corrente = causaAnnidata(corrente);
  }

  return null;
}

/** Restituisce una copia serializzabile dei valori immessi senza riflettere credenziali o token. */
export function sanitizzaValoriImmessi(
  valore: unknown,
  visitati: WeakSet<object> = new WeakSet<object>(),
): unknown {
  if (
    valore === null ||
    typeof valore === "string" ||
    typeof valore === "number" ||
    typeof valore === "boolean"
  ) {
    return valore;
  }
  if (typeof valore === "bigint") {
    return valore.toString();
  }
  if (valore instanceof Date) {
    return valore.toISOString();
  }
  if (Array.isArray(valore)) {
    return valore.map((elemento) => sanitizzaValoriImmessi(elemento, visitati));
  }
  if (typeof valore !== "object") {
    return null;
  }
  if (visitati.has(valore)) {
    return "[valore_circolare]";
  }
  visitati.add(valore);

  const risultato: Record<string, unknown> = {};
  for (const [chiave, elemento] of Object.entries(valore)) {
    risultato[chiave] = CHIAVI_SENSIBILI.test(chiave)
      ? "[redatto]"
      : sanitizzaValoriImmessi(elemento, visitati);
  }
  return risultato;
}

/** Traduce gli errori applicativi nei codici tRPC che determinano gli status HTTP richiesti. */
export function mappaErroreTrpc(errore: unknown): TRPCError {
  const applicativo = trovaCausa(
    errore,
    (valore): valore is ErroreApplicativo =>
      valore instanceof ErroreApplicativo,
  );
  if (applicativo !== null) {
    return new TRPCError({
      code: CODICE_TRPC_PER_STATUS[applicativo.status],
      message: applicativo.message,
      cause: applicativo,
    });
  }

  const accesso = trovaCausa(
    errore,
    (valore): valore is ErroreHttpAccessoSessione =>
      valore instanceof ErroreHttpAccessoSessione,
  );
  if (accesso !== null) {
    return new TRPCError({
      code: CODICE_TRPC_PER_STATUS[accesso.status],
      message: accesso.message,
      cause: accesso,
    });
  }

  if (errore instanceof TRPCError) {
    return errore;
  }

  return new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: "Errore interno del server.",
    cause: errore,
  });
}

function codicePredefinito(codiceTrpc: string): string {
  return (
    CODICE_API_PREDEFINITO[
      codiceTrpc as keyof typeof CODICE_API_PREDEFINITO
    ] ?? "errore_interno"
  );
}

/** Costruisce la parte stabile e tipizzata aggiunta dall'error formatter tRPC. */
export function descriviErroreTrpc(
  errore: TRPCError,
  input: unknown,
): DatiErroreFormattato {
  const applicativo = trovaCausa(
    errore,
    (valore): valore is ErroreApplicativo =>
      valore instanceof ErroreApplicativo,
  );
  const accesso = trovaCausa(
    errore,
    (valore): valore is ErroreHttpAccessoSessione =>
      valore instanceof ErroreHttpAccessoSessione,
  );
  const zod = trovaCausa(
    errore,
    (valore): valore is ZodError => valore instanceof ZodError,
  );
  const primaIssue = zod?.issues[0];
  const datiApplicativi = applicativo?.dati;
  const valoriImmessi =
    input === undefined ? datiApplicativi?.valoriImmessi : input;

  return {
    codice:
      datiApplicativi?.codice ??
      accesso?.codice ??
      (zod === null ? codicePredefinito(errore.code) : "validazione_input"),
    campo:
      datiApplicativi?.campo ??
      (primaIssue === undefined || primaIssue.path.length === 0
        ? null
        : primaIssue.path.join(".")),
    vincolo: datiApplicativi?.vincolo ?? primaIssue?.message ?? null,
    valoriImmessi: sanitizzaValoriImmessi(valoriImmessi),
    dettagli: sanitizzaValoriImmessi(datiApplicativi?.dettagli),
  };
}
