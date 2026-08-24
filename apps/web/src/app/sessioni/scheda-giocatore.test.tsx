import {
  PESI_VALUTAZIONE_PREDEFINITI,
  type ConfigurazioneAsta,
} from "@asta/contracts";
import { MantineProvider } from "@mantine/core";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { SchedaGiocatoreSnapshot } from "../../server/snapshot/servizio-consultazione-snapshot";
import { tema } from "../../tema/tema";
import {
  ContenutoSchedaGiocatore,
  statisticheTattichePresentate,
  type StatoSchedaGiocatore,
} from "./scheda-giocatore";

const configurazione: ConfigurazioneAsta = {
  nome: "Asta test",
  tipoAsta: "chiamata",
  modalitaGioco: "classic",
  numeroPartecipanti: 8,
  creditiIniziali: 500,
  modificatoreDifesa: false,
  composizioneRosa: { P: 3, D: 8, C: 8, A: 6 },
  quoteReparto: { POR: 8, DIF: 20, CEN: 32, ATT: 40 },
  pesiValutazione: { ...PESI_VALUTAZIONE_PREDEFINITI },
};

const stato: StatoSchedaGiocatore = {
  budgetResiduo: 400,
  budgetRepartoResiduo: { POR: 40, DIF: 100, CEN: 120, ATT: 140 },
  slotResidui: { P: 3, D: 8, C: 8, A: 6 },
  slotResiduiTotali: 25,
  riservaMinima: 24,
  rosa: [],
  identificativiNonDisponibili: [],
};

const scheda: SchedaGiocatoreSnapshot = {
  snapshotId: "snapshot-1",
  hashContenuto: "hash",
  giocatore: {
    id: "player-1",
    nome: "Mario Rossi",
    squadra: "Roma",
    ruoloClassic: "A",
    ruoliMantra: ["A", "Pc"],
    quotazione: 30,
    statisticheFantacalcio: {
      mediaVotoMilli: { valore: 6250, stagione: "2025-26" },
      fantamediaMilli: { valore: 7300, stagione: "2025-26" },
      presenze: { valore: 28, stagione: "2025-26" },
      gol: { valore: 12, stagione: "2025-26" },
      assist: { valore: 4, stagione: "2025-26" },
      ammonizioni: { valore: 3, stagione: "2025-26" },
      espulsioni: { valore: null, stagione: "2025-26" },
      rigoriParati: { valore: null, stagione: "2025-26" },
      rigoriSbagliati: { valore: 1, stagione: "2025-26" },
      autogol: { valore: 0, stagione: "2025-26" },
    },
    statisticheTattiche: {
      macroReparto: "ATT",
      gol: { valore: 12, stagione: "2025-26" },
      tiri: { valore: 70, stagione: "2025-26" },
      tiriNelloSpecchio: { valore: 35, stagione: "2025-26" },
      golAttesiMilli: { valore: null, stagione: "2025-26" },
    },
  },
  prezzoMassimoPersonale: null,
  inListaObiettivi: false,
  assegnazione: null,
};

function renderizza(
  dati: SchedaGiocatoreSnapshot = scheda,
  cfg: ConfigurazioneAsta = configurazione,
): string {
  return renderToStaticMarkup(
    <MantineProvider theme={tema}>
      <ContenutoSchedaGiocatore
        avvisiInformativiAttivi
        configurazione={cfg}
        onPrezzoChange={vi.fn()}
        onRegistra={vi.fn()}
        onRepartoChange={vi.fn()}
        prezzoAcquisto={1}
        repartoSelezionato={cfg.modalitaGioco === "classic" ? "A" : (dati.giocatore.ruoliMantra[0] ?? "Por")}
        scheda={dati}
        stato={stato}
      />
    </MantineProvider>,
  );
}

