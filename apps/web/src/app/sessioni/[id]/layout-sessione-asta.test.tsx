import {
  MACRO_REPARTO_PER_RUOLO_MANTRA,
  PESI_VALUTAZIONE_PREDEFINITI,
  type ConfigurazioneAsta,
} from "@asta/contracts";
import { MantineProvider } from "@mantine/core";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { tema } from "../../../tema/tema";

import {
  creaStatiRepartoBarra,
  VistaLayoutSessioneAsta,
  type StatoSessioneBarraClient,
} from "./layout-sessione-asta";

const configurazioneClassic: ConfigurazioneAsta = {
  nome: "Asta principale",
  tipoAsta: "chiamata",
  modalitaGioco: "classic",
  numeroPartecipanti: 8,
  creditiIniziali: 500,
  modificatoreDifesa: false,
  composizioneRosa: { P: 3, D: 8, C: 8, A: 6 },
  quoteReparto: { POR: 8, DIF: 20, CEN: 32, ATT: 40 },
  pesiValutazione: { ...PESI_VALUTAZIONE_PREDEFINITI },
};

const statoClassic: StatoSessioneBarraClient = {
  budgetResiduo: 350,
  budgetRepartoResiduo: { POR: 20, DIF: 80, CEN: 120, ATT: 130 },
  slotResidui: { P: 2, D: 7, C: 8, A: 5 },
  slotResiduiTotali: 22,
};

// **Validates: Requirements 10.1, 7.2**
describe("layout persistente della sessione d'asta", () => {
  it("associa a ogni reparto Classic budget, slot residui e slot totali", () => {
    expect(creaStatiRepartoBarra(configurazioneClassic, statoClassic)).toEqual([
      { reparto: "P", budgetResiduo: 20, slotResidui: 2, slotTotali: 3 },
      { reparto: "D", budgetResiduo: 80, slotResidui: 7, slotTotali: 8 },
      { reparto: "C", budgetResiduo: 120, slotResidui: 8, slotTotali: 8 },
      { reparto: "A", budgetResiduo: 130, slotResidui: 5, slotTotali: 6 },
    ]);
  });

  it("usa il budget del macro-reparto per tutti i ruoli Mantra", () => {
    const configurazioneMantra: ConfigurazioneAsta = {
      ...configurazioneClassic,
      modalitaGioco: "mantra",
      composizioneRosa: {
        Por: 2,
        Dc: 2,
        Dd: 1,
        Ds: 1,
        E: 1,
        M: 2,
        C: 2,
        W: 1,
        T: 1,
        A: 1,
        Pc: 2,
      },
    };
    const slotResidui = Object.fromEntries(
      Object.keys(MACRO_REPARTO_PER_RUOLO_MANTRA).map((reparto) => [reparto, 1]),
    );

    const reparti = creaStatiRepartoBarra(configurazioneMantra, {
      ...statoClassic,
      slotResidui,
      slotResiduiTotali: 11,
    });

    expect(reparti).toHaveLength(11);
    expect(reparti.find(({ reparto }) => reparto === "Dc")?.budgetResiduo).toBe(80);
    expect(reparti.find(({ reparto }) => reparto === "M")?.budgetResiduo).toBe(120);
    expect(reparti.find(({ reparto }) => reparto === "Pc")?.budgetResiduo).toBe(130);
  });

  it("mantiene la barra nel contenitore AppShell insieme al contenuto della vista", () => {
    const markup = renderToStaticMarkup(
      <MantineProvider theme={tema}>
        <VistaLayoutSessioneAsta
          configurazione={configurazioneClassic}
          operazioniInAttesa={3}
          stato={statoClassic}
        >
          <main>Contenuto sessione</main>
        </VistaLayoutSessioneAsta>
      </MantineProvider>,
    );

    expect(markup).toContain("Stato corrente dell&#x27;asta");
    expect(markup).toContain("350 crediti");
    expect(markup).toContain("Slot residui totali");
    expect(markup).toContain("Coda offline");
    expect(markup).toContain("3 operazioni in attesa di invio");
    expect(markup).toContain("Contenuto sessione");
  });
});
