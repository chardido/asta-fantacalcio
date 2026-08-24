import {
  configurazioneAstaSchema,
  voceRegistroSchema,
  type ConfigurazioneAsta,
  type VoceRegistro,
} from "@asta/contracts";
import type {
  RepositoryRegistro,
  RepositorySessioniAsta,
  SessioneAstaPersistita,
} from "@asta/db";
import { derivaStato, type StatoSessione } from "@asta/domain";
import { z } from "zod";

import { ErroreApplicativo } from "../trpc/errori";
import { ErroreHttpAccessoSessione } from "./carica-sessione-propria";

const LIMITE_SESSIONI_PER_UTENTE = 50;
const LUNGHEZZA_MASSIMA_NOME = 60;
const SOGLIA_RIPRISTINO_MS = 5_000;
const stagioneListoneSchema = z.string().trim().min(1).max(20);

class ErroreDatiRipristino extends Error {
  override readonly name = "ErroreDatiRipristino";
}

class ErroreTimeoutRipristino extends Error {
  override readonly name = "ErroreTimeoutRipristino";
}

export interface InputCreazioneSessioneAsta {
  readonly stagioneListone: unknown;
  readonly configurazione: unknown;
}

export interface SessioneAstaCreata {
  readonly id: string;
}

export interface VoceElencoSessioniAsta {
  readonly id: string;
  readonly nome: string;
  readonly creatoIl: Date;
  readonly aggiornatoIl: Date;
  readonly tipoAsta: ConfigurazioneAsta["tipoAsta"];
  readonly budgetResiduo: number;
  readonly numeroGiocatoriRosa: number;
}

export interface SessioneAstaDuplicata extends SessioneAstaCreata {
  readonly nome: string;
}

/** Aggregato completo e derivato restituito quando una sessione viene riaperta. */
export interface SessioneAstaRipristinata
  extends SessioneAstaPersistita,
    StatoSessione {
  readonly registro: readonly VoceRegistro[];
}

export interface DipendenzeServizioSessioniAsta {
  readonly utenteId: string;
  readonly sessioniAsta: Pick<
    RepositorySessioniAsta,
    "creaEntroLimite" | "elencaPerUtente" | "elimina"
  >;
  readonly registro: Pick<RepositoryRegistro, "elencaPerSessione">;
  /**
   * La callback deve essere costruita tramite `caricaSessionePropria`, unico
   * confine autorizzato per il caricamento di una sessione indirizzata per ID.
   */
  readonly caricaSessionePropria: (
    sessioneAstaId: string,
  ) => Promise<SessioneAstaPersistita>;
}

function erroreValidazione(
  codice: string,
  campo: string,
  vincolo: string,
  valoriImmessi: unknown,
): ErroreApplicativo {
  return new ErroreApplicativo(
    400,
    { codice, campo, vincolo, valoriImmessi },
    `Valore non valido per ${campo}: ${vincolo}`,
  );
}

function validaInputCreazione(input: InputCreazioneSessioneAsta): {
  readonly stagioneListone: string;
  readonly configurazione: ConfigurazioneAsta;
} {
  const stagione = stagioneListoneSchema.safeParse(input.stagioneListone);
  if (!stagione.success) {
    throw erroreValidazione(
      "stagione_listone_non_valida",
      "stagioneListone",
      stagione.error.issues[0]?.message ??
        "La stagione del listone deve contenere da 1 a 20 caratteri.",
      input,
    );
  }

  const configurazione = configurazioneAstaSchema.safeParse(
    input.configurazione,
  );
  if (!configurazione.success) {
    const issue = configurazione.error.issues[0];
    throw erroreValidazione(
      "configurazione_asta_non_valida",
      issue?.path.length ? `configurazione.${issue.path.join(".")}` : "configurazione",
      issue?.message ?? "La configurazione dell'asta non è valida.",
      input,
    );
  }

  return {
    stagioneListone: stagione.data,
    configurazione: configurazione.data,
  };
}

function creaNomiDuplicazione(nomeOriginale: string): readonly string[] {
  return Array.from({ length: LIMITE_SESSIONI_PER_UTENTE }, (_, indice) => {
    const suffisso = indice === 0 ? " - copia" : ` - copia ${indice + 1}`;
    const nomeBase = nomeOriginale
      .slice(0, LUNGHEZZA_MASSIMA_NOME - suffisso.length)
      .trimEnd();
    return `${nomeBase}${suffisso}`;
  });
}

