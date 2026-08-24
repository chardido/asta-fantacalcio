import type { VoceRegistro } from "@asta/contracts";
import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";

import {
  creaOperazioneCodaLocale,
  type OperazioneCodaLocale,
} from "./coda-locale-store.js";
import {
  INTERVALLI_REINVIO_MS,
  MASSIMO_TENTATIVI_REINVIO,
  MESSAGGIO_OPERAZIONE_NON_INVIATA,
  reinviaCodaLocale,
  type StoreCodaPerReinvio,
} from "./reinvio-coda-locale.js";

const SESSIONE = "00000000-0000-4000-8000-000000000001";

function operazione(): OperazioneCodaLocale {
  return creaOperazioneCodaLocale(
    {
      chiaveIdempotenza: "00000000-0000-4000-8000-000000000002",
      sessioneAstaId: SESSIONE,
      tipo: "registra_acquisto",
      dati: {
        identificativoGiocatore: "player-1",
        prezzoAcquisto: 25,
        repartoAssegnato: "A",
      },
    },
    1_000,
  );
}

function creaStoreMemoria(iniziale: OperazioneCodaLocale): {
  readonly store: StoreCodaPerReinvio;
  readonly leggi: () => readonly OperazioneCodaLocale[];
  readonly eventi: string[];
} {
  let operazioni: readonly OperazioneCodaLocale[] = [iniziale];
  const eventi: string[] = [];
  const store: StoreCodaPerReinvio = {
    leggiOperazioni: () => operazioni,
    aggiorna: async (chiave, aggiornamento) => {
      eventi.push(`aggiorna:${String(aggiornamento.stato)}:${String(aggiornamento.tentativi ?? "-")}`);
      operazioni = operazioni.map((corrente) =>
        corrente.chiaveIdempotenza === chiave
          ? { ...corrente, ...aggiornamento }
          : corrente,
      );
    },
    rimuovi: async (chiave) => {
      eventi.push("rimuovi");
      operazioni = operazioni.filter(
        (corrente) => corrente.chiaveIdempotenza !== chiave,
      );
    },
  };
  return { store, leggi: () => operazioni, eventi };
}

// **Validates: Requirements 12.3, 12.6, 12.7**
describe("reinvio della Coda_Locale", () => {
  it("usa gli intervalli crescenti, applica la conferma server e poi rimuove l'operazione", async () => {
    const scenario = creaStoreMemoria(operazione());
    const intervalli: number[] = [];

    await reinviaCodaLocale({
      store: scenario.store,
      attendi: async (millisecondi) => {
        intervalli.push(millisecondi);
      },
      invia: vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue({
        stato: { budgetResiduo: 475 },
      }),
      onConfermata: async () => {
        scenario.eventi.push("confermata");
      },
    });

    expect(intervalli).toEqual(INTERVALLI_REINVIO_MS.slice(0, 2));
    expect(scenario.leggi()).toEqual([]);
    expect(scenario.eventi.at(-2)).toBe("confermata");
    expect(scenario.eventi.at(-1)).toBe("rimuovi");
  });

  it("dopo il quinto errore mantiene e marca l'operazione come non inviata", async () => {
    const scenario = creaStoreMemoria(operazione());
    const onNonInviata = vi.fn();
    const invia = vi.fn().mockRejectedValue(new Error("server non raggiungibile"));

    await reinviaCodaLocale({
      store: scenario.store,
      attendi: async () => undefined,
      invia,
      onNonInviata,
    });

    expect(invia).toHaveBeenCalledTimes(MASSIMO_TENTATIVI_REINVIO);
    expect(scenario.leggi()).toEqual([
      expect.objectContaining({
        stato: "non_inviata",
        tentativi: MASSIMO_TENTATIVI_REINVIO,
      }),
    ]);
    expect(onNonInviata).toHaveBeenCalledOnce();
    expect(MESSAGGIO_OPERAZIONE_NON_INVIATA).toContain("5 tentativi");
  });

  it("marca il 409 come conflitto, conserva entrambe le versioni e interrompe i reinvii", async () => {
    const scenario = creaStoreMemoria(operazione());
    const versioneServer = {
      id: "voce-server",
      sessioneAstaId: SESSIONE,
      ordinale: 3,
      identificativoGiocatore: "player-1",
      nomeGiocatore: "Mario Rossi",
      ruolo: "A",
      squadra: "Roma",
      repartoAssegnato: "A",
      macroReparto: "ATT",
      prezzoAcquisto: 30,
      assegnatarioTipo: "avversario",
      avversarioId: "avversario-1",
      annullataIl: null,
      chiaveIdempotenza: "00000000-0000-4000-8000-000000000099",
      giocatoreAssenteDatiCorrenti: false,
    } as VoceRegistro;
    const erroreConflitto = new Error("conflitto");
    const invia = vi.fn().mockRejectedValue(erroreConflitto);
    const onConflitto = vi.fn();
    const onNonInviata = vi.fn();

    await reinviaCodaLocale({
      store: scenario.store,
      attendi: async () => undefined,
      invia,
      estraiConflitto: (errore) =>
        errore === erroreConflitto ? { versioneServer } : null,
      onConflitto,
      onNonInviata,
    });

    expect(invia).toHaveBeenCalledOnce();
    expect(scenario.leggi()).toEqual([
      expect.objectContaining({
        stato: "in_conflitto",
        tentativi: 1,
        conflitto: { versioneServer },
        dati: expect.objectContaining({ prezzoAcquisto: 25 }),
      }),
    ]);
    expect(scenario.eventi).not.toContain("rimuovi");
    expect(onConflitto).toHaveBeenCalledOnce();
    expect(onNonInviata).not.toHaveBeenCalled();
  });

  it("per ogni tentativo di successo possibile usa esattamente il prefisso del backoff e svuota la coda", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: MASSIMO_TENTATIVI_REINVIO }),
        async (tentativoSuccesso) => {
          const scenario = creaStoreMemoria(operazione());
          const intervalli: number[] = [];
          let tentativo = 0;

          await reinviaCodaLocale({
            store: scenario.store,
            attendi: async (millisecondi) => {
              intervalli.push(millisecondi);
            },
            invia: async () => {
              tentativo += 1;
              if (tentativo < tentativoSuccesso) throw new Error("temporaneo");
              return { confermata: true };
            },
          });

          expect(intervalli).toEqual(
            INTERVALLI_REINVIO_MS.slice(0, tentativoSuccesso),
          );
          expect(scenario.leggi()).toEqual([]);
        },
      ),
      { numRuns: 25, seed: 14_002 },
    );
  });
});
