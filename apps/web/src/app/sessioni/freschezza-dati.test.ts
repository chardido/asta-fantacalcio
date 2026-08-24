import { describe, expect, it } from "vitest";

import { acquisizionePotenzialmenteNonAggiornata } from "./freschezza-dati";

// **Validates: Requirements 4.14**
describe("acquisizionePotenzialmenteNonAggiornata", () => {
  const ultimoSuccessoIl = "2026-08-01T05:00:00.000Z";

  it("non considera obsoleti i dati vecchi esattamente sette giorni", () => {
    expect(
      acquisizionePotenzialmenteNonAggiornata(
        ultimoSuccessoIl,
        Date.parse("2026-08-08T05:00:00.000Z"),
      ),
    ).toBe(false);
  });

  it("considera obsoleti i dati vecchi più di sette giorni", () => {
    expect(
      acquisizionePotenzialmenteNonAggiornata(
        ultimoSuccessoIl,
        Date.parse("2026-08-08T05:00:00.001Z"),
      ),
    ).toBe(true);
  });

  it("non segnala acquisizioni mai riuscite, date non valide o future", () => {
    const adesso = Date.parse("2026-08-08T05:00:00.000Z");

    expect(acquisizionePotenzialmenteNonAggiornata(null, adesso)).toBe(false);
    expect(acquisizionePotenzialmenteNonAggiornata("non-una-data", adesso)).toBe(false);
    expect(
      acquisizionePotenzialmenteNonAggiornata(
        "2026-08-09T05:00:00.000Z",
        adesso,
      ),
    ).toBe(false);
  });
});
