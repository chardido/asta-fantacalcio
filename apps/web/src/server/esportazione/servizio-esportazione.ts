import { randomUUID } from "node:crypto";

import type {
  FileEsportazione,
  VoceRegistro,
  VoceRegistroEsportata,
  VoceRosaEsportata,
} from "@asta/contracts";
import type {
  AvversarioPersistito,
  GestoreTransazioniRegistro,
  RepositoryAvversari,
  RepositoryRegistro,
  SessioneAstaPersistita,
  VoceRegistroDaImportare,
} from "@asta/db";
import {
  derivaStato,
  esporta as esportaDominio,
  importa as importaDominio,
  type ErroreImportazione,
  type StatoSessione,
} from "@asta/domain";

import { ErroreHttpAccessoSessione } from "../sessioni/carica-sessione-propria";
import { ErroreApplicativo } from "../trpc/errori";

const SOGLIA_ESPORTAZIONE_MS = 5_000;
const TIMEOUT_IMPORTAZIONE_MS = 5_000;

class ErroreTimeoutEsportazione extends Error {
  override readonly name = "ErroreTimeoutEsportazione";
}

export interface DipendenzeServizioEsportazione {
  readonly registro: Pick<RepositoryRegistro, "elencaPerSessione">;
  readonly avversari: Pick<RepositoryAvversari, "elencaPerSessione">;
  readonly transazioniRegistro: GestoreTransazioniRegistro;
  /** Deve essere costruita tramite la guardia centralizzata di proprietà. */
  readonly caricaSessionePropria: (
    sessioneAstaId: string,
  ) => Promise<SessioneAstaPersistita>;
  readonly ora?: () => Date;
  readonly generaId?: () => string;
}

export interface EsitoImportazione extends StatoSessione {
  readonly numeroVociImportate: number;
}

