import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  accessoSchema,
  EMAIL_LUNGHEZZA_MASSIMA,
  PASSWORD_LUNGHEZZA_MASSIMA,
  PASSWORD_LUNGHEZZA_MINIMA,
  registrazioneSchema,
} from "./autenticazione.js";

// **Validates: Requirements 1.1, 1.3, 1.4**
describe("contratti di autenticazione", () => {
  it("accetta i confini inclusivi della password e un indirizzo valido", () => {
    for (const lunghezza of [
      PASSWORD_LUNGHEZZA_MINIMA,
      PASSWORD_LUNGHEZZA_MASSIMA,
    ]) {
      expect(
        registrazioneSchema.safeParse({
          email: "allenatore@example.com",
          password: "x".repeat(lunghezza),
        }).success,
      ).toBe(true);
    }
  });

  it("rifiuta password appena fuori dai confini ed email senza dominio", () => {
    expect(
      registrazioneSchema.safeParse({
        email: "allenatore@example.com",
        password: "x".repeat(PASSWORD_LUNGHEZZA_MINIMA - 1),
      }).success,
    ).toBe(false);
    expect(
      registrazioneSchema.safeParse({
        email: "allenatore@example.com",
        password: "x".repeat(PASSWORD_LUNGHEZZA_MASSIMA + 1),
      }).success,
    ).toBe(false);
    expect(
      registrazioneSchema.safeParse({
        email: "allenatore@",
        password: "password-valida",
      }).success,
    ).toBe(false);
  });

  it("mantiene il login indistinguibile limitandosi a richiedere valori presenti", () => {
    expect(
      accessoSchema.safeParse({ email: "utente", password: "errata" }).success,
    ).toBe(true);
    expect(accessoSchema.safeParse({ email: "", password: "" }).success).toBe(
      false,
    );
  });

  it("per ogni lunghezza ammessa accetta la password, fuori intervallo la rifiuta", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 140 }), (lunghezza) => {
        const esito = registrazioneSchema.safeParse({
          email: "utente@example.com",
          password: "p".repeat(lunghezza),
        });
        expect(esito.success).toBe(
          lunghezza >= PASSWORD_LUNGHEZZA_MINIMA &&
            lunghezza <= PASSWORD_LUNGHEZZA_MASSIMA,
        );
      }),
    );
  });

  it("rifiuta ogni indirizzo oltre la lunghezza massima", () => {
    const email = `${"a".repeat(EMAIL_LUNGHEZZA_MASSIMA)}@example.com`;
    expect(
      registrazioneSchema.safeParse({ email, password: "password-valida" })
        .success,
    ).toBe(false);
  });
});
