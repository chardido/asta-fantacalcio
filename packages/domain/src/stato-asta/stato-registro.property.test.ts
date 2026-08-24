import type {
  ConfigurazioneAsta,
  Reparto,
  VoceRegistro,
} from "@asta/contracts";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { creditiResiduiStimati } from "./disponibilita.js";
import { derivaStato, type StatoSessione } from "./deriva-stato.js";
import { annulla, registra, type NuovoAcquistoUtente } from "./registro.js";

const PESI_PREDEFINITI = {
  quotazione: 30,
  budgetReparto: 25,
  budgetTotale: 15,
  slotResidui: 10,
  statistiche: 20,
  audacia: 20,
} as const;

const configurazioneClassicArbitrary: fc.Arbitrary<ConfigurazioneAsta> = fc
  .record({
    creditiIniziali: fc.integer({ min: 1, max: 100_000 }),
    P: fc.integer({ min: 1, max: 12 }),
    D: fc.integer({ min: 1, max: 12 }),
    C: fc.integer({ min: 1, max: 12 }),
    A: fc.integer({ min: 1, max: 12 }),
  })
  .map(({ creditiIniziali, P, D, C, A }) => ({
    nome: "Asta property Classic",
    tipoAsta: "chiamata",
    modalitaGioco: "classic",
    numeroPartecipanti: 8,
    creditiIniziali,
    modificatoreDifesa: false,
    composizioneRosa: { P, D, C, A },
    quoteReparto: { POR: 8, DIF: 20, CEN: 32, ATT: 40 },
    pesiValutazione: PESI_PREDEFINITI,
  }));

const configurazioneMantraArbitrary: fc.Arbitrary<ConfigurazioneAsta> = fc
  .record({
    creditiIniziali: fc.integer({ min: 1, max: 100_000 }),
    Por: fc.integer({ min: 1, max: 5 }),
    Dc: fc.integer({ min: 0, max: 4 }),
    Dd: fc.integer({ min: 0, max: 4 }),
    Ds: fc.integer({ min: 0, max: 4 }),
    E: fc.integer({ min: 0, max: 4 }),
    M: fc.integer({ min: 0, max: 4 }),
    C: fc.integer({ min: 0, max: 4 }),
    W: fc.integer({ min: 0, max: 4 }),
    T: fc.integer({ min: 0, max: 4 }),
    A: fc.integer({ min: 0, max: 4 }),
    Pc: fc.integer({ min: 0, max: 4 }),
  })
  .filter(
    ({ Por, Dc, Dd, Ds, E, M, C, W, T, A, Pc }) =>
      Por + Dc + Dd + Ds + E + M + C + W + T + A + Pc >= 4,
  )
  .map(
    ({ creditiIniziali, Por, Dc, Dd, Ds, E, M, C, W, T, A, Pc }) => ({
      nome: "Asta property Mantra",
      tipoAsta: "random",
      modalitaGioco: "mantra",
      numeroPartecipanti: 10,
      creditiIniziali,
      modificatoreDifesa: true,
      composizioneRosa: { Por, Dc, Dd, Ds, E, M, C, W, T, A, Pc },
      quoteReparto: { POR: 8, DIF: 20, CEN: 32, ATT: 40 },
      pesiValutazione: PESI_PREDEFINITI,
    }),
  );

const configurazioneArbitrary = fc.oneof(
  configurazioneClassicArbitrary,
  configurazioneMantraArbitrary,
);

interface TentativoAcquisto {
  readonly reparto: Reparto;
  readonly prezzoSeed: number;
  readonly assenteDaiDati: boolean;
}

interface ScenarioRegistro {
  readonly configurazione: ConfigurazioneAsta;
  readonly tentativi: readonly TentativoAcquisto[];
}

const scenarioRegistroArbitrary: fc.Arbitrary<ScenarioRegistro> =
  configurazioneArbitrary.chain((configurazione) => {
    const reparti = Object.keys(configurazione.composizioneRosa) as Reparto[];

    return fc
      .array(
        fc.record({
          reparto: fc.constantFrom(...reparti),
          prezzoSeed: fc.nat(),
          assenteDaiDati: fc.boolean(),
        }),
        { minLength: 1, maxLength: 40 },
      )
      .map((tentativi) => ({ configurazione, tentativi }));
  });

