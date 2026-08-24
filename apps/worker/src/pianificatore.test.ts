import type { ScheduledTask } from "node-cron";
import { describe, expect, it, vi } from "vitest";

import {
  ESPRESSIONE_CRON_INGESTIONE,
  FUSO_ORARIO_INGESTIONE,
  avviaPianificatoreIngestione,
} from "./pianificatore.js";

describe("avviaPianificatoreIngestione", () => {
  it("controlla subito e pianifica ogni giorno alle 05:00 Europe/Rome", async () => {
    const eseguiSeNecessario = vi.fn(async () => ({
      stato: "non_necessario" as const,
    }));
    let operazionePianificata: (() => void | Promise<void>) | undefined;
    const attivita = {} as ScheduledTask;
    const pianifica = vi.fn((espressione, operazione, opzioni) => {
      expect(espressione).toBe(ESPRESSIONE_CRON_INGESTIONE);
      expect(opzioni).toEqual({
        timezone: FUSO_ORARIO_INGESTIONE,
        noOverlap: true,
        name: "ingestione-giornaliera",
      });
      operazionePianificata = operazione;
      return attivita;
    });

    const pianificatore = avviaPianificatoreIngestione(
      { eseguiSeNecessario },
      vi.fn(),
      pianifica,
    );

    await expect(pianificatore.controlloIniziale).resolves.toEqual({
      stato: "non_necessario",
    });
    expect(pianificatore.attivita).toBe(attivita);
    expect(eseguiSeNecessario).toHaveBeenCalledOnce();

    await operazionePianificata?.();
    expect(eseguiSeNecessario).toHaveBeenCalledTimes(2);
  });
});
