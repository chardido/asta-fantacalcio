import { MantineProvider } from "@mantine/core";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { IndiceRicercaSnapshot } from "../../server/snapshot/servizio-consultazione-snapshot";
import { tema } from "../../tema/tema";
import {
  SchermataListaObiettivi,
  creaGiocatoriObiettivo,
  type VoceObiettivoClient,
} from "./lista-obiettivi";

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
      ruoli: ["C", "T"],
      quotazione: 12,
    },
  ],
};

const voci: readonly VoceObiettivoClient[] = [
  {
    id: "obiettivo-1",
    identificativoGiocatore: "player-1",
    nomeGiocatore: "Mario Rossi",
    reparto: "A",
    prezzoMassimoPersonale: 45,
    priorita: 1,
    nonRaggiungibile: false,
  },
  {
    id: "obiettivo-2",
    identificativoGiocatore: "player-2",
    nomeGiocatore: "Luca Bianchi",
    reparto: "C",
    prezzoMassimoPersonale: null,
    priorita: 99,
    nonRaggiungibile: true,
  },
];

function renderizza(
  proprieta: Partial<Parameters<typeof SchermataListaObiettivi>[0]> = {},
): string {
  return renderToStaticMarkup(
    <MantineProvider theme={tema}>
      <SchermataListaObiettivi
        conteggiPerReparto={{ P: 0, D: 0, C: 0, A: 1 }}
        creditiIniziali={500}
        giocatori={creaGiocatoriObiettivo(indice, ["player-2"])}
        onAggiornaPrezzo={vi.fn().mockResolvedValue(true)}
        onAggiornaPriorita={vi.fn().mockResolvedValue(true)}
        onAggiungi={vi.fn().mockResolvedValue(true)}
        onCambiaOrdinamento={vi.fn()}
        ordinamento="priorita"
        sessioneAstaId="00000000-0000-4000-8000-000000000001"
        voci={voci}
        {...proprieta}
      />
    </MantineProvider>,
  );
}

// **Validates: Requirements 11.1, 11.7**
describe("creaGiocatoriObiettivo", () => {
  it("mantiene anche i giocatori non disponibili e li contrassegna", () => {
    expect(creaGiocatoriObiettivo(indice, ["player-2"])).toEqual([
      expect.objectContaining({ identificativo: "player-1", disponibile: true }),
      expect.objectContaining({
        identificativo: "player-2",
        disponibile: false,
        ruoli: ["C", "T"],
      }),
    ]);
  });
});

// **Validates: Requirements 11.1-11.4, 11.7-11.9**
describe("SchermataListaObiettivi", () => {
  it("mostra inserimento vincolato, ordinamento, valori personali e non raggiungibilità", () => {
    const markup = renderizza();

    expect(markup).toContain("Lista obiettivi");
    expect(markup).toContain("Aggiungi obiettivo");
    expect(markup).toContain("2/200");
    expect(markup).toContain("Facoltativo, da 1 a 500");
    expect(markup).toContain("Da 1 (più alta) a 99 (più bassa)");
    expect(markup).toContain("Priorità");
    expect(markup).toContain("Reparto");
    expect(markup).toContain("Mario Rossi");
    expect(markup).toContain("Luca Bianchi");
    expect(markup).toContain("Non raggiungibile");
    expect(markup).toContain("A: 1");
    expect(markup).toContain("C: 0");
    expect(markup).toContain("Non assegnato");
    expect(markup).toContain("Salva prezzo massimo personale di Mario Rossi");
    expect(markup).toContain("Salva priorità di Luca Bianchi");
    expect(markup).toContain(
      'href="/sessioni/00000000-0000-4000-8000-000000000001"',
    );
  });

  it("mostra i motivi di rifiuto senza rimuovere le voci correnti", () => {
    const markup = renderizza({
      erroreAggiunta: "Il giocatore è già presente nella lista obiettivi.",
      erroreAggiornamento:
        "Il prezzo massimo personale deve essere un intero compreso tra 1 e 500.",
    });

    expect(markup).toContain(
      "Il giocatore è già presente nella lista obiettivi.",
    );
    expect(markup).toContain(
      "Il prezzo massimo personale deve essere un intero compreso tra 1 e 500.",
    );
    expect(markup).toContain("Mario Rossi");
    expect(markup).toContain("Luca Bianchi");
  });

  it("segnala il limite di 200 voci e disabilita nuovi inserimenti", () => {
    const duecentoVoci = Array.from({ length: 200 }, (_, indiceVoce) => ({
      ...voci[0]!,
      id: `obiettivo-${indiceVoce}`,
      identificativoGiocatore: `player-${indiceVoce}`,
      nomeGiocatore: `Giocatore ${indiceVoce}`,
    }));
    const markup = renderizza({ voci: duecentoVoci });

    expect(markup).toContain("200/200");
    expect(markup).toContain(
      "La lista ha raggiunto il limite di 200 obiettivi.",
    );
  });
});
