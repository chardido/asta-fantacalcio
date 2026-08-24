import { describe, expect, it, vi } from "vitest";

import {
  creaAdattatoreStatisticheApiFootballDaAmbiente,
  VARIABILE_AMBIENTE_CHIAVE_API_FOOTBALL,
} from "./configura-api-football.js";

function rispostaApi(response: readonly unknown[]): Response {
  return Response.json({
    errors: [],
    paging: { current: 1, total: 1 },
    response,
  });
}

// **Validates: Requirements 4.1, 4.4**
describe("configurazione API-Football del worker", () => {
  it("legge la chiave dal solo ambiente worker e la inoltra nell'header provider", async () => {
    const recuperaHttp = vi
      .fn()
      .mockResolvedValueOnce(rispostaApi([]));
    const adattatore = creaAdattatoreStatisticheApiFootballDaAmbiente(
      { [VARIABILE_AMBIENTE_CHIAVE_API_FOOTBALL]: "  chiave-worker  " },
      { recuperaHttp },
    );

    await expect(
      adattatore.recupera("2025/2026", new AbortController().signal),
    ).resolves.toEqual({
      nomeSorgente: "api-football",
      stagione: "2025/2026",
      giocatori: [],
    });
    expect(
      new Headers(recuperaHttp.mock.calls[0]?.[1]?.headers).get("x-apisports-key"),
    ).toBe("chiave-worker");
  });

  it("fallisce prima di creare l'adattatore quando la variabile e' assente o vuota", () => {
    expect(() => creaAdattatoreStatisticheApiFootballDaAmbiente({})).toThrow(
      VARIABILE_AMBIENTE_CHIAVE_API_FOOTBALL,
    );
    expect(() =>
      creaAdattatoreStatisticheApiFootballDaAmbiente({
        [VARIABILE_AMBIENTE_CHIAVE_API_FOOTBALL]: "   ",
      }),
    ).toThrow(VARIABILE_AMBIENTE_CHIAVE_API_FOOTBALL);
  });
});
