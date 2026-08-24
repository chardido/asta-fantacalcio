import {
  SCHEMA_FILE_ESPORTAZIONE,
  configurazioneAstaSchema,
  corpoFileEsportazioneSchema,
  fileEsportazioneSchema,
  type ConfigurazioneAsta,
  type CorpoFileEsportazione,
  type FileEsportazione,
  type VoceRegistroEsportata,
  type VoceRosa,
  type VoceRosaEsportata,
} from "@asta/contracts";

import { sha256 } from "./sha256.js";

const CAMPI_CONFIGURAZIONE = [
  "nome",
  "tipoAsta",
  "modalitaGioco",
  "numeroPartecipanti",
  "creditiIniziali",
  "modificatoreDifesa",
  "composizioneRosa",
  "quoteReparto",
  "pesiValutazione",
] as const;

export interface DatiEsportazione {
  readonly esportatoIl: string;
  readonly configurazione: ConfigurazioneAsta;
  readonly rosa: readonly VoceRosa[];
  readonly registro: readonly VoceRegistroEsportata[];
}

export interface DatiImportati {
  readonly esportatoIl: string;
  readonly configurazione: ConfigurazioneAsta;
  readonly rosa: readonly VoceRosaEsportata[];
  readonly registro: readonly VoceRegistroEsportata[];
}

export type ErroreImportazione =
  | {
      readonly codice: "file_illeggibile";
      readonly motivo: "contenuto_non_testuale" | "json_non_valido";
    }
  | {
      readonly codice: "file_incompleto";
      readonly campo: string;
      readonly motivo: string;
    }
  | {
      readonly codice: "schema_ignoto";
      readonly schemaRicevuto: unknown;
      readonly schemaSupportato: typeof SCHEMA_FILE_ESPORTAZIONE;
    }
  | {
      readonly codice: "firma_non_corrispondente";
      readonly firmaRicevuta: string;
      readonly firmaAttesa: string;
    }
  | {
      readonly codice: "configurazione_divergente";
      readonly campo: string;
      readonly valoreFile: unknown;
      readonly valoreDestinazione: unknown;
    };

export type RisultatoImportazione =
  | { readonly ok: true; readonly valore: DatiImportati }
  | { readonly ok: false; readonly errore: ErroreImportazione };

function isOggetto(valore: unknown): valore is Record<string, unknown> {
  return typeof valore === "object" && valore !== null && !Array.isArray(valore);
}

/**
 * Serializza un valore JSON ordinando lessicograficamente le chiavi degli
 * oggetti. L'ordine degli array resta significativo.
 */
export function canonicalizzaJson(valore: unknown): string {
  if (valore === null || typeof valore === "boolean") {
    return JSON.stringify(valore);
  }
  if (typeof valore === "string") return JSON.stringify(valore);
  if (typeof valore === "number") {
    if (!Number.isFinite(valore)) {
      throw new TypeError(
        "Un valore JSON canonicale non può contenere numeri non finiti",
      );
    }
    return JSON.stringify(valore);
  }
  if (Array.isArray(valore)) {
    return `[${valore.map(canonicalizzaJson).join(",")}]`;
  }
  if (isOggetto(valore)) {
    return `{${Object.keys(valore)
      .sort()
      .map(
        (chiave) =>
          `${JSON.stringify(chiave)}:${canonicalizzaJson(valore[chiave])}`,
      )
      .join(",")}}`;
  }

  throw new Error("Il corpo da canonicalizzare deve contenere solo valori JSON");
}

function proiettaRosa(rosa: readonly VoceRosa[]): VoceRosaEsportata[] {
  return rosa.map((voce) => ({
    identificativoGiocatore: voce.identificativoGiocatore,
    nome: voce.nomeGiocatore,
    reparto: voce.repartoAssegnato,
    prezzoAcquisto: voce.prezzoAcquisto,
  }));
}

/**
 * Costruisce il file portabile senza leggere orologio o persistenza. L'istante
 * di esportazione e i nomi degli eventuali avversari arrivano dal chiamante.
 */
export function esporta(dati: DatiEsportazione): FileEsportazione {
  const corpo = corpoFileEsportazioneSchema.parse({
    schema: SCHEMA_FILE_ESPORTAZIONE,
    esportatoIl: dati.esportatoIl,
    configurazione: dati.configurazione,
    rosa: proiettaRosa(dati.rosa),
    registro: [...dati.registro]
      .sort((sinistra, destra) => sinistra.ordinale - destra.ordinale)
      .map((voce) => ({ ...voce })),
  });

  return {
    ...corpo,
    firma: sha256(canonicalizzaJson(corpo)),
  };
}

function percorsoProblema(percorso: readonly PropertyKey[]): string {
  return percorso.length === 0
    ? "file"
    : percorso.map((segmento) => String(segmento)).join(".");
}

