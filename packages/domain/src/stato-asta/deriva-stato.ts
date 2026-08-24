import type {
  ConfigurazioneAsta,
  MacroReparto,
  Reparto,
  VoceRegistro,
  VoceRosa,
} from "@asta/contracts";

const MACRO_REPARTI = ["POR", "DIF", "CEN", "ATT"] as const;

const MACRO_REPARTO_PER_REPARTO = {
  P: "POR",
  D: "DIF",
  C: "CEN",
  A: "ATT",
  Por: "POR",
  Dc: "DIF",
  Dd: "DIF",
  Ds: "DIF",
  E: "CEN",
  M: "CEN",
  W: "CEN",
  T: "CEN",
  Pc: "ATT",
} as const satisfies Readonly<Record<Reparto, MacroReparto>>;

export interface StatoSessione {
  readonly creditiIniziali: number;
  readonly budgetResiduo: number;
  readonly budgetRepartoResiduo: ReadonlyMap<MacroReparto, number>;
  readonly slotResidui: ReadonlyMap<Reparto, number>;
  readonly slotResiduiTotali: number;
  readonly riservaMinima: number;
  readonly rosa: readonly VoceRosa[];
}

function derivaMacroReparto(reparto: Reparto): MacroReparto {
  return MACRO_REPARTO_PER_REPARTO[reparto];
}

function calcolaBudgetPianificato(
  creditiIniziali: number,
  quotaPercentuale: number,
): number {
  return Math.trunc((creditiIniziali * quotaPercentuale) / 100);
}

/**
 * Produce l'intero stato corrente dell'asta a partire dalle sole sorgenti
 * persistite: configurazione e registro acquisti.
 */
export function derivaStato(
  configurazione: ConfigurazioneAsta,
  registro: readonly VoceRegistro[],
): StatoSessione {
  const budgetRepartoResiduo = new Map<MacroReparto, number>(
    MACRO_REPARTI.map((macroReparto) => [
      macroReparto,
      calcolaBudgetPianificato(
        configurazione.creditiIniziali,
        configurazione.quoteReparto[macroReparto],
      ),
    ]),
  );

  const slotResidui = new Map<Reparto, number>(
    Object.entries(configurazione.composizioneRosa).map(([reparto, slot]) => [
      reparto as Reparto,
      slot,
    ]),
  );

  let budgetResiduo = configurazione.creditiIniziali;
  const rosa: VoceRosa[] = [];

  for (const voce of registro) {
    if (voce.annullataIl !== null || voce.assegnatarioTipo !== "utente") {
      continue;
    }

    const macroReparto = derivaMacroReparto(voce.repartoAssegnato);

    budgetResiduo -= voce.prezzoAcquisto;
    budgetRepartoResiduo.set(
      macroReparto,
      (budgetRepartoResiduo.get(macroReparto) ?? 0) - voce.prezzoAcquisto,
    );
    slotResidui.set(
      voce.repartoAssegnato,
      (slotResidui.get(voce.repartoAssegnato) ?? 0) - 1,
    );

    rosa.push({
      voceRegistroId: voce.id,
      identificativoGiocatore: voce.identificativoGiocatore,
      nomeGiocatore: voce.nomeGiocatore,
      ruolo: voce.ruolo,
      squadra: voce.squadra,
      repartoAssegnato: voce.repartoAssegnato,
      macroReparto,
      prezzoAcquisto: voce.prezzoAcquisto,
      giocatoreAssenteDatiCorrenti: voce.giocatoreAssenteDatiCorrenti,
    });
  }

  const slotResiduiTotali = [...slotResidui.values()].reduce(
    (totale, slot) => totale + slot,
    0,
  );

  return {
    creditiIniziali: configurazione.creditiIniziali,
    budgetResiduo,
    budgetRepartoResiduo,
    slotResidui,
    slotResiduiTotali,
    riservaMinima: Math.max(0, slotResiduiTotali - 1),
    rosa,
  };
}
