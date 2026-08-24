import {
  MACRO_REPARTI,
  PESI_VALUTAZIONE_PREDEFINITI,
  TIPI_ASTA,
  type MacroReparto,
  type PesiValutazione,
  type Reparto,
  type StatFantacalcio,
  type TipoAsta,
  type VoceRosa,
} from "@asta/contracts";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  indiceConvenienza,
  type IngressoIndiceConvenienza,
} from "../valutazione/indice-convenienza.js";
import {
  valuta,
  type IngressoValutazione,
} from "../valutazione/valuta.js";
import {
  valutaAvvisi,
  type IngressoAvvisi,
} from "./valuta-avvisi.js";

const REPARTO_PER_MACRO = {
  POR: "P",
  DIF: "D",
  CEN: "C",
  ATT: "A",
} as const satisfies Readonly<Record<MacroReparto, Reparto>>;

const squadreArbitrary = fc.constantFrom(
  "Atalanta",
  "Inter",
  "Juventus",
  "Milan",
  "Napoli",
);

const rosaArbitrary: fc.Arbitrary<readonly VoceRosa[]> = fc
  .array(
    fc.record({
      macroReparto: fc.constantFrom(...MACRO_REPARTI),
      squadra: squadreArbitrary,
      prezzoAcquisto: fc.integer({ min: 1, max: 100_000 }),
      giocatoreAssenteDatiCorrenti: fc.boolean(),
    }),
    { maxLength: 50 },
  )
  .map((giocatori) =>
    giocatori.map((giocatore, indice) => {
      const id = indice + 1;
      const reparto = REPARTO_PER_MACRO[giocatore.macroReparto];

      return {
        voceRegistroId: `voce-${id}`,
        identificativoGiocatore: `giocatore-${id}`,
        nomeGiocatore: `Giocatore ${id}`,
        ruolo: reparto,
        squadra: giocatore.squadra,
        repartoAssegnato: reparto,
        macroReparto: giocatore.macroReparto,
        prezzoAcquisto: giocatore.prezzoAcquisto,
        giocatoreAssenteDatiCorrenti:
          giocatore.giocatoreAssenteDatiCorrenti,
      };
    }),
  );

const ingressoAvvisiComuneArbitrary = fc
  .record({
    avvisiInformativiAttivi: fc.boolean(),
    macroReparto: fc.constantFrom(...MACRO_REPARTI),
    squadra: squadreArbitrary,
    quotazione: fc.integer({ min: 1, max: 999 }),
    creditiIniziali: fc.integer({ min: 1, max: 100_000 }),
    slotResiduiReparto: fc.integer({ min: 0, max: 25 }),
    budgetRepartoResiduo: fc.integer({ min: -100_000, max: 100_000 }),
    budgetResiduo: fc.integer({ min: 0, max: 100_000 }),
    riservaMinima: fc.integer({ min: 0, max: 49 }),
    modificatoreDifesa: fc.boolean(),
    rosa: rosaArbitrary,
    prezzoMassimoPersonale: fc.option(
      fc.integer({ min: 1, max: 100_000 }),
      { nil: null },
    ),
  })
  .map((ingresso) => ({
    ...ingresso,
    reparto: REPARTO_PER_MACRO[ingresso.macroReparto],
  }));

const ingressoAvvisiArbitrary: fc.Arbitrary<IngressoAvvisi> =
  ingressoAvvisiComuneArbitrary.chain((ingresso) =>
    fc.oneof(
      fc
        .integer({ min: 0, max: 100_000 })
        .map((prezzoMassimoConsigliato) => ({
          ...ingresso,
          giocatoreDisponibile: true as const,
          prezzoMassimoConsigliato,
        })),
      fc.constant({
        ...ingresso,
        giocatoreDisponibile: false as const,
        prezzoMassimoConsigliato: null,
      }),
    ),
  );

