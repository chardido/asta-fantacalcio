import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  DURATA_FINESTRA_TENTATIVI_ACCESSO_MS,
  LimitatoreTentativiAccesso,
  MASSIMO_TENTATIVI_ACCESSO_PER_EMAIL,
  MASSIMO_TENTATIVI_ACCESSO_PER_IP,
} from "./limitatore-tentativi-accesso.js";

const ISTANTE_BASE = new Date("2026-03-10T12:00:00.000Z");
const CONFIGURAZIONE_FAST_CHECK = { numRuns: 100, seed: 20260310 } as const;

describe("proprieta del limitatore dei tentativi di accesso", () => {
  /**
   * Property 9.4: in ogni finestra, il numero di permessi non supera i limiti
   * e una finestra scaduta riparte dal primo tentativo.
   *
   * **Validates: Requirements 1.6**
   */
  it("rispetta i limiti IP ed email per qualunque numero di tentativi", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100 }),
        fc.integer({ min: 1, max: 100 }),
        (numeroTentativiIp, numeroTentativiEmail) => {
          const limitatoreIp = new LimitatoreTentativiAccesso();
          const esitiIp = Array.from({ length: numeroTentativiIp }, (_, indice) =>
            limitatoreIp.registraTentativo(
              "192.0.2.42",
              `ip-${indice}@example.com`,
              ISTANTE_BASE,
            ),
          );

          expect(esitiIp.filter(Boolean)).toHaveLength(
            Math.min(numeroTentativiIp, MASSIMO_TENTATIVI_ACCESSO_PER_IP),
          );
          expect(
            limitatoreIp.registraTentativo(
              "192.0.2.42",
              "nuova-finestra@example.com",
              new Date(
                ISTANTE_BASE.getTime() + DURATA_FINESTRA_TENTATIVI_ACCESSO_MS,
              ),
            ),
          ).toBe(true);

          const limitatoreEmail = new LimitatoreTentativiAccesso();
          const esitiEmail = Array.from(
            { length: numeroTentativiEmail },
            (_, indice) =>
              limitatoreEmail.registraTentativo(
                `198.51.100.${indice}`,
                "proprieta@example.com",
                ISTANTE_BASE,
              ),
          );

          expect(esitiEmail.filter(Boolean)).toHaveLength(
            Math.min(
              numeroTentativiEmail,
              MASSIMO_TENTATIVI_ACCESSO_PER_EMAIL,
            ),
          );
          expect(
            limitatoreEmail.registraTentativo(
              "203.0.113.1",
              "proprieta@example.com",
              new Date(
                ISTANTE_BASE.getTime() + DURATA_FINESTRA_TENTATIVI_ACCESSO_MS,
              ),
            ),
          ).toBe(true);
        },
      ),
      CONFIGURAZIONE_FAST_CHECK,
    );
  });
});