// **Validates: Requirements 5.8, 5.10-5.14, 5.16, 5.17**
describe("statistiche della scheda giocatore", () => {
  it("presenta soltanto le statistiche tattiche del macro-reparto e conserva i null", () => {
    expect(statisticheTattichePresentate(scheda.giocatore.statisticheTattiche).map((voce) => voce.etichetta)).toEqual([
      "Gol",
      "Tiri",
      "Tiri nello specchio",
      "Gol attesi",
    ]);

    const markup = renderizza();
    expect(markup).toContain("Statistiche fantacalcio");
    expect(markup).toContain("Statistiche tattiche");
    expect(markup).toContain("Dato non disponibile");
    expect(markup).toContain("Stagione 2025-26");
    expect(markup).not.toContain("Parate</");
    expect(markup).not.toContain("Precisione passaggi");
  });
});

// **Validates: Requirements 5.9, 6.5, 6.13, 9.9, 9.12, 13.5**
describe("valutazione, convenienza e avvisi", () => {
  it("mostra prezzo, indice, cinque fattori e dettagli di riconciliazione", () => {
    const markup = renderizza();

    expect(markup).toContain("Prezzo massimo consigliato");
    expect(markup).toContain("Indice di convenienza");
    expect(markup).toContain("Spiegazione della valutazione");
    expect(markup).toContain("Budget residuo");
    expect(markup).toContain("Budget reparto residuo");
    expect(markup).toContain("Slot residui");
    expect(markup).toContain("Statistiche fantacalcio");
    expect(markup).toContain("Audacia:");
    expect(markup).toContain("Rettifica arrotondamento:");
    expect(markup).toContain("Vincolo attivo:");
    expect(markup).toContain("Avvisi");
  });
});

// **Validates: Requirements 8.12, 11.5**
describe("disponibilità e lista obiettivi", () => {
  it("per un giocatore assegnato mostra valori annotati e omette consiglio e registrazione", () => {
    const markup = renderizza({
      ...scheda,
      inListaObiettivi: true,
      prezzoMassimoPersonale: null,
      assegnazione: { tipo: "avversario", nome: "Luca", prezzoAcquisto: 35 },
    });

    expect(markup).toContain("Prezzo massimo personale: Valore non assegnato");
    expect(markup).toContain("Assegnatario: Luca. Prezzo: 35 crediti");
    expect(markup).toContain("Prezzo massimo consigliato");
    expect(markup).toContain("Non disponibile");
    expect(markup).not.toContain("Spiegazione della valutazione");
    expect(markup).not.toContain("Registra acquisto");
  });
});

// **Validates: Requirements 5.15, 7.1, 7.15**
describe("modificatore e imputazione Mantra", () => {
  it("mostra rilevanza del modificatore e il selettore di ruolo Mantra", () => {
    const mantra: ConfigurazioneAsta = {
      ...configurazione,
      modalitaGioco: "mantra",
      modificatoreDifesa: true,
      composizioneRosa: {
        Por: 3, Dc: 2, Dd: 2, Ds: 2, E: 2, M: 2, C: 2, W: 2, T: 2, A: 2, Pc: 4,
      },
    };
    const difensore: SchedaGiocatoreSnapshot = {
      ...scheda,
      giocatore: {
        ...scheda.giocatore,
        ruoloClassic: "D",
        ruoliMantra: ["Dc", "Dd"],
        statisticheTattiche: {
          macroReparto: "DIF",
          cleanSheetSquadra: { valore: 12, stagione: "2025-26" },
          duelliDifensiviVinti: { valore: 40, stagione: "2025-26" },
          contrasti: { valore: 25, stagione: "2025-26" },
          precisionePassaggiMilli: { valore: 850, stagione: "2025-26" },
        },
      },
    };

    const markup = renderizza(difensore, mantra);
    expect(markup).toContain("Rilevante per il modificatore di difesa");
    expect(markup).toContain("Ruolo di imputazione");
    expect(markup).toContain("Registra acquisto");
  });
});
