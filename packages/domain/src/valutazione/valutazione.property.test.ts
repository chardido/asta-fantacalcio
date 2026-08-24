import type {
  PesiValutazione,
  StatFantacalcio,
} from "@asta/contracts";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  indiceConvenienza,
  type IngressoIndiceConvenienza,
} from "./indice-convenienza.js";
import {
  PESI_PROFILO_AGGRESSIVO,
  PESI_PROFILO_CONSERVATIVO,
} from "./profili-strategia.js";
import {
  valuta,
  type IngressoValutazione,
} from "./valuta.js";

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

const pesiValutazioneArbitrary: fc.Arbitrary<PesiValutazione> = fc
  .record({
    quotazione: fc.integer({ min: 0, max: 100 }),
    budgetReparto: fc.integer({ min: 0, max: 100 }),
    budgetTotale: fc.integer({ min: 0, max: 100 }),
    slotResidui: fc.integer({ min: 0, max: 100 }),
    statistiche: fc.integer({ min: 0, max: 100 }),
    audacia: fc.integer({ min: 0, max: 100 }),
  })
  .filter((pesi) => Object.values(pesi).some((peso) => peso > 0));

const slotValutazioneArbitrary = fc
  .integer({ min: 0, max: 50 })
  .chain((slotResiduiTotali) =>
    fc
      .integer({
        min: 0,
        max: Math.min(25, slotResiduiTotali),
      })
      .map((slotResiduiReparto) => ({
        slotResiduiReparto,
        slotResiduiTotali,
      })),
  );

const ingressoValutazioneArbitrary: fc.Arbitrary<IngressoValutazione> =
  fc.record({
    budgetResiduo: fc.integer({ min: 0, max: 100_000 }),
    budgetRepartoResiduo: fc.integer({ min: -100_000, max: 100_000 }),
    slot: slotValutazioneArbitrary,
    quotazione: fc.integer({ min: 1, max: 999 }),
    statFantacalcio: statFantacalcioArbitrary,
    pesi: pesiValutazioneArbitrary,
  }).map(({ slot, ...ingresso }) => ({ ...ingresso, ...slot }));

const ingressoConBudgetDisponibileArbitrary: fc.Arbitrary<IngressoValutazione> =
  fc
    .integer({ min: 1, max: 100_000 })
    .chain((budgetResiduo) =>
      fc
        .integer({ min: 1, max: Math.min(50, budgetResiduo) })
        .chain((slotResiduiTotali) =>
          fc.record({
            budgetRepartoResiduo: fc.integer({
              min: -100_000,
              max: 100_000,
            }),
            slotResiduiReparto: fc.integer({
              min: 1,
              max: Math.min(25, slotResiduiTotali),
            }),
            quotazione: fc.integer({ min: 1, max: 999 }),
            statFantacalcio: statFantacalcioArbitrary,
            pesi: pesiValutazioneArbitrary,
          }).map((resto) => ({
            budgetResiduo,
            slotResiduiTotali,
            ...resto,
          })),
        ),
    );

const ingressoIndiceConvenienzaArbitrary: fc.Arbitrary<IngressoIndiceConvenienza> =
  fc
    .integer({ min: 0, max: 25 })
    .chain((slotResiduiReparto) =>
      fc.record({
        prezzoMassimoConsigliato:
          slotResiduiReparto === 0
            ? fc.constant(0)
            : fc.integer({ min: 1, max: 100_000 }),
        quotazione: fc.integer({ min: 1, max: 999 }),
        statFantacalcio: statFantacalcioArbitrary,
        budgetRepartoResiduo: fc.integer({
          min: -100_000,
          max: 100_000,
        }),
        pesi: pesiValutazioneArbitrary,
      }).map((ingresso) => ({
        slotResiduiReparto,
        ...ingresso,
      })),
    );