function erroreEsitoCreazione(
  motivo: "limite_sessioni" | "nome_duplicato",
  valoriImmessi: unknown,
): ErroreApplicativo {
  if (motivo === "limite_sessioni") {
    return new ErroreApplicativo(
      409,
      {
        codice: "limite_sessioni_asta_raggiunto",
        campo: null,
        vincolo: `Ogni utente può possedere al massimo ${LIMITE_SESSIONI_PER_UTENTE} sessioni d'asta.`,
        valoriImmessi,
        dettagli: {
          limite: LIMITE_SESSIONI_PER_UTENTE,
          valoreCorrente: LIMITE_SESSIONI_PER_UTENTE,
        },
      },
      `È stato raggiunto il limite di ${LIMITE_SESSIONI_PER_UTENTE} sessioni d'asta.`,
    );
  }

  return new ErroreApplicativo(
    400,
    {
      codice: "nome_sessione_asta_duplicato",
      campo: "configurazione.nome",
      vincolo: "Il nome deve essere univoco tra le sessioni dello stesso utente.",
      valoriImmessi,
    },
    "Esiste già una sessione d'asta con questo nome.",
  );
}

const CAMPI_CONFIGURAZIONE_PERSISTITA = [
  "nome",
  "tipoAsta",
  "modalitaGioco",
  "numeroPartecipanti",
  "creditiIniziali",
  "modificatoreDifesa",
  "composizioneRosa",
  "quoteReparto",
  "pesiValutazione",
] as const satisfies readonly (keyof ConfigurazioneAsta)[];

function erroreRipristino(causa: unknown): ErroreApplicativo {
  const motivo =
    causa instanceof ErroreTimeoutRipristino
      ? "tempo_massimo_superato"
      : "dati_incompleti_o_non_disponibili";

  return new ErroreApplicativo(
    503,
    {
      codice: "ripristino_sessione_asta_non_completato",
      campo: null,
      vincolo:
        "Il ripristino deve completarsi entro 5 secondi con dati persistiti completi.",
      dettagli: {
        motivo,
        ritentabile: true,
        sogliaMillisecondi: SOGLIA_RIPRISTINO_MS,
      },
    },
    "Impossibile ripristinare la sessione d'asta. Riprova.",
  );
}

async function completaEntroSoglia<T>(
  operazione: () => Promise<T>,
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const superamentoSoglia = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      reject(new ErroreTimeoutRipristino());
    }, SOGLIA_RIPRISTINO_MS);
  });

  try {
    return await Promise.race([operazione(), superamentoSoglia]);
  } finally {
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }
  }
}

function ricostruisciSessione(
  sessione: SessioneAstaPersistita,
  registroSconosciuto: readonly VoceRegistro[],
): SessioneAstaRipristinata {
  const configurazioneCompleta = CAMPI_CONFIGURAZIONE_PERSISTITA.every(
    (campo) => Object.hasOwn(sessione.configurazione, campo),
  );
  const configurazione = configurazioneAstaSchema.safeParse(
    sessione.configurazione,
  );
  const registro = z.array(voceRegistroSchema).safeParse(registroSconosciuto);

  if (!configurazioneCompleta || !configurazione.success || !registro.success) {
    throw new ErroreDatiRipristino();
  }

  const repartiConfigurati = new Set(
    Object.keys(configurazione.data.composizioneRosa),
  );
  const registroCoerente = registro.data.every((voce, indice) => {
    const repartoNecessarioPerLoStato =
      voce.annullataIl === null && voce.assegnatarioTipo === "utente";
    return (
      voce.sessioneAstaId === sessione.id &&
      voce.ordinale === indice + 1 &&
      (!repartoNecessarioPerLoStato ||
        repartiConfigurati.has(voce.repartoAssegnato))
    );
  });
  if (!registroCoerente) {
    throw new ErroreDatiRipristino();
  }

  const stato = derivaStato(configurazione.data, registro.data);
  const rosaPerVoce = new Map(
    stato.rosa.map((voce) => [voce.voceRegistroId, voce]),
  );
  const statoCoerente =
    stato.budgetResiduo >= 0 &&
    [...stato.slotResidui.values()].every((slot) => slot >= 0) &&
    registro.data.every((voce) => {
      if (voce.annullataIl !== null || voce.assegnatarioTipo !== "utente") {
        return true;
      }
      return rosaPerVoce.get(voce.id)?.macroReparto === voce.macroReparto;
    });
  if (!statoCoerente) {
    throw new ErroreDatiRipristino();
  }

  return {
    ...sessione,
    configurazione: configurazione.data,
    ...stato,
    registro: registro.data,
  };
}