async function completaEntro<T>(
  operazione: () => Promise<T>,
  sogliaMs: number,
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const superamento = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => reject(new ErroreTimeoutEsportazione()), sogliaMs);
  });
  try {
    return await Promise.race([operazione(), superamento]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

function erroreEsportazione(): ErroreApplicativo {
  return new ErroreApplicativo(
    503,
    {
      codice: "esportazione_non_completata",
      campo: null,
      vincolo: `L'esportazione deve completarsi entro ${SOGLIA_ESPORTAZIONE_MS} millisecondi.`,
      dettagli: { sogliaMillisecondi: SOGLIA_ESPORTAZIONE_MS, ritentabile: true },
    },
    "L'esportazione non è stata completata. Riprova.",
  );
}

function erroreImportazione(errore: ErroreImportazione): ErroreApplicativo {
  let campo = "file";
  let vincolo = "Il file deve essere leggibile, completo, integro e compatibile con la sessione di destinazione.";
  if (errore.codice === "file_incompleto") {
    campo = errore.campo;
    vincolo = errore.motivo;
  } else if (errore.codice === "schema_ignoto") {
    campo = "schema";
    vincolo = `Lo schema supportato è ${errore.schemaSupportato}.`;
  } else if (errore.codice === "firma_non_corrispondente") {
    campo = "firma";
    vincolo = "La firma deve corrispondere al contenuto del file.";
  } else if (errore.codice === "configurazione_divergente") {
    campo = errore.campo;
    vincolo = "La configurazione deve coincidere con quella della sessione di destinazione.";
  }

  return new ErroreApplicativo(
    400,
    {
      codice: errore.codice,
      campo,
      vincolo,
      dettagli: errore,
    },
    `Importazione rifiutata: ${errore.codice}.`,
  );
}

function erroreFileIncoerente(campo: string, motivo: string): ErroreApplicativo {
  return new ErroreApplicativo(
    400,
    {
      codice: "file_incompleto",
      campo,
      vincolo: motivo,
    },
    `Importazione rifiutata: contenuto incoerente nel campo ${campo}.`,
  );
}

function errorePersistenzaImportazione(): ErroreApplicativo {
  return new ErroreApplicativo(
    503,
    {
      codice: "importazione_non_completata",
      campo: null,
      vincolo: "L'importazione deve essere confermata integralmente in una singola transazione.",
      dettagli: { ritentabile: true },
    },
    "L'importazione non è stata completata. La sessione è rimasta invariata.",
  );
}

function proiettaRegistro(
  registro: readonly VoceRegistro[],
  avversari: readonly AvversarioPersistito[],
): readonly VoceRegistroEsportata[] {
  const nomePerId = new Map(avversari.map((avversario) => [avversario.id, avversario.nome]));
  return registro.map((voce): VoceRegistroEsportata => {
    const base = {
      ordinale: voce.ordinale,
      identificativoGiocatore: voce.identificativoGiocatore,
      nomeGiocatore: voce.nomeGiocatore,
      ruolo: voce.ruolo,
      squadra: voce.squadra,
      repartoAssegnato: voce.repartoAssegnato,
      macroReparto: voce.macroReparto,
      annullataIl: voce.annullataIl,
      giocatoreAssenteDatiCorrenti: voce.giocatoreAssenteDatiCorrenti,
    };
    if (voce.assegnatarioTipo === "utente") {
      return {
        ...base,
        assegnatarioTipo: "utente",
        avversarioNome: null,
        prezzoAcquisto: voce.prezzoAcquisto as number,
      };
    }
    return {
      ...base,
      assegnatarioTipo: "avversario",
      avversarioNome:
        voce.avversarioId === null ? null : (nomePerId.get(voce.avversarioId) ?? null),
      prezzoAcquisto: voce.prezzoAcquisto,
    };
  });
}

function chiaveRosa(voce: VoceRosaEsportata): string {
  return [
    voce.identificativoGiocatore,
    voce.nome,
    voce.reparto,
    String(voce.prezzoAcquisto),
  ].join("\u0000");
}

function validaCoerenzaRosa(
  configurazione: SessioneAstaPersistita["configurazione"],
  rosaFile: readonly VoceRosaEsportata[],
  registro: readonly VoceRegistro[],
): StatoSessione {
  const stato = derivaStato(configurazione, registro);
  const rosaDerivata: VoceRosaEsportata[] = stato.rosa.map((voce) => ({
    identificativoGiocatore: voce.identificativoGiocatore,
    nome: voce.nomeGiocatore,
    reparto: voce.repartoAssegnato,
    prezzoAcquisto: voce.prezzoAcquisto,
  }));
  const confronta = (sinistra: string, destra: string) =>
    sinistra.localeCompare(destra, "it");
  const attesa = [...rosaFile].map(chiaveRosa).sort(confronta);
  const effettiva = rosaDerivata.map(chiaveRosa).sort(confronta);
  if (
    attesa.length !== effettiva.length ||
    attesa.some((chiave, indice) => chiave !== effettiva[indice])
  ) {
    throw erroreFileIncoerente(
      "rosa",
      "La rosa deve corrispondere alle voci attive dell'utente presenti nel registro.",
    );
  }
  if (
    stato.budgetResiduo < 0 ||
    [...stato.slotResidui.values()].some((slot) => slot < 0)
  ) {
    throw erroreFileIncoerente(
      "registro",
      "Il registro deve rispettare budget e composizione della rosa configurati.",
    );
  }
  return stato;
}

/** Servizio applicativo per i due endpoint portabili di una sessione d'asta. */
export class ServizioEsportazione {
  private readonly ora: () => Date;
  private readonly generaId: () => string;

  constructor(private readonly dipendenze: DipendenzeServizioEsportazione) {
    this.ora = dipendenze.ora ?? (() => new Date());
    this.generaId = dipendenze.generaId ?? randomUUID;
  }

  async esporta(sessioneAstaId: string): Promise<FileEsportazione> {
    try {
      return await completaEntro(async () => {
        const sessione = await this.dipendenze.caricaSessionePropria(sessioneAstaId);
        const [registro, avversari] = await Promise.all([
          this.dipendenze.registro.elencaPerSessione(sessione.id),
          this.dipendenze.avversari.elencaPerSessione(sessione.id),
        ]);
        const stato = derivaStato(sessione.configurazione, registro);
        return esportaDominio({
          esportatoIl: this.ora().toISOString(),
          configurazione: sessione.configurazione,
          rosa: stato.rosa,
          registro: proiettaRegistro(registro, avversari),
        });
      }, SOGLIA_ESPORTAZIONE_MS);
    } catch (error_) {
      if (
        error_ instanceof ErroreHttpAccessoSessione ||
        error_ instanceof ErroreApplicativo
      ) {
        throw error_;
      }
      throw erroreEsportazione();
    }
  }

  async importa(sessioneAstaId: string, contenuto: unknown): Promise<EsitoImportazione> {
    const sessione = await this.dipendenze.caricaSessionePropria(sessioneAstaId);
    const lettura = importaDominio(contenuto, sessione.configurazione);
    if (!lettura.ok) throw erroreImportazione(lettura.errore);

    const voci: VoceRegistroDaImportare[] = lettura.valore.registro.map(
      (voce): VoceRegistroDaImportare => {
        const base = {
          id: this.generaId(),
          sessioneAstaId: sessione.id,
          ordinale: voce.ordinale,
          identificativoGiocatore: voce.identificativoGiocatore,
          nomeGiocatore: voce.nomeGiocatore,
          ruolo: voce.ruolo,
          squadra: voce.squadra,
          repartoAssegnato: voce.repartoAssegnato,
          macroReparto: voce.macroReparto,
          annullataIl: voce.annullataIl,
          chiaveIdempotenza: this.generaId(),
          giocatoreAssenteDatiCorrenti: voce.giocatoreAssenteDatiCorrenti,
        };
        if (voce.assegnatarioTipo === "utente") {
          return {
            ...base,
            assegnatarioTipo: "utente",
            avversarioNome: null,
            prezzoAcquisto: voce.prezzoAcquisto,
          };
        }
        return {
          ...base,
          assegnatarioTipo: "avversario",
          avversarioNome: voce.avversarioNome,
          prezzoAcquisto: voce.prezzoAcquisto,
        };
      },
    );
    const stato = validaCoerenzaRosa(
      sessione.configurazione,
      lettura.valore.rosa,
      voci.map(({ avversarioNome: _nome, ...voce }) => ({ ...voce, avversarioId: null })),
    );

    try {
      const salvate = await this.dipendenze.transazioniRegistro.esegui(
        sessione.id,
        async (registro) => {
          const risultato = await registro.sostituisciDaImportazione(voci);
          const ultimoOrdinale = risultato.at(-1)?.ordinale ?? 0;
          await registro.notificaMutazione(ultimoOrdinale);
          return risultato;
        },
        TIMEOUT_IMPORTAZIONE_MS,
      );
      return {
        ...stato,
        numeroVociImportate: salvate.length,
      };
    } catch (error_) {
      if (error_ instanceof ErroreApplicativo) throw error_;
      throw errorePersistenzaImportazione();
    }
  }
}
