import { MantineProvider } from "@mantine/core";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { tema } from "../../tema/tema";

import {
  DURATA_CONFERMA_ELIMINAZIONE_MS,
  ElencoSessioniAsta,
  etichettaTipoAsta,
  formattaDataCreazione,
  type VoceSessioneAstaClient,
} from "./elenco-sessioni";

const sessione: VoceSessioneAstaClient = {
  id: "00000000-0000-4000-8000-000000000001",
  nome: "Lega amici",
  creatoIl: "2026-01-02T10:00:00.000Z",
  aggiornatoIl: "2026-01-03T10:00:00.000Z",
  tipoAsta: "busta_chiusa",
  budgetResiduo: 437,
  numeroGiocatoriRosa: 3,
};

function renderizza(sessioni: readonly VoceSessioneAstaClient[]): string {
  return renderToStaticMarkup(
    <MantineProvider theme={tema}>
      <ElencoSessioniAsta
        onDuplica={vi.fn().mockResolvedValue(undefined)}
        onElimina={vi.fn().mockResolvedValue(true)}
        sessioni={sessioni}
      />
    </MantineProvider>,
  );
}

// **Validates: Requirements 2.3, 2.4, 2.7, 2.8, 2.9, 2.10, 3.13**
describe("ElencoSessioniAsta", () => {
  it("mostra lo stato vuoto con un'azione di creazione", () => {
    const markup = renderizza([]);

    expect(markup).toContain("Nessuna sessione d&#x27;asta");
    expect(markup).toContain("Crea la prima sessione");
    expect(markup).toContain('href="/sessioni/nuova"');
  });

  it("mostra in ogni scheda nome, creazione, tipo, budget e giocatori in rosa", () => {
    const markup = renderizza([sessione]);

    expect(markup).toContain("Lega amici");
    expect(markup).toContain("Creata il 2 gen 2026, 11:00");
    expect(markup).toContain("Busta chiusa");
    expect(markup).toContain("437 crediti");
    expect(markup).toContain("Giocatori in rosa");
    expect(markup).toContain(">3<");
    expect(markup).toContain(`href="/sessioni/${sessione.id}"`);
    expect(markup).toContain("Azioni per Lega amici");
  });

  it("usa etichette documentali leggibili e limita la conferma a 120 secondi", () => {
    expect(etichettaTipoAsta("asta_live_ordine_listone")).toBe(
      "Live in ordine di listone",
    );
    expect(formattaDataCreazione(sessione.creatoIl)).toBe(
      "2 gen 2026, 11:00",
    );
    expect(DURATA_CONFERMA_ELIMINAZIONE_MS).toBe(120_000);
  });
});
