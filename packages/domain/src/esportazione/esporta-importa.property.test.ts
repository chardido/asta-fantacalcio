import type {
  ConfigurazioneAsta,
  MacroReparto,
  VoceRegistro,
  VoceRegistroEsportata,
  VoceRosa,
} from "@asta/contracts";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { derivaStato, type StatoSessione } from "../stato-asta/deriva-stato.js";
import { esporta, importa } from "./esporta-importa.js";

const REPARTI_CLASSIC = ["P", "D", "C", "A"] as const;

const MACRO_REPARTO_PER_REPARTO = {
  P: "POR",
  D: "DIF",
  C: "CEN",
  A: "ATT",
} as const satisfies Readonly<Record<(typeof REPARTI_CLASSIC)[number], MacroReparto>>;

const PESI_PREDEFINITI = {
  quotazione: 30,
  budgetReparto: 25,
  budgetTotale: 15,
  slotResidui: 10,
  statistiche: 20,
  audacia: 20,
} as const;

type ConfigurazioneClassic = Extract<
  ConfigurazioneAsta,
  { modalitaGioco: "classic" }
>;

interface ScenarioRoundTrip {
  readonly configurazione: ConfigurazioneClassic;
  readonly registro: readonly VoceRegistro[];
  readonly completo: boolean;
}

const configurazioneArbitrary: fc.Arbitrary<ConfigurazioneClassic> = fc
  .record({
    P: fc.integer({ min: 1, max: 6 }),
    D: fc.integer({ min: 1, max: 6 }),
    C: fc.integer({ min: 1, max: 6 }),
    A: fc.integer({ min: 1, max: 6 }),
    creditiIniziali: fc.integer({ min: 50, max: 100_000 }),
  })
  .map(({ P, D, C, A, creditiIniziali }) => ({
    nome: "Asta round-trip P12",
    tipoAsta: "chiamata",
    modalitaGioco: "classic",
    numeroPartecipanti: 8,
    creditiIniziali,
    modificatoreDifesa: false,
    composizioneRosa: { P, D, C, A },
    quoteReparto: { POR: 8, DIF: 20, CEN: 32, ATT: 40 },
    pesiValutazione: PESI_PREDEFINITI,
  }));

function conteggiRosa(
  configurazione: ConfigurazioneClassic,
  completo: boolean,
  semiConteggio: readonly number[],
): Readonly<Record<(typeof REPARTI_CLASSIC)[number], number>> {
  const conteggi = Object.fromEntries(
    REPARTI_CLASSIC.map((reparto, indice) => {
      const slot = configurazione.composizioneRosa[reparto] ?? 0;
      const seme = semiConteggio[indice] ?? 0;
      return [reparto, completo ? slot : seme % (slot + 1)];
    }),
  ) as Record<(typeof REPARTI_CLASSIC)[number], number>;

  if (!completo && REPARTI_CLASSIC.every((reparto) => conteggi[reparto] === configurazione.composizioneRosa[reparto])) {
    conteggi.P -= 1;
  }

  return conteggi;
}

function creaRegistro(
  configurazione: ConfigurazioneClassic,
  conteggi: Readonly<Record<(typeof REPARTI_CLASSIC)[number], number>>,
  semiPrezzo: readonly number[],
  assentiDaiDati: readonly boolean[],
): readonly VoceRegistro[] {
  const reparti = REPARTI_CLASSIC.flatMap((reparto) =>
    Array.from({ length: conteggi[reparto] }, () => reparto),
  );
  let budgetDisponibile = configurazione.creditiIniziali;

  return reparti.map((reparto, indice) => {
    const giocatoriRimanenti = reparti.length - indice - 1;
    const prezzoMassimo = budgetDisponibile - giocatoriRimanenti;
    const prezzoAcquisto = 1 + ((semiPrezzo[indice] ?? 0) % prezzoMassimo);
    budgetDisponibile -= prezzoAcquisto;
    const progressivo = String(indice + 1).padStart(12, "0");

    return {
      id: `voce-p12-${indice + 1}`,
      sessioneAstaId: "sessione-p12",
      ordinale: indice + 1,
      identificativoGiocatore: `giocatore-p12-${indice + 1}`,
      nomeGiocatore: `Giocatore P12 ${indice + 1}`,
      ruolo: reparto,
      squadra: `Squadra ${1 + (indice % 20)}`,
      repartoAssegnato: reparto,
      macroReparto: MACRO_REPARTO_PER_REPARTO[reparto],
      assegnatarioTipo: "utente",
      avversarioId: null,
      prezzoAcquisto,
      annullataIl: null,
      chiaveIdempotenza: `00000000-0000-4000-8000-${progressivo}`,
      giocatoreAssenteDatiCorrenti: assentiDaiDati[indice] ?? false,
    } satisfies VoceRegistro;
  });
}

function scenarioArbitrary(completo: boolean): fc.Arbitrary<ScenarioRoundTrip> {
  return configurazioneArbitrary.chain((configurazione) =>
    fc
      .tuple(
        fc.array(fc.nat(), {
          minLength: REPARTI_CLASSIC.length,
          maxLength: REPARTI_CLASSIC.length,
        }),
        fc.array(fc.nat(), { minLength: 24, maxLength: 24 }),
        fc.array(fc.boolean(), { minLength: 24, maxLength: 24 }),
      )
      .map(([semiConteggio, semiPrezzo, assentiDaiDati]) => {
        const conteggi = conteggiRosa(
          configurazione,
          completo,
          semiConteggio,
        );
        return {
          configurazione,
          registro: creaRegistro(
            configurazione,
            conteggi,
            semiPrezzo,
            assentiDaiDati,
          ),
          completo,
        };
      }),
  );
}

