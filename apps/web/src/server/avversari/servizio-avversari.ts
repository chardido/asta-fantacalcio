import type { Reparto, VoceRegistro } from "@asta/contracts";
import {
  ErroreUnicitaAvversario,
  type AvversarioPersistito,
  type RepositoryAvversari,
  type RepositoryRegistro,
  type SessioneAstaPersistita,
} from "@asta/db";
import { creditiResiduiStimati } from "@asta/domain";
import { z } from "zod";

import { ErroreApplicativo } from "../trpc/errori";

const LIMITE_AVVERSARI = 19;
const nomeAvversarioSchema = z.string().trim().min(1).max(30);

export interface RiepilogoAvversario {
  readonly id: string;
  readonly nome: string;
  readonly creditiSpesi: number;
  readonly creditiResiduiStimati: number;
  readonly giocatoriPerReparto: Readonly<Partial<Record<Reparto, number>>>;
}

export interface AnnotazioneAcquistoAvversario {
  readonly id: string;
  readonly ordinale: number;
  readonly identificativoGiocatore: string;
  readonly nomeGiocatore: string;
  readonly squadra: string;
  readonly repartoAssegnato: Reparto;
  readonly avversarioId: string | null;
  readonly avversarioNome: string | null;
  readonly prezzoAcquisto: number | null;
}

export interface DipendenzeServizioAvversari {
  readonly avversari: Pick<
    RepositoryAvversari,
    | "creaEntroLimite"
    | "trovaPerId"
    | "elencaPerSessione"
    | "rinomina"
  >;
  readonly registro: Pick<RepositoryRegistro, "elencaPerSessione">;
  /** Deve essere costruita tramite la guardia centralizzata di proprietà. */
  readonly caricaSessionePropria: (
    sessioneAstaId: string,
  ) => Promise<SessioneAstaPersistita>;
}

function erroreNome(nome: unknown): ErroreApplicativo {
  return new ErroreApplicativo(
    400,
    {
      codice: "nome_avversario_non_valido",
      campo: "nome",
      vincolo: "Il nome deve contenere da 1 a 30 caratteri.",
      valoriImmessi: nome,
    },
    "Il nome dell'avversario deve contenere da 1 a 30 caratteri.",
  );
}

