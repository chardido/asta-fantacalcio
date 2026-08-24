import {
  MACRO_REPARTO_PER_RUOLO_MANTRA,
  configurazioneAstaSchema,
  pesiValutazioneSchema,
  type ConfigurazioneAsta,
  type MacroReparto,
  type PesiValutazione,
  type Reparto,
  type RepartoMantra,
  type VoceRegistro,
} from "@asta/contracts";
import type {
  RepositoryRegistro,
  RepositorySessioniAsta,
  SessioneAstaPersistita,
} from "@asta/db";
import {
  PROFILI_STRATEGIA,
  applicaProfiloStrategia,
  derivaStato,
  ripristinaPesiPredefiniti,
  type ProfiloStrategia,
  type StatoSessione,
} from "@asta/domain";
import { z, type ZodError } from "zod";

import { ErroreApplicativo } from "../trpc/errori";

export type MappaRuoliMantra = Readonly<
  Record<RepartoMantra, MacroReparto>
>;

export interface ConfigurazioneSessioneAggiornata extends StatoSessione {
  readonly id: string;
  readonly configurazione: ConfigurazioneAsta;
}

export interface DipendenzeServizioConfigurazione {
  readonly sessioniAsta: Pick<
    RepositorySessioniAsta,
    "aggiornaConfigurazione"
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

const profiloStrategiaSchema = z.enum(PROFILI_STRATEGIA);
const MAPPA_RUOLI_MANTRA_CONSULTABILE: MappaRuoliMantra = Object.freeze({
  ...MACRO_REPARTO_PER_RUOLO_MANTRA,
});

function erroreValidazioneZod(
  errore: ZodError,
  prefissoCampo: string,
  valoriImmessi: unknown,
): ErroreApplicativo {
  const issue = errore.issues[0];
  const percorso = issue?.path.map(String) ?? [];
  const percorsoCompleto = [prefissoCampo, ...percorso]
    .filter((parte) => parte.length > 0)
    .join(".");
  const riguardaPesi =
    prefissoCampo === "pesiValutazione" || percorso[0] === "pesiValutazione";
  const fattore =
    prefissoCampo === "pesiValutazione" ? percorso[0] : percorso[1];
  const descrizioneFattore = fattore === undefined ? "" : ` ${fattore}`;
  const vincoloPesi = `Il peso${descrizioneFattore} deve essere un intero compreso tra 0 e 100 e almeno un peso deve essere maggiore di 0.`;
  const vincolo = riguardaPesi
    ? vincoloPesi
    : (issue?.message ?? "La configurazione dell'asta non è valida.");

  return new ErroreApplicativo(
    400,
    {
      codice: riguardaPesi
        ? "pesi_valutazione_non_validi"
        : "configurazione_asta_non_valida",
      campo: percorsoCompleto || prefissoCampo,
      vincolo,
      valoriImmessi,
    },
    `Valore non valido per ${percorsoCompleto || prefissoCampo}: ${vincolo}`,
  );
}

function validaConfigurazione(input: unknown): ConfigurazioneAsta {
  const esito = configurazioneAstaSchema.safeParse(input);
  if (!esito.success) {
    throw erroreValidazioneZod(esito.error, "configurazione", input);
  }
  return esito.data;
}

function validaPesi(input: unknown): PesiValutazione {
  const esito = pesiValutazioneSchema.safeParse(input);
  if (!esito.success) {
    throw erroreValidazioneZod(esito.error, "pesiValutazione", input);
  }
  return esito.data;
}

function validaProfilo(input: unknown): ProfiloStrategia {
  const esito = profiloStrategiaSchema.safeParse(input);
  if (!esito.success) {
    throw new ErroreApplicativo(
      400,
      {
        codice: "profilo_strategia_non_valido",
        campo: "profiloStrategia",
        vincolo: `Valori ammessi: ${PROFILI_STRATEGIA.join(", ")}.`,
        valoriImmessi: input,
      },
      `Profilo strategia non valido. Valori ammessi: ${PROFILI_STRATEGIA.join(", ")}.`,
    );
  }
  return esito.data;
}

function calcolaEsuberi(
  configurazione: ConfigurazioneAsta,
  registro: readonly VoceRegistro[],
): Readonly<Record<string, number>> {
  const conteggi = new Map<Reparto, number>();
  for (const voce of registro) {
    if (voce.annullataIl !== null || voce.assegnatarioTipo !== "utente") {
      continue;
    }
    conteggi.set(
      voce.repartoAssegnato,
      (conteggi.get(voce.repartoAssegnato) ?? 0) + 1,
    );
  }

  const composizione = configurazione.composizioneRosa as Partial<
    Record<Reparto, number>
  >;
  const esuberi = [...conteggi.entries()]
    .map(([reparto, numeroGiocatori]) => [
      reparto,
      numeroGiocatori - (composizione[reparto] ?? 0),
    ] as const)
    .filter(([, esubero]) => esubero > 0);

  return Object.freeze(Object.fromEntries(esuberi));
}

function erroreRosaIncompatibile(
  esuberiPerReparto: Readonly<Record<string, number>>,
  configurazione: ConfigurazioneAsta,
): ErroreApplicativo {
  return new ErroreApplicativo(
    409,
    {
      codice: "rosa_incompatibile_con_configurazione",
      campo: "configurazione.composizioneRosa",
      vincolo:
        "I giocatori presenti in rosa non possono superare gli slot configurati per alcun reparto.",
      valoriImmessi: configurazione,
      dettagli: { esuberiPerReparto },
    },
    "La configurazione non è compatibile con la rosa corrente.",
  );
}

/**
 * Servizio applicativo per modificare la configurazione di una sessione.
 * Budget, budget di reparto, slot e rosa non vengono persistiti: sono sempre
 * ricalcolati dal registro dopo il salvataggio della configurazione.
 */
export class ServizioConfigurazione {
  constructor(private readonly dipendenze: DipendenzeServizioConfigurazione) {}

