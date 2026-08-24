import {
  PESI_VALUTAZIONE_PREDEFINITI,
  type ConfigurazioneAsta,
} from "@asta/contracts";
import { MantineProvider } from "@mantine/core";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type {
  AnnotazioneAcquistoAvversario,
  RiepilogoAvversario,
} from "../../server/avversari/servizio-avversari";
import type { IndiceRicercaSnapshot } from "../../server/snapshot/servizio-consultazione-snapshot";
import { tema } from "../../tema/tema";
import {
  SchermataAvversariAsta,
  creaGiocatoriAnnotabili,
} from "./avversari-asta";

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

const indice: IndiceRicercaSnapshot = {
  snapshotId: "snapshot-1",
  hashContenuto: "hash",
  giocatori: [
    {
      id: "player-1",
      nome: "Mario Rossi",
      nomeRicerca: "mario rossi",
      squadra: "Roma",
      ruoli: ["A"],
      quotazione: 20,
    },
    {
      id: "player-2",
      nome: "Luca Bianchi",
      nomeRicerca: "luca bianchi",
      squadra: "Milan",
      ruoli: ["C"],
      quotazione: 12,
    },
  ],
};

const avversari: readonly RiepilogoAvversario[] = [
  {
    id: "avversario-1",
    nome: "Luca",
    creditiSpesi: 40,
    creditiResiduiStimati: 460,
    giocatoriPerReparto: { P: 1, D: 0, C: 0, A: 0 },
  },
];

const annotazioni: readonly AnnotazioneAcquistoAvversario[] = [
  {
    id: "voce-1",
    ordinale: 1,
    identificativoGiocatore: "player-1",
    nomeGiocatore: "Mario Rossi",
    squadra: "Roma",
    repartoAssegnato: "A",
    avversarioId: "avversario-1",
    avversarioNome: "Luca",
    prezzoAcquisto: 40,
  },
  {
    id: "voce-2",
    ordinale: 2,
    identificativoGiocatore: "player-3",
    nomeGiocatore: "Giocatore anonimo",
    squadra: "Torino",
    repartoAssegnato: "D",
    avversarioId: null,
    avversarioNome: null,
    prezzoAcquisto: null,
  },
];

// **Validates: Requirements 8.7, 8.13**
describe("creaGiocatoriAnnotabili", () => {
  it("propone soltanto i giocatori ancora disponibili", () => {
    expect(creaGiocatoriAnnotabili(indice, ["player-1"])).toEqual([
      expect.objectContaining({
        identificativo: "player-2",
        nome: "Luca Bianchi",
        ruoli: ["C"],
      }),
    ]);
  });
});

// **Validates: Requirements 8.1-8.6, 8.13, 8.14**
describe("SchermataAvversariAsta", () => {
  it("mostra definizione nomi, campi facoltativi, riepiloghi e annullamento", () => {
    const markup = renderToStaticMarkup(
      <MantineProvider theme={tema}>
        <SchermataAvversariAsta
          annotazioni={annotazioni}
          avversari={avversari}
          configurazione={configurazione}
          giocatori={creaGiocatoriAnnotabili(indice, [])}
          onAnnota={vi.fn().mockResolvedValue(true)}
          onAnnulla={vi.fn().mockResolvedValue(true)}
          onCreaAvversario={vi.fn().mockResolvedValue(true)}
          sessioneAstaId="00000000-0000-4000-8000-000000000001"
        />
      </MantineProvider>,
    );

    expect(markup).toContain("Definisci avversario");
    expect(markup).toContain("Da 1 a 30 caratteri");
    expect(markup).toContain("Annota acquisto altrui");
    expect(markup).toContain("Facoltativo");
    expect(markup).toContain("Crediti spesi");
    expect(markup).toContain("Crediti residui stimati");
    expect(markup).toContain("P: 1");
    expect(markup).toContain("Mario Rossi");
    expect(markup).toContain("40 crediti");
    expect(markup).toContain("Giocatore anonimo");
    expect(markup).toContain("Non annotato");
    expect(markup).toContain("Annulla acquisto di Mario Rossi");
    expect(markup).toContain(
      'href="/sessioni/00000000-0000-4000-8000-000000000001"',
    );
  });

  it("mantiene visibile il messaggio di rifiuto e i dati correnti", () => {
    const markup = renderToStaticMarkup(
      <MantineProvider theme={tema}>
        <SchermataAvversariAsta
          annotazioni={annotazioni}
          avversari={avversari}
          configurazione={configurazione}
          erroreAnnotazione="Il prezzo deve essere compreso tra 1 e 460."
          erroreCreazione="Esiste già un avversario con questo nome."
          giocatori={creaGiocatoriAnnotabili(indice, [])}
          onAnnota={vi.fn().mockResolvedValue(false)}
          onAnnulla={vi.fn().mockResolvedValue(false)}
          onCreaAvversario={vi.fn().mockResolvedValue(false)}
          sessioneAstaId="00000000-0000-4000-8000-000000000001"
        />
      </MantineProvider>,
    );

    expect(markup).toContain("Esiste già un avversario con questo nome.");
    expect(markup).toContain("Il prezzo deve essere compreso tra 1 e 460.");
    expect(markup).toContain("Luca");
  });
});
