import { randomUUID } from "node:crypto";

import {
  MACRO_REPARTO_PER_RUOLO_MANTRA,
  type MacroReparto,
  type Reparto,
  type VoceRegistro,
} from "@asta/contracts";
import {
  ErroreUnicitaRegistro,
  type GestoreTransazioniRegistro,
  type GiocatoreSnapshotPersistito,
  type RepositoryAvversari,
  type RepositoryRegistro,
  type RegistroTransazionale,
  type RepositorySnapshot,
  type SessioneAstaPersistita,
} from "@asta/db";
import {
  annulla as annullaVoce,
  creditiResiduiStimati,
  derivaStato,
  modificaPrezzo as modificaPrezzoVoce,
  registra,
  type ErroreRegistro,
  type StatoSessione,
} from "@asta/domain";
import { z } from "zod";

import { ErroreApplicativo } from "../trpc/errori";

const TIMEOUT_PERSISTENZA_MS = 5_000;
const identificativoGiocatoreSchema = z.string().trim().min(1);
const chiaveIdempotenzaSchema = z.uuid();

export interface InputAggiuntaRegistro {
  readonly identificativoGiocatore: string;
  readonly prezzoAcquisto: number;
  readonly repartoAssegnato?: Reparto;
  readonly chiaveIdempotenza: string;
}

export interface InputAnnotazioneAvversario {
  readonly identificativoGiocatore: string;
  readonly avversarioId?: string | null;
  readonly prezzoAcquisto?: number | null;
  readonly repartoAssegnato?: Reparto;
  readonly chiaveIdempotenza: string;
}

export interface InputRisoluzioneConflitto extends InputAggiuntaRegistro {
  readonly voceServerId: string;
  readonly risoluzione: "locale" | "server";
}

export interface EsitoMutazioneRegistro extends StatoSessione {
  readonly voce: VoceRegistro;
}

export interface DipendenzeServizioRegistro {
  readonly transazioniRegistro: GestoreTransazioniRegistro;
  readonly registro: Pick<RepositoryRegistro, "trovaAttivaPerGiocatore">;
  readonly avversari: Pick<RepositoryAvversari, "trovaPerId">;
  readonly snapshot: Pick<RepositorySnapshot, "trovaPubblicato">;
  /** Deve essere costruita tramite la guardia centralizzata di proprietà. */
  readonly caricaSessionePropria: (
    sessioneAstaId: string,
  ) => Promise<SessioneAstaPersistita>;
  readonly generaId?: () => string;
  readonly ora?: () => Date;
}

interface ContestoGiocatore {
  readonly ruolo: Reparto;
  readonly ruoliAmmessi: readonly Reparto[];
}

