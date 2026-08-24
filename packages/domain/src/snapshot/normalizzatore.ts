import {
  MACRO_REPARTI,
  MACRO_REPARTO_PER_RUOLO_MANTRA,
  REPARTI_CLASSIC,
  REPARTI_MANTRA,
  type MacroReparto,
  type RepartoClassic,
  type RepartoMantra,
  type RispostaListoneGrezza,
  type RispostaStatisticheGrezza,
  type StatFantacalcio,
  type StatTattiche,
  type StatTatticheGrezze,
  type VoceListoneGrezza,
  type VoceStatisticheGrezza,
} from "@asta/contracts";

const REPARTI_CLASSIC_AMMESSI: ReadonlySet<string> = new Set(REPARTI_CLASSIC);
const REPARTI_MANTRA_AMMESSI: ReadonlySet<string> = new Set(REPARTI_MANTRA);

const MACRO_REPARTO_PER_RUOLO_CLASSIC = {
  P: "POR",
  D: "DIF",
  C: "CEN",
  A: "ATT",
} as const satisfies Readonly<Record<RepartoClassic, MacroReparto>>;

export interface GiocatoreSnapshot {
  readonly identificativoGiocatore: string;
  readonly nome: string;
  readonly nomeRicerca: string;
  readonly squadra: string;
  readonly ruoloClassic: RepartoClassic | null;
  readonly ruoliMantra: readonly RepartoMantra[];
  readonly quotazione: number;
  readonly statFantacalcio: StatFantacalcio;
  readonly statTattiche: readonly StatTattiche[];
}

export interface SnapshotDati {
  readonly stagioneListone: string;
  readonly stagioneStatistiche: string;
  readonly nomeSorgenteListone: string;
  readonly nomeSorgenteStatistiche: string;
  readonly giocatori: readonly GiocatoreSnapshot[];
}

export type MotivoErroreValidazione =
  | "campo_obbligatorio_assente"
  | "quotazione_non_intera"
  | "quotazione_fuori_intervallo"
  | "ruolo_non_ammesso"
  | "nome_troppo_lungo"
  | "identificativo_duplicato";

export interface ErroreValidazione {
  readonly codice: "risposta_non_valida";
  readonly campo: string;
  readonly identificativoGiocatore: string | null;
  readonly motivo: MotivoErroreValidazione;
  readonly vincolo: string;
  readonly valoreRifiutato?: unknown;
}

export type RisultatoNormalizzazione =
  | { readonly ok: true; readonly valore: SnapshotDati }
  | { readonly ok: false; readonly errore: ErroreValidazione };

type FallimentoNormalizzazione = Extract<
  RisultatoNormalizzazione,
  { readonly ok: false }
>;

function errore(
  campo: string,
  identificativoGiocatore: string | null,
  motivo: MotivoErroreValidazione,
  vincolo: string,
  valoreRifiutato?: unknown,
): FallimentoNormalizzazione {
  return {
    ok: false,
    errore: {
      codice: "risposta_non_valida",
      campo,
      identificativoGiocatore,
      motivo,
      vincolo,
      ...(valoreRifiutato === undefined ? {} : { valoreRifiutato }),
    },
  };
}

