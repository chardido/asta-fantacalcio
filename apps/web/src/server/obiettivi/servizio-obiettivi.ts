import {
  repartoSchema,
  type Reparto,
  type VoceRegistro,
} from "@asta/contracts";
import type {
  GiocatoreSnapshotPersistito,
  ObiettivoPersistito,
  RepositoryObiettivi,
  RepositoryRegistro,
  RepositorySnapshot,
  SessioneAstaPersistita,
} from "@asta/db";
import { z } from "zod";

import { ErroreApplicativo } from "../trpc/errori";

const LIMITE_OBIETTIVI = 200;
const PRIORITA_PREDEFINITA = 99;
const identificativoGiocatoreSchema = z.string().trim().min(1).max(128);
const ordinamentoSchema = z.enum(["reparto", "priorita"]);
const collatoreItaliano = new Intl.Collator("it", { sensitivity: "base" });

export type OrdinamentoObiettivi = z.infer<typeof ordinamentoSchema>;

export interface InputAggiuntaObiettivo {
  readonly identificativoGiocatore: unknown;
  readonly prezzoMassimoPersonale?: unknown;
  readonly priorita?: unknown;
  readonly reparto?: unknown;
}

export interface ListaObiettivi {
  readonly voci: readonly ObiettivoPersistito[];
  readonly conteggiPerReparto: Readonly<Partial<Record<Reparto, number>>>;
}

export interface DipendenzeServizioObiettivi {
  readonly obiettivi: Pick<
    RepositoryObiettivi,
    "creaEntroLimite" | "elencaPerSessione" | "aggiorna"
  >;
  readonly registro: Pick<RepositoryRegistro, "elencaPerSessione">;
  readonly snapshot: Pick<RepositorySnapshot, "trovaPubblicato">;
  /** Deve essere costruita tramite la guardia centralizzata di proprietà. */
  readonly caricaSessionePropria: (
    sessioneAstaId: string,
  ) => Promise<SessioneAstaPersistita>;
}

function erroreInput(
  codice: string,
  campo: string,
  vincolo: string,
  valore: unknown,
): ErroreApplicativo {
  return new ErroreApplicativo(
    400,
    { codice, campo, vincolo, valoriImmessi: valore },
    vincolo,
  );
}

function validaIdentificativo(input: unknown): string {
  const esito = identificativoGiocatoreSchema.safeParse(input);
  if (!esito.success) {
    throw erroreInput(
      "identificativo_giocatore_non_valido",
      "identificativoGiocatore",
      "È richiesto un identificativo giocatore da 1 a 128 caratteri.",
      input,
    );
  }
  return esito.data;
}

function validaPrezzoMassimo(
  input: unknown,
  creditiIniziali: number,
): number | null {
  if (input === undefined || input === null) {
    return null;
  }
  const esito = z.number().int().min(1).max(creditiIniziali).safeParse(input);
  if (!esito.success) {
    throw erroreInput(
      "prezzo_massimo_personale_non_valido",
      "prezzoMassimoPersonale",
      `Il prezzo massimo personale deve essere un intero compreso tra 1 e ${creditiIniziali}.`,
      input,
    );
  }
  return esito.data;
}

function validaPriorita(input: unknown): number {
  if (input === undefined || input === null) {
    return PRIORITA_PREDEFINITA;
  }
  const esito = z.number().int().min(1).max(99).safeParse(input);
  if (!esito.success) {
    throw erroreInput(
      "priorita_non_valida",
      "priorita",
      "La priorità deve essere un intero compreso tra 1 e 99.",
      input,
    );
  }
  return esito.data;
}

function erroreObiettivoNonDisponibile(id: string): ErroreApplicativo {
  return new ErroreApplicativo(
    404,
    {
      codice: "obiettivo_non_disponibile",
      campo: "obiettivoId",
      valoriImmessi: id,
    },
    "L'obiettivo non è disponibile nella sessione.",
  );
}