interface TransizioneRaggiungibile {
  readonly statoPrima: StatoSessione;
  readonly statoDopo: StatoSessione;
  readonly registroDopo: readonly VoceRegistro[];
  readonly voceRegistrata: VoceRegistro;
}

function creaAcquisto(
  tentativo: TentativoAcquisto,
  indice: number,
  prezzoAcquisto: number,
): NuovoAcquistoUtente {
  const progressivo = String(indice + 1).padStart(12, "0");

  return {
    id: `voce-${indice + 1}`,
    sessioneAstaId: "sessione-property",
    ordinale: indice + 1,
    identificativoGiocatore: `giocatore-${indice + 1}`,
    nomeGiocatore: `Giocatore ${indice + 1}`,
    ruolo: tentativo.reparto,
    ruoliAmmessi: [tentativo.reparto],
    squadra: "Squadra property",
    repartoAssegnato: tentativo.reparto,
    prezzoAcquisto,
    chiaveIdempotenza: `00000000-0000-4000-8000-${progressivo}`,
    giocatoreAssenteDatiCorrenti: tentativo.assenteDaiDati,
  };
}

function costruisciTransizioniRaggiungibili(
  scenario: ScenarioRegistro,
): readonly TransizioneRaggiungibile[] {
  let registro: readonly VoceRegistro[] = [];
  const transizioni: TransizioneRaggiungibile[] = [];

  for (const [indice, tentativo] of scenario.tentativi.entries()) {
    const statoPrima = derivaStato(scenario.configurazione, registro);
    const slotResidui = statoPrima.slotResidui.get(tentativo.reparto) ?? 0;

    if (slotResidui <= 0 || statoPrima.budgetResiduo <= 0) {
      continue;
    }

    const prezzoAcquisto =
      1 + (tentativo.prezzoSeed % statoPrima.budgetResiduo);
    const esito = registra(
      scenario.configurazione,
      registro,
      creaAcquisto(tentativo, indice, prezzoAcquisto),
    );

    if (!esito.ok) {
      throw new Error(
        `Il generatore ha prodotto una registrazione non valida: ${esito.errore.codice}`,
      );
    }

    registro = esito.registro;
    transizioni.push({
      statoPrima,
      statoDopo: derivaStato(scenario.configurazione, registro),
      registroDopo: registro,
      voceRegistrata: esito.voce,
    });
  }

  return transizioni;
}

function statiRaggiungibili(
  scenario: ScenarioRegistro,
): readonly StatoSessione[] {
  return [
    derivaStato(scenario.configurazione, []),
    ...costruisciTransizioniRaggiungibili(scenario).map(
      (transizione) => transizione.statoDopo,
    ),
  ];
}

function creaVoceAvversario(
  indice: number,
  avversarioId: string | null,
  prezzoAcquisto: number | null,
  annullataIl: string | null = null,
): VoceRegistro {
  const progressivo = String(indice + 1).padStart(12, "0");

  return {
    id: `voce-avversario-${indice + 1}`,
    sessioneAstaId: "sessione-property",
    ordinale: indice + 1,
    identificativoGiocatore: `giocatore-avversario-${indice + 1}`,
    nomeGiocatore: `Giocatore avversario ${indice + 1}`,
    ruolo: "D",
    squadra: "Squadra property",
    repartoAssegnato: "D",
    macroReparto: "DIF",
    assegnatarioTipo: "avversario",
    avversarioId,
    prezzoAcquisto,
    annullataIl,
    chiaveIdempotenza: `10000000-0000-4000-8000-${progressivo}`,
    giocatoreAssenteDatiCorrenti: false,
  };
}