/**
 * Servizio applicativo per il ciclo di vita delle sessioni d'asta.
 * Rosa, budget e conteggi sono sempre derivati dal registro persistito.
 */
export class ServizioSessioniAsta {
  constructor(private readonly dipendenze: DipendenzeServizioSessioniAsta) {}

  async crea(
    input: InputCreazioneSessioneAsta,
  ): Promise<SessioneAstaCreata> {
    const validato = validaInputCreazione(input);
    const esito = await this.dipendenze.sessioniAsta.creaEntroLimite(
      {
        utenteId: this.dipendenze.utenteId,
        stagioneListone: validato.stagioneListone,
        configurazione: validato.configurazione,
      },
      LIMITE_SESSIONI_PER_UTENTE,
      [validato.configurazione.nome],
    );

    if (!esito.ok) {
      throw erroreEsitoCreazione(esito.motivo, input);
    }
    return { id: esito.sessione.id };
  }

  async elenca(): Promise<readonly VoceElencoSessioniAsta[]> {
    const sessioni = await this.dipendenze.sessioniAsta.elencaPerUtente(
      this.dipendenze.utenteId,
    );
    const voci = await Promise.all(
      sessioni.map(async (sessione) => {
        const registro = await this.dipendenze.registro.elencaPerSessione(
          sessione.id,
        );
        const stato = derivaStato(sessione.configurazione, registro);
        return {
          id: sessione.id,
          nome: sessione.configurazione.nome,
          creatoIl: sessione.creatoIl,
          aggiornatoIl: sessione.aggiornatoIl,
          tipoAsta: sessione.configurazione.tipoAsta,
          budgetResiduo: stato.budgetResiduo,
          numeroGiocatoriRosa: stato.rosa.length,
        } satisfies VoceElencoSessioniAsta;
      }),
    );

    return voci.sort(
      (sinistra, destra) =>
        destra.aggiornatoIl.getTime() - sinistra.aggiornatoIl.getTime(),
    );
  }

  async ripristina(
    sessioneAstaId: string,
  ): Promise<SessioneAstaRipristinata> {
    try {
      return await completaEntroSoglia(async () => {
        const sessione = await this.dipendenze.caricaSessionePropria(
          sessioneAstaId,
        );
        const registro = await this.dipendenze.registro.elencaPerSessione(
          sessione.id,
        );
        return ricostruisciSessione(sessione, registro);
      });
    } catch (error_) {
      if (
        error_ instanceof ErroreHttpAccessoSessione ||
        error_ instanceof ErroreApplicativo
      ) {
        throw error_;
      }
      throw erroreRipristino(error_);
    }
  }

  async duplica(sessioneAstaId: string): Promise<SessioneAstaDuplicata> {
    const originale = await this.dipendenze.caricaSessionePropria(
      sessioneAstaId,
    );
    const nomiCandidati = creaNomiDuplicazione(
      originale.configurazione.nome,
    );
    const esito = await this.dipendenze.sessioniAsta.creaEntroLimite(
      {
        utenteId: this.dipendenze.utenteId,
        stagioneListone: originale.stagioneListone,
        configurazione: originale.configurazione,
        stato: "in_corso",
        avvisiInformativiAttivi: originale.avvisiInformativiAttivi,
      },
      LIMITE_SESSIONI_PER_UTENTE,
      nomiCandidati,
    );

    if (!esito.ok) {
      throw erroreEsitoCreazione(esito.motivo, { sessioneAstaId });
    }
    return {
      id: esito.sessione.id,
      nome: esito.sessione.configurazione.nome,
    };
  }

  async elimina(sessioneAstaId: string): Promise<void> {
    const sessione = await this.dipendenze.caricaSessionePropria(
      sessioneAstaId,
    );
    await this.dipendenze.sessioniAsta.elimina(sessione.id);
  }
}