function primoCampoConfigurazioneAssente(
  configurazioneGrezza: unknown,
  configurazione: ConfigurazioneAsta,
): string | null {
  if (!isOggetto(configurazioneGrezza)) return "configurazione";

  for (const campo of CAMPI_CONFIGURAZIONE) {
    if (!Object.hasOwn(configurazioneGrezza, campo)) {
      return `configurazione.${campo}`;
    }
  }

  for (const campoComposto of [
    "composizioneRosa",
    "quoteReparto",
    "pesiValutazione",
  ] as const) {
    const valoreGrezzo = configurazioneGrezza[campoComposto];
    const valoreCompleto = configurazione[campoComposto];
    if (!isOggetto(valoreGrezzo)) return `configurazione.${campoComposto}`;

    for (const campo of Object.keys(valoreCompleto)) {
      if (!Object.hasOwn(valoreGrezzo, campo)) {
        return `configurazione.${campoComposto}.${campo}`;
      }
    }
  }

  return null;
}

function unioneChiaviOrdinata(
  sinistra: Record<string, unknown>,
  destra: Record<string, unknown>,
): string[] {
  return [...new Set([...Object.keys(sinistra), ...Object.keys(destra)])].sort();
}

function primaDivergenza(
  valoreFile: unknown,
  valoreDestinazione: unknown,
  percorso: string,
  ordineChiavi?: readonly string[],
): { readonly campo: string; readonly valoreFile: unknown; readonly valoreDestinazione: unknown } | null {
  if (Object.is(valoreFile, valoreDestinazione)) return null;

  if (isOggetto(valoreFile) && isOggetto(valoreDestinazione)) {
    const chiavi = ordineChiavi ?? unioneChiaviOrdinata(valoreFile, valoreDestinazione);
    for (const chiave of chiavi) {
      const divergenza = primaDivergenza(
        valoreFile[chiave],
        valoreDestinazione[chiave],
        percorso === "" ? chiave : `${percorso}.${chiave}`,
      );
      if (divergenza !== null) return divergenza;
    }
    return null;
  }

  return { campo: percorso, valoreFile, valoreDestinazione };
}

function fallimento(errore: ErroreImportazione): RisultatoImportazione {
  return { ok: false, errore };
}

/**
 * Legge e verifica integralmente un file prima di restituire dati importabili.
 * Non modifica alcuno stato: la successiva scrittura transazionale resta
 * responsabilità del servizio applicativo.
 */
export function importa(
  contenuto: unknown,
  configurazioneDestinazione: ConfigurazioneAsta,
): RisultatoImportazione {
  if (typeof contenuto !== "string") {
    return fallimento({
      codice: "file_illeggibile",
      motivo: "contenuto_non_testuale",
    });
  }

  let valoreGrezzo: unknown;
  try {
    valoreGrezzo = JSON.parse(contenuto) as unknown;
  } catch {
    return fallimento({ codice: "file_illeggibile", motivo: "json_non_valido" });
  }

  if (!isOggetto(valoreGrezzo)) {
    return fallimento({
      codice: "file_incompleto",
      campo: "file",
      motivo: "Il contenuto JSON deve essere un oggetto",
    });
  }

  if (!Object.hasOwn(valoreGrezzo, "schema")) {
    return fallimento({
      codice: "file_incompleto",
      campo: "schema",
      motivo: "Campo obbligatorio assente",
    });
  }
  if (valoreGrezzo.schema !== SCHEMA_FILE_ESPORTAZIONE) {
    return fallimento({
      codice: "schema_ignoto",
      schemaRicevuto: valoreGrezzo.schema,
      schemaSupportato: SCHEMA_FILE_ESPORTAZIONE,
    });
  }

  const validazione = fileEsportazioneSchema.safeParse(valoreGrezzo);
  if (!validazione.success) {
    const problema = validazione.error.issues[0];
    return fallimento({
      codice: "file_incompleto",
      campo: percorsoProblema(problema?.path ?? []),
      motivo: problema?.message ?? "Formato del file non valido",
    });
  }

  const campoAssente = primoCampoConfigurazioneAssente(
    valoreGrezzo.configurazione,
    validazione.data.configurazione,
  );
  if (campoAssente !== null) {
    return fallimento({
      codice: "file_incompleto",
      campo: campoAssente,
      motivo: "Campo obbligatorio assente",
    });
  }

  const { firma, ...corpo } = validazione.data;
  const firmaAttesa = sha256(canonicalizzaJson(corpo));
  if (firma !== firmaAttesa) {
    return fallimento({
      codice: "firma_non_corrispondente",
      firmaRicevuta: firma,
      firmaAttesa,
    });
  }

  const destinazione = configurazioneAstaSchema.parse(
    configurazioneDestinazione,
  );
  const divergenza = primaDivergenza(
    validazione.data.configurazione,
    destinazione,
    "configurazione",
    CAMPI_CONFIGURAZIONE,
  );
  if (divergenza !== null) {
    return fallimento({
      codice: "configurazione_divergente",
      ...divergenza,
    });
  }

  const valore: DatiImportati = {
    esportatoIl: validazione.data.esportatoIl,
    configurazione: validazione.data.configurazione,
    rosa: validazione.data.rosa.map((voce) => ({ ...voce })),
    registro: validazione.data.registro.map((voce) => ({ ...voce })),
  };
  return { ok: true, valore };
}

export function firmaCorpoEsportazione(corpo: CorpoFileEsportazione): string {
  return sha256(canonicalizzaJson(corpo));
}
