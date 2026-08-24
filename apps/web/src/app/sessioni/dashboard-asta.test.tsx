import {
  PESI_VALUTAZIONE_PREDEFINITI,
  type ConfigurazioneAsta,
  type StatFantacalcio,
} from "@asta/contracts";
import { MantineProvider } from "@mantine/core";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { tema } from "../../tema/tema";
import type { VoceDashboardSnapshot } from "../../server/snapshot/servizio-consultazione-snapshot";
import {
  SchermataDashboardAsta,
  creaIndiceRicercaGiocatori,
  creaSezioniDashboard,
  type FiltriDashboard,
  type StatoDashboardAsta,
} from "./dashboard-asta";

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

const statistiche: StatFantacalcio = {
  mediaVotoMilli: 6200,
  fantamediaMilli: 7100,
  presenze: 30,
  gol: 10,
  assist: 5,
  ammonizioni: 2,
  espulsioni: 0,
  rigoriParati: 0,
  rigoriSbagliati: 0,
  autogol: 0,
  stagione: "2025-26",
};

const stato: StatoDashboardAsta = {
  budgetResiduo: 400,
  budgetRepartoResiduo: { POR: 40, DIF: 100, CEN: 120, ATT: 140 },
  slotResidui: { P: 3, D: 8, C: 8, A: 6 },
  slotResiduiTotali: 25,
  riservaMinima: 24,
  rosa: [],
  identificativiNonDisponibili: ["player-01"],
};

const filtri: FiltriDashboard = {
  reparto: "A",
  squadre: [],
  quotazione: [1, 999],
  includiNonDisponibili: false,
};

function giocatore(numero: number, modifiche: Partial<VoceDashboardSnapshot> = {}): VoceDashboardSnapshot {
  const suffisso = String(numero).padStart(2, "0");
  return {
    id: `player-${suffisso}`,
    nome: `Giocatore ${suffisso}`,
    squadra: numero % 2 === 0 ? "Roma" : "Milan",
    ruoli: ["A"],
    quotazione: 20,
    statFantacalcio: statistiche,
    ...modifiche,
  };
}

// **Validates: Requirements 13.1, 13.2, 13.3, 13.6, 13.7, 13.9, 13.10, 13.14, 8.10**
describe("creaSezioniDashboard", () => {
  it("esclude per default i non disponibili, ordina per indice e nome e tronca a dieci", () => {
    const giocatori = Array.from({ length: 12 }, (_, indice) => giocatore(12 - indice));
    const [sezione] = creaSezioniDashboard(configurazione, stato, giocatori, filtri);

    expect(sezione?.voci).toHaveLength(10);
    expect(sezione?.voci.some((voce) => voce.id === "player-01")).toBe(false);
    expect(sezione?.voci.map((voce) => voce.nome)).toEqual(
      Array.from({ length: 10 }, (_, indice) => `Giocatore ${String(indice + 2).padStart(2, "0")}`),
    );
    for (let indice = 1; indice < (sezione?.voci.length ?? 0); indice += 1) {
      expect(sezione?.voci[indice - 1]?.indice).toBeGreaterThanOrEqual(
        sezione?.voci[indice]?.indice ?? 0,
      );
    }
  });

  it("applica reparto, squadra e quotazione e contrassegna i non disponibili inclusi", () => {
    const giocatori = [
      giocatore(1, { squadra: "Roma", quotazione: 30 }),
      giocatore(2, { squadra: "Roma", quotazione: 50 }),
      giocatore(3, { squadra: "Milan", quotazione: 30 }),
    ];
    const [sezione] = creaSezioniDashboard(configurazione, stato, giocatori, {
      reparto: "A",
      squadre: ["Roma"],
      quotazione: [25, 40],
      includiNonDisponibili: true,
    });

    expect(sezione?.voci).toEqual([
      expect.objectContaining({
        id: "player-01",
        disponibile: false,
        prezzoMassimoConsigliato: null,
        indice: null,
      }),
    ]);
  });

  it("marca completo il reparto senza slot e assegna indice zero", () => {
    const statoCompleto = {
      ...stato,
      slotResidui: { ...stato.slotResidui, A: 0 },
      identificativiNonDisponibili: [],
    };
    const [sezione] = creaSezioniDashboard(
      configurazione,
      statoCompleto,
      [giocatore(2)],
      filtri,
    );

    expect(sezione).toMatchObject({ completa: true });
    expect(sezione?.voci[0]).toMatchObject({
      prezzoMassimoConsigliato: 0,
      indice: 0,
    });
  });
});