describe("proprietà del motore di valutazione", () => {
  // **Validates: Requirements 6.11**
  it("P6 produce lo stesso prezzo intero in 10 valutazioni consecutive", () => {
    fc.assert(
      fc.property(ingressoValutazioneArbitrary, (ingresso) => {
        const prezzi = Array.from(
          { length: 10 },
          () => valuta(ingresso).prezzoMassimoConsigliato,
        );

        expect(prezzi).toHaveLength(10);
        expect(prezzi.every((prezzo) => prezzo === prezzi[0])).toBe(true);
        expect(prezzi.every(Number.isInteger)).toBe(true);
      }),
    );
  });

  // **Validates: Requirements 6.3, 6.4**
  it("P7 mantiene il prezzo entro i tetti applicabili", () => {
    fc.assert(
      fc.property(ingressoConBudgetDisponibileArbitrary, (ingresso) => {
        const prezzo = valuta(ingresso).prezzoMassimoConsigliato;
        const riservaMinima = Math.max(
          0,
          ingresso.slotResiduiTotali - 1,
        );
        const capGlobale = ingresso.budgetResiduo - riservaMinima;
        const capReparto =
          ingresso.budgetRepartoResiduo -
          (ingresso.slotResiduiReparto - 1);

        expect(Number.isInteger(prezzo)).toBe(true);
        expect(prezzo).toBeGreaterThanOrEqual(1);
        expect(prezzo).toBeLessThanOrEqual(capGlobale);
        if (capReparto >= 1) {
          expect(prezzo).toBeLessThanOrEqual(capReparto);
        }
      }),
    );
  });

  // **Validates: Requirements 6.10**
  it("P8 il profilo aggressivo non produce un prezzo inferiore al conservativo", () => {
    fc.assert(
      fc.property(ingressoValutazioneArbitrary, (ingresso) => {
        const conservativo = valuta({
          ...ingresso,
          pesi: PESI_PROFILO_CONSERVATIVO,
        }).prezzoMassimoConsigliato;
        const aggressivo = valuta({
          ...ingresso,
          pesi: PESI_PROFILO_AGGRESSIVO,
        }).prezzoMassimoConsigliato;

        expect(aggressivo).toBeGreaterThanOrEqual(conservativo);
      }),
    );
  });

  // **Validates: Requirements 6.12**
  it("P9 una quotazione maggiore non riduce il prezzo a parità di statistiche", () => {
    fc.assert(
      fc.property(
        ingressoValutazioneArbitrary,
        fc.integer({ min: 1, max: 998 }),
        fc.nat(),
        (ingresso, quotazioneMinore, incrementoSeed) => {
          const quotazioneMaggiore =
            quotazioneMinore +
            1 +
            (incrementoSeed % (999 - quotazioneMinore));
          const prezzoMinore = valuta({
            ...ingresso,
            quotazione: quotazioneMinore,
          }).prezzoMassimoConsigliato;
          const prezzoMaggiore = valuta({
            ...ingresso,
            quotazione: quotazioneMaggiore,
          }).prezzoMassimoConsigliato;

          expect(quotazioneMaggiore).toBeGreaterThan(quotazioneMinore);
          expect(prezzoMaggiore).toBeGreaterThanOrEqual(prezzoMinore);
        },
      ),
    );
  });

  // **Validates: Requirements 13.12**
  it("P14 produce lo stesso indice intero in 10 valutazioni consecutive", () => {
    fc.assert(
      fc.property(ingressoIndiceConvenienzaArbitrary, (ingresso) => {
        const indici = Array.from(
          { length: 10 },
          () => indiceConvenienza(ingresso),
        );

        expect(indici).toHaveLength(10);
        expect(indici.every((indice) => indice === indici[0])).toBe(true);
        expect(indici.every(Number.isInteger)).toBe(true);
      }),
    );
  });

  // **Validates: Requirements 13.13**
  it("P15 mantiene sempre l'indice intero nell'intervallo da 0 a 100", () => {
    fc.assert(
      fc.property(ingressoIndiceConvenienzaArbitrary, (ingresso) => {
        const indice = indiceConvenienza(ingresso);

        expect(Number.isInteger(indice)).toBe(true);
        expect(indice).toBeGreaterThanOrEqual(0);
        expect(indice).toBeLessThanOrEqual(100);
      }),
    );
  });
});