function risolviReparto(
  sessione: SessioneAstaPersistita,
  giocatore: GiocatoreSnapshotPersistito,
  repartoInput: unknown,
): Reparto {
  let repartiAmmessi: readonly Reparto[];
  if (sessione.configurazione.modalitaGioco === "classic") {
    repartiAmmessi =
      giocatore.ruoloClassic === null ? [] : [giocatore.ruoloClassic];
  } else {
    repartiAmmessi = giocatore.ruoliMantra;
  }

  if (repartiAmmessi.length === 0) {
    throw new ErroreApplicativo(
      404,
      {
        codice: "giocatore_non_compatibile",
        campo: "identificativoGiocatore",
        valoriImmessi: giocatore.identificativoGiocatore,
      },
      "Il giocatore non ha un reparto compatibile con la modalità della sessione.",
    );
  }

  if (repartoInput === undefined) {
    return repartiAmmessi[0] as Reparto;
  }
  const reparto = repartoSchema.safeParse(repartoInput);
  if (!reparto.success || !repartiAmmessi.includes(reparto.data)) {
    throw erroreInput(
      "reparto_obiettivo_non_valido",
      "reparto",
      `Il reparto deve essere uno dei ruoli ammessi: ${repartiAmmessi.join(", ")}.`,
      repartoInput,
    );
  }
  return reparto.data;
}

function identificativiNonDisponibili(
  registro: readonly VoceRegistro[],
): ReadonlySet<string> {
  return new Set(
    registro
      .filter((voce) => voce.annullataIl === null)
      .map((voce) => voce.identificativoGiocatore),
  );
}

function ordina(
  voci: readonly ObiettivoPersistito[],
  criterio: OrdinamentoObiettivi,
): readonly ObiettivoPersistito[] {
  return [...voci].sort((sinistra, destra) => {
    const confrontoPrincipale =
      criterio === "priorita"
        ? sinistra.priorita - destra.priorita
        : collatoreItaliano.compare(sinistra.reparto, destra.reparto);
    return confrontoPrincipale === 0
      ? collatoreItaliano.compare(
          sinistra.nomeGiocatore,
          destra.nomeGiocatore,
        )
      : confrontoPrincipale;
  });
}

/** Gestisce la strategia pre-asta e mantiene derivata la raggiungibilità degli obiettivi. */
export class ServizioObiettivi {
  constructor(private readonly dipendenze: DipendenzeServizioObiettivi) {}

  async aggiungi(
    sessioneAstaId: string,
    input: InputAggiuntaObiettivo,
  ): Promise<ObiettivoPersistito> {
    const identificativoGiocatore = validaIdentificativo(
      input.identificativoGiocatore,
    );
    const sessione = await this.dipendenze.caricaSessionePropria(
      sessioneAstaId,
    );
    const prezzoMassimoPersonale = validaPrezzoMassimo(
      input.prezzoMassimoPersonale,
      sessione.configurazione.creditiIniziali,
    );
    const priorita = validaPriorita(input.priorita);
    const [snapshot, registro] = await Promise.all([
      this.dipendenze.snapshot.trovaPubblicato(sessione.stagioneListone),
      this.dipendenze.registro.elencaPerSessione(sessione.id),
    ]);
    if (snapshot === null) {
      throw new ErroreApplicativo(
        503,
        { codice: "snapshot_non_disponibile" },
        "Non è disponibile uno snapshot consultabile per la sessione.",
      );
    }
    const giocatore = snapshot.giocatori.find(
      (corrente) =>
        corrente.identificativoGiocatore === identificativoGiocatore,
    );
    if (giocatore === undefined) {
      throw new ErroreApplicativo(
        404,
        {
          codice: "giocatore_non_disponibile",
          campo: "identificativoGiocatore",
          valoriImmessi: identificativoGiocatore,
        },
        "Il giocatore non è disponibile nello snapshot corrente.",
      );
    }

    const esito = await this.dipendenze.obiettivi.creaEntroLimite(
      {
        sessioneAstaId: sessione.id,
        identificativoGiocatore,
        nomeGiocatore: giocatore.nome,
        reparto: risolviReparto(sessione, giocatore, input.reparto),
        prezzoMassimoPersonale,
        priorita,
        nonRaggiungibile: identificativiNonDisponibili(registro).has(
          identificativoGiocatore,
        ),
      },
      LIMITE_OBIETTIVI,
    );

    if (esito.ok) {
      return esito.obiettivo;
    }
    if (esito.motivo === "obiettivo_duplicato") {
      throw new ErroreApplicativo(
        409,
        {
          codice: "obiettivo_duplicato",
          campo: "identificativoGiocatore",
          vincolo: "Ogni giocatore può comparire una sola volta nella lista.",
          valoriImmessi: identificativoGiocatore,
        },
        "Il giocatore è già presente nella lista obiettivi.",
      );
    }
    throw new ErroreApplicativo(
      409,
      {
        codice: "limite_obiettivi_raggiunto",
        campo: "obiettivi",
        vincolo: `La sessione può contenere al massimo ${LIMITE_OBIETTIVI} obiettivi.`,
        valoriImmessi: LIMITE_OBIETTIVI,
      },
      "La lista ha già raggiunto il limite di 200 obiettivi.",
    );
  }