// **Validates: Requirements 5.1, 8.10, 8.11**
describe("creaIndiceRicercaGiocatori", () => {
  const indice = {
    snapshotId: "snapshot-1",
    hashContenuto: "hash",
    giocatori: [
      {
        id: "player-01",
        nome: "João Mario",
        nomeRicerca: "joao mario",
        squadra: "Roma",
        ruoli: ["C", "W"],
        quotazione: 20,
      },
      {
        id: "player-02",
        nome: "Dusan Vlahovic",
        nomeRicerca: "dusan vlahovic",
        squadra: "Juventus",
        ruoli: ["A"],
        quotazione: 30,
      },
    ],
  } as const;

  it("esclude per default i giocatori annotati come non disponibili", () => {
    expect(creaIndiceRicercaGiocatori(indice, ["player-01"], false)).toEqual([
      expect.objectContaining({ identificativo: "player-02", disponibile: true }),
    ]);
  });

  it("include e contrassegna i non disponibili quando il filtro è attivo", () => {
    expect(creaIndiceRicercaGiocatori(indice, ["player-01"], true)).toEqual([
      expect.objectContaining({
        identificativo: "player-01",
        ruolo: "C/W",
        disponibile: false,
      }),
      expect.objectContaining({ identificativo: "player-02", disponibile: true }),
    ]);
  });
});

// **Validates: Requirements 13.1, 13.3, 13.8, 13.9, 13.10, 8.8**
describe("SchermataDashboardAsta", () => {
  it("mostra dati, filtri, freschezza e avvertenza sulla disponibilità", () => {
    const markup = renderToStaticMarkup(
      <MantineProvider theme={tema}>
        <SchermataDashboardAsta
          avvisiInformativiAttivi
          configurazione={configurazione}
          dati={{ snapshotId: "snapshot-1", hashContenuto: "hash", giocatori: [giocatore(2)] }}
          indiceRicerca={{
            snapshotId: "snapshot-1",
            hashContenuto: "hash",
            giocatori: [{
              id: "player-02",
              nome: "Giocatore 02",
              nomeRicerca: "giocatore 02",
              squadra: "Roma",
              ruoli: ["A"],
              quotazione: 20,
            }],
          }}
          freschezza={[{
            nomeSorgente: "api-football",
            ultimoSuccessoIl: "2026-08-01T05:00:00.000Z",
            ultimoTentativoIl: "2026-08-01T05:00:00.000Z",
            ultimoEsito: "successo",
          }]}
          sessioneAstaId="00000000-0000-4000-8000-000000000001"
          stato={stato}
        />
      </MantineProvider>,
    );

    expect(markup).toContain("Dashboard asta");
    expect(markup).toContain("Esporta / importa");
    expect(markup).toContain('href="/sessioni/00000000-0000-4000-8000-000000000001/trasferimento"');
    expect(markup).toContain("Obiettivi");
    expect(markup).toContain('href="/sessioni/00000000-0000-4000-8000-000000000001/obiettivi"');
    expect(markup).toContain("Visualizza rosa");
    expect(markup).toContain('href="/sessioni/00000000-0000-4000-8000-000000000001/rosa"');
    expect(markup).toContain("Ricerca giocatori");
    expect(markup).toContain("Cerca giocatore");
    expect(markup).toContain("Stato di freschezza dei dati");
    expect(markup).toContain("api-football");
    expect(markup).toContain("riflettono esclusivamente gli acquisti annotati");
    expect(markup).toContain("Includi giocatori non disponibili");
    expect(markup).toContain("Quotazione: 1–999");
    expect(markup).toContain("Giocatore 02");
    expect(markup).toContain("Indice di convenienza");
  });

  it("avvisa quando l'ultima acquisizione riuscita di una sorgente supera sette giorni", () => {
    const markup = renderToStaticMarkup(
      <MantineProvider theme={tema}>
        <SchermataDashboardAsta
          avvisiInformativiAttivi
          configurazione={configurazione}
          dati={null}
          indiceRicerca={null}
          freschezza={[{
            nomeSorgente: "api-football",
            ultimoSuccessoIl: "2020-01-01T05:00:00.000Z",
            ultimoTentativoIl: "2020-01-01T05:00:00.000Z",
            ultimoEsito: "successo",
          }]}
          sessioneAstaId="00000000-0000-4000-8000-000000000001"
          stato={stato}
        />
      </MantineProvider>,
    );

    expect(markup).toContain("Dati potenzialmente non aggiornati");
    expect(markup).toContain("api-football");
    expect(markup).toContain("L’ultima acquisizione riuscita risale al");
    expect(markup).toContain("I dati potrebbero non essere aggiornati");
  });

  it("in assenza di snapshot mostra freschezza e messaggio senza sezioni", () => {
    const markup = renderToStaticMarkup(
      <MantineProvider theme={tema}>
        <SchermataDashboardAsta
          avvisiInformativiAttivi
          configurazione={configurazione}
          dati={null}
          indiceRicerca={null}
          freschezza={[]}
          sessioneAstaId="00000000-0000-4000-8000-000000000001"
          stato={stato}
        />
      </MantineProvider>,
    );

    expect(markup).toContain("Dati dei giocatori non ancora disponibili");
    expect(markup).toContain("I dati dei giocatori non sono ancora disponibili");
    expect(markup).toContain("Stato di freschezza dei dati");
    expect(markup).toContain("disabled");
    expect(markup).not.toContain("Filtri dashboard");
  });
});