/** Produce il testo usato dall'indice di ricerca senza alterare il nome mostrato. */
export function normalizzaNomeRicerca(nome: string): string {
  return nome.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

function chiaveIdentita(nome: string, squadra: string): string {
  const normalizzaParte = (valore: string): string =>
    normalizzaNomeRicerca(valore).trim().replace(/\s+/g, " ");
  return `${normalizzaParte(nome)}\u0000${normalizzaParte(squadra)}`;
}

function indicizzaStatistiche(
  risposta: RispostaStatisticheGrezza,
): ReadonlyMap<string, VoceStatisticheGrezza> {
  const indice = new Map<string, VoceStatisticheGrezza>();

  for (const voce of risposta.giocatori) {
    const chiave = chiaveIdentita(voce.nome, voce.squadra);
    if (!indice.has(chiave)) {
      indice.set(chiave, voce);
    }
  }

  return indice;
}

function normalizzaStatFantacalcio(
  statistiche: VoceStatisticheGrezza | undefined,
  stagione: string,
): StatFantacalcio {
  const grezze = statistiche?.statFantacalcio;
  return {
    mediaVotoMilli: grezze?.mediaVotoMilli ?? null,
    fantamediaMilli: grezze?.fantamediaMilli ?? null,
    presenze: grezze?.presenze ?? null,
    gol: grezze?.gol ?? null,
    assist: grezze?.assist ?? null,
    ammonizioni: grezze?.ammonizioni ?? null,
    espulsioni: grezze?.espulsioni ?? null,
    rigoriParati: grezze?.rigoriParati ?? null,
    rigoriSbagliati: grezze?.rigoriSbagliati ?? null,
    autogol: grezze?.autogol ?? null,
    stagione,
  };
}

function normalizzaStatTattica(
  macroReparto: MacroReparto,
  statistiche: VoceStatisticheGrezza | undefined,
  stagione: string,
): StatTattiche {
  const tattiche: StatTatticheGrezze | undefined = statistiche?.statTattiche;
  const fantacalcio = statistiche?.statFantacalcio;

  switch (macroReparto) {
    case "POR":
      return {
        macroReparto,
        parate: tattiche?.parate ?? null,
        golSubiti: tattiche?.golSubiti ?? null,
        cleanSheet: tattiche?.cleanSheet ?? null,
        rigoriParati: fantacalcio?.rigoriParati ?? null,
        stagione,
      };
    case "DIF":
      return {
        macroReparto,
        cleanSheetSquadra: tattiche?.cleanSheetSquadra ?? null,
        duelliDifensiviVinti: tattiche?.duelliDifensiviVinti ?? null,
        contrasti: tattiche?.contrasti ?? null,
        precisionePassaggiMilli: tattiche?.precisionePassaggiMilli ?? null,
        stagione,
      };
    case "CEN":
      return {
        macroReparto,
        assist: fantacalcio?.assist ?? null,
        passaggiChiave: tattiche?.passaggiChiave ?? null,
        precisionePassaggiMilli: tattiche?.precisionePassaggiMilli ?? null,
        tiri: tattiche?.tiri ?? null,
        stagione,
      };
    case "ATT":
      return {
        macroReparto,
        gol: fantacalcio?.gol ?? null,
        tiri: tattiche?.tiri ?? null,
        tiriNelloSpecchio: tattiche?.tiriNelloSpecchio ?? null,
        golAttesiMilli: tattiche?.golAttesiMilli ?? null,
        stagione,
      };
  }
}

function macroRepartiPertinenti(
  ruoloClassic: RepartoClassic | null,
  ruoliMantra: readonly RepartoMantra[],
): readonly MacroReparto[] {
  const presenti = new Set<MacroReparto>();
  if (ruoloClassic !== null) {
    presenti.add(MACRO_REPARTO_PER_RUOLO_CLASSIC[ruoloClassic]);
  }
  for (const ruolo of ruoliMantra) {
    presenti.add(MACRO_REPARTO_PER_RUOLO_MANTRA[ruolo]);
  }

  return MACRO_REPARTI.filter((macroReparto) => presenti.has(macroReparto));
}

interface VoceListoneValidata {
  readonly identificativoGiocatore: string;
  readonly nome: string;
  readonly squadra: string;
  readonly ruoloClassic: RepartoClassic | null;
  readonly ruoliMantra: readonly RepartoMantra[];
  readonly quotazione: number;
}

interface CampiBaseValidati {
  readonly identificativoGiocatore: string;
  readonly nome: string;
  readonly squadra: string;
  readonly quotazione: number;
}

interface RuoliValidati {
  readonly ruoloClassic: RepartoClassic | null;
  readonly ruoliMantra: readonly RepartoMantra[];
}

type EsitoValidazione<T> =
  | { readonly ok: true; readonly valore: T }
  | FallimentoNormalizzazione;

function validaCampiBase(
  voce: Partial<VoceListoneGrezza>,
): EsitoValidazione<CampiBaseValidati> {
  const identificativo =
    typeof voce.identificativoGiocatore === "string" &&
    voce.identificativoGiocatore.length > 0
      ? voce.identificativoGiocatore
      : null;

  if (identificativo === null) {
    return errore(
      "identificativoGiocatore",
      null,
      "campo_obbligatorio_assente",
      "stringa_non_vuota",
      voce.identificativoGiocatore,
    );
  }
  if (typeof voce.nome !== "string" || voce.nome.length === 0) {
    return errore(
      "nome",
      identificativo,
      "campo_obbligatorio_assente",
      "stringa_non_vuota",
      voce.nome,
    );
  }
  if (voce.nome.length > 100) {
    return errore(
      "nome",
      identificativo,
      "nome_troppo_lungo",
      "lunghezza_massima_100",
      voce.nome,
    );
  }
  if (typeof voce.squadra !== "string" || voce.squadra.length === 0) {
    return errore(
      "squadra",
      identificativo,
      "campo_obbligatorio_assente",
      "stringa_non_vuota",
      voce.squadra,
    );
  }
  if (typeof voce.quotazione !== "number") {
    return errore(
      "quotazione",
      identificativo,
      "campo_obbligatorio_assente",
      "intero_compreso_tra_1_e_999",
      voce.quotazione,
    );
  }
  if (!Number.isInteger(voce.quotazione)) {
    return errore(
      "quotazione",
      identificativo,
      "quotazione_non_intera",
      "intero_compreso_tra_1_e_999",
      voce.quotazione,
    );
  }
  if (voce.quotazione < 1 || voce.quotazione > 999) {
    return errore(
      "quotazione",
      identificativo,
      "quotazione_fuori_intervallo",
      "intero_compreso_tra_1_e_999",
      voce.quotazione,
    );
  }

  return {
    ok: true,
    valore: {
      identificativoGiocatore: identificativo,
      nome: voce.nome,
      squadra: voce.squadra,
      quotazione: voce.quotazione,
    },
  };
}

function validaRuoli(
  voce: Partial<VoceListoneGrezza>,
  identificativo: string,
): EsitoValidazione<RuoliValidati> {
  const ruoloClassicGrezzo = voce.ruoloClassic;
  if (
    ruoloClassicGrezzo !== undefined &&
    ruoloClassicGrezzo !== null &&
    (typeof ruoloClassicGrezzo !== "string" ||
      !REPARTI_CLASSIC_AMMESSI.has(ruoloClassicGrezzo))
  ) {
    return errore(
      "ruoloClassic",
      identificativo,
      "ruolo_non_ammesso",
      "uno_dei_ruoli_classic",
      ruoloClassicGrezzo,
    );
  }

  const ruoliMantraGrezzi = voce.ruoliMantra;
  if (ruoliMantraGrezzi !== undefined && !Array.isArray(ruoliMantraGrezzi)) {
    return errore(
      "ruoliMantra",
      identificativo,
      "ruolo_non_ammesso",
      "array_di_ruoli_mantra",
      ruoliMantraGrezzi,
    );
  }

  const ruoliMantra: RepartoMantra[] = [];
  for (const [indice, ruolo] of (ruoliMantraGrezzi ?? []).entries()) {
    if (typeof ruolo !== "string" || !REPARTI_MANTRA_AMMESSI.has(ruolo)) {
      return errore(
        `ruoliMantra[${indice}]`,
        identificativo,
        "ruolo_non_ammesso",
        "uno_dei_ruoli_mantra",
        ruolo,
      );
    }
    ruoliMantra.push(ruolo as RepartoMantra);
  }

  const ruoloClassic =
    ruoloClassicGrezzo === undefined || ruoloClassicGrezzo === null
      ? null
      : (ruoloClassicGrezzo as RepartoClassic);
  if (ruoloClassic === null && ruoliMantra.length === 0) {
    return errore(
      "ruolo",
      identificativo,
      "campo_obbligatorio_assente",
      "almeno_un_ruolo_classic_o_mantra",
    );
  }

  return { ok: true, valore: { ruoloClassic, ruoliMantra } };
}

function validaVoce(
  voce: Partial<VoceListoneGrezza>,
  identificativi: Set<string>,
): EsitoValidazione<VoceListoneValidata> {
  const campi = validaCampiBase(voce);
  if (!campi.ok) return campi;

  const ruoli = validaRuoli(voce, campi.valore.identificativoGiocatore);
  if (!ruoli.ok) return ruoli;

  const identificativo = campi.valore.identificativoGiocatore;
  if (identificativi.has(identificativo)) {
    return errore(
      "identificativoGiocatore",
      identificativo,
      "identificativo_duplicato",
      "univoco_nella_risposta",
      identificativo,
    );
  }

  identificativi.add(identificativo);
  return {
    ok: true,
    valore: { ...campi.valore, ...ruoli.valore },
  };
}

/**
 * Costruisce atomicamente uno snapshot dai DTO canonici degli adattatori.
 * In caso di una voce listone non valida non viene restituito alcuno snapshot.
 */
export function normalizzaDati(
  listone: RispostaListoneGrezza,
  statistiche: RispostaStatisticheGrezza,
): RisultatoNormalizzazione {
  const statistichePerIdentita = indicizzaStatistiche(statistiche);
  const identificativi = new Set<string>();
  const giocatori: GiocatoreSnapshot[] = [];

  for (const voceGrezza of listone.giocatori) {
    const validazione = validaVoce(
      voceGrezza as Partial<VoceListoneGrezza>,
      identificativi,
    );
    if (!validazione.ok) {
      return validazione;
    }

    const voce = validazione.valore;
    const statisticheGiocatore = statistichePerIdentita.get(
      chiaveIdentita(voce.nome, voce.squadra),
    );
    const macroReparti = macroRepartiPertinenti(
      voce.ruoloClassic,
      voce.ruoliMantra,
    );

    giocatori.push({
      identificativoGiocatore: voce.identificativoGiocatore,
      nome: voce.nome,
      nomeRicerca: normalizzaNomeRicerca(voce.nome),
      squadra: voce.squadra,
      ruoloClassic: voce.ruoloClassic,
      ruoliMantra: [...voce.ruoliMantra],
      quotazione: voce.quotazione,
      statFantacalcio: normalizzaStatFantacalcio(
        statisticheGiocatore,
        statistiche.stagione,
      ),
      statTattiche: macroReparti.map((macroReparto) =>
        normalizzaStatTattica(
          macroReparto,
          statisticheGiocatore,
          statistiche.stagione,
        ),
      ),
    });
  }

  return {
    ok: true,
    valore: {
      stagioneListone: listone.stagione,
      stagioneStatistiche: statistiche.stagione,
      nomeSorgenteListone: listone.nomeSorgente,
      nomeSorgenteStatistiche: statistiche.nomeSorgente,
      giocatori,
    },
  };
}