const valoreStatisticoArbitrary = fc.option(
  fc.integer({ min: 0, max: 10_000 }),
  { nil: null },
);
const conteggioStatisticoArbitrary = fc.option(
  fc.integer({ min: 0, max: 100 }),
  { nil: null },
);

const statFantacalcioArbitrary: fc.Arbitrary<StatFantacalcio | null> =
  fc.oneof(
    fc.constant(null),
    fc.record({
      mediaVotoMilli: valoreStatisticoArbitrary,
      fantamediaMilli: valoreStatisticoArbitrary,
      presenze: conteggioStatisticoArbitrary,
      gol: conteggioStatisticoArbitrary,
      assist: conteggioStatisticoArbitrary,
      ammonizioni: conteggioStatisticoArbitrary,
      espulsioni: conteggioStatisticoArbitrary,
      rigoriParati: conteggioStatisticoArbitrary,
      rigoriSbagliati: conteggioStatisticoArbitrary,
      autogol: conteggioStatisticoArbitrary,
      stagione: fc.constant("2025/2026"),
    }),
  );

const pesiValutazioneArbitrary: fc.Arbitrary<PesiValutazione> = fc.oneof(
  fc.constant(PESI_VALUTAZIONE_PREDEFINITI),
  fc
    .record({
      quotazione: fc.integer({ min: 0, max: 100 }),
      budgetReparto: fc.integer({ min: 0, max: 100 }),
      budgetTotale: fc.integer({ min: 0, max: 100 }),
      slotResidui: fc.integer({ min: 0, max: 100 }),
      statistiche: fc.integer({ min: 0, max: 100 }),
      audacia: fc.integer({ min: 0, max: 100 }),
    })
    .filter((pesi) => Object.values(pesi).some((peso) => peso > 0)),
);

interface ScenarioIntegrato {
  readonly valutazione: IngressoValutazione;
  readonly avvisi: Omit<
    IngressoAvvisi,
    | "budgetResiduo"
    | "budgetRepartoResiduo"
    | "slotResiduiReparto"
    | "quotazione"
    | "prezzoMassimoConsigliato"
    | "giocatoreDisponibile"
  >;
}

interface ScenarioIntegratoConTipoAsta extends ScenarioIntegrato {
  readonly tipoAsta: TipoAsta;
}

const scenarioIntegratoArbitrary: fc.Arbitrary<ScenarioIntegrato> = fc
  .integer({ min: 1, max: 100_000 })
  .chain((creditiIniziali) =>
    fc
      .integer({ min: 0, max: creditiIniziali })
      .chain((budgetResiduo) =>
        fc
          .integer({ min: 0, max: 50 })
          .chain((slotResiduiTotali) =>
            fc.record({
              budgetRepartoResiduo: fc.integer({
                min: -100_000,
                max: creditiIniziali,
              }),
              slotResiduiReparto: fc.integer({
                min: 0,
                max: Math.min(25, slotResiduiTotali),
              }),
              quotazione: fc.integer({ min: 1, max: 999 }),
              statFantacalcio: statFantacalcioArbitrary,
              pesi: pesiValutazioneArbitrary,
              avvisiInformativiAttivi: fc.boolean(),
              macroReparto: fc.constantFrom(...MACRO_REPARTI),
              squadra: squadreArbitrary,
              modificatoreDifesa: fc.boolean(),
              rosa: rosaArbitrary,
              prezzoMassimoPersonale: fc.option(
                fc.integer({ min: 1, max: creditiIniziali }),
                { nil: null },
              ),
            }).map((dati) => ({
              valutazione: {
                budgetResiduo,
                budgetRepartoResiduo: dati.budgetRepartoResiduo,
                slotResiduiReparto: dati.slotResiduiReparto,
                slotResiduiTotali,
                quotazione: dati.quotazione,
                statFantacalcio: dati.statFantacalcio,
                pesi: dati.pesi,
              },
              avvisi: {
                avvisiInformativiAttivi: dati.avvisiInformativiAttivi,
                reparto: REPARTO_PER_MACRO[dati.macroReparto],
                macroReparto: dati.macroReparto,
                squadra: dati.squadra,
                creditiIniziali,
                riservaMinima: Math.max(0, slotResiduiTotali - 1),
                modificatoreDifesa: dati.modificatoreDifesa,
                rosa: dati.rosa,
                prezzoMassimoPersonale: dati.prezzoMassimoPersonale,
              },
            })),
          ),
      ),
  );

