import {
  PESI_VALUTAZIONE_PREDEFINITI,
  type ConfigurazioneAsta,
  type StatFantacalcio,
} from "@asta/contracts";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import type { VoceDashboardSnapshot } from "../../server/snapshot/servizio-consultazione-snapshot";
import {
  creaSezioniDashboard,
  type FiltriDashboard,
  type StatoDashboardAsta,
} from "./dashboard-asta";

const SEED_PROPRIETA = 424242;
const ITERAZIONI_PROPRIETA = 100;

const configurazione: ConfigurazioneAsta = {
  nome: "Asta property dashboard",
  tipoAsta: "chiamata",
  modalitaGioco: "classic",
  numeroPartecipanti: 8,
  creditiIniziali: 1_000,
  modificatoreDifesa: false,
  composizioneRosa: { P: 3, D: 8, C: 8, A: 6 },
  quoteReparto: { POR: 8, DIF: 20, CEN: 32, ATT: 40 },
  pesiValutazione: { ...PESI_VALUTAZIONE_PREDEFINITI },
};

const stato: StatoDashboardAsta = {
  budgetResiduo: 800,
  budgetRepartoResiduo: { POR: 80, DIF: 200, CEN: 280, ATT: 240 },
  slotResidui: { P: 3, D: 8, C: 8, A: 6 },
  slotResiduiTotali: 25,
  riservaMinima: 24,
  rosa: [],
  identificativiNonDisponibili: [],
};

const filtri: FiltriDashboard = {
  reparto: "A",
  squadre: [],
  quotazione: [1, 999],
  includiNonDisponibili: false,
};

const valoreMilliArbitrary = fc.option(
  fc.integer({ min: 0, max: 10_000 }),
  { nil: null },
);
const conteggioArbitrary = fc.option(fc.integer({ min: 0, max: 100 }), {
  nil: null,
});

interface SemeGiocatoreDashboard {
  readonly nome: string;
  readonly squadra: string;
  readonly quotazione: number;
  readonly mediaVotoMilli: number | null;
  readonly fantamediaMilli: number | null;
  readonly presenze: number | null;
}

const giocatoreArbitrary: fc.Arbitrary<SemeGiocatoreDashboard> = fc.record({
  nome: fc.stringMatching(/^[A-Za-z]{1,12}$/u),
  squadra: fc.constantFrom("Atalanta", "Inter", "Juventus", "Milan", "Napoli"),
  quotazione: fc.integer({ min: 1, max: 999 }),
  mediaVotoMilli: valoreMilliArbitrary,
  fantamediaMilli: valoreMilliArbitrary,
  presenze: conteggioArbitrary,
});

function statistiche(seme: SemeGiocatoreDashboard): StatFantacalcio {
  return {
    mediaVotoMilli: seme.mediaVotoMilli,
    fantamediaMilli: seme.fantamediaMilli,
    presenze: seme.presenze,
    gol: null,
    assist: null,
    ammonizioni: null,
    espulsioni: null,
    rigoriParati: null,
    rigoriSbagliati: null,
    autogol: null,
    stagione: "2025/2026",
  };
}

describe("proprietà dell'ordinamento dashboard", () => {
  // **Validates: Requirements 13.14**
  it("P16 ordina ogni coppia consecutiva per indice di convenienza decrescente", () => {
    fc.assert(
      fc.property(
        fc.array(giocatoreArbitrary, { minLength: 1, maxLength: 40 }),
        (semi) => {
          const giocatori: readonly VoceDashboardSnapshot[] = semi.map(
            (seme, indice) => ({
              id: `giocatore-p16-${indice}`,
              nome: `${seme.nome} ${String(indice).padStart(2, "0")}`,
              squadra: seme.squadra,
              ruoli: ["A"],
              quotazione: seme.quotazione,
              statFantacalcio: statistiche(seme),
            }),
          );
          const [sezione] = creaSezioniDashboard(
            configurazione,
            stato,
            giocatori,
            filtri,
          );

          expect(sezione).toBeDefined();
          expect(sezione?.voci.length).toBeGreaterThanOrEqual(1);
          expect(sezione?.voci.length).toBeLessThanOrEqual(10);

          for (let indice = 1; indice < (sezione?.voci.length ?? 0); indice += 1) {
            const precedente = sezione?.voci[indice - 1]?.indice;
            const successivo = sezione?.voci[indice]?.indice;

            expect(precedente).not.toBeNull();
            expect(successivo).not.toBeNull();
            expect(precedente ?? -1).toBeGreaterThanOrEqual(successivo ?? -1);
          }
        },
      ),
      { seed: SEED_PROPRIETA, numRuns: ITERAZIONI_PROPRIETA },
    );
  });
});
