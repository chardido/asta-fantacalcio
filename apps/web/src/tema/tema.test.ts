import { describe, expect, it } from "vitest";

import { DIMENSIONE_INTERATTIVA_MINIMA, tema } from "./tema";

function proprietaPredefinite(nomeComponente: string): Record<string, unknown> {
  const proprieta = tema.components?.[nomeComponente]?.defaultProps;

  if (!proprieta) {
    throw new Error(`Configurazione mancante per ${nomeComponente}`);
  }

  return proprieta as Record<string, unknown>;
}

describe("tema Mantine", () => {
  it("imposta target interattivi di almeno 44x44 pixel CSS", () => {
    expect(proprietaPredefinite("Button")).toMatchObject({
      h: DIMENSIONE_INTERATTIVA_MINIMA,
      miw: DIMENSIONE_INTERATTIVA_MINIMA,
    });
    expect(proprietaPredefinite("ActionIcon")).toMatchObject({
      size: DIMENSIONE_INTERATTIVA_MINIMA,
    });

    for (const nomeComponente of ["TextInput", "NumberInput", "Select"]) {
      expect(proprietaPredefinite(nomeComponente)).toMatchObject({
        size: "lg",
        styles: {
          input: {
            minHeight: DIMENSIONE_INTERATTIVA_MINIMA,
            minWidth: DIMENSIONE_INTERATTIVA_MINIMA,
          },
        },
      });
    }
  });

  it("impedisce globalmente i valori decimali nei campi numerici", () => {
    expect(proprietaPredefinite("NumberInput")).toMatchObject({
      allowDecimal: false,
    });
  });
});