function erroreInput(
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

interface AnnotazioneValidata {
  readonly identificativoGiocatore: string;
  readonly chiaveIdempotenza: string;
  readonly prezzoAcquisto: number | null;
}

function validaAnnotazione(
  input: InputAnnotazioneAvversario,
): AnnotazioneValidata {
  const identificativoGiocatore = identificativoGiocatoreSchema.safeParse(
    input.identificativoGiocatore,
  );
  if (!identificativoGiocatore.success) {
    throw erroreInput(
      "identificativo_giocatore_non_valido",
      "identificativoGiocatore",
      "È richiesto un identificativo non vuoto.",
      input.identificativoGiocatore,
    );
  }
  const chiaveIdempotenza = chiaveIdempotenzaSchema.safeParse(
    input.chiaveIdempotenza,
  );
  if (!chiaveIdempotenza.success) {
    throw erroreInput(
      "chiave_idempotenza_non_valida",
      "chiaveIdempotenza",
      "È richiesto un UUID valido.",
      input.chiaveIdempotenza,
    );
  }

  const prezzoAcquisto = input.prezzoAcquisto ?? null;
  if (
    prezzoAcquisto !== null &&
    (!Number.isInteger(prezzoAcquisto) || prezzoAcquisto < 1)
  ) {
    throw erroreInput(
      "prezzo_avversario_non_valido",
      "prezzoAcquisto",
      "Il prezzo, quando annotato, deve essere un intero maggiore o uguale a 1.",
      input.prezzoAcquisto,
    );
  }
  return {
    identificativoGiocatore: identificativoGiocatore.data,
    chiaveIdempotenza: chiaveIdempotenza.data,
    prezzoAcquisto,
  };
}

function validaPrezzoAvversario(
  creditiIniziali: number,
  registro: readonly VoceRegistro[],
  avversarioId: string | null,
  prezzoAcquisto: number | null,
): void {
  if (avversarioId === null || prezzoAcquisto === null) return;
  const residui = creditiResiduiStimati(
    creditiIniziali,
    registro,
    avversarioId,
  );
  if (prezzoAcquisto > residui) {
    throw erroreInput(
      "prezzo_avversario_fuori_intervallo",
      "prezzoAcquisto",
      `Il prezzo deve essere compreso tra 1 e ${residui}.`,
      prezzoAcquisto,
    );
  }
}

function errorePersistenza(): ErroreApplicativo {
  return new ErroreApplicativo(
    503,
    {
      codice: "salvataggio_registro_non_completato",
      vincolo: `La mutazione deve essere confermata entro ${TIMEOUT_PERSISTENZA_MS} millisecondi.`,
    },
    "Il salvataggio del registro non è stato completato. Riprova.",
  );
}

function erroreConflitto(voceEsistente: VoceRegistro): ErroreApplicativo {
  return new ErroreApplicativo(
    409,
    {
      codice: "giocatore_gia_assegnato",
      campo: "identificativoGiocatore",
      vincolo: "Il giocatore può comparire in una sola voce attiva del registro.",
      valoriImmessi: voceEsistente.identificativoGiocatore,
      dettagli: {
        voceEsistente,
        assegnatario: {
          tipo: voceEsistente.assegnatarioTipo,
          avversarioId: voceEsistente.avversarioId,
        },
      },
    },
    "Il giocatore è già assegnato.",
  );
}

function erroreDominio(
  errore: ErroreRegistro,
  registro: readonly VoceRegistro[],
): ErroreApplicativo {
  if (errore.codice === "giocatore_gia_assegnato") {
    const voceEsistente = registro.find(
      (voce) =>
        voce.annullataIl === null &&
        voce.identificativoGiocatore === errore.identificativoGiocatore,
    );
    if (voceEsistente !== undefined) {
      return erroreConflitto(voceEsistente);
    }
  }

  if (errore.codice === "voce_non_trovata") {
    return new ErroreApplicativo(
      404,
      {
        codice: errore.codice,
        campo: "voceRegistroId",
        vincolo: errore.vincolo,
        valoriImmessi: errore.voceRegistroId,
      },
      "La voce del registro non è disponibile.",
    );
  }

  const status = errore.codice === "voce_gia_annullata" ? 409 : 400;
  let campo = "prezzoAcquisto";
  if (
    errore.codice === "reparto_completo" ||
    errore.codice === "reparto_non_ammesso"
  ) {
    campo = "repartoAssegnato";
  } else if (
    errore.codice === "voce_gia_annullata" ||
    errore.codice === "prezzo_non_modificabile"
  ) {
    campo = "voceRegistroId";
  }

  let valoriImmessi: unknown;
  if ("valoreRifiutato" in errore) {
    valoriImmessi = errore.valoreRifiutato;
  } else if ("reparto" in errore) {
    valoriImmessi = errore.reparto;
  } else if ("voceRegistroId" in errore) {
    valoriImmessi = errore.voceRegistroId;
  }

  return new ErroreApplicativo(
    status,
    {
      codice: errore.codice,
      campo,
      vincolo: errore.vincolo,
      valoriImmessi,
      dettagli: errore,
    },
    `Mutazione del registro rifiutata: ${errore.codice}.`,
  );
}

function contestoGiocatore(
  sessione: SessioneAstaPersistita,
  giocatore: GiocatoreSnapshotPersistito,
): ContestoGiocatore {
  let ruoliAmmessi: readonly Reparto[];
  if (sessione.configurazione.modalitaGioco === "classic") {
    ruoliAmmessi =
      giocatore.ruoloClassic === null ? [] : [giocatore.ruoloClassic];
  } else {
    ruoliAmmessi = giocatore.ruoliMantra;
  }
  const ruolo = ruoliAmmessi[0];

  if (ruolo === undefined) {
    throw new ErroreApplicativo(
      503,
      {
        codice: "dati_giocatore_non_coerenti",
        campo: "ruolo",
        vincolo: `Il giocatore deve avere almeno un ruolo ${sessione.configurazione.modalitaGioco}.`,
        valoriImmessi: giocatore.identificativoGiocatore,
      },
      "I dati del giocatore non sono coerenti con la modalità della sessione.",
    );
  }
  return { ruolo, ruoliAmmessi };
}

function macroRepartoPer(reparto: Reparto): MacroReparto {
  if (reparto === "P") return "POR";
  if (reparto === "D") return "DIF";
  if (reparto === "C") return "CEN";
  if (reparto === "A") return "ATT";
  return MACRO_REPARTO_PER_RUOLO_MANTRA[reparto];
}

function erroreAvversarioNonDisponibile(id: string): ErroreApplicativo {
  return new ErroreApplicativo(
    404,
    {
      codice: "avversario_non_disponibile",
      campo: "avversarioId",
      valoriImmessi: id,
    },
    "L'avversario non è disponibile nella sessione.",
  );
}

function esito(
  configurazione: SessioneAstaPersistita["configurazione"],
  registro: readonly VoceRegistro[],
  voce: VoceRegistro,
): EsitoMutazioneRegistro {
  return { voce, ...derivaStato(configurazione, registro) };
}

/** Servizio applicativo transazionale per le voci dell'utente nel registro. */
export class ServizioRegistro {
  private readonly generaId: () => string;
  private readonly ora: () => Date;

  constructor(private readonly dipendenze: DipendenzeServizioRegistro) {
    this.generaId = dipendenze.generaId ?? randomUUID;
    this.ora = dipendenze.ora ?? (() => new Date());
  }

  async aggiungi(
    sessioneAstaId: string,
    input: InputAggiuntaRegistro,
  ): Promise<EsitoMutazioneRegistro> {
    const identificativoGiocatore = identificativoGiocatoreSchema.safeParse(
      input.identificativoGiocatore,
    );
    if (!identificativoGiocatore.success) {
      throw erroreInput(
        "identificativo_giocatore_non_valido",
        "identificativoGiocatore",
        "È richiesto un identificativo non vuoto.",
        input.identificativoGiocatore,
      );
    }
    const chiaveIdempotenza = chiaveIdempotenzaSchema.safeParse(
      input.chiaveIdempotenza,
    );
    if (!chiaveIdempotenza.success) {
      throw erroreInput(
        "chiave_idempotenza_non_valida",
        "chiaveIdempotenza",
        "È richiesto un UUID valido.",
        input.chiaveIdempotenza,
      );
    }

    const sessione = await this.dipendenze.caricaSessionePropria(
      sessioneAstaId,
    );
    const snapshot = await this.dipendenze.snapshot.trovaPubblicato(
      sessione.stagioneListone,
    );
    if (snapshot === null) {
      throw new ErroreApplicativo(
        503,
        { codice: "snapshot_non_disponibile" },
        "Non è disponibile uno snapshot consultabile per la sessione.",
      );
    }
    const giocatore = snapshot.giocatori.find(
      (voce) =>
        voce.identificativoGiocatore === identificativoGiocatore.data,
    );
    if (giocatore === undefined) {
      throw new ErroreApplicativo(
        404,
        {
          codice: "giocatore_non_disponibile",
          campo: "identificativoGiocatore",
          valoriImmessi: identificativoGiocatore.data,
        },
        "Il giocatore non è disponibile nello snapshot corrente.",
      );
    }
    const ruoli = contestoGiocatore(sessione, giocatore);

    try {
      return await this.dipendenze.transazioniRegistro.esegui(
        sessione.id,
        async (registroRepository) => {
          const registro = await registroRepository.elencaPerSessione(
            sessione.id,
          );
          const ordinale =
            registro.reduce(
              (massimo, voce) => Math.max(massimo, voce.ordinale),
              0,
            ) + 1;
          const trasformazione = registra(sessione.configurazione, registro, {
            id: this.generaId(),
            sessioneAstaId: sessione.id,
            ordinale,
            identificativoGiocatore: giocatore.identificativoGiocatore,
            nomeGiocatore: giocatore.nome,
            ruolo: ruoli.ruolo,
            ruoliAmmessi: ruoli.ruoliAmmessi,
            squadra: giocatore.squadra,
            repartoAssegnato: input.repartoAssegnato,
            prezzoAcquisto: input.prezzoAcquisto,
            chiaveIdempotenza: chiaveIdempotenza.data,
          });
          if (!trasformazione.ok) {
            throw erroreDominio(trasformazione.errore, registro);
          }
          const voce = await registroRepository.crea(trasformazione.voce);
          await registroRepository.notificaMutazione(voce.ordinale);
          return esito(sessione.configurazione, trasformazione.registro, voce);
        },
        TIMEOUT_PERSISTENZA_MS,
      );
    } catch (error_) {
      if (error_ instanceof ErroreApplicativo) {
        throw error_;
      }
      if (error_ instanceof ErroreUnicitaRegistro) {
        const voceEsistente =
          await this.dipendenze.registro.trovaAttivaPerGiocatore(
            sessione.id,
            giocatore.identificativoGiocatore,
          );
        if (voceEsistente !== null) {
          throw erroreConflitto(voceEsistente);
        }
      }
      throw errorePersistenza();
    }
  }

  async annotaAcquistoAltrui(
    sessioneAstaId: string,
    input: InputAnnotazioneAvversario,
  ): Promise<EsitoMutazioneRegistro> {
    const validata = validaAnnotazione(input);
    const sessione = await this.dipendenze.caricaSessionePropria(
      sessioneAstaId,
    );
    const avversarioId = input.avversarioId ?? null;
    if (avversarioId !== null) {
      const avversario = await this.dipendenze.avversari.trovaPerId(
        avversarioId,
      );
      if (avversario?.sessioneAstaId !== sessione.id) {
        throw erroreAvversarioNonDisponibile(avversarioId);
      }
    }

    const snapshot = await this.dipendenze.snapshot.trovaPubblicato(
      sessione.stagioneListone,
    );
    if (snapshot === null) {
      throw new ErroreApplicativo(
        503,
        { codice: "snapshot_non_disponibile" },
        "Non è disponibile uno snapshot consultabile per la sessione.",
      );
    }
    const giocatore = snapshot.giocatori.find(
      (voce) =>
        voce.identificativoGiocatore === validata.identificativoGiocatore,
    );
    if (giocatore === undefined) {
      throw new ErroreApplicativo(
        404,
        {
          codice: "giocatore_non_disponibile",
          campo: "identificativoGiocatore",
          valoriImmessi: validata.identificativoGiocatore,
        },
        "Il giocatore non è disponibile nello snapshot corrente.",
      );
    }
    const ruoli = contestoGiocatore(sessione, giocatore);
    const repartoAssegnato = input.repartoAssegnato ?? ruoli.ruolo;
    if (!ruoli.ruoliAmmessi.includes(repartoAssegnato)) {
      throw erroreInput(
        "reparto_non_ammesso",
        "repartoAssegnato",
        `Il reparto deve appartenere ai ruoli ammessi: ${ruoli.ruoliAmmessi.join(", ")}.`,
        input.repartoAssegnato,
      );
    }

    try {
      return await this.dipendenze.transazioniRegistro.esegui(
        sessione.id,
        async (registroRepository) => {
          const registro = await registroRepository.elencaPerSessione(
            sessione.id,
          );
          const voceEsistente = registro.find(
            (voce) =>
              voce.annullataIl === null &&
              voce.identificativoGiocatore ===
                giocatore.identificativoGiocatore,
          );
          if (voceEsistente !== undefined) {
            throw erroreConflitto(voceEsistente);
          }

          validaPrezzoAvversario(
            sessione.configurazione.creditiIniziali,
            registro,
            avversarioId,
            validata.prezzoAcquisto,
          );

          const ordinale =
            registro.reduce(
              (massimo, voce) => Math.max(massimo, voce.ordinale),
              0,
            ) + 1;
          const voce: VoceRegistro = {
            id: this.generaId(),
            sessioneAstaId: sessione.id,
            ordinale,
            identificativoGiocatore: giocatore.identificativoGiocatore,
            nomeGiocatore: giocatore.nome,
            ruolo: ruoli.ruolo,
            squadra: giocatore.squadra,
            repartoAssegnato,
            macroReparto: macroRepartoPer(repartoAssegnato),
            assegnatarioTipo: "avversario",
            avversarioId,
            prezzoAcquisto: validata.prezzoAcquisto,
            annullataIl: null,
            chiaveIdempotenza: validata.chiaveIdempotenza,
            giocatoreAssenteDatiCorrenti: false,
          };
          const salvata = await registroRepository.crea(voce);
          await registroRepository.notificaMutazione(salvata.ordinale);
          return esito(
            sessione.configurazione,
            [...registro, voce],
            salvata,
          );
        },
        TIMEOUT_PERSISTENZA_MS,
      );
    } catch (error_) {
      if (error_ instanceof ErroreApplicativo) {
        throw error_;
      }
      if (error_ instanceof ErroreUnicitaRegistro) {
        const voceEsistente =
          await this.dipendenze.registro.trovaAttivaPerGiocatore(
            sessione.id,
            giocatore.identificativoGiocatore,
          );
        if (voceEsistente !== null) {
          throw erroreConflitto(voceEsistente);
        }
      }
      throw errorePersistenza();
    }
  }

  async risolviConflitto(
    sessioneAstaId: string,
    input: InputRisoluzioneConflitto,
  ): Promise<EsitoMutazioneRegistro> {
    const identificativoGiocatore = identificativoGiocatoreSchema.safeParse(
      input.identificativoGiocatore,
    );
    if (!identificativoGiocatore.success) {
      throw erroreInput(
        "identificativo_giocatore_non_valido",
        "identificativoGiocatore",
        "È richiesto un identificativo non vuoto.",
        input.identificativoGiocatore,
      );
    }
    const chiaveIdempotenza = chiaveIdempotenzaSchema.safeParse(
      input.chiaveIdempotenza,
    );
    if (!chiaveIdempotenza.success) {
      throw erroreInput(
        "chiave_idempotenza_non_valida",
        "chiaveIdempotenza",
        "È richiesto un UUID valido.",
        input.chiaveIdempotenza,
      );
    }
    if (input.voceServerId.trim().length === 0) {
      throw erroreInput(
        "voce_server_non_valida",
        "voceServerId",
        "È richiesto l'identificativo della versione server confrontata.",
        input.voceServerId,
      );
    }

    const sessione = await this.dipendenze.caricaSessionePropria(
      sessioneAstaId,
    );
    const snapshot = await this.dipendenze.snapshot.trovaPubblicato(
      sessione.stagioneListone,
    );
    if (snapshot === null) {
      throw new ErroreApplicativo(
        503,
        { codice: "snapshot_non_disponibile" },
        "Non è disponibile uno snapshot consultabile per la sessione.",
      );
    }
    const giocatore = snapshot.giocatori.find(
      (voce) =>
        voce.identificativoGiocatore === identificativoGiocatore.data,
    );
    if (giocatore === undefined) {
      throw new ErroreApplicativo(
        404,
        {
          codice: "giocatore_non_disponibile",
          campo: "identificativoGiocatore",
          valoriImmessi: identificativoGiocatore.data,
        },
        "Il giocatore non è disponibile nello snapshot corrente.",
      );
    }
    const ruoli = contestoGiocatore(sessione, giocatore);

    return this.eseguiMutazione(sessione, async (registroRepository) => {
      const registro = await registroRepository.elencaPerSessione(sessione.id);
      const versioneGiaApplicata = registro.find(
        (voce) =>
          voce.annullataIl === null &&
          voce.identificativoGiocatore === giocatore.identificativoGiocatore &&
          voce.chiaveIdempotenza === chiaveIdempotenza.data,
      );
      if (versioneGiaApplicata !== undefined) {
        return esito(
          sessione.configurazione,
          registro,
          versioneGiaApplicata,
        );
      }

      const voceServer = registro.find(
        (voce) =>
          voce.annullataIl === null &&
          voce.identificativoGiocatore === giocatore.identificativoGiocatore,
      );
      if (voceServer === undefined) {
        throw new ErroreApplicativo(
          409,
          {
            codice: "conflitto_non_piu_corrente",
            campo: "voceServerId",
            vincolo: "La versione server confrontata deve essere ancora attiva.",
            valoriImmessi: input.voceServerId,
          },
          "Il conflitto è cambiato: aggiorna il confronto prima di scegliere.",
        );
      }
      if (voceServer.id !== input.voceServerId) {
        throw erroreConflitto(voceServer);
      }
      if (input.risoluzione === "server") {
        return esito(sessione.configurazione, registro, voceServer);
      }

      const istante = this.ora();
      const annullamento = annullaVoce(
        registro,
        voceServer.id,
        istante.toISOString(),
      );
      if (!annullamento.ok) {
        throw erroreDominio(annullamento.errore, registro);
      }
      const ordinale =
        registro.reduce(
          (massimo, voce) => Math.max(massimo, voce.ordinale),
          0,
        ) + 1;
      const registrazione = registra(
        sessione.configurazione,
        annullamento.registro,
        {
          id: this.generaId(),
          sessioneAstaId: sessione.id,
          ordinale,
          identificativoGiocatore: giocatore.identificativoGiocatore,
          nomeGiocatore: giocatore.nome,
          ruolo: ruoli.ruolo,
          ruoliAmmessi: ruoli.ruoliAmmessi,
          squadra: giocatore.squadra,
          repartoAssegnato: input.repartoAssegnato,
          prezzoAcquisto: input.prezzoAcquisto,
          chiaveIdempotenza: chiaveIdempotenza.data,
        },
      );
      if (!registrazione.ok) {
        throw erroreDominio(registrazione.errore, annullamento.registro);
      }

      await registroRepository.annulla(voceServer.id, istante);
      const voceLocale = await registroRepository.crea(registrazione.voce);
      await registroRepository.notificaMutazione(voceLocale.ordinale);
      return esito(
        sessione.configurazione,
        registrazione.registro,
        voceLocale,
      );
    });
  }

  async modificaPrezzo(
    sessioneAstaId: string,
    voceRegistroId: string,
    nuovoPrezzo: number,
  ): Promise<EsitoMutazioneRegistro> {
    const sessione = await this.dipendenze.caricaSessionePropria(
      sessioneAstaId,
    );
    return this.eseguiMutazione(sessione, async (registroRepository) => {
      const registro = await registroRepository.elencaPerSessione(sessione.id);
      const trasformazione = modificaPrezzoVoce(
        sessione.configurazione,
        registro,
        voceRegistroId,
        nuovoPrezzo,
      );
      if (!trasformazione.ok) {
        throw erroreDominio(trasformazione.errore, registro);
      }
      const voce = await registroRepository.aggiornaPrezzo(
        trasformazione.voce.id,
        trasformazione.voce.prezzoAcquisto,
      );
      await registroRepository.notificaMutazione(voce.ordinale);
      return esito(sessione.configurazione, trasformazione.registro, voce);
    });
  }

  async annulla(
    sessioneAstaId: string,
    voceRegistroId: string,
  ): Promise<EsitoMutazioneRegistro> {
    const sessione = await this.dipendenze.caricaSessionePropria(
      sessioneAstaId,
    );
    return this.eseguiMutazione(sessione, async (registroRepository) => {
      const registro = await registroRepository.elencaPerSessione(sessione.id);
      const istante = this.ora();
      const trasformazione = annullaVoce(
        registro,
        voceRegistroId,
        istante.toISOString(),
      );
      if (!trasformazione.ok) {
        throw erroreDominio(trasformazione.errore, registro);
      }
      const voce = await registroRepository.annulla(
        trasformazione.voce.id,
        istante,
      );
      await registroRepository.notificaMutazione(voce.ordinale);
      return esito(sessione.configurazione, trasformazione.registro, voce);
    });
  }

  private async eseguiMutazione<T>(
    sessione: SessioneAstaPersistita,
    operazione: (registro: RegistroTransazionale) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.dipendenze.transazioniRegistro.esegui(
        sessione.id,
        operazione,
        TIMEOUT_PERSISTENZA_MS,
      );
    } catch (error_) {
      if (error_ instanceof ErroreApplicativo) {
        throw error_;
      }
      throw errorePersistenza();
    }
  }
}