  async modifica(
    sessioneAstaId: string,
    configurazione: unknown,
  ): Promise<ConfigurazioneSessioneAggiornata> {
    return this.aggiorna(sessioneAstaId, () =>
      validaConfigurazione(configurazione),
    );
  }

  async modificaPesi(
    sessioneAstaId: string,
    pesiValutazione: unknown,
  ): Promise<ConfigurazioneSessioneAggiornata> {
    return this.aggiorna(sessioneAstaId, (corrente) => ({
      ...corrente,
      pesiValutazione: validaPesi(pesiValutazione),
    }));
  }

  async applicaProfilo(
    sessioneAstaId: string,
    profiloStrategia: unknown,
  ): Promise<ConfigurazioneSessioneAggiornata> {
    return this.aggiorna(sessioneAstaId, (corrente) => ({
      ...corrente,
      pesiValutazione: applicaProfiloStrategia(
        validaProfilo(profiloStrategia),
      ),
    }));
  }

  async ripristinaPesi(
    sessioneAstaId: string,
  ): Promise<ConfigurazioneSessioneAggiornata> {
    return this.aggiorna(sessioneAstaId, (corrente) => ({
      ...corrente,
      pesiValutazione: ripristinaPesiPredefiniti(),
    }));
  }

  consultaMappaRuoliMantra(): MappaRuoliMantra {
    return MAPPA_RUOLI_MANTRA_CONSULTABILE;
  }

  private async aggiorna(
    sessioneAstaId: string,
    creaConfigurazione: (
      configurazioneCorrente: ConfigurazioneAsta,
    ) => ConfigurazioneAsta,
  ): Promise<ConfigurazioneSessioneAggiornata> {
    const sessione = await this.dipendenze.caricaSessionePropria(
      sessioneAstaId,
    );
    const configurazione = validaConfigurazione(
      creaConfigurazione(sessione.configurazione),
    );
    const registro = await this.dipendenze.registro.elencaPerSessione(
      sessione.id,
    );
    const esuberiPerReparto = calcolaEsuberi(configurazione, registro);

    if (Object.keys(esuberiPerReparto).length > 0) {
      throw erroreRosaIncompatibile(esuberiPerReparto, configurazione);
    }

    const aggiornata = await this.dipendenze.sessioniAsta.aggiornaConfigurazione(
      sessione.id,
      configurazione,
    );
    return {
      id: aggiornata.id,
      configurazione: aggiornata.configurazione,
      ...derivaStato(aggiornata.configurazione, registro),
    };
  }
}