interface EsitoScenarioIntegrato {
  readonly prezzoMassimoConsigliato: number;
  readonly indiceConvenienza: number;
  readonly avvisi: ReturnType<typeof valutaAvvisi>;
}

/**
 * Composizione minima usata dalla scheda giocatore. `tipoAsta` viene rimosso
 * al confine documentale: nessuno dei tre motori di dominio può osservarlo.
 */
function valutaScenarioIntegrato({
  tipoAsta: _tipoAsta,
  valutazione,
  avvisi,
}: ScenarioIntegratoConTipoAsta): EsitoScenarioIntegrato {
  const esitoValutazione = valuta(valutazione);
  const ingressoIndice: IngressoIndiceConvenienza = {
    prezzoMassimoConsigliato:
      esitoValutazione.prezzoMassimoConsigliato,
    quotazione: valutazione.quotazione,
    statFantacalcio: valutazione.statFantacalcio,
    slotResiduiReparto: valutazione.slotResiduiReparto,
    budgetRepartoResiduo: valutazione.budgetRepartoResiduo,
    pesi: valutazione.pesi,
  };
  const ingressoAvvisi: IngressoAvvisi = {
    ...avvisi,
    budgetResiduo: valutazione.budgetResiduo,
    budgetRepartoResiduo: valutazione.budgetRepartoResiduo,
    slotResiduiReparto: valutazione.slotResiduiReparto,
    quotazione: valutazione.quotazione,
    giocatoreDisponibile: true,
    prezzoMassimoConsigliato:
      esitoValutazione.prezzoMassimoConsigliato,
  };

  return {
    prezzoMassimoConsigliato:
      esitoValutazione.prezzoMassimoConsigliato,
    indiceConvenienza: indiceConvenienza(ingressoIndice),
    avvisi: valutaAvvisi(ingressoAvvisi),
  };
}

describe("proprietà del motore avvisi", () => {
  // **Validates: Requirements 9.10**
  it("P10 mantiene insieme, livelli, valori e ordine in valutazioni ripetute", () => {
    fc.assert(
      fc.property(ingressoAvvisiArbitrary, (ingresso) => {
        const valutazioni = Array.from(
          { length: 10 },
          () => valutaAvvisi(ingresso),
        );

        expect(valutazioni).toHaveLength(10);
        expect(valutazioni).toEqual(
          Array.from({ length: 10 }, () => valutazioni[0]),
        );
      }),
    );
  });

  // **Validates: Requirements 3.14**
  it("P17 ignora il tipo d'asta per prezzo, indice e avvisi su tutti i valori ammessi", () => {
    fc.assert(
      fc.property(scenarioIntegratoArbitrary, (scenario) => {
        const risultati = TIPI_ASTA.map((tipoAsta) => ({
          tipoAsta,
          esito: valutaScenarioIntegrato({ ...scenario, tipoAsta }),
        }));
        const esiti = risultati.map(({ esito }) => esito);
        const esitoRiferimento = esiti[0];

        expect(risultati.map(({ tipoAsta }) => tipoAsta)).toEqual([
          ...TIPI_ASTA,
        ]);
        expect(esitoRiferimento).toBeDefined();
        expect(esiti).toEqual(
          Array.from({ length: TIPI_ASTA.length }, () => esitoRiferimento),
        );
      }),
    );
  });
});
