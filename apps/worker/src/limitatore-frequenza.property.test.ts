import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  BACKOFF_INIZIALE_MS,
  BACKOFF_MASSIMO_MS,
  calcolaAttesaBackoffMs,
  calcolaBudgetToken,
} from "./limitatore-frequenza.js";

describe("proprieta del LimitatoreFrequenza", () => {
  it("mantiene sempre il budget nel dominio 0..capacita", () => {
    // **Validates: Requirements 4.7**
    fc.assert(
      fc.property(
        fc.integer({ min: -1_000, max: 100_000 }),
        fc.integer({ min: 1, max: 1_000 }),
        fc.integer({ min: 1, max: 86_400_000 }),
        fc.integer({ min: 0, max: 604_800_000 }),
        (budget, capacita, finestraMs, trascorsoMs) => {
          const base = new Date("2026-01-01T00:00:00.000Z");
          const risultato = calcolaBudgetToken(
            budget,
            base,
            new Date(base.getTime() + trascorsoMs),
            { richiesteMassime: capacita, finestraMs },
          );
          expect(Number.isInteger(risultato)).toBe(true);
          expect(risultato).toBeGreaterThanOrEqual(0);
          expect(risultato).toBeLessThanOrEqual(capacita);
        },
      ),
      { seed: 11_004, numRuns: 200 },
    );
  });

  it("raddoppia monotonicamente il backoff e lo limita a 3600 secondi", () => {
    // **Validates: Requirements 4.8**
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 100 }), (numeroSegnalazioni) => {
        let precedente: number | null = null;
        let attuale = 0;
        for (let indice = 0; indice < numeroSegnalazioni; indice += 1) {
          const successivo = calcolaAttesaBackoffMs(precedente);
          expect(successivo).toBeGreaterThanOrEqual(BACKOFF_INIZIALE_MS);
          expect(successivo).toBeGreaterThanOrEqual(attuale);
          expect(successivo).toBeLessThanOrEqual(BACKOFF_MASSIMO_MS);
          precedente = successivo;
          attuale = successivo;
        }
      }),
      { seed: 11_004, numRuns: 100 },
    );
  });
});
