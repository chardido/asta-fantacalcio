import type { Avviso } from "@asta/domain";
import { AppShell, MantineProvider } from "@mantine/core";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { tema } from "../tema/tema";
import { BarraStatoAsta } from "./barra-stato-asta";
import {
  CampoRicercaGiocatore,
  LUNGHEZZA_MASSIMA_RICERCA,
  limitaValoreRicerca,
  preparaRicercaGiocatori,
  type GiocatoreRicerca,
} from "./campo-ricerca-giocatore";
import {
  coloreConvenienza,
  IndicatoreConvenienza,
  normalizzaConvenienza,
} from "./indicatore-convenienza";
import { formattaMessaggioAvviso, ListaAvvisi } from "./lista-avvisi";
import {
  SelettoreQuoteReparto,
  sommaQuoteReparto,
} from "./selettore-quote-reparto";

const GIOCATORI: readonly GiocatoreRicerca[] = [
  {
    identificativo: "1",
    nome: "João Mario",
    nomeRicerca: "joao mario",
    squadra: "Juventus",
    ruolo: "C",
  },
  {
    identificativo: "2",
    nome: "Dusan Vlahovic",
    nomeRicerca: "dusan vlahovic",
    squadra: "Juventus",
    ruolo: "A",
  },
];

const AVVISO: Avviso = {
  criterio: 4,
  livello: "attenzione",
  valori: { differenzaCrediti: 3 },
  chiaveMessaggio: "avvisi.quotazioneOltrePrezzoConsigliato",
};

function renderizza(elemento: React.ReactNode): string {
  return renderToStaticMarkup(
    <MantineProvider theme={tema}>{elemento}</MantineProvider>,
  );
}

describe("CampoRicercaGiocatore", () => {
  it("normalizza accenti, applica la soglia e limita i risultati", () => {
    expect(preparaRicercaGiocatori(GIOCATORI, "jO")).toMatchObject({
      tipo: "risultati",
      giocatori: [{ identificativo: "1" }],
    });
    expect(preparaRicercaGiocatori(GIOCATORI, "j")).toEqual({
      tipo: "soglia",
      giocatori: [],
    });

    const moltiGiocatori = Array.from({ length: 25 }, (_, indice) => ({
      identificativo: String(indice),
      nome: `Mario ${indice}`,
      nomeRicerca: `mario ${indice}`,
      squadra: "Roma",
      ruolo: "C" as const,
    }));
    expect(preparaRicercaGiocatori(moltiGiocatori, "mario").giocatori).toHaveLength(20);
  });

  it("propone al massimo cinque nomi entro distanza di modifica due", () => {
    const esito = preparaRicercaGiocatori(GIOCATORI, "dusan vlahovc");
    expect(esito.tipo).toBe("suggerimenti");
    expect(esito.giocatori.map((giocatore) => giocatore.identificativo)).toEqual(["2"]);
  });

  it("ignora ogni carattere oltre il cinquantesimo e rende il messaggio di soglia", () => {
    expect(limitaValoreRicerca("x".repeat(70))).toHaveLength(
      LUNGHEZZA_MASSIMA_RICERCA,
    );
    const markup = renderizza(
      <CampoRicercaGiocatore
        giocatori={GIOCATORI}
        onChange={vi.fn()}
        valore="a"
      />,
    );
    expect(markup).toContain("Inserisci almeno 2 caratteri");
    expect(markup).toContain("maxLength=\"50\"");
  });
});

describe("componenti di stato e valutazione", () => {
  it("rende budget e dettagli dei reparti nella barra persistente", () => {
    const markup = renderizza(
      <AppShell header={{ height: 120 }}>
        <BarraStatoAsta
          budgetResiduo={350}
          reparti={[
            { reparto: "P", budgetResiduo: 20, slotResidui: 2, slotTotali: 3 },
          ]}
          slotResiduiTotali={24}
        />
      </AppShell>,
    );
    expect(markup).toContain("350 crediti");
    expect(markup).toContain("20 crediti");
    expect(markup).toContain("2 slot residui");
    expect(markup).toContain("Slot residui totali");
    expect(markup).toContain("Stato corrente dell&#x27;asta");
  });

  it("normalizza l'indice fra 0 e 100 e assegna soglie cromatiche", () => {
    expect(normalizzaConvenienza(-4)).toBe(0);
    expect(normalizzaConvenienza(101)).toBe(100);
    expect(normalizzaConvenienza(Number.NaN)).toBe(0);
    expect(coloreConvenienza(39)).toBe("red");
    expect(coloreConvenienza(40)).toBe("yellow");
    expect(coloreConvenienza(70)).toBe("green");

    const markup = renderizza(<IndicatoreConvenienza valore={84} />);
    expect(markup).toContain("Indice di convenienza: 84%");
    expect(markup).toContain("84%");
  });
});

describe("ListaAvvisi", () => {
  it("traduce la chiave di dominio e conserva l'ordine ricevuto", () => {
    expect(formattaMessaggioAvviso(AVVISO)).toBe(
      "La quotazione supera il prezzo consigliato di 3 crediti.",
    );
    const secondo: Avviso = {
      criterio: 7,
      livello: "informativo",
      valori: { giocatoriStessaSquadra: 3, squadra: "Roma" },
      chiaveMessaggio: "avvisi.concentrazioneSquadra",
    };
    const markup = renderizza(<ListaAvvisi avvisi={[AVVISO, secondo]} />);
    expect(markup.indexOf("quotazione supera")).toBeLessThan(
      markup.indexOf("Hai già 3 giocatori"),
    );
  });

  it("mostra uno stato vuoto senza errore", () => {
    expect(renderizza(<ListaAvvisi avvisi={[]} />)).toContain("Nessun avviso");
  });
});

describe("SelettoreQuoteReparto", () => {
  it("calcola e presenta la somma corrente verso cento", () => {
    const quote = { POR: 8, DIF: 20, CEN: 32, ATT: 40 } as const;
    expect(sommaQuoteReparto(quote)).toBe(100);
    const markup = renderizza(
      <SelettoreQuoteReparto onChange={vi.fn()} quote={quote} />,
    );
    expect(markup).toContain("Somma quote: 100%");
    expect(markup).toContain("Portieri");
    expect(markup).toContain("Attaccanti");
  });

  it("indica esplicitamente una somma non valida", () => {
    const markup = renderizza(
      <SelettoreQuoteReparto
        onChange={vi.fn()}
        quote={{ POR: 8, DIF: 20, CEN: 30, ATT: 40 }}
      />,
    );
    expect(markup).toContain("Somma quote: 98%");
    expect(markup).toContain("deve essere esattamente 100%");
  });
});
