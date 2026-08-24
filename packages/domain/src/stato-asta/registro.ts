import {
  MACRO_REPARTO_PER_RUOLO_MANTRA,
  type ConfigurazioneAsta,
  type MacroReparto,
  type Reparto,
  type VoceRegistro,
} from "@asta/contracts";

import { derivaStato } from "./deriva-stato.js";

const MACRO_REPARTO_CLASSIC = {
  P: "POR",
  D: "DIF",
  C: "CEN",
  A: "ATT",
} as const;

export interface NuovoAcquistoUtente {
  readonly id: string;
  readonly sessioneAstaId: string;
  readonly ordinale: number;
  readonly identificativoGiocatore: string;
  readonly nomeGiocatore: string;
  readonly ruolo: Reparto;
  readonly ruoliAmmessi: readonly Reparto[];
  readonly squadra: string;
  readonly repartoAssegnato?: Reparto;
  readonly prezzoAcquisto: number;
  readonly chiaveIdempotenza: string;
  readonly giocatoreAssenteDatiCorrenti?: boolean;
}

export type ErroreRegistro =
  | {
      readonly codice: "prezzo_fuori_intervallo";
      readonly vincolo: "intero_compreso_nell_intervallo";
      readonly valoreRifiutato: number;
      readonly minimo: 1;
      readonly massimo: number;
    }
  | {
      readonly codice: "budget_insufficiente";
      readonly vincolo: "budget_residuo";
      readonly valoreRifiutato: number;
      readonly minimo: 1;
      readonly massimo: number;
    }
  | {
      readonly codice: "reparto_completo";
      readonly vincolo: "slot_residui";
      readonly reparto: Reparto;
      readonly slotPrevisti: number;
    }
  | {
      readonly codice: "giocatore_gia_assegnato";
      readonly vincolo: "giocatore_unico_nel_registro_attivo";
      readonly identificativoGiocatore: string;
      readonly assegnatarioTipo: "utente" | "avversario";
      readonly avversarioId: string | null;
    }
  | {
      readonly codice: "reparto_non_ammesso";
      readonly vincolo: "ruolo_di_imputazione_ammesso";
      readonly reparto: Reparto | null;
      readonly repartiAmmessi: readonly Reparto[];
    }
  | {
      readonly codice: "voce_non_trovata";
      readonly vincolo: "voce_esistente";
      readonly voceRegistroId: string;
    }
  | {
      readonly codice: "voce_gia_annullata";
      readonly vincolo: "voce_attiva";
      readonly voceRegistroId: string;
    }
  | {
      readonly codice: "prezzo_non_modificabile";
      readonly vincolo: "voce_utente_con_prezzo";
      readonly voceRegistroId: string;
    };

export type EsitoTrasformazioneRegistro =
  | {
      readonly ok: true;
      readonly registro: readonly VoceRegistro[];
      readonly voce: VoceRegistro;
    }
  | {
      readonly ok: false;
      readonly registro: readonly VoceRegistro[];
      readonly errore: ErroreRegistro;
    };

function macroRepartoPer(reparto: Reparto): MacroReparto {
  if (reparto === "P" || reparto === "D" || reparto === "C" || reparto === "A") {
    return MACRO_REPARTO_CLASSIC[reparto];
  }

  return MACRO_REPARTO_PER_RUOLO_MANTRA[reparto];
}

function slotPrevistiPer(
  configurazione: ConfigurazioneAsta,
  reparto: Reparto,
): number | undefined {
  return Object.entries(configurazione.composizioneRosa).find(
    ([repartoConfigurato]) => repartoConfigurato === reparto,
  )?.[1];
}

function errorePrezzo(
  valoreRifiutato: number,
  massimo: number,
): ErroreRegistro {
  return {
    codice: "prezzo_fuori_intervallo",
    vincolo: "intero_compreso_nell_intervallo",
    valoreRifiutato,
    minimo: 1,
    massimo,
  };
}

function fallimento(
  registro: readonly VoceRegistro[],
  errore: ErroreRegistro,
): EsitoTrasformazioneRegistro {
  return { ok: false, registro, errore };
}

/**
 * Seleziona deterministicamente il ruolo di imputazione: più slot residui,
 * poi il primo ruolo nell'ordine ricevuto dal listone.
 */
export function selezionaRepartoPredefinito(
  configurazione: ConfigurazioneAsta,
  registro: readonly VoceRegistro[],
  ruoliAmmessi: readonly Reparto[],
): Reparto | null {
  const stato = derivaStato(configurazione, registro);
  let selezionato: Reparto | null = null;
  let slotSelezionati = Number.NEGATIVE_INFINITY;

  for (const reparto of ruoliAmmessi) {
    if (slotPrevistiPer(configurazione, reparto) === undefined) {
      continue;
    }

    const slot = stato.slotResidui.get(reparto) ?? 0;
    if (slot > slotSelezionati) {
      selezionato = reparto;
      slotSelezionati = slot;
    }
  }

  return selezionato;
}