function erroreNomeDuplicato(nome: string): ErroreApplicativo {
  return new ErroreApplicativo(
    409,
    {
      codice: "nome_avversario_duplicato",
      campo: "nome",
      vincolo: "Il nome deve essere univoco nella sessione.",
      valoriImmessi: nome,
    },
    "Esiste già un avversario con questo nome.",
  );
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

function validaNome(nome: unknown): string {
  const esito = nomeAvversarioSchema.safeParse(nome);
  if (!esito.success) {
    throw erroreNome(nome);
  }
  return esito.data;
}

function costruisciRiepilogo(
  avversario: AvversarioPersistito,
  creditiIniziali: number,
  reparti: readonly Reparto[],
  registro: readonly VoceRegistro[],
): RiepilogoAvversario {
  const giocatoriPerReparto: Partial<Record<Reparto, number>> = {};
  for (const reparto of reparti) {
    giocatoriPerReparto[reparto] = 0;
  }

  let creditiSpesi = 0;
  for (const voce of registro) {
    if (
      voce.annullataIl !== null ||
      voce.assegnatarioTipo !== "avversario" ||
      voce.avversarioId !== avversario.id
    ) {
      continue;
    }
    if (voce.prezzoAcquisto !== null) {
      creditiSpesi += voce.prezzoAcquisto;
    }
    giocatoriPerReparto[voce.repartoAssegnato] =
      (giocatoriPerReparto[voce.repartoAssegnato] ?? 0) + 1;
  }

  return {
    id: avversario.id,
    nome: avversario.nome,
    creditiSpesi,
    creditiResiduiStimati: creditiResiduiStimati(
      creditiIniziali,
      registro,
      avversario.id,
    ),
    giocatoriPerReparto,
  };
}

/** Gestisce i nominativi e la vista derivata degli avversari di una sessione. */
export class ServizioAvversari {
  constructor(private readonly dipendenze: DipendenzeServizioAvversari) {}

  async crea(
    sessioneAstaId: string,
    nomeInput: unknown,
  ): Promise<AvversarioPersistito> {
    const nome = validaNome(nomeInput);
    const sessione = await this.dipendenze.caricaSessionePropria(
      sessioneAstaId,
    );
    const esito = await this.dipendenze.avversari.creaEntroLimite(
      sessione.id,
      nome,
      LIMITE_AVVERSARI,
    );

    if (esito.ok) {
      return esito.avversario;
    }
    if (esito.motivo === "nome_duplicato") {
      throw erroreNomeDuplicato(nome);
    }
    throw new ErroreApplicativo(
      409,
      {
        codice: "limite_avversari_raggiunto",
        campo: "avversari",
        vincolo: `La sessione può contenere al massimo ${LIMITE_AVVERSARI} avversari.`,
        valoriImmessi: LIMITE_AVVERSARI,
      },
      "La sessione ha già raggiunto il limite di 19 avversari.",
    );
  }

  async rinomina(
    sessioneAstaId: string,
    avversarioId: string,
    nomeInput: unknown,
  ): Promise<AvversarioPersistito> {
    const nome = validaNome(nomeInput);
    const sessione = await this.dipendenze.caricaSessionePropria(
      sessioneAstaId,
    );
    const avversario = await this.dipendenze.avversari.trovaPerId(avversarioId);
    if (avversario?.sessioneAstaId !== sessione.id) {
      throw erroreAvversarioNonDisponibile(avversarioId);
    }

    const avversari = await this.dipendenze.avversari.elencaPerSessione(
      sessione.id,
    );
    if (
      avversari.some(
        (corrente) => corrente.id !== avversario.id && corrente.nome === nome,
      )
    ) {
      throw erroreNomeDuplicato(nome);
    }

    try {
      return await this.dipendenze.avversari.rinomina(avversario.id, nome);
    } catch (error_) {
      if (error_ instanceof ErroreUnicitaAvversario) {
        throw erroreNomeDuplicato(nome);
      }
      throw error_;
    }
  }

  async elenca(sessioneAstaId: string): Promise<readonly RiepilogoAvversario[]> {
    const sessione = await this.dipendenze.caricaSessionePropria(
      sessioneAstaId,
    );
    const [avversari, registro] = await Promise.all([
      this.dipendenze.avversari.elencaPerSessione(sessione.id),
      this.dipendenze.registro.elencaPerSessione(sessione.id),
    ]);
    const reparti = Object.keys(
      sessione.configurazione.composizioneRosa,
    ) as Reparto[];

    return avversari.map((avversario) =>
      costruisciRiepilogo(
        avversario,
        sessione.configurazione.creditiIniziali,
        reparti,
        registro,
      ),
    );
  }

  async elencaAnnotazioni(
    sessioneAstaId: string,
  ): Promise<readonly AnnotazioneAcquistoAvversario[]> {
    const sessione = await this.dipendenze.caricaSessionePropria(
      sessioneAstaId,
    );
    const [avversari, registro] = await Promise.all([
      this.dipendenze.avversari.elencaPerSessione(sessione.id),
      this.dipendenze.registro.elencaPerSessione(sessione.id),
    ]);
    const nomePerId = new Map(
      avversari.map((avversario) => [avversario.id, avversario.nome]),
    );

    return registro
      .filter(
        (voce) =>
          voce.annullataIl === null &&
          voce.assegnatarioTipo === "avversario",
      )
      .sort((sinistra, destra) => sinistra.ordinale - destra.ordinale)
      .map((voce) => ({
        id: voce.id,
        ordinale: voce.ordinale,
        identificativoGiocatore: voce.identificativoGiocatore,
        nomeGiocatore: voce.nomeGiocatore,
        squadra: voce.squadra,
        repartoAssegnato: voce.repartoAssegnato,
        avversarioId: voce.avversarioId,
        avversarioNome:
          voce.avversarioId === null
            ? null
            : (nomePerId.get(voce.avversarioId) ?? null),
        prezzoAcquisto: voce.prezzoAcquisto,
      }));
  }
}