function voceEsportata(voce: VoceRegistro): VoceRegistroEsportata {
  if (voce.assegnatarioTipo === "utente") {
    return {
      ordinale: voce.ordinale,
      identificativoGiocatore: voce.identificativoGiocatore,
      nomeGiocatore: voce.nomeGiocatore,
      ruolo: voce.ruolo,
      squadra: voce.squadra,
      repartoAssegnato: voce.repartoAssegnato,
      macroReparto: voce.macroReparto,
      assegnatarioTipo: "utente",
      avversarioNome: null,
      prezzoAcquisto: voce.prezzoAcquisto,
      annullataIl: voce.annullataIl,
      giocatoreAssenteDatiCorrenti: voce.giocatoreAssenteDatiCorrenti,
    };
  }

  return {
    ordinale: voce.ordinale,
    identificativoGiocatore: voce.identificativoGiocatore,
    nomeGiocatore: voce.nomeGiocatore,
    ruolo: voce.ruolo,
    squadra: voce.squadra,
    repartoAssegnato: voce.repartoAssegnato,
    macroReparto: voce.macroReparto,
    assegnatarioTipo: "avversario",
    avversarioNome: voce.avversarioId,
    prezzoAcquisto: voce.prezzoAcquisto,
    annullataIl: voce.annullataIl,
    giocatoreAssenteDatiCorrenti: voce.giocatoreAssenteDatiCorrenti,
  };
}

function ricostruisciRegistro(
  registro: readonly VoceRegistroEsportata[],
): readonly VoceRegistro[] {
  return registro.map((voce) => {
    const progressivo = String(voce.ordinale).padStart(12, "0");
    const base = {
      id: `voce-importata-${voce.ordinale}`,
      sessioneAstaId: "sessione-importata-p12",
      ordinale: voce.ordinale,
      identificativoGiocatore: voce.identificativoGiocatore,
      nomeGiocatore: voce.nomeGiocatore,
      ruolo: voce.ruolo,
      squadra: voce.squadra,
      repartoAssegnato: voce.repartoAssegnato,
      macroReparto: voce.macroReparto,
      annullataIl: voce.annullataIl,
      chiaveIdempotenza: `10000000-0000-4000-8000-${progressivo}`,
      giocatoreAssenteDatiCorrenti: voce.giocatoreAssenteDatiCorrenti,
    } as const;

    return voce.assegnatarioTipo === "utente"
      ? {
          ...base,
          assegnatarioTipo: "utente" as const,
          avversarioId: null,
          prezzoAcquisto: voce.prezzoAcquisto,
        }
      : {
          ...base,
          assegnatarioTipo: "avversario" as const,
          avversarioId: voce.avversarioNome,
          prezzoAcquisto: voce.prezzoAcquisto,
        };
  });
}

function proiettaRosa(rosa: readonly VoceRosa[]) {
  return rosa
    .map((voce) => ({
      identificativoGiocatore: voce.identificativoGiocatore,
      nome: voce.nomeGiocatore,
      reparto: voce.repartoAssegnato,
      prezzoAcquisto: voce.prezzoAcquisto,
    }))
    .sort((sinistra, destra) =>
      sinistra.identificativoGiocatore.localeCompare(
        destra.identificativoGiocatore,
      ),
    );
}

function confrontaStato(
  originale: StatoSessione,
  importato: StatoSessione,
): void {
  expect(proiettaRosa(importato.rosa)).toEqual(proiettaRosa(originale.rosa));
  expect(importato.budgetResiduo).toBe(originale.budgetResiduo);
  expect(Object.fromEntries(importato.budgetRepartoResiduo)).toEqual(
    Object.fromEntries(originale.budgetRepartoResiduo),
  );
  expect(Object.fromEntries(importato.slotResidui)).toEqual(
    Object.fromEntries(originale.slotResidui),
  );
  expect(importato.slotResiduiTotali).toBe(originale.slotResiduiTotali);
}

function verificaRoundTrip(scenario: ScenarioRoundTrip): void {
  const statoOriginale = derivaStato(
    scenario.configurazione,
    scenario.registro,
  );
  expect(statoOriginale.slotResiduiTotali === 0).toBe(scenario.completo);

  const file = esporta({
    esportatoIl: "2026-08-01T10:30:00.000Z",
    configurazione: scenario.configurazione,
    rosa: statoOriginale.rosa,
    registro: [...scenario.registro].reverse().map(voceEsportata),
  });
  const risultato = importa(JSON.stringify(file), scenario.configurazione);

  expect(risultato.ok).toBe(true);
  if (!risultato.ok) return;

  expect(
    risultato.valore.registro.map((voce) => voce.ordinale),
  ).toEqual(scenario.registro.map((voce) => voce.ordinale));
  expect(risultato.valore.rosa.slice().sort((a, b) =>
    a.identificativoGiocatore.localeCompare(b.identificativoGiocatore),
  )).toEqual(proiettaRosa(statoOriginale.rosa));

  const statoImportato = derivaStato(
    scenario.configurazione,
    ricostruisciRegistro(risultato.valore.registro),
  );
  confrontaStato(statoOriginale, statoImportato);
}

describe("proprietà di esportazione e importazione", () => {
  // **Validates: Requirements 10.6**
  it("P12 preserva rose complete e parziali nel round-trip importa(esporta(rosa))", () => {
    fc.assert(
      fc.property(
        scenarioArbitrary(true),
        scenarioArbitrary(false),
        (rosaCompleta, rosaParziale) => {
          verificaRoundTrip(rosaCompleta);
          verificaRoundTrip(rosaParziale);
        },
      ),
    );
  });
});