  async aggiornaPrezzoMassimoPersonale(
    sessioneAstaId: string,
    obiettivoId: string,
    prezzoInput: unknown,
  ): Promise<ObiettivoPersistito> {
    const sessione = await this.dipendenze.caricaSessionePropria(
      sessioneAstaId,
    );
    const obiettivo = await this.trovaObiettivo(sessione.id, obiettivoId);
    const prezzoMassimoPersonale = validaPrezzoMassimo(
      prezzoInput,
      sessione.configurazione.creditiIniziali,
    );
    return this.dipendenze.obiettivi.aggiorna(obiettivo.id, {
      prezzoMassimoPersonale,
    });
  }

  async aggiornaPriorita(
    sessioneAstaId: string,
    obiettivoId: string,
    prioritaInput: unknown,
  ): Promise<ObiettivoPersistito> {
    const sessione = await this.dipendenze.caricaSessionePropria(
      sessioneAstaId,
    );
    const obiettivo = await this.trovaObiettivo(sessione.id, obiettivoId);
    return this.dipendenze.obiettivi.aggiorna(obiettivo.id, {
      priorita: validaPriorita(prioritaInput),
    });
  }

  async impostaNonRaggiungibile(
    sessioneAstaId: string,
    obiettivoId: string,
    nonRaggiungibileInput: unknown,
  ): Promise<ObiettivoPersistito> {
    const nonRaggiungibile = z.boolean().safeParse(nonRaggiungibileInput);
    if (!nonRaggiungibile.success) {
      throw erroreInput(
        "raggiungibilita_non_valida",
        "nonRaggiungibile",
        "Il contrassegno di non raggiungibilità deve essere booleano.",
        nonRaggiungibileInput,
      );
    }
    const sessione = await this.dipendenze.caricaSessionePropria(
      sessioneAstaId,
    );
    const obiettivo = await this.trovaObiettivo(sessione.id, obiettivoId);
    return this.dipendenze.obiettivi.aggiorna(obiettivo.id, {
      nonRaggiungibile: nonRaggiungibile.data,
    });
  }

  async elenca(
    sessioneAstaId: string,
    ordinamentoInput: unknown = "priorita",
  ): Promise<ListaObiettivi> {
    const ordinamento = ordinamentoSchema.safeParse(ordinamentoInput);
    if (!ordinamento.success) {
      throw erroreInput(
        "ordinamento_obiettivi_non_valido",
        "ordinamento",
        "L'ordinamento deve essere 'reparto' oppure 'priorita'.",
        ordinamentoInput,
      );
    }
    const sessione = await this.dipendenze.caricaSessionePropria(
      sessioneAstaId,
    );
    const [vociPersistite, registro] = await Promise.all([
      this.dipendenze.obiettivi.elencaPerSessione(sessione.id),
      this.dipendenze.registro.elencaPerSessione(sessione.id),
    ]);
    const nonDisponibili = identificativiNonDisponibili(registro);
    const voci = await Promise.all(
      vociPersistite.map((voce) => {
        const nonRaggiungibile = nonDisponibili.has(
          voce.identificativoGiocatore,
        );
        return voce.nonRaggiungibile === nonRaggiungibile
          ? Promise.resolve(voce)
          : this.dipendenze.obiettivi.aggiorna(voce.id, {
              nonRaggiungibile,
            });
      }),
    );

    const conteggiPerReparto: Partial<Record<Reparto, number>> = {};
    for (const reparto of Object.keys(
      sessione.configurazione.composizioneRosa,
    ) as Reparto[]) {
      conteggiPerReparto[reparto] = 0;
    }
    for (const voce of voci) {
      if (!voce.nonRaggiungibile) {
        conteggiPerReparto[voce.reparto] =
          (conteggiPerReparto[voce.reparto] ?? 0) + 1;
      }
    }

    return {
      voci: ordina(voci, ordinamento.data),
      conteggiPerReparto,
    };
  }

  private async trovaObiettivo(
    sessioneAstaId: string,
    obiettivoId: string,
  ): Promise<ObiettivoPersistito> {
    const voci = await this.dipendenze.obiettivi.elencaPerSessione(
      sessioneAstaId,
    );
    const obiettivo = voci.find((voce) => voce.id === obiettivoId);
    if (obiettivo === undefined) {
      throw erroreObiettivoNonDisponibile(obiettivoId);
    }
    return obiettivo;
  }
}
