import { readFile } from "node:fs/promises";

import {
  rispostaListoneGrezzaSchema,
  type RispostaListoneGrezza,
} from "@asta/contracts";

import type {
  AdattatoreSorgenteListone,
  LimitiFrequenza,
  SegnaleAnnullamento,
} from "./sorgenti.js";

const UN_GIORNO_MS = 24 * 60 * 60 * 1_000;

export const NOME_ADATTATORE_LISTONE_FILE_LOCALE = "listone-file-locale";

export const LIMITI_LISTONE_FILE_LOCALE: LimitiFrequenza = Object.freeze({
  richiesteMassime: 1,
  finestraMs: UN_GIORNO_MS,
});

export interface ConfigurazioneAdattatoreListoneFileLocale {
  readonly percorsoFile: string;
  readonly nome?: string;
  readonly limiti?: LimitiFrequenza;
}

export type CodiceErroreListoneFileLocale =
  | "file_non_accessibile"
  | "json_non_valido"
  | "formato_non_valido"
  | "stagione_non_corrispondente";

/** Errore operativo classificabile dal worker senza dipendere da dettagli Node/Zod. */
export class ErroreListoneFileLocale extends Error {
  override readonly name = "ErroreListoneFileLocale";

  constructor(
    readonly codice: CodiceErroreListoneFileLocale,
    messaggio: string,
    opzioni?: ErrorOptions,
  ) {
    super(messaggio, opzioni);
  }
}

function validaLimiti(limiti: LimitiFrequenza): LimitiFrequenza {
  if (
    !Number.isInteger(limiti.richiesteMassime) ||
    limiti.richiesteMassime < 1 ||
    !Number.isInteger(limiti.finestraMs) ||
    limiti.finestraMs < 1
  ) {
    throw new TypeError(
      "I limiti di frequenza richiedono interi positivi per richiesteMassime e finestraMs",
    );
  }

  return Object.freeze({ ...limiti });
}

function descriviErroreFormato(
  errore: { readonly issues: readonly { readonly path: PropertyKey[]; readonly message: string }[] },
): string {
  return errore.issues
    .map((issue) => {
      const percorso = issue.path.length > 0 ? issue.path.join(".") : "radice";
      return `${percorso}: ${issue.message}`;
    })
    .join("; ");
}

/**
 * Decodifica il formato operativo locale.
 *
 * Sono accettati sia il DTO canonico completo sia il solo array `giocatori`;
 * nel secondo caso nome sorgente e stagione vengono forniti dalla configurazione
 * del worker. Non vengono accettati campi specifici di provider.
 */
function decodificaFile(
  contenuto: string,
  nomeSorgente: string,
  stagioneRichiesta: string,
): RispostaListoneGrezza {
  let valore: unknown;
  try {
    valore = JSON.parse(contenuto.replace(/^\uFEFF/, ""));
  } catch (error_) {
    throw new ErroreListoneFileLocale(
      "json_non_valido",
      "Il file locale del listone non contiene JSON valido",
      { cause: error_ },
    );
  }

  const candidato = Array.isArray(valore)
    ? {
        nomeSorgente,
        stagione: stagioneRichiesta,
        giocatori: valore,
      }
    : valore;
  const risultato = rispostaListoneGrezzaSchema.safeParse(candidato);

  if (!risultato.success) {
    throw new ErroreListoneFileLocale(
      "formato_non_valido",
      `Il file locale non rispetta RispostaListoneGrezza: ${descriviErroreFormato(risultato.error)}`,
      { cause: risultato.error },
    );
  }

  if (risultato.data.stagione !== stagioneRichiesta) {
    throw new ErroreListoneFileLocale(
      "stagione_non_corrispondente",
      `Il file contiene la stagione "${risultato.data.stagione}", ma e stata richiesta "${stagioneRichiesta}"`,
    );
  }

  return {
    ...risultato.data,
    nomeSorgente,
  };
}

/**
 * Ripiego operativo letto esclusivamente dal filesystem del worker.
 * Non espone alcuna operazione di caricamento all'interfaccia utente.
 */
export class AdattatoreListoneFileLocale
  implements AdattatoreSorgenteListone
{
  readonly nome: string;
  readonly limiti: LimitiFrequenza;
  readonly percorsoFile: string;

  constructor(
    configurazione: string | ConfigurazioneAdattatoreListoneFileLocale,
  ) {
    const opzioni =
      typeof configurazione === "string"
        ? { percorsoFile: configurazione }
        : configurazione;

    if (opzioni.percorsoFile.trim().length === 0) {
      throw new TypeError("Il percorso del file locale non puo essere vuoto");
    }

    const nome = opzioni.nome ?? NOME_ADATTATORE_LISTONE_FILE_LOCALE;
    if (nome.trim().length === 0) {
      throw new TypeError("Il nome dell'adattatore non puo essere vuoto");
    }

    this.percorsoFile = opzioni.percorsoFile;
    this.nome = nome;
    this.limiti = validaLimiti(
      opzioni.limiti ?? LIMITI_LISTONE_FILE_LOCALE,
    );
  }

  async recupera(
    stagione: string,
    segnale: SegnaleAnnullamento,
  ): Promise<RispostaListoneGrezza> {
    if (stagione.trim().length === 0) {
      throw new TypeError("La stagione richiesta non puo essere vuota");
    }

    segnale.throwIfAborted();

    let contenuto: string;
    try {
      contenuto = await readFile(this.percorsoFile, {
        encoding: "utf8",
        signal: segnale,
      });
    } catch (error_) {
      if (segnale.aborted) {
        throw error_;
      }

      throw new ErroreListoneFileLocale(
        "file_non_accessibile",
        `Impossibile leggere il file locale del listone: ${this.percorsoFile}`,
        { cause: error_ },
      );
    }

    segnale.throwIfAborted();
    return decodificaFile(contenuto, this.nome, stagione);
  }
}