const scenarioAvversarioArbitrary = fc
  .integer({ min: 1, max: 100_000 })
  .chain((creditiIniziali) =>
    fc
      .integer({ min: 1, max: Math.min(20, creditiIniziali) })
      .chain((numeroPrezzi) =>
        fc
          .array(fc.nat(), {
            minLength: numeroPrezzi,
            maxLength: numeroPrezzi,
          })
          .map((semiPrezzo) => {
            let creditiDisponibili = creditiIniziali;
            const prezzi = semiPrezzo.map((seme, indice) => {
              const prezziAncoraDaGenerare = numeroPrezzi - indice - 1;
              const massimo = creditiDisponibili - prezziAncoraDaGenerare;
              const prezzo = 1 + (seme % massimo);
              creditiDisponibili -= prezzo;
              return prezzo;
            });

            return { creditiIniziali, prezzi };
          }),
      ),
  );

describe("proprietà di stato e registro", () => {
  // **Validates: Requirements 7.9**
  it("P3 conserva la somma fra prezzi della rosa e budget residuo", () => {
    fc.assert(
      fc.property(scenarioRegistroArbitrary, (scenario) => {
        for (const stato of statiRaggiungibili(scenario)) {
          const totalePrezzi = stato.rosa.reduce(
            (totale, voce) => totale + voce.prezzoAcquisto,
            0,
          );

          expect(totalePrezzi + stato.budgetResiduo).toBe(
            scenario.configurazione.creditiIniziali,
          );
        }
      }),
    );
  });

  // **Validates: Requirements 7.10**
  it("P4 non supera mai gli slot previsti in alcun reparto", () => {
    fc.assert(
      fc.property(scenarioRegistroArbitrary, (scenario) => {
        for (const stato of statiRaggiungibili(scenario)) {
          for (const [reparto, slotPrevisti] of Object.entries(
            scenario.configurazione.composizioneRosa,
          )) {
            const giocatoriNelReparto = stato.rosa.filter(
              (voce) => voce.repartoAssegnato === reparto,
            ).length;

            expect(giocatoriNelReparto).toBeLessThanOrEqual(slotPrevisti);
            expect(stato.slotResidui.get(reparto as Reparto)).toBe(
              slotPrevisti - giocatoriNelReparto,
            );
          }
        }
      }),
    );
  });

  // **Validates: Requirements 7.8**
  it("P5 annullare una registrazione ripristina lo stato precedente", () => {
    fc.assert(
      fc.property(scenarioRegistroArbitrary, (scenario) => {
        const transizioni = costruisciTransizioniRaggiungibili(scenario);
        expect(transizioni.length).toBeGreaterThan(0);

        for (const transizione of transizioni) {
          const esito = annulla(
            transizione.registroDopo,
            transizione.voceRegistrata.id,
            "2026-01-01T00:00:00.000Z",
          );

          expect(esito.ok).toBe(true);
          if (!esito.ok) {
            return;
          }

          expect(derivaStato(scenario.configurazione, esito.registro)).toEqual(
            transizione.statoPrima,
          );
        }
      }),
    );
  });

  // **Validates: Requirements 8.15**
  it("P11 conserva la somma fra prezzi annotati e crediti residui stimati", () => {
    fc.assert(
      fc.property(
        scenarioAvversarioArbitrary,
        ({ creditiIniziali, prezzi }) => {
          const avversarioId = "avversario-property";
          const vociAttive = prezzi.map((prezzo, indice) =>
            creaVoceAvversario(indice, avversarioId, prezzo),
          );
          const registro: readonly VoceRegistro[] = [
            ...vociAttive,
            creaVoceAvversario(prezzi.length, avversarioId, null),
            creaVoceAvversario(
              prezzi.length + 1,
              avversarioId,
              1,
              "2026-01-01T00:00:00.000Z",
            ),
            creaVoceAvversario(prezzi.length + 2, "altro-avversario", 1),
            creaVoceAvversario(prezzi.length + 3, null, 1),
          ];
          const totalePrezziAnnotati = prezzi.reduce(
            (totale, prezzo) => totale + prezzo,
            0,
          );

          expect(
            totalePrezziAnnotati +
              creditiResiduiStimati(
                creditiIniziali,
                registro,
                avversarioId,
              ),
          ).toBe(creditiIniziali);
        },
      ),
    );
  });
});
