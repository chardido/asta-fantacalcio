import { describe, expect, it } from "vitest";

import {
  DURATA_FINESTRA_TENTATIVI_ACCESSO_MS,
  LimitatoreTentativiAccesso,
} from "./limitatore-tentativi-accesso.js";

const INIZIO = new Date("2026-03-10T12:00:00.000Z");

describe("LimitatoreTentativiAccesso", () => {
  it("consente dieci tentativi per IP e rifiuta l'undicesimo", () => {
    const limitatore = new LimitatoreTentativiAccesso();

    const risultati = Array.from({ length: 11 }, (_, indice) =>
      limitatore.registraTentativo(
        "192.0.2.1",
        `utente-${indice}@example.com`,
        INIZIO,
      ),
    );

    expect(risultati).toEqual([...Array<boolean>(10).fill(true), false]);
  });

  it("consente cinque tentativi per email normalizzata e rifiuta il sesto", () => {
    const limitatore = new LimitatoreTentativiAccesso();

    const risultati = Array.from({ length: 6 }, (_, indice) =>
      limitatore.registraTentativo(
        `198.51.100.${indice + 1}`,
        "utente@example.com",
        INIZIO,
      ),
    );

    expect(risultati).toEqual([true, true, true, true, true, false]);
  });

  it("mantiene il limite fino all'ultimo millisecondo e resetta alla scadenza dei quindici minuti", () => {
    const limitatore = new LimitatoreTentativiAccesso();

    for (let indice = 0; indice < 5; indice += 1) {
      expect(
        limitatore.registraTentativo(
          `203.0.113.${indice + 1}`,
          "confine@example.com",
          INIZIO,
        ),
      ).toBe(true);
    }

    expect(
      limitatore.registraTentativo(
        "203.0.113.10",
        "confine@example.com",
        new Date(
          INIZIO.getTime() + DURATA_FINESTRA_TENTATIVI_ACCESSO_MS - 1,
        ),
      ),
    ).toBe(false);
    expect(
      limitatore.registraTentativo(
        "203.0.113.11",
        "confine@example.com",
        new Date(INIZIO.getTime() + DURATA_FINESTRA_TENTATIVI_ACCESSO_MS),
      ),
    ).toBe(true);
  });

  it("assegna atomicamente solo dieci permessi a tentativi concorrenti sullo stesso IP", async () => {
    const limitatore = new LimitatoreTentativiAccesso();

    const risultati = await Promise.all(
      Array.from({ length: 25 }, async (_, indice) =>
        limitatore.registraTentativo(
          "192.0.2.200",
          `concorrente-${indice}@example.com`,
          INIZIO,
        ),
      ),
    );

    expect(risultati.filter(Boolean)).toHaveLength(10);
    expect(risultati.slice(0, 10)).toEqual(Array<boolean>(10).fill(true));
    expect(risultati.slice(10)).toEqual(Array<boolean>(15).fill(false));
  });
});