/** Aggiunge un acquisto dell'utente senza mutare il registro ricevuto. */
export function registra(
  configurazione: ConfigurazioneAsta,
  registro: readonly VoceRegistro[],
  acquisto: NuovoAcquistoUtente,
): EsitoTrasformazioneRegistro {
  if (
    !Number.isInteger(acquisto.prezzoAcquisto) ||
    acquisto.prezzoAcquisto < 1 ||
    acquisto.prezzoAcquisto > configurazione.creditiIniziali
  ) {
    return fallimento(
      registro,
      errorePrezzo(acquisto.prezzoAcquisto, configurazione.creditiIniziali),
    );
  }

  const stato = derivaStato(configurazione, registro);
  if (acquisto.prezzoAcquisto > stato.budgetResiduo) {
    return fallimento(registro, {
      codice: "budget_insufficiente",
      vincolo: "budget_residuo",
      valoreRifiutato: acquisto.prezzoAcquisto,
      minimo: 1,
      massimo: stato.budgetResiduo,
    });
  }

  const voceEsistente = registro.find(
    (voce) =>
      voce.annullataIl === null &&
      voce.identificativoGiocatore === acquisto.identificativoGiocatore,
  );
  if (voceEsistente !== undefined) {
    return fallimento(registro, {
      codice: "giocatore_gia_assegnato",
      vincolo: "giocatore_unico_nel_registro_attivo",
      identificativoGiocatore: acquisto.identificativoGiocatore,
      assegnatarioTipo: voceEsistente.assegnatarioTipo,
      avversarioId: voceEsistente.avversarioId,
    });
  }

  const repartoAssegnato =
    acquisto.repartoAssegnato ??
    selezionaRepartoPredefinito(
      configurazione,
      registro,
      acquisto.ruoliAmmessi,
    );
  const repartoValido =
    repartoAssegnato !== null &&
    acquisto.ruoliAmmessi.includes(repartoAssegnato) &&
    slotPrevistiPer(configurazione, repartoAssegnato) !== undefined;

  if (!repartoValido) {
    return fallimento(registro, {
      codice: "reparto_non_ammesso",
      vincolo: "ruolo_di_imputazione_ammesso",
      reparto: repartoAssegnato,
      repartiAmmessi: [...acquisto.ruoliAmmessi],
    });
  }

  const slotPrevisti = slotPrevistiPer(configurazione, repartoAssegnato);
  if ((stato.slotResidui.get(repartoAssegnato) ?? 0) <= 0) {
    return fallimento(registro, {
      codice: "reparto_completo",
      vincolo: "slot_residui",
      reparto: repartoAssegnato,
      slotPrevisti: slotPrevisti ?? 0,
    });
  }

  const voce: VoceRegistro = {
    id: acquisto.id,
    sessioneAstaId: acquisto.sessioneAstaId,
    ordinale: acquisto.ordinale,
    identificativoGiocatore: acquisto.identificativoGiocatore,
    nomeGiocatore: acquisto.nomeGiocatore,
    ruolo: acquisto.ruolo,
    squadra: acquisto.squadra,
    repartoAssegnato,
    macroReparto: macroRepartoPer(repartoAssegnato),
    assegnatarioTipo: "utente",
    avversarioId: null,
    prezzoAcquisto: acquisto.prezzoAcquisto,
    annullataIl: null,
    chiaveIdempotenza: acquisto.chiaveIdempotenza,
    giocatoreAssenteDatiCorrenti:
      acquisto.giocatoreAssenteDatiCorrenti ?? false,
  };

  return { ok: true, registro: [...registro, voce], voce };
}

/** Modifica il prezzo di un acquisto attivo senza alterare slot o rosa. */
export function modificaPrezzo(
  configurazione: ConfigurazioneAsta,
  registro: readonly VoceRegistro[],
  voceRegistroId: string,
  nuovoPrezzo: number,
): EsitoTrasformazioneRegistro {
  const indice = registro.findIndex((voce) => voce.id === voceRegistroId);
  const voce = registro[indice];

  if (voce === undefined) {
    return fallimento(registro, {
      codice: "voce_non_trovata",
      vincolo: "voce_esistente",
      voceRegistroId,
    });
  }
  if (voce.annullataIl !== null) {
    return fallimento(registro, {
      codice: "voce_gia_annullata",
      vincolo: "voce_attiva",
      voceRegistroId,
    });
  }
  if (voce.assegnatarioTipo !== "utente") {
    return fallimento(registro, {
      codice: "prezzo_non_modificabile",
      vincolo: "voce_utente_con_prezzo",
      voceRegistroId,
    });
  }

  const massimo =
    derivaStato(configurazione, registro).budgetResiduo + voce.prezzoAcquisto;
  if (!Number.isInteger(nuovoPrezzo) || nuovoPrezzo < 1 || nuovoPrezzo > massimo) {
    return fallimento(registro, errorePrezzo(nuovoPrezzo, massimo));
  }

  const voceModificata: VoceRegistro = { ...voce, prezzoAcquisto: nuovoPrezzo };
  const registroModificato = [...registro];
  registroModificato[indice] = voceModificata;
  return { ok: true, registro: registroModificato, voce: voceModificata };
}

/** Contrassegna logicamente una voce come annullata usando un istante esplicito. */
export function annulla(
  registro: readonly VoceRegistro[],
  voceRegistroId: string,
  annullataIl: string,
): EsitoTrasformazioneRegistro {
  const indice = registro.findIndex((voce) => voce.id === voceRegistroId);
  const voce = registro[indice];

  if (voce === undefined) {
    return fallimento(registro, {
      codice: "voce_non_trovata",
      vincolo: "voce_esistente",
      voceRegistroId,
    });
  }
  if (voce.annullataIl !== null) {
    return fallimento(registro, {
      codice: "voce_gia_annullata",
      vincolo: "voce_attiva",
      voceRegistroId,
    });
  }

  const voceAnnullata: VoceRegistro = { ...voce, annullataIl };
  const registroAnnullato = [...registro];
  registroAnnullato[indice] = voceAnnullata;
  return { ok: true, registro: registroAnnullato, voce: voceAnnullata };
}
